/**
 * ThreeDecorations - Procedural decoration system
 *
 * Places simple geometric props (barrels, crates, trees, etc.) around buildings
 * within parcels using deterministic pseudo-random placement.
 */

import * as THREE from 'three';
import type { RenderableBuilding, RenderableParcel } from '../types';
import { TILE_SIZE, BLOCK_SIZE, BLOCK_STRIDE, BLOCK_OFFSET_X, BLOCK_OFFSET_Y } from './ThreeConfig';

export interface DecorationGroup {
  group: THREE.Group;
}

// ============================================================================
// Deterministic Random
// ============================================================================

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 16807 + 0) % 2147483647;
    return this.seed / 2147483647;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  choose<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

// ============================================================================
// Procedural Props
// ============================================================================

const ProceduralProps = {
  /**
   * Barrel: Simple cylinder
   */
  createBarrel(): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(0.2, 0.18, 0.4, 12);
    const material = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.position.y = 0.2;
    return mesh;
  },

  /**
   * Crate: Simple box
   */
  createCrate(): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const material = new THREE.MeshLambertMaterial({ color: 0x654321 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.position.y = 0.15;
    return mesh;
  },

  /**
   * Well: Cylinder base with cone roof
   */
  createWell(): THREE.Group {
    const group = new THREE.Group();

    // Base cylinder
    const baseGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.5, 16);
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x808080 });
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.y = 0.25;
    base.castShadow = true;
    group.add(base);

    // Cone roof
    const roofGeom = new THREE.ConeGeometry(0.5, 0.4, 4);
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
    const roof = new THREE.Mesh(roofGeom, roofMat);
    roof.position.y = 0.8;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    return group;
  },

  /**
   * Hay bale: Box geometry
   */
  createHayBale(): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(0.4, 0.3, 0.3);
    const material = new THREE.MeshLambertMaterial({ color: 0xdaa520 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.position.y = 0.15;
    return mesh;
  },

  /**
   * Tree: Cylinder trunk + sphere canopy
   */
  createTree(): THREE.Group {
    const group = new THREE.Group();

    // Trunk
    const trunkGeom = new THREE.CylinderGeometry(0.1, 0.15, 0.8, 8);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c4033 });
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.y = 0.4;
    trunk.castShadow = true;
    group.add(trunk);

    // Canopy
    const canopyGeom = new THREE.SphereGeometry(0.5, 8, 8);
    const canopyMat = new THREE.MeshLambertMaterial({ color: 0x228b22 });
    const canopy = new THREE.Mesh(canopyGeom, canopyMat);
    canopy.position.y = 1.0;
    canopy.castShadow = true;
    group.add(canopy);

    return group;
  },

  /**
   * Rock: Dodecahedron with vertex noise
   */
  createRock(): THREE.Mesh {
    const geometry = new THREE.DodecahedronGeometry(0.25);

    // Apply vertex noise for irregular rock shape
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      // Simple deterministic noise based on position
      const noise = (Math.sin(x * 10) + Math.cos(y * 10) + Math.sin(z * 10)) * 0.05;

      positions.setX(i, x + noise);
      positions.setY(i, y + noise);
      positions.setZ(i, z + noise);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();

    const material = new THREE.MeshLambertMaterial({ color: 0x808080 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.position.y = 0.25;
    return mesh;
  },

  /**
   * Torch: Pole with glowing flame
   */
  createTorch(): THREE.Group {
    const group = new THREE.Group();

    // Pole
    const poleGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x5c4033 });
    const pole = new THREE.Mesh(poleGeom, poleMat);
    pole.position.y = 0.4;
    pole.castShadow = true;
    group.add(pole);

    // Flame
    const flameGeom = new THREE.SphereGeometry(0.1, 8, 8);
    const flameMat = new THREE.MeshLambertMaterial({
      color: 0xff6600,
      emissive: 0xff6600,
      emissiveIntensity: 1.0,
    });
    const flame = new THREE.Mesh(flameGeom, flameMat);
    flame.position.y = 0.9;
    group.add(flame);

    return group;
  },
};

// ============================================================================
// Decoration Placement
// ============================================================================

