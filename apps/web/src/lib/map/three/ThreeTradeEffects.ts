/**
 * ThreeTradeEffects - Trade completion particles, offer markers, prosperity ground glow
 *
 * Visual effects for economic activity:
 * - Trade completion: glowing orb stream from seller building
 * - Active offer markers: floating diamond above buildings with open offers
 * - Prosperity glow: emissive ground plane under high-prosperity parcels
 */

import * as THREE from 'three';

// -- Types --

export interface TradeEffectEvent {
  sellerId: string;
  buyerId: string;
  sellerWorldId: string;
  buyerWorldId: string;
  quantity: number;
  resourceId: string;
}

export interface ActiveOfferMarker {
  agentId: string;
  resourceId: string;
}

export interface ProsperityData {
  agentId: string;
  prosperityIndex: number; // 0-100
  worldId: string;
}

export interface AgentPositionMap {
  [agentId: string]: { x: number; z: number };
}

// World colors for particles
const WORLD_COLORS: Record<string, number> = {
  claude_nation: 0x8b5cf6,
  openai_empire: 0x10b981,
  gemini_republic: 0x06b6d4,
  grok_syndicate: 0xf59e0b,
  open_frontier: 0xef4444,
};

// Resource colors for offer markers
const RESOURCE_COLORS: Record<string, number> = {
  black_crude: 0x1a1a2e,
  volt_dust: 0xf59e0b,
  signal_ore: 0x06b6d4,
  ghostwater: 0x60a5fa,
  gridsteel: 0x6b7280,
  pulse_cells: 0x10b981,
  cipher_coins: 0xfbbf24,
  aquifer_glass: 0x67e8f9,
  neurotape: 0x8b5cf6,
  contract_weave: 0xd97706,
  spectra_feeds: 0x34d399,
  ethic_engine: 0xa78bfa,
  singularity_seeds: 0x4ade80,
  oracle_shards: 0xc084fc,
};

const PARTICLE_LIFETIME = 2.0; // seconds
const DIAMOND_Y = 4.5;        // Height above ground for floating markers
const DIAMOND_BOB_SPEED = 1.5;
const DIAMOND_BOB_HEIGHT = 0.3;

interface TradeParticleGroup {
  points: THREE.Points;
  velocities: Float32Array;
  startTime: number;
  lifetime: number;
}

interface OfferDiamond {
  agentId: string;
  mesh: THREE.Mesh;
  baseY: number;
}

interface ProsperityPlane {
  agentId: string;
  mesh: THREE.Mesh;
}

export class ThreeTradeEffects {
  private group = new THREE.Group();
  private particles: TradeParticleGroup[] = [];
  private diamonds = new Map<string, OfferDiamond>();
  private prosperityPlanes = new Map<string, ProsperityPlane>();

  // Shared geometries
  private diamondGeo: THREE.OctahedronGeometry;

  constructor() {
    this.group.name = 'trade_effects';
    this.diamondGeo = new THREE.OctahedronGeometry(0.15, 0);
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Trigger trade completion particle effect
   */
  triggerTradeEffect(
    event: TradeEffectEvent,
    agentPositions: AgentPositionMap,
  ): void {
    const sellerPos = agentPositions[event.sellerId];
    if (!sellerPos) return;

    const color = WORLD_COLORS[event.sellerWorldId] ?? 0xffffff;
    const particleCount = Math.min(Math.max(8, event.quantity), 32);

    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    // Direction toward map edge (approximate buyer direction)
    const buyerPos = agentPositions[event.buyerId];
    let dirX = 1, dirZ = 0;
    if (buyerPos) {
      const dx = buyerPos.x - sellerPos.x;
      const dz = buyerPos.z - sellerPos.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      dirX = dx / len;
      dirZ = dz / len;
    }

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = sellerPos.x + (Math.random() - 0.5) * 0.5;
      positions[i * 3 + 1] = 2.0 + Math.random() * 1.5;
      positions[i * 3 + 2] = sellerPos.z + (Math.random() - 0.5) * 0.5;

      // Velocity toward buyer with spread
      const speed = 1.5 + Math.random() * 1.5;
      const spread = 0.3;
      velocities[i * 3] = dirX * speed + (Math.random() - 0.5) * spread;
      velocities[i * 3 + 1] = 0.5 + Math.random() * 0.5;
      velocities[i * 3 + 2] = dirZ * speed + (Math.random() - 0.5) * spread;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color,
      size: 0.12,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, mat);
    this.group.add(points);

    this.particles.push({
      points,
      velocities,
      startTime: performance.now() / 1000,
      lifetime: PARTICLE_LIFETIME,
    });
  }

