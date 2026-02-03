/**
 * City Routes — Public city state + metrics + events
 */

import { Router } from 'express';
import { CityModel, AgentModel, BuildingModel, EventModel } from '@agentropolis/db';
import { CITY_ID } from '@agentropolis/shared';
import { getLastMetrics } from '../modules/tick';

const router: ReturnType<typeof Router> = Router();

// ---- GET /api/city — City overview ----
router.get('/', async (_req, res) => {
  const city = await CityModel.findOne({ cityId: CITY_ID }).lean();
  if (!city) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'City not found' } });
    return;
  }

  const [agentCount, buildingCount] = await Promise.all([
    AgentModel.countDocuments({ cityId: CITY_ID }),
    BuildingModel.countDocuments({ cityId: CITY_ID }),
  ]);

  res.json({
    cityId: city.cityId,
    name: city.name,
    tickCount: city.tickCount,
    season: city.season,
    economy: city.economy,
    buildingCount,
    agentCount,
  });
});

// ---- GET /api/city/metrics — Live city metrics (from last tick) ----
router.get('/metrics', (_req, res) => {
  const metrics = getLastMetrics();
  if (!metrics) {
    res.status(503).json({ success: false, error: { code: 'NOT_FOUND', message: 'No metrics yet — wait for first tick' } });
    return;
  }
  res.json(metrics);
});

// ---- GET /api/city/events — Recent game events ----
router.get('/events', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const sinceTickParam = req.query.sinceTick;
  const typeParam = req.query.type;

  const filter: Record<string, unknown> = { cityId: CITY_ID };
  if (sinceTickParam !== undefined) {
    filter.tick = { $gte: Number(sinceTickParam) };
  }
  if (typeParam) {
    filter.type = typeParam;
  }

  const events = await EventModel.find(filter)
    .sort({ tick: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  res.json({
    events: events.map((e) => ({
      id: e._id.toString(),
      type: e.type,
      description: e.description,
      severity: e.severity,
      resolved: e.resolved,
      tick: e.tick,
      createdAt: (e as unknown as { createdAt?: string }).createdAt,
    })),
    count: events.length,
  });
});

export default router;
