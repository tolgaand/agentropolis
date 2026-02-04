/**
 * V2Particles — Seasonal particle effects for CityRendererV2
 *
 * - Autumn: falling leaves (small orange/yellow quads)
 * - Winter: snowflakes (white points)
 * - Spring/Summer: none
 *
 * Uses THREE.Points for GPU-efficient rendering.
 * Particles recycle at bottom, re-spawn at top.
 * LOD: disabled when camera is far (zoom out).
 */

import * as THREE from 'three';
import type { Season } from './V2Season';
import { CHUNK_SIZE } from './V2Config';

const PARTICLE_COUNT = 350;
const SPREAD = CHUNK_SIZE * 1.5;   // horizontal spread area
const HEIGHT_MIN = -5;              // recycle below this
const HEIGHT_MAX = 120;             // spawn ceiling
const LOD_HIDE_HEIGHT = 250;        // hide particles above this camera height

// ─── Season particle profiles ───

interface ParticleProfile {
  color: THREE.Color;
  colorVariance: THREE.Color;  // random tint range
  size: number;
  gravity: number;             // fall speed units/sec
  drift: number;               // horizontal random drift
  opacity: number;
}

const PROFILES: Partial<Record<Season, ParticleProfile>> = {
  autumn: {
    color: new THREE.Color(0.95, 0.72, 0.2),
    colorVariance: new THREE.Color(0.15, 0.15, 0.05),
    size: 3.0,
    gravity: 12,
    drift: 8,
    opacity: 0.75,
  },
  winter: {
    color: new THREE.Color(0.95, 0.97, 1.0),
    colorVariance: new THREE.Color(0.05, 0.03, 0.0),
    size: 2.0,
    gravity: 6,
    drift: 5,
    opacity: 0.65,
  },
};

export class ParticleController {
  private points: THREE.Points | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.PointsMaterial | null = null;
  private velocities: Float32Array | null = null;
  private driftX: Float32Array | null = null;
  private driftZ: Float32Array | null = null;
  private season: Season = 'spring';
  private active = false;

  /** Add particle system to parent object */
  init(parent: THREE.Object3D): void {
    this.geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    this.velocities = new Float32Array(PARTICLE_COUNT);
    this.driftX = new Float32Array(PARTICLE_COUNT);
    this.driftZ = new Float32Array(PARTICLE_COUNT);

    // Initialize positions randomly across the visible area
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * SPREAD;
      positions[i * 3 + 1] = Math.random() * HEIGHT_MAX;
      positions[i * 3 + 2] = (Math.random() - 0.5) * SPREAD;
      colors[i * 3]     = 1;
      colors[i * 3 + 1] = 1;
      colors[i * 3 + 2] = 1;
      this.velocities[i] = 0.8 + Math.random() * 0.4;
      this.driftX[i] = (Math.random() - 0.5) * 2;
      this.driftZ[i] = (Math.random() - 0.5) * 2;
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.material = new THREE.PointsMaterial({
      size: 2,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.visible = false;
    this.points.renderOrder = 999;
    parent.add(this.points);
  }

  /** Set the active season — enables/disables particles */
  setSeason(season: Season): void {
    this.season = season;
    const profile = PROFILES[season];

    if (!profile) {
      this.active = false;
      if (this.points) this.points.visible = false;
      return;
    }

    this.active = true;
    if (this.material) {
      this.material.size = profile.size;
      this.material.opacity = profile.opacity;
    }

    // Re-colorize particles with variance
    if (this.geometry) {
      const colorAttr = this.geometry.getAttribute('color') as THREE.BufferAttribute;
      const colors = colorAttr.array as Float32Array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        colors[i * 3]     = profile.color.r + (Math.random() - 0.5) * profile.colorVariance.r;
        colors[i * 3 + 1] = profile.color.g + (Math.random() - 0.5) * profile.colorVariance.g;
        colors[i * 3 + 2] = profile.color.b + (Math.random() - 0.5) * profile.colorVariance.b;
      }
      colorAttr.needsUpdate = true;
    }

    // Re-randomize drift
    if (this.driftX && this.driftZ) {
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        this.driftX[i] = (Math.random() - 0.5) * 2;
        this.driftZ[i] = (Math.random() - 0.5) * 2;
      }
    }
  }

  /** Call each frame with delta and camera height for LOD */
  update(dt: number, cameraHeight: number): void {
    if (!this.active || !this.points || !this.geometry || !this.velocities || !this.driftX || !this.driftZ) return;

    // LOD: hide at high zoom
    if (cameraHeight > LOD_HIDE_HEIGHT) {
      this.points.visible = false;
      return;
    }
    this.points.visible = true;

    const profile = PROFILES[this.season];
    if (!profile) return;

    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const gravity = profile.gravity * dt;
    const drift = profile.drift * dt;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const idx = i * 3;

      // Fall
      positions[idx + 1] -= gravity * this.velocities[i];

      // Drift
      positions[idx]     += this.driftX[i] * drift;
      positions[idx + 2] += this.driftZ[i] * drift;

      // Recycle at bottom
      if (positions[idx + 1] < HEIGHT_MIN) {
        positions[idx]     = (Math.random() - 0.5) * SPREAD;
        positions[idx + 1] = HEIGHT_MAX + Math.random() * 10;
        positions[idx + 2] = (Math.random() - 0.5) * SPREAD;
        this.velocities[i] = 0.8 + Math.random() * 0.4;
        this.driftX[i] = (Math.random() - 0.5) * 2;
        this.driftZ[i] = (Math.random() - 0.5) * 2;
      }
    }

    posAttr.needsUpdate = true;
  }

  dispose(): void {
    this.geometry?.dispose();
    this.material?.dispose();
    if (this.points?.parent) {
      this.points.parent.remove(this.points);
    }
  }
}
