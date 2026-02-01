import { config } from 'dotenv';

config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  mongodbUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/agentropolis',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  queueName: process.env.JOBS_QUEUE_NAME ?? 'agentropolis:jobs',
  seedOnStart: process.env.SEED_ON_START === 'true',
  systemAgentKey: process.env.SYSTEM_AGENT_KEY ?? 'system',
} as const;
