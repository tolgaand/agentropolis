/**
 * ThreeParcelBorders - 3D fence/wall rendering around parcel perimeters
 *
 * Renders medieval-themed borders (wood fences, stone walls, posts with torches)
 * using instanced meshes for performance. Different border styles based on parcel theme.
 */

import * as THREE from 'three';
import {
  TILE_SIZE,
  BLOCK_SIZE,
  BLOCK_STRIDE,
  BLOCK_OFFSET_X,
  BLOCK_OFFSET_Y,
} from './ThreeConfig';
import type { RenderableParcel } from '../types';

// Border style definitions
const BORDER_STYLES = {
  wood: {
    themes: ['farming', 'mixed'] as const,
    color: 0x6B4226,
    postColor: 0x5A3520,
    height: 0.4,
    postHeight: 0.5,
    postSpacing: 2,
  },
  stone: {
    themes: ['military', 'noble'] as const,
    color: 0x7a7068,
    height: 0.6,
    hasCrenellation: true,
    crenellationSpacing: 4,
  },
  postTorch: {
    themes: ['trade', 'residential'] as const,
    color: 0x5A3520,
    postHeight: 0.7,
    postSpacing: 8, // Reduced from 3 to 8 for less clutter
    hasTorch: true,
    torchColor: 0xffaa33,
  },
};

type BorderStyleType = keyof typeof BORDER_STYLES;

interface FenceSegment {
  x: number;
  z: number;
  rotY: number;
}

interface PostSegment {
  x: number;
  z: number;
}

interface TorchSegment {
  x: number;
  z: number;
}

