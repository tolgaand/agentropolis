/**
 * Parcel System — Hash-Based Map Growth
 *
 * Each agent registration expands the empire map like a block in a blockchain.
 * The agent's properties deterministically generate their parcel:
 * - Position: spiral outward from empire center (early = center, late = frontier)
 * - Terrain: hash-derived (plains, forest, hills, mountain, river)
 * - Fertility: hash-derived (1-5 stars)
 * - Initial building: hash-derived from empire DNA weights
 *
 * Grid: 20x20 parcels per empire, 20x20 tiles per parcel
 */

import type { WorldId, ResourceId } from './world';

// ============================================================================
// Terrain System
// ============================================================================

export type TerrainType = 'plains' | 'forest' | 'mountain' | 'mine' | 'river' | 'volcanic';

export const TERRAIN_BONUSES: Record<TerrainType, Partial<Record<ResourceId, number>>> = {
  plains:   { food: 0.50, wood: -0.20 },
  forest:   { wood: 0.50, food: -0.20 },
  mountain: { stone: 0.50, iron: 0.20 },
  mine:     { iron: 0.50, gold: 0.00 },
  river:    { food: 0.20, gold: -0.20 },
  volcanic: { iron: 0.30, diamond: -0.50 },
};

export const TERRAIN_WEIGHTS: number[] = [30, 20, 18, 12, 12, 8]; // plains, forest, mountain, mine, river, volcanic
export const TERRAIN_TYPES: TerrainType[] = ['plains', 'forest', 'mountain', 'mine', 'river', 'volcanic'];

// ============================================================================
// Parcel Definition
// ============================================================================

export interface Parcel {
  id: string;                    // `${worldId}:${x},${y}`
  worldId: WorldId;
  x: number;                    // Grid position (spiral index → coord)
  y: number;
  ring: number;                 // Distance from center (0 = center)
  ownerAgentId: string | null;
  terrain: TerrainType;
  fertility: number; // 1-5 stars
  initialBuilding: string;      // First building placed by hash
  createdAt: string;
  regOrder: number;             // Agent registration order within empire
}

// ============================================================================
// Parcel Purchase Pricing
// ============================================================================

export const PARCEL_PRICE = {
  BASE: 500,                    // Base cost in gold
  DISTANCE_FACTOR: 0.05,       // Per ring from center (+5%)
  GROWTH_FACTOR: 0.02,         // Per 100 parcels owned by empire
  SCARCITY_FACTOR: 0.30,       // Per % of ring parcels sold
  ANTI_HOARD_FACTOR: 0.15,     // Per parcel owned beyond 3
  FRONTIER_DISCOUNT: 0.03,     // Per ring (frontier is cheaper)
  FRONTIER_DISCOUNT_FLOOR: 0.6,
  AGENT_PARCEL_CAP_BASE: 3,    // Base parcel cap per agent
  AGENT_PARCEL_CAP_PER_LEVEL: 3, // +1 cap every 3 levels
  COOLDOWN_TICKS: 24,          // 1 day cooldown between purchases
  IDLE_PENALTY_TICKS: 48,      // Lose yield if no building for 48h
  MAINTENANCE_TAX_PCT: 0.01,   // 1% daily tax on parcels beyond cap
} as const;

/**
 * Calculate parcel purchase price
 */
export function calculateParcelPrice(
  ring: number,
  empireTotalParcels: number,
  ringParcelsSold: number,
  ringTotalParcels: number,
  agentOwnedParcels: number,
): number {
  const distanceFactor = Math.max(
    PARCEL_PRICE.FRONTIER_DISCOUNT_FLOOR,
    1.0 - PARCEL_PRICE.FRONTIER_DISCOUNT * ring,
  );
  const growthFactor = 1.0 + PARCEL_PRICE.GROWTH_FACTOR * (empireTotalParcels / 100);
  const scarcityFactor = ringTotalParcels > 0
    ? 1.0 + PARCEL_PRICE.SCARCITY_FACTOR * (ringParcelsSold / ringTotalParcels)
    : 1.0;
  const antiHoardFactor = 1.0 + PARCEL_PRICE.ANTI_HOARD_FACTOR * Math.max(0, agentOwnedParcels - 3);

  return Math.round(PARCEL_PRICE.BASE * distanceFactor * growthFactor * scarcityFactor * antiHoardFactor);
}

// ============================================================================
// Spiral Position Generator
// ============================================================================

const GRID_SIZE = 20; // 20x20 parcel grid per empire

/**
 * Generate spiral positions from center outward (deterministic).
 * Returns array of {x, y} where index 0 = center.
 */
export function generateSpiralPositions(size: number = GRID_SIZE): Array<{ x: number; y: number }> {
  const center = Math.floor((size - 1) / 2); // 9 for size 20
  const positions: Array<{ x: number; y: number }> = [];
  let x = center;
  let y = center;
  positions.push({ x, y });

  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // right, down, left, up
  let dirIndex = 0;
  let step = 1;

  while (positions.length < size * size) {
    for (let turn = 0; turn < 2; turn++) {
      const [dx, dy] = dirs[dirIndex % 4];
      for (let s = 0; s < step; s++) {
        x += dx;
        y += dy;
        if (x >= 0 && x < size && y >= 0 && y < size) {
          positions.push({ x, y });
        }
        if (positions.length >= size * size) return positions;
      }
      dirIndex++;
    }
    step++;
  }

  return positions;
}

