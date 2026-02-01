import { Router, Request, Response, NextFunction } from 'express';
import { TradeOfferModel, TradeModel, WorldModel, AgentModel } from '@agentropolis/db';
import { authenticate } from '../middleware/auth';
import { HttpError } from '../middleware/errorHandler';
import { executeTrade } from '../services/tradeService';
import { broadcastTradeOfferCreated } from '../socket';
import type { WorldId, ResourceId } from '@agentropolis/shared';

const router: Router = Router();

// Default offer expiry (24 hours)
const DEFAULT_EXPIRY_HOURS = 24;

// POST /trade/offer - Create a sell offer
router.post(
  '/offer',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { resourceId, quantity, pricePerUnit, targetWorldId, expiresInHours } = req.body;
      const agent = req.agent!;

      if (!resourceId || !quantity || !pricePerUnit) {
        throw new HttpError(400, 'resourceId, quantity, and pricePerUnit are required');
      }

      if (quantity <= 0 || pricePerUnit <= 0) {
        throw new HttpError(400, 'quantity and pricePerUnit must be positive');
      }

      // Get agent's world
      const agentDoc = await AgentModel.findById(agent.id);
      if (!agentDoc) {
        throw new HttpError(404, 'Agent not found');
      }

      const world = await WorldModel.findById(agentDoc.worldId);
      if (!world) {
        throw new HttpError(404, 'Agent world not found');
      }

      // TODO: Check agent has enough resources in inventory
      // For now, we'll trust the agent

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + (expiresInHours || DEFAULT_EXPIRY_HOURS));

      const offer = await TradeOfferModel.create({
        sellerId: agent.id,
        sellerWorldId: agentDoc.worldId,
        resourceId,
        quantity,
        remainingQuantity: quantity,
        pricePerUnit,
        currency: world.currency.code,
        targetWorldId: targetWorldId || null,
        status: 'open',
        expiresAt,
      });

      // Broadcast to spectators
      broadcastTradeOfferCreated({
        offerId: offer.id,
        sellerId: agent.id,
        sellerName: agentDoc.name,
        sellerWorldId: agentDoc.worldId as WorldId,
        resourceId: resourceId as ResourceId,
        quantity,
        pricePerUnit,
        currency: world.currency.code,
      });

      res.status(201).json({
        success: true,
        data: offer.toJSON(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /trade/buy - Buy directly from an offer (with atomic locking)
router.post(
  '/buy',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { offerId, quantity, idempotencyKey } = req.body;
      const buyer = req.agent!;

      if (!offerId) {
        throw new HttpError(400, 'offerId is required');
      }

      // Execute trade with Redis lock and idempotency
      const result = await executeTrade({
        offerId,
        buyerId: buyer.id,
        quantity,
        idempotencyKey,
      });

      res.json({
        success: true,
        data: {
          trade: result.trade.toJSON(),
          offer: result.offer.toJSON(),
          summary: result.summary,
        },
        ...(result.fromCache && { cached: true }),
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /trade/accept/:offerId - Accept an offer (alias for buy with offerId in path)
router.post(
  '/accept/:offerId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const offerId = req.params.offerId;
      const { quantity, idempotencyKey } = req.body;
      const buyer = req.agent!;

      // Execute trade with Redis lock and idempotency
      const result = await executeTrade({
        offerId,
        buyerId: buyer.id,
        quantity,
        idempotencyKey,
      });

      res.json({
        success: true,
        data: {
          trade: result.trade.toJSON(),
          offer: result.offer.toJSON(),
          summary: result.summary,
        },
        ...(result.fromCache && { cached: true }),
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /trade/offer/:offerId - Cancel an offer
router.delete(
  '/offer/:offerId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const offer = await TradeOfferModel.findById(req.params.offerId);

      if (!offer) {
        throw new HttpError(404, 'Offer not found');
      }

      if (offer.sellerId.toString() !== req.agent!.id) {
        throw new HttpError(403, 'Not authorized to cancel this offer');
      }

      if (offer.status === 'filled' || offer.status === 'cancelled') {
        throw new HttpError(400, `Cannot cancel ${offer.status} offer`);
      }

      offer.status = 'cancelled';
      await offer.save();

      res.json({
        success: true,
        message: 'Offer cancelled',
        data: offer.toJSON(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /trade/offers - List open offers (for agent)
router.get(
  '/offers',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const offers = await TradeOfferModel.find({
        sellerId: req.agent!.id,
        status: { $in: ['open', 'partial'] },
      }).sort({ createdAt: -1 });

      res.json({
        success: true,
        data: offers,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /trade/history - Trade history for agent
router.get(
  '/history',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const offset = Number(req.query.offset) || 0;

      const trades = await TradeModel.find({
        $or: [{ sellerId: req.agent!.id }, { buyerId: req.agent!.id }],
      })
        .sort({ settledAt: -1 })
        .skip(offset)
        .limit(limit);

      const total = await TradeModel.countDocuments({
        $or: [{ sellerId: req.agent!.id }, { buyerId: req.agent!.id }],
      });

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

export default router;
