import type { ScanResultType } from '@prisma/client';
import {
  isSafeNmapHost,
  isSafeNmapPorts,
  MAX_NMAP_PORTS,
  normalizeHost,
  parseHttpUrl,
  scopeRequestsForScan,
  TOOL_JOB_TYPE,
  type ParsedReport,
  type ScanParams,
  type StartScanInput,
} from '@tanaw/shared';
import { parseNmapXml, parseZapJson, storageKeys } from '@tanaw/shared/node';
import { env } from '../config/env.js';
import { storage } from '../config/storage.js';
import { jobRepository } from '../repositories/job.repository.js';
import { scanRepository } from '../repositories/scan.repository.js';
import { targetRepository } from '../repositories/target.repository.js';
import { withTransaction } from '../repositories/transaction.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { auditService, type Actor } from './audit.service.js';
import { jobService } from './job.service.js';
import { scopeService } from './scope.service.js';
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
    const scan = await withTransaction(async (tx) => {
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
      await scanRepository.addResults(scan.id, report.results, tx);
      return scan;
    });

    const key = await storage.put(storageKeys.scanRaw(target.id, scan.id, tool === 'NMAP' ? 'xml' : 'json'), file.buffer);
    const updated = await scanRepository.update(scan.id, { raw_output_path: key });
    await auditService.log('report_imported', actor, {
      target_id: target.id,
      metadata: { scan_id: scan.id, tool, filename, results: report.results.length },
    });
    return { scan: updated, results: report.results.length };
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
