/**
 * ThreeHackEffects - NetRun beams, shields, breach flashes, building glow
 *
 * Visual effects for active hacking operations:
 * - Attack beam between attacker and target buildings
 * - Shield wireframe around target
 * - Breach flash on completion
 * - Building glow for bounties/active hacks
 */

import * as THREE from 'three';

interface ActiveBeam {
  runId: string;
  attackerPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  approach: string;
  progress: number;
  traceLevel: number;
  mesh: THREE.Mesh;
  particlesMesh: THREE.Points;
}

interface ActiveShield {
  agentId: string;
  mesh: THREE.Mesh;
  targetIntegrity: number;
}

interface BreachFlash {
  position: THREE.Vector3;
  mesh: THREE.Mesh;
  ring: THREE.Mesh;
  startTime: number;
  isSuccess: boolean;
}

interface BuildingGlow {
  agentId: string;
  mesh: THREE.Mesh;
  type: 'bounty' | 'hacked';
}

export interface HackEffectInput {
  runId: string;
  attackerId: string;
  targetId: string;
  approach: string;
  progress: number;
  traceLevel: number;
  status: string;
}

export interface AgentPositionMap {
  [agentId: string]: { x: number; z: number };
}

const APPROACH_COLORS: Record<string, number> = {
  stealth: 0x00ffff,   // cyan
  brute: 0xff3366,     // red
  social: 0xff00ff,    // magenta
};

const BEAM_Y = 3.0;         // Height of beam above ground
const SHIELD_RADIUS = 1.5;
const FLASH_DURATION = 1.5;  // seconds

export class ThreeHackEffects {
  private group = new THREE.Group();
  private beams = new Map<string, ActiveBeam>();
  private shields = new Map<string, ActiveShield>();
  private flashes: BreachFlash[] = [];
  private glows = new Map<string, BuildingGlow>();

  // Shared geometries/materials
  private shieldGeo: THREE.IcosahedronGeometry;
  private flashGeo: THREE.SphereGeometry;
  private ringGeo: THREE.RingGeometry;
  private particleGeo: THREE.BufferGeometry;

