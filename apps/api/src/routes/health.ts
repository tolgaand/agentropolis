import { Router } from 'express';
import { isMongoHealthy } from '../config/db';
import { isRedisHealthy } from '../config/redis';
import { env } from '../config/env';

const router: ReturnType<typeof Router> = Router();

const startedAt = Date.now();

router.get('/', async (_req, res) => {
  const mongoOk = isMongoHealthy();
  const redisOk = await isRedisHealthy();
  const uptimeMs = Date.now() - startedAt;

  const healthy = mongoOk && redisOk;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    uptime: `${Math.floor(uptimeMs / 1000)}s`,
    env: env.nodeEnv,
    services: {
      mongo: mongoOk ? 'connected' : 'disconnected',
      redis: redisOk ? 'connected' : 'disconnected',
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
