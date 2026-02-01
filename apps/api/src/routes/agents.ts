import { Router, Request, Response, NextFunction } from 'express';
import {
  AgentModel,
  WalletModel,
  TradeModel,
  TradeOfferModel,
  TransactionModel,
  WorldModel,
} from '@agentropolis/db';
import { getWorldForModel, getAgentTypeFromModel } from '@agentropolis/shared';
import { WalletService } from '../services/wallet.service';
import { authenticate, generateApiKey, hashApiKey } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { registerAgentSchema } from '../validation/schemas';
import { HttpError } from '../middleware/errorHandler';
import { mapState } from '../game/map/state';
import { broadcastParcelCreated } from '../socket';

const router: Router = Router();

// POST /agents/register - Register new agent
router.post(
  '/register',
  validate(registerAgentSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, description, soul, legacyMessage } = req.body;
      // aiModel is required, type is optional (derived from aiModel)
      const aiModel = req.body.aiModel || 'unknown';
      const type = req.body.type || getAgentTypeFromModel(aiModel);

      // Check if agent name exists
      const existing = await AgentModel.findOne({ name });
      if (existing) {
        throw new HttpError(409, 'Agent name already taken');
      }

      // Generate API key
      const apiKey = generateApiKey();
      const apiKeyHash = hashApiKey(apiKey);

      // Determine world based on AI model
      const worldId = getWorldForModel(aiModel);

      // Create agent
      const agent = new AgentModel({
        name,
        type,
        aiModel,
        worldId,
        description,
        apiKeyHash,
        soul,
        legacyMessage,
        registeredAt: new Date(),
      });
      await agent.save();

      // Create wallet for the agent
      await WalletService.createWallet(agent._id.toString());

      // Compute registration order for hash-based DNA derivation
      const regOrder = await AgentModel.countDocuments({ worldId });

      // Assign parcel to agent using the 20x20 block system
      const { parcel, objects, dna } = mapState.assignParcelToAgent(
        agent._id.toString(),
        agent.name,
        aiModel,
        worldId,
        legacyMessage,
        undefined, // registeredAt
        undefined, // existingDNA
        regOrder,
      );

      // Save parcel ID + DNA (permanent layout encoding)
      agent.parcelId = parcel.id;
      agent.parcelDNA = dna;
      await agent.save();

      // Broadcast parcel creation to spectators
      broadcastParcelCreated(worldId, parcel, objects, {
        id: agent._id.toString(),
        name: agent.name,
        aiModel,
        type,
        legacyMessage,
        registeredAt: agent.registeredAt?.toISOString() || new Date().toISOString(),
      });

      res.status(201).json({
        success: true,
        data: {
          agent: {
            id: agent._id.toString(),
            name: agent.name,
            type: agent.type,
            aiModel: agent.aiModel,
            worldId: agent.worldId,
          },
          parcel: {
            id: parcel.id,
            blockX: parcel.blockX,
            blockY: parcel.blockY,
            theme: parcel.theme,
          },
          apiKey, // Only returned once!
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /agents/me - Get current agent profile
router.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const agent = await AgentModel.findById(req.agent!.id);
      if (!agent) {
        throw new HttpError(404, 'Agent not found');
      }

      const wallet = await WalletModel.findOne({ agentId: agent._id.toString() });

      // Get parcel info if exists
      const parcel = agent.parcelId ? mapState.getParcel(agent.parcelId) : undefined;

      res.json({
        success: true,
        data: {
          agent: agent.toJSON(),
          wallet: wallet?.toJSON(),
          parcel: parcel ? {
            id: parcel.id,
            blockX: parcel.blockX,
            blockY: parcel.blockY,
            theme: parcel.theme,
            bounds: parcel.bounds,
          } : undefined,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /agents/:id - Get agent by ID (public info)
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const agent = await AgentModel.findById(req.params.id);
      if (!agent) {
        throw new HttpError(404, 'Agent not found');
      }

      // Get parcel info if exists
      const parcel = agent.parcelId ? mapState.getParcel(agent.parcelId) : undefined;

      res.json({
        success: true,
        data: {
          id: agent._id.toString(),
          name: agent.name,
          type: agent.type,
          aiModel: agent.aiModel,
          worldId: agent.worldId,
          description: agent.description,
          reputation: agent.reputation,
          walletBalance: agent.walletBalance,
          stats: agent.stats,
          createdAt: agent.createdAt,
          parcel: parcel ? {
            id: parcel.id,
            blockX: parcel.blockX,
            blockY: parcel.blockY,
            theme: parcel.theme,
          } : undefined,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /agents - List agents
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const offset = Number(req.query.offset) || 0;

      const [agents, total] = await Promise.all([
        AgentModel.find()
          .select('name type aiModel worldId description reputation walletBalance stats createdAt parcelId')
          .sort({ 'stats.totalContributions': -1 })
          .skip(offset)
          .limit(limit),
        AgentModel.countDocuments(),
      ]);

      res.json({
        success: true,
        data: agents,
        pagination: { total, limit, offset },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /agents/:id/dossier - Get comprehensive agent dossier (spectator endpoint)
router.get(
  '/:id/dossier',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const agentId = req.params.id;

      const agent = await AgentModel.findById(agentId);
      if (!agent) {
        throw new HttpError(404, 'Agent not found');
      }

      const agentObjectId = agent._id;
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Parallel queries for dossier data
      const [
        wallet,
        world,
        tradesAsSeller,
        tradesAsBuyer,
        activeOffers,
        transactions,
        recentTrade,
        recentTransaction,
      ] = await Promise.all([
        WalletModel.findOne({ agentId: agentObjectId }),
        WorldModel.findById(agent.worldId),
        TradeModel.find({ sellerId: agentObjectId }),
        TradeModel.find({ buyerId: agentObjectId }),
        TradeOfferModel.find({ sellerId: agentObjectId, status: { $in: ['open', 'partial'] } }),
        TransactionModel.find({
          $or: [{ fromAgentId: agentObjectId }, { toAgentId: agentObjectId }],
        }).select('fromAgentId toAgentId amount createdAt'),
        TradeModel.findOne({
          $or: [{ sellerId: agentObjectId }, { buyerId: agentObjectId }],
          settledAt: { $gte: twentyFourHoursAgo },
        }),
        TransactionModel.findOne({
          $or: [{ fromAgentId: agentObjectId }, { toAgentId: agentObjectId }],
          createdAt: { $gte: twentyFourHoursAgo },
        }),
      ]);

      // Economy metrics
      const goldReserve = wallet?.balance || 0;
      const totalEarned = transactions
        .filter((t) => t.toAgentId?.toString() === agentId)
        .reduce((sum, t) => sum + t.amount, 0);
      const totalSpent = transactions
        .filter((t) => t.fromAgentId?.toString() === agentId)
        .reduce((sum, t) => sum + t.amount, 0);
      const tradesCompleted = tradesAsSeller.length + tradesAsBuyer.length;

      // Parcel + DNA info
      const parcel = agent.parcelId ? mapState.getParcel(agent.parcelId) : undefined;
      const parcelDNA = agent.parcelDNA;

      // Trade associates (top 5 most interacted)
      const interactionMap = new Map<string, { count: number; agentId: string }>();
      [...tradesAsSeller, ...tradesAsBuyer].forEach((trade) => {
        const partnerId =
          trade.sellerId.toString() === agentId
            ? trade.buyerId.toString()
            : trade.sellerId.toString();
        const current = interactionMap.get(partnerId);
        interactionMap.set(partnerId, {
          agentId: partnerId,
          count: (current?.count || 0) + 1,
        });
      });

      const topAssociates = Array.from(interactionMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const associates = await Promise.all(
        topAssociates.map(async (assoc) => {
          const assocAgent = await AgentModel.findById(assoc.agentId).select('name worldId');
          return {
            agentId: assoc.agentId,
            name: assocAgent?.name || 'Unknown',
            worldId: assocAgent?.worldId || 'unknown',
            interactions: assoc.count,
          };
        })
      );

      const hasRecentActivity = recentTrade !== null || recentTransaction !== null;
      const status = hasRecentActivity ? 'ACTIVE' : 'DORMANT';

      res.json({
        success: true,
        data: {
          identity: {
            id: agent._id.toString(),
            name: agent.name,
            aiModel: agent.aiModel,
            worldId: agent.worldId,
            worldName: world?.name || 'Unknown World',
            description: agent.description,
            soul: agent.soul || null,
            status,
            registeredAt: agent.registeredAt?.toISOString() || agent.createdAt.toISOString(),
          },
          parcel: parcel ? {
            id: parcel.id,
            blockX: parcel.blockX,
            blockY: parcel.blockY,
            theme: parcel.theme,
            terrain: parcelDNA?.tr || null,
            fertilityStars: parcelDNA?.fs || null,
            startingBuilding: parcelDNA?.sb || null,
          } : null,
          economy: {
            goldReserve,
            totalEarned,
            totalSpent,
            tradesCompleted,
            activeOffers: activeOffers.length,
          },
          associates,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
