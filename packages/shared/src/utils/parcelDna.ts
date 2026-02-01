/**
 * Parcel DNA System
 *
 * Agent-as-Blockhash: Each agent registration expands the map like a blockchain block.
 * Uses djb2 hash to derive terrain, fertility, and starting building deterministically.
 *
 * Hash input: "${worldId}|${agentId}|${agentName}|${regOrder}"
 * Hash output: 8 bytes (64-bit djb2)
 *   byte[0] → terrain type
 *   byte[1] → base fertility stars (modified by ring distance)
 *   byte[2] → starting building index (from EMPIRE_DNA pool)
 *   bytes[0-7] → layout seed (hex string, 16 chars)
 */

import type { WorldId } from '../types/world';
import { EMPIRE_DNA } from '../types/world';
import type { TerrainType } from '../types/parcel';
import { TERRAIN_TYPES } from '../types/parcel';

// ============================================================================
// Terrain Configuration (per game doc 03-parseller.md)
// ============================================================================

export interface TerrainConfig {
  type: TerrainType;
  primaryResource: string;
  primaryMultiplier: number;
  secondaryResource: string;
  secondaryMultiplier: number;
  fertilityRange: { min: number; max: number };
  displayName: string;
}

export const TERRAIN_CONFIG: Record<TerrainType, TerrainConfig> = {
  plains: {
    type: 'plains',
    primaryResource: 'food',
    primaryMultiplier: 1.5,
    secondaryResource: 'wood',
    secondaryMultiplier: 0.8,
    fertilityRange: { min: 2, max: 5 },
    displayName: 'Plains',
  },
  forest: {
    type: 'forest',
    primaryResource: 'wood',
    primaryMultiplier: 1.5,
    secondaryResource: 'food',
    secondaryMultiplier: 0.8,
    fertilityRange: { min: 2, max: 5 },
    displayName: 'Forest',
  },
  mountain: {
    type: 'mountain',
    primaryResource: 'stone',
    primaryMultiplier: 1.5,
    secondaryResource: 'iron',
    secondaryMultiplier: 1.2,
    fertilityRange: { min: 1, max: 4 },
    displayName: 'Mountain',
  },
  mine: {
    type: 'mine',
    primaryResource: 'iron',
    primaryMultiplier: 1.5,
    secondaryResource: 'gold',
    secondaryMultiplier: 1.0,
    fertilityRange: { min: 1, max: 3 },
    displayName: 'Mine',
  },
  river: {
    type: 'river',
    primaryResource: 'food',
    primaryMultiplier: 1.2,
    secondaryResource: 'gold',
    secondaryMultiplier: 0.8,
    fertilityRange: { min: 3, max: 5 },
    displayName: 'River',
  },
  volcanic: {
    type: 'volcanic',
    primaryResource: 'iron',
    primaryMultiplier: 1.3,
    secondaryResource: 'diamond',
    secondaryMultiplier: 0.5,
    fertilityRange: { min: 1, max: 2 },
    displayName: 'Volcanic',
  },
};

/**
 * Fertility star multipliers (1-5 stars → production multiplier)
 */
export const FERTILITY_MULTIPLIERS: Record<number, number> = {
  1: 0.6,
  2: 0.8,
  3: 1.0,
  4: 1.3,
  5: 1.6,
};

// ============================================================================
// Terrain-Building Affinity (weighted selection for starting buildings)
// ============================================================================

/**
 * Affinity weights: how well each building type fits each terrain.
 * Higher = more likely to be selected on that terrain.
 * Used for weighted random selection from empire's building pool.
 */
export const TERRAIN_BUILDING_AFFINITY: Record<TerrainType, Record<string, number>> = {
  plains:   { farm: 3, lumberyard: 1, quarry: 0.3, iron_mine: 0.1, market: 2, barracks: 1, stable: 2, watchtower: 1, wall: 1, castle: 1, academy: 1 },
  forest:   { farm: 1, lumberyard: 3, quarry: 0.3, iron_mine: 0.2, market: 1, barracks: 1, stable: 1.5, watchtower: 2, wall: 1, castle: 1, academy: 1 },
  mountain: { farm: 0.3, lumberyard: 0.5, quarry: 3, iron_mine: 2, market: 0.5, barracks: 1.5, stable: 0.3, watchtower: 3, wall: 2, castle: 2, academy: 1 },
  mine:     { farm: 0.1, lumberyard: 0.3, quarry: 2, iron_mine: 3, market: 1, barracks: 1, stable: 0.3, watchtower: 1, wall: 1, castle: 1, academy: 0.5 },
  river:    { farm: 2.5, lumberyard: 1, quarry: 0.5, iron_mine: 0.3, market: 3, barracks: 0.5, stable: 1, watchtower: 1, wall: 0.5, castle: 1, academy: 1.5 },
  volcanic: { farm: 0.1, lumberyard: 0.1, quarry: 1, iron_mine: 3, market: 0.5, barracks: 2, stable: 0.3, watchtower: 2, wall: 1.5, castle: 1.5, academy: 1 },
};

/**
 * Select a building from pool using terrain-weighted random selection.
 * hashByte provides deterministic randomness.
 */
function selectBuildingByAffinity(
  pool: string[],
  terrain: TerrainType,
  hashByte: number,
): string {
  const affinities = TERRAIN_BUILDING_AFFINITY[terrain];
  // Build weighted pool from empire's available buildings
  const weights = pool.map(b => affinities[b] ?? 1);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  // Use hashByte to pick from weighted distribution
  const roll = (hashByte / 256) * totalWeight;
  let cumulative = 0;
  for (let i = 0; i < pool.length; i++) {
    cumulative += weights[i];
    if (roll < cumulative) return pool[i];
  }
  return pool[pool.length - 1];
}

