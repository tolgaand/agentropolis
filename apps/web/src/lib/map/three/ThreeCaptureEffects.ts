/**
 * ThreeCaptureEffects - Contested parcel visualization
 *
 * Renders pulsing border rings around parcels being captured
 * with countdown indicators and faction color blending.
 */

import * as THREE from 'three';
import { TILE_SIZE, BLOCK_SIZE, BLOCK_STRIDE, BLOCK_OFFSET_X, BLOCK_OFFSET_Y, FACTION_COLORS } from './ThreeConfig';

export interface ContestedParcel {
  parcelId: string;
  blockX: number;
  blockY: number;
  attackerFaction: string;
  defenderFaction: string;
  startTime: number;
  duration: number; // 90000ms
}

interface ContestedVisual {
  ring: THREE.Mesh;
  progressBar: THREE.Mesh;
  startTime: number;
  duration: number;
  attackerColor: THREE.Color;
  defenderColor: THREE.Color;
}

export class ThreeCaptureEffects {
  private group: THREE.Group;
  private contestedVisuals = new Map<string, ContestedVisual>();

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'capture_effects';
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Update contested parcels from socket state
   */
  updateContested(parcels: ContestedParcel[]): void {
    const currentIds = new Set(parcels.map(p => p.parcelId));

    // Remove visuals for parcels no longer contested
    for (const [id, visual] of this.contestedVisuals.entries()) {
      if (!currentIds.has(id)) {
        this.group.remove(visual.ring);
        this.group.remove(visual.progressBar);
        visual.ring.geometry.dispose();
        (visual.ring.material as THREE.Material).dispose();
        visual.progressBar.geometry.dispose();
        (visual.progressBar.material as THREE.Material).dispose();
        this.contestedVisuals.delete(id);
      }
    }

    // Add/update visuals for contested parcels
    for (const parcel of parcels) {
      if (!this.contestedVisuals.has(parcel.parcelId)) {
        this.createContestedVisual(parcel);
      }
    }
  }

  /**
   * Create visual for a contested parcel
   */
  private createContestedVisual(parcel: ContestedParcel): void {
    // Calculate parcel world center
    const startX = (parcel.blockX * BLOCK_STRIDE + BLOCK_OFFSET_X) * TILE_SIZE;
    const startZ = (parcel.blockY * BLOCK_STRIDE + BLOCK_OFFSET_Y) * TILE_SIZE;
    const centerX = startX + (BLOCK_SIZE * TILE_SIZE) / 2;
    const centerZ = startZ + (BLOCK_SIZE * TILE_SIZE) / 2;

    // Get faction colors
    const attackerColor = new THREE.Color(FACTION_COLORS[parcel.attackerFaction] ?? 0xff4444);
    const defenderColor = new THREE.Color(FACTION_COLORS[parcel.defenderFaction] ?? 0x888888);

    // Create pulsing ring around parcel
    const ringRadius = (BLOCK_SIZE * TILE_SIZE) / 2 + 0.5;
    const ringGeometry = new THREE.RingGeometry(ringRadius - 0.3, ringRadius, 64);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: attackerColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.set(centerX, 0.05, centerZ);
    ring.rotation.x = -Math.PI / 2;
    this.group.add(ring);

    // Create progress bar above parcel center
    const barWidth = 3.0;
    const barHeight = 0.3;
    const barGeometry = new THREE.PlaneGeometry(barWidth, barHeight);
    const barMaterial = new THREE.MeshBasicMaterial({
      color: attackerColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const progressBar = new THREE.Mesh(barGeometry, barMaterial);
    progressBar.position.set(centerX, 2.0, centerZ);
    progressBar.rotation.x = -Math.PI / 4; // Angled for visibility
    this.group.add(progressBar);

    this.contestedVisuals.set(parcel.parcelId, {
      ring,
      progressBar,
      startTime: parcel.startTime,
      duration: parcel.duration,
      attackerColor,
      defenderColor,
    });
  }

  /**
   * Animate all contested visuals (pulse + progress)
   */
  animate(time: number): void {
    for (const visual of this.contestedVisuals.values()) {
      const elapsed = time - visual.startTime;
      const progress = Math.min(1.0, elapsed / visual.duration);

      // Pulse animation (scale + opacity)
      const pulseFreq = 2.0; // Hz
      const pulsePhase = (time * pulseFreq * Math.PI * 2) % (Math.PI * 2);
      const pulseFactor = 0.5 + 0.5 * Math.sin(pulsePhase);

      visual.ring.scale.setScalar(1.0 + pulseFactor * 0.05);
      const ringMat = visual.ring.material as THREE.MeshBasicMaterial;
      ringMat.opacity = 0.3 + pulseFactor * 0.5;

      // Blend color from defender to attacker as capture progresses
      const blendedColor = new THREE.Color().lerpColors(
        visual.defenderColor,
        visual.attackerColor,
        progress
      );
      ringMat.color.copy(blendedColor);

      // Update progress bar width
      const barMat = visual.progressBar.material as THREE.MeshBasicMaterial;
      visual.progressBar.scale.x = progress;
      barMat.color.copy(blendedColor);
    }
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    for (const visual of this.contestedVisuals.values()) {
      visual.ring.geometry.dispose();
      (visual.ring.material as THREE.Material).dispose();
      visual.progressBar.geometry.dispose();
      (visual.progressBar.material as THREE.Material).dispose();
    }
    this.contestedVisuals.clear();
    this.group.clear();
  }
}
