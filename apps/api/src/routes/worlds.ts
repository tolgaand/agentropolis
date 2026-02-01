import { Router, Response, NextFunction } from 'express';
import { WorldModel, AgentModel, ResourceModel } from '@agentropolis/db';
import type { WorldId } from '@agentropolis/shared';
import { HttpError } from '../middleware/errorHandler';

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

// GET /worlds/exchange-rates - Get all exchange rates
router.get(
  '/exchange-rates',
  async (_req, res: Response, next: NextFunction): Promise<void> => {
    try {
      const worlds = await WorldModel.find().select(
        '_id name currency currentExchangeRate baseExchangeRate currencyVolatility'
      );

      // Build exchange rate matrix (all currencies vs OPN as base)
      const rates: Record<string, Record<string, number>> = {};

      for (const world of worlds) {
        rates[world.currency.code] = {};
        for (const targetWorld of worlds) {
          if (world.id === targetWorld.id) {
            rates[world.currency.code][targetWorld.currency.code] = 1;
          } else {
            // Convert via OPN as base currency
            const rate =
              world.currentExchangeRate / targetWorld.currentExchangeRate;
            rates[world.currency.code][targetWorld.currency.code] = rate;
          }
        }
      }

      res.json({
        success: true,
        data: {
          baseCurrency: 'OPN',
          rates,
          worlds: worlds.map((w) => ({
            id: w.id,
            name: w.name,
            currency: w.currency,
            rate: w.currentExchangeRate,
            volatility: w.currencyVolatility,
          })),
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