// ============================================================================
// djb2-64 Hash Function
// ============================================================================

/**
 * 64-bit djb2 hash using BigInt.
 * Produces 8 bytes of hash output from any string input.
 */
export function djb2_64(input: string): bigint {
  let hash = BigInt(5381);
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << BigInt(5)) + hash + BigInt(input.charCodeAt(i))) & BigInt('0xFFFFFFFFFFFFFFFF');
  }
  return hash;
}

/**
 * Extract 8 bytes from a 64-bit BigInt hash.
 */
export function bigintToBytes8(hash: bigint): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < 8; i++) {
    bytes.push(Number((hash >> BigInt(i * 8)) & BigInt(0xFF)));
  }
  return bytes;
}

/**
 * Convert 8 bytes to a 16-char hex string (for layout seed).
 */
export function bytesToHex(bytes: number[]): string {
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// Parcel DNA Derivation
// ============================================================================

export interface ParcelDNA {
  version: number;
  hashInput: string;
  hashBytes: number[];
  terrain: TerrainType;
  fertilityStars: number;
  startingBuilding: string;
  layoutSeed: string;
  regOrder: number;
  ring: number;
  theme: string;
}

/** Current DNA version — bump when derivation logic changes */
export const PARCEL_DNA_VERSION = 6;

/**
 * Derive full parcel DNA from registration parameters.
 * Single source of truth for all parcel properties.
 */
export function deriveParcelDNA(
  worldId: WorldId,
  agentId: string,
  agentName: string,
  regOrder: number,
  blockX: number,
  blockY: number,
  theme: string,
): ParcelDNA {
  const hashInput = `${worldId}|${agentId}|${agentName}|${regOrder}`;
  const hash = djb2_64(hashInput);
  const hashBytes = bigintToBytes8(hash);

  // Terrain from byte[0]
  const terrain = TERRAIN_TYPES[hashBytes[0] % TERRAIN_TYPES.length];

  // Fertility from byte[1] + ring penalty
  const ring = Math.max(Math.abs(blockX), Math.abs(blockY));
  const terrainConfig = TERRAIN_CONFIG[terrain];
  const { min, max } = terrainConfig.fertilityRange;
  const baseFertility = min + (hashBytes[1] % (max - min + 1));
  const ringPenalty = Math.floor(ring / 2);
  const fertilityStars = Math.max(min, Math.min(max, baseFertility - ringPenalty));

  // Starting building from byte[2] + empire pool + terrain affinity
  const empireDna = EMPIRE_DNA[worldId];
  const pool = empireDna?.startingBuildings ?? ['farm'];
  const startingBuilding = selectBuildingByAffinity(pool, terrain, hashBytes[2]);

  // Layout seed from hash bytes
  const layoutSeed = bytesToHex(hashBytes);

  return {
    version: PARCEL_DNA_VERSION,
    hashInput,
    hashBytes,
    terrain,
    fertilityStars,
    startingBuilding,
    layoutSeed,
    regOrder,
    ring,
    theme,
  };
}

// ============================================================================
// Compact DNA (DB storage ~80 bytes JSON)
// ============================================================================

export interface CompactParcelDNA {
  v: number;   // version
  s: string;   // layoutSeed (16 chars)
  t: string;   // theme
  tr: string;  // terrain type
  fs: number;  // fertility stars
  sb: string;  // starting building
  ro: number;  // regOrder
}

export function compactDNA(dna: ParcelDNA): CompactParcelDNA {
  return {
    v: dna.version,
    s: dna.layoutSeed,
    t: dna.theme,
    tr: dna.terrain,
    fs: dna.fertilityStars,
    sb: dna.startingBuilding,
    ro: dna.regOrder,
  };
}

// ============================================================================
// Terrain Decoration Config (frontend ground fill)
// ============================================================================

export type EnvModelKey = 'tree' | 'grass' | 'stone' | 'torch';

export interface TerrainDecorationRule {
  /** Chance to place any decoration on an empty tile (0..1) */
  density: number;
  /** Weighted selection of environment models */
  weights: Partial<Record<EnvModelKey, number>>;
  /** Chance to place a torch on border/sidewalk tiles (0..1) */
  borderTorchChance: number;
}

/**
 * Terrain-aware decoration rules.
 * Used by frontend ground fill to populate empty parcel tiles
 * with terrain-appropriate environment models.
 */
export const TERRAIN_DECORATION_CONFIG: Record<TerrainType, TerrainDecorationRule> = {
  plains: {
    density: 0.18,
    weights: { grass: 0.75, tree: 0.25 },
    borderTorchChance: 0.06,
  },
  forest: {
    density: 0.55,
    weights: { tree: 0.7, grass: 0.3 },
    borderTorchChance: 0.04,
  },
  mountain: {
    density: 0.12,
    weights: { stone: 0.8, tree: 0.2 },
    borderTorchChance: 0.08,
  },
  mine: {
    density: 0.08,
    weights: { stone: 0.95, grass: 0.05 },
    borderTorchChance: 0.06,
  },
  river: {
    density: 0.25,
    weights: { grass: 0.7, tree: 0.3 },
    borderTorchChance: 0.04,
  },
  volcanic: {
    density: 0.10,
    weights: { stone: 0.8, torch: 0.2 },
    borderTorchChance: 0.12,
  },
};
