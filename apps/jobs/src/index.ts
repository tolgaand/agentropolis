import mongoose from 'mongoose';
import { env } from './config/env';
import { connectDatabase } from './config/db';
import { createJobsQueue, registerRecurringJobs, enqueueSeedJobs } from './queues/jobsQueue';
import { createJobsWorker } from './queues/worker';

async function bootstrap(): Promise<void> {
  await connectDatabase();

  const queue = createJobsQueue();
  await registerRecurringJobs(queue);

  if (env.seedOnStart) {
    await enqueueSeedJobs(queue);
  }

  const worker = createJobsWorker();

  worker.on('completed', (job) => {
    console.log(`✓ Job completed: ${job.name}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`✗ Job failed: ${job?.name ?? 'unknown'}`, err);
  });

  console.log(`✓ Jobs running (${env.queueName})`);
}

async function shutdown(): Promise<void> {
  await mongoose.connection.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

bootstrap().catch((err) => {
  console.error('Failed to start jobs:', err);
  process.exit(1);
});
