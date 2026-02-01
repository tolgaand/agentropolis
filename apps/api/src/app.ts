import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { apiRouter } from './routes';
import { errorHandler } from './middleware/errorHandler';

export const app: Express = express();

// Security
app.use(helmet());
app.use(cors({ origin: env.corsOrigin }));

// Body parsing
app.use(express.json({ limit: '32kb' }));

// Routes
app.use('/api', apiRouter);

// Error handling
app.use(errorHandler);
