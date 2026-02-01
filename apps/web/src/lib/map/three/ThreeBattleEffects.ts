/**
 * ThreeBattleEffects - Medieval battle visual effects
 *
 * Visual effects for active battles and sieges:
 * - Arrow volley arcs between attackers and defenders
 * - Territory borders with kingdom colors
 * - Siege fire on target buildings
 * - Victory/defeat flash
 */

import * as THREE from 'three';

interface ActiveArrowVolley {
  battleId: string;
  attackerPos: THREE.Vector3;
  defenderPos: THREE.Vector3;
  progress: number;
  mesh: THREE.Points;
}

interface TerritoryBorder {
  parcelId: string;
  worldId: string;
  mesh: THREE.LineLoop;
}

interface SiegeFire {
  siegeId: string;
  position: THREE.Vector3;
  light: THREE.PointLight;
  particles: THREE.Points;
  progress: number;
}

interface BattleFlash {
  position: THREE.Vector3;
  mesh: THREE.Mesh;
  startTime: number;
  isVictory: boolean;
}

export interface BattleEffectInput {
  battleId: string;
  attackerId: string;
  defenderId: string;
  attackerWorldId: string;
  defenderWorldId: string;
  status: string;
  attackerArmy: number;
  defenderArmy: number;
}

export interface AgentPositionMap {
  [agentId: string]: { x: number; z: number };
}

const KINGDOM_COLORS: Record<string, number> = {
  claude_nation: 0x8b2500,
  openai_empire: 0x8b8b00,
  gemini_republic: 0x2d5a27,
  grok_syndicate: 0xc9a84c,
  open_frontier: 0x4682b4,
};

const ARROW_Y = 4.0;
const FLASH_DURATION = 2.0;

export class ThreeBattleEffects {
  private group = new THREE.Group();
  private volleys = new Map<string, ActiveArrowVolley>();
  private borders = new Map<string, TerritoryBorder>();
  private siegeFires = new Map<string, SiegeFire>();
  private flashes: BattleFlash[] = [];

  private flashGeo: THREE.SphereGeometry;

  constructor() {
    this.group.name = 'battle_effects';
    this.flashGeo = new THREE.SphereGeometry(0.8, 16, 16);
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  updateBattleState(
    activeBattles: BattleEffectInput[],
    agentPositions: AgentPositionMap,
  ): void {
    const activeBattleIds = new Set(activeBattles.map(b => b.battleId));

    // Remove volleys for ended battles
    for (const [battleId, volley] of this.volleys) {
      if (!activeBattleIds.has(battleId)) {
        this.group.remove(volley.mesh);
        volley.mesh.geometry.dispose();
        (volley.mesh.material as THREE.Material).dispose();
        this.volleys.delete(battleId);
      }
    }

    // Create/update volleys
    for (const battle of activeBattles) {
      const attackerPos = agentPositions[battle.attackerId];
      const defenderPos = agentPositions[battle.defenderId];
      if (!attackerPos || !defenderPos) continue;

      const from = new THREE.Vector3(attackerPos.x, ARROW_Y, attackerPos.z);
      const to = new THREE.Vector3(defenderPos.x, ARROW_Y, defenderPos.z);

      if (this.volleys.has(battle.battleId)) {
        const volley = this.volleys.get(battle.battleId)!;
        volley.attackerPos = from;
        volley.defenderPos = to;
      } else {
        this.createArrowVolley(battle, from, to);
      }
    }
  }

  triggerBattleFlash(position: { x: number; z: number }, isVictory: boolean): void {
    const pos = new THREE.Vector3(position.x, 2.0, position.z);

    const mat = new THREE.MeshBasicMaterial({
      color: isVictory ? 0xc9a84c : 0x8b0000,
      transparent: true,
      opacity: 1.0,
    });
    const mesh = new THREE.Mesh(this.flashGeo, mat);
    mesh.position.copy(pos);

    this.group.add(mesh);
    this.flashes.push({
      position: pos,
      mesh,
      startTime: performance.now() / 1000,
      isVictory,
    });
  }

  updateTerritoryBorders(
    territories: Array<{ parcelId: string; worldId: string; bounds: { x: number; y: number; width: number; height: number } }>,
  ): void {
    const activeIds = new Set(territories.map(t => t.parcelId));

    // Remove old borders
    for (const [id, border] of this.borders) {
      if (!activeIds.has(id)) {
        this.group.remove(border.mesh);
        border.mesh.geometry.dispose();
        (border.mesh.material as THREE.Material).dispose();
        this.borders.delete(id);
      }
    }

    // Add new borders
    for (const territory of territories) {
      if (this.borders.has(territory.parcelId)) continue;

      const color = KINGDOM_COLORS[territory.worldId] ?? 0xffffff;
      const { x, y, width, height } = territory.bounds;

      const points = [
        new THREE.Vector3(x, 0.2, y),
        new THREE.Vector3(x + width, 0.2, y),
        new THREE.Vector3(x + width, 0.2, y + height),
        new THREE.Vector3(x, 0.2, y + height),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.6,
        linewidth: 2,
      });
      const line = new THREE.LineLoop(geo, mat);
      line.name = `territory_${territory.parcelId}`;
      this.group.add(line);

      this.borders.set(territory.parcelId, {
        parcelId: territory.parcelId,
        worldId: territory.worldId,
        mesh: line,
      });
    }
  }

