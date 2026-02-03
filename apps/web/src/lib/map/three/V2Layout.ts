/**
 * V2Layout - Block compositor for 16x16 chunk grid
 *
 * Each chunk is a 16x16 tile grid with roads every 4 tiles:
 *   Road columns/rows at: 0, 4, 8, 12
 *   Buildable 3x3 blocks between roads (4x4 = 16 blocks per chunk)
 *
 * Block origins (top-left of each 3x3 area):
 *   (1,1)  (1,5)  (1,9)  (1,13)
 *   (5,1)  (5,5)  (5,9)  (5,13)
 *   (9,1)  (9,5)  (9,9)  (9,13)
 *   (13,1) (13,5) (13,9) (13,13)
 *
 * District zones control which buildings appear in each block.
 */

import {
  TILES_PER_CHUNK,
  ROAD_INTERVAL,
  BLOCK_TILES,
  ASSET_REGISTRY,
  type Placement,
  type SeededRandom,
} from './V2Config';
import { type DistrictZone, districtToLayoutZone } from './V2Districts';

type LayoutZone = 'residential' | 'commercial' | 'park';

// ============ BLOCK POSITION HELPERS ============

/** Get all 16 block origins (top-left corner of each 3x3 buildable area) */
function getBlockOrigins(): [number, number][] {
  const origins: [number, number][] = [];
  for (let bx = 0; bx < 4; bx++) {
    for (let bz = 0; bz < 4; bz++) {
      origins.push([
        bx * ROAD_INTERVAL + 1,  // 1, 5, 9, 13
        bz * ROAD_INTERVAL + 1,  // 1, 5, 9, 13
      ]);
    }
  }
  return origins;
}

/**
 * Compose a full 16x16 chunk of placements for a given district zone.
 */
export function composeChunk(zone: LayoutZone, rng: SeededRandom, districtZone?: DistrictZone): Placement[] {
  const placements: Placement[] = [];

  // 1. Place road grid
  placeRoads(placements);

  // 2. Fill each 3x3 block
  const blockOrigins = getBlockOrigins();
  rng.shuffle(blockOrigins);

  for (const [ox, oz] of blockOrigins) {
    const occupied = Array.from({ length: BLOCK_TILES }, () =>
      Array(BLOCK_TILES).fill(false) as boolean[],
    );

    switch (zone) {
      case 'residential':
        fillResidentialBlock(placements, occupied, ox, oz, rng, districtZone);
        break;
      case 'commercial':
        fillCommercialBlock(placements, occupied, ox, oz, rng, districtZone);
        break;
      case 'park':
        fillParkBlock(placements, occupied, ox, oz, rng);
        break;
    }

    fillGroundOnEmpty(placements, occupied, ox, oz, zone === 'park' ? 'grass' : 'asphalt');
  }

  return placements;
}

/**
 * Compose a chunk from a district zone (preferred entry point).
 */
export function composeChunkFromDistrict(districtZone: DistrictZone, rng: SeededRandom): Placement[] {
  const layoutZone = districtToLayoutZone(districtZone);
  return composeChunk(layoutZone, rng, districtZone);
}

// ============ ROAD PLACEMENT ============

function placeRoads(placements: Placement[]): void {
  for (let x = 0; x < TILES_PER_CHUNK; x++) {
    for (let z = 0; z < TILES_PER_CHUNK; z++) {
      const isRoadX = x % ROAD_INTERVAL === 0;
      const isRoadZ = z % ROAD_INTERVAL === 0;

      if (isRoadX && isRoadZ) {
        placements.push({ assetKey: 'road_cross', tileX: x, tileZ: z });
      } else if (isRoadX) {
        placements.push({ assetKey: 'road_ns', tileX: x, tileZ: z });
      } else if (isRoadZ) {
        placements.push({ assetKey: 'road_ew', tileX: x, tileZ: z });
      }
    }
  }
}

// ============ BUILDING KEY POOLS ============

const TALL_KEYS = ['skyscraper'];

function getResidentialLowKeys(): string[] {
  return Object.entries(ASSET_REGISTRY)
    .filter(([key, meta]) =>
      meta.type === 'building' &&
      meta.zone?.includes('residential') &&
      !key.startsWith('elite_') &&
      meta.tileW === 1 && meta.tileD === 1,
    )
    .map(([key]) => key);
}

function getResidentialMidKeys(): string[] {
  return Object.entries(ASSET_REGISTRY)
    .filter(([, meta]) =>
      meta.type === 'building' &&
      meta.zone?.includes('residential'),
    )
    .map(([key]) => key);
}

