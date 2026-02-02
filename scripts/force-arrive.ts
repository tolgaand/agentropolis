/**
 * Force all marching armies to arrive NOW using mongoose from the db package
 */
import mongoose from 'mongoose';

const MONGO_URI = 'mongodb://localhost:27017/agentropolis';

async function main() {
  await mongoose.connect(MONGO_URI);

  const pastDate = new Date(Date.now() - 60000);
  const result = await mongoose.connection.db!.collection('armies').updateMany(
    { state: 'marching' },
    { $set: { estimatedArrival: pastDate } }
  );

  console.log(`Updated ${result.modifiedCount} marching armies to arrive NOW`);

  const armies = await mongoose.connection.db!.collection('armies').find({}).toArray();
  for (const a of armies) {
    console.log(`  ${a._id}: state=${a.state} faction=${a.factionId} pos=(${a.position?.x},${a.position?.y}) -> target=(${a.target?.x},${a.target?.y})`);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
