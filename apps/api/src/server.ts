import { createServer } from 'http';
import { app } from './app';
import { env } from './config/env';
import { connectDatabase } from './config/db';
import { initializeSocket } from './socket';
import { timeServer } from './time/TimeServer';
import { startJobs } from './jobs';
import { initRedis, closeRedis, isRedisConnected } from './redis';
import { mapState } from './game/map/state';

async function bootstrap(): Promise<void> {
  // Connect to MongoDB
  await connectDatabase();

  // Restore map state from database (existing agent parcels)
  const restoredParcels = await mapState.restoreFromDatabase();
  if (restoredParcels > 0) {
    console.log(`✓ Restored ${restoredParcels} parcels from database`);
  }

  // Connect to Redis (non-blocking - app works without it)
  await initRedis();
  if (isRedisConnected()) {
    console.log('[Redis] Ready for caching');
  } else {
    console.warn('[Redis] Running without cache (Redis unavailable)');
  }

  // Create HTTP server
  const httpServer = createServer(app);

  // Initialize Socket.io
  initializeSocket(httpServer);
  console.log('✓ Socket.io initialized');

  // Start TimeServer (server-centric time broadcast)
  timeServer.start();
  console.log('✓ TimeServer started');

  // Start background jobs (economy simulation)
  await startJobs();
  console.log('✓ Background jobs started');

  // Start server
  httpServer.listen(env.port, () => {
    console.log(`✓ Server running on http://localhost:${env.port}`);
    console.log(`  Environment: ${env.nodeEnv}`);
  });

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    // Stop accepting new connections
    httpServer.close(() => {
      console.log('[HTTP] Server closed');
    });

    // Stop background jobs
    timeServer.stop();
    console.log('[TimeServer] Stopped');

    // Close Redis connection
    await closeRedis();

    // Exit after cleanup
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
