/**
 * LedgerService — Double-entry accounting: transfer, mint, sink
 */

import { Types } from 'mongoose';
import { AccountModel, LedgerEntryModel, type ILedgerMeta } from '@agentropolis/db';
import type { TransactionType } from '@agentropolis/shared';

export interface TransferResult {
  ok: boolean;
  reason?: string;
  entryId?: string;
}

/**
 * Transfer funds between two accounts (double-entry).
 * Fails if debit account has insufficient balance.
 */
export async function transfer(
  debitAccountId: Types.ObjectId,
  creditAccountId: Types.ObjectId,
  amount: number,
  type: TransactionType,
  tick: number,
  meta?: ILedgerMeta,
): Promise<TransferResult> {
  if (amount <= 0) return { ok: false, reason: 'amount_must_be_positive' };

  // Atomically decrement debit balance (only if sufficient)
  const debitResult = await AccountModel.findOneAndUpdate(
    { _id: debitAccountId, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    { new: true },
  );

  if (!debitResult) {
    return { ok: false, reason: 'insufficient_funds' };
  }

  // Increment credit balance
  await AccountModel.updateOne(
    { _id: creditAccountId },
    { $inc: { balance: amount } },
  );

  // Create ledger entry
  const entry = await LedgerEntryModel.create({
    debitAccountId,
    creditAccountId,
    amount,
    type,
    tick,
    meta: meta ?? null,
  });

  return { ok: true, entryId: entry._id.toString() };
}

/**
 * Mint money into an account (money creation — NPC revenue).
 * npcPoolAccountId is the debit side (virtual source).
 */
export async function mint(
  npcPoolAccountId: Types.ObjectId,
  creditAccountId: Types.ObjectId,
  amount: number,
  type: TransactionType,
  tick: number,
  meta?: ILedgerMeta,
): Promise<TransferResult> {
  if (amount <= 0) return { ok: false, reason: 'amount_must_be_positive' };

  // Increment credit balance
  await AccountModel.updateOne(
    { _id: creditAccountId },
    { $inc: { balance: amount } },
  );

  // Decrement NPC pool (can go negative — it's a virtual source)
  await AccountModel.updateOne(
    { _id: npcPoolAccountId },
    { $inc: { balance: -amount } },
  );

  const entry = await LedgerEntryModel.create({
    debitAccountId: npcPoolAccountId,
    creditAccountId,
    amount,
    type,
    tick,
    meta: meta ?? null,
  });

  return { ok: true, entryId: entry._id.toString() };
}

/**
 * Sink money from an account (money destruction — import fees).
 * npcPoolAccountId is the credit side (virtual sink).
 */
export async function sink(
  debitAccountId: Types.ObjectId,
  npcPoolAccountId: Types.ObjectId,
  amount: number,
  type: TransactionType,
  tick: number,
  meta?: ILedgerMeta,
): Promise<TransferResult> {
  if (amount <= 0) return { ok: false, reason: 'amount_must_be_positive' };

  const debitResult = await AccountModel.findOneAndUpdate(
    { _id: debitAccountId, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    { new: true },
  );

  if (!debitResult) {
    return { ok: false, reason: 'insufficient_funds' };
  }

  // Credit to NPC pool (reduces its negative balance)
  await AccountModel.updateOne(
    { _id: npcPoolAccountId },
    { $inc: { balance: amount } },
  );

  const entry = await LedgerEntryModel.create({
    debitAccountId,
    creditAccountId: npcPoolAccountId,
    amount,
    type,
    tick,
    meta: meta ?? null,
  });

  return { ok: true, entryId: entry._id.toString() };
}
