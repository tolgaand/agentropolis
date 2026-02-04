/**
 * V2AgentSprites — Agent avatar silhouettes on the 3D map
 *
 * Shows agents as small colored billboard sprites near buildings.
 * Uses THREE.InstancedMesh with a canvas-drawn texture atlas.
 *
 * Professions:
 * - worker:     blue
 * - police:     white
 * - employee:   green
 * - shop_owner: gold
 *
 * LOD: far zoom shows larger sprites, close zoom shows smaller.
 * Max 50 visible sprites.
 */

import * as THREE from 'three';
import { TILE, TILES_PER_CHUNK } from './V2Config';

const MAX_AGENTS = 50;
const SPRITE_SIZE = 3.5;

// ─── Profession colors ───
const PROFESSION_COLORS: Record<string, string> = {
  worker: '#4a9eff',
  police: '#ffffff',
  employee: '#5be8a0',
  shop_owner: '#f5d062',
};

const DEFAULT_COLOR = '#7fdcff';

// ─── Types ───
export interface AgentSpriteData {
  id: string;
  profession: string;
  worldX: number;
  worldZ: number;
}

export class AgentSpriteController {
  private mesh: THREE.InstancedMesh | null = null;
  private material: THREE.MeshBasicMaterial | null = null;
  private texture: THREE.CanvasTexture | null = null;
  private dummy = new THREE.Object3D();
  private agentCount = 0;
  private gridCX = 0;
  private gridCZ = 0;

  /** Create texture atlas from canvas (4 profession icons) */
  private createTexture(): THREE.CanvasTexture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Draw a simple humanoid silhouette
    ctx.clearRect(0, 0, size, size);

    // White silhouette — we'll tint per-instance via vertex color
    ctx.fillStyle = '#ffffff';

    // Head
    ctx.beginPath();
    ctx.arc(size / 2, 16, 10, 0, Math.PI * 2);
    ctx.fill();

    // Body (triangle/trapezoid)
    ctx.beginPath();
    ctx.moveTo(size / 2 - 14, size - 4);
    ctx.lineTo(size / 2 + 14, size - 4);
    ctx.lineTo(size / 2 + 6, 28);
    ctx.lineTo(size / 2 - 6, 28);
    ctx.closePath();
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  init(parent: THREE.Object3D): void {
    this.texture = this.createTexture();

    const planeGeo = new THREE.PlaneGeometry(SPRITE_SIZE, SPRITE_SIZE * 1.5);
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      alphaTest: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.InstancedMesh(planeGeo, this.material, MAX_AGENTS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Instance colors
    const colors = new Float32Array(MAX_AGENTS * 3);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.renderOrder = 100;
    parent.add(this.mesh);
  }

  setGridCoords(cx: number, cz: number): void {
    this.gridCX = cx;
    this.gridCZ = cz;
  }

  /** Update agent positions from data */
  setAgents(agents: AgentSpriteData[]): void {
    if (!this.mesh || !this.mesh.instanceColor) return;

    const count = Math.min(agents.length, MAX_AGENTS);
    this.agentCount = count;
    this.mesh.count = count;
    this.mesh.visible = count > 0;

    const colorAttr = this.mesh.instanceColor as THREE.InstancedBufferAttribute;
    const tmpColor = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const agent = agents[i];

      // Convert world tile coords to scene-space position
      const sceneX = (agent.worldX - this.gridCX * TILES_PER_CHUNK) * TILE + TILE / 2;
      const sceneZ = (agent.worldZ - this.gridCZ * TILES_PER_CHUNK) * TILE + TILE / 2;

      this.dummy.position.set(sceneX, SPRITE_SIZE * 0.75, sceneZ);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);

      // Set color based on profession
      const hex = PROFESSION_COLORS[agent.profession] ?? DEFAULT_COLOR;
      tmpColor.setStyle(hex);
      colorAttr.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    colorAttr.needsUpdate = true;
  }

  /** Billboard: make sprites face the camera each frame */
  update(cameraHeight: number, camera: THREE.Camera): void {
    if (!this.mesh || this.agentCount === 0) return;

    // LOD: hide at very high zoom
    if (cameraHeight > 280) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;

    // Scale sprites based on camera distance
    const scale = cameraHeight < 100 ? 1.0 : cameraHeight < 200 ? 1.5 : 2.0;

    // Billboard each instance toward camera
    for (let i = 0; i < this.agentCount; i++) {
      this.mesh.getMatrixAt(i, this.dummy.matrix);
      this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);

      // Face camera
      this.dummy.lookAt(camera.position);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.texture?.dispose();
    this.material?.dispose();
    if (this.mesh) {
      this.mesh.geometry.dispose();
      if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    }
  }
}
