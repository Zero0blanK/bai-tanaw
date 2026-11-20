import { randomUUID } from 'node:crypto';
import type { ScanResultType } from '@prisma/client';
import {
  checkScope,
  expandPortSpec,
  isSafeNmapHost,
  isSafeNmapPorts,
  MAX_NMAP_PORTS,
  normalizeHost,
  parseHttpUrl,
  RUNNABLE_TOOLS,
  scopeRequestsForScan,
  TOOL_JOB_TYPE,
  type ParsedReport,
  type RunAllScansInput,
  type RunnableTool,
  type ScanParams,
  type StartScanInput,
} from '@tanaw/shared';
import { parseNmapXml, parseZapJson, storageKeys } from '@tanaw/shared/node';
import { env } from '../config/env.js';
import { storage } from '../config/storage.js';
import { createToolFindings, findingRepository } from '../repositories/finding.repository.js';
import { jobRepository } from '../repositories/job.repository.js';
import { scanRepository } from '../repositories/scan.repository.js';
import { targetRepository } from '../repositories/target.repository.js';
import { withTransaction } from '../repositories/transaction.js';
import { AuthorizationError, BadRequestError, NotFoundError, ServiceUnavailableError } from '../utils/errors.js';
import { aiService } from './ai.service.js';
import { auditService, type Actor } from './audit.service.js';
import { jobService } from './job.service.js';
import { SCOPE_MESSAGES, scopeService } from './scope.service.js';
import { TARGET_MESSAGES } from './target.service.js';

export type ImportTool = 'NMAP' | 'ZAP';

async function loadTarget(targetId: string) {
  const target = await targetRepository.findForScope(targetId);
  if (!target) throw new NotFoundError(TARGET_MESSAGES.NOT_FOUND);
  return target;
}

/** Fills in defaults from the target and validates what each tool needs. */
function buildParams(tool: StartScanInput['tool'], input: StartScanInput, baseUrl: string): ScanParams {
  const base = parseHttpUrl(baseUrl);
  if (!base) throw new BadRequestError('Target base URL is invalid');
  switch (tool) {
    case 'HTTP_CHECK':
    case 'ZAP':
      return { url: input.url ?? baseUrl };
    case 'OPENAPI':
      return { url: input.url ?? `${base.origin}/api/docs/openapi.json` };
    case 'DNS':
      return { host: normalizeHost(input.host ?? base.hostname) };
    case 'NMAP': {
      const host = normalizeHost(input.host ?? base.hostname);
      const ports = (input.ports ?? env.NMAP_DEFAULT_PORTS).replace(/\s+/g, '');
      if (!isSafeNmapHost(host)) throw new BadRequestError('host must be a plain hostname or IPv4 address');
      if (!isSafeNmapPorts(ports)) throw new BadRequestError('ports must look like "80,443" or "8000-8100"');
      return { host, ports };
    }
  }
}

/**
 * Nmap ports for a full run: the defaults plus the target's own port, keeping only ports the scope allows. A full
 * run shouldn't fail just because the default 80/443 sit outside a target that lives on :8787.
 */
function fullRunPorts(target: Parameters<typeof checkScope>[0], host: string, requested: string | undefined): string | null {
  const base = parseHttpUrl(target.base_url);
  const wanted = requested ?? [env.NMAP_DEFAULT_PORTS, base?.port || (base?.protocol === 'https:' ? '443' : '80')].join(',');
  const ports = expandPortSpec(wanted.replace(/\s+/g, ''));
  if (!ports) return null;
  const allowed = [...new Set(ports)].filter((port) => checkScope(target, { host, port }, env.ALLOWED_HOSTS).ok);
  return allowed.length > 0 ? allowed.sort((a, b) => a - b).join(',') : null;
}

export interface SkippedTool {
  tool: RunnableTool;
  reason: string;
}

