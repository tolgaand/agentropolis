/**
 * V2Effects - Shader-based city life animations
 *
 * - Window flicker: buildings emit light from windows that turn on/off
 * - Tree sway: vegetation moves gently in the wind
 * - Lamp glow: street lamps pulse softly
 *
 * All effects work with InstancedMesh via InstancedBufferAttribute
 * for per-instance random phase/speed values.
 */

import * as THREE from 'three';
import { ASSET_REGISTRY } from './V2Config';

// Shared time uniform across all effects
const timeUniform = { value: 0 };

/**
 * Call once per frame to update the global time uniform.
 */
export function updateEffectsTime(deltaSeconds: number): void {
  timeUniform.value += deltaSeconds;
}

/**
 * Apply window flicker effect to building InstancedMeshes.
 * Adds per-instance random phase and patches the material shader.
 */
export function applyWindowFlicker(
  meshes: Map<string, THREE.InstancedMesh>,
  maxCount: number,
): void {
  for (const [key, mesh] of meshes.entries()) {
    const meta = ASSET_REGISTRY[key];
    if (!meta || meta.type !== 'building') continue;

    // Create per-instance random phase attribute
    const phases = new Float32Array(maxCount);
    for (let i = 0; i < maxCount; i++) {
      phases[i] = Math.random() * Math.PI * 2;
    }
    const phaseAttr = new THREE.InstancedBufferAttribute(phases, 1);
    mesh.geometry.setAttribute('aFlickerPhase', phaseAttr);

    // Patch the material with custom shader code
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = timeUniform;

      // Add varying and attribute to vertex shader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
        attribute float aFlickerPhase;
        varying float vFlickerPhase;`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vFlickerPhase = aFlickerPhase;`,
      );

      // Add emissive flicker to fragment shader
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        varying float vFlickerPhase;`,
      );
      // Add subtle emissive glow after the emissivemap fragment
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Window flicker: subtle warm glow that varies per instance
        float flicker = sin(uTime * 1.5 + vFlickerPhase) * 0.5 + 0.5;
        float pulse = smoothstep(0.3, 0.7, flicker);
        totalEmissiveRadiance += vec3(0.15, 0.12, 0.05) * pulse * 0.4;`,
      );
    };
    // Force material recompile
    mat.needsUpdate = true;
  }
}

/**
 * Apply wind sway effect to tree/bush InstancedMeshes.
 * Displaces vertices in the vertex shader based on height + time.
 */
export function applyTreeSway(
  meshes: Map<string, THREE.InstancedMesh>,
  maxCount: number,
): void {
  const swayKeys = new Set([
    'tree', 'tree_13', 'tree_16', 'tree_17',
    'bush_01', 'bush_02', 'bush_03',
  ]);

  for (const [key, mesh] of meshes.entries()) {
    if (!swayKeys.has(key)) continue;

    // Per-instance wind offset
    const windOffsets = new Float32Array(maxCount);
    for (let i = 0; i < maxCount; i++) {
      windOffsets[i] = Math.random() * Math.PI * 2;
    }
    const windAttr = new THREE.InstancedBufferAttribute(windOffsets, 1);
    mesh.geometry.setAttribute('aWindOffset', windAttr);

    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = timeUniform;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
        attribute float aWindOffset;
        uniform float uTime;`,
      );

      // Apply sway after the vertex transform
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // Wind sway: stronger at top (based on Y position)
        float height = position.y;
        float swayAmount = max(0.0, height) * 0.03;
        float windTime = uTime * 2.0 + aWindOffset;
        transformed.x += sin(windTime) * swayAmount;
        transformed.z += cos(windTime * 0.7) * swayAmount * 0.5;`,
      );
    };
    mat.needsUpdate = true;
  }
}

/**
 * Apply glow pulse to lamp post InstancedMeshes.
 * Subtle emissive breathing effect.
 */
export function applyLampGlow(
  meshes: Map<string, THREE.InstancedMesh>,
  maxCount: number,
): void {
  const lampKeys = new Set(['lamp', 'lamp_02']);

  for (const [key, mesh] of meshes.entries()) {
    if (!lampKeys.has(key)) continue;

    // Per-instance glow phase
    const glowPhases = new Float32Array(maxCount);
    for (let i = 0; i < maxCount; i++) {
      glowPhases[i] = Math.random() * Math.PI * 2;
    }
    const glowAttr = new THREE.InstancedBufferAttribute(glowPhases, 1);
    mesh.geometry.setAttribute('aGlowPhase', glowAttr);

    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = timeUniform;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
        attribute float aGlowPhase;
        varying float vGlowPhase;`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vGlowPhase = aGlowPhase;`,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        varying float vGlowPhase;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Warm lamp glow pulse
        float glow = sin(uTime * 0.8 + vGlowPhase) * 0.5 + 0.5;
        float glowPulse = 0.6 + glow * 0.4;
        totalEmissiveRadiance += vec3(0.4, 0.3, 0.1) * glowPulse;`,
      );
    };
    mat.needsUpdate = true;
  }
}
