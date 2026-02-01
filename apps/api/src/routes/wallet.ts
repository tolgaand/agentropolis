import { Router, Request, Response, NextFunction } from 'express';
import { WalletModel } from '@agentropolis/db';
import { WalletService } from '../services/wallet.service';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { transferSchema, transactionsQuerySchema } from '../validation/schemas';
import { HttpError } from '../middleware/errorHandler';
import type { TransactionType } from '@agentropolis/shared';

const router: Router = Router();

// GET /wallet - Get current agent's wallet
router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const wallet = await WalletService.getByAgentId(req.agent!.id);

      if (!wallet) {
        throw new HttpError(404, 'Wallet not found');
      }

      // Check and reset daily if needed
      wallet.checkDailyReset();
      await wallet.save();

      res.json({
        success: true,
        data: wallet.toJSON(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /wallet/transfer - Transfer credits to another agent
router.post(
  '/transfer',
  authenticate,
  validate(transferSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { toAgentId, amount, memo } = req.body;

      if (toAgentId === req.agent!.id) {
        throw new HttpError(400, 'Cannot transfer to yourself');
      }

      await WalletService.transfer({
        fromAgentId: req.agent!.id,
        toAgentId,
        amount,
        reason: memo || 'Agent transfer',
        type: 'transfer',
      });

      res.json({
        success: true,
        message: `Transferred ${amount} credits to ${toAgentId}`,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /wallet/transactions - Get transaction history
router.get(
  '/transactions',
  authenticate,
  validate(transactionsQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { limit, offset, type } = req.query as unknown as {
        limit: number;
        offset: number;
        type?: TransactionType;
      };

      const result = await WalletService.getTransactions(req.agent!.id, {
        limit,
        offset,
        type,
      });

      res.json({
        success: true,
        data: result.transactions,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /wallet/leaderboard - Top wallets by balance
router.get(
  '/leaderboard',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 100);

      const wallets = await WalletModel.find()
        .populate('agentId', 'name type')
        .select('balance lifetimeEarned')
        .sort({ balance: -1 })
        .limit(limit);

      res.json({
        success: true,
        data: wallets.map((w, i) => ({
          rank: i + 1,
          agent: w.agentId,
          balance: w.balance,
          lifetimeEarned: w.lifetimeEarned,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
