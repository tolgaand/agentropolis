/**
 * ThreeBuildings3D - Medieval 3D building rendering with GLTF models
 *
 * Loads building models from combined medieval GLTF scene by building type.
 * Buildings without GLTF models get procedural 3D box placeholders.
 * Preserves userData for picking (buildingId, gridX, gridY).
 */

import * as THREE from 'three';
import { TILE_SIZE, WORLD_COLORS } from './ThreeConfig';
import { ThreeModelLoader } from './ThreeModelLoader';
import type { RenderableBuilding } from '../types';

export interface BuildingGroup3D {
  group: THREE.Group;
  buildingMeshes: Map<string, THREE.Object3D>;
  shadowMeshes: THREE.Mesh[];
}

// Medieval building procedural sizes (used when GLTF not available)
const PROCEDURAL_SIZES: Record<string, { w: number; h: number; d: number }> = {
  farm:       { w: 1.2, h: 1.2, d: 1.2 },
  lumberyard: { w: 1.3, h: 1.3, d: 1.3 },
  quarry:     { w: 1.2, h: 1.0, d: 1.2 },
  iron_mine:  { w: 1.3, h: 1.1, d: 1.3 },
  market:     { w: 1.6, h: 1.4, d: 1.2 },
  barracks:   { w: 1.8, h: 2.0, d: 1.8 },
  stable:     { w: 1.6, h: 1.5, d: 1.2 },
  watchtower: { w: 0.8, h: 2.5, d: 0.8 },
  wall:       { w: 1.8, h: 1.5, d: 0.6 },
  castle:     { w: 2.5, h: 3.5, d: 2.5 },
  academy:    { w: 2.0, h: 2.8, d: 2.0 },
};

const DEFAULT_SIZE = { w: 1.2, h: 1.5, d: 1.2 };

/**
 * Create a procedural 3D box as placeholder for buildings without GLTF models
 */
function createProceduralBuilding(
  building: RenderableBuilding,
  worldId?: string,
): THREE.Mesh {
  const size = PROCEDURAL_SIZES[building.type] ?? DEFAULT_SIZE;
  const width = TILE_SIZE * size.w;
  const height = TILE_SIZE * size.h;
  const depth = TILE_SIZE * size.d;

  const geometry = new THREE.BoxGeometry(width, height, depth);

  const baseColors = [0x8b7355, 0x9b8565, 0x7b6345, 0xa09080, 0x8b8060];
  const baseColor = baseColors[Math.floor(Math.random() * baseColors.length)];
  const themeColor = WORLD_COLORS[worldId ?? ''] ?? 0x7b68ee;
  const material = new THREE.MeshStandardMaterial({
    color: baseColor,
    emissive: new THREE.Color(themeColor),
    emissiveIntensity: 0.08,
    roughness: 0.85,
    metalness: 0.05,
  });

  const mesh = new THREE.Mesh(geometry, material);

  const worldX = building.coords.x * TILE_SIZE;
  const worldZ = building.coords.y * TILE_SIZE;
  mesh.position.set(worldX, height / 2, worldZ);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

/**
 * Create shadow beneath a building
 */
function createBuildingShadow(building: RenderableBuilding, radius?: number): THREE.Mesh {
  const r = radius ?? TILE_SIZE * 0.4;
  const geometry = new THREE.CircleGeometry(r, 16);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  const worldX = building.coords.x * TILE_SIZE;
  const worldZ = building.coords.y * TILE_SIZE;
  mesh.position.set(worldX, 0.01, worldZ);
  mesh.renderOrder = building.drawOrder - 1;

  return mesh;
}

/**
 * Apply subtle kingdom accent to 3D models WITHOUT drowning original colors.
 */
function applyNeonEmissive(model: THREE.Group, worldId?: string): void {
  const color = new THREE.Color(WORLD_COLORS[worldId ?? ''] ?? 0x7b68ee);

  model.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
      child.material = child.material.clone();
      child.material.emissive = color;
      child.material.emissiveIntensity = 0.08;
    }
  });
}

/**
 * Attach building userData to all children for raycaster picking
 */
