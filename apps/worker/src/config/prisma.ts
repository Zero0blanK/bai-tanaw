import { PrismaClient } from '@prisma/client';

/** Same generated client as the API (schema lives in apps/api/prisma). */
export const prisma = new PrismaClient({ log: ['warn'] });
