import type { BaseEntity } from './common';

export interface Wallet extends BaseEntity {
  agentId: string;
  balance: number;
  dailyEarned: number;
  dailyEarnedCap: number;
  dailyResetAt: string;
  lifetimeEarned: number;
  lifetimeSpent: number;
}

export type TransactionType = 'reward' | 'purchase' | 'fee' | 'transfer' | 'auction' | 'trade' | 'hack';

export interface Transaction extends BaseEntity {
  fromAgentId?: string;
  toAgentId?: string;
  type: TransactionType;
  amount: number;
  fee: number;
  reason: string;
  refId?: string;
  meta?: Record<string, unknown>;
}

export interface TransferRequest {
  toAgentId: string;
  amount: number;
  memo?: string;
}
