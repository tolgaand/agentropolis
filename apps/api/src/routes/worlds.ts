import { Router, Request, Response, NextFunction } from 'express';
import { WorldModel, AgentModel, ResourceModel } from '@agentropolis/db';
import type { WorldId } from '@agentropolis/shared';
import { HttpError } from '../middleware/errorHandler';
import { mapState } from '../game/map/state';
import { timeServer } from '../time/TimeServer';

const router: Router = Router();

// GET /worlds - List all worlds with summary stats
router.get(
  '/',
  async (_req, res: Response, next: NextFunction): Promise<void> => {
    try {
      const worlds = await WorldModel.find().sort({ population: -1 });

      res.json({
        success: true,
        data: worlds,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /worlds/map - Full map state (parcels, objects, time) for agents without socket
router.get(
  '/map',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const mapData = mapState.getFullMapData();
      const timeState = timeServer.getState();

      res.json({
        success: true,
        data: {
          parcels: mapData.parcels.map(p => ({
            id: p.id,
            agentId: p.agentId,
            agentName: p.agentName,
            worldId: p.worldId,
            blockX: p.blockX,
            blockY: p.blockY,
            bounds: p.bounds,
            theme: p.theme,
            terrain: p.terrain,
            fertilityStars: p.fertilityStars,
          })),
          objects: mapData.objects.map(o => ({
            id: o.id,
            type: o.type,
            gridX: o.gridX,
            gridY: o.gridY,
            buildingType: o.buildingType,
            name: o.name,
            ownerId: o.ownerId,
            parcelId: o.parcelId,
            level: o.level,
          })),
          totalParcels: mapData.parcels.length,
          totalObjects: mapData.objects.length,
          time: {
            dayIndex: timeState.dayIndex,
            minuteOfDay: timeState.minuteOfDay,
            phase: timeState.phase,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /worlds/map/parcel/:blockX/:blockY - Get specific parcel details
router.get(
  '/map/parcel/:blockX/:blockY',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const blockX = parseInt(req.params.blockX, 10);
      const blockY = parseInt(req.params.blockY, 10);

      if (isNaN(blockX) || isNaN(blockY)) {
        throw new HttpError(400, 'blockX and blockY must be integers');
      }

      const parcel = mapState.getParcelByBlock(blockX, blockY);
      if (!parcel) {
        throw new HttpError(404, 'No parcel at this block position');
      }

      // Get objects in this parcel
      const mapData = mapState.getFullMapData();
      const parcelObjects = mapData.objects.filter(o => o.parcelId === parcel.id);

      res.json({
        success: true,
        data: {
          parcel: {
            id: parcel.id,
            agentId: parcel.agentId,
            agentName: parcel.agentName,
            worldId: parcel.worldId,
            blockX: parcel.blockX,
            blockY: parcel.blockY,
            bounds: parcel.bounds,
            theme: parcel.theme,
            terrain: parcel.terrain,
            fertilityStars: parcel.fertilityStars,
            registeredAt: parcel.registeredAt,
            legacyMessage: parcel.legacyMessage,
          },
          objects: parcelObjects.map(o => ({
            id: o.id,
            type: o.type,
            gridX: o.gridX,
            gridY: o.gridY,
            buildingType: o.buildingType,
            name: o.name,
            level: o.level,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /worlds/time - Current game time state
router.get(
  '/time',
  (_req: Request, res: Response): void => {
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
    });
  }
);

// GET /worlds/:id - Get world details
router.get(
  '/:id',
  async (req, res: Response, next: NextFunction): Promise<void> => {
    try {
      const world = await WorldModel.findById(req.params.id as WorldId);

      if (!world) {
        throw new HttpError(404, 'World not found');
      }

      res.json({
        success: true,
        data: world,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /worlds/:id/agents - Get agents in a world
router.get(
  '/:id/agents',
  async (req, res: Response, next: NextFunction): Promise<void> => {
    try {
      const worldId = req.params.id as WorldId;
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const offset = Number(req.query.offset) || 0;

      const world = await WorldModel.findById(worldId);
      if (!world) {
        throw new HttpError(404, 'World not found');
      }

      const agents = await AgentModel.find({ worldId })
        .sort({ reputation: -1 })
        .skip(offset)
        .limit(limit)
        .select('name type aiModel reputation stats registeredAt');

      const total = await AgentModel.countDocuments({ worldId });

      res.json({
        success: true,
        data: {
          world: { id: world.id, name: world.name, currency: world.currency },
          agents,
          pagination: { total, limit, offset },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /worlds/:id/economy - Get world economy details
router.get(
  '/:id/economy',
  async (req, res: Response, next: NextFunction): Promise<void> => {
    try {
      const worldId = req.params.id as WorldId;

      const world = await WorldModel.findById(worldId);
      if (!world) {
        throw new HttpError(404, 'World not found');
      }

      res.json({
        success: true,
        data: {
          worldId: world.id,
          name: world.name,
          currency: world.currency,
          economy: {
            gdp: world.gdp,
            gdpPerCapita: world.gdpPerCapita,
            population: world.population,
            tradeBalance: world.tradeBalance,
            prosperityIndex: world.prosperityIndex,
          },
          trade: {
            totalExports: world.totalExports,
            totalImports: world.totalImports,
            exportRevenue: world.exportRevenue,
            importCost: world.importCost,
          },
          exchangeRate: {
            base: world.baseExchangeRate,
            current: world.currentExchangeRate,
            volatility: world.currencyVolatility,
          },
          inventory: world.inventory,
          productionRates: world.productionRates,
          demand: world.demand,
          lastTickAt: world.lastTickAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /worlds/:id/resources - Get resource production/consumption in a world
router.get(
  '/:id/resources',
  async (req, res: Response, next: NextFunction): Promise<void> => {
    try {
      const worldId = req.params.id as WorldId;

      const world = await WorldModel.findById(worldId);
      if (!world) {
        throw new HttpError(404, 'World not found');
      }

      // Get all resources with their world affinity
      const resources = await ResourceModel.find();

      // Map resources with world-specific production bonuses
      const worldResources = resources.map((resource) => {
        const affinity = resource.worldAffinity.get(worldId) ?? 1.0;
        const inventory = world.inventory.get(resource.id) ?? 0;
        const productionRate = world.productionRates.get(resource.id) ?? 0;
        const demand = world.demand.get(resource.id) ?? 0;

        return {
          id: resource.id,
          name: resource.name,
          category: resource.category,
          tier: resource.tier,
          baseValue: resource.baseValue,
          affinity,
          inventory,
          productionRate,
          demand,
          effectiveProduction: productionRate * affinity,
        };
      });

      res.json({
        success: true,
        data: {
          worldId: world.id,
          name: world.name,
          passiveBonus: world.passiveBonus,
          resources: worldResources,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
