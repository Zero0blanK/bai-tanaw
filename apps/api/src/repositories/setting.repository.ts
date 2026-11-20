import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export const settingRepository = {
  find(key: string) {
    return prisma.appSetting.findUnique({
      where: { key },
      include: { updater: { select: { id: true, name: true } } },
    });
  },

  upsert(key: string, data: { value: Prisma.InputJsonValue; secret: string | null; secret_hint: string | null; updated_by: string | null }) {
    return prisma.appSetting.upsert({
      where: { key },
      create: { key, ...data },
      update: data,
    });
  },
};
