/**
 * Bootstrap — Ensure city treasury + NPC pool accounts exist
 *             Drop stale collections from previous game iterations
 */

import mongoose, { Types } from 'mongoose';
import { AccountModel, CityModel } from '@agentropolis/db';
import { CITY_TREASURY_STARTING_BALANCE, CITY_ID } from '@agentropolis/shared';

/** V2 valid collection names (lowercase) */
const VALID_COLLECTIONS = new Set([
  'cities',
  'districts',
  'buildings',
  'agents',
  'accounts',
  'ledgerentries',
  'mapchunks',
  'parcels',
  'events',
  'newsitems',
  'citystates',
]);

export interface BootstrapResult {
  cityId: string;
  treasuryAccountId: Types.ObjectId;
  npcPoolAccountId: Types.ObjectId;
}

/**
 * Ensure a CityModel document exists and has treasury + NPC pool accounts.
 * Called once on server start after DB connect.
 */
export async function bootstrapAccounts(cityName = 'Agentropolis'): Promise<BootstrapResult> {
  // Ensure city document exists (upsert by cityId)
  let city = await CityModel.findOne({ cityId: CITY_ID });
  if (!city) {
    city = await CityModel.create({ cityId: CITY_ID, name: cityName });
    console.log(`[Bootstrap] Created city: ${cityName} (${CITY_ID})`);
  }

  const cityObjectId = city._id as Types.ObjectId;

  // Upsert city treasury account
  const treasury = await AccountModel.findOneAndUpdate(
    { ownerType: 'city', ownerId: cityObjectId },
    {
      $setOnInsert: {
        ownerType: 'city',
        ownerId: cityObjectId,
        balance: CITY_TREASURY_STARTING_BALANCE,
        reserved: 0,
        status: 'active',
      },
    },
    { upsert: true, new: true },
  );

  // Link account to city if not already linked
  if (!city.accountId || city.accountId.toString() !== treasury._id.toString()) {
    await CityModel.updateOne({ _id: cityObjectId }, { accountId: treasury._id });
  }

  // Upsert NPC pool account
  const npcPool = await AccountModel.findOneAndUpdate(
    { ownerType: 'npc_pool', ownerId: cityObjectId },
    {
      $setOnInsert: {
        ownerType: 'npc_pool',
        ownerId: cityObjectId,
        balance: 0,
        reserved: 0,
        status: 'active',
      },
    },
    { upsert: true, new: true },
  );

  console.log(
    `[Bootstrap] Treasury: ${treasury._id} (balance=${treasury.balance}), NPC Pool: ${npcPool._id}`,
  );

  // Clean up stale collections from previous game iterations
  await dropStaleCollections();

  return {
    cityId: CITY_ID,
    treasuryAccountId: treasury._id as Types.ObjectId,
    npcPoolAccountId: npcPool._id as Types.ObjectId,
  };
}

/**
 * Drop MongoDB collections that don't belong to the current V2 schema.
 * Runs once on bootstrap — safe to call multiple times (idempotent).
 */
async function dropStaleCollections(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;

  const collections = await db.listCollections().toArray();
  const stale = collections
    .map((c) => c.name)
    .filter((name) => !VALID_COLLECTIONS.has(name));

  if (stale.length === 0) return;

  for (const name of stale) {
    try {
      await db.dropCollection(name);
      console.log(`[Bootstrap] Dropped stale collection: ${name}`);
    } catch {
      // Collection may not exist or be already dropped — ignore
    }
  }
}
