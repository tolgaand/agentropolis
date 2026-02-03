import { config } from 'dotenv';
config();

// Generate a random JWT secret for development if not provided
const devJwtSecret = 'agentropolis-dev-secret-change-in-production';

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  mongodbUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/agentropolis',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  isDev: process.env.NODE_ENV !== 'production',
  JWT_SECRET: process.env.JWT_SECRET ?? devJwtSecret,
  cityMode: (process.env.CITY_MODE ?? 'real') as 'stub' | 'real' | 'hybrid',
} as const;
