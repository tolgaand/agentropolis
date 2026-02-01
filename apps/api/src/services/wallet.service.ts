import { WalletModel, TransactionModel, AgentModel, type WalletDocument } from '@agentropolis/db';
import type { TransactionType } from '@agentropolis/shared';
import { HttpError } from '../middleware/errorHandler';

const PLATFORM_FEE_RATE = 0.02; // 2% platform fee on transfers

interface TransferParams {
  fromAgentId: string;
  toAgentId: string;
  amount: number;
  reason: string;
  type?: TransactionType;
  refId?: string;
  meta?: Record<string, unknown>;
}

interface RewardParams {
  agentId: string;
  amount: number;
  reason: string;
  refId?: string;
  meta?: Record<string, unknown>;
}

export class WalletService {
  // Create wallet for new agent
  static async createWallet(agentId: string): Promise<WalletDocument> {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);

    const wallet = new WalletModel({
      agentId,
      dailyResetAt: tomorrow.toISOString(),
    });

    return wallet.save();
  }

  // Get wallet by agent ID
  static async getByAgentId(agentId: string): Promise<WalletDocument | null> {
    return WalletModel.findOne({ agentId });
  }

  // Transfer credits between agents
  static async transfer(params: TransferParams): Promise<void> {
    const { fromAgentId, toAgentId, amount, reason, type = 'transfer', refId, meta } = params;

    if (amount <= 0) {
      throw new HttpError(400, 'Amount must be positive');
    }

    const fee = Math.floor(amount * PLATFORM_FEE_RATE);
    const netAmount = amount - fee;

    // Get both wallets
    const [fromWallet, toWallet] = await Promise.all([
      WalletModel.findOne({ agentId: fromAgentId }),
      WalletModel.findOne({ agentId: toAgentId }),
    ]);

    if (!fromWallet) {
      throw new HttpError(404, 'Sender wallet not found');
    }
    if (!toWallet) {
      throw new HttpError(404, 'Recipient wallet not found');
    }

    if (fromWallet.balance < amount) {
      throw new HttpError(400, 'Insufficient balance');
    }

    // Update balances
    fromWallet.balance -= amount;
    fromWallet.lifetimeSpent += amount;

    toWallet.balance += netAmount;
    toWallet.lifetimeEarned += netAmount;

    await fromWallet.save();
    await toWallet.save();

    await AgentModel.updateOne(
      { _id: fromAgentId },
      { $set: { walletBalance: fromWallet.balance } }
    );
    await AgentModel.updateOne(
      { _id: toAgentId },
      { $set: { walletBalance: toWallet.balance } }
    );

    // Record transaction
    await new TransactionModel({
      fromAgentId,
      toAgentId,
      type,
      amount,
      fee,
      reason,
      refId,
      meta,
    }).save();
  }

  // Reward agent (system-issued credits)
  static async reward(params: RewardParams): Promise<void> {
    const { agentId, amount, reason, refId, meta } = params;

    if (amount <= 0) {
      throw new HttpError(400, 'Amount must be positive');
    }

    const wallet = await WalletModel.findOne({ agentId });
    if (!wallet) {
      throw new HttpError(404, 'Wallet not found');
    }

    // Check daily limit
    wallet.checkDailyReset();
    if (wallet.dailyEarned + amount > wallet.dailyEarnedCap) {
      throw new HttpError(400, 'Daily earning limit reached');
    }

    // Update wallet
    wallet.balance += amount;
    wallet.dailyEarned += amount;
    wallet.lifetimeEarned += amount;
    await wallet.save();
    await AgentModel.updateOne({ _id: agentId }, { $set: { walletBalance: wallet.balance } });

    // Record transaction
    await new TransactionModel({
      toAgentId: agentId,
      type: 'reward',
      amount,
      fee: 0,
      reason,
      refId,
      meta,
    }).save();
  }

  // Deduct for purchase (system takes credits)
  static async purchase(agentId: string, amount: number, reason: string, refId?: string): Promise<void> {
    if (amount <= 0) {
      throw new HttpError(400, 'Amount must be positive');
    }

    const wallet = await WalletModel.findOne({ agentId });
    if (!wallet) {
      throw new HttpError(404, 'Wallet not found');
    }

    if (wallet.balance < amount) {
      throw new HttpError(400, 'Insufficient balance');
    }

    wallet.balance -= amount;
    wallet.lifetimeSpent += amount;
    await wallet.save();
    await AgentModel.updateOne({ _id: agentId }, { $set: { walletBalance: wallet.balance } });

    await new TransactionModel({
      fromAgentId: agentId,
      type: 'purchase',
      amount,
      fee: 0,
      reason,
      refId,
    }).save();
  }

  // Get transaction history
  static async getTransactions(
    agentId: string,
    options: { limit?: number; offset?: number; type?: TransactionType }
  ) {
    const { limit = 20, offset = 0, type } = options;

    const query: Record<string, unknown> = {
      $or: [{ fromAgentId: agentId }, { toAgentId: agentId }],
    };

    if (type) {
      query.type = type;
    }

    const [transactions, total] = await Promise.all([
      TransactionModel.find(query)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit),
      TransactionModel.countDocuments(query),
    ]);

    return { transactions, total, limit, offset };
  }
}
