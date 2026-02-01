import { Router, Request, Response, NextFunction } from 'express';
import { BuildingModel } from '@agentropolis/db';
import { WalletService } from '../services/wallet.service';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createBuildingSchema, updateBuildingSchema, buildingsQuerySchema } from '../validation/schemas';
import { HttpError } from '../middleware/errorHandler';
import { BUILDING_CONFIGS, SPRITE_RANGES } from '@agentropolis/shared';

const router: Router = Router();

// Building costs by type (base cost in credits)
const BUILDING_COSTS: Record<string, number> = {
  farm: 70,
  lumberyard: 70,
  quarry: 50,
  iron_mine: 70,
  market: 120,
  barracks: 170,
  stable: 130,
  watchtower: 70,
  wall: 180,
  castle: 400,
  academy: 180,
};

// Select appropriate sprite based on building type
function selectSpriteId(type: string): number {
  const ranges = SPRITE_RANGES[type];
  if (!ranges || ranges.length === 0) {
    return 25; // Default fallback
  }

  // Select random sprite from available ranges
  const randomRangeIndex = Math.floor(Math.random() * ranges.length);
  const range = ranges[randomRangeIndex];

  if (typeof range === 'number') {
    return range;
  }

  // Range is [start, end]
  return Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
}

// POST /buildings - Create building
router.post(
  '/',
  authenticate,
  validate(createBuildingSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { parcelId, worldId, type, name, coords, spriteId: requestedSpriteId } = req.body;
      const ownerId = req.agent!.id;

      // Check if coordinates are already occupied in this parcel
      const existingBuilding = await BuildingModel.findOne({
        parcelId,
        'coords.x': coords.x,
        'coords.y': coords.y,
      });

      if (existingBuilding) {
        throw new HttpError(409, 'Coordinates already occupied');
      }

      // Determine building cost
      const cost = BUILDING_COSTS[type] || 100;

      // Charge for building
      await WalletService.purchase(ownerId, cost, `Building construction: ${type}`, parcelId);

      // Determine sprite ID
      const spriteId = requestedSpriteId ?? selectSpriteId(type);

      // Get default stats from config
      const config = BUILDING_CONFIGS[type];
      const defaultStats = config?.defaultStats || {};

      // Create building
      const building = new BuildingModel({
        parcelId,
        worldId,
        ownerId,
        type,
        name,
        coords,
        spriteId,
        stats: defaultStats,
      });
      await building.save();

      res.status(201).json({
        success: true,
        data: building.toJSON(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /buildings - List buildings
router.get(
  '/',
  validate(buildingsQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { limit, offset, parcelId, worldId, type } = req.query as unknown as {
        limit: number;
        offset: number;
        parcelId?: string;
        worldId?: string;
        type?: string;
      };

      const query: Record<string, unknown> = {};
      if (parcelId) query.parcelId = parcelId;
      if (worldId) query.worldId = worldId;
      if (type) query.type = type;

      const [buildings, total] = await Promise.all([
        BuildingModel.find(query)
          .populate('ownerId', 'name type')
          .sort({ level: -1, createdAt: -1 })
          .skip(offset)
          .limit(limit),
        BuildingModel.countDocuments(query),
      ]);

      res.json({
        success: true,
        data: buildings,
        pagination: { total, limit, offset },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /buildings/:id - Get building details
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const building = await BuildingModel.findById(req.params.id)
        .populate('ownerId', 'name type');

      if (!building) {
        throw new HttpError(404, 'Building not found');
      }

      res.json({
        success: true,
        data: building.toJSON(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /buildings/:id - Update building
router.patch(
  '/:id',
  authenticate,
  validate(updateBuildingSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const building = await BuildingModel.findById(req.params.id);

      if (!building) {
        throw new HttpError(404, 'Building not found');
      }

      if (building.ownerId.toString() !== req.agent!.id) {
        throw new HttpError(403, 'Not authorized to update this building');
      }

      const { name, stats } = req.body;

      if (name) building.name = name;
      if (stats) {
        building.stats = { ...building.stats, ...stats };
      }

      await building.save();

      res.json({
        success: true,
        data: building.toJSON(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /buildings/:id/upgrade - Upgrade building level
router.post(
  '/:id/upgrade',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const building = await BuildingModel.findById(req.params.id);

      if (!building) {
        throw new HttpError(404, 'Building not found');
      }

      if (building.ownerId.toString() !== req.agent!.id) {
        throw new HttpError(403, 'Not authorized to upgrade this building');
      }

      if (building.level >= 5) {
        throw new HttpError(400, 'Building already at maximum level');
      }

      // Upgrade cost increases with level
      const upgradeCost = (BUILDING_COSTS[building.type] || 100) * building.level;

      await WalletService.purchase(
        req.agent!.id,
        upgradeCost,
        `Building upgrade: ${building.type} to level ${building.level + 1}`,
        building._id.toString()
      );

      building.level += 1;

      // Boost stats on upgrade
      if (building.stats.capacity) {
        building.stats.capacity = Math.floor(building.stats.capacity * 1.2);
      }

      await building.save();

      res.json({
        success: true,
        data: building.toJSON(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /buildings/:id - Demolish building
router.delete(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const building = await BuildingModel.findById(req.params.id);

      if (!building) {
        throw new HttpError(404, 'Building not found');
      }

      if (building.ownerId.toString() !== req.agent!.id) {
        throw new HttpError(403, 'Not authorized to demolish this building');
      }

      // Refund 25% of original cost
      const refund = Math.floor((BUILDING_COSTS[building.type] || 100) * 0.25);
      await WalletService.reward({
        agentId: req.agent!.id,
        amount: refund,
        reason: 'Building demolition refund',
        refId: building._id.toString(),
      });

      await building.deleteOne();

      res.json({
        success: true,
        message: 'Building demolished',
        refund,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
