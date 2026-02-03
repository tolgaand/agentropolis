import Redis from 'ioredis';
import { env } from './env';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env.redisUrl, {
      maxRetriesPerRequest: null, // Required for BullMQ
      lazyConnect: true,
    });

    redis.on('connect', () => {
      console.log('✓ Redis connected');
    });

    redis.on('error', (err) => {
      console.error('✗ Redis error:', err.message);
    });
  }
  return redis;
}

export async function connectRedis(): Promise<void> {
  const client = getRedis();
  await client.connect();
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

/** Check if Redis is connected and responding */
export async function isRedisHealthy(): Promise<boolean> {
  try {
    if (!redis) return false;
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
