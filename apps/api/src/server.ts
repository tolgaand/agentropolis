import { createServer } from 'http';
import { app } from './app';
import { env } from './config/env';
import { connectDatabase } from './config/db';
import { connectRedis, disconnectRedis } from './config/redis';
import { initializeSocket, bootstrapCity, getIO, setAccountIds } from './modules/realtime';
import { bootstrapAccounts, CityTickRunner } from './modules/tick';

let tickRunner: CityTickRunner | null = null;

async function bootstrap(): Promise<void> {
  // Connect to datastores
  await connectDatabase();
  await connectRedis();

  // Bootstrap city state (ensure city-001 exists in DB)
  await bootstrapCity();

  // Create HTTP server
  const httpServer = createServer(app);

  // Initialize Socket.io with typed events
  initializeSocket(httpServer);

  // Bootstrap city accounts (treasury + NPC pool) and start tick engine
  const accounts = await bootstrapAccounts();
  setAccountIds(accounts.cityId, accounts.treasuryAccountId, accounts.npcPoolAccountId);
  tickRunner = new CityTickRunner(
    accounts.cityId,
    accounts.treasuryAccountId,
    accounts.npcPoolAccountId,
    getIO(),
  );
  tickRunner.start();

  // Start listening
  httpServer.listen(env.port, () => {
    console.log(`✓ Server running on http://localhost:${env.port}`);
    console.log(`  Environment: ${env.nodeEnv}`);
    console.log(`  Health: http://localhost:${env.port}/api/health`);
    console.log(`  Socket.io: ws://localhost:${env.port}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down...`);
    tickRunner?.stop();
    httpServer.close(() => {
      console.log('[HTTP] Server closed');
    });
    await disconnectRedis();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
