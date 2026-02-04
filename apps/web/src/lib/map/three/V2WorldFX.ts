/**
 * V2WorldFX — Event-driven world effects for CityRendererV2
 *
 * Triggers visual effects on buildings based on game events:
 * - Crime arc: brief red pulse on building
 * - Building closed: fade to dark / desaturate
 * - Building opened: brief cyan sparkle/pulse
 *
 * Uses InstancedMesh instanceColor for per-instance tinting.
 * Effects are LOD-aware (reduced at far zoom).
 */

import * as THREE from 'three';
import { ASSET_REGISTRY } from './V2Config';

// ─── Effect types ───
export type WorldFXType = 'crime_pulse' | 'building_closed' | 'building_opened';

interface ActiveEffect {
  type: WorldFXType;
  meshKey: string;
  instanceIndex: number;
  startTime: number;
  duration: number; // ms
}

// ─── Color presets per effect ───
const FX_COLORS: Record<WorldFXType, { r: number; g: number; b: number }> = {
  crime_pulse:     { r: 1.0, g: 0.35, b: 0.45 },   // soft red
  building_closed: { r: 0.4, g: 0.4, b: 0.45 },     // desaturated gray
  building_opened: { r: 0.5, g: 0.86, b: 1.0 },     // soft cyan
};

const FX_DURATIONS: Record<WorldFXType, number> = {
  crime_pulse: 2000,
  building_closed: 4000,
  building_opened: 2500,
};

// ─── WorldFX Controller ───
export class WorldFXController {
  private meshes: Map<string, THREE.InstancedMesh> = new Map();
  private colorBuffers: Map<string, Float32Array> = new Map();
  private effects: ActiveEffect[] = [];
  /**
   * Attach to the instanced meshes from the renderer.
   * Call after meshes are created/regenerated.
   */
  attach(meshes: Map<string, THREE.InstancedMesh>, maxCount: number): void {
    this.meshes = meshes;
    this.colorBuffers.clear();

    // Initialize instanceColor for building meshes
    for (const [key, mesh] of meshes.entries()) {
      const meta = ASSET_REGISTRY[key];
      if (!meta || meta.type !== 'building') continue;

      // Create or reuse color buffer
      const colors = new Float32Array(maxCount * 3);
      for (let i = 0; i < maxCount * 3; i++) {
        colors[i] = 1.0; // white = no tint
      }

      mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
      (mesh.instanceColor as THREE.InstancedBufferAttribute).setUsage(THREE.DynamicDrawUsage);
      this.colorBuffers.set(key, colors);
    }
  }

  /**
   * Trigger an effect on a specific building instance.
   */
  triggerEffect(
    type: WorldFXType,
    meshKey: string,
    instanceIndex: number,
  ): void {
    // Remove any existing effect on the same instance
    this.effects = this.effects.filter(
      e => !(e.meshKey === meshKey && e.instanceIndex === instanceIndex),
    );

    this.effects.push({
      type,
      meshKey,
      instanceIndex,
      startTime: performance.now(),
      duration: FX_DURATIONS[type],
    });
  }

  /**
   * Update all active effects. Call each frame.
   * @param cameraHeight - current zoom level for LOD
   */
  update(cameraHeight: number): void {
    if (this.effects.length === 0) return;

    const now = performance.now();
    // LOD: reduce effect intensity at far zoom
    const lodFactor = cameraHeight > 200 ? 0.3 : cameraHeight > 120 ? 0.6 : 1.0;
    const dirtyMeshes = new Set<string>();

    // Process effects
    let i = this.effects.length;
    while (i--) {
      const effect = this.effects[i];
      const elapsed = now - effect.startTime;
      const t = Math.min(1, elapsed / effect.duration);

      const colors = this.colorBuffers.get(effect.meshKey);
      if (!colors) {
        this.effects.splice(i, 1);
        continue;
      }

      const idx = effect.instanceIndex * 3;
      if (idx + 2 >= colors.length) {
        this.effects.splice(i, 1);
        continue;
      }

      if (t >= 1) {
        // Effect finished — reset to white
        colors[idx] = 1.0;
        colors[idx + 1] = 1.0;
        colors[idx + 2] = 1.0;
        dirtyMeshes.add(effect.meshKey);
        this.effects.splice(i, 1);
        continue;
      }

      // Compute intensity curve
      const fxColor = FX_COLORS[effect.type];
      let intensity: number;

      if (effect.type === 'crime_pulse') {
        // Pulse: fast in, slow out with sine curve
        intensity = Math.sin(t * Math.PI) * lodFactor;
      } else if (effect.type === 'building_closed') {
        // Fade to gray and hold, then slowly restore
        intensity = t < 0.3 ? t / 0.3 : t > 0.7 ? (1 - t) / 0.3 : 1.0;
        intensity *= lodFactor;
      } else {
        // building_opened: quick flash then fade
        intensity = t < 0.2 ? t / 0.2 : (1 - t) / 0.8;
        intensity *= lodFactor;
      }

      // Lerp from white to effect color
      colors[idx] = 1.0 + (fxColor.r - 1.0) * intensity;
      colors[idx + 1] = 1.0 + (fxColor.g - 1.0) * intensity;
      colors[idx + 2] = 1.0 + (fxColor.b - 1.0) * intensity;
      dirtyMeshes.add(effect.meshKey);
    }

    // Mark dirty buffers for GPU upload
    for (const key of dirtyMeshes) {
      const mesh = this.meshes.get(key);
      if (mesh?.instanceColor) {
        (mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
      }
    }
  }

  /** Clear all active effects */
  clear(): void {
    // Reset all colors to white
    for (const [key, colors] of this.colorBuffers) {
      for (let i = 0; i < colors.length; i++) {
        colors[i] = 1.0;
      }
      const mesh = this.meshes.get(key);
      if (mesh?.instanceColor) {
        (mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
      }
    }
    this.effects = [];
  }
}