export class ThreeParcelBorders {
  private group: THREE.Group;
  private instancedMeshes: THREE.InstancedMesh[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'parcel_borders';
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Rebuild all borders when parcels change (GLTF loading removed)
   */
  async update(parcels: RenderableParcel[]): Promise<void> {
    this.dispose();

    if (parcels.length === 0) return;

    // GLTF model loading removed - all borders use procedural geometry

    // Collect segments per border style
    const woodFences: FenceSegment[] = [];
    const woodPosts: PostSegment[] = [];
    const stoneWalls: FenceSegment[] = [];
    const stoneCrenellations: PostSegment[] = [];
    const torchPosts: PostSegment[] = [];
    const torches: TorchSegment[] = [];

    // Process each parcel
    for (const parcel of parcels) {
      const theme = (parcel.theme ?? 'mixed') as string;
      const borderStyle = this.getBorderStyle(theme);

      // Calculate parcel world boundaries
      const startX = (parcel.blockX * BLOCK_STRIDE + BLOCK_OFFSET_X) * TILE_SIZE;
      const startZ = (parcel.blockY * BLOCK_STRIDE + BLOCK_OFFSET_Y) * TILE_SIZE;
      const endX = startX + BLOCK_SIZE * TILE_SIZE;
      const endZ = startZ + BLOCK_SIZE * TILE_SIZE;

      // Build fence segments for all 4 edges
      this.buildEdgeSegments(
        startX, startZ, endX, endZ,
        borderStyle,
        woodFences, woodPosts, stoneWalls, stoneCrenellations, torchPosts, torches,
      );
    }

    // Create instanced meshes
    if (woodFences.length > 0) {
      this.createWoodFences(woodFences);
    }
    if (woodPosts.length > 0) {
      this.createWoodPosts(woodPosts);
    }
    if (stoneWalls.length > 0) {
      this.createStoneWalls(stoneWalls);
    }
    if (stoneCrenellations.length > 0) {
      this.createCrenellations(stoneCrenellations);
    }
    if (torchPosts.length > 0) {
      this.createTorchPosts(torchPosts);
    }
    if (torches.length > 0) {
      this.createTorches(torches);
    }
  }

  /**
   * Get border style for a parcel theme
   */
  private getBorderStyle(theme: string): BorderStyleType {
    for (const [style, config] of Object.entries(BORDER_STYLES)) {
      if ((config.themes as readonly string[]).includes(theme)) {
        return style as BorderStyleType;
      }
    }
    return 'wood'; // default
  }

  /**
   * Build fence segments for all 4 edges of a parcel
   */
  private buildEdgeSegments(
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
    borderStyle: BorderStyleType,
    woodFences: FenceSegment[],
    woodPosts: PostSegment[],
    stoneWalls: FenceSegment[],
    stoneCrenellations: PostSegment[],
    torchPosts: PostSegment[],
    torches: TorchSegment[],
  ): void {
    const config = BORDER_STYLES[borderStyle];

    // Gate positions (center of each edge, 2-tile wide gap)
    const gateHalfWidth = 1 * TILE_SIZE;
    const northGateCenter = (startX + endX) / 2;
    const southGateCenter = (startX + endX) / 2;
    const eastGateCenter = (startZ + endZ) / 2;
    const westGateCenter = (startZ + endZ) / 2;

    // Build edges
    this.buildEdge(
      startX, endX, startZ, 0, // North edge (horizontal)
      northGateCenter, gateHalfWidth,
      borderStyle, config,
      woodFences, woodPosts, stoneWalls, stoneCrenellations, torchPosts, torches,
    );

    this.buildEdge(
      startX, endX, endZ, 0, // South edge (horizontal)
      southGateCenter, gateHalfWidth,
      borderStyle, config,
      woodFences, woodPosts, stoneWalls, stoneCrenellations, torchPosts, torches,
    );

    this.buildEdge(
      startZ, endZ, endX, Math.PI / 2, // East edge (vertical)
      eastGateCenter, gateHalfWidth,
      borderStyle, config,
      woodFences, woodPosts, stoneWalls, stoneCrenellations, torchPosts, torches,
    );

    this.buildEdge(
      startZ, endZ, startX, Math.PI / 2, // West edge (vertical)
      westGateCenter, gateHalfWidth,
      borderStyle, config,
      woodFences, woodPosts, stoneWalls, stoneCrenellations, torchPosts, torches,
    );
  }

  /**
   * Build one edge (north, south, east, or west)
   */
  private buildEdge(
    start: number,
    end: number,
    fixedCoord: number,
    rotation: number,
    gateCenter: number,
    gateHalfWidth: number,
    borderStyle: BorderStyleType,
    config: typeof BORDER_STYLES[BorderStyleType],
    woodFences: FenceSegment[],
    woodPosts: PostSegment[],
    stoneWalls: FenceSegment[],
    stoneCrenellations: PostSegment[],
    torchPosts: PostSegment[],
    torches: TorchSegment[],
  ): void {
    const isHorizontal = rotation === 0;

    let segmentIndex = 0;

    for (let pos = start; pos < end; pos += TILE_SIZE) {
      // Skip gate opening (2-tile gap at center)
      if (Math.abs(pos - gateCenter) < gateHalfWidth) {
        continue;
      }

      const x = isHorizontal ? pos : fixedCoord;
      const z = isHorizontal ? fixedCoord : pos;

      // Place fence/wall segments
      if (borderStyle === 'wood') {
        woodFences.push({ x, z, rotY: rotation });

        // Posts at regular spacing
        if ('postSpacing' in config && segmentIndex % config.postSpacing === 0) {
          woodPosts.push({ x, z });
        }
      } else if (borderStyle === 'stone') {
        stoneWalls.push({ x, z, rotY: rotation });

        // Crenellations at regular spacing
        if ('crenellationSpacing' in config && config.hasCrenellation &&
            segmentIndex % config.crenellationSpacing === 0) {
          stoneCrenellations.push({ x, z });
        }
      } else if (borderStyle === 'postTorch') {
        // Post/torch style: posts at regular spacing
        if ('postSpacing' in config && segmentIndex % config.postSpacing === 0) {
          torchPosts.push({ x, z });

          if ('hasTorch' in config && config.hasTorch) {
            torches.push({ x, z });
          }
        }
      }

      segmentIndex++;
    }
  }

  /**
   * Create wood fence horizontal rails (2 rails per segment)
   */
  private createWoodFences(segments: FenceSegment[]): void {
    const config = BORDER_STYLES.wood;

    // GLTF loading removed - always use procedural fence rails
    const geometry = new THREE.BoxGeometry(0.8, 0.05, 0.4);
    const material = new THREE.MeshLambertMaterial({ color: config.color });

    // Two rails per segment (low + mid)
    const count = segments.length * 2;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const lowRailHeight = 0.15;
    const midRailHeight = 0.3;

    let idx = 0;
    for (const seg of segments) {
      // Low rail
      dummy.position.set(seg.x, lowRailHeight, seg.z);
      dummy.rotation.set(0, seg.rotY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx++, dummy.matrix);

      // Mid rail
      dummy.position.set(seg.x, midRailHeight, seg.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx++, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    this.instancedMeshes.push(mesh);
    this.group.add(mesh);
  }

  /**
   * Create wood fence posts
   */
  private createWoodPosts(segments: PostSegment[]): void {
    const config = BORDER_STYLES.wood;
    const geometry = new THREE.BoxGeometry(0.08, config.postHeight, 0.08);
    const material = new THREE.MeshLambertMaterial({ color: config.postColor });

    const mesh = new THREE.InstancedMesh(geometry, material, segments.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const postY = config.postHeight / 2;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      dummy.position.set(seg.x, postY, seg.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    this.instancedMeshes.push(mesh);
    this.group.add(mesh);
  }

  /**
   * Create stone wall segments
   */
  private createStoneWalls(segments: FenceSegment[]): void {
    const config = BORDER_STYLES.stone;

    // GLTF loading removed - always use procedural stone wall boxes
    const geometry = new THREE.BoxGeometry(0.9, config.height, 0.15);
    const material = new THREE.MeshLambertMaterial({ color: config.color });

    const mesh = new THREE.InstancedMesh(geometry, material, segments.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const wallY = config.height / 2;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      dummy.position.set(seg.x, wallY, seg.z);
      dummy.rotation.set(0, seg.rotY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    this.instancedMeshes.push(mesh);
    this.group.add(mesh);
  }

  /**
   * Create stone crenellations (battlements on top of walls)
   */
  private createCrenellations(segments: PostSegment[]): void {
    const config = BORDER_STYLES.stone;
    const geometry = new THREE.BoxGeometry(0.12, 0.15, 0.12);
    const material = new THREE.MeshLambertMaterial({ color: config.color });

    const mesh = new THREE.InstancedMesh(geometry, material, segments.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const crenY = config.height + 0.075; // Sit on top of wall

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      dummy.position.set(seg.x, crenY, seg.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    this.instancedMeshes.push(mesh);
    this.group.add(mesh);
  }

  /**
   * Create torch posts (procedural boxes)
   */
  private createTorchPosts(segments: PostSegment[]): void {
    const config = BORDER_STYLES.postTorch;

    // GLTF loading removed - always use procedural box posts
    const geometry = new THREE.BoxGeometry(0.08, config.postHeight, 0.08);
    const material = new THREE.MeshLambertMaterial({ color: config.color });

    const mesh = new THREE.InstancedMesh(geometry, material, segments.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const postY = config.postHeight / 2;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      dummy.position.set(seg.x, postY, seg.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    this.instancedMeshes.push(mesh);
    this.group.add(mesh);
  }

  /**
   * Create torches (emissive spheres on top of posts)
   */
  private createTorches(segments: TorchSegment[]): void {
    const config = BORDER_STYLES.postTorch;
    const geometry = new THREE.SphereGeometry(0.05, 8, 8);
    const material = new THREE.MeshStandardMaterial({
      color: config.torchColor,
      emissive: config.torchColor,
      emissiveIntensity: 1.2,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, segments.length);
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    const dummy = new THREE.Object3D();
    // Position on top of procedural posts
    const torchY = config.postHeight + 0.06;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      dummy.position.set(seg.x, torchY, seg.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    this.instancedMeshes.push(mesh);
    this.group.add(mesh);
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    // Dispose instanced meshes (wood fences, stone walls, torches, posts)
    for (const mesh of this.instancedMeshes) {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        for (const mat of mesh.material) mat.dispose();
      } else {
        mesh.material.dispose();
      }
    }
    this.instancedMeshes = [];

    this.group.clear();
  }
}
