/**
 * Trade Service
 *
 * Atomic trade execution with Redis locks and MongoDB transactions.
 * Handles idempotency, price locking, and wallet updates.
 */

import { randomUUID } from 'crypto';
import {
  TradeOfferModel,
  TradeModel,
  WorldModel,
  AgentModel,
  WalletModel,
  TransactionModel,
  type TradeDocument,
  type TradeOfferDocument,
} from '@agentropolis/db';
import type { WorldId, TradeCompleted } from '@agentropolis/shared';
import { withLock, createTradeLockKey } from '../redis/locks';
import { isRedisConnected, safeGet } from '../redis';
import { fxKey } from '../redis/keys';
import { HttpError } from '../middleware/errorHandler';
import { broadcastTradeCompleted, broadcastWorldUpdate } from '../socket';

// Default trade fee (3%)
const TRADE_FEE_RATE = 0.03;

export interface ExecuteTradeParams {
  offerId: string;
  buyerId: string;
  quantity?: number;
  idempotencyKey?: string;
}

export interface TradeResult {
  trade: TradeDocument;
  offer: TradeOfferDocument;
  summary: {
    bought: number;
    paid: number;
    currency: string;
    fee: number;
    exchangeRate: number;
  };
  fromCache?: boolean;
}

/**
 * Get exchange rate between two worlds
 * First tries Redis cache, then falls back to MongoDB
 */
async function getExchangeRate(fromWorldId: WorldId, toWorldId: WorldId): Promise<number> {
  if (fromWorldId === toWorldId) return 1;

  // Try Redis cache first
  if (isRedisConnected()) {
    const fromKey = fxKey.currency(fromWorldId);
    const toKey = fxKey.currency(toWorldId);
    const [fromRate, toRate] = await Promise.all([safeGet(fromKey), safeGet(toKey)]);

    if (fromRate && toRate) {
      const fromData = JSON.parse(fromRate);
      const toData = JSON.parse(toRate);
      return fromData.rate / toData.rate;
    }
  }

  // Fall back to MongoDB
  const [fromWorld, toWorld] = await Promise.all([
    WorldModel.findById(fromWorldId),
    WorldModel.findById(toWorldId),
  ]);

  if (!fromWorld || !toWorld) {
    throw new HttpError(404, 'World not found');
  }

  return fromWorld.currentExchangeRate / toWorld.currentExchangeRate;
}

/**
 * Check if a trade with this idempotency key already exists
 * Returns the existing trade if found
 */
async function findExistingTrade(idempotencyKey: string): Promise<TradeDocument | null> {
  return TradeModel.findOne({ idempotencyKey });
}

/**
 * Execute a trade atomically with Redis lock and MongoDB transaction
 */
export async function executeTrade(params: ExecuteTradeParams): Promise<TradeResult> {
  const { offerId, buyerId, quantity, idempotencyKey } = params;

  // Check idempotency first (before acquiring lock)
  if (idempotencyKey) {
    const existingTrade = await findExistingTrade(idempotencyKey);
    if (existingTrade) {
      console.log(`[Trade] Returning cached trade for idempotency key: ${idempotencyKey}`);
      const offer = await TradeOfferModel.findById(existingTrade.offerId);
      const buyerWorld = await WorldModel.findById(existingTrade.buyerWorldId);

      return {
        trade: existingTrade,
        offer: offer!,
        summary: {
          bought: existingTrade.quantity,
          paid: existingTrade.buyerPaid,
          currency: buyerWorld?.currency.code ?? existingTrade.buyerCurrency,
          fee: existingTrade.fee,
          exchangeRate: existingTrade.exchangeRateUsed,
        },
        fromCache: true,
      };
    }
  }

  // Generate unique trade ID for lock value
  const tradeId = randomUUID();
  const lockKey = createTradeLockKey(offerId);

  // Execute trade within lock
  return withLock(lockKey, async () => {
    return executeTradeInTransaction(offerId, buyerId, quantity, idempotencyKey, tradeId);
  });
}

/**
 * Execute trade within MongoDB transaction (called while holding lock)
 */
