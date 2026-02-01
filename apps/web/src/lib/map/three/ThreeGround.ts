/**
 * ThreeGround - Instanced iso prism tiles for ground rendering
 *
 * Uses InstancedMesh with a low-poly isometric prism geometry
 * (top diamond face + left/right side faces).
 * Vertex colors distinguish tile types (grass, parcel, light/dark checkerboard).
 */

import * as THREE from 'three';
import {
  TILE_SIZE,
  TILE_DEPTH,
  GROUND_COLORS,
  TERRAIN_GROUND_COLORS,
  BLOCK_SIZE,
  BLOCK_STRIDE,
  BLOCK_OFFSET_X,
  BLOCK_OFFSET_Y,
  MAX_INSTANCES_PER_MESH,
  PARCEL_BORDER_BRIGHTNESS,
} from './ThreeConfig';
import type { RenderableParcel } from '../types';

/**
 * Create the iso prism geometry (diamond top + two side faces)
 * The prism sits on the XZ plane, centered at origin, with Y up.
 */
function createIsoPrismGeometry(): THREE.BufferGeometry {
  const s = TILE_SIZE / 2;
  const d = TILE_DEPTH;

  // Diamond corners on XZ plane (Y = 0 is top)
  // North = -Z, East = +X, South = +Z, West = -X
  const n = [0, 0, -s];   // north
  const e = [s, 0, 0];    // east
  const so = [0, 0, s];   // south
  const w = [-s, 0, 0];   // west

  // Bottom corners (Y = -d)
  const sb = [0, -d, s];
  const wb = [-s, -d, 0];
  const eb = [s, -d, 0];

  // Vertices: top face (2 triangles) + left face (2 triangles) + right face (2 triangles)
  const positions: number[] = [];
  const normals: number[] = [];

  // Top face (N-E-S, N-S-W) - normal up
  positions.push(...n, ...e, ...so);
  positions.push(...n, ...so, ...w);
  const topNormal = [0, 1, 0];
  for (let i = 0; i < 6; i++) normals.push(...topNormal);

  // Left face (W-S-SB, W-SB-WB) - facing left/south-west
  positions.push(...w, ...so, ...sb);
  positions.push(...w, ...sb, ...wb);
  const leftNormal = [-0.707, 0, 0.707];
  for (let i = 0; i < 6; i++) normals.push(...leftNormal);

  // Right face (E-S-SB, E-SB-EB) - facing right/south-east
  positions.push(...so, ...e, ...eb);
  positions.push(...so, ...eb, ...sb);
  const rightNormal = [0.707, 0, 0.707];
  for (let i = 0; i < 6; i++) normals.push(...rightNormal);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

  return geometry;
}

/**
 * Convert hex color (0xRRGGBB) to RGB floats
 */
function hexToRGB(hex: number): [number, number, number] {
  return [
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
  ];
}

/**
 * Slightly lighten/darken a color for checkerboard
 */
function adjustColor(rgb: [number, number, number], amount: number): [number, number, number] {
  return [
    Math.max(0, Math.min(1, rgb[0] + amount)),
    Math.max(0, Math.min(1, rgb[1] + amount)),
    Math.max(0, Math.min(1, rgb[2] + amount)),
  ];
}

export interface GroundChunkData {
  mesh: THREE.InstancedMesh;
  instanceCount: number;
}

/**
 * Build ground instances for a range of tiles
 */
export function buildGroundChunk(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  mapWidth: number,
  mapHeight: number,
  parcels: RenderableParcel[],
): GroundChunkData {
  const geometry = createIsoPrismGeometry();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });

  const tileCount = (maxX - minX) * (maxY - minY);
  const count = Math.min(tileCount, MAX_INSTANCES_PER_MESH);
  const mesh = new THREE.InstancedMesh(geometry, material, count);

  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  // Build a quick parcel lookup (block key → terrain type)
  const parcelMap = new Map<string, string>();
  for (const p of parcels) {
    parcelMap.set(`${p.blockX}_${p.blockY}`, p.terrain ?? 'plains');
  }

  let idx = 0;
  for (let gy = minY; gy < maxY && gy < mapHeight; gy++) {
    for (let gx = minX; gx < maxX && gx < mapWidth; gx++) {
      if (gx < 0 || gy < 0 || idx >= count) continue;

      // Determine if tile is within a parcel block
      const tileLocalX = ((gx - BLOCK_OFFSET_X) % BLOCK_STRIDE + BLOCK_STRIDE) % BLOCK_STRIDE;
      const tileLocalY = ((gy - BLOCK_OFFSET_Y) % BLOCK_STRIDE + BLOCK_STRIDE) % BLOCK_STRIDE;

      const blockX = Math.floor((gx - BLOCK_OFFSET_X) / BLOCK_STRIDE);
      const blockY = Math.floor((gy - BLOCK_OFFSET_Y) / BLOCK_STRIDE);
      const blockKey = `${blockX}_${blockY}`;
      const parcelTerrain = parcelMap.get(blockKey);
      const isParcel = parcelTerrain !== undefined &&
        tileLocalX < BLOCK_SIZE && tileLocalY < BLOCK_SIZE;

      // Detect if tile is on parcel edge (outermost ring)
      const isParcelEdge = isParcel && (
        tileLocalX === 0 || tileLocalX === BLOCK_SIZE - 1 ||
        tileLocalY === 0 || tileLocalY === BLOCK_SIZE - 1
      );

      // All tiles sit on the ground plane (y=0)
      dummy.position.set(gx * TILE_SIZE, 0, gy * TILE_SIZE);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);

      // Color: terrain-based for parcels, base earth for everything else
      const isLight = (gx + gy) % 2 === 0;
      const baseColors = (isParcel && parcelTerrain)
        ? (TERRAIN_GROUND_COLORS[parcelTerrain] ?? GROUND_COLORS.parcel)
        : GROUND_COLORS.base;
      const topRGB = hexToRGB(baseColors.top);
      let adjusted = isLight ? adjustColor(topRGB, 0.03) : adjustColor(topRGB, -0.03);

      // Brighten edge tiles to create visible parcel borders
      if (isParcelEdge) {
        adjusted = adjustColor(adjusted, PARCEL_BORDER_BRIGHTNESS);
      }

      tmpColor.setRGB(adjusted[0], adjusted[1], adjusted[2]);
      mesh.setColorAt(idx, tmpColor);
      idx++;
    }
  }

  mesh.count = idx;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  // InstancedMesh bounding box is computed from base geometry (tiny diamond),
  // not from instance positions. Disable frustum culling so it always renders.
  mesh.frustumCulled = false;

  return { mesh, instanceCount: idx };
}

/**
 * Dispose a ground chunk
 */
export function disposeGroundChunk(data: GroundChunkData): void {
  data.mesh.geometry.dispose();
  (data.mesh.material as THREE.Material).dispose();
}
