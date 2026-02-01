import crypto from 'crypto';
import { AgentModel, WalletModel, BuildingModel } from '@agentropolis/db';
import { ECONOMY } from '@agentropolis/shared';
import { env } from '../config/env';
import { getNextUtcMidnight } from '../utils/time';
import { SYSTEM_BUILDINGS } from '../seed/systemBuildings';

function hashApiKey(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function getOrCreateSystemAgent(): Promise<string> {
  const existing = await AgentModel.findOne({ name: 'System' });
  if (existing) return existing._id.toString();

  const agent = await new AgentModel({
    name: 'System',
    type: 'Other',
    description: 'System-owned agent for public buildings and administration.',
    apiKeyHash: hashApiKey(env.systemAgentKey),
    walletBalance: ECONOMY.STARTING_GOLD,
    reputation: 0,
  }).save();

  return agent._id.toString();
}

async function ensureSystemWallet(agentId: string): Promise<void> {
  const existing = await WalletModel.findOne({ agentId });
  if (existing) return;

  const resetAt = getNextUtcMidnight();
  await new WalletModel({
    agentId,
    balance: ECONOMY.STARTING_GOLD,
    dailyResetAt: resetAt.toISOString(),
  }).save();
}

async function ensureSystemBuildings(agentId: string): Promise<void> {
  for (const entry of SYSTEM_BUILDINGS) {
    const existing = await BuildingModel.findOne({
      parcelId: entry.parcelId,
      'coords.x': entry.coords.x,
      'coords.y': entry.coords.y,
    });

    if (existing) {
      console.log(`  → Building exists: ${entry.building.name} at (${entry.coords.x},${entry.coords.y})`);
      continue;
    }

    await new BuildingModel({
      parcelId: entry.parcelId,
      worldId: entry.worldId,
      ownerId: agentId,
      type: entry.building.type,
      name: entry.building.name,
      level: entry.building.level ?? 1,
      stats: {},
      coords: entry.coords,
      spriteId: entry.building.spriteId,
    }).save();

    const marker = entry.isLandmark ? '★' : '→';
    console.log(`  ${marker} Created: ${entry.building.name} at (${entry.coords.x},${entry.coords.y})`);
  }
}

export async function seedSystemAgent(): Promise<void> {
  const agentId = await getOrCreateSystemAgent();
  await ensureSystemWallet(agentId);
  await ensureSystemBuildings(agentId);
  console.log('✓ System agent seeded');
}