// Pre-computed spiral for standard grid
let _spiralCache: Array<{ x: number; y: number }> | null = null;
export function getSpiralPositions(): Array<{ x: number; y: number }> {
  if (!_spiralCache) {
    _spiralCache = generateSpiralPositions(GRID_SIZE);
  }
  return _spiralCache;
}

/**
 * Get ring number for a position (Chebyshev distance from center)
 */
export function getRing(x: number, y: number, size: number = GRID_SIZE): number {
  const center = Math.floor((size - 1) / 2);
  return Math.max(Math.abs(x - center), Math.abs(y - center));
}

// ============================================================================
// Agent Hash — Deterministic Parcel Generation
// ============================================================================

/**
 * Simple deterministic hash (djb2) — no crypto dependency needed.
 * Returns 8 pseudo-random bytes derived from input string.
 */
export function agentHash(
  worldId: string,
  agentId: string,
  agentName: string,
  regOrder: number,
): number[] {
  const input = `${worldId}|${agentId}|${agentName}|${regOrder}`;
  let h = 5381;
  const bytes: number[] = [];

  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }

  // Generate 8 bytes from hash by re-hashing
  for (let i = 0; i < 8; i++) {
    h = ((h << 5) + h + i + 0x9e3779b9) >>> 0;
    bytes.push(h & 0xff);
  }

  return bytes;
}

/**
 * Derive terrain type from hash byte
 */
export function deriveTerrainFromHash(hashByte: number): TerrainType {
  const roll = hashByte % 100;
  let cumulative = 0;
  for (let i = 0; i < TERRAIN_TYPES.length; i++) {
    cumulative += TERRAIN_WEIGHTS[i];
    if (roll < cumulative) return TERRAIN_TYPES[i];
  }
  return TERRAIN_TYPES[0];
}

/**
 * Derive fertility (1-5) from hash byte
 */
export function deriveFertilityFromHash(hashByte: number, ring: number): number {
  const base = (hashByte % 5) + 1; // 1-5
  const ringPenalty = Math.floor(ring / 4);
  return Math.max(1, Math.min(5, base - ringPenalty));
}

/**
 * Derive initial building from hash byte + empire DNA weights
 */
export function deriveInitialBuilding(hashByte: number): string {
  const buildings = ['farm', 'lumberyard', 'quarry', 'iron_mine', 'market', 'academy'];
  const weights =   [30,     20,           15,       10,          15,       10];
  const roll = hashByte % 100;
  let cumulative = 0;
  for (let i = 0; i < buildings.length; i++) {
    cumulative += weights[i];
    if (roll < cumulative) return buildings[i];
  }
  return 'farm';
}

/**
 * Generate a complete parcel for a new agent registration.
 * This is the "blockhash" — deterministic from agent properties.
 */
export function generateParcelForAgent(
  worldId: WorldId,
  agentId: string,
  agentName: string,
  regOrder: number,
): Omit<Parcel, 'createdAt'> {
  const spiral = getSpiralPositions();
  const pos = spiral[regOrder - 1] ?? spiral[spiral.length - 1];
  const ring = getRing(pos.x, pos.y);

  const hash = agentHash(worldId, agentId, agentName, regOrder);

  const terrain = deriveTerrainFromHash(hash[0]);
  const fertility = deriveFertilityFromHash(hash[1], ring);
  const initialBuilding = deriveInitialBuilding(hash[2]);

  return {
    id: `${worldId}:${pos.x},${pos.y}`,
    worldId,
    x: pos.x,
    y: pos.y,
    ring,
    ownerAgentId: agentId,
    terrain,
    fertility,
    initialBuilding,
    regOrder,
  };
}

// ============================================================================
// Parcel Yield Calculation
// ============================================================================

/** Base yield per building type per tick */
export const BUILDING_YIELDS: Record<string, Partial<Record<ResourceId, number>>> = {
  farm:       { food: 8 },
  lumberyard: { wood: 8 },
  quarry:     { stone: 6 },
  iron_mine:  { iron: 4 },
  market:     { gold: 6 },
  academy:    { diamond: 3 },
  barracks:   {},
  stable:     {},
  watchtower: {},
  wall:       {},
  castle:     {},
};

// ============================================================================
// Grid Constants
// ============================================================================

export const PARCEL_GRID_SIZE = GRID_SIZE;
export const PARCEL_TILE_SIZE = 20;      // 20x20 tiles per parcel
export const PARCEL_ROAD_SIZE = 3;       // 3-tile roads between parcels
export const PARCEL_STRIDE = PARCEL_TILE_SIZE + PARCEL_ROAD_SIZE; // 23

// Frontier threshold (rings >= this count as frontier)
export const FRONTIER_THRESHOLD = 6;
