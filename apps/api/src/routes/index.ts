import { Router, type Router as RouterType } from 'express';
import { healthRouter } from './health';
import agentsRouter from './agents';
import buildingsRouter from './buildings';
import walletRouter from './wallet';
import timeRouter from './time';
import worldsRouter from './worlds';
import tradeRouter from './trade';
import marketRouter from './market';

const router: RouterType = Router();

// Health check
router.use('/health', healthRouter);

// Core API routes
router.use('/agents', agentsRouter);
router.use('/buildings', buildingsRouter);
router.use('/wallet', walletRouter);
router.use('/time', timeRouter);

// Multiverse routes
router.use('/worlds', worldsRouter);
router.use('/trade', tradeRouter);
router.use('/market', marketRouter);

export const apiRouter: RouterType = router;
