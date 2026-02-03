/**
 * V2Districts - District-based zoning for coherent city layout
 *
 * Uses V2WorldGen district nodes as single source of truth for Voronoi seeds.
 * Generates district map with smoothing and park clustering.
 *
 * Zone types:
 *   - core_commercial: Tall buildings, skyscrapers, business centers
 *   - mixed_use: Mid-rise + shops, transition between commercial and residential
 *   - residential_low: Small houses, more green space
 *   - residential_mid: Apartments, denser residential
 *   - civic: Schools, hospitals, police, fire stations
 *   - park: Large contiguous green areas
 */

import { type SeededRandom } from './V2Config';
import { getDistrictNodes, getChunkZone, type DistrictNodeType } from './V2WorldGen';

export type DistrictZone =
  | 'core_commercial'
  | 'mixed_use'
  | 'residential_low'
  | 'residential_mid'
  | 'civic'
  | 'park';

interface DistrictSeed {
  x: number;
  z: number;
  zone: DistrictZone;
  weight: number;
}

/**
 * Generate a zone map for a TABLE_SIZE x TABLE_SIZE grid.
 * Returns zone[x][z] for each chunk position.
 */
export function generateDistrictMap(
  tableSize: number,
  rng: SeededRandom,
): DistrictZone[][] {
  // 1. Create district seeds from V2WorldGen nodes
  const seeds = generateSeedsFromNodes(tableSize, rng);

  // 2. Assign initial zones via nearest-seed Voronoi
  const zoneMap: DistrictZone[][] = [];
  for (let x = 0; x < tableSize; x++) {
    zoneMap[x] = [];
    for (let z = 0; z < tableSize; z++) {
      zoneMap[x][z] = nearestSeedZone(x, z, seeds, rng);
    }
  }

  // 3. Smoothing pass — remove single-cell outliers
  smoothZoneMap(zoneMap, tableSize);

  // 4. Ensure park zones are contiguous (expand isolated parks)
  ensureParkClusters(zoneMap, tableSize);

  return zoneMap;
}

/**
 * Get a deterministic DistrictZone for any world-chunk coordinate.
 * Uses V2WorldGen's Voronoi node distance (no RNG noise) + a hash-based sub-zone pick.
 * Stable across grid shifts — same (chunkX, chunkZ) always returns the same zone.
 */
export function getWorldChunkZone(chunkX: number, chunkZ: number): DistrictZone {
  const nodeType = getChunkZone(chunkX, chunkZ);
  // Deterministic sub-zone hash from chunk coords
  const hash = Math.abs(chunkX * 73856093 + chunkZ * 19349663) % 100;

  switch (nodeType) {
    case 'commercial':
      return hash < 40 ? 'core_commercial' : 'mixed_use';
    case 'residential':
      return hash < 50 ? 'residential_low' : 'residential_mid';
    case 'park':
      return 'park';
    case 'civic':
      return 'civic';
  }
}

/**
 * Deterministic seed for per-chunk RNG. Same (chunkX, chunkZ) always produces same seed.
 */
export function chunkSeed(chunkX: number, chunkZ: number): number {
  return Math.abs(chunkX * 73856093 + chunkZ * 19349663 + 42) % 2147483647 || 1;
}

/**
 * Map DistrictZone to the V2Layout zone type for block composition.
 */
export function districtToLayoutZone(dz: DistrictZone): 'residential' | 'commercial' | 'park' {
  switch (dz) {
    case 'core_commercial':
    case 'mixed_use':
    case 'civic':
      return 'commercial';
    case 'residential_low':
    case 'residential_mid':
      return 'residential';
    case 'park':
      return 'park';
  }
}

// ============ SEED GENERATION FROM V2WorldGen NODES ============

const NODE_TYPE_TO_ZONES: Record<DistrictNodeType, DistrictZone[]> = {
  commercial: ['core_commercial', 'mixed_use'],
  residential: ['residential_low', 'residential_mid'],
  park: ['park'],
  civic: ['civic'],
};

function generateSeedsFromNodes(tableSize: number, rng: SeededRandom): DistrictSeed[] {
  const seeds: DistrictSeed[] = [];
  const center = Math.floor(tableSize / 2);
  const nodes = getDistrictNodes();

  for (const node of nodes) {
    // Map node chunk coordinates to table coordinates (centered)
    const x = center + node.x;
    const z = center + node.z;

    // Pick a specific DistrictZone from the node type
    const possibleZones = NODE_TYPE_TO_ZONES[node.type];
    const zone = possibleZones.length > 1 ? rng.pick(possibleZones) : possibleZones[0];

    seeds.push({
      x: Math.max(0, Math.min(tableSize - 1, x)),
      z: Math.max(0, Math.min(tableSize - 1, z)),
      zone,
      weight: node.weight,
    });
  }

  return seeds;
}

// ============ VORONOI ASSIGNMENT ============

function nearestSeedZone(
  x: number,
  z: number,
  seeds: DistrictSeed[],
  rng: SeededRandom,
): DistrictZone {
  let bestZone: DistrictZone = 'residential_low';
  let bestDist = Infinity;

  for (const seed of seeds) {
    const dx = x - seed.x;
    const dz = z - seed.z;
    // Weighted distance: lower weight = larger district
    const dist = (dx * dx + dz * dz) / (seed.weight * seed.weight);
    // Add small noise to break ties and create organic boundaries
    const noisy = dist + rng.next() * 0.8;

    if (noisy < bestDist) {
      bestDist = noisy;
      bestZone = seed.zone;
    }
  }

  return bestZone;
}

// ============ SMOOTHING ============

function smoothZoneMap(zoneMap: DistrictZone[][], tableSize: number): void {
  const copy = zoneMap.map(row => [...row]);

  for (let x = 0; x < tableSize; x++) {
    for (let z = 0; z < tableSize; z++) {
      const neighbors = getNeighborZones(copy, x, z, tableSize);
      if (neighbors.length === 0) continue;

      const counts = new Map<DistrictZone, number>();
      for (const n of neighbors) {
        counts.set(n, (counts.get(n) ?? 0) + 1);
      }

      const currentCount = counts.get(copy[x][z]) ?? 0;
      if (currentCount === 0) {
        let maxZone = copy[x][z];
        let maxCount = 0;
        for (const [zone, count] of counts) {
          if (count > maxCount) {
            maxCount = count;
            maxZone = zone;
          }
        }
        zoneMap[x][z] = maxZone;
      }
    }
  }
}

function getNeighborZones(
  zoneMap: DistrictZone[][],
  x: number,
  z: number,
  tableSize: number,
): DistrictZone[] {
  const result: DistrictZone[] = [];
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dx, dz] of dirs) {
    const nx = x + dx;
    const nz = z + dz;
    if (nx >= 0 && nx < tableSize && nz >= 0 && nz < tableSize) {
      result.push(zoneMap[nx][nz]);
    }
  }
  return result;
}

// ============ PARK CLUSTERING ============

function ensureParkClusters(zoneMap: DistrictZone[][], tableSize: number): void {
  const copy = zoneMap.map(row => [...row]);
  for (let x = 0; x < tableSize; x++) {
    for (let z = 0; z < tableSize; z++) {
      if (copy[x][z] !== 'park') continue;
      const neighbors = getNeighborZones(copy, x, z, tableSize);
      const friendlyNeighbors = neighbors.filter(
        n => n === 'park' || n === 'residential_low',
      ).length;
      if (friendlyNeighbors === 0) {
        zoneMap[x][z] = 'residential_low';
      }
    }
  }
}