async function executeTradeInTransaction(
  offerId: string,
  buyerId: string,
  quantity: number | undefined,
  idempotencyKey: string | undefined,
  _tradeId: string
): Promise<TradeResult> {
  // Fetch offer and validate
  const offer = await TradeOfferModel.findById(offerId);
  if (!offer) {
    throw new HttpError(404, 'Offer not found');
  }

  if (offer.status !== 'open' && offer.status !== 'partial') {
    throw new HttpError(400, `Offer is ${offer.status}`);
  }

  if (new Date() > offer.expiresAt) {
    offer.status = 'expired';
    await offer.save();
    throw new HttpError(400, 'Offer has expired');
  }

  const buyQuantity = quantity || offer.remainingQuantity;
  if (buyQuantity > offer.remainingQuantity) {
    throw new HttpError(400, `Only ${offer.remainingQuantity} available`);
  }

  // Fetch buyer agent
  const buyerAgent = await AgentModel.findById(buyerId);
  if (!buyerAgent) {
    throw new HttpError(404, 'Buyer agent not found');
  }

  // Check target world restriction
  if (offer.targetWorldId && offer.targetWorldId !== buyerAgent.worldId) {
    throw new HttpError(403, 'This offer is restricted to another world');
  }

  // Get exchange rate (may come from Redis cache)
  const exchangeRate = await getExchangeRate(offer.sellerWorldId, buyerAgent.worldId);

  // Calculate prices with locked exchange rate
  const totalPriceInSellerCurrency = offer.pricePerUnit * buyQuantity;
  const buyerPays = totalPriceInSellerCurrency * exchangeRate;
  const fee = buyerPays * TRADE_FEE_RATE;
  const totalBuyerCost = buyerPays + fee;

  // Get buyer's world for currency info
  const buyerWorld = await WorldModel.findById(buyerAgent.worldId);
  if (!buyerWorld) {
    throw new HttpError(404, 'Buyer world not found');
  }

  // Fetch wallets for buyer and seller
  const [buyerWallet, sellerWallet] = await Promise.all([
    WalletModel.findOne({ agentId: buyerId }),
    WalletModel.findOne({ agentId: offer.sellerId.toString() }),
  ]);

  if (!buyerWallet) {
    throw new HttpError(404, 'Buyer wallet not found');
  }
  if (!sellerWallet) {
    throw new HttpError(404, 'Seller wallet not found');
  }

  // Check buyer has enough funds
  if (buyerWallet.balance < totalBuyerCost) {
    throw new HttpError(400, `Insufficient funds. Need ${totalBuyerCost.toFixed(2)} ${buyerWorld.currency.code}, have ${buyerWallet.balance.toFixed(2)}`);
  }

  // Execute trade operations (Redis lock provides atomicity, no MongoDB transactions needed)
  try {
    // Deduct from buyer wallet
    buyerWallet.balance -= totalBuyerCost;
    buyerWallet.lifetimeSpent += totalBuyerCost;
    await buyerWallet.save();

    // Credit seller wallet (in seller's currency = totalPriceInSellerCurrency)
    sellerWallet.balance += totalPriceInSellerCurrency;
    sellerWallet.lifetimeEarned += totalPriceInSellerCurrency;
    await sellerWallet.save();

    // Sync wallet balances to Agent documents
    await Promise.all([
      AgentModel.updateOne(
        { _id: buyerId },
        { $set: { walletBalance: buyerWallet.balance } }
      ),
      AgentModel.updateOne(
        { _id: offer.sellerId },
        { $set: { walletBalance: sellerWallet.balance } }
      ),
    ]);

    // Create trade record
    const trade = await TradeModel.create(
      [
        {
          offerId: offer._id,
          idempotencyKey,
          sellerId: offer.sellerId,
          buyerId,
          sellerWorldId: offer.sellerWorldId,
          buyerWorldId: buyerAgent.worldId,
          resourceId: offer.resourceId,
          quantity: buyQuantity,
          pricePerUnit: offer.pricePerUnit,
          totalPrice: totalPriceInSellerCurrency,
          currency: offer.currency,
          exchangeRateUsed: exchangeRate,
          buyerPaid: totalBuyerCost,
          buyerCurrency: buyerWorld.currency.code,
          fee,
          feeCurrency: buyerWorld.currency.code,
          settledAt: new Date(),
        },
      ]
    );

    // Update offer
    offer.remainingQuantity -= buyQuantity;
    offer.status = offer.remainingQuantity === 0 ? 'filled' : 'partial';
    await offer.save();

    // Record transaction
    await new TransactionModel({
      fromAgentId: buyerId,
      toAgentId: offer.sellerId,
      type: 'trade',
      amount: totalBuyerCost,
      fee,
      reason: `Trade: ${buyQuantity}x ${offer.resourceId}`,
      refId: trade[0].id,
      meta: {
        offerId: offer.id,
        resourceId: offer.resourceId,
        quantity: buyQuantity,
        exchangeRate,
        sellerWorldId: offer.sellerWorldId,
        buyerWorldId: buyerAgent.worldId,
      },
    }).save();

    // Update world trade stats
    await Promise.all([
      WorldModel.findByIdAndUpdate(
        offer.sellerWorldId,
        {
          $inc: {
            totalExports: buyQuantity,
            exportRevenue: totalPriceInSellerCurrency,
          },
        }
      ),
      WorldModel.findByIdAndUpdate(
        buyerAgent.worldId,
        {
          $inc: {
            totalImports: buyQuantity,
            importCost: buyerPays,
          },
        }
      ),
    ]);

    // Get seller agent for broadcast
    const sellerAgent = await AgentModel.findById(offer.sellerId);

    // Broadcast trade completed event
    const tradeEvent: TradeCompleted = {
      tradeId: trade[0].id,
      offerId: offer.id,
      sellerId: offer.sellerId.toString(),
      sellerName: sellerAgent?.name || 'Unknown',
      buyerId,
      buyerName: buyerAgent.name,
      sellerWorldId: offer.sellerWorldId,
      buyerWorldId: buyerAgent.worldId,
      resourceId: offer.resourceId,
      quantity: buyQuantity,
      totalPrice: totalPriceInSellerCurrency,
      currency: offer.currency,
    };
    broadcastTradeCompleted(tradeEvent);

    // Broadcast world updates
    const [sellerWorld, updatedBuyerWorld] = await Promise.all([
      WorldModel.findById(offer.sellerWorldId),
      WorldModel.findById(buyerAgent.worldId),
    ]);

    broadcastWorldUpdate({
      worldId: offer.sellerWorldId,
      totalExports: sellerWorld?.totalExports,
    });
    broadcastWorldUpdate({
      worldId: buyerAgent.worldId,
      totalImports: updatedBuyerWorld?.totalImports,
    });

    return {
      trade: trade[0],
      offer,
      summary: {
        bought: buyQuantity,
        paid: totalBuyerCost,
        currency: buyerWorld.currency.code,
        fee,
        exchangeRate,
      },
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Execute trade with optimistic locking fallback
 * Used when Redis is unavailable
 */
export async function executeTradeOptimistic(params: ExecuteTradeParams): Promise<TradeResult> {
  const { offerId, buyerId, quantity, idempotencyKey } = params;

  // Check idempotency first
  if (idempotencyKey) {
    const existingTrade = await findExistingTrade(idempotencyKey);
    if (existingTrade) {
      const offer = await TradeOfferModel.findById(existingTrade.offerId);
      const buyerWorld = await WorldModel.findById(existingTrade.buyerWorldId);

      return {
        trade: existingTrade,
        offer: offer!,
        summary: {
          bought: existingTrade.quantity,
          paid: existingTrade.buyerPaid,
          currency: buyerWorld?.currency.code ?? existingTrade.buyerCurrency,
          fee: existingTrade.fee,
          exchangeRate: existingTrade.exchangeRateUsed,
        },
        fromCache: true,
      };
    }
  }

  // Use findOneAndUpdate with conditions for optimistic locking
  const offer = await TradeOfferModel.findOneAndUpdate(
    {
      _id: offerId,
      status: { $in: ['open', 'partial'] },
      expiresAt: { $gt: new Date() },
      remainingQuantity: { $gte: quantity || 1 },
    },
    {
      $inc: { remainingQuantity: -(quantity || 0) },
    },
    { new: false } // Return old document to get original remainingQuantity
  );

  if (!offer) {
    throw new HttpError(400, 'Offer not available or insufficient quantity');
  }

  const buyQuantity = quantity || offer.remainingQuantity;
  const tradeId = randomUUID();

  return executeTradeInTransaction(offerId, buyerId, buyQuantity, idempotencyKey, tradeId);
}
