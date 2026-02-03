import { Router } from 'express';
import healthRouter from './health';
import cityRouter from './city';
import agentRouter from './agents';
import buildingRouter from './buildings';

export const apiRouter: ReturnType<typeof Router> = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/city', cityRouter);
apiRouter.use('/agents', agentRouter);
apiRouter.use('/buildings', buildingRouter);
