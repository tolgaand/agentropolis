/**
 * ThreeArmyMarches - Visualize marching armies on the 3D map
 *
 * Visual representation:
 * - Small group of soldier pawns in formation
 * - March line from start to destination (dashed, faction colored)
 * - Position interpolated based on marchProgress (0-1)
 * - Smooth client-side animation between server updates
 */

import * as THREE from 'three';
import { TILE_SIZE, FACTION_COLORS } from './ThreeConfig';

export interface MarchingArmyData {
  armyId: string;
  factionId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
  speed: number;
  unitCount: number;
}

interface MarchVisual {
  armyId: string;
  factionId: string;

  // Server positions (block coords)
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;

  // Server progress
  serverProgress: number;

  // Client-side interpolated progress (smoothly lerps toward serverProgress)
  clientProgress: number;

  // Visual elements
  soldierGroup: THREE.Group;
  marchLine: THREE.Line;
}

const MARCH_Y = 0.5; // Slightly above ground
const SOLDIER_COUNT = 5; // Small formation
const FORMATION_RADIUS = 0.3; // Tight cluster

export class ThreeArmyMarches {
  private group = new THREE.Group();
  private marches = new Map<string, MarchVisual>();

  // Shared geometries/materials for efficiency
  private soldierGeometry: THREE.SphereGeometry;
  private lineMaterial = new Map<string, THREE.LineDashedMaterial>();

  constructor(scene: THREE.Scene) {
    this.group.name = 'army_marches';
    scene.add(this.group);

    // Simple sphere for soldier pawns (can be replaced with better geometry later)
    this.soldierGeometry = new THREE.SphereGeometry(0.15, 8, 8);
  }

  /**
   * Update marching armies from socket state
   */
  updateMarches(armies: MarchingArmyData[]): void {
    const activeIds = new Set(armies.map(a => a.armyId));

    // Remove ended marches
    for (const [armyId, march] of this.marches) {
      if (!activeIds.has(armyId)) {
        this.disposeMarch(march);
        this.marches.delete(armyId);
      }
    }

    // Create or update marches
    for (const army of armies) {
      const existing = this.marches.get(army.armyId);

      if (existing) {
        // Update server progress
        existing.serverProgress = army.progress;
      } else {
        // Create new march visual
        this.createMarch(army);
      }
    }
  }

  /**
   * Animate client-side interpolation for smooth movement
   */
  animate(deltaTime: number): void {
    for (const march of this.marches.values()) {
      // Lerp client progress toward server progress for smooth movement
      const lerpFactor = Math.min(1.0, deltaTime * 3.0); // ~0.33s smooth catch-up
      march.clientProgress = THREE.MathUtils.lerp(
        march.clientProgress,
        march.serverProgress,
        lerpFactor
      );

      // Update visual position based on client progress
      this.updateMarchPosition(march);
    }
  }

  /**
   * Create a new march visual
   */
  private createMarch(army: MarchingArmyData): void {
    const factionColor = FACTION_COLORS[army.factionId] ?? 0xc9a84c;

    // Soldier group (small formation of pawns)
    const soldierGroup = new THREE.Group();
    soldierGroup.name = `army_${army.armyId}_soldiers`;

    // Create soldier pawns in tight formation
    const material = new THREE.MeshStandardMaterial({
      color: factionColor,
      emissive: factionColor,
      emissiveIntensity: 0.3,
    });

    for (let i = 0; i < SOLDIER_COUNT; i++) {
      const soldier = new THREE.Mesh(this.soldierGeometry, material);

      // Position in formation (circle)
      const angle = (i / SOLDIER_COUNT) * Math.PI * 2;
      const offsetX = Math.cos(angle) * FORMATION_RADIUS;
      const offsetZ = Math.sin(angle) * FORMATION_RADIUS;

      soldier.position.set(offsetX, 0, offsetZ);
      soldier.castShadow = true;
      soldierGroup.add(soldier);
    }

    // March line (dashed line from start to destination)
    const fromWorld = new THREE.Vector3(
      army.fromX * TILE_SIZE,
      MARCH_Y - 0.3,
      army.fromY * TILE_SIZE
    );
    const toWorld = new THREE.Vector3(
      army.toX * TILE_SIZE,
      MARCH_Y - 0.3,
      army.toY * TILE_SIZE
    );

    const lineGeometry = new THREE.BufferGeometry().setFromPoints([fromWorld, toWorld]);

    // Get or create faction line material
    let lineMat = this.lineMaterial.get(army.factionId);
    if (!lineMat) {
      lineMat = new THREE.LineDashedMaterial({
        color: factionColor,
        dashSize: 0.5,
        gapSize: 0.3,
        opacity: 0.6,
        transparent: true,
      });
      this.lineMaterial.set(army.factionId, lineMat);
    }

    const line = new THREE.Line(lineGeometry, lineMat);
    line.computeLineDistances(); // Required for dashed lines
    line.name = `army_${army.armyId}_line`;

    this.group.add(soldierGroup);
    this.group.add(line);

    // Store march visual
    const march: MarchVisual = {
      armyId: army.armyId,
      factionId: army.factionId,
      fromX: army.fromX,
      fromY: army.fromY,
      toX: army.toX,
      toY: army.toY,
      serverProgress: army.progress,
      clientProgress: army.progress, // Start at server position
      soldierGroup,
      marchLine: line,
    };

    this.marches.set(army.armyId, march);

    // Initial position
    this.updateMarchPosition(march);

    console.log(`[ThreeArmyMarches] Created march visual for army ${army.armyId} (${army.factionId})`);
  }

  /**
   * Update visual position based on current client progress
   */
  private updateMarchPosition(march: MarchVisual): void {
    // Convert block coords to world coords
    const fromWorld = new THREE.Vector3(
      march.fromX * TILE_SIZE,
      MARCH_Y,
      march.fromY * TILE_SIZE
    );
    const toWorld = new THREE.Vector3(
      march.toX * TILE_SIZE,
      MARCH_Y,
      march.toY * TILE_SIZE
    );

    // Interpolate position
    const pos = new THREE.Vector3().lerpVectors(fromWorld, toWorld, march.clientProgress);
    march.soldierGroup.position.copy(pos);

    // Orient soldiers toward destination
    const direction = new THREE.Vector3().subVectors(toWorld, fromWorld).normalize();
    const angle = Math.atan2(direction.x, direction.z);
    march.soldierGroup.rotation.y = angle;
  }

  /**
   * Dispose a march visual
   */
  private disposeMarch(march: MarchVisual): void {
    this.group.remove(march.soldierGroup);
    this.group.remove(march.marchLine);

    // Dispose soldier group
    march.soldierGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });

    // Dispose march line geometry (material is shared, don't dispose)
    march.marchLine.geometry.dispose();

    console.log(`[ThreeArmyMarches] Removed march visual for army ${march.armyId}`);
  }

  /**
   * Get the group for adding to scene
   */
  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    for (const march of this.marches.values()) {
      this.disposeMarch(march);
    }
    this.marches.clear();

    // Dispose shared resources
    this.soldierGeometry.dispose();
    for (const material of this.lineMaterial.values()) {
      material.dispose();
    }
    this.lineMaterial.clear();
  }
}
