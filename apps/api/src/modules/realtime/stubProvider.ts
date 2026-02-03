/**
 * Stub Chunk Provider — Deterministic chunk payload generation
 *
 * Same (seed, chunkX, chunkZ) → always same placements.
 * No DB, no persistence — pure functions only.
 */

import type { Placement, ChunkPayloadData } from '@agentropolis/shared/contracts/v2';

const TILES_PER_CHUNK = 16;
const ROAD_INTERVAL = 4;

/** Simple seeded PRNG (same as frontend V2Config) */
class SeededRandom {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
}

/** Building pool for stub generation */
const STUB_BUILDINGS_1x1 = [
  'residential_01', 'residential_02', 'residential_03', 'residential_04',
  'residential_05', 'residential_06', 'residential_07', 'residential_08',
  'coffee', 'bar', 'barbershop', 'burger_shop', 'fastfood',
  'pizzeria', 'library', 'ice_cream_shop', 'tool_store', 'skyscraper',
];

const STUB_BUILDINGS_2x2 = [
  'supermarket_01', 'biz_center_01', 'biz_center_02', 'casino', 'police',
];

const ROT_OPTIONS = [0, 90, 180, 270];

/**
 * Generate a deterministic chunk payload.
 * Input: world seed + chunk coords → always identical output.
 */
export function generateStubChunk(
  worldSeed: number,
  chunkX: number,
  chunkZ: number,
): ChunkPayloadData {
  // Derive per-chunk seed from world seed + coords
  const chunkSeed = Math.abs(worldSeed * 73856093 + chunkX * 19349663 + chunkZ * 83492791) % 2147483647 || 1;
  const rng = new SeededRandom(chunkSeed);

  const placements: Placement[] = [];

  // Place 3-6 buildings per chunk on buildable tiles
  const count = 3 + Math.floor(rng.next() * 4);

  for (let i = 0; i < count; i++) {
    // Find a buildable tile (not on road grid lines)
    let localX: number;
    let localZ: number;
    let attempts = 0;
    do {
      localX = Math.floor(rng.next() * TILES_PER_CHUNK);
      localZ = Math.floor(rng.next() * TILES_PER_CHUNK);
      attempts++;
    } while ((localX % ROAD_INTERVAL === 0 || localZ % ROAD_INTERVAL === 0) && attempts < 20);

    if (localX % ROAD_INTERVAL === 0 || localZ % ROAD_INTERVAL === 0) continue;

    const worldX = chunkX * TILES_PER_CHUNK + localX;
    const worldZ = chunkZ * TILES_PER_CHUNK + localZ;

    // 80% small (1x1), 20% large (2x2)
    const useLarge = rng.next() < 0.2;
    const pool = useLarge ? STUB_BUILDINGS_2x2 : STUB_BUILDINGS_1x1;
    const assetKey = pool[Math.floor(rng.next() * pool.length)];
    const type = useLarge ? 'commercial' : (rng.next() < 0.5 ? 'residential' : 'commercial');
    const rotY = ROT_OPTIONS[Math.floor(rng.next() * 4)];
    const level = 1 + Math.floor(rng.next() * 3);

    placements.push({
      worldX,
      worldZ,
      type,
      assetKey,
      rotY,
      level,
      source: 'stub',
    });
  }

  return {
    chunkX,
    chunkZ,
    placements,
    meta: {
      seed: chunkSeed,
      generatedAt: new Date().toISOString(),
    },
  };
}
