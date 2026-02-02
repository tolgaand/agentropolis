/**
 * ThreeBuildings3D - Parcel-filling compound rendering
 *
 * Groups buildings by parcel and renders ONE cohesive compound per parcel
 * that fills the entire 20x20 area. Theme is detected from building types.
 * Preserves userData for picking (buildingId, gridX, gridY).
 */

import * as THREE from 'three';
import { TILE_SIZE, BLOCK_SIZE, WORLD_COLORS } from './ThreeConfig';
import { ProceduralBuildings, detectTheme, type CompoundTheme } from './ProceduralBuildings';
import type { RenderableBuilding, RenderableParcel } from '../types';

export interface BuildingGroup3D {
  group: THREE.Group;
  buildingMeshes: Map<string, THREE.Object3D>;
  shadowMeshes: THREE.Mesh[];
}

// Shared procedural builder instance
const proceduralBuilder = new ProceduralBuildings();

// Border padding in tiles (buildings start at tile 2)
const BORDER_PADDING = 2;

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
 * Simple hash for deterministic seed from parcel ID string
 */
function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Build the building group using compound system.
 * Groups buildings by parcel, detects theme, creates one compound per parcel.
 */
export async function buildBuildingGroup3D(
  buildings: RenderableBuilding[],
  worldId?: string,
  parcels?: RenderableParcel[],
): Promise<BuildingGroup3D> {
  const group = new THREE.Group();
  const buildingMeshes = new Map<string, THREE.Object3D>();
  const shadowMeshes: THREE.Mesh[] = [];

  const factionColor = WORLD_COLORS[worldId ?? ''] ?? 0x7b68ee;

  // Group buildings by parcelId
  const parcelGroups = new Map<string, RenderableBuilding[]>();
  for (const building of buildings) {
    const pid = building.parcelId;
    if (!parcelGroups.has(pid)) parcelGroups.set(pid, []);
    parcelGroups.get(pid)!.push(building);
  }

  // Build parcel lookup for theme + bounds
  const parcelMap = new Map<string, RenderableParcel>();
  if (parcels) {
    for (const p of parcels) parcelMap.set(p.id, p);
  }

  for (const [parcelId, parcelBuildings] of parcelGroups) {
    // Detect theme from building types
    const buildingTypes = parcelBuildings.map((b) => b.type ?? 'farm');
    const parcelData = parcelMap.get(parcelId);

    // Use parcel's theme if available, otherwise detect from buildings
    let theme: CompoundTheme;
    if (parcelData?.theme) {
      // Map parcel theme names to compound themes
      const themeMap: Record<string, CompoundTheme> = {
        farming: 'farming',
        military: 'military',
        trade: 'trade',
        mining: 'mining',
        noble: 'noble',
        residential: 'residential',
        mixed: 'mixed',
      };
      theme = themeMap[parcelData.theme] ?? detectTheme(buildingTypes);
    } else {
      theme = detectTheme(buildingTypes);
    }

    // Compute parcel center
    let centerX: number, centerZ: number;
    if (parcelData) {
      // Use parcel bounds — center of tile indices [x, x+width-1]
      centerX = (parcelData.bounds.x + (parcelData.bounds.width - 1) / 2) * TILE_SIZE;
      centerZ = (parcelData.bounds.y + (parcelData.bounds.height - 1) / 2) * TILE_SIZE;
    } else {
      // Estimate from building positions
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const b of parcelBuildings) {
        minX = Math.min(minX, b.coords.x);
        minY = Math.min(minY, b.coords.y);
        maxX = Math.max(maxX, b.coords.x);
        maxY = Math.max(maxY, b.coords.y);
      }
      // Approximate parcel origin from min coords (buildings start at BORDER_PADDING)
      const parcelOriginX = minX - BORDER_PADDING;
      const parcelOriginY = minY - BORDER_PADDING;
      centerX = (parcelOriginX + BLOCK_SIZE / 2) * TILE_SIZE;
      centerZ = (parcelOriginY + BLOCK_SIZE / 2) * TILE_SIZE;
    }

    // Average level
    const avgLevel = Math.round(
      parcelBuildings.reduce((sum, b) => sum + (b.level ?? 1), 0) / parcelBuildings.length
    );

    // Create compound
    const result = proceduralBuilder.createCompound({
      theme,
      factionColor,
      level: Math.max(1, Math.min(5, avgLevel)),
      centerX,
      centerZ,
      seed: hashString(parcelId),
    });

    const compoundGroup = result.group;

    // Attach building data from first building (for raycaster picking on parcel)
    const primaryBuilding = parcelBuildings[0];
    attachBuildingData(compoundGroup, primaryBuilding);

    group.add(compoundGroup);

    // Register all buildings in this parcel for hover/selection
    for (const building of parcelBuildings) {
      buildingMeshes.set(building.id, compoundGroup);
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
  // Track disposed groups to avoid double-dispose (multiple buildings share compound)
  const disposed = new Set<THREE.Object3D>();
  for (const obj of data.buildingMeshes.values()) {
    if (disposed.has(obj)) continue;
    disposed.add(obj);
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        // Don't dispose materials — they are cached by ProceduralBuildings
        // and will be reused across rebuilds. ProceduralBuildings.dispose()
        // handles material cleanup on renderer teardown.
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
