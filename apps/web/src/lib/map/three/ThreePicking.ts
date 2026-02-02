/**
 * ThreePicking - Raycaster for mouse interaction
 *
 * Uses an invisible ground plane for raycasting.
 * Hit point converts to grid coordinates for tile/parcel detection.
 */

import * as THREE from 'three';
import {
  TILE_SIZE,
  BLOCK_SIZE,
  BLOCK_STRIDE,
  BLOCK_OFFSET_X,
  BLOCK_OFFSET_Y,
} from './ThreeConfig';
import type { BlockCoord } from '../coords';

export interface PickResult {
  worldPoint: THREE.Vector3;
  gridX: number;
  gridY: number;
  blockX: number;
  blockY: number;
  isInParcel: boolean;
  isOnRoad: boolean;
}

export class ThreePicking {
  private raycaster: THREE.Raycaster;
  private groundPlane: THREE.Mesh;
  private mouse: THREE.Vector2;

  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Invisible ground plane spanning the entire map
    const planeGeo = new THREE.PlaneGeometry(2000, 2000);
    const planeMat = new THREE.MeshBasicMaterial({
      visible: false,
      side: THREE.DoubleSide,
    });
    this.groundPlane = new THREE.Mesh(planeGeo, planeMat);
    // Rotate to lie flat on XZ plane
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.position.y = 0;
  }

  getGroundPlane(): THREE.Mesh {
    return this.groundPlane;
  }

  /**
   * Pick a point on the ground plane from screen coordinates
   */
  pick(
    screenX: number,
    screenY: number,
    canvasWidth: number,
    canvasHeight: number,
    camera: THREE.Camera,
  ): PickResult | null {
    // Normalize to -1..1
    this.mouse.x = (screenX / canvasWidth) * 2 - 1;
    this.mouse.y = -(screenY / canvasHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, camera);

    const intersects = this.raycaster.intersectObject(this.groundPlane);
    if (intersects.length === 0) return null;

    const point = intersects[0].point;

    // Convert world position to grid coordinates
    const gridX = Math.floor(point.x / TILE_SIZE + 0.5);
    const gridY = Math.floor(point.z / TILE_SIZE + 0.5);

    // Calculate block/parcel info
    const tileLocalX = ((gridX - BLOCK_OFFSET_X) % BLOCK_STRIDE + BLOCK_STRIDE) % BLOCK_STRIDE;
    const tileLocalY = ((gridY - BLOCK_OFFSET_Y) % BLOCK_STRIDE + BLOCK_STRIDE) % BLOCK_STRIDE;

    const blockX = Math.floor((gridX - BLOCK_OFFSET_X) / BLOCK_STRIDE);
    const blockY = Math.floor((gridY - BLOCK_OFFSET_Y) / BLOCK_STRIDE);

    return {
      worldPoint: point,
      gridX,
      gridY,
      blockX,
      blockY,
      isInParcel: tileLocalX < BLOCK_SIZE && tileLocalY < BLOCK_SIZE,
      isOnRoad: tileLocalX >= BLOCK_SIZE || tileLocalY >= BLOCK_SIZE,
    };
  }

  /**
   * Pick buildings (raycasts against building meshes)
   */
  pickBuilding(
    screenX: number,
    screenY: number,
    canvasWidth: number,
    canvasHeight: number,
    camera: THREE.Camera,
    buildingGroup: THREE.Group,
  ): { buildingId: string; gridX: number; gridY: number } | null {
    this.mouse.x = (screenX / canvasWidth) * 2 - 1;
    this.mouse.y = -(screenY / canvasHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, camera);

    const intersects = this.raycaster.intersectObjects(buildingGroup.children, true);
    if (intersects.length === 0) return null;

    const userData = intersects[0].object.userData;
    if (userData.type !== 'building') return null;

    return {
      buildingId: userData.buildingId,
      gridX: userData.gridX,
      gridY: userData.gridY,
    };
  }

  /**
   * Convert pick result to BlockCoord (for compatibility with existing code)
   */
  static toBlockCoord(pick: PickResult): BlockCoord {
    return {
      blockX: pick.blockX,
      blockY: pick.blockY,
    };
  }

  dispose(): void {
    this.groundPlane.geometry.dispose();
    (this.groundPlane.material as THREE.Material).dispose();
  }
}
