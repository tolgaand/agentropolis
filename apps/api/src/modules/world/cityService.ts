/**
 * CityService — Bootstrap and manage city state
 *
 * Ensures a city record exists in MongoDB on startup.
 * No tick/economy logic.
 */

import { CityState, type ICityState } from './models/CityState';

const DEFAULT_CITY_ID = 'city-001';
const DEFAULT_SEED = 42;
const DEFAULT_ACTIVE_RADIUS = 3;

/**
 * Ensure a city exists in the database. Creates one if missing.
 * Uses upsert with $setOnInsert so existing cities are never overwritten.
 */
export async function ensureCity(
  cityId: string = DEFAULT_CITY_ID,
  defaults?: { seed?: number; activeRadiusChunks?: number },
): Promise<ICityState> {
  const doc = await CityState.findOneAndUpdate(
    { cityId },
    {
      $setOnInsert: {
        cityId,
        seed: defaults?.seed ?? DEFAULT_SEED,
        activeRadiusChunks: defaults?.activeRadiusChunks ?? DEFAULT_ACTIVE_RADIUS,
      },
    },
    { upsert: true, new: true, lean: true },
  );

  return doc as ICityState;
}

/**
 * Get city state by ID. Returns null if not found.
 */
export async function getCityState(cityId: string = DEFAULT_CITY_ID): Promise<ICityState | null> {
  return CityState.findOne({ cityId }).lean();
}
