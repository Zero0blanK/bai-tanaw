import { ScanResultsQuery, StartScanBody } from '@tanaw/shared';
import type { Request, Response } from 'express';
import { jobService } from '../services/job.service.js';
import { scanService, type ImportTool } from '../services/scan.service.js';
import { accepted, created, ok, paginationMeta } from '../utils/apiResponse.js';
import { BadRequestError } from '../utils/errors.js';
import { currentActor } from '../utils/request.js';
import { IdParams } from '../validations/common.js';

function importer(tool: ImportTool) {
  return async (req: Request, res: Response) => {
    const { id } = IdParams.parse(req.params);
    if (!req.file) throw new BadRequestError('Attach the report as multipart field "file"');
    created(res, await scanService.importReport(id, tool, req.file, currentActor(req)), 'Report imported');
  };
}

export const scanController = {
  async start(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    accepted(res, await scanService.start(id, StartScanBody.parse(req.body), currentActor(req)), 'Scan queued');
  },

  async listForTarget(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    ok(res, await scanService.listForTarget(id));
  },

  async get(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    const query = ScanResultsQuery.parse(req.query);
    const { scan, results } = await scanService.get(id, query);
    ok(res, { ...scan, results: results.items, result_counts: results.counts }, undefined, paginationMeta(query.page, query.limit, results.total));
  },

  async raw(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    const file = await scanService.raw(id);
    res.setHeader('content-type', file.contentType);
    res.setHeader('content-disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('x-content-type-options', 'nosniff');
    res.send(file.body);
  },

  importNmap: importer('NMAP'),
  importZap: importer('ZAP'),

  async job(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    ok(res, await jobService.get(id));
  },
};
