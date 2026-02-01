/**
 * ThreeModelLoader - Medieval GLTF model loading with combined-scene node extraction
 *
 * Loads a single combined GLTF scene (medieval-city.gltf) and extracts
 * individual models by node name. Supports building-type-based lookup
 * with random variant selection.
 *
 * v5 manifest format maps buildingType → { nodes[], scale, footprint }
 * instead of the old spriteId → individual file approach.
 */

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MODEL_MANIFEST_PATH, TILE_SIZE } from './ThreeConfig';

export interface ModelTypeEntry {
  nodes: string[];
  props?: string[];
  scale: number;
  yOffset: number;
  footprint: [number, number];
}

export interface ModelManifest {
  version: number;
  source: string;
  buildings: Record<string, ModelTypeEntry>;
  environment: Record<string, ModelTypeEntry>;
  vehicles: Record<string, ModelTypeEntry>;
}

// Legacy interface kept for backward compat (roads/traffic check hasModel)
export interface ModelManifestEntry {
  path: string;
  scale: number;
  yOffset: number;
  category: string;
  footprint: [number, number];
}

interface CachedNode {
  scene: THREE.Group;
  entry: ModelTypeEntry;
}

export class ThreeModelLoader {
  private loader: GLTFLoader;
  private manifest: ModelManifest | null = null;
  private combinedScene: THREE.Group | null = null;
  private combinedLoading: Promise<THREE.Group | null> | null = null;
  private nodeCache = new Map<string, CachedNode>();

  constructor() {
    this.loader = new GLTFLoader();

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    dracoLoader.setDecoderConfig({ type: 'js' });
    this.loader.setDRACOLoader(dracoLoader);
  }

  /**
   * Load the manifest.json file
   */
  async loadManifest(): Promise<ModelManifest> {
    if (this.manifest) return this.manifest;

    const response = await fetch(MODEL_MANIFEST_PATH);
    if (!response.ok) {
      console.warn('[ModelLoader] Failed to load manifest, 3D models disabled');
      this.manifest = { version: 5, source: '', buildings: {}, environment: {}, vehicles: {} };
      return this.manifest;
    }

    this.manifest = await response.json();
    const buildingCount = Object.keys(this.manifest!.buildings).length;
    console.log(`[ModelLoader] Manifest v${this.manifest!.version} loaded: ${buildingCount} building types`);

    return this.manifest!;
  }

  /**
   * Load the combined GLTF scene (lazy, once)
   */
  private async loadCombinedScene(): Promise<THREE.Group | null> {
    if (this.combinedScene) return this.combinedScene;
    if (this.combinedLoading) return this.combinedLoading;

    if (!this.manifest?.source) return null;

    // Resolve source path relative to manifest location
    const manifestDir = MODEL_MANIFEST_PATH.substring(0, MODEL_MANIFEST_PATH.lastIndexOf('/'));
    const sourcePath = `${manifestDir}/${this.manifest.source}`;

    this.combinedLoading = new Promise<THREE.Group | null>((resolve) => {
      this.loader.load(
        sourcePath,
        (gltf: GLTF) => {
          this.combinedScene = gltf.scene;
          console.log('[ModelLoader] Combined GLTF loaded:', sourcePath);
          resolve(gltf.scene);
        },
        undefined,
        (err) => {
          console.warn('[ModelLoader] Failed to load combined GLTF:', err);
          resolve(null);
        },
      );
    });

    return this.combinedLoading;
  }

  /**
   * Extract a node by name from the combined scene.
   * Preserves parent rotation (needed because GLTF collections have Y-up→Z-up
   * or other orientation transforms on parent groups).
   */
  private extractNode(scene: THREE.Group, nodeName: string): THREE.Group | null {
    let found: THREE.Object3D | null = null;

    scene.traverse((child) => {
      if (!found && child.name === nodeName) {
        found = child;
      }
    });

    if (!found) return null;
    const foundNode = found as THREE.Object3D;

    // Compute the node's world matrix (includes all parent transforms like
    // collection rotations, scales, and positions from the combined GLTF scene)
    foundNode.updateWorldMatrix(true, false);
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    foundNode.matrixWorld.decompose(new THREE.Vector3(), worldQuat, worldScale);

    // Clone the node into a standalone group
    const clone = foundNode.clone(true);
    const group = new THREE.Group();
    group.add(clone);

    // Apply parent's cumulative rotation and scale, but reset position to origin.
    // normalizeToFootprint() will re-measure and re-scale to fit the tile grid,
    // so the parent's scale factor (e.g. 100x from Blender cm→m) gets handled there.
    clone.position.set(0, 0, 0);
    clone.quaternion.copy(worldQuat);
    clone.scale.copy(worldScale);

    return group;
  }

  // ─── Type-based API (new) ──────────────────────────────────────

  /**
   * Check if a building type has models in the manifest
   */
  hasType(buildingType: string): boolean {
    if (!this.manifest) return false;
    return buildingType in this.manifest.buildings;
  }

  /**
   * Get manifest entry for a building type
   */
  getTypeEntry(buildingType: string): ModelTypeEntry | null {
    if (!this.manifest) return null;
    return this.manifest.buildings[buildingType] ?? null;
  }

