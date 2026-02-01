/**
 * Map API Routes
 *
 * Note: Spectators receive map data via sockets, not HTTP.
 * These endpoints are for debugging and agent API access.
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { mapState } from '../game/map/state';

const router: RouterType = Router();

/**
 * GET /api/map
 * Returns the current city map data
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: mapState.getMapData(),
    error: null,
  });
});

/**
 * GET /api/map/parcels
 * Returns all parcels
 */
router.get('/parcels', (_req: Request, res: Response) => {
  const mapData = mapState.getMapData();

  res.json({
    success: true,
    data: mapData.parcels,
    error: null,
  });
});

/**
 * GET /api/map/parcels/:parcelId
 * Returns a specific parcel
 */
router.get('/parcels/:parcelId', (req: Request, res: Response) => {
  const parcel = mapState.getParcel(req.params.parcelId);

  if (!parcel) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: 'PARCEL_NOT_FOUND', message: 'Parcel not found' },
    });
    return;
  }

  res.json({
    success: true,
    data: parcel,
    error: null,
  });
});

/**
 * GET /api/map/objects
 * Returns all map objects
 */
router.get('/objects', (_req: Request, res: Response) => {
  const mapData = mapState.getMapData();

  res.json({
    success: true,
    data: mapData.objects,
    error: null,
  });
});

/**
 * GET /api/map/roads
 * Returns road network
 */
router.get('/roads', (_req: Request, res: Response) => {
  const mapData = mapState.getMapData();

  res.json({
    success: true,
    data: mapData.roads,
    error: null,
  });
});

/**
 * POST /api/map/reset
 * Resets the map (admin/development only)
 */
router.post('/reset', (_req: Request, res: Response) => {
  mapState.reset();

  res.json({
    success: true,
    data: { message: 'Map reset' },
    error: null,
  });
});

export default router;