function getSmallShopKeys(): string[] {
  const tallSet = new Set(TALL_KEYS);
  return Object.entries(ASSET_REGISTRY)
    .filter(([key, meta]) =>
      meta.type === 'building' &&
      meta.zone?.includes('commercial') &&
      meta.tileW === 1 && meta.tileD === 1 &&
      !tallSet.has(key),
    )
    .map(([key]) => key);
}

function getLargeCommercialKeys(): string[] {
  return Object.entries(ASSET_REGISTRY)
    .filter(([, meta]) =>
      meta.type === 'building' &&
      meta.zone?.includes('commercial') &&
      (meta.tileW > 1 || meta.tileD > 1),
    )
    .map(([key]) => key);
}

const CIVIC_KEYS = ['school', 'police'];

// ============ ZONE FILLERS (per 3x3 block) ============

function fillResidentialBlock(
  placements: Placement[],
  occupied: boolean[][],
  ox: number, oz: number,
  rng: SeededRandom,
  districtZone?: DistrictZone,
): void {
  const isLow = districtZone === 'residential_low';
  const buildingCount = isLow ? 1 + Math.floor(rng.next() * 2) : 2 + Math.floor(rng.next() * 2);
  const buildingKeys = isLow ? getResidentialLowKeys() : getResidentialMidKeys();
  if (buildingKeys.length === 0) return;

  let placed = 0;
  const positions = shuffledBlockPositions(rng);

  for (const [bx, bz] of positions) {
    if (placed >= buildingCount) break;
    if (occupied[bx][bz]) continue;

    const key = rng.pick(buildingKeys);
    const meta = ASSET_REGISTRY[key];
    if (!meta) continue;

    if (canPlace(occupied, bx, bz, meta.tileW, meta.tileD)) {
      for (let dx = 0; dx < meta.tileW; dx++) {
        for (let dz = 0; dz < meta.tileD; dz++) {
          placements.push({ assetKey: 'asphalt', tileX: ox + bx + dx, tileZ: oz + bz + dz });
        }
      }
      placements.push({
        assetKey: key,
        tileX: ox + bx,
        tileZ: oz + bz,
        rotation: rng.pick([0, Math.PI / 2, Math.PI, Math.PI * 1.5]),
      });
      markOccupied(occupied, bx, bz, meta.tileW, meta.tileD);
      placed++;
    }
  }

  if (isLow) {
    fillProps(placements, occupied, ox, oz, rng, { trees: 2, lamps: 0, benches: 1 });
  } else {
    fillProps(placements, occupied, ox, oz, rng, { trees: 1, lamps: 1, benches: 0 });
  }
}

function fillCommercialBlock(
  placements: Placement[],
  occupied: boolean[][],
  ox: number, oz: number,
  rng: SeededRandom,
  districtZone?: DistrictZone,
): void {
  if (districtZone === 'civic') {
    fillCivicBlock(placements, occupied, ox, oz, rng);
    return;
  }

  const isCore = districtZone === 'core_commercial';
  const smallKeys = getSmallShopKeys();
  const positions = shuffledBlockPositions(rng);

  // Core commercial: try tall building
  if (isCore && TALL_KEYS.length > 0 && rng.next() > 0.4) {
    for (const [bx, bz] of positions) {
      if (occupied[bx][bz]) continue;
      placements.push({ assetKey: 'asphalt', tileX: ox + bx, tileZ: oz + bz });
      placements.push({ assetKey: rng.pick(TALL_KEYS), tileX: ox + bx, tileZ: oz + bz });
      occupied[bx][bz] = true;
      break;
    }
  }

  // Try a large building (2x2 fits exactly in remaining 3x3 space)
  const largeKeys = getLargeCommercialKeys();
  if (largeKeys.length > 0 && rng.next() > 0.5) {
    const key = rng.pick(largeKeys);
    const meta = ASSET_REGISTRY[key];
    if (meta) {
      for (const [bx, bz] of positions) {
        if (canPlace(occupied, bx, bz, meta.tileW, meta.tileD)) {
          for (let dx = 0; dx < meta.tileW; dx++) {
            for (let dz = 0; dz < meta.tileD; dz++) {
              placements.push({ assetKey: 'asphalt', tileX: ox + bx + dx, tileZ: oz + bz + dz });
            }
          }
          placements.push({ assetKey: key, tileX: ox + bx, tileZ: oz + bz });
          markOccupied(occupied, bx, bz, meta.tileW, meta.tileD);
          break;
        }
      }
    }
  }

  // Fill remaining with small shops
  const targetCount = isCore ? 2 : 1 + Math.floor(rng.next() * 2);
  let placed = 0;
  for (const [bx, bz] of positions) {
    if (placed >= targetCount) break;
    if (occupied[bx][bz]) continue;
    const key = rng.pick(smallKeys.length > 0 ? smallKeys : ['coffee']);
    placements.push({ assetKey: 'asphalt', tileX: ox + bx, tileZ: oz + bz });
    placements.push({
      assetKey: key,
      tileX: ox + bx,
      tileZ: oz + bz,
      rotation: rng.pick([0, Math.PI / 2, Math.PI, Math.PI * 1.5]),
    });
    occupied[bx][bz] = true;
    placed++;
  }

  if (isCore) {
    fillProps(placements, occupied, ox, oz, rng, { trees: 0, lamps: 1, benches: 0 });
  } else {
    fillProps(placements, occupied, ox, oz, rng, { trees: 1, lamps: 1, benches: 0 });
  }
}

