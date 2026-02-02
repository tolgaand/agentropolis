import { Router, Response, NextFunction } from 'express';
import { WorldModel, AgentModel } from '@agentropolis/db';
import type { WorldId } from '@agentropolis/shared';
import { HttpError } from '../middleware/errorHandler';

const router: Router = Router();

/**
 * GET /api/factions - List all factions with stats
 * V2: Factions are backed by World model (worlds = factions in single-world architecture)
 */
router.get(
  '/',
  async (_req, res: Response, next: NextFunction): Promise<void> => {
    try {
      const worlds = await WorldModel.find().sort({ population: -1 });

      // Get agent counts per faction
      const factionStats = await Promise.all(
        worlds.map(async (world) => {
          const agentCount = await AgentModel.countDocuments({ worldId: world.id });

          return {
            id: world.id,
            name: world.name,
            tagline: world.tagline,
            color: world.currency.code, // Use currency code as color identifier
            population: world.population,
            territoryCount: agentCount, // Number of parcels = agent count
            power: world.gdp, // Power based on GDP
            prosperityIndex: world.prosperityIndex,
            currency: world.currency,
            aesthetic: world.aesthetic || 'default',
          };
        })
      );

      res.json({
        success: true,
        data: factionStats,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/factions/:id - Get faction detail
 * Returns detailed faction information including economy, resources, and agents
 */
router.get(
  '/:id',
  async (req, res: Response, next: NextFunction): Promise<void> => {
    try {
      const factionId = req.params.id as WorldId;

      const faction = await WorldModel.findById(factionId);
      if (!faction) {
        throw new HttpError(404, 'Faction not found');
      }

      // Get agent count for territory
      const agentCount = await AgentModel.countDocuments({ worldId: factionId });

      res.json({
        success: true,
        data: {
          id: faction.id,
          name: faction.name,
          tagline: faction.tagline,
          description: faction.description,
          color: faction.currency.code,
          currency: faction.currency,
          aesthetic: faction.aesthetic || 'default',
          specializations: faction.specializations,
          stats: {
            population: faction.population,
            territoryCount: agentCount,
            power: faction.gdp,
            gdp: faction.gdp,
            gdpPerCapita: faction.gdpPerCapita,
            prosperityIndex: faction.prosperityIndex,
            tradeBalance: faction.tradeBalance,
          },
          trade: {
            totalExports: faction.totalExports,
            totalImports: faction.totalImports,
            exportRevenue: faction.exportRevenue,
            importCost: faction.importCost,
          },
          passiveBonus: faction.passiveBonus,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
