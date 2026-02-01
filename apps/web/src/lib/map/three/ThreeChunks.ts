/**
 * ThreeChunks - Chunk streaming system for Three.js renderer
 *
 * Manages loading/unloading of ground chunks based on camera position.
 * Load radius: LOAD_RADIUS chunks around camera.
 * Unload radius: UNLOAD_RADIUS (2x load) - chunks outside are disposed.
 */

import * as THREE from 'three';
import {
  CHUNK_SIZE_BLOCKS,
  BLOCK_STRIDE,
  TILE_SIZE,
  LOAD_RADIUS,
  UNLOAD_RADIUS,
} from './ThreeConfig';
import {
  buildGroundChunk,
  disposeGroundChunk,
  type GroundChunkData,
} from './ThreeGround';
import type { RenderableParcel } from '../types';

const CHUNK_SIZE_TILES = BLOCK_STRIDE * CHUNK_SIZE_BLOCKS;

interface LoadedChunk {
  chunkX: number;
  chunkY: number;
  ground: GroundChunkData;
  group: THREE.Group;
}

export class ThreeChunks {
  private chunks = new Map<string, LoadedChunk>();
  private scene: THREE.Scene;
  private mapWidth = 0;
  private mapHeight = 0;
  private parcels: RenderableParcel[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Update map data (called when socket data changes)
   */
  setMapData(mapWidth: number, mapHeight: number, parcels: RenderableParcel[]): void {
    const changed = this.mapWidth !== mapWidth ||
      this.mapHeight !== mapHeight ||
      this.parcels !== parcels;

    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    this.parcels = parcels;

    if (changed) {
      // Invalidate all chunks (rebuild on next update)
      this.disposeAll();
    }
  }

  /**
   * Update visible chunks based on camera position
   */
  update(cameraPanX: number, cameraPanZ: number): void {
    if (this.mapWidth === 0) return;

    // Camera world position → chunk coordinates
    const centerChunkX = Math.floor(cameraPanX / (CHUNK_SIZE_TILES * TILE_SIZE));
    const centerChunkZ = Math.floor(cameraPanZ / (CHUNK_SIZE_TILES * TILE_SIZE));

    // Load chunks within radius
    for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
      for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) {
        const cx = centerChunkX + dx;
        const cz = centerChunkZ + dz;
        if (cx < 0 || cz < 0) continue;

        const key = `${cx}_${cz}`;
        if (!this.chunks.has(key)) {
          this.loadChunk(cx, cz);
        }
      }
    }

    // Unload chunks outside 2x radius
    for (const [key, chunk] of this.chunks) {
      const dx = chunk.chunkX - centerChunkX;
      const dz = chunk.chunkY - centerChunkZ;
      if (Math.abs(dx) > UNLOAD_RADIUS || Math.abs(dz) > UNLOAD_RADIUS) {
        this.unloadChunk(key);
      }
    }
  }

  /**
   * Load a chunk at the given chunk coordinates
   */
  private loadChunk(chunkX: number, chunkY: number): void {
    const startTileX = chunkX * CHUNK_SIZE_TILES;
    const startTileY = chunkY * CHUNK_SIZE_TILES;
    const endTileX = startTileX + CHUNK_SIZE_TILES;
    const endTileY = startTileY + CHUNK_SIZE_TILES;

    // Build ground
    const ground = buildGroundChunk(
      startTileX, startTileY,
      endTileX, endTileY,
      this.mapWidth, this.mapHeight,
      this.parcels,
    );

    // Group and add to scene
    const group = new THREE.Group();
    group.name = `chunk_${chunkX}_${chunkY}`;
    group.add(ground.mesh);

    this.scene.add(group);

    this.chunks.set(`${chunkX}_${chunkY}`, {
      chunkX,
      chunkY,
      ground,
      group,
    });
  }

  /**
   * Unload and dispose a chunk
   */
  private unloadChunk(key: string): void {
    const chunk = this.chunks.get(key);
    if (!chunk) return;

    this.scene.remove(chunk.group);
    disposeGroundChunk(chunk.ground);
    chunk.group.clear();

    this.chunks.delete(key);
  }

  /**
   * Get the number of loaded chunks
   */
  getLoadedCount(): number {
    return this.chunks.size;
  }

  /**
   * Dispose all chunks
   */
  disposeAll(): void {
    for (const key of [...this.chunks.keys()]) {
      this.unloadChunk(key);
    }
  }
}
