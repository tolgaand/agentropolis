import * as THREE from 'three';
import { TILE_SIZE, BLOCK_SIZE } from './ThreeConfig';

export type BuildingType =
  | 'farm'
  | 'lumberyard'
  | 'quarry'
  | 'iron_mine'
  | 'market'
  | 'barracks'
  | 'stable'
  | 'watchtower'
  | 'wall'
  | 'castle'
  | 'academy';

export type CompoundTheme = 'farming' | 'military' | 'trade' | 'mining' | 'noble' | 'residential' | 'mixed';

export interface CompoundConfig {
  theme: CompoundTheme;
  factionColor: number;
  level: number; // 1-5 average
  centerX: number; // world-space center X
  centerZ: number; // world-space center Z
  seed: number; // deterministic seed from parcel
}

export interface CompoundResult {
  group: THREE.Group;
}

// Map building types to compound themes
const BUILDING_TYPE_TO_THEME: Record<BuildingType, CompoundTheme> = {
  farm: 'farming',
  lumberyard: 'farming',
  stable: 'farming',
  barracks: 'military',
  watchtower: 'military',
  wall: 'military',
  market: 'trade',
  quarry: 'mining',
  iron_mine: 'mining',
  castle: 'noble',
  academy: 'noble',
};

/**
 * Detect compound theme from a list of building types
 */
export function detectTheme(buildingTypes: string[]): CompoundTheme {
  const counts: Partial<Record<CompoundTheme, number>> = {};
  for (const t of buildingTypes) {
    const theme = BUILDING_TYPE_TO_THEME[t as BuildingType] ?? 'mixed';
    counts[theme] = (counts[theme] ?? 0) + 1;
  }
  let best: CompoundTheme = 'mixed';
  let bestCount = 0;
  for (const [theme, count] of Object.entries(counts)) {
    if (count > bestCount) {
      bestCount = count;
      best = theme as CompoundTheme;
    }
  }
  return best;
}

/**
 * ProceduralBuildings — Full-parcel compound generator
 *
 * Creates cohesive compound structures that fill the entire 20x20 parcel area.
 * Each theme produces a distinct visual identity with main building, surrounding
 * structures, courtyards, and environmental details.
 */
export class ProceduralBuildings {
  private materialCache = new Map<string, THREE.MeshStandardMaterial>();

  // Usable compound size (within border padding)
  private static readonly COMPOUND_SIZE = (BLOCK_SIZE - 4) * TILE_SIZE; // 16 tiles
  private static readonly HALF = ProceduralBuildings.COMPOUND_SIZE / 2;

  private getMaterial(key: string, color: number, metalness = 0.0, roughness = 1.0): THREE.MeshStandardMaterial {
    if (!this.materialCache.has(key)) {
      this.materialCache.set(key, new THREE.MeshStandardMaterial({ color, metalness, roughness }));
    }
    return this.materialCache.get(key)!;
  }

  private getFactionMaterial(baseColor: number, factionColor: number, label: string): THREE.MeshStandardMaterial {
    const key = `faction_${label}_${baseColor.toString(16)}_${factionColor.toString(16)}`;
    if (!this.materialCache.has(key)) {
      const base = new THREE.Color(baseColor);
      const faction = new THREE.Color(factionColor);
      const blended = base.clone().lerp(faction, 0.35);
      this.materialCache.set(key, new THREE.MeshStandardMaterial({ color: blended, metalness: 0.0, roughness: 0.85 }));
    }
    return this.materialCache.get(key)!;
  }

  private hash(a: number, b: number): number {
    return (((a * 73856093) ^ (b * 19349663)) & 0x7fffffff) / 0x7fffffff;
  }

