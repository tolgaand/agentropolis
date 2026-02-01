import IORedis, { type RedisOptions } from 'ioredis';
import { env } from './env';

const REDIS_OPTIONS: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
};

export function createRedisConnection(): IORedis {
  return new IORedis(env.redisUrl, REDIS_OPTIONS);
}
