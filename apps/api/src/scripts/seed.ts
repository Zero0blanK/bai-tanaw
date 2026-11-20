// Creates the first admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD. Safe to run more than once:
// an existing account is left untouched (the password is never reset by the seed).
// Run: npm run seed --workspace @tanaw/api

import { passwordSchema } from '@tanaw/shared';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../config/prisma.js';
import { hashPassword } from '../utils/crypto.js';

const SeedEnv = z.object({
  SEED_ADMIN_EMAIL: z.email().trim().toLowerCase(),
  SEED_ADMIN_PASSWORD: passwordSchema,
  SEED_ADMIN_NAME: z.string().trim().min(2).default('Bai-Tanaw Admin'),
});

async function main(): Promise<void> {
  const parsed = SeedEnv.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Seed configuration invalid:\n${lines.join('\n')}`);
  }
  const { SEED_ADMIN_EMAIL: email, SEED_ADMIN_PASSWORD: password, SEED_ADMIN_NAME: name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    logger.info('Admin already exists, nothing to do', { email });
    return;
  }

  if (env.NODE_ENV === 'production' && password.startsWith('change-me')) {
    throw new Error('Refusing to seed production with the example admin password. Set SEED_ADMIN_PASSWORD.');
  }

  await prisma.user.create({
    data: { email, name, role: 'ADMIN', password_hash: await hashPassword(password) },
  });
  logger.info('Created first admin. Change the password after the first login.', { email });
}

main()
  .catch((error: unknown) => {
    logger.error('Seed failed', { error });
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
