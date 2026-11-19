import { CreateUserBody, paginationQuery, UpdateUserBody } from '@tanaw/shared';
import type { Request, Response } from 'express';
import { userService } from '../services/user.service.js';
import { created, ok, paginationMeta } from '../utils/apiResponse.js';
import { currentActor } from '../utils/request.js';
import { IdParams } from '../validations/common.js';

export const userController = {
  async list(req: Request, res: Response) {
    const { page, limit } = paginationQuery.parse(req.query);
    const { items, total } = await userService.list(page, limit);
    ok(res, items, undefined, paginationMeta(page, limit, total));
  },

  async create(req: Request, res: Response) {
    const user = await userService.create(CreateUserBody.parse(req.body), currentActor(req));
    created(res, user, 'User created');
  },

  async update(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    ok(res, await userService.update(id, UpdateUserBody.parse(req.body), currentActor(req)), 'User updated');
  },

  async remove(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    await userService.remove(id, currentActor(req));
    ok(res, null, 'User deleted');
  },
};
