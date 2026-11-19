import type { Prisma, Role } from '@prisma/client';
import { prisma } from '../config/prisma.js';

/** Columns safe to return to clients (never password_hash). */
export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  is_active: true,
  last_login_at: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

export const userRepository = {
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  findPublicById(id: string) {
    return prisma.user.findUnique({ where: { id }, select: publicUserSelect });
  },

  async list(page: number, limit: number) {
    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        select: publicUserSelect,
        orderBy: { created_at: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count(),
    ]);
    return { items, total };
  },

  create(data: { email: string; name: string; password_hash: string; role: Role }) {
    return prisma.user.create({ data, select: publicUserSelect });
  },

  update(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({ where: { id }, data, select: publicUserSelect });
  },

  delete(id: string) {
    return prisma.user.delete({ where: { id } });
  },

  countActiveAdmins() {
    return prisma.user.count({ where: { role: 'ADMIN', is_active: true } });
  },

  /** Atomic increment; returns the new count so the caller can decide on a lockout. */
  async recordFailedLogin(id: string): Promise<number> {
    const user = await prisma.user.update({
      where: { id },
      data: { failed_login_attempts: { increment: 1 } },
      select: { failed_login_attempts: true },
    });
    return user.failed_login_attempts;
  },

  lock(id: string, until: Date) {
    return prisma.user.update({ where: { id }, data: { locked_until: until, failed_login_attempts: 0 } });
  },

  recordSuccessfulLogin(id: string) {
    return prisma.user.update({
      where: { id },
      data: { failed_login_attempts: 0, locked_until: null, last_login_at: new Date() },
    });
  },
};
