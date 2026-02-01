/**
 * ThreeSky - Medieval skydome with gradient + horizon glow + procedural stars
 *
 * Uses a proper hemisphere gradient shader with warm horizon glow band.
 * Warm earth tones for medieval atmosphere.
 * Stars use 3D hash for proper distribution, fade at dawn/dusk.
 */

import * as THREE from 'three';
import type { TimePhase } from '../types';

// Medieval sky presets — warm earth tones, golden light
const SKY_PRESETS: Record<string, {
  topColor: number;
  bottomColor: number;
  horizonColor: number;
  horizonIntensity: number;
  horizonBlend: number;
  starsIntensity: number;
}> = {
  night: {
    topColor: 0x0a0a18,
    bottomColor: 0x151520,
    horizonColor: 0x2a2040,     // Dim purple horizon
    horizonIntensity: 0.4,
    horizonBlend: 0.25,
    starsIntensity: 1.0,
  },
  morning: {
    topColor: 0x4a3828,
    bottomColor: 0x5a4430,
    horizonColor: 0xcc8844,     // Warm amber sunrise
    horizonIntensity: 1.0,
    horizonBlend: 0.3,
    starsIntensity: 0.05,
  },
  day: {
    topColor: 0x4a3e2e,
    bottomColor: 0x3d3225,
    horizonColor: 0x6a5a42,     // Warm earth-tone haze
    horizonIntensity: 0.4,
    horizonBlend: 0.35,
    starsIntensity: 0.0,
  },
  evening: {
    topColor: 0x2a1810,
    bottomColor: 0x3a2218,
    horizonColor: 0xcc5522,     // Deep amber sunset
    horizonIntensity: 0.8,
    horizonBlend: 0.28,
    starsIntensity: 0.3,
  },
};

const SKY_VERTEX = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPosition = wp.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  varying vec3 vWorldPosition;

  uniform vec3 uTopColor;
  uniform vec3 uBottomColor;
  uniform vec3 uHorizonColor;
  uniform float uHorizonIntensity;
  uniform float uHorizonBlend;
  uniform float uStarsIntensity;
  uniform float uTime;

  // 3D hash for star placement
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 dir = normalize(vWorldPosition);
    float h = dir.y; // -1 (bottom) to +1 (top)

    // --- Sky gradient ---
    vec3 skyColor = mix(uBottomColor, uTopColor, max(h, 0.0));

    // --- Horizon glow band ---
    float horizonDist = abs(h);
    float horizonFactor = 1.0 - (horizonDist / uHorizonBlend);
    horizonFactor = clamp(horizonFactor, 0.0, 1.0);
    horizonFactor = pow(horizonFactor, 2.0) * uHorizonIntensity;
    skyColor = mix(skyColor, uHorizonColor, horizonFactor);

    // --- Procedural stars (upper hemisphere only) ---
    if (h > 0.1 && uStarsIntensity > 0.01) {
      vec3 starPos = dir * 80.0;
      vec3 cellPos = floor(starPos);
      float starHash = hash3(cellPos);

      if (starHash > 0.985) {
        // Twinkle
        float twinkle = 0.6 + 0.4 * sin(uTime * 2.0 + starHash * 6.2831);
        float brightness = twinkle * uStarsIntensity;
        // Fade near horizon
        float horizonFade = smoothstep(0.1, 0.35, h);
        skyColor += vec3(brightness * horizonFade);
      }
    }

    gl_FragColor = vec4(skyColor, 1.0);
  }
`;

export class ThreeSky {
  private mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  // Current interpolated uniform values
  private currentTop = new THREE.Color(0x020210);
  private currentBottom = new THREE.Color(0x0c0c1e);
  private currentHorizon = new THREE.Color(0x4a00e0);
  private currentHorizonIntensity = 0.8;
  private currentHorizonBlend = 0.25;
  private currentStars = 1.0;

  // Target values (set by time phase, lerped toward)
  private targetTop = new THREE.Color(0x020210);
  private targetBottom = new THREE.Color(0x0c0c1e);
  private targetHorizon = new THREE.Color(0x4a00e0);
  private targetHorizonIntensity = 0.8;
  private targetHorizonBlend = 0.25;
  private targetStars = 1.0;

  constructor() {
    const geometry = new THREE.SphereGeometry(500, 32, 16);

    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTopColor: { value: this.currentTop.clone() },
        uBottomColor: { value: this.currentBottom.clone() },
        uHorizonColor: { value: this.currentHorizon.clone() },
        uHorizonIntensity: { value: this.currentHorizonIntensity },
        uHorizonBlend: { value: this.currentHorizonBlend },
        uStarsIntensity: { value: this.currentStars },
        uTime: { value: 0 },
      },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
  }

  getMesh(): THREE.Mesh {
    return this.mesh;
  }

  /**
   * Set target time phase — sky will lerp toward these values
   */
  setTimePhase(phase: TimePhase): void {
    const preset = SKY_PRESETS[phase];
    if (!preset) return;

    this.targetTop.setHex(preset.topColor);
    this.targetBottom.setHex(preset.bottomColor);
    this.targetHorizon.setHex(preset.horizonColor);
    this.targetHorizonIntensity = preset.horizonIntensity;
    this.targetHorizonBlend = preset.horizonBlend;
    this.targetStars = preset.starsIntensity;
  }

  /**
   * Update sky animation each frame — lerps colors + updates star twinkle
   */
  update(elapsed: number, dt: number): void {
    const factor = Math.min(1.0, dt * 0.5);

    this.currentTop.lerp(this.targetTop, factor);
    this.currentBottom.lerp(this.targetBottom, factor);
    this.currentHorizon.lerp(this.targetHorizon, factor);
    this.currentHorizonIntensity = THREE.MathUtils.lerp(
      this.currentHorizonIntensity, this.targetHorizonIntensity, factor,
    );
    this.currentHorizonBlend = THREE.MathUtils.lerp(
      this.currentHorizonBlend, this.targetHorizonBlend, factor,
    );
    this.currentStars = THREE.MathUtils.lerp(
      this.currentStars, this.targetStars, factor,
    );

    const u = this.material.uniforms;
    u.uTopColor.value.copy(this.currentTop);
    u.uBottomColor.value.copy(this.currentBottom);
    u.uHorizonColor.value.copy(this.currentHorizon);
    u.uHorizonIntensity.value = this.currentHorizonIntensity;
    u.uHorizonBlend.value = this.currentHorizonBlend;
    u.uStarsIntensity.value = this.currentStars;
    u.uTime.value = elapsed;
  }

  /**
   * Anchor sky to camera so it always surrounds the view
   */
  followCamera(cameraRig: THREE.Object3D): void {
    this.mesh.position.copy(cameraRig.position);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
