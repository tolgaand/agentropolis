import { Worker, type Job } from 'bullmq';
import { env } from '../config/env';
import { createRedisConnection } from '../config/redis';
import type { JobName, JobPayloads } from './jobTypes';
import { seedSystemAgent } from '../jobs/seedSystemAgent';
import { seedWorlds } from '../jobs/seedWorlds';
import { seedResources } from '../jobs/seedResources';
import { advanceTime } from '../jobs/timeAdvance';
import { resetDailyCaps } from '../jobs/dailyReset';
import { updateMarketPrices } from '../jobs/marketPriceJob';
import { updateExchangeRates } from '../jobs/exchangeRateJob';

const handlers: Record<JobName, (job: Job<JobPayloads[JobName], unknown, JobName>) => Promise<unknown>> = {
  'seed:system-agent': async () => seedSystemAgent(),
  'seed:worlds': async () => seedWorlds(),
  'seed:resources': async () => seedResources(),
  'time:advance': async (job) => advanceTime(job.data),
  'daily:reset': async () => resetDailyCaps(),
  'economy:market-prices': async () => updateMarketPrices(),
  'economy:exchange-rates': async () => updateExchangeRates(),
};

export function createJobsWorker(): Worker<JobPayloads[JobName], unknown, JobName> {
  const connection = createRedisConnection();

  return new Worker<JobPayloads[JobName], unknown, JobName>(
    env.queueName,
    async (job) => {
      const handler = handlers[job.name];
      if (!handler) {
        throw new Error(`No handler registered for job: ${job.name}`);
      }
      return handler(job as Job<JobPayloads[JobName], unknown, JobName>);
    },
    { connection }
  );
}
