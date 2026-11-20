// Runs one tool scan (RUN_CHECK, RUN_NMAP, RUN_ZAP): re-check scope, run the tool, store raw output,
// then insert results, turn them into PENDING tool findings and mark the scan DONE, all in one transaction.

import type { Prisma } from '@prisma/client';
import { scopeRequestsForScan, type ScanParams, type ScanResultInput } from '@tanaw/shared';
import { storageKeys } from '@tanaw/shared/node';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../config/prisma.js';
import { storage } from '../config/storage.js';
import { createScopeGuard, ScopeBlockedError, type ScopeGuard } from '../lib/scope.js';
import { createToolFindings } from '../lib/toolFindings.js';
import { runDnsLookup } from '../tools/dns.js';
import type { ToolOutput } from '../tools/http.js';
import { runHttpCheck } from '../tools/httpCheck.js';
import { runNmap } from '../tools/nmap.js';
import { runOpenApiImport } from '../tools/openapi.js';
import { runZap } from '../tools/zap.js';

export interface ToolDeps {
  httpCheck: typeof runHttpCheck;
  dns: typeof runDnsLookup;
  openapi: typeof runOpenApiImport;
  nmap: typeof runNmap;
  zap: typeof runZap;
}

const defaultDeps: ToolDeps = {
  httpCheck: runHttpCheck,
  dns: runDnsLookup,
  openapi: runOpenApiImport,
  nmap: runNmap,
  zap: runZap,
};

async function runTool(tool: string, params: ScanParams, scanId: string, guard: ScopeGuard, deps: ToolDeps): Promise<ToolOutput<ScanResultInput>> {
  switch (tool) {
    case 'HTTP_CHECK':
      return deps.httpCheck(params.url as string, { allows: (r) => guard.allows(r) });
    case 'DNS':
      return deps.dns(params.host as string);
    case 'OPENAPI':
      return deps.openapi(params.url as string);
    case 'NMAP': {
      const out = await deps.nmap(params.host as string, params.ports as string, { bin: env.NMAP_BIN, timeoutMs: env.TOOL_TIMEOUT_MS });
      // Defence in depth: every host Nmap reports must be in scope too.
      await guard.assertAll(out.hosts.map((h) => ({ host: h.host, port: h.port })));
      return out;
    }
    case 'ZAP':
      return deps.zap(params.url as string, `tanaw-${scanId}`, {
        apiUrl: env.ZAP_API_URL,
        apiKey: env.ZAP_API_KEY,
        spiderMaxMinutes: env.ZAP_SPIDER_MAX_MINUTES,
        activeScan: env.ZAP_ACTIVE_SCAN_ENABLED,
        timeoutMs: env.TOOL_TIMEOUT_MS,
        allows: (r) => guard.allows(r),
      });
    default:
      throw new Error(`Unsupported tool ${tool}`);
  }
}

export interface ScanOutcome {
  status: 'DONE' | 'FAILED' | 'SKIPPED';
  results?: number;
  findings_created?: number;
  finding_ids?: string[];
  /** Tool findings not created because the same problem is already recorded for the target. */
  duplicates?: number;
  error?: string;
  /** What the automatic AI interpretation needs to know about the scan. */
  scan?: { id: string; tool: string; target_id: string; actor_id: string | null };
}

export async function runScan(scanId: string, deps: ToolDeps = defaultDeps): Promise<ScanOutcome> {
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    include: {
      target: {
        select: {
          id: true,
          base_url: true,
          test_window_start: true,
          test_window_end: true,
          scope_rules: { select: { asset_type: true, value: true, in_scope: true } },
        },
      },
    },
  });
  if (!scan) throw new Error(`Scan ${scanId} not found`);
  if (scan.status === 'DONE' || scan.status === 'FAILED') return { status: 'SKIPPED' };

  await prisma.scan.update({ where: { id: scan.id }, data: { status: 'RUNNING', started_at: new Date() } });
  const params = (scan.params ?? {}) as ScanParams;
  const guard = createScopeGuard(scan.target, scan.started_by, scan.id);

  try {
    const requests = scopeRequestsForScan(scan.tool, params);
    if (!requests) throw new Error(`Scan ${scan.id} has invalid params for ${scan.tool}`);
    await guard.assertWithinTestWindow();
    await guard.assertAll(requests);

    const output = await runTool(scan.tool, params, scan.id, guard, deps);
    const rawKey = output.raw ? await storage.put(storageKeys.scanRaw(scan.target.id, scan.id, output.raw.ext), output.raw.content) : null;

    const findings = await prisma.$transaction(async (tx) => {
      const rows = await tx.scanResult.createManyAndReturn({
        data: output.results.map((r) => ({ scan_id: scan.id, type: r.type, data: r.data as Prisma.InputJsonValue })),
        select: { id: true, type: true, data: true },
      });
      const created = await createToolFindings(
        tx,
        { id: scan.id, tool: scan.tool, target_id: scan.target.id, target_base_url: scan.target.base_url, actor_id: scan.started_by },
        rows,
      );
      await tx.scan.update({
        where: { id: scan.id },
        data: { status: 'DONE', finished_at: new Date(), raw_output_path: rawKey, error: null },
      });
      return created;
    });
    logger.info('Scan finished', { scan_id: scan.id, tool: scan.tool, results: output.results.length, findings: findings.created });
    return {
      status: 'DONE',
      results: output.results.length,
      findings_created: findings.created,
      finding_ids: findings.finding_ids,
      duplicates: findings.duplicates,
      scan: { id: scan.id, tool: scan.tool, target_id: scan.target.id, actor_id: scan.started_by },
    };
  } catch (error) {
    const message = (error instanceof ScopeBlockedError ? error.message : (error as Error).message ?? String(error)).slice(0, 1000);
    await prisma.scan.update({ where: { id: scan.id }, data: { status: 'FAILED', error: message, finished_at: new Date() } });
    logger.warn('Scan failed', { scan_id: scan.id, tool: scan.tool, error: message });
    return { status: 'FAILED', error: message };
  }
}
