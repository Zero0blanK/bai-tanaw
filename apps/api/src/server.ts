import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info('API listening', { port: env.PORT, env: env.NODE_ENV, allowed_hosts: env.ALLOWED_HOSTS });
  if (env.ALLOWED_HOSTS.length === 0) {
    logger.warn('ASSESSMENT_ALLOWED_HOSTS is empty: every scan and import will be blocked');
  }
});

function shutdown(signal: string): void {
  logger.info('Shutting down', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