  /**
   * Load a model by building type. Picks a random variant from available nodes.
   * Returns a cloned THREE.Group ready for scene insertion.
   */
  async loadByType(buildingType: string, variantSeed?: number): Promise<THREE.Group | null> {
    const entry = this.getTypeEntry(buildingType);
    if (!entry || entry.nodes.length === 0) return null;

    const scene = await this.loadCombinedScene();
    if (!scene) return null;

    // Pick variant (deterministic if seed provided)
    const idx = variantSeed !== undefined
      ? Math.abs(variantSeed) % entry.nodes.length
      : Math.floor(Math.random() * entry.nodes.length);
    const nodeName = entry.nodes[idx];

    // Check cache
    const cacheKey = `building:${nodeName}`;
    if (this.nodeCache.has(cacheKey)) {
      return this.cloneNode(this.nodeCache.get(cacheKey)!);
    }

    // Extract from combined scene
    const extracted = this.extractNode(scene, nodeName);
    if (!extracted) {
      console.warn(`[ModelLoader] Node "${nodeName}" not found in combined GLTF`);
      return null;
    }

    // Bounding-box normalization: fit model into its footprint tiles
    this.normalizeToFootprint(extracted, entry);

    const cached: CachedNode = { scene: extracted, entry };
    this.nodeCache.set(cacheKey, cached);

    return this.cloneNode(cached);
  }

  /**
   * Load an environment model (tree, grass, stone, torch)
   */
  async loadEnvironment(envType: string, variantSeed?: number): Promise<THREE.Group | null> {
    if (!this.manifest) return null;
    const entry = this.manifest.environment[envType];
    if (!entry || entry.nodes.length === 0) return null;

    const scene = await this.loadCombinedScene();
    if (!scene) return null;

    const idx = variantSeed !== undefined
      ? Math.abs(variantSeed) % entry.nodes.length
      : Math.floor(Math.random() * entry.nodes.length);
    const nodeName = entry.nodes[idx];

    const cacheKey = `env:${nodeName}`;
    if (this.nodeCache.has(cacheKey)) {
      return this.cloneNode(this.nodeCache.get(cacheKey)!);
    }

    const extracted = this.extractNode(scene, nodeName);
    if (!extracted) return null;

    this.normalizeToFootprint(extracted, entry);

    const cached: CachedNode = { scene: extracted, entry };
    this.nodeCache.set(cacheKey, cached);

    return this.cloneNode(cached);
  }

  /**
   * Load a vehicle model (cart, boat)
   */
  async loadVehicle(vehicleType: string, variantSeed?: number): Promise<THREE.Group | null> {
    if (!this.manifest) return null;
    const entry = this.manifest.vehicles[vehicleType];
    if (!entry || entry.nodes.length === 0) return null;

    const scene = await this.loadCombinedScene();
    if (!scene) return null;

    const idx = variantSeed !== undefined
      ? Math.abs(variantSeed) % entry.nodes.length
      : Math.floor(Math.random() * entry.nodes.length);
    const nodeName = entry.nodes[idx];

    const cacheKey = `vehicle:${nodeName}`;
    if (this.nodeCache.has(cacheKey)) {
      return this.cloneNode(this.nodeCache.get(cacheKey)!);
    }

    const extracted = this.extractNode(scene, nodeName);
    if (!extracted) return null;

    this.normalizeToFootprint(extracted, entry);

    const cached: CachedNode = { scene: extracted, entry };
    this.nodeCache.set(cacheKey, cached);

    return this.cloneNode(cached);
  }

  // ─── Legacy spriteId API (backward compat) ─────────────────────

  /**
   * Check if a spriteId has a 3D model (legacy — always false for v5 manifest)
   */
  hasModel(_spriteId: number): boolean {
    return false;
  }

  /**
   * Get manifest entry for a spriteId (legacy — always null for v5)
   */
  getEntry(_spriteId: number): ModelManifestEntry | null {
    return null;
  }

  /**
   * Load a model by spriteId (legacy — always null for v5)
   */
  async loadModel(_spriteId: number): Promise<THREE.Group | null> {
    return null;
  }

  // ─── Internal ──────────────────────────────────────────────────

  /**
   * Normalize a model to fit within its footprint tiles using bounding box measurement.
   * The manifest `scale` becomes a fine-tuning multiplier (1.0 = exactly fills footprint).
   */
  private normalizeToFootprint(group: THREE.Group, entry: ModelTypeEntry): void {
    // Measure the model's bounding box in its original Blender-space size
    const bbox = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    // Use horizontal dimensions (X, Z) to compute normalization
    const horizontalMax = Math.max(size.x, size.z);
    if (horizontalMax < 0.001) return; // degenerate model

    // Target size: largest footprint dimension * tile size * 0.95 (tight fit per Blender testing)
    const footprintMax = Math.max(entry.footprint[0], entry.footprint[1]);
    const targetSize = footprintMax * TILE_SIZE * 0.95;

    // normScale brings model to exactly fill footprint; entry.scale fine-tunes
    const normScale = (targetSize / horizontalMax) * entry.scale;
    group.scale.setScalar(normScale);

    // Re-center the model so its base sits on the ground plane
    // Recompute bbox after scaling
    const scaledBbox = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    scaledBbox.getCenter(center);

    // Center horizontally, sit on ground (y=0)
    group.position.set(-center.x, -scaledBbox.min.y + (entry.yOffset || 0), -center.z);
  }

  private cloneNode(cached: CachedNode): THREE.Group {
    const clone = cached.scene.clone(true);

    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map(m => m.clone());
        } else {
          child.material = child.material.clone();
        }
      }
    });

    return clone;
  }

  /**
   * Preload the combined GLTF scene
   */
  async preloadAll(): Promise<void> {
    await this.loadCombinedScene();
    console.log('[ModelLoader] Preload complete');
  }

  /**
   * Dispose all cached models and the combined scene
   */
  dispose(): void {
    for (const cached of this.nodeCache.values()) {
      cached.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const mat of mats) mat.dispose();
        }
      });
    }
    this.nodeCache.clear();
    this.combinedScene = null;
    this.combinedLoading = null;
  }
}
