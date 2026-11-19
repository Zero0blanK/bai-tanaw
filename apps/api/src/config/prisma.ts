import { PrismaClient } from '@prisma/client';

/**
 * One client per process. Only repositories (and the seed script) import this.
 * Query errors are not logged here: services handle the expected ones (for example unique
 * violations become 409) and the error middleware logs anything unexpected.
 */
export const prisma = new PrismaClient({ log: ['warn'] });

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
