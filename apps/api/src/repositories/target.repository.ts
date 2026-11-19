import type { Prisma, ScopeAssetType } from '@prisma/client';
import { prisma } from '../config/prisma.js';

const creatorSelect = { select: { id: true, name: true, email: true } } as const;

export const targetRepository = {
  create(data: Prisma.AssessmentTargetUncheckedCreateInput) {
    return prisma.assessmentTarget.create({ data, include: { scope_rules: true } });
  },

  list() {
    return prisma.assessmentTarget.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        creator: creatorSelect,
        _count: { select: { scope_rules: true, scans: true, findings: true } },
      },
    });
  },

  findById(id: string) {
    return prisma.assessmentTarget.findUnique({
      where: { id },
      include: {
        creator: creatorSelect,
        scope_rules: { orderBy: { created_at: 'asc' } },
        _count: { select: { scans: true, findings: true } },
      },
    });
  },

  /** Just what checkScope needs. */
  findForScope(id: string) {
    return prisma.assessmentTarget.findUnique({
      where: { id },
      select: { id: true, base_url: true, scope_rules: { select: { asset_type: true, value: true, in_scope: true } } },
    });
  },

  update(id: string, data: Prisma.AssessmentTargetUpdateInput) {
    return prisma.assessmentTarget.update({ where: { id }, data, include: { scope_rules: true } });
  },
};

export const scopeRuleRepository = {
  create(data: { target_id: string; asset_type: ScopeAssetType; value: string; in_scope: boolean; notes?: string | null }) {
    return prisma.scopeRule.create({ data });
  },

  findForTarget(target_id: string, id: string) {
    return prisma.scopeRule.findFirst({ where: { id, target_id } });
  },

  delete(id: string) {
    return prisma.scopeRule.delete({ where: { id } });
  },
};
