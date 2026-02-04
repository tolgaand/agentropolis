/**
 * V2Lens — Overlay lens system for spectator analysis
 *
 * Three lens modes color-tint buildings to reveal hidden data:
 * - Activity: green (high revenue) → red (low/closed) based on building activity
 * - Crime:    yellow (low heat) → red (high crime) with blue police influence
 * - Needs:    green (all needs met) → red (critical needs) per building occupants
 *
 * Only one lens is active at a time. When a lens is active, building
 * instanceColors are overridden per frame based on lens data.
 * When no lens is active, colors revert to white (neutral).
 *
 * Data is fed externally via setLensData(). The controller applies
 * the color mapping per frame, chunk-optimized.
 */

import * as THREE from 'three';
import { ASSET_REGISTRY } from './V2Config';

// ─── Lens types ───
export type LensMode = 'off' | 'activity' | 'crime' | 'needs';

export interface LensBuildingData {
  meshKey: string;
  instanceIndex: number;
  /** 0-1 normalized value. Meaning depends on lens:
   *  activity: 0=closed/dead → 1=bustling
   *  crime: 0=safe → 1=high heat
   *  needs: 0=all good → 1=critical
   */
  value: number;
  /** Optional: police influence (crime lens only), 0-1 */
  policeInfluence?: number;
}

// ─── Color ramps per lens ───
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _c3 = new THREE.Color();

function activityColor(value: number): { r: number; g: number; b: number } {
  // 0 (dead) = desaturated red, 1 (active) = vibrant green
  _c1.setRGB(0.85, 0.25, 0.25); // low activity
  _c2.setRGB(0.35, 0.88, 0.45); // high activity
  _c1.lerp(_c2, value);
  return { r: _c1.r, g: _c1.g, b: _c1.b };
}

function crimeColor(value: number, policeInfluence = 0): { r: number; g: number; b: number } {
  // 0 (safe) = pale green, 1 (danger) = hot red
  _c1.setRGB(0.4, 0.75, 0.45); // safe
  _c2.setRGB(0.95, 0.25, 0.2); // danger
  _c1.lerp(_c2, value);

  // Blend in police blue influence
  if (policeInfluence > 0) {
    _c3.setRGB(0.3, 0.5, 0.95); // police blue
    _c1.lerp(_c3, policeInfluence * 0.5);
  }

  return { r: _c1.r, g: _c1.g, b: _c1.b };
}

function needsColor(value: number): { r: number; g: number; b: number } {
  // 0 (healthy) = soft green, 0.5 (warning) = yellow, 1 (critical) = red
  if (value < 0.5) {
    _c1.setRGB(0.35, 0.82, 0.45); // healthy
    _c2.setRGB(0.92, 0.82, 0.25); // warning
    _c1.lerp(_c2, value * 2);
  } else {
    _c1.setRGB(0.92, 0.82, 0.25); // warning
    _c2.setRGB(0.95, 0.3, 0.25);  // critical
    _c1.lerp(_c2, (value - 0.5) * 2);
  }
  return { r: _c1.r, g: _c1.g, b: _c1.b };
}

// ─── LensController ───
export class LensController {
  private meshes: Map<string, THREE.InstancedMesh> = new Map();
  private colorBuffers: Map<string, Float32Array> = new Map();
  private mode: LensMode = 'off';
  private data: LensBuildingData[] = [];
  private dirty = false;

  /**
   * Attach to the instanced meshes (same meshes as WorldFX).
   * Only operates on building-type meshes.
   */
  attach(meshes: Map<string, THREE.InstancedMesh>): void {
    this.meshes = meshes;
    this.colorBuffers.clear();

    for (const [key, mesh] of meshes.entries()) {
      const meta = ASSET_REGISTRY[key];
      if (!meta || meta.type !== 'building') continue;

      if (mesh.instanceColor) {
        const attr = mesh.instanceColor as THREE.InstancedBufferAttribute;
        this.colorBuffers.set(key, attr.array as Float32Array);
      }
    }
  }

  /** Get current lens mode */
  getMode(): LensMode { return this.mode; }

  /** Set active lens mode. 'off' returns to neutral colors. */
  setMode(mode: LensMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.dirty = true;

    // If turning off, reset all building colors to white
    if (mode === 'off') {
      this.resetColors();
    }
  }

  /** Feed lens data for the current frame. */
  setLensData(data: LensBuildingData[]): void {
    this.data = data;
    this.dirty = true;
  }

  /**
   * Apply lens colors per frame. Call after WorldFX.update()
   * so lens colors override FX colors when a lens is active.
   */
  update(): void {
    if (this.mode === 'off') {
      if (this.dirty) {
        this.resetColors();
        this.dirty = false;
      }
      return;
    }

    if (!this.dirty && this.data.length === 0) return;

    // First, set all building instances to a dim neutral
    // (buildings without data appear muted)
    const dimColor = { r: 0.55, g: 0.55, b: 0.6 };
    for (const colors of this.colorBuffers.values()) {
      for (let i = 0; i < colors.length; i += 3) {
        colors[i] = dimColor.r;
        colors[i + 1] = dimColor.g;
        colors[i + 2] = dimColor.b;
      }
    }

    // Apply lens color to data-bearing instances
    for (const d of this.data) {
      const colors = this.colorBuffers.get(d.meshKey);
      if (!colors) continue;

      const idx = d.instanceIndex * 3;
      if (idx + 2 >= colors.length) continue;

      let c: { r: number; g: number; b: number };
      switch (this.mode) {
        case 'activity':
          c = activityColor(d.value);
          break;
        case 'crime':
          c = crimeColor(d.value, d.policeInfluence);
          break;
        case 'needs':
          c = needsColor(d.value);
          break;
        default:
          continue;
      }

      colors[idx] = c.r;
      colors[idx + 1] = c.g;
      colors[idx + 2] = c.b;
    }

    // Mark dirty for GPU upload
    const dirtyKeys = new Set<string>();
    for (const d of this.data) dirtyKeys.add(d.meshKey);
    // Also mark all building meshes (for the dim base)
    for (const key of this.colorBuffers.keys()) dirtyKeys.add(key);

    for (const key of dirtyKeys) {
      const mesh = this.meshes.get(key);
      if (mesh?.instanceColor) {
        (mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
      }
    }

    this.dirty = false;
  }

  /** Reset all building instance colors to white (no tint). */
  private resetColors(): void {
    for (const [key, colors] of this.colorBuffers) {
      for (let i = 0; i < colors.length; i++) {
        colors[i] = 1.0;
      }
      const mesh = this.meshes.get(key);
      if (mesh?.instanceColor) {
        (mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
      }
    }
  }
}