export const scanService = {
  /** Scope-checks, then creates the scan + job rows in one transaction and queues the job. Returns 202 data. */
  async start(targetId: string, input: StartScanInput, actor: Actor) {
    const target = await loadTarget(targetId);
    const params = buildParams(input.tool, input, target.base_url);
    const requests = scopeRequestsForScan(input.tool, params);
    if (!requests) throw new BadRequestError(`Too many ports: at most ${MAX_NMAP_PORTS} per Nmap run`);

    await scopeService.assertWithinTestWindow(target, actor);
    await scopeService.assertAllInScope(target, requests, actor, 'scan');

    const { scan, job } = await withTransaction(async (tx) => {
      const scan = await scanRepository.create(
        { target_id: target.id, tool: input.tool, source: 'WORKER', params: { ...params }, started_by: actor.id ?? null },
        tx,
      );
      const job = await jobRepository.create({ type: TOOL_JOB_TYPE[input.tool], ref_id: scan.id, created_by: actor.id ?? null }, tx);
      return { scan, job };
    });

    const queued = await jobService.dispatch(job, (reason) =>
      scanRepository.update(scan.id, { status: 'FAILED', error: reason, finished_at: new Date() }),
    );
    await auditService.log('scan_started', actor, {
      target_id: target.id,
      metadata: { scan_id: scan.id, job_id: job.id, tool: input.tool, params: { ...params } },
    });
    return { scan, job: queued };
  },

  /**
   * Runs every tool (HTTP check, DNS, OpenAPI, Nmap, ZAP) against the target in one go. Each tool is scope-checked
   * like a single scan; a tool whose requests fall outside scope is skipped (and audited), the rest still run.
   * All scans share a `batch_id` in their params so the UI can show the run as one assessment.
   */
  async startAll(targetId: string, input: RunAllScansInput, actor: Actor) {
    const target = await loadTarget(targetId);
    await scopeService.assertWithinTestWindow(target, actor);
    const base = parseHttpUrl(target.base_url);
    if (!base) throw new BadRequestError('Target base URL is invalid');

    const batchId = randomUUID();
    const planned: Array<{ tool: RunnableTool; params: ScanParams }> = [];
    const skipped: SkippedTool[] = [];
    for (const tool of RUNNABLE_TOOLS) {
      try {
        let params: ScanParams;
        if (tool === 'NMAP') {
          const host = normalizeHost(base.hostname);
          const ports = fullRunPorts(target, host, input.ports);
          if (!ports) throw new AuthorizationError('no port the scope allows');
          params = buildParams('NMAP', { tool, host, ports }, target.base_url);
        } else {
          params = buildParams(tool, { tool, url: tool === 'HTTP_CHECK' || tool === 'ZAP' ? input.url : undefined }, target.base_url);
        }
        const requests = scopeRequestsForScan(tool, params);
        if (!requests) throw new BadRequestError('invalid parameters');
        const blocked = requests.map((r) => checkScope(target, r, env.ALLOWED_HOSTS)).find((d) => !d.ok);
        if (blocked && !blocked.ok) throw new AuthorizationError(blocked.reason);
        planned.push({ tool, params: { ...params, batch_id: batchId } });
      } catch (error) {
        const reason = (error as Error).message;
        skipped.push({ tool, reason });
        await auditService.log('scope_blocked', actor, { target_id: target.id, metadata: { context: 'scan', batch_id: batchId, tool, reason } });
      }
    }
    if (planned.length === 0) {
      throw new AuthorizationError(`${SCOPE_MESSAGES.OUT_OF_SCOPE}: no tool can run (${skipped.map((s) => `${s.tool}: ${s.reason}`).join('; ')})`);
    }

    const created = await withTransaction(async (tx) => {
      const rows = [];
      for (const { tool, params } of planned) {
        const scan = await scanRepository.create(
          { target_id: target.id, tool, source: 'WORKER', params: { ...params }, started_by: actor.id ?? null },
          tx,
        );
        const job = await jobRepository.create({ type: TOOL_JOB_TYPE[tool], ref_id: scan.id, created_by: actor.id ?? null }, tx);
        rows.push({ scan, job });
      }
      return rows;
    });

    const runs = [];
    let queuedCount = 0;
    for (const { scan, job } of created) {
      try {
        const queued = await jobService.dispatch(job, (reason) =>
          scanRepository.update(scan.id, { status: 'FAILED', error: reason, finished_at: new Date() }),
        );
        queuedCount += 1;
        runs.push({ scan, job: queued });
      } catch {
        runs.push({ scan: { ...scan, status: 'FAILED' as const }, job: { ...job, status: 'FAILED' as const } });
      }
    }
    if (queuedCount === 0) throw new ServiceUnavailableError('Queue unavailable (is Redis running?)');

    await auditService.log('scan_started', actor, {
      target_id: target.id,
      metadata: { batch_id: batchId, tools: planned.map((p) => p.tool), skipped: skipped.map((s) => s.tool) },
    });
    return { batch_id: batchId, runs, skipped };
  },

  /**
   * Imports an Nmap XML or ZAP JSON report. Every host (and port) it mentions must be in scope,
   * or nothing is stored. Imports don't touch the target, so the test window doesn't apply.
   */
  async importReport(targetId: string, tool: ImportTool, file: { buffer: Buffer; originalname: string }, actor: Actor) {
    const target = await loadTarget(targetId);
    const text = file.buffer.toString('utf8');

    let report: ParsedReport;
    try {
      report = tool === 'NMAP' ? parseNmapXml(text) : parseZapJson(text);
    } catch (error) {
      throw new BadRequestError(`Could not read the ${tool === 'NMAP' ? 'Nmap XML' : 'ZAP JSON'} report: ${(error as Error).message}`);
    }

    await scopeService.assertAllInScope(
      target,
      report.hosts.map((h) => ({ host: h.host, port: h.port })),
      actor,
      'import',
    );

    const filename = file.originalname.replace(/[^\w.-]+/g, '_').slice(0, 200);
    const now = new Date();
    const { scan, findings } = await withTransaction(async (tx) => {
      const scan = await scanRepository.create(
        {
          target_id: target.id,
          tool,
          source: 'IMPORT',
          status: 'DONE',
          params: { filename },
          started_by: actor.id ?? null,
          started_at: now,
          finished_at: now,
        },
        tx,
      );
      const rows = await scanRepository.addResults(scan.id, report.results, tx);
      // Imported reports become findings the same way tool runs do.
      const findings = await createToolFindings(
        tx,
        { id: scan.id, tool, target_id: target.id, target_base_url: target.base_url, actor_id: actor.id ?? null },
        rows,
      );
      return { scan, findings };
    });

    const key = await storage.put(storageKeys.scanRaw(target.id, scan.id, tool === 'NMAP' ? 'xml' : 'json'), file.buffer);
    const updated = await scanRepository.update(scan.id, { raw_output_path: key });
    await auditService.log('report_imported', actor, {
      target_id: target.id,
      metadata: { scan_id: scan.id, tool, filename, results: report.results.length },
    });
    const ai = await aiService.autoInterpret({ id: scan.id, tool, target_id: target.id, results: report.results.length }, actor);
    return { scan: updated, results: report.results.length, findings_created: findings.created, duplicates: findings.duplicates, ai };
  },

  /**
   * The target's latest full run ("Run full assessment"): each tool's scan, the automatic AI interpretations of
   * those scans, and how many findings wait for an assessor. Drives the assessment track on the target page.
   */
  async latestAssessment(targetId: string) {
    await loadTarget(targetId);
    const scans = await scanRepository.listForTarget(targetId);
    const batchOf = (s: (typeof scans)[number]) => (s.params as ScanParams | null)?.batch_id ?? null;
    const latest = scans.find((s) => batchOf(s));
    const batchId = latest ? batchOf(latest) : null;
    const batch = batchId ? scans.filter((s) => batchOf(s) === batchId).reverse() : [];
    const jobs = await jobRepository.listInterpretations(batch.map((s) => s.id));
    const findings = await findingRepository.countByStatusForTarget(targetId);
    return {
      batch_id: batchId,
      started_at: batch[0]?.created_at ?? null,
      scans: batch.map((s) => ({
        id: s.id,
        tool: s.tool,
        status: s.status,
        error: s.error,
        results: s._count.results,
        findings: s._count.findings,
        finished_at: s.finished_at,
      })),
      ai: jobs.map((j) => ({ id: j.id, scan_id: j.ref_id, status: j.status, failed_reason: j.failed_reason, result: j.result })),
      findings,
    };
  },

  async listForTarget(targetId: string) {
    await loadTarget(targetId);
    return scanRepository.listForTarget(targetId);
  },

  async get(id: string, filters: { type?: ScanResultType | undefined; page: number; limit: number }) {
    const scan = await scanRepository.findDetail(id);
    if (!scan) throw new NotFoundError('Scan not found');
    const results = await scanRepository.listResults(id, filters);
    return { scan, results };
  },

  async raw(id: string) {
    const scan = await scanRepository.findById(id);
    if (!scan?.raw_output_path) throw new NotFoundError('This scan has no raw output');
    const ext = scan.raw_output_path.split('.').pop();
    const contentType = ext === 'xml' ? 'application/xml' : ext === 'json' ? 'application/json' : 'text/plain';
    return { body: await storage.get(scan.raw_output_path), contentType, filename: `${scan.tool.toLowerCase()}-${scan.id}.${ext}` };
  },
};