  constructor() {
    this.group.name = 'hack_effects';
    this.shieldGeo = new THREE.IcosahedronGeometry(SHIELD_RADIUS, 1);
    this.flashGeo = new THREE.SphereGeometry(0.5, 16, 16);
    this.ringGeo = new THREE.RingGeometry(0.5, 2.5, 32);
    this.particleGeo = new THREE.BufferGeometry();

    // Default particles (8 spark positions)
    const positions = new Float32Array(8 * 3);
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Update active hack state from socket data
   */
  updateHackingState(
    activeRuns: HackEffectInput[],
    agentPositions: AgentPositionMap,
    bountyTargetIds: string[],
  ): void {
    const activeRunIds = new Set(activeRuns.map(r => r.runId));

    // Remove beams for completed/removed runs
    for (const [runId, beam] of this.beams) {
      if (!activeRunIds.has(runId)) {
        this.group.remove(beam.mesh);
        this.group.remove(beam.particlesMesh);
        beam.mesh.geometry.dispose();
        (beam.mesh.material as THREE.Material).dispose();
        (beam.particlesMesh.material as THREE.Material).dispose();
        this.beams.delete(runId);
      }
    }

    // Update/create beams for active runs
    for (const run of activeRuns) {
      const attackerPos = agentPositions[run.attackerId];
      const targetPos = agentPositions[run.targetId];
      if (!attackerPos || !targetPos) continue;

      const from = new THREE.Vector3(attackerPos.x, BEAM_Y, attackerPos.z);
      const to = new THREE.Vector3(targetPos.x, BEAM_Y, targetPos.z);

      if (this.beams.has(run.runId)) {
        // Update existing beam
        const beam = this.beams.get(run.runId)!;
        beam.progress = run.progress;
        beam.traceLevel = run.traceLevel;
        this.updateBeamGeometry(beam, from, to);
      } else {
        // Create new beam
        this.createBeam(run, from, to);
      }

      // Shield on target
      if (!this.shields.has(run.targetId) && targetPos) {
        this.createShield(run.targetId, new THREE.Vector3(targetPos.x, 1.5, targetPos.z));
      }
    }

    // Remove shields for agents no longer being attacked
    const attackedAgentIds = new Set(activeRuns.map(r => r.targetId));
    for (const [agentId, shield] of this.shields) {
      if (!attackedAgentIds.has(agentId)) {
        this.group.remove(shield.mesh);
        (shield.mesh.material as THREE.Material).dispose();
        this.shields.delete(agentId);
      }
    }

    // Update bounty glows
    const bountySet = new Set(bountyTargetIds);
    // Remove old glows
    for (const [agentId, glow] of this.glows) {
      if (glow.type === 'bounty' && !bountySet.has(agentId)) {
        this.group.remove(glow.mesh);
        (glow.mesh.material as THREE.Material).dispose();
        glow.mesh.geometry.dispose();
        this.glows.delete(agentId);
      }
    }
    // Add new bounty glows
    for (const agentId of bountyTargetIds) {
      if (!this.glows.has(agentId)) {
        const pos = agentPositions[agentId];
        if (pos) {
          this.createBuildingGlow(agentId, new THREE.Vector3(pos.x, 0.1, pos.z), 'bounty');
        }
      }
    }
  }

  /**
   * Trigger a breach flash effect at a position
   */
  triggerBreachFlash(position: { x: number; z: number }, isSuccess: boolean): void {
    const pos = new THREE.Vector3(position.x, BEAM_Y, position.z);

    // Flash sphere
    const flashMat = new THREE.MeshBasicMaterial({
      color: isSuccess ? 0xffffff : 0xff3366,
      transparent: true,
      opacity: 1.0,
    });
    const flash = new THREE.Mesh(this.flashGeo, flashMat);
    flash.position.copy(pos);

    // Ring
    const ringMat = new THREE.MeshBasicMaterial({
      color: isSuccess ? 0xffffff : 0xff3366,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.position.copy(pos);
    ring.rotation.x = -Math.PI / 2;

    this.group.add(flash);
    this.group.add(ring);

    this.flashes.push({
      position: pos,
      mesh: flash,
      ring,
      startTime: performance.now() / 1000,
      isSuccess,
    });
  }

  /**
   * Update animations each frame
   */
  update(elapsed: number): void {
    // Animate beams (dash effect via material offset)
    for (const beam of this.beams.values()) {
      const mat = beam.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.5 + Math.sin(elapsed * 4) * 0.3 * beam.traceLevel;

      // Update spark particles at contact point
      this.updateParticles(beam, elapsed);
    }

    // Animate shields
    for (const shield of this.shields.values()) {
      const mat = shield.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.15 + Math.sin(elapsed * 3) * 0.1;
      shield.mesh.rotation.y = elapsed * 0.5;
      shield.mesh.rotation.x = Math.sin(elapsed * 0.3) * 0.1;
    }

    // Animate/cleanup breach flashes
    const now = performance.now() / 1000;
    this.flashes = this.flashes.filter(flash => {
      const age = now - flash.startTime;
      if (age > FLASH_DURATION) {
        this.group.remove(flash.mesh);
        this.group.remove(flash.ring);
        (flash.mesh.material as THREE.Material).dispose();
        (flash.ring.material as THREE.Material).dispose();
        return false;
      }

      const t = age / FLASH_DURATION;
      // Flash fades out
      (flash.mesh.material as THREE.MeshBasicMaterial).opacity = 1.0 - t;
      flash.mesh.scale.setScalar(1 + t * 2);
      // Ring expands
      (flash.ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
      flash.ring.scale.setScalar(1 + t * 4);
      return true;
    });

    // Animate bounty glows
    for (const glow of this.glows.values()) {
      const mat = glow.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.2 + Math.sin(elapsed * 2) * 0.15;
    }
  }

  private createBeam(run: HackEffectInput, from: THREE.Vector3, to: THREE.Vector3): void {
    const color = APPROACH_COLORS[run.approach] ?? 0x00ffff;

    // Create tube along bezier curve
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    mid.y += 2; // Arc upward
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    const geo = new THREE.TubeGeometry(curve, 32, 0.04, 8, false);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `beam_${run.runId}`;

    // Spark particles at target
    const particleMat = new THREE.PointsMaterial({
      color,
      size: 0.1,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
    const particlePositions = new Float32Array(8 * 3);
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particles = new THREE.Points(particleGeo, particleMat);

    this.group.add(mesh);
    this.group.add(particles);

    this.beams.set(run.runId, {
      runId: run.runId,
      attackerPos: from,
      targetPos: to,
      approach: run.approach,
      progress: run.progress,
      traceLevel: run.traceLevel,
      mesh,
      particlesMesh: particles,
    });
  }

  private updateBeamGeometry(beam: ActiveBeam, from: THREE.Vector3, to: THREE.Vector3): void {
    // Rebuild tube with updated curve
    beam.mesh.geometry.dispose();
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    mid.y += 2;
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    beam.mesh.geometry = new THREE.TubeGeometry(curve, 32, 0.04, 8, false);
    beam.attackerPos = from;
    beam.targetPos = to;
  }

  private updateParticles(beam: ActiveBeam, elapsed: number): void {
    const positions = beam.particlesMesh.geometry.attributes.position as THREE.BufferAttribute;
    const arr = positions.array as Float32Array;
    const target = beam.targetPos;

    for (let i = 0; i < 8; i++) {
      const angle = (elapsed * 3 + i * Math.PI / 4) % (Math.PI * 2);
      const radius = 0.3 + Math.sin(elapsed * 5 + i) * 0.15;
      arr[i * 3] = target.x + Math.cos(angle) * radius;
      arr[i * 3 + 1] = target.y + Math.sin(elapsed * 4 + i * 0.5) * 0.3;
      arr[i * 3 + 2] = target.z + Math.sin(angle) * radius;
    }
    positions.needsUpdate = true;
  }

  private createShield(agentId: string, position: THREE.Vector3): void {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      wireframe: true,
      transparent: true,
      opacity: 0.2,
    });
    const mesh = new THREE.Mesh(this.shieldGeo, mat);
    mesh.position.copy(position);
    mesh.name = `shield_${agentId}`;
    this.group.add(mesh);

    this.shields.set(agentId, {
      agentId,
      mesh,
      targetIntegrity: 1.0,
    });
  }

  private createBuildingGlow(agentId: string, position: THREE.Vector3, type: 'bounty' | 'hacked'): void {
    const color = type === 'bounty' ? 0xfbbf24 : 0xff3366;
    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.rotation.x = -Math.PI / 2;
    mesh.name = `glow_${agentId}`;
    this.group.add(mesh);

    this.glows.set(agentId, { agentId, mesh, type });
  }

  dispose(): void {
    for (const beam of this.beams.values()) {
      beam.mesh.geometry.dispose();
      (beam.mesh.material as THREE.Material).dispose();
      beam.particlesMesh.geometry.dispose();
      (beam.particlesMesh.material as THREE.Material).dispose();
    }
    for (const shield of this.shields.values()) {
      (shield.mesh.material as THREE.Material).dispose();
    }
    for (const flash of this.flashes) {
      (flash.mesh.material as THREE.Material).dispose();
      (flash.ring.material as THREE.Material).dispose();
    }
    for (const glow of this.glows.values()) {
      glow.mesh.geometry.dispose();
      (glow.mesh.material as THREE.Material).dispose();
    }
    this.shieldGeo.dispose();
    this.flashGeo.dispose();
    this.ringGeo.dispose();
    this.particleGeo.dispose();
    this.beams.clear();
    this.shields.clear();
    this.flashes = [];
    this.glows.clear();
  }
}
