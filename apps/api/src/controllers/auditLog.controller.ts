import type { Request, Response } from 'express';
import { auditService } from '../services/audit.service.js';
import { ok, paginationMeta } from '../utils/apiResponse.js';
import { AuditLogQuery } from '../validations/common.js';

export const auditLogController = {
  async list(req: Request, res: Response) {
    const filters = AuditLogQuery.parse(req.query);
    const { items, total } = await auditService.list(filters);
    ok(res, items, undefined, paginationMeta(filters.page, filters.limit, total));
  },
};
