import { Router, Response, NextFunction } from 'express';
import { TradeOfferModel, TradeModel, WorldModel, ResourceModel } from '@agentropolis/db';
import type { WorldId } from '@agentropolis/shared';

const router: Router = Router();

// GET /market - List all open offers
router.get(
  '/',
  async (req, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;
      const resourceId = req.query.resourceId as string | undefined;
      const worldId = req.query.worldId as WorldId | undefined;

      const query: Record<string, unknown> = {
        status: { $in: ['open', 'partial'] },
        expiresAt: { $gt: new Date() },
      };

      if (resourceId) query.resourceId = resourceId;
      if (worldId) query.sellerWorldId = worldId;

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

// GET /market/prices - Current price table for all resources
router.get(
  '/prices',
  async (_req, res: Response, next: NextFunction): Promise<void> => {
    try {
      const resources = await ResourceModel.find();
      const worlds = await WorldModel.find();

      // Get average prices from recent trades
      const recentTrades = await TradeModel.aggregate([
        {
          $match: {
            settledAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: { resourceId: '$resourceId', worldId: '$sellerWorldId' },
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
            _id: { resourceId: '$resourceId', worldId: '$sellerWorldId' },
            lowestAsk: { $min: '$pricePerUnit' },
            totalAvailable: { $sum: '$remainingQuantity' },
          },
        },
      ]);

      // Build price matrix
      const prices: Record<
        string,
        {
          resource: { id: string; name: string; tier: number; baseValue: number };
          byWorld: Record<
            string,
            { avgPrice: number; lowestAsk: number; volume24h: number; available: number }
          >;
        }
      > = {};

      for (const resource of resources) {
        prices[resource.id] = {
          resource: {
            id: resource.id,
            name: resource.name,
            tier: resource.tier,
            baseValue: resource.baseValue,
          },
          byWorld: {},
        };

        for (const world of worlds) {
          const tradeData = recentTrades.find(
            (t) => t._id.resourceId === resource.id && t._id.worldId === world.id
          );
          const askData = lowestAsks.find(
            (a) => a._id.resourceId === resource.id && a._id.worldId === world.id
          );

          prices[resource.id].byWorld[world.id] = {
            avgPrice: tradeData?.avgPrice ?? resource.baseValue,
            lowestAsk: askData?.lowestAsk ?? 0,
            volume24h: tradeData?.volume ?? 0,
            available: askData?.totalAvailable ?? 0,
          };
        }
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

// GET /market/exchange - Exchange rates between all currencies
router.get(
  '/exchange',
  async (_req, res: Response, next: NextFunction): Promise<void> => {
    try {
      const worlds = await WorldModel.find().select(
        '_id name currency currentExchangeRate baseExchangeRate currencyVolatility'
      );

      // Build exchange rate matrix
      const rates: Record<string, Record<string, number>> = {};

      for (const fromWorld of worlds) {
        rates[fromWorld.currency.code] = {};
        for (const toWorld of worlds) {
          if (fromWorld.id === toWorld.id) {
            rates[fromWorld.currency.code][toWorld.currency.code] = 1;
          } else {
            // Convert via OPN as base currency
            const rate =
              fromWorld.currentExchangeRate / toWorld.currentExchangeRate;
            rates[fromWorld.currency.code][toWorld.currency.code] =
              Math.round(rate * 10000) / 10000;
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

export default router;
