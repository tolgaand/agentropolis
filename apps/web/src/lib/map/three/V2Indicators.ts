/**
 * V2Indicators — In-world building status icons
 *
 * Renders small status icons floating above buildings:
 * - ! problem (red)    — needs below threshold
 * - ₵ profit (green)   — earning well
 * - Zz closed (gray)   — building closed
 * - ⚖ crime (yellow)   — crime heat zone
 *
 * Uses a single InstancedMesh with a canvas-drawn texture atlas
 * for billboard rendering. LOD: hides non-critical at far zoom.
 */

import * as THREE from 'three';
import { TILE, TILES_PER_CHUNK } from './V2Config';

// ─── Indicator types ───
export type IndicatorType = 'problem' | 'profit' | 'closed' | 'crime';

export interface BuildingIndicator {
  buildingId: string;
  worldX: number;
  worldZ: number;
  type: IndicatorType;
  critical: boolean; // shown even at far zoom
}

// ─── Config ───
const ICON_SIZE = 64; // px per icon in atlas
const ATLAS_COLS = 4;
const MAX_INDICATORS = 512;
const BILLBOARD_SCALE = 1.8;
const FLOAT_HEIGHT = 8.5; // world units above ground

const INDICATOR_META: Record<IndicatorType, {
  col: number;        // atlas column
  color: string;      // canvas draw color
  glyph: string;      // character to render
  critical: boolean;  // default criticality
}> = {
  problem: { col: 0, color: '#ff6b8a', glyph: '!',  critical: true },
  profit:  { col: 1, color: '#5be8a0', glyph: '₵',  critical: false },
  closed:  { col: 2, color: '#8a8a98', glyph: 'Zz', critical: false },
  crime:   { col: 3, color: '#f5d062', glyph: '⚖',  critical: true },
};

// ─── Atlas texture creation ───
function createIndicatorAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE * ATLAS_COLS;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext('2d')!;

  // Draw each icon
  const types: IndicatorType[] = ['problem', 'profit', 'closed', 'crime'];
  for (const type of types) {
    const meta = INDICATOR_META[type];
    const x = meta.col * ICON_SIZE;

    // Background circle
    ctx.beginPath();
    ctx.arc(x + ICON_SIZE / 2, ICON_SIZE / 2, ICON_SIZE * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8, 12, 20, 0.75)';
    ctx.fill();

    // Border
    ctx.beginPath();
    ctx.arc(x + ICON_SIZE / 2, ICON_SIZE / 2, ICON_SIZE * 0.38, 0, Math.PI * 2);
    ctx.strokeStyle = meta.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Glyph
    ctx.fillStyle = meta.color;
    ctx.font = `bold ${ICON_SIZE * 0.4}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(meta.glyph, x + ICON_SIZE / 2, ICON_SIZE / 2 + 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

// ─── IndicatorController ───
export class IndicatorController {
  private mesh: THREE.InstancedMesh | null = null;
  private material: THREE.MeshBasicMaterial | null = null;
  private indicators: BuildingIndicator[] = [];
  private uvAttr: THREE.InstancedBufferAttribute | null = null;
  private parent: THREE.Group | null = null;
  private gridCoordsRef: { x: number; y: number } = { x: 0, y: 0 };

  private dummy = new THREE.Object3D();

  /**
   * Initialize the indicator system and add to the scene.
   */
  init(parent: THREE.Group): void {
    this.parent = parent;

    const atlas = createIndicatorAtlas();
    this.material = new THREE.MeshBasicMaterial({
      map: atlas,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const geo = new THREE.PlaneGeometry(BILLBOARD_SCALE, BILLBOARD_SCALE);

    // Default UVs span full atlas; we'll override per-instance
    // But since InstancedMesh doesn't support per-instance UVs natively,
    // we use a custom shader to pick the right atlas column.
    // Simpler approach: use 4 separate tiny meshes? No — we use a single
    // InstancedMesh and pass the column index via instanceColor.r channel.
    // The material shader will use the color to offset UVs.

    this.mesh = new THREE.InstancedMesh(geo, this.material, MAX_INDICATORS);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'indicators';

    // Custom UV offset attribute: stores the atlas column (0-3) per instance
    const uvOffsets = new Float32Array(MAX_INDICATORS);
    this.uvAttr = new THREE.InstancedBufferAttribute(uvOffsets, 1);
    this.uvAttr.setUsage(THREE.DynamicDrawUsage);
    this.mesh.geometry.setAttribute('aIconCol', this.uvAttr);

    // Patch shader to use aIconCol for UV offset
    this.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
attribute float aIconCol;
varying float vIconCol;`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vIconCol = aIconCol;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
varying float vIconCol;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec2 atlasUV = vMapUv;
  atlasUV.x = (atlasUV.x + vIconCol) / ${ATLAS_COLS}.0;
  vec4 sampledDiffuseColor = texture2D(map, atlasUV);
  diffuseColor *= sampledDiffuseColor;
#endif`,
      );
    };

    parent.add(this.mesh);
  }

  /**
   * Set the grid coordinates reference (for world → scene position conversion).
   */
  setGridCoords(x: number, y: number): void {
    this.gridCoordsRef = { x, y };
  }

  /**
   * Replace all indicators with a new set.
   */
  setIndicators(indicators: BuildingIndicator[]): void {
    this.indicators = indicators.slice(0, MAX_INDICATORS);
  }

  /**
   * Update indicator positions and visibility. Call each frame.
   * @param cameraHeight - current zoom level for LOD filtering
   * @param cameraRef - camera for billboard orientation
   */
  update(cameraHeight: number, cameraRef: THREE.Camera): void {
    if (!this.mesh || !this.uvAttr) return;

    // LOD filter: at far zoom, only show critical indicators
    const farZoom = cameraHeight > 160;
    const medZoom = cameraHeight > 100;

    // Filter visible indicators
    const visible = farZoom
      ? this.indicators.filter(i => i.critical)
      : medZoom
        ? this.indicators.filter(i => i.critical || i.type !== 'profit')
        : this.indicators;

    // Billboard: extract camera rotation for face-camera orientation
    const camQuat = cameraRef.quaternion;

    let count = 0;
    for (const ind of visible) {
      if (count >= MAX_INDICATORS) break;

      // Convert world tile to scene-local position
      const sceneX = (ind.worldX - this.gridCoordsRef.x * TILES_PER_CHUNK) * TILE + TILE / 2;
      const sceneZ = (ind.worldZ - this.gridCoordsRef.y * TILES_PER_CHUNK) * TILE + TILE / 2;

      this.dummy.position.set(sceneX, FLOAT_HEIGHT, sceneZ);
      this.dummy.quaternion.copy(camQuat); // billboard: face camera
      this.dummy.scale.setScalar(farZoom ? 0.7 : medZoom ? 0.85 : 1.0);
      this.dummy.updateMatrix();

      this.mesh.setMatrixAt(count, this.dummy.matrix);
      this.uvAttr.array[count] = INDICATOR_META[ind.type].col;
      count++;
    }

    this.mesh.count = count;
    if (count > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.uvAttr.needsUpdate = true;
    }
  }

  /** Remove all indicators */
  clear(): void {
    this.indicators = [];
    if (this.mesh) this.mesh.count = 0;
  }

  dispose(): void {
    if (this.mesh && this.parent) {
      this.parent.remove(this.mesh);
    }
    this.mesh?.geometry.dispose();
    this.material?.dispose();
    this.mesh = null;
    this.material = null;
  }
}