function attachBuildingData(obj: THREE.Object3D, building: RenderableBuilding): void {
  obj.traverse((child) => {
    child.userData = {
      type: 'building',
      buildingId: building.id,
      gridX: building.coords.x,
      gridY: building.coords.y,
    };
  });
}

/**
 * Build the building group with 3D models (async — loads GLTF models)
 * Uses building.type for model lookup instead of spriteId.
 */
export async function buildBuildingGroup3D(
  buildings: RenderableBuilding[],
  modelLoader: ThreeModelLoader,
  worldId?: string,
): Promise<BuildingGroup3D> {
  const group = new THREE.Group();
  const buildingMeshes = new Map<string, THREE.Object3D>();
  const shadowMeshes: THREE.Mesh[] = [];

  // Separate buildings with 3D models from those needing procedural fallback
  const modelPromises: Array<{
    building: RenderableBuilding;
    promise: Promise<THREE.Group | null>;
  }> = [];

  for (const building of buildings) {
    if (modelLoader.hasType(building.type)) {
      // Use coords hash as variant seed for deterministic model selection
      const variantSeed = building.coords.x * 1000 + building.coords.y;
      modelPromises.push({
        building,
        promise: modelLoader.loadByType(building.type, variantSeed),
      });
    } else {
      // Procedural 3D box
      const mesh = createProceduralBuilding(building, worldId);
      attachBuildingData(mesh, building);
      group.add(mesh);
      buildingMeshes.set(building.id, mesh);

      const shadow = createBuildingShadow(building);
      group.add(shadow);
      shadowMeshes.push(shadow);
    }
  }

  // Resolve 3D model loading
  const results = await Promise.allSettled(
    modelPromises.map(async ({ building, promise }) => {
      const model = await promise;
      return { building, model };
    }),
  );

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const { building, model } = result.value;

    if (model) {
      const entry = modelLoader.getTypeEntry(building.type);
      const yOffset = entry?.yOffset ?? 0;
      const fw = entry?.footprint?.[0] ?? 1;
      const fh = entry?.footprint?.[1] ?? 1;
      const worldX = building.coords.x * TILE_SIZE + ((fw - 1) * TILE_SIZE) / 2;
      const worldZ = building.coords.y * TILE_SIZE + ((fh - 1) * TILE_SIZE) / 2;

      model.position.set(worldX, yOffset, worldZ);

      applyNeonEmissive(model, worldId);

      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      attachBuildingData(model, building);
      group.add(model);
      buildingMeshes.set(building.id, model);

      const shadowRadius = (entry?.footprint?.[0] ?? 1) * TILE_SIZE * 0.3;
      const shadow = createBuildingShadow(building, shadowRadius);
      group.add(shadow);
      shadowMeshes.push(shadow);
    } else {
      // GLTF load failed — procedural fallback
      const mesh = createProceduralBuilding(building, worldId);
      attachBuildingData(mesh, building);
      group.add(mesh);
      buildingMeshes.set(building.id, mesh);

      const shadow = createBuildingShadow(building);
      group.add(shadow);
      shadowMeshes.push(shadow);
    }
  }

  return { group, buildingMeshes, shadowMeshes };
}

/**
 * Set hover highlight on a building
 */
export function setBuildingHover3D(
  buildingGroup: BuildingGroup3D,
  buildingId: string | null,
): void {
  for (const [id, obj] of buildingGroup.buildingMeshes) {
    const isHovered = id === buildingId;

    obj.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.emissiveIntensity = isHovered ? 0.3 : 0.08;
      }
    });
  }
}

/**
 * Dispose building group resources
 */
export function disposeBuildingGroup3D(data: BuildingGroup3D): void {
  for (const obj of data.buildingMeshes.values()) {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) mat.dispose();
      }
    });
  }
  for (const shadow of data.shadowMeshes) {
    shadow.geometry.dispose();
    (shadow.material as THREE.Material).dispose();
  }
  data.group.clear();
  data.buildingMeshes.clear();
  data.shadowMeshes.length = 0;
}