  /**
   * Update active offer diamond markers
   */
  updateOfferMarkers(
    activeOffers: ActiveOfferMarker[],
    agentPositions: AgentPositionMap,
  ): void {
    const activeAgentIds = new Set(activeOffers.map(o => o.agentId));

    // Remove old diamonds
    for (const [agentId, diamond] of this.diamonds) {
      if (!activeAgentIds.has(agentId)) {
        this.group.remove(diamond.mesh);
        (diamond.mesh.material as THREE.Material).dispose();
        this.diamonds.delete(agentId);
      }
    }

    // Add new diamonds
    for (const offer of activeOffers) {
      if (this.diamonds.has(offer.agentId)) continue;
      const pos = agentPositions[offer.agentId];
      if (!pos) continue;

      const color = RESOURCE_COLORS[offer.resourceId] ?? 0xfbbf24;
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(this.diamondGeo, mat);
      mesh.position.set(pos.x, DIAMOND_Y, pos.z);
      mesh.name = `offer_${offer.agentId}`;
      this.group.add(mesh);

      this.diamonds.set(offer.agentId, {
        agentId: offer.agentId,
        mesh,
        baseY: DIAMOND_Y,
      });
    }
  }

  /**
   * Update prosperity ground glow
   */
  updateProsperityGlow(
    data: ProsperityData[],
    agentPositions: AgentPositionMap,
  ): void {
    const activeIds = new Set(data.map(d => d.agentId));

    // Remove old
    for (const [agentId, plane] of this.prosperityPlanes) {
      if (!activeIds.has(agentId)) {
        this.group.remove(plane.mesh);
        plane.mesh.geometry.dispose();
        (plane.mesh.material as THREE.Material).dispose();
        this.prosperityPlanes.delete(agentId);
      }
    }

    // Add/update
    for (const entry of data) {
      if (entry.prosperityIndex < 30) continue; // Only show for high prosperity
      const pos = agentPositions[entry.agentId];
      if (!pos) continue;

      if (this.prosperityPlanes.has(entry.agentId)) {
        // Update intensity
        const plane = this.prosperityPlanes.get(entry.agentId)!;
        const mat = plane.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = (entry.prosperityIndex / 100) * 0.3;
        continue;
      }

      const color = WORLD_COLORS[entry.worldId] ?? 0xffffff;
      const geo = new THREE.PlaneGeometry(2.5, 2.5);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: (entry.prosperityIndex / 100) * 0.3,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pos.x, 0.05, pos.z);
      mesh.rotation.x = -Math.PI / 2;
      mesh.name = `prosperity_${entry.agentId}`;
      this.group.add(mesh);

      this.prosperityPlanes.set(entry.agentId, { agentId: entry.agentId, mesh });
    }
  }

  /**
   * Animate each frame
   */
  update(elapsed: number): void {
    const now = performance.now() / 1000;

    // Animate and cleanup trade particles
    this.particles = this.particles.filter(pg => {
      const age = now - pg.startTime;
      if (age > pg.lifetime) {
        this.group.remove(pg.points);
        pg.points.geometry.dispose();
        (pg.points.material as THREE.Material).dispose();
        return false;
      }

      const t = age / pg.lifetime;
      (pg.points.material as THREE.PointsMaterial).opacity = 0.9 * (1 - t);

      // Move particles
      const positions = pg.points.geometry.attributes.position as THREE.BufferAttribute;
      const arr = positions.array as Float32Array;
      const dt = 0.016; // ~60fps step
      for (let i = 0; i < arr.length / 3; i++) {
        arr[i * 3] += pg.velocities[i * 3] * dt;
        arr[i * 3 + 1] += pg.velocities[i * 3 + 1] * dt;
        arr[i * 3 + 2] += pg.velocities[i * 3 + 2] * dt;
        // Gravity
        pg.velocities[i * 3 + 1] -= 0.5 * dt;
      }
      positions.needsUpdate = true;
      return true;
    });

    // Animate diamond bob + rotation
    for (const diamond of this.diamonds.values()) {
      diamond.mesh.position.y = diamond.baseY + Math.sin(elapsed * DIAMOND_BOB_SPEED) * DIAMOND_BOB_HEIGHT;
      diamond.mesh.rotation.y = elapsed * 1.5;
    }

    // Subtle prosperity pulse
    for (const plane of this.prosperityPlanes.values()) {
      const mat = plane.mesh.material as THREE.MeshBasicMaterial;
      const baseOpacity = mat.opacity;
      mat.opacity = baseOpacity + Math.sin(elapsed * 1.5) * 0.05;
    }
  }

  dispose(): void {
    for (const pg of this.particles) {
      pg.points.geometry.dispose();
      (pg.points.material as THREE.Material).dispose();
    }
    for (const diamond of this.diamonds.values()) {
      (diamond.mesh.material as THREE.Material).dispose();
    }
    for (const plane of this.prosperityPlanes.values()) {
      plane.mesh.geometry.dispose();
      (plane.mesh.material as THREE.Material).dispose();
    }
    this.diamondGeo.dispose();
    this.particles = [];
    this.diamonds.clear();
    this.prosperityPlanes.clear();
  }
}
