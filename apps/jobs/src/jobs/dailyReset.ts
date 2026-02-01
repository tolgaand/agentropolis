import { WalletModel } from '@agentropolis/db';
import { getNextUtcMidnight } from '../utils/time';

export async function resetDailyCaps(): Promise<void> {
  const now = new Date();
  const nextReset = getNextUtcMidnight(now).toISOString();

  const result = await WalletModel.updateMany(
    { dailyResetAt: { $lte: now.toISOString() } },
    { $set: { dailyEarned: 0, dailyResetAt: nextReset } }
  );

  if (result.modifiedCount > 0) {
    console.log(`✓ Daily reset applied to ${result.modifiedCount} wallets`);
  }
}
