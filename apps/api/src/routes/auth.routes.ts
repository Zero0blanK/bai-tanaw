import { ChangePasswordBody, LoginBody } from '@tanaw/shared';
import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { createLoginLimiter } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';

export function createAuthRouter(): Router {
  const router = Router();
  router.post('/login', createLoginLimiter(), validate({ body: LoginBody }), authController.login);
  router.post('/refresh', authController.refresh);
  router.post('/logout', authController.logout);
  router.get('/me', authenticate, authController.me);
  router.post(
    '/password',
    authenticate,
    createLoginLimiter(),
    validate({ body: ChangePasswordBody }),
    authController.changePassword,
  );
  return router;
}
