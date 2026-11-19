import { Prisma } from '@prisma/client';
import type { CreateUserInput, UpdateUserInput } from '@tanaw/shared';
import { MESSAGES } from '../constants/auth.js';
import { refreshTokenRepository } from '../repositories/refreshToken.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { hashPassword } from '../utils/crypto.js';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors.js';
import { auditService, type Actor } from './audit.service.js';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export const userService = {
  list(page: number, limit: number) {
    return userRepository.list(page, limit);
  },

  async get(id: string) {
    const user = await userRepository.findPublicById(id);
    if (!user) throw new NotFoundError(MESSAGES.USER_NOT_FOUND);
    return user;
  },

  async create(input: CreateUserInput, actor: Actor) {
    const password_hash = await hashPassword(input.password);
    try {
      const user = await userRepository.create({ email: input.email, name: input.name, role: input.role, password_hash });
      await auditService.log('user_created', actor, { metadata: { user_id: user.id, email: user.email, role: user.role } });
      return user;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(MESSAGES.EMAIL_TAKEN);
      throw error;
    }
  },

  async update(id: string, input: UpdateUserInput, actor: Actor & { id: string }) {
    const user = await userRepository.findById(id);
    if (!user) throw new NotFoundError(MESSAGES.USER_NOT_FOUND);

    const changesRole = input.role !== undefined && input.role !== user.role;
    const deactivates = input.is_active === false && user.is_active;
    if (id === actor.id && (changesRole || deactivates)) throw new BadRequestError(MESSAGES.CANNOT_CHANGE_SELF);

    const losesAdmin = user.role === 'ADMIN' && user.is_active && ((changesRole && input.role !== 'ADMIN') || deactivates);
    if (losesAdmin && (await userRepository.countActiveAdmins()) <= 1) throw new BadRequestError(MESSAGES.LAST_ADMIN);

    const updated = await userRepository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
    });
    // A demoted or deactivated user must sign in again; access tokens already re-check the user on every request.
    if (changesRole || deactivates) await refreshTokenRepository.revokeAllForUser(id);

    await auditService.log('user_updated', actor, {
      metadata: { user_id: id, changes: { ...input }, previous: { role: user.role, is_active: user.is_active } },
    });
    return updated;
  },

  async remove(id: string, actor: Actor & { id: string }) {
    if (id === actor.id) throw new BadRequestError(MESSAGES.CANNOT_CHANGE_SELF);
    const user = await userRepository.findById(id);
    if (!user) throw new NotFoundError(MESSAGES.USER_NOT_FOUND);
    if (user.role === 'ADMIN' && user.is_active && (await userRepository.countActiveAdmins()) <= 1) {
      throw new BadRequestError(MESSAGES.LAST_ADMIN);
    }
    await userRepository.delete(id);
    await auditService.log('user_deleted', actor, { metadata: { user_id: id, email: user.email, role: user.role } });
  },
};
