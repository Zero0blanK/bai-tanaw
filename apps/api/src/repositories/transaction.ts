import { prisma, type Tx } from '../config/prisma.js';

export type { Tx };

/** Services use this to group repository calls into one Postgres transaction. */
export function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn);
}
