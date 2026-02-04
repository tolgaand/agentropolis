/**
 * Building Routes — Public building query endpoints
 */

import { Router } from 'express';
import { BuildingModel, CityModel } from '@agentropolis/db';
import { CITY_ID } from '@agentropolis/shared';
import * as worldService from '../modules/world/worldService';

const router: ReturnType<typeof Router> = Router();

/**
 * GET /api/buildings
 * Query params: ?type=coffee_shop, ?chunkX=0&chunkZ=0, ?hiring=true
 */
router.get('/', async (req, res) => {
  const filter: Record<string, unknown> = { cityId: CITY_ID };

  if (req.query.type) {
    filter.type = req.query.type;
  }
  if (req.query.chunkX !== undefined && req.query.chunkZ !== undefined) {
    filter.chunkX = Number(req.query.chunkX);
    filter.chunkZ = Number(req.query.chunkZ);
  }

  const buildings = await BuildingModel.find(filter)
    .select('buildingId type worldX worldZ level ownerId employees maxEmployees chunkX chunkZ status assetKey')
    .lean();

  let result = buildings.map((b) => ({
    buildingId: b._id.toString(),
    type: b.type,
    worldX: b.worldX,
    worldZ: b.worldZ,
    chunkX: b.chunkX,
    chunkZ: b.chunkZ,
    level: b.level,
    status: b.status,
    assetKey: b.assetKey,
    ownerId: b.ownerId?.toString() ?? null,
    employeeCount: b.employees?.length ?? 0,
    maxEmployees: b.maxEmployees,
  }));

  // Filter hiring buildings (active + has vacancy)
  if (req.query.hiring === 'true') {
    result = result.filter((b) => b.status === 'active' && b.maxEmployees > 0 && b.employeeCount < b.maxEmployees);
  }

  res.json({ buildings: result, count: result.length });
});

/**
 * GET /api/buildings/chunks/stats
 * Aggregate-based chunk statistics — real building count, active/closed, lastTouchedTick.
 * Used for economic activity heatmap overlay.
 */
router.get('/chunks/stats', async (_req, res) => {
  const stats = await worldService.getChunkStatsAll(CITY_ID);
  res.json({ chunks: stats, count: stats.length });
});

/**
 * GET /api/buildings/chunks/:chunkX/:chunkZ/debug
 * Debug provenance: shows stub vs real, overridesStub flag per placement.
 * Opt-in endpoint — not in normal payload flow.
 */
router.get('/chunks/:chunkX/:chunkZ/debug', async (req, res) => {
  const chunkX = Number(req.params.chunkX);
  const chunkZ = Number(req.params.chunkZ);
  if (isNaN(chunkX) || isNaN(chunkZ)) {
    res.status(400).json({ error: 'Invalid chunk coordinates' });
    return;
  }

  const city = await CityModel.findOne({ cityId: CITY_ID }).lean();
  const seed = city?.worldSeed ?? 42;

  const payload = await worldService.getChunkPayloadDebug(CITY_ID, chunkX, chunkZ, seed);
  res.json(payload);
});

/**
 * GET /api/buildings/:buildingId
 * Returns single building detail
 */
router.get('/:buildingId', async (req, res) => {
  const building = await BuildingModel.findById(req.params.buildingId)
    .select('buildingId type worldX worldZ level ownerId employees maxEmployees chunkX chunkZ status assetKey income operatingCost')
    .lean();

  if (!building || building.cityId !== CITY_ID) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Building not found' } });
    return;
  }

  res.json({
    buildingId: building._id.toString(),
    type: building.type,
    worldX: building.worldX,
    worldZ: building.worldZ,
    chunkX: building.chunkX,
    chunkZ: building.chunkZ,
    level: building.level,
    status: building.status,
    assetKey: building.assetKey,
    ownerId: building.ownerId?.toString() ?? null,
    employeeCount: building.employees?.length ?? 0,
    maxEmployees: building.maxEmployees,
    income: building.income,
    operatingCost: building.operatingCost,
  });
});

export default router;
