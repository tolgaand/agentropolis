/**
 * ThreeAgents - Agent pawn visualization system
 *
 * Renders agents as pawn-shaped 3D objects (cylinder body + cone head)
 * colored by their faction (worldId). Uses InstancedMesh for performance.
 *
 * Each parcel displays one pawn for its owner agent.
 * Multiple agents in a region are distributed in circle patterns.
 */

import * as THREE from 'three';
import { TILE_SIZE, FACTION_COLORS } from './ThreeConfig';
import type { MapParcel } from '@agentropolis/shared';

// Agent pawn geometry config
const AGENT_CONFIG = {
  BODY_RADIUS: 0.15,
  BODY_HEIGHT: 0.5,
  HEAD_RADIUS: 0.2,
  HEAD_HEIGHT: 0.3,
  MAX_INSTANCES: 200,
  GROUND_OFFSET: 0.25, // Y position so pawns sit on ground
  CLUSTER_RADIUS: 1.5,  // When multiple agents in same area, spread in circle
} as const;

export class ThreeAgents {
  private scene: THREE.Scene;
  private bodyMesh: THREE.InstancedMesh | null = null;
  private headMesh: THREE.InstancedMesh | null = null;
  private count = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.init();
  }

  /**
   * Initialize instanced meshes for agent pawns
   */
  private init(): void {
    // Body: Cylinder
    const bodyGeometry = new THREE.CylinderGeometry(
      AGENT_CONFIG.BODY_RADIUS,
      AGENT_CONFIG.BODY_RADIUS,
      AGENT_CONFIG.BODY_HEIGHT,
      8, // segments
    );

    const bodyMaterial = new THREE.MeshLambertMaterial({
      color: 0xffffff, // Will be overridden per-instance
    });

    this.bodyMesh = new THREE.InstancedMesh(
      bodyGeometry,
      bodyMaterial,
      AGENT_CONFIG.MAX_INSTANCES,
    );
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;
    this.bodyMesh.name = 'agent_bodies';
    this.scene.add(this.bodyMesh);

    // Head: Cone
    const headGeometry = new THREE.ConeGeometry(
      AGENT_CONFIG.HEAD_RADIUS,
      AGENT_CONFIG.HEAD_HEIGHT,
      8, // segments
    );

    const headMaterial = new THREE.MeshLambertMaterial({
      color: 0xffffff, // Will be overridden per-instance
    });

    this.headMesh = new THREE.InstancedMesh(
      headGeometry,
      headMaterial,
      AGENT_CONFIG.MAX_INSTANCES,
    );
    this.headMesh.castShadow = true;
    this.headMesh.receiveShadow = true;
    this.headMesh.name = 'agent_heads';
    this.scene.add(this.headMesh);

    // Initially hide all instances (count = 0)
    this.count = 0;
  }

  /**
   * Update agent pawn positions from parcel data.
   * Each parcel represents one agent at its location.
   */
  updateAgents(parcels: MapParcel[]): void {
    if (!this.bodyMesh || !this.headMesh) return;

    // Group parcels by their center tile position to detect clusters
    const positionMap = new Map<string, MapParcel[]>();

    for (const parcel of parcels) {
      const centerX = Math.floor(parcel.bounds.x + parcel.bounds.width / 2);
      const centerY = Math.floor(parcel.bounds.y + parcel.bounds.height / 2);
      const key = `${centerX},${centerY}`;

      if (!positionMap.has(key)) {
        positionMap.set(key, []);
      }
      positionMap.get(key)!.push(parcel);
    }

    let instanceIndex = 0;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    // Place one pawn per parcel
    for (const cluster of positionMap.values()) {
      const clusterSize = cluster.length;

      for (let i = 0; i < clusterSize && instanceIndex < AGENT_CONFIG.MAX_INSTANCES; i++) {
        const parcel = cluster[i];

        // Calculate world position from parcel bounds
        const centerX = parcel.bounds.x + parcel.bounds.width / 2;
        const centerY = parcel.bounds.y + parcel.bounds.height / 2;
        const worldX = centerX * TILE_SIZE;
        const worldZ = centerY * TILE_SIZE;

        // If multiple agents in same cluster, offset in circle pattern
        let offsetX = 0;
        let offsetZ = 0;
        if (clusterSize > 1) {
          const angle = (i / clusterSize) * Math.PI * 2;
          offsetX = Math.cos(angle) * AGENT_CONFIG.CLUSTER_RADIUS;
          offsetZ = Math.sin(angle) * AGENT_CONFIG.CLUSTER_RADIUS;
        }

        const finalX = worldX + offsetX;
        const finalZ = worldZ + offsetZ;

        // Get faction color (default to purple if not found)
        const factionColor = FACTION_COLORS[parcel.worldId] ?? 0x7b68ee;
        color.setHex(factionColor);

        // --- BODY INSTANCE ---
        dummy.position.set(finalX, AGENT_CONFIG.GROUND_OFFSET, finalZ);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        this.bodyMesh.setMatrixAt(instanceIndex, dummy.matrix);
        this.bodyMesh.setColorAt(instanceIndex, color);

        // --- HEAD INSTANCE ---
        // Place cone on top of cylinder
        const headY = AGENT_CONFIG.GROUND_OFFSET + AGENT_CONFIG.BODY_HEIGHT / 2 + AGENT_CONFIG.HEAD_HEIGHT / 2;
        dummy.position.set(finalX, headY, finalZ);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        this.headMesh.setMatrixAt(instanceIndex, dummy.matrix);
        this.headMesh.setColorAt(instanceIndex, color);

        instanceIndex++;
      }
    }

    // Update instance count
    this.count = instanceIndex;
    this.bodyMesh.count = this.count;
    this.headMesh.count = this.count;

    // Mark matrices and colors for update
    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.headMesh.instanceMatrix.needsUpdate = true;
    if (this.bodyMesh.instanceColor) this.bodyMesh.instanceColor.needsUpdate = true;
    if (this.headMesh.instanceColor) this.headMesh.instanceColor.needsUpdate = true;

    console.log(`[ThreeAgents] Updated ${this.count} agent pawns from ${parcels.length} parcels`);
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.bodyMesh) {
      this.scene.remove(this.bodyMesh);
      this.bodyMesh.geometry.dispose();
      (this.bodyMesh.material as THREE.Material).dispose();
      this.bodyMesh = null;
    }

    if (this.headMesh) {
      this.scene.remove(this.headMesh);
      this.headMesh.geometry.dispose();
      (this.headMesh.material as THREE.Material).dispose();
      this.headMesh = null;
    }

    this.count = 0;
  }
}