  private box(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  private cylinder(rTop: number, rBot: number, h: number, mat: THREE.Material, seg = 8): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  private cone(r: number, h: number, mat: THREE.Material, seg = 8): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  private roof(w: number, d: number, h: number, mat: THREE.Material): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(0, h);
    shape.lineTo(w / 2, 0);
    shape.lineTo(-w / 2, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { steps: 1, depth: d, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, -d / 2);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  /**
   * Create a full-parcel compound based on theme
   */
  createCompound(config: CompoundConfig): CompoundResult {
    const group = new THREE.Group();
    const mult = 0.85 + (config.level - 1) * 0.075; // L1=0.85, L5=1.15

    switch (config.theme) {
      case 'farming':
        this.buildFarmingCompound(group, config, mult);
        break;
      case 'military':
        this.buildMilitaryCompound(group, config, mult);
        break;
      case 'trade':
        this.buildTradeCompound(group, config, mult);
        break;
      case 'mining':
        this.buildMiningCompound(group, config, mult);
        break;
      case 'noble':
        this.buildNobleCompound(group, config, mult);
        break;
      case 'residential':
        this.buildResidentialCompound(group, config, mult);
        break;
      default:
        this.buildMixedCompound(group, config, mult);
        break;
    }

    group.position.set(config.centerX, 0, config.centerZ);
    return { group };
  }

  // ────────────────────── FARMING COMPOUND ──────────────────────
  private buildFarmingCompound(g: THREE.Group, c: CompoundConfig, mult: number): void {
    const H = ProceduralBuildings.HALF;
    const stone = this.getMaterial('stone_farm', 0x8b7355, 0.1, 0.85);
    const wood = this.getMaterial('wood_farm', 0x5c4033, 0.0, 0.9);
    const thatch = this.getFactionMaterial(0xdaa520, c.factionColor, 'thatch');
    const hay = this.getMaterial('hay', 0xd4a830, 0.0, 0.9);
    const fieldGreen = this.getMaterial('field_green', 0x4a7a3a, 0.0, 0.95);
    const fieldGold = this.getMaterial('field_gold', 0xb8962a, 0.0, 0.95);
    const fence = this.getMaterial('fence', 0x6b4423, 0.0, 0.9);

    // ── Main Barn (center-left, large) ──
    const barnW = 7 * mult, barnD = 5 * mult, barnH = 2.8 * mult;
    const barn = this.box(barnW, barnH, barnD, stone);
    barn.position.set(-2, barnH / 2, -1);
    g.add(barn);

    const barnRoof = this.roof(barnW + 0.6, barnD + 0.4, barnH * 0.5, thatch);
    barnRoof.position.set(-2, barnH, -1);
    g.add(barnRoof);

    // Barn door
    const door = this.box(1.2, 2.0 * mult, 0.15, wood);
    door.position.set(-2, 1.0 * mult, -1 + barnD / 2 + 0.05);
    g.add(door);

    // ── Grain Silos (right side) ──
    for (let i = 0; i < 2; i++) {
      const sx = 5 + i * 2.2;
      const silo = this.cylinder(0.8 * mult, 0.9 * mult, 3.0 * mult, stone, 12);
      silo.position.set(sx, 1.5 * mult, -3);
      g.add(silo);
      const siloRoof = this.cone(1.0 * mult, 0.8 * mult, thatch, 12);
      siloRoof.position.set(sx, 3.0 * mult + 0.4, -3);
      g.add(siloRoof);
    }

    // ── Small shed (back-right) ──
    const shedW = 3 * mult, shedD = 2.5 * mult, shedH = 1.8 * mult;
    const shed = this.box(shedW, shedH, shedD, wood);
    shed.position.set(5, shedH / 2, 3);
    g.add(shed);
    const shedRoof = this.roof(shedW + 0.3, shedD + 0.2, shedH * 0.4, thatch);
    shedRoof.position.set(5, shedH, 3);
    g.add(shedRoof);

    // ── Crop Fields (front half) ──
    const fields = [
      { x: -4, z: 5, w: 5, d: 3, mat: fieldGreen },
      { x: 1, z: 5, w: 4, d: 3, mat: fieldGold },
      { x: -4, z: 2.5, w: 3, d: 2, mat: fieldGold },
    ];
    for (const f of fields) {
      const field = this.box(f.w, 0.08, f.d, f.mat);
      field.position.set(f.x, 0.04, f.z);
      field.receiveShadow = true;
      g.add(field);
      // Crop rows
      const rowCount = Math.floor(f.w / 0.6);
      for (let r = 0; r < rowCount; r++) {
        const row = this.box(0.15, 0.2 * mult, f.d * 0.8, f.mat === fieldGreen ? fieldGreen : hay);
        row.position.set(f.x - f.w / 2 + 0.4 + r * 0.6, 0.12 * mult, f.z);
        g.add(row);
      }
    }

    // ── Well (courtyard) ──
    const wellBase = this.cylinder(0.5, 0.5, 0.6, stone, 8);
    wellBase.position.set(1.5, 0.3, 0);
    g.add(wellBase);
    const wellRoof = this.cone(0.7, 0.5, wood, 4);
    wellRoof.position.set(1.5, 1.0, 0);
    wellRoof.rotation.y = Math.PI / 4;
    g.add(wellRoof);

    // ── Hay Bales ──
    for (let i = 0; i < 4 + c.level; i++) {
      const hx = (this.hash(c.seed + i, 1) - 0.5) * 6;
      const hz = (this.hash(c.seed + i, 2) - 0.5) * 4 - 4;
      const bale = this.box(0.6, 0.4, 0.5, hay);
      bale.position.set(hx + 3, 0.2, hz);
      g.add(bale);
    }

    // ── Perimeter Fence ──
    this.addWoodenFence(g, H, fence, c.seed);

    // ── Torches at corners ──
    this.addCornerTorches(g, H, wood);
  }

  // ────────────────────── MILITARY COMPOUND ──────────────────────
  private buildMilitaryCompound(g: THREE.Group, c: CompoundConfig, mult: number): void {
    const H = ProceduralBuildings.HALF;
    const stone = this.getMaterial('stone_mil', 0x6b6b6b, 0.15, 0.8);
    const stoneLight = this.getMaterial('stone_light', 0x8b8375, 0.1, 0.85);
    const wood = this.getMaterial('wood_mil', 0x4a3020, 0.0, 0.9);
    const roofMat = this.getFactionMaterial(0x4a4a4a, c.factionColor, 'mil_roof');
    const bannerMat = new THREE.MeshStandardMaterial({
      color: c.factionColor, metalness: 0.0, roughness: 0.8,
    });

    // ── Outer Stone Walls (perimeter) ──
    const wallH = 2.0 * mult, wallThick = 0.5;
    // Front wall with gate gap
    const gateW = 2.5;
    const sideW = (H * 2 - gateW) / 2;
    const frontLeft = this.box(sideW, wallH, wallThick, stone);
    frontLeft.position.set(-gateW / 2 - sideW / 2, wallH / 2, H - wallThick / 2);
    g.add(frontLeft);
    const frontRight = this.box(sideW, wallH, wallThick, stone);
    frontRight.position.set(gateW / 2 + sideW / 2, wallH / 2, H - wallThick / 2);
    g.add(frontRight);
    // Gate arch
    const gateArch = this.box(gateW + 0.4, wallH * 0.3, wallThick + 0.2, stone);
    gateArch.position.set(0, wallH - wallH * 0.15, H - wallThick / 2);
    g.add(gateArch);

    // Back wall
    const backWall = this.box(H * 2, wallH, wallThick, stone);
    backWall.position.set(0, wallH / 2, -H + wallThick / 2);
    g.add(backWall);
    // Side walls
    for (const side of [-1, 1]) {
      const sideWall = this.box(wallThick, wallH, H * 2 - wallThick, stone);
      sideWall.position.set(side * (H - wallThick / 2), wallH / 2, 0);
      g.add(sideWall);
    }

    // ── Crenellations on walls ──
    this.addCrenellations(g, H * 2, wallThick, wallH, stone, H);

    // ── 4 Corner Watchtowers ──
    const towerR = 1.0 * mult, towerH = 3.5 * mult;
    const towerInset = wallThick / 2 + towerR;
    const corners = [
      [-H + towerInset, -H + towerInset],
      [ H - towerInset, -H + towerInset],
      [-H + towerInset,  H - towerInset],
      [ H - towerInset,  H - towerInset],
    ];
    for (const [tx, tz] of corners) {
      const tower = this.cylinder(towerR * 0.85, towerR, towerH, stone, 10);
      tower.position.set(tx, towerH / 2, tz);
      g.add(tower);
      const towerRoof = this.cone(towerR * 1.2, towerR * 0.8, roofMat, 10);
      towerRoof.position.set(tx, towerH + 0.3, tz);
      g.add(towerRoof);
    }

    // ── Central Keep / Barracks ──
    const keepW = 6 * mult, keepD = 4 * mult, keepH = 2.5 * mult;
    const keepZ = -2 * mult;
    const keep = this.box(keepW, keepH, keepD, stoneLight);
    keep.position.set(0, keepH / 2, keepZ);
    g.add(keep);
    const keepRoof = this.roof(keepW + 0.4, keepD + 0.3, keepH * 0.45, roofMat);
    keepRoof.position.set(0, keepH, keepZ);
    g.add(keepRoof);

    // ── Training Yard (front area) ──
    const yardFloor = this.box(8, 0.05, 5, this.getMaterial('dirt_yard', 0x5a4a3a, 0.0, 1.0));
    yardFloor.position.set(0, 0.025, 3.5);
    g.add(yardFloor);

    // Training dummies
    const dummyCount = 3 + c.level;
    for (let i = 0; i < dummyCount; i++) {
      const dx = (this.hash(c.seed + i, 10) - 0.5) * 6;
      const dz = 2 + this.hash(c.seed + i, 11) * 4;
      const post = this.cylinder(0.06, 0.06, 1.2, wood);
      post.position.set(dx, 0.6, dz);
      g.add(post);
      const arm = this.box(0.8, 0.08, 0.08, wood);
      arm.position.set(dx, 0.9, dz);
      g.add(arm);
    }

    // Weapon racks along back wall
    for (let i = 0; i < 3; i++) {
      const rx = -3 + i * 3;
      const rack = this.box(1.5, 1.0, 0.15, wood);
      rack.position.set(rx, 0.5, -H + 0.8);
      g.add(rack);
    }

    // ── Banners on towers ──
    for (const [tx, tz] of corners) {
      const pole = this.cylinder(0.04, 0.04, 1.0, wood);
      pole.position.set(tx, towerH + 0.8, tz);
      g.add(pole);
      const banner = this.box(0.5, 0.7, 0.05, bannerMat);
      banner.position.set(tx + 0.25, towerH + 1.0, tz);
      g.add(banner);
    }
  }

  // ────────────────────── TRADE COMPOUND ──────────────────────
  private buildTradeCompound(g: THREE.Group, c: CompoundConfig, mult: number): void {
    const H = ProceduralBuildings.HALF;
    const stone = this.getMaterial('stone_trade', 0x8b7355, 0.1, 0.85);
    const wood = this.getMaterial('wood_trade', 0x6b4423, 0.0, 0.9);
    const woodLight = this.getMaterial('wood_light_t', 0x8b6540, 0.0, 0.9);
    const awning = this.getFactionMaterial(0xb8862a, c.factionColor, 'awning');
    const awning2 = this.getFactionMaterial(0xcc4444, c.factionColor, 'awning2');
    const crate = this.getMaterial('crate', 0x7a5a3a, 0.0, 0.9);
    const barrel = this.getMaterial('barrel', 0x5a3a20, 0.0, 0.9);

    // ── Central Market Hall ──
    const hallW = 8 * mult, hallD = 5 * mult, hallH = 3.0 * mult;
    const hall = this.box(hallW, hallH, hallD, stone);
    hall.position.set(0, hallH / 2, -1);
    g.add(hall);
    const hallRoof = this.roof(hallW + 0.8, hallD + 0.6, hallH * 0.4, awning);
    hallRoof.position.set(0, hallH, -1);
    g.add(hallRoof);

    // Arched entrance
    for (const side of [-1, 1]) {
      const arch = this.box(1.5, 2.0 * mult, 0.2, stone);
      arch.position.set(side * 2.5, 1.0 * mult, -1 + hallD / 2 + 0.05);
      g.add(arch);
    }

    // ── Open-Air Market Stalls (front) ──
    for (let i = 0; i < 4; i++) {
      const sx = -5 + i * 3.2;
      const stallMat = i % 2 === 0 ? awning : awning2;

      // 4 posts
      const postH = 1.8 * mult;
      const stallW = 2.0, stallD = 1.5;
      for (const [px, pz] of [[-stallW / 2, -stallD / 2], [stallW / 2, -stallD / 2], [-stallW / 2, stallD / 2], [stallW / 2, stallD / 2]]) {
        const post = this.cylinder(0.06, 0.06, postH, wood);
        post.position.set(sx + px, postH / 2, 5 + pz);
        g.add(post);
      }

      // Awning
      const stallAwning = this.box(stallW + 0.3, 0.08, stallD + 0.2, stallMat);
      stallAwning.position.set(sx, postH, 5);
      stallAwning.rotation.z = 0.08;
      g.add(stallAwning);

      // Counter
      const counter = this.box(stallW * 0.9, 0.5, 0.3, woodLight);
      counter.position.set(sx, 0.25, 5 + stallD / 2 - 0.2);
      g.add(counter);
    }

    // ── Side Storage Buildings ──
    for (const side of [-1, 1]) {
      const storeW = 3 * mult, storeD = 4 * mult, storeH = 2.0 * mult;
      const store = this.box(storeW, storeH, storeD, woodLight);
      store.position.set(side * 6.5, storeH / 2, -2);
      g.add(store);
      const storeRoof = this.roof(storeW + 0.3, storeD + 0.2, storeH * 0.35, awning);
      storeRoof.position.set(side * 6.5, storeH, -2);
      g.add(storeRoof);
    }

    // ── Crates & Barrels scattered ──
    for (let i = 0; i < 8 + c.level * 2; i++) {
      const cx = (this.hash(c.seed + i, 20) - 0.5) * 12;
      const cz = (this.hash(c.seed + i, 21) - 0.5) * 8;
      if (Math.abs(cx) < 3 && Math.abs(cz + 1) < 2) continue; // skip hall overlap
      if (this.hash(c.seed + i, 22) > 0.5) {
        const b = this.cylinder(0.25, 0.25, 0.5, barrel, 8);
        b.position.set(cx, 0.25, cz);
        g.add(b);
      } else {
        const cr = this.box(0.4, 0.35, 0.4, crate);
        cr.position.set(cx, 0.175, cz);
        g.add(cr);
      }
    }

    // ── Perimeter fence ──
    this.addWoodenFence(g, H, wood, c.seed);
    this.addCornerTorches(g, H, wood);
  }

  // ────────────────────── MINING COMPOUND ──────────────────────
  private buildMiningCompound(g: THREE.Group, c: CompoundConfig, mult: number): void {
    const H = ProceduralBuildings.HALF;
    const darkStone = this.getMaterial('dark_stone', 0x4a4a4a, 0.15, 0.85);
    const stone = this.getMaterial('stone_mine', 0x6b6b6b, 0.1, 0.8);
    const wood = this.getMaterial('wood_mine', 0x4a3020, 0.0, 0.9);
    const roofMat = this.getFactionMaterial(0x5a5a5a, c.factionColor, 'mine_roof');
    const rails = this.getMaterial('rails', 0x4a4a4a, 0.3, 0.7);
    const ore = this.getMaterial('ore', 0x8b6b3a, 0.2, 0.7);

    // ── Mountain / Mine Facade (back wall) ──
    const facadeW = 10 * mult, facadeH = 4.5 * mult;
    const facade = this.box(facadeW, facadeH, 1.5, darkStone);
    facade.position.set(0, facadeH / 2, -H + 1);
    g.add(facade);
    // Tapered top
    const peak = this.cone(facadeW * 0.4, facadeH * 0.5, darkStone, 4);
    peak.position.set(0, facadeH + facadeH * 0.2, -H + 1);
    peak.rotation.y = Math.PI / 4;
    g.add(peak);

    // Mine entrances (2)
    const entranceMat = this.getMaterial('entrance', 0x0a0a0a, 0.0, 1.0);
    for (const ex of [-2.5, 2.5]) {
      const entrance = this.box(1.5, 2.0 * mult, 0.3, entranceMat);
      entrance.position.set(ex, 1.0 * mult, -H + 0.3);
      g.add(entrance);
      // Timber frame
      const frame = this.box(1.8, 2.2 * mult, 0.2, wood);
      frame.position.set(ex, 1.1 * mult, -H + 0.2);
      g.add(frame);
    }

    // ── Processing Building (center) ──
    const procW = 5 * mult, procD = 3 * mult, procH = 2.2 * mult;
    const proc = this.box(procW, procH, procD, stone);
    proc.position.set(0, procH / 2, 1);
    g.add(proc);
    const procRoof = this.roof(procW + 0.4, procD + 0.3, procH * 0.35, roofMat);
    procRoof.position.set(0, procH, 1);
    g.add(procRoof);

    // Chimney
    const chimney = this.box(0.5, 1.5 * mult, 0.5, darkStone);
    chimney.position.set(procW / 2 - 0.5, procH + 0.75 * mult, 1);
    g.add(chimney);

    // ── Cart Rail Tracks ──
    for (const rz of [-0.4, 0.4]) {
      const rail = this.box(12, 0.06, 0.1, rails);
      rail.position.set(0, 0.03, -2 + rz);
      g.add(rail);
    }
    // Rail ties
    for (let i = 0; i < 12; i++) {
      const tie = this.box(0.1, 0.04, 1.0, wood);
      tie.position.set(-6 + i, 0.02, -2);
      g.add(tie);
    }

    // ── Ore Piles ──
    for (let i = 0; i < 6 + c.level * 2; i++) {
      const ox = (this.hash(c.seed + i, 30) - 0.5) * 10;
      const oz = (this.hash(c.seed + i, 31) - 0.5) * 6 + 2;
      if (Math.abs(ox) < 2 && Math.abs(oz - 1) < 1.5) continue;
      const size = 0.3 + this.hash(c.seed + i, 32) * 0.4;
      const rock = this.box(size, size * 0.7, size, ore);
      rock.position.set(ox, size * 0.35, oz);
      rock.rotation.y = this.hash(c.seed + i, 33) * Math.PI;
      g.add(rock);
    }

    // ── Crane Structure ──
    if (c.level >= 2) {
      const craneX = 5;
      const craneBase = this.cylinder(0.15, 0.15, 3.0, wood);
      craneBase.position.set(craneX, 1.5, 3);
      g.add(craneBase);
      const boom = this.box(3.0, 0.12, 0.12, wood);
      boom.position.set(craneX + 1.5, 3.0, 3);
      boom.rotation.z = -Math.PI / 10;
      g.add(boom);
    }

    // ── Storage Sheds (sides) ──
    for (const side of [-1, 1]) {
      const shedW = 2.5 * mult, shedD = 2 * mult, shedH = 1.6 * mult;
      const sh = this.box(shedW, shedH, shedD, wood);
      sh.position.set(side * 5.5, shedH / 2, 4);
      g.add(sh);
      const shRoof = this.roof(shedW + 0.2, shedD + 0.2, shedH * 0.3, roofMat);
      shRoof.position.set(side * 5.5, shedH, 4);
      g.add(shRoof);
    }

    this.addCornerTorches(g, H, wood);
  }

  // ────────────────────── NOBLE COMPOUND ──────────────────────
  private buildNobleCompound(g: THREE.Group, c: CompoundConfig, mult: number): void {
    const H = ProceduralBuildings.HALF;
    const stone = this.getMaterial('stone_noble', 0x9b8b75, 0.1, 0.8);
    const stoneWhite = this.getMaterial('stone_white', 0xb8a890, 0.05, 0.85);
    const wood = this.getMaterial('wood_noble', 0x5c4033, 0.0, 0.9);
    const roofMat = this.getFactionMaterial(0x3a3a6a, c.factionColor, 'noble_roof');
    const domeMat = this.getFactionMaterial(0x4169e1, c.factionColor, 'dome');
    const garden = this.getMaterial('garden', 0x3a6a2a, 0.0, 0.95);

    // ── Main Manor / Castle Keep ──
    const manorW = 7 * mult, manorD = 5 * mult, manorH = 3.5 * mult;
    const manor = this.box(manorW, manorH, manorD, stone);
    manor.position.set(0, manorH / 2, -2);
    g.add(manor);
    const manorRoof = this.roof(manorW + 0.6, manorD + 0.4, manorH * 0.45, roofMat);
    manorRoof.position.set(0, manorH, -2);
    g.add(manorRoof);

    // Second floor detail
    const floor2 = this.box(manorW * 0.7, manorH * 0.3, manorD * 0.7, stoneWhite);
    floor2.position.set(0, manorH + manorH * 0.15, -2);
    g.add(floor2);
    const floor2Roof = this.roof(manorW * 0.7 + 0.4, manorD * 0.7 + 0.3, manorH * 0.3, roofMat);
    floor2Roof.position.set(0, manorH + manorH * 0.3, -2);
    g.add(floor2Roof);

    // Windows
    for (let i = 0; i < 4; i++) {
      const winMat = this.getMaterial('window', 0x1a1a2a, 0.0, 0.3);
      const wx = -manorW / 2 + 1.2 + i * (manorW - 2.4) / 3;
      const win = this.box(0.5, 0.7, 0.15, winMat);
      win.position.set(wx, manorH * 0.55, -2 + manorD / 2 + 0.05);
      g.add(win);
    }

    // ── Chapel / Academy Wing (side) ──
    const chapelR = 1.8 * mult, chapelH = 2.5 * mult;
    const chapel = this.cylinder(chapelR, chapelR, chapelH, stoneWhite, 12);
    chapel.position.set(-5.5, chapelH / 2, -1);
    g.add(chapel);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(chapelR * 1.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      domeMat
    );
    dome.position.set(-5.5, chapelH, -1);
    dome.castShadow = true;
    g.add(dome);

    // ── Gardens / Courtyard (front) ──
    const gardenPad = this.box(10, 0.06, 6, garden);
    gardenPad.position.set(0, 0.03, 4.5);
    g.add(gardenPad);

    // Decorative hedges
    for (const hx of [-4, -1.5, 1.5, 4]) {
      const hedge = this.box(1.5, 0.5, 0.5, garden);
      hedge.position.set(hx, 0.25, 3);
      g.add(hedge);
    }

    // Fountain in garden center
    const fountainBase = this.cylinder(0.8, 0.9, 0.4, stoneWhite, 12);
    fountainBase.position.set(0, 0.2, 5.5);
    g.add(fountainBase);
    const fountainPillar = this.cylinder(0.15, 0.15, 1.0, stoneWhite, 8);
    fountainPillar.position.set(0, 0.7, 5.5);
    g.add(fountainPillar);
    const fountainTop = this.cylinder(0.4, 0.3, 0.2, stoneWhite, 8);
    fountainTop.position.set(0, 1.2, 5.5);
    g.add(fountainTop);

    // ── Guard Tower ──
    const gtH = 4.0 * mult, gtR = 0.7 * mult;
    const gt = this.cylinder(gtR * 0.8, gtR, gtH, stone, 8);
    gt.position.set(6, gtH / 2, -4);
    g.add(gt);
    const gtRoof = this.cone(gtR * 1.3, gtR, roofMat, 8);
    gtRoof.position.set(6, gtH + 0.3, -4);
    g.add(gtRoof);

    // ── Stone Walls (perimeter) ──
    const wallH = 1.5 * mult;
    for (const [x, z, w, d] of [
      [0, H - 0.2, H * 2, 0.4], [0, -H + 0.2, H * 2, 0.4],
      [-H + 0.2, 0, 0.4, H * 2 - 0.4], [H - 0.2, 0, 0.4, H * 2 - 0.4],
    ] as [number, number, number, number][]) {
      const wall = this.box(w, wallH, d, stone);
      wall.position.set(x, wallH / 2, z);
      g.add(wall);
    }

    // ── Banner ──
    const bannerMat = new THREE.MeshStandardMaterial({ color: c.factionColor, roughness: 0.8 });
    const pole = this.cylinder(0.06, 0.06, 2.0, wood);
    pole.position.set(0, manorH + manorH * 0.3 + 1.0, -2);
    g.add(pole);
    const banner = this.box(0.7, 0.9, 0.05, bannerMat);
    banner.position.set(0.35, manorH + manorH * 0.3 + 1.2, -2);
    g.add(banner);

    this.addCornerTorches(g, H, wood);
  }

  // ────────────────────── RESIDENTIAL COMPOUND ──────────────────────
  private buildResidentialCompound(g: THREE.Group, c: CompoundConfig, mult: number): void {
    const H = ProceduralBuildings.HALF;
    const stone = this.getMaterial('stone_res', 0x8b7355, 0.1, 0.85);
    const wood = this.getMaterial('wood_res', 0x6b4423, 0.0, 0.9);
    const plaster = this.getMaterial('plaster', 0xb8a880, 0.0, 0.9);
    const roofMat = this.getFactionMaterial(0x8b4513, c.factionColor, 'res_roof');

    // ── Central Courtyard (stone floor) ──
    const courtyard = this.box(6, 0.06, 6, this.getMaterial('court', 0x7a6a5a, 0.0, 0.95));
    courtyard.position.set(0, 0.03, 0);
    g.add(courtyard);

    // ── Well in courtyard ──
    const well = this.cylinder(0.4, 0.4, 0.5, stone, 8);
    well.position.set(0, 0.25, 0);
    g.add(well);

    // ── Houses around courtyard ──
    const houses = [
      { x: 0, z: -5, w: 8, d: 4, h: 2.5, rot: 0 },
      { x: -5.5, z: 1, w: 4, d: 6, h: 2.2, rot: 0 },
      { x: 5.5, z: 1, w: 4, d: 6, h: 2.2, rot: 0 },
      { x: -3, z: 5.5, w: 5, d: 3, h: 2.0, rot: 0 },
      { x: 4, z: 5.5, w: 4, d: 3, h: 1.8, rot: 0 },
    ];

    for (let i = 0; i < houses.length; i++) {
      const house = houses[i];
      const hW = house.w * mult, hD = house.d * mult, hH = house.h * mult;
      const mat = i % 2 === 0 ? stone : plaster;

      const walls = this.box(hW, hH, hD, mat);
      walls.position.set(house.x, hH / 2, house.z);
      g.add(walls);

      const r = this.roof(hW + 0.4, hD + 0.3, hH * 0.35, roofMat);
      r.position.set(house.x, hH, house.z);
      g.add(r);

      // Door
      const door = this.box(0.6, 1.2 * mult, 0.12, wood);
      const doorZ = house.z + (house.z < 0 ? hD / 2 + 0.03 : -hD / 2 - 0.03);
      door.position.set(house.x, 0.6 * mult, doorZ);
      g.add(door);

      // Windows
      if (hW > 3) {
        const winMat = this.getMaterial('window_res', 0x1a1a2a, 0.0, 0.3);
        for (const wx of [-hW / 4, hW / 4]) {
          const win = this.box(0.4, 0.5, 0.1, winMat);
          win.position.set(house.x + wx, hH * 0.55, doorZ);
          g.add(win);
        }
      }
    }

    // ── Chimney smoke indicators ──
    for (let i = 0; i < 3; i++) {
      const house = houses[i];
      const hH = house.h * mult;
      const chimney = this.box(0.4, 0.8, 0.4, stone);
      chimney.position.set(house.x + house.w * mult / 3, hH + hH * 0.35 + 0.4, house.z);
      g.add(chimney);
    }

    this.addWoodenFence(g, H, wood, c.seed);
    this.addCornerTorches(g, H, wood);
  }

  // ────────────────────── MIXED COMPOUND ──────────────────────
  private buildMixedCompound(g: THREE.Group, c: CompoundConfig, mult: number): void {
    const H = ProceduralBuildings.HALF;
    const stone = this.getMaterial('stone_mix', 0x8b7355, 0.1, 0.85);
    const wood = this.getMaterial('wood_mix', 0x5c4033, 0.0, 0.9);
    const plaster = this.getMaterial('plaster_mix', 0xb8a880, 0.0, 0.9);
    const roofMat = this.getFactionMaterial(0x8b4513, c.factionColor, 'mix_roof');
    const awning = this.getFactionMaterial(0xdaa520, c.factionColor, 'mix_awning');

    // ── Town Hall (center, largest) ──
    const thW = 6 * mult, thD = 5 * mult, thH = 3.0 * mult;
    const townHall = this.box(thW, thH, thD, stone);
    townHall.position.set(0, thH / 2, -2);
    g.add(townHall);
    const thRoof = this.roof(thW + 0.6, thD + 0.4, thH * 0.45, roofMat);
    thRoof.position.set(0, thH, -2);
    g.add(thRoof);

    // Clock tower on town hall
    const clockTower = this.box(1.2, 2.0 * mult, 1.2, stone);
    clockTower.position.set(0, thH + 1.0 * mult, -2);
    g.add(clockTower);
    const clockRoof = this.cone(0.9, 0.8 * mult, roofMat, 4);
    clockRoof.position.set(0, thH + 2.0 * mult + 0.3, -2);
    clockRoof.rotation.y = Math.PI / 4;
    g.add(clockRoof);

    // ── Market Stalls (front-left) ──
    for (let i = 0; i < 3; i++) {
      const sx = -5 + i * 2.5;
      const postH = 1.5 * mult;
      for (const [px, pz] of [[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.6], [0.8, 0.6]]) {
        const post = this.cylinder(0.05, 0.05, postH, wood);
        post.position.set(sx + px, postH / 2, 4.5 + pz);
        g.add(post);
      }
      const aw = this.box(1.8, 0.06, 1.4, awning);
      aw.position.set(sx, postH, 4.5);
      g.add(aw);
    }

    // ── Houses (sides) ──
    for (const side of [-1, 1]) {
      const hW = 3.5 * mult, hD = 4 * mult, hH = 2.2 * mult;
      const house = this.box(hW, hH, hD, side === -1 ? plaster : stone);
      house.position.set(side * 5.5, hH / 2, 0);
      g.add(house);
      const hr = this.roof(hW + 0.3, hD + 0.2, hH * 0.35, roofMat);
      hr.position.set(side * 5.5, hH, 0);
      g.add(hr);
    }

    // ── Workshop (back) ──
    const wsW = 4 * mult, wsD = 3 * mult, wsH = 2.0 * mult;
    const workshop = this.box(wsW, wsH, wsD, wood);
    workshop.position.set(4, wsH / 2, -5.5);
    g.add(workshop);
    const wsRoof = this.roof(wsW + 0.3, wsD + 0.2, wsH * 0.3, roofMat);
    wsRoof.position.set(4, wsH, -5.5);
    g.add(wsRoof);

    // ── Well ──
    const wellBase = this.cylinder(0.45, 0.45, 0.5, stone, 8);
    wellBase.position.set(0, 0.25, 2);
    g.add(wellBase);

    // ── Barrel/crate scatter ──
    for (let i = 0; i < 5 + c.level; i++) {
      const bx = (this.hash(c.seed + i, 40) - 0.5) * 10;
      const bz = (this.hash(c.seed + i, 41) - 0.5) * 10;
      if (Math.abs(bx) < 2.5 && Math.abs(bz + 2) < 2) continue;
      const b = this.box(0.35, 0.3, 0.35, wood);
      b.position.set(bx, 0.15, bz);
      g.add(b);
    }

    this.addWoodenFence(g, H, wood, c.seed);
    this.addCornerTorches(g, H, wood);
  }

  // ────────────────────── SHARED HELPERS ──────────────────────

  /**
   * Wooden fence around perimeter
   */
  private addWoodenFence(g: THREE.Group, half: number, mat: THREE.Material, _seed: number): void {
    const spacing = 1.8;
    const postH = 0.7;
    const railH = 0.45;
    const inset = 0.3; // slightly inside parcel border

    for (const [axis, sign] of [[0, 1], [0, -1], [1, 1], [1, -1]] as [number, number][]) {
      const count = Math.floor((half * 2 - 1) / spacing);
      for (let i = 0; i <= count; i++) {
        const t = -half + inset + i * spacing;
        const px = axis === 0 ? t : sign * (half - inset);
        const pz = axis === 0 ? sign * (half - inset) : t;

        const post = this.cylinder(0.05, 0.05, postH, mat);
        post.position.set(px, postH / 2, pz);
        g.add(post);
      }

      // Rails between posts
      const railLen = half * 2 - inset * 2;
      const rail = this.box(
        axis === 0 ? railLen : 0.04,
        0.04,
        axis === 0 ? 0.04 : railLen,
        mat
      );
      const rx = axis === 0 ? 0 : sign * (half - inset);
      const rz = axis === 0 ? sign * (half - inset) : 0;
      rail.position.set(rx, railH, rz);
      g.add(rail);
    }
  }

  /**
   * Torches at 4 corners
   */
  private addCornerTorches(g: THREE.Group, half: number, woodMat: THREE.Material): void {
    const inset = 0.5;
    const torchH = 1.2;
    const flameMat = new THREE.MeshStandardMaterial({
      color: 0xff6600, emissive: 0xff6600, emissiveIntensity: 0.8,
    });
    const flameGeo = new THREE.SphereGeometry(0.1, 6, 6);

    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const tx = cx * (half - inset);
      const tz = cz * (half - inset);
      const pole = this.cylinder(0.04, 0.04, torchH, woodMat);
      pole.position.set(tx, torchH / 2, tz);
      g.add(pole);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(tx, torchH + 0.08, tz);
      g.add(flame);
    }
  }

  /**
   * Add crenellations along wall tops for military compound
   */
  private addCrenellations(
    g: THREE.Group,
    wallLen: number,
    wallThick: number,
    wallH: number,
    mat: THREE.Material,
    half: number
  ): void {
    const merlonW = 0.3, merlonH = 0.35, spacing = 0.7;
    const count = Math.floor(wallLen / spacing);

    // Front and back walls
    for (const z of [half - wallThick / 2, -half + wallThick / 2]) {
      for (let i = 0; i <= count; i++) {
        if (i % 2 !== 0) continue;
        const x = -wallLen / 2 + i * spacing;
        const merlon = this.box(merlonW, merlonH, wallThick + 0.1, mat);
        merlon.position.set(x, wallH + merlonH / 2, z);
        g.add(merlon);
      }
    }

    // Side walls
    for (const x of [half - wallThick / 2, -half + wallThick / 2]) {
      for (let i = 0; i <= count; i++) {
        if (i % 2 !== 0) continue;
        const z = -wallLen / 2 + i * spacing;
        const merlon = this.box(wallThick + 0.1, merlonH, merlonW, mat);
        merlon.position.set(x, wallH + merlonH / 2, z);
        g.add(merlon);
      }
    }
  }

  /**
   * Cleanup cached materials
   */
  dispose(): void {
    this.materialCache.forEach((m) => m.dispose());
    this.materialCache.clear();
  }
}
