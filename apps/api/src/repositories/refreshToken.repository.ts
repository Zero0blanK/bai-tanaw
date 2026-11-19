import { prisma, type Tx } from '../config/prisma.js';

export const refreshTokenRepository = {
  create(
    data: { user_id: string; token_hash: string; expires_at: Date; user_agent?: string | null; ip?: string | null },
    tx: Tx = prisma,
  ) {
    return tx.refreshToken.create({ data });
  },

  findByHash(token_hash: string) {
    return prisma.refreshToken.findUnique({ where: { token_hash }, include: { user: true } });
  },

  /** Marks a token as used. Returns false if someone else rotated it first (race or replay). */
  async markRotated(id: string, replaced_by: string, tx: Tx): Promise<boolean> {
    const { count } = await tx.refreshToken.updateMany({
      where: { id, revoked_at: null },
      data: { revoked_at: new Date(), replaced_by },
    });
    return count === 1;
  },

  revoke(id: string) {
    return prisma.refreshToken.updateMany({ where: { id, revoked_at: null }, data: { revoked_at: new Date() } });
  },

  revokeAllForUser(user_id: string) {
    return prisma.refreshToken.updateMany({ where: { user_id, revoked_at: null }, data: { revoked_at: new Date() } });
  },
};
