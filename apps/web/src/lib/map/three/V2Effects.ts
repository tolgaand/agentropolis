/**
 * V2Effects - Shader-based city life animations
 *
 * - Tree sway: vegetation moves gently in the wind
 *
 * Window flicker and lamp glow were removed because whole-mesh emissive
 * looks wrong on low-poly buildings (entire building brightens instead
 * of individual windows).
 */

import * as THREE from 'three';

// Shared time uniform across all effects
const timeUniform = { value: 0 };

/**
 * Call once per frame to update the global time uniform.
 */
export function updateEffectsTime(deltaSeconds: number): void {
  timeUniform.value += deltaSeconds;
}

/**
 * No-op — window flicker disabled (whole-mesh emissive glow on low-poly buildings).
 * Kept as stub so callers don't need to change.
 */
export function applyWindowFlicker(
  _meshes: Map<string, THREE.InstancedMesh>,
  _maxCount: number,
): void {
  // intentionally empty
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
 * No-op — lamp glow disabled (whole-mesh emissive on low-poly lamp models).
 * Kept as stub so callers don't need to change.
 */
export function applyLampGlow(
  _meshes: Map<string, THREE.InstancedMesh>,
  _maxCount: number,
): void {
  // intentionally empty
}
