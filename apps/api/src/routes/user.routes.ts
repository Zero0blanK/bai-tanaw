import { CreateUserBody, paginationQuery, UpdateUserBody } from '@tanaw/shared';
import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { authenticate, requireRole, ROLE_GROUPS } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { IdParams } from '../validations/common.js';

export function createUserRouter(): Router {
  const router = Router();
  router.use(authenticate, requireRole(...ROLE_GROUPS.admin));
  router.get('/', validate({ query: paginationQuery }), userController.list);
  router.post('/', validate({ body: CreateUserBody }), userController.create);
  router.patch('/:id', validate({ params: IdParams, body: UpdateUserBody }), userController.update);
  router.delete('/:id', validate({ params: IdParams }), userController.remove);
  return router;
}