function fillCivicBlock(
  placements: Placement[],
  occupied: boolean[][],
  ox: number, oz: number,
  rng: SeededRandom,
): void {
  const availableKeys = CIVIC_KEYS.filter(k => ASSET_REGISTRY[k]);
  const positions = shuffledBlockPositions(rng);

  // Try to place one civic building
  for (const key of rng.shuffle([...availableKeys])) {
    const meta = ASSET_REGISTRY[key];
    if (!meta) continue;

    for (const [bx, bz] of positions) {
      if (canPlace(occupied, bx, bz, meta.tileW, meta.tileD)) {
        for (let dx = 0; dx < meta.tileW; dx++) {
          for (let dz = 0; dz < meta.tileD; dz++) {
            placements.push({ assetKey: 'asphalt', tileX: ox + bx + dx, tileZ: oz + bz + dz });
          }
        }
        placements.push({ assetKey: key, tileX: ox + bx, tileZ: oz + bz });
        markOccupied(occupied, bx, bz, meta.tileW, meta.tileD);
        break;
      }
    }
    break; // Only one civic building per block
  }

  // Fill remaining with a small shop
  const smallKeys = getSmallShopKeys();
  for (const [bx, bz] of positions) {
    if (occupied[bx][bz]) continue;
    const key = rng.pick(smallKeys.length > 0 ? smallKeys : ['coffee']);
    placements.push({ assetKey: 'asphalt', tileX: ox + bx, tileZ: oz + bz });
    placements.push({
      assetKey: key,
      tileX: ox + bx,
      tileZ: oz + bz,
      rotation: rng.pick([0, Math.PI / 2, Math.PI, Math.PI * 1.5]),
    });
    occupied[bx][bz] = true;
    break;
  }

  fillProps(placements, occupied, ox, oz, rng, { trees: 1, lamps: 1, benches: 1 });
}

function fillParkBlock(
  placements: Placement[],
  occupied: boolean[][],
  ox: number, oz: number,
  rng: SeededRandom,
): void {
  // Maybe a fountain (40% chance)
  if (rng.next() > 0.6) {
    const cx = Math.floor(rng.next() * BLOCK_TILES);
    const cz = Math.floor(rng.next() * BLOCK_TILES);
    if (!occupied[cx][cz]) {
      placements.push({
        assetKey: rng.pick(FOUNTAIN_KEYS),
        tileX: ox + cx,
        tileZ: oz + cz,
      });
      occupied[cx][cz] = true;
    }
  }

  // Maybe a monument (20% chance)
  if (rng.next() > 0.8) {
    const positions = shuffledBlockPositions(rng);
    for (const [bx, bz] of positions) {
      if (!occupied[bx][bz]) {
        placements.push({
          assetKey: 'monument',
          tileX: ox + bx,
          tileZ: oz + bz,
        });
        occupied[bx][bz] = true;
        break;
      }
    }
  }

  fillProps(placements, occupied, ox, oz, rng, { trees: 3, lamps: 1, benches: 1 });
}

// ============ HELPERS ============

function fillGroundOnEmpty(
  placements: Placement[],
  occupied: boolean[][],
  ox: number, oz: number,
  groundKey: string,
): void {
  for (let x = 0; x < BLOCK_TILES; x++) {
    for (let z = 0; z < BLOCK_TILES; z++) {
      if (!occupied[x][z]) {
        placements.push({ assetKey: groundKey, tileX: ox + x, tileZ: oz + z });
      }
    }
  }
}