  update(elapsed: number): void {
    // Animate arrow volleys
    for (const volley of this.volleys.values()) {
      const positions = volley.mesh.geometry.attributes.position as THREE.BufferAttribute;
      const arr = positions.array as Float32Array;
      const from = volley.attackerPos;
      const to = volley.defenderPos;

      for (let i = 0; i < 12; i++) {
        const t = ((elapsed * 0.8 + i * 0.08) % 1.0);
        const x = from.x + (to.x - from.x) * t;
        const z = from.z + (to.z - from.z) * t;
        const arcHeight = Math.sin(t * Math.PI) * 3.0;
        arr[i * 3] = x;
        arr[i * 3 + 1] = ARROW_Y + arcHeight;
        arr[i * 3 + 2] = z;
      }
      positions.needsUpdate = true;
    }

    // Animate territory borders (subtle pulse)
    for (const border of this.borders.values()) {
      const mat = border.mesh.material as THREE.LineBasicMaterial;
      mat.opacity = 0.4 + Math.sin(elapsed * 2) * 0.2;
    }

    // Animate/cleanup flashes
    const now = performance.now() / 1000;
    this.flashes = this.flashes.filter(flash => {
      const age = now - flash.startTime;
      if (age > FLASH_DURATION) {
        this.group.remove(flash.mesh);
        (flash.mesh.material as THREE.Material).dispose();
        return false;
      }
      const t = age / FLASH_DURATION;
      (flash.mesh.material as THREE.MeshBasicMaterial).opacity = 1.0 - t;
      flash.mesh.scale.setScalar(1 + t * 3);
      return true;
    });
  }

  private createArrowVolley(battle: BattleEffectInput, from: THREE.Vector3, to: THREE.Vector3): void {
    const color = KINGDOM_COLORS[battle.attackerWorldId] ?? 0xc9a84c;

    const positions = new Float32Array(12 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color,
      size: 0.15,
      transparent: true,
      opacity: 0.9,
    });
    const points = new THREE.Points(geo, mat);
    points.name = `volley_${battle.battleId}`;

    this.group.add(points);

    this.volleys.set(battle.battleId, {
      battleId: battle.battleId,
      attackerPos: from,
      defenderPos: to,
      progress: 0,
      mesh: points,
    });
  }

  dispose(): void {
    for (const volley of this.volleys.values()) {
      volley.mesh.geometry.dispose();
      (volley.mesh.material as THREE.Material).dispose();
    }
    for (const border of this.borders.values()) {
      border.mesh.geometry.dispose();
      (border.mesh.material as THREE.Material).dispose();
    }
    for (const fire of this.siegeFires.values()) {
      fire.particles.geometry.dispose();
      (fire.particles.material as THREE.Material).dispose();
      fire.light.dispose();
    }
    for (const flash of this.flashes) {
      (flash.mesh.material as THREE.Material).dispose();
    }
    this.flashGeo.dispose();
    this.volleys.clear();
    this.borders.clear();
    this.siegeFires.clear();
    this.flashes = [];
  }
}
