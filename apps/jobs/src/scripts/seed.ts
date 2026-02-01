/**
 * Direct seed script - runs without Redis/BullMQ
 * Usage: pnpm seed
 */
import mongoose from 'mongoose';
import { env } from '../config/env';
import { seedWorlds } from '../jobs/seedWorlds';
import { seedResources } from '../jobs/seedResources';

async function main(): Promise<void> {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(env.mongodbUri);
  console.log('✓ Connected to MongoDB');

  console.log('\n--- Running Seeds ---\n');

  await seedWorlds();
  await seedResources();

  console.log('\n✓ All seeds completed');

  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
