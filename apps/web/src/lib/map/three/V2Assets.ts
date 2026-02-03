/**
 * V2Assets - GLB geometry/material extraction + InstancedMesh factory
 *
 * extractAsset: GLB → { geometry, material } (shared, not cloned per instance)
 * createInstancedMesh: geometry + material → InstancedMesh with count=0
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ASSET_BASE, ASSET_REGISTRY } from './V2Config';

const loader = new GLTFLoader();

export interface ExtractedAsset {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

const assetCache = new Map<string, ExtractedAsset>();

/**
 * Extract geometry and material from a GLB file.
 * Finds the first Mesh, clones its geometry (GLTF buffer sharing bug),
 * and fixes material properties for KayKit assets.
 */
export async function extractAsset(filename: string): Promise<ExtractedAsset> {
  const cached = assetCache.get(filename);
  if (cached) return cached;

  const gltf = await loader.loadAsync(ASSET_BASE + filename);
  let foundMesh: THREE.Mesh | null = null;

  // Find first mesh in the scene
  gltf.scene.traverse((child) => {
    if (!foundMesh && child instanceof THREE.Mesh) {
      foundMesh = child;
    }
  });

  if (!foundMesh) {
    throw new Error(`No mesh found in ${filename}`);
  }

  const mesh = foundMesh as THREE.Mesh;

  // Clone geometry — critical for GLTF shared buffer bug
  const geometry = mesh.geometry.clone();

  // Apply the mesh's world transform to the geometry so instances just need position/rotation
  mesh.updateWorldMatrix(true, false);
  geometry.applyMatrix4(mesh.matrixWorld);

  // Share material, fix properties
  const srcMat = mesh.material as THREE.MeshStandardMaterial;
  const material = srcMat.clone();
  material.metalness = 0;
  material.roughness = 1.0;
  if (material.map) {
    material.map.colorSpace = THREE.SRGBColorSpace;
  }

  const asset: ExtractedAsset = { geometry, material };
  assetCache.set(filename, asset);
  return asset;
}

/**
 * Create an InstancedMesh from an extracted asset.
 * Starts with count=0, caller adds instances via setMatrixAt.
 */
export function createInstancedMesh(
  asset: ExtractedAsset,
  maxCount: number,
  castShadow = true,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(asset.geometry, asset.material, maxCount);
  mesh.count = 0;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Load all assets from the registry and return extracted geometry/material pairs.
 */
export async function loadAllRegistryAssets(): Promise<Map<string, ExtractedAsset>> {
  const entries = Object.entries(ASSET_REGISTRY);
  const results = await Promise.all(
    entries.map(async ([key, meta]) => {
      try {
        const asset = await extractAsset(meta.file);
        return [key, asset] as [string, ExtractedAsset];
      } catch (err) {
        console.warn(`[V2] Failed to load ${key} (${meta.file}):`, err);
        return null;
      }
    }),
  );

  const map = new Map<string, ExtractedAsset>();
  for (const r of results) {
    if (r) map.set(r[0], r[1]);
  }
  return map;
}
