/**
 * V2Season — Season controller for CityRendererV2
 *
 * Drives scene atmosphere based on game season:
 * - Color grading via light colors/intensity
 * - Fog density/color
 * - Scene background color
 * - Cloud tint/opacity
 *
 * Transitions smoothly over ~3 seconds between seasons.
 */

import * as THREE from 'three';

// ─── Season profiles ───
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

interface SeasonProfile {
  ambientColor: number;
  ambientIntensity: number;
  hemiSkyColor: number;
  hemiGroundColor: number;
  hemiIntensity: number;
  dirColor: number;
  dirIntensity: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  bgColor: number;
  cloudOpacity: number;
}

// Neutral lighting — no colored tints, just clean warm daylight for all seasons.
// Only fog distance and cloud opacity vary slightly.
const NEUTRAL: Omit<SeasonProfile, 'fogNear' | 'fogFar' | 'cloudOpacity'> = {
  ambientColor: 0xffffff,
  ambientIntensity: 0.8,
  hemiSkyColor: 0xeef4f8,
  hemiGroundColor: 0x8B8070,
  hemiIntensity: 0.4,
  dirColor: 0xfff8f0,
  dirIntensity: 1.1,
  fogColor: 0xd8dce0,
  bgColor: 0xd8dce0,
};

const PROFILES: Record<Season, SeasonProfile> = {
  spring: { ...NEUTRAL, fogNear: 340, fogFar: 500, cloudOpacity: 0.7 },
  summer: { ...NEUTRAL, fogNear: 360, fogFar: 520, cloudOpacity: 0.55 },
  autumn: { ...NEUTRAL, fogNear: 320, fogFar: 480, cloudOpacity: 0.75 },
  winter: { ...NEUTRAL, fogNear: 300, fogFar: 450, cloudOpacity: 0.85 },
};

// ─── Helpers ───
const _c = new THREE.Color();
const _c2 = new THREE.Color();

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ─── SeasonController ───
export interface SeasonSceneRefs {
  scene: THREE.Scene;
  ambientLight: THREE.AmbientLight;
  hemiLight: THREE.HemisphereLight;
  dirLight: THREE.DirectionalLight;
  clouds: THREE.Group[];
}

export class SeasonController {
  private refs: SeasonSceneRefs | null = null;
  private currentSeason: Season = 'spring';
  private targetSeason: Season = 'spring';
  private transitionProgress = 1; // 0→1, 1 = complete
  private transitionSpeed = 1 / 3; // 3 second transition

  // Current interpolated state
  private current: SeasonProfile = { ...PROFILES.spring };

  attach(refs: SeasonSceneRefs): void {
    this.refs = refs;
    this.applyImmediate(this.currentSeason);
  }

  /** Set season (will transition smoothly) */
  setSeason(season: string): void {
    const s = normalizeSeason(season);
    if (s === this.targetSeason) return;
    this.targetSeason = s;
    this.transitionProgress = 0;
  }

  /** Set season immediately (no transition) */
  applyImmediate(season: string): void {
    const s = normalizeSeason(season);
    this.currentSeason = s;
    this.targetSeason = s;
    this.transitionProgress = 1;
    this.current = { ...PROFILES[s] };
    this.applyToScene();
  }

  /** Call each frame with delta seconds */
  update(dt: number): void {
    if (this.transitionProgress >= 1) return;

    this.transitionProgress = Math.min(1, this.transitionProgress + dt * this.transitionSpeed);
    // Smooth ease-in-out
    const t = smoothstep(this.transitionProgress);

    const from = PROFILES[this.currentSeason];
    const to = PROFILES[this.targetSeason];

    this.current.ambientIntensity = lerpNum(from.ambientIntensity, to.ambientIntensity, t);
    this.current.hemiIntensity = lerpNum(from.hemiIntensity, to.hemiIntensity, t);
    this.current.dirIntensity = lerpNum(from.dirIntensity, to.dirIntensity, t);
    this.current.fogNear = lerpNum(from.fogNear, to.fogNear, t);
    this.current.fogFar = lerpNum(from.fogFar, to.fogFar, t);
    this.current.cloudOpacity = lerpNum(from.cloudOpacity, to.cloudOpacity, t);

    // Colors interpolated via Three.js Color.lerp
    this.current.ambientColor = lerpHex(from.ambientColor, to.ambientColor, t);
    this.current.hemiSkyColor = lerpHex(from.hemiSkyColor, to.hemiSkyColor, t);
    this.current.hemiGroundColor = lerpHex(from.hemiGroundColor, to.hemiGroundColor, t);
    this.current.dirColor = lerpHex(from.dirColor, to.dirColor, t);
    this.current.fogColor = lerpHex(from.fogColor, to.fogColor, t);
    this.current.bgColor = lerpHex(from.bgColor, to.bgColor, t);

    this.applyToScene();

    if (this.transitionProgress >= 1) {
      this.currentSeason = this.targetSeason;
    }
  }

  getCurrentSeason(): Season {
    return this.targetSeason;
  }

  private applyToScene(): void {
    if (!this.refs) return;
    const { scene, ambientLight, hemiLight, dirLight, clouds } = this.refs;
    const p = this.current;

    ambientLight.color.setHex(p.ambientColor);
    ambientLight.intensity = p.ambientIntensity;

    hemiLight.color.setHex(p.hemiSkyColor);
    hemiLight.groundColor.setHex(p.hemiGroundColor);
    hemiLight.intensity = p.hemiIntensity;

    dirLight.color.setHex(p.dirColor);
    dirLight.intensity = p.dirIntensity;

    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.setHex(p.fogColor);
      scene.fog.near = p.fogNear;
      scene.fog.far = p.fogFar;
    }

    if (scene.background instanceof THREE.Color) {
      scene.background.setHex(p.bgColor);
    }

    // Cloud opacity
    for (const cloud of clouds) {
      cloud.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (mat.opacity !== undefined) {
            mat.opacity = p.cloudOpacity;
          }
        }
      });
    }
  }
}

// ─── Utilities ───
function normalizeSeason(s: string): Season {
  const lower = s.toLowerCase();
  if (lower === 'spring' || lower === 'summer' || lower === 'autumn' || lower === 'winter') {
    return lower;
  }
  // Fall back to spring for unknown seasons
  return 'spring';
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerpHex(a: number, b: number, t: number): number {
  _c.setHex(a);
  _c2.setHex(b);
  _c.lerp(_c2, t);
  return _c.getHex();
}
