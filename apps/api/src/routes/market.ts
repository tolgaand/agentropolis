import { Router, Request, Response, NextFunction } from 'express';
import { TradeOfferModel, TradeModel, ResourceModel, WorldModel, AgentModel, WalletModel } from '@agentropolis/db';
import { authenticate } from '../middleware/auth';
import { HttpError } from '../middleware/errorHandler';
import { getResourcePrice } from '../redis/cache';
import { SOCKET_EVENTS } from '@agentropolis/shared';
import type { ResourceId, WorldId, ResourceSoldEvent } from '@agentropolis/shared';
import { getIO } from '../socket';
import { mapState } from '../game/map/state';

const router: Router = Router();

// GET /market - List all open offers
router.get(
  '/',
  async (req, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;
      const resourceId = req.query.resourceId as string | undefined;

      const query: Record<string, unknown> = {
        status: { $in: ['open', 'partial'] },
        expiresAt: { $gt: new Date() },
      };

      if (resourceId) query.resourceId = resourceId;

      const [offers, total] = await Promise.all([
        TradeOfferModel.find(query)
          .populate('sellerId', 'name aiModel worldId')
          .sort({ pricePerUnit: 1 })
          .skip(offset)
          .limit(limit),
        TradeOfferModel.countDocuments(query),
      ]);

      res.json({
        success: true,
        data: offers,
        pagination: { total, limit, offset },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /market/prices - Current global price table for all resources
router.get(
  '/prices',
  async (_req, res: Response, next: NextFunction): Promise<void> => {
    try {
      const resources = await ResourceModel.find();

      // Get average prices from recent trades
      const recentTrades = await TradeModel.aggregate([
        {
          $match: {
            settledAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: '$resourceId',
            avgPrice: { $avg: '$pricePerUnit' },
            volume: { $sum: '$quantity' },
            tradeCount: { $sum: 1 },
          },
        },
      ]);

      // Get lowest ask prices from open offers
      const lowestAsks = await TradeOfferModel.aggregate([
        {
          $match: {
            status: { $in: ['open', 'partial'] },
            expiresAt: { $gt: new Date() },
          },
        },
        {
          $group: {
            _id: '$resourceId',
            lowestAsk: { $min: '$pricePerUnit' },
            totalAvailable: { $sum: '$remainingQuantity' },
          },
        },
      ]);

      // Build global price table
      const prices: Record<
        string,
        {
          resource: { id: string; name: string; tier: number; baseValue: number };
          avgPrice: number;
          lowestAsk: number;
          volume24h: number;
          available: number;
        }
      > = {};

      for (const resource of resources) {
        const tradeData = recentTrades.find((t) => t._id === resource.id);
        const askData = lowestAsks.find((a) => a._id === resource.id);

        prices[resource.id] = {
          resource: {
            id: resource.id,
            name: resource.name,
            tier: resource.tier,
            baseValue: resource.baseValue,
          },
          avgPrice: tradeData?.avgPrice ?? resource.baseValue,
          lowestAsk: askData?.lowestAsk ?? 0,
          volume24h: tradeData?.volume ?? 0,
          available: askData?.totalAvailable ?? 0,
        };
      }

      res.json({
        success: true,
        data: prices,
        updatedAt: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /market/history - Recent trades (public)
router.get(
  '/history',
  async (req, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;
      const resourceId = req.query.resourceId as string | undefined;

      const query: Record<string, unknown> = {};
      if (resourceId) query.resourceId = resourceId;

      const [trades, total] = await Promise.all([
        TradeModel.find(query)
          .populate('sellerId', 'name')
          .populate('buyerId', 'name')
          .sort({ settledAt: -1 })
          .skip(offset)
          .limit(limit),
        TradeModel.countDocuments(query),
      ]);

      res.json({
        success: true,
        data: trades,
        pagination: { total, limit, offset },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /market/stats - Market statistics
router.get(
  '/stats',
  async (_req, res: Response, next: NextFunction): Promise<void> => {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Aggregate trade stats
      const [tradeStats, offerStats, worldStats] = await Promise.all([
        TradeModel.aggregate([
          { $match: { settledAt: { $gte: oneDayAgo } } },
          {
            $group: {
              _id: null,
              totalVolume: { $sum: '$quantity' },
              totalValue: { $sum: '$totalPrice' },
              tradeCount: { $sum: 1 },
              avgTradeSize: { $avg: '$quantity' },
            },
          },
        ]),
        TradeOfferModel.aggregate([
          {
            $match: {
              status: { $in: ['open', 'partial'] },
              expiresAt: { $gt: now },
            },
          },
          {
            $group: {
              _id: null,
              openOffers: { $sum: 1 },
              totalAvailable: { $sum: '$remainingQuantity' },
            },
          },
        ]),
        WorldModel.find().select('_id name gdp population tradeBalance'),
      ]);

      res.json({
        success: true,
        data: {
          last24h: {
            volume: tradeStats[0]?.totalVolume ?? 0,
            value: tradeStats[0]?.totalValue ?? 0,
            trades: tradeStats[0]?.tradeCount ?? 0,
            avgTradeSize: tradeStats[0]?.avgTradeSize ?? 0,
          },
          market: {
            openOffers: offerStats[0]?.openOffers ?? 0,
            totalAvailable: offerStats[0]?.totalAvailable ?? 0,
          },
          worlds: worldStats.map((w) => ({
            id: w.id,
            name: w.name,
            gdp: w.gdp,
            population: w.population,
            tradeBalance: w.tradeBalance,
          })),
          updatedAt: now,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /market/sell - Sell resources from inventory at current market price
router.post(
  '/sell',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const agentId = req.agent!.id;
      const { resourceId, quantity } = req.body;

      if (!resourceId || typeof resourceId !== 'string') {
        throw new HttpError(400, 'resourceId is required');
      }
      if (!quantity || typeof quantity !== 'number' || quantity <= 0 || !Number.isInteger(quantity)) {
        throw new HttpError(400, 'quantity must be a positive integer');
      }

      // Verify resource exists
      const resource = await ResourceModel.findById(resourceId);
      if (!resource) {
        throw new HttpError(404, `Resource '${resourceId}' not found`);
      }

      // Get agent and check inventory
      const agent = await AgentModel.findById(agentId);
      if (!agent) {
        throw new HttpError(404, 'Agent not found');
      }

      const currentStock = agent.inventory instanceof Map
        ? (agent.inventory.get(resourceId) ?? 0)
        : ((agent.inventory as Record<string, number>)?.[resourceId] ?? 0);

      if (currentStock < quantity) {
        throw new HttpError(400, `Insufficient ${resourceId} in inventory. Have ${currentStock}, need ${quantity}`);
      }

      // Get current market price from Redis cache (falls back to base value)
      const priceData = await getResourcePrice(resourceId as ResourceId);
      const unitPrice = priceData?.price ?? resource.baseValue;
      const totalCredits = Math.floor(quantity * unitPrice);

      if (totalCredits <= 0) {
        throw new HttpError(400, 'Sale value too low');
      }

      // Deduct from inventory
      if (agent.inventory instanceof Map) {
        agent.inventory.set(resourceId, currentStock - quantity);
      } else {
        (agent.inventory as Record<string, number>)[resourceId] = currentStock - quantity;
      }
      await agent.save();

      // Add credits to wallet
      const wallet = await WalletModel.findOne({ agentId });
      if (!wallet) {
        throw new HttpError(404, 'Wallet not found');
      }
      wallet.balance += totalCredits;
      wallet.lifetimeEarned += totalCredits;
      await wallet.save();
      await AgentModel.updateOne({ _id: agentId }, { $set: { walletBalance: wallet.balance } });

      // Broadcast resource sold event for visual feedback
      const io = getIO();
      if (io) {
        const parcels = mapState.getParcelsForAgent(agentId);
        const firstParcel = parcels[0];
        const soldEvent: ResourceSoldEvent = {
          agentId,
          agentName: agent.name,
          worldId: agent.worldId as WorldId,
          parcelId: firstParcel?.id,
          blockX: firstParcel?.blockX,
          blockY: firstParcel?.blockY,
          resourceId,
          quantity,
          unitPrice,
          totalCredits,
        };
        io.to('game:map').emit(SOCKET_EVENTS.RESOURCE_SOLD as 'market.resource.sold', soldEvent);
        io.to('multiverse').emit(SOCKET_EVENTS.RESOURCE_SOLD as 'market.resource.sold', soldEvent);
      }

      res.json({
        success: true,
        data: {
          resourceId,
          quantitySold: quantity,
          unitPrice,
          totalCredits,
          newBalance: wallet.balance,
          remainingStock: currentStock - quantity,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
