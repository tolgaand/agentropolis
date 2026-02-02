/**
 * V2Assets - GLB scene loading for Infinitown-style pre-composed blocks
 *
 * loadBlock: GLB → THREE.Group (complete block scene with all children)
 * fixMaterials: Fix metalness/roughness on all meshes in scene
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ASSET_BASE } from './V2Config';

const loader = new GLTFLoader();

/** Cache loaded block templates to avoid re-loading */
const blockCache = new Map<string, THREE.Group>();

/**
 * Fix materials on all meshes in a scene group.
 * KayKit assets have high metalness which looks wrong without env map.
 */
function fixMaterials(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const mat = child.material as THREE.MeshStandardMaterial;
      if (mat) {
        mat.metalness = 0;
        mat.roughness = 1.0;
        if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      }
      // Enable shadows
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

/**
 * Load a complete GLB scene as a template.
 * Returns a Group that can be .clone()'d for each placement.
 */
export async function loadBlock(filename: string): Promise<THREE.Group> {
  // Check cache
  const cached = blockCache.get(filename);
  if (cached) return cached;

  const gltf = await loader.loadAsync(ASSET_BASE + filename);
  const group = gltf.scene;
  group.name = filename.replace('.glb', '');

  fixMaterials(group);

  blockCache.set(filename, group);
  return group;
}

/**
 * Clone a block template for placement.
 * Deep clone ensures independent transforms.
 */
export function cloneBlock(template: THREE.Group): THREE.Group {
  return template.clone(true);
}

/**
 * Load all block types and road assets in parallel.
 * Returns a map of filename → template Group.
 */
export async function loadAllAssets(
  filenames: string[],
): Promise<Map<string, THREE.Group>> {
  const results = await Promise.all(
    filenames.map(async (f) => {
      try {
        const group = await loadBlock(f);
        return [f, group] as [string, THREE.Group];
      } catch (err) {
        console.warn(`[V2] Failed to load ${f}:`, err);
        return null;
      }
    }),
  );

  const map = new Map<string, THREE.Group>();
  for (const r of results) {
    if (r) map.set(r[0], r[1]);
  }
  return map;
}
