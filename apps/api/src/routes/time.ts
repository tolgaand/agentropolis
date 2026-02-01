/**
 * Time API Routes
 * Provides current server time state
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { timeServer } from '../time/TimeServer';

const router: RouterType = Router();

/**
 * GET /api/time
 * Returns the current server time state
 */
router.get('/', (_req: Request, res: Response) => {
  const state = timeServer.getState();
  const timeDisplay = timeServer.getTimeDisplay();

  res.json({
    success: true,
    data: {
      dayIndex: state.dayIndex,
      minuteOfDay: state.minuteOfDay,
      phase: state.phase,
      hourDisplay: timeDisplay,
    },
    error: null,
  });
});

export default router;