function canPlace(
  occupied: boolean[][],
  bx: number, bz: number,
  w: number, d: number,
): boolean {
  for (let dx = 0; dx < w; dx++) {
    for (let dz = 0; dz < d; dz++) {
      const nx = bx + dx;
      const nz = bz + dz;
      if (nx >= BLOCK_TILES || nz >= BLOCK_TILES) return false;
      if (occupied[nx][nz]) return false;
    }
  }
  return true;
}

/**
 * Validate a composed chunk for overlaps. Logs warnings for detected issues.
 */
export function validateChunk(placements: Placement[], label = ''): void {
  const grid: string[][] = Array.from({ length: TILES_PER_CHUNK }, () =>
    Array(TILES_PER_CHUNK).fill(''),
  );

  for (const p of placements) {
    const meta = ASSET_REGISTRY[p.assetKey];
    if (!meta || meta.type === 'ground' || meta.type === 'road') continue;

    const tw = meta.tileW;
    const td = meta.tileD;

    for (let dx = 0; dx < tw; dx++) {
      for (let dz = 0; dz < td; dz++) {
        const tx = p.tileX + dx;
        const tz = p.tileZ + dz;
        if (tx >= TILES_PER_CHUNK || tz >= TILES_PER_CHUNK) {
          console.warn(`[V2Layout] ${label} OVERFLOW: ${p.assetKey} at tile(${p.tileX},${p.tileZ}) extends to (${tx},${tz})`);
          continue;
        }
        if (grid[tx][tz] && grid[tx][tz] !== p.assetKey) {
          console.warn(`[V2Layout] ${label} OVERLAP: tile(${tx},${tz}) has "${grid[tx][tz]}" AND "${p.assetKey}"`);
        }
        grid[tx][tz] = p.assetKey;
      }
    }
  }
}

function markOccupied(
  occupied: boolean[][],
  bx: number, bz: number,
  w: number, d: number,
): void {
  for (let dx = 0; dx < w; dx++) {
    for (let dz = 0; dz < d; dz++) {
      occupied[bx + dx][bz + dz] = true;
    }
  }
}

function shuffledBlockPositions(rng: SeededRandom): [number, number][] {
  const positions: [number, number][] = [];
  for (let x = 0; x < BLOCK_TILES; x++) {
    for (let z = 0; z < BLOCK_TILES; z++) {
      positions.push([x, z]);
    }
  }
  return rng.shuffle(positions);
}

// Prop pools
const TREE_KEYS = ['tree', 'tree_13', 'tree_16', 'tree_17'];
const BUSH_KEYS = ['bush_01', 'bush_02', 'bush_03'];
const LAMP_KEYS = ['lamp', 'lamp_02'];
const SMALL_PROP_KEYS = ['hydrant', 'trash', 'phone_booth'];
const FOUNTAIN_KEYS = ['fountain_01', 'fountain_02'];

function fillProps(
  placements: Placement[],
  occupied: boolean[][],
  ox: number, oz: number,
  rng: SeededRandom,
  counts: { trees: number; lamps: number; benches: number },
): void {
  const emptyTiles: [number, number][] = [];
  for (let x = 0; x < BLOCK_TILES; x++) {
    for (let z = 0; z < BLOCK_TILES; z++) {
      if (!occupied[x][z]) emptyTiles.push([x, z]);
    }
  }
  rng.shuffle(emptyTiles);

  let idx = 0;

  const propList: string[] = [];
  for (let i = 0; i < counts.trees; i++) {
    if (rng.next() > 0.3) {
      propList.push(rng.pick(TREE_KEYS));
    } else {
      propList.push(rng.pick(BUSH_KEYS));
    }
  }
  for (let i = 0; i < counts.lamps; i++) propList.push(rng.pick(LAMP_KEYS));
  for (let i = 0; i < counts.benches; i++) {
    if (rng.next() > 0.5) {
      propList.push('bench');
    } else {
      propList.push(rng.pick(SMALL_PROP_KEYS));
    }
  }

  for (const propKey of propList) {
    if (idx >= emptyTiles.length) break;
    const [px, pz] = emptyTiles[idx++];
    placements.push({
      assetKey: propKey,
      tileX: ox + px,
      tileZ: oz + pz,
      rotation: rng.next() * Math.PI * 2,
    });
  }
}
