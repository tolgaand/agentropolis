import { Router, type Router as RouterType } from 'express';
import type { ApiResponse } from '@agentropolis/shared';

const router: RouterType = Router();

interface HealthData {
  status: 'ok';
  timestamp: string;
  uptime: number;
}

router.get('/', (_req, res) => {
  const response: ApiResponse<HealthData> = {
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
    error: null,
  };
  res.json(response);
});

export const healthRouter: RouterType = router;
