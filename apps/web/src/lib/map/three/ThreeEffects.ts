/**
 * ThreeEffects - Visual effects for the cyberpunk city
 *
 * - Smoke particles on industrial buildings
 * - Street lamp PointLights during night
 * - Trade route visualization (animated glow tubes)
 */

import * as THREE from 'three';
import { TILE_SIZE, WORLD_COLORS } from './ThreeConfig';
import type { RenderableBuilding, TimePhase } from '../types';

// ============================================================================
// Smoke Particles
// ============================================================================

interface SmokeSystem {
  points: THREE.Points;
  positions: Float32Array;
  velocities: Float32Array;
  lifetimes: Float32Array;
  count: number;
}

const SMOKE_PARTICLE_COUNT = 50;

function createSmokeSystem(worldX: number, worldZ: number, height: number): SmokeSystem {
  const count = SMOKE_PARTICLE_COUNT;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const lifetimes = new Float32Array(count);

  // Initialize particles at random positions above the building
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    positions[i3] = worldX + (Math.random() - 0.5) * 0.3;
    positions[i3 + 1] = height + Math.random() * 0.5;
    positions[i3 + 2] = worldZ + (Math.random() - 0.5) * 0.3;

    velocities[i3] = (Math.random() - 0.5) * 0.002;
    velocities[i3 + 1] = 0.005 + Math.random() * 0.005;
    velocities[i3 + 2] = (Math.random() - 0.5) * 0.002;

    lifetimes[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0x888888,
    size: 0.15,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.renderOrder = 900;

  return { points, positions, velocities, lifetimes, count };
}

function updateSmokeSystem(smoke: SmokeSystem, originX: number, originZ: number, height: number): void {
  for (let i = 0; i < smoke.count; i++) {
    const i3 = i * 3;
    smoke.lifetimes[i] += 0.008;

    if (smoke.lifetimes[i] >= 1.0) {
      // Reset particle
      smoke.lifetimes[i] = 0;
      smoke.positions[i3] = originX + (Math.random() - 0.5) * 0.3;
      smoke.positions[i3 + 1] = height;
      smoke.positions[i3 + 2] = originZ + (Math.random() - 0.5) * 0.3;
    } else {
      smoke.positions[i3] += smoke.velocities[i3];
      smoke.positions[i3 + 1] += smoke.velocities[i3 + 1];
      smoke.positions[i3 + 2] += smoke.velocities[i3 + 2];
    }
  }

  const posAttr = smoke.points.geometry.getAttribute('position') as THREE.BufferAttribute;
  posAttr.needsUpdate = true;
}

// ============================================================================
// Street Lamps
// ============================================================================

interface StreetLamp {
  light: THREE.PointLight;
  position: THREE.Vector3;
}

const MAX_LAMPS = 20;
const LAMP_COLOR = 0xffaa44;
const LAMP_INTENSITY_NIGHT = 1.5;
const LAMP_INTENSITY_DAY = 0;
const LAMP_DISTANCE = 5;

// ============================================================================
// Trade Route Visualization
// ============================================================================

interface TradeRoute {
  mesh: THREE.Mesh;
  fromWorld: string;
  toWorld: string;
  animationOffset: number;
}

// ============================================================================
// ThreeEffects class
// ============================================================================

export class ThreeEffects {
  private group: THREE.Group;
  private smokeSystems: Array<{
    system: SmokeSystem;
    originX: number;
    originZ: number;
    height: number;
  }> = [];
  private lamps: StreetLamp[] = [];
  private tradeRoutes: TradeRoute[] = [];
  private currentPhase: TimePhase = 'day';

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'effects';
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Set up smoke particles for industrial buildings
   */
  setupSmoke(buildings: RenderableBuilding[]): void {
    // Clear existing
    this.clearSmoke();

    // Find industrial buildings (spriteIds 33-48)
    const industrial = buildings.filter(
      b => b.spriteId >= 33 && b.spriteId <= 48,
    );

    // Limit smoke systems for performance
    const maxSmoke = 10;
    const selected = industrial.slice(0, maxSmoke);

    for (const building of selected) {
      const worldX = building.coords.x * TILE_SIZE;
      const worldZ = building.coords.y * TILE_SIZE;
      const height = TILE_SIZE * 1.5; // Approximate building height

      const system = createSmokeSystem(worldX, worldZ, height);
      this.group.add(system.points);
      this.smokeSystems.push({ system, originX: worldX, originZ: worldZ, height });
    }
  }

  /**
   * Set up street lamps at lamp decoration positions
   */
  setupLamps(buildings: RenderableBuilding[]): void {
    this.clearLamps();

    // Find lamp decorations (spriteId 90)
    const lampBuildings = buildings.filter(b => b.spriteId === 90);
    const selected = lampBuildings.slice(0, MAX_LAMPS);

    for (const building of selected) {
      const worldX = building.coords.x * TILE_SIZE;
      const worldZ = building.coords.y * TILE_SIZE;

      const light = new THREE.PointLight(
        LAMP_COLOR,
        this.currentPhase === 'night' ? LAMP_INTENSITY_NIGHT : LAMP_INTENSITY_DAY,
        LAMP_DISTANCE,
      );
      light.position.set(worldX, TILE_SIZE * 0.8, worldZ);

      this.group.add(light);
      this.lamps.push({
        light,
        position: new THREE.Vector3(worldX, TILE_SIZE * 0.8, worldZ),
      });
    }
  }

  /**
   * Add a trade route visualization between two world positions
   */
  addTradeRoute(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    worldId: string,
  ): void {
    const color = WORLD_COLORS[worldId] ?? 0x7b68ee;

    // Create curved path
    const midX = (fromX + toX) / 2;
    const midZ = (fromZ + toZ) / 2;
    const midY = 3; // Arc height

    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(fromX, 0.5, fromZ),
      new THREE.Vector3(midX, midY, midZ),
      new THREE.Vector3(toX, 0.5, toZ),
    );

    const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.05, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(tubeGeo, tubeMat);
    mesh.renderOrder = 800;
    this.group.add(mesh);

    this.tradeRoutes.push({
      mesh,
      fromWorld: worldId,
      toWorld: worldId,
      animationOffset: Math.random() * Math.PI * 2,
    });
  }

  /**
   * Update time phase (affects lamp intensity)
   */
  setTimePhase(phase: TimePhase): void {
    this.currentPhase = phase;

    const isNight = phase === 'night';
    const isEvening = phase === 'evening';
    const intensity = isNight ? LAMP_INTENSITY_NIGHT : isEvening ? LAMP_INTENSITY_NIGHT * 0.5 : LAMP_INTENSITY_DAY;

    for (const lamp of this.lamps) {
      lamp.light.intensity = intensity;
    }

    // Smoke visibility
    const smokeOpacity = isNight ? 0.4 : 0.2;
    for (const { system } of this.smokeSystems) {
      const mat = system.points.material as THREE.PointsMaterial;
      mat.opacity = smokeOpacity;
    }
  }

  /**
   * Update animation tick (call each frame)
   */
  update(time: number): void {
    // Update smoke particles
    for (const { system, originX, originZ, height } of this.smokeSystems) {
      updateSmokeSystem(system, originX, originZ, height);
    }

    // Animate trade routes (pulse opacity)
    for (const route of this.tradeRoutes) {
      const mat = route.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.3 + Math.sin(time * 2 + route.animationOffset) * 0.3;
    }
  }

  private clearSmoke(): void {
    for (const { system } of this.smokeSystems) {
      this.group.remove(system.points);
      system.points.geometry.dispose();
      (system.points.material as THREE.Material).dispose();
    }
    this.smokeSystems = [];
  }

  private clearLamps(): void {
    for (const lamp of this.lamps) {
      this.group.remove(lamp.light);
      lamp.light.dispose();
    }
    this.lamps = [];
  }

  private clearTradeRoutes(): void {
    for (const route of this.tradeRoutes) {
      this.group.remove(route.mesh);
      route.mesh.geometry.dispose();
      (route.mesh.material as THREE.Material).dispose();
    }
    this.tradeRoutes = [];
  }

  /**
   * Dispose all effects
   */
  dispose(): void {
    this.clearSmoke();
    this.clearLamps();
    this.clearTradeRoutes();
  }
}
