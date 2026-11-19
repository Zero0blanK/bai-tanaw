import { Redis } from 'ioredis';
import { env } from './env.js';

/** BullMQ workers need maxRetriesPerRequest: null (blocking commands). */
export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}