/**
 * Calculate world position for a tile within a parcel
 */
function getTileWorldPosition(
  parcel: RenderableParcel,
  tileX: number,
  tileY: number,
): { x: number; z: number } {
  const x = (parcel.blockX * BLOCK_STRIDE + BLOCK_OFFSET_X + tileX) * TILE_SIZE;
  const z = (parcel.blockY * BLOCK_STRIDE + BLOCK_OFFSET_Y + tileY) * TILE_SIZE;
  return { x, z };
}

/**
 * Check if a tile is occupied by a building
 */
function isTileOccupied(
  tileX: number,
  tileY: number,
  buildings: RenderableBuilding[],
): boolean {
  for (const building of buildings) {
    // Buildings occupy a small area around their coords
    // Assume 1x1 tile occupation for simplicity
    const bx = building.coords.x;
    const by = building.coords.y;

    if (Math.abs(tileX - bx) < 1 && Math.abs(tileY - by) < 1) {
      return true;
    }
  }
  return false;
}

/**
 * Get prop types based on parcel theme
 */
function getPropTypesForTheme(
  theme: string | undefined,
): (() => THREE.Object3D)[] {
  const allProps = [
    ProceduralProps.createBarrel,
    ProceduralProps.createCrate,
    ProceduralProps.createTree,
    ProceduralProps.createRock,
  ];

  // Theme-specific prop weights
  if (theme?.includes('farm')) {
    return [
      ProceduralProps.createHayBale,
      ProceduralProps.createHayBale,
      ProceduralProps.createBarrel,
      ProceduralProps.createTree,
    ];
  }

  if (theme?.includes('military') || theme?.includes('barracks')) {
    return [
      ProceduralProps.createBarrel,
      ProceduralProps.createTorch,
      ProceduralProps.createCrate,
      ProceduralProps.createTorch,
    ];
  }

  if (theme?.includes('trade') || theme?.includes('market')) {
    return [
      ProceduralProps.createCrate,
      ProceduralProps.createCrate,
      ProceduralProps.createBarrel,
      ProceduralProps.createBarrel,
    ];
  }

  // Default: natural mix
  return allProps;
}

/**
 * Build decoration group for a parcel
 */
export async function buildParcelDecorations(
  parcel: RenderableParcel,
  buildings: RenderableBuilding[],
): Promise<DecorationGroup> {
  const group = new THREE.Group();
  group.name = `decorations_${parcel.id}`;

  // Deterministic RNG based on parcel ID
  const seed = hashString(parcel.id);
  const rng = new SeededRandom(seed);

  // Number of props: fewer props if more buildings
  const buildingCount = buildings.length;
  const propCount = rng.nextInt(3, 8) - Math.min(buildingCount, 4);
  const actualPropCount = Math.max(propCount, 0);

  // Get prop types based on theme
  const propTypes = getPropTypesForTheme(parcel.theme);

  // Place props in empty tiles
  const maxAttempts = actualPropCount * 10; // Prevent infinite loops
  let attempts = 0;

  while (group.children.length < actualPropCount && attempts < maxAttempts) {
    attempts++;

    // Random tile within parcel
    const tileX = rng.nextInt(1, BLOCK_SIZE - 2);
    const tileY = rng.nextInt(1, BLOCK_SIZE - 2);

    // Skip if occupied by building
    if (isTileOccupied(tileX, tileY, buildings)) {
      continue;
    }

    // Create prop
    const propType = rng.choose(propTypes);
    const prop = propType();

    // Position prop at tile center
    const worldPos = getTileWorldPosition(parcel, tileX + 0.5, tileY + 0.5);
    prop.position.x = worldPos.x;
    prop.position.z = worldPos.z;

    // Random rotation
    prop.rotation.y = rng.next() * Math.PI * 2;

    group.add(prop);
  }

  return { group };
}

/**
 * Dispose decoration group
 */
export function disposeDecorationGroup(data: DecorationGroup): void {
  data.group.traverse((child) => {
    if (child instanceof THREE.InstancedMesh || child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) mat.dispose();
    }
  });
  data.group.clear();
}
