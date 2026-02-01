import { Queue } from 'bullmq';
import { env } from '../config/env';
import { createRedisConnection } from '../config/redis';
import type { JobName, JobPayloads } from './jobTypes';

export type JobsQueue = Queue<JobPayloads[JobName], unknown, JobName>;

export function createJobsQueue(): JobsQueue {
  const connection = createRedisConnection();
  const queue = new Queue<JobPayloads[JobName], unknown, JobName>(env.queueName, { connection });

  return queue;
}

export async function registerRecurringJobs(queue: JobsQueue): Promise<void> {
  // Remove existing repeatable jobs to avoid duplicates
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Advance game time every minute
  await queue.add('time:advance', {}, {
    repeat: { every: 60_000 },
    jobId: 'time:advance',
  });

  // Daily reset at midnight UTC
  await queue.add('daily:reset', {}, {
    repeat: { pattern: '0 0 * * *' },
    jobId: 'daily:reset',
  });

  // Update market prices every 2 minutes
  await queue.add('economy:market-prices', {}, {
    repeat: { every: 120_000 },
    jobId: 'economy:market-prices',
  });

  // Update exchange rates every 5 minutes
  await queue.add('economy:exchange-rates', {}, {
    repeat: { every: 300_000 },
    jobId: 'economy:exchange-rates',
  });
}

export async function enqueueSeedJobs(queue: JobsQueue): Promise<void> {
  // Multiverse seeds - should run first
  await queue.add('seed:worlds', {}, { jobId: 'seed:worlds' });
  await queue.add('seed:resources', {}, { jobId: 'seed:resources' });

  await queue.add('seed:system-agent', {}, { jobId: 'seed:system-agent' });
}
