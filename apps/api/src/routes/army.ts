import { Router, Request, Response, NextFunction } from 'express';
import { ArmyModel, AgentModel } from '@agentropolis/db';
import { authenticate } from '../middleware/auth';
import { HttpError } from '../middleware/errorHandler';
import { UNIT_COSTS, UNIT_STATS, type ArmyUnit } from '@agentropolis/shared';
import { mapState } from '../game/map/state';

const router: Router = Router();

/**
 * POST /army/spawn - Spawn units at agent's barracks
 * Body: { agentId, unitType: 'infantry'|'cavalry'|'siege', count: number }
 */
router.post(
  '/spawn',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { unitType, count } = req.body;
      const agentId = req.agent!.id;

      // Validate input
      if (!unitType || !['infantry', 'cavalry', 'siege'].includes(unitType)) {
        throw new HttpError(400, 'Invalid unit type. Must be infantry, cavalry, or siege');
      }

      if (!count || count < 1 || count > 100) {
        throw new HttpError(400, 'Invalid count. Must be between 1 and 100');
      }

      // Get agent
      const agent = await AgentModel.findById(agentId);
      if (!agent) {
        throw new HttpError(404, 'Agent not found');
      }

      // Get agent's parcel for position
      const parcel = agent.parcelId ? mapState.getParcel(agent.parcelId) : undefined;
      if (!parcel) {
        throw new HttpError(400, 'Agent must have a parcel to spawn units');
      }

      // Calculate total resource cost
      const unitCost = UNIT_COSTS[unitType as keyof ArmyUnit];
      const totalCost = {
        food: unitCost.food * count,
        wood: unitCost.wood * count,
        stone: unitCost.stone * count,
        iron: unitCost.iron * count,
        crn: unitCost.crn * count,
      };

      // Check if agent has enough resources
      const inventory = agent.inventory instanceof Map
        ? Object.fromEntries(agent.inventory)
        : (agent.inventory || {});

      for (const [resource, cost] of Object.entries(totalCost)) {
        const available = (inventory as Record<string, number>)[resource] || 0;
        if (available < cost) {
          throw new HttpError(400, `Insufficient ${resource}. Need ${cost}, have ${available}`);
        }
      }

      // Deduct resources from agent inventory
      for (const [resource, cost] of Object.entries(totalCost)) {
        const current = agent.inventory.get(resource) || 0;
        agent.inventory.set(resource, current - cost);
      }
      await agent.save();

      // Find or create army at agent's parcel position
      let army = await ArmyModel.findOne({
        ownerId: agentId,
        'position.x': parcel.blockX,
        'position.y': parcel.blockY,
        state: 'idle',
      });

      if (army) {
        // Add units to existing army
        army.units[unitType as keyof ArmyUnit] += count;
      } else {
        // Create new army
        const armyId = `army_${agentId}_${Date.now()}`;
        army = new ArmyModel({
          _id: armyId,
          ownerId: agentId,
          factionId: agent.factionId || agent.worldId,
          units: {
            infantry: unitType === 'infantry' ? count : 0,
            cavalry: unitType === 'cavalry' ? count : 0,
            siege: unitType === 'siege' ? count : 0,
          },
          position: {
            x: parcel.blockX,
            y: parcel.blockY,
          },
          state: 'idle',
          warFatigue: 0,
        });
      }

      // Recalculate total attack and defense
      army.totalAttack =
        army.units.infantry * UNIT_STATS.infantry.attack +
        army.units.cavalry * UNIT_STATS.cavalry.attack +
        army.units.siege * UNIT_STATS.siege.attack;

      army.totalDefense =
        army.units.infantry * UNIT_STATS.infantry.defense +
        army.units.cavalry * UNIT_STATS.cavalry.defense +
        army.units.siege * UNIT_STATS.siege.defense;

      await army.save();

      res.status(201).json({
        success: true,
        data: {
          army: army.toJSON(),
          costPaid: totalCost,
          remainingInventory: Object.fromEntries(agent.inventory),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /army/march - Send army to target location
 * Body: { armyId, targetX, targetY }
 */
router.post(
  '/march',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { armyId, targetX, targetY } = req.body;
      const agentId = req.agent!.id;

      // Validate input
      if (!armyId || targetX === undefined || targetY === undefined) {
        throw new HttpError(400, 'Missing required fields: armyId, targetX, targetY');
      }

      // Get army
      const army = await ArmyModel.findById(armyId);
      if (!army) {
        throw new HttpError(404, 'Army not found');
      }

      // Verify ownership
      if (army.ownerId !== agentId) {
        throw new HttpError(403, 'Not authorized to command this army');
      }

      // Check if army is already marching
      if (army.state !== 'idle') {
        throw new HttpError(400, `Army is currently ${army.state}, cannot march`);
      }

      // Calculate travel time using Manhattan distance
      const distance = Math.abs(targetX - army.position.x) + Math.abs(targetY - army.position.y);

      // Calculate army speed (weighted average based on unit composition)
      const totalUnits = army.units.infantry + army.units.cavalry + army.units.siege;
      if (totalUnits === 0) {
        throw new HttpError(400, 'Army has no units');
      }

      const avgSpeed = (
        army.units.infantry * UNIT_STATS.infantry.speed +
        army.units.cavalry * UNIT_STATS.cavalry.speed +
        army.units.siege * UNIT_STATS.siege.speed
      ) / totalUnits;

      // Travel time in hours (simplified, not accounting for terrain)
      const travelHours = Math.max(1, distance / avgSpeed);

      // Set departure and ETA
      const departedAt = new Date();
      const estimatedArrival = new Date(departedAt.getTime() + travelHours * 60 * 60 * 1000);

      // Update army state
      army.state = 'marching';
      army.target = { x: targetX, y: targetY };
      army.departedAt = departedAt;
      army.estimatedArrival = estimatedArrival;

      // Set march tracking fields
      army.marchStartPosition = { x: army.position.x, y: army.position.y };
      army.marchProgress = 0;
      army.marchSpeed = avgSpeed;

      // Set home position if not already set
      if (!army.homePosition) {
        army.homePosition = { x: army.position.x, y: army.position.y };
      }

      // Mark home city as defenseless
      army.isHomeCityDefenseless = true;
      army.canRecall = true;
      army.recallRequested = false;

      await army.save();

      res.json({
        success: true,
        data: {
          army: army.toJSON(),
          marchDetails: {
            from: army.position,
            to: { x: targetX, y: targetY },
            distance,
            speed: avgSpeed,
            travelHours: Math.round(travelHours * 10) / 10,
            departedAt,
            estimatedArrival,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /army/:agentId - Get all armies owned by an agent
 */
router.get(
  '/:agentId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { agentId } = req.params;

      const armies = await ArmyModel.find({ ownerId: agentId }).sort({ createdAt: -1 });

      res.json({
        success: true,
        data: armies.map(a => a.toJSON()),
        count: armies.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /army/marching - Get all currently marching armies (for map animation)
 */
router.get(
  '/marching',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const marchingArmies = await ArmyModel.find({ state: 'marching' }).sort({ estimatedArrival: 1 });

      res.json({
        success: true,
        data: marchingArmies.map(a => a.toJSON()),
        count: marchingArmies.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /army/recall - Recall a marching army back to home city
 * Body: { armyId }
 */
router.post(
  '/recall',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { armyId } = req.body;
      const agentId = req.agent!.id;

      if (!armyId) {
        throw new HttpError(400, 'Missing required field: armyId');
      }

      const army = await ArmyModel.findById(armyId);
      if (!army) {
        throw new HttpError(404, 'Army not found');
      }

      // Verify ownership
      if (army.ownerId !== agentId) {
        throw new HttpError(403, 'Not authorized to command this army');
      }

      // Check if army can be recalled
      if (army.state !== 'marching') {
        throw new HttpError(400, `Army is ${army.state}, can only recall marching armies`);
      }

      if (!army.canRecall) {
        throw new HttpError(400, 'Army cannot be recalled at this time');
      }

      // Set recall flag - the job will process it
      army.recallRequested = true;
      await army.save();

      res.json({
        success: true,
        message: 'Recall request submitted. Army will return to home city.',
        data: army.toJSON(),
      });
    } catch (error) {
      next(error);
    }
  }
);

export const armyRouter = router;
