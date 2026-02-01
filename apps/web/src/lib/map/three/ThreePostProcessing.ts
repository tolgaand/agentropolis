/**
 * ThreePostProcessing - Cyberpunk bloom and post-processing effects
 *
 * Uses EffectComposer with RenderPass + UnrealBloomPass for neon glow.
 * Bloom strength adjusts based on time phase (stronger at night).
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  BLOOM_PARAMS,
  BLOOM_NIGHT_STRENGTH,
  BLOOM_DAY_STRENGTH,
} from './ThreeConfig';
import type { TimePhase } from '../types';

const BLOOM_PHASE_STRENGTH: Record<string, number> = {
  morning: 0.3,
  day: BLOOM_DAY_STRENGTH,
  evening: 0.5,
  night: BLOOM_NIGHT_STRENGTH,
};

export class ThreePostProcessing {
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    this.composer = new EffectComposer(renderer);

    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    const resolution = new THREE.Vector2(
      renderer.domElement.width,
      renderer.domElement.height,
    );

    this.bloomPass = new UnrealBloomPass(
      resolution,
      BLOOM_PARAMS.strength,
      BLOOM_PARAMS.radius,
      BLOOM_PARAMS.threshold,
    );
    this.composer.addPass(this.bloomPass);

    // Output pass for correct color space
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  /**
   * Update bloom strength based on time phase
   */
  setTimePhase(phase: TimePhase): void {
    const strength = BLOOM_PHASE_STRENGTH[phase] ?? BLOOM_DAY_STRENGTH;
    this.bloomPass.strength = strength;
  }

  /**
   * Resize the composer
   */
  resize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  /**
   * Render with post-processing
   */
  render(): void {
    this.composer.render();
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.composer.dispose();
  }
}
