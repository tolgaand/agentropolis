/**
 * V2Traffic — World-space traffic simulation with two-lane roads
 *
 * Features:
 *  - World-space vehicle positions (survive grid shifts without respawn)
 *  - Object3D pool with separate body + wheel meshes
 *  - Two lanes per road (right-hand traffic)
 *  - Car-following (IDM-lite) with smooth acceleration/braking
 *  - Bézier arc intersection turns with yaw + steering animation
 *  - Lane changing when leader is slow
 *  - Per-type speed profiles (bus slow, ambulance fast, etc.)
 *  - Deterministic spawn via SeededRandom
 *  - LOD: fewer vehicles at far zoom
 *
 * Road grid: roads at localX % 4 === 0 (N-S) and localZ % 4 === 0 (E-W).
 * Each road tile = 15 units wide. Two lanes offset ±2.8 from center.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  TILE,
  TILES_PER_CHUNK,
  CHUNK_SIZE,
  CHUNK_COUNT,
  ASSET_BASE,
  SeededRandom,
} from './V2Config';
import {
  type DirIndex,
  type BezierArc,
  buildTurnArc,
  bezierPoint,
  bezierTangent,
  bezierLength,
  decideTurn,
  dirToYaw,
  lerpAngle,
} from './V2TrafficPath';

// ─── Config ───

/** Vehicle type definitions with speed profiles */
interface VehicleTypeDef {
  file: string;
  desiredSpeed: number;   // units/s
  maxAccel: number;       // units/s²
  comfortDecel: number;   // units/s²
  length: number;         // approximate vehicle length in units
  isLarge: boolean;       // trucks/buses need wider turns
}

const VEHICLE_TYPES: VehicleTypeDef[] = [
  // Cars — small, fast
  { file: 'car_001.glb',   desiredSpeed: 16, maxAccel: 10, comfortDecel: 8, length: 4.5, isLarge: false },
  { file: 'car_003.glb',   desiredSpeed: 17, maxAccel: 10, comfortDecel: 8, length: 4.5, isLarge: false },
  { file: 'car_004.glb',   desiredSpeed: 15, maxAccel: 9,  comfortDecel: 8, length: 5.0, isLarge: false },
  { file: 'car_007.glb',   desiredSpeed: 16, maxAccel: 10, comfortDecel: 8, length: 4.5, isLarge: false },
  { file: 'car_010.glb',   desiredSpeed: 18, maxAccel: 11, comfortDecel: 8, length: 5.0, isLarge: false },
  { file: 'car_014.glb',   desiredSpeed: 15, maxAccel: 9,  comfortDecel: 7, length: 4.5, isLarge: false },
  { file: 'car_020.glb',   desiredSpeed: 16, maxAccel: 10, comfortDecel: 8, length: 4.5, isLarge: false },
  { file: 'car_024.glb',   desiredSpeed: 17, maxAccel: 10, comfortDecel: 8, length: 5.0, isLarge: false },
  // Large vehicles — slower
  { file: 'bus_001.glb',           desiredSpeed: 10, maxAccel: 5, comfortDecel: 5, length: 11, isLarge: true },
  { file: 'cargo_truck_001.glb',   desiredSpeed: 12, maxAccel: 5, comfortDecel: 5, length: 8,  isLarge: true },
  { file: 'ambulance_001.glb',     desiredSpeed: 20, maxAccel: 12, comfortDecel: 9, length: 7, isLarge: true },
  { file: 'garbage_truck_001.glb', desiredSpeed: 10, maxAccel: 4, comfortDecel: 4, length: 8,  isLarge: true },
  { file: 'fire_truck_001.glb',    desiredSpeed: 18, maxAccel: 10, comfortDecel: 8, length: 9, isLarge: true },
];

const WHEEL_FILES = { L: 'wheel_L.glb', R: 'wheel_R.glb' };

/** Max vehicles alive at once */
const MAX_VEHICLES = 120;

/** Lane offset from road center */
const LANE_OFFSET = 2.8;

/** Y position above ground */
const VEHICLE_Y = 0.15;

/** Max dt to prevent teleporting */
const MAX_DT = 0.1;

/** Road interval in tiles */
const ROAD_INTERVAL = 4;

// IDM parameters
const MIN_GAP = 8;          // minimum gap to leader (units)
const HEADWAY_TIME = 0.8;   // seconds
const INTERSECTION_SLOW_DIST = TILE * 1.5;  // start braking before intersection

/** Wheel radius (approximate, for spin calc) */
const WHEEL_RADIUS = 0.35;

/** Max steering angle for front wheels */
const MAX_STEER = 0.52;  // ~30°

// ─── Types ───

interface VehicleTemplate {
  bodyGeo: THREE.BufferGeometry;
  bodyMat: THREE.Material;
  typeDef: VehicleTypeDef;
  /** Pre-computed wheel positions for this body type */
  wheelPositions: Array<{ x: number; y: number; z: number; side: 'L' | 'R' }>;
}

type VehicleState = 'driving' | 'turning';

interface Vehicle {
  // Identity
  typeIdx: number;
  poolIdx: number;        // index into pool array

  // World-space position
  worldX: number;
  worldZ: number;
  yaw: number;            // current body rotation.y
  targetYaw: number;

  // Lane / segment
  laneId: string;         // "NS:wx:lane" or "EW:wz:lane"
  dir: DirIndex;
  laneIndex: 0 | 1;
  /** Fixed axis world position (road center X for NS, Z for EW) */
  roadWorldPos: number;
  /** Travel position along lane axis (world-space) */
  travelPos: number;

  // Physics
  speed: number;
  desiredSpeed: number;

  // State
  state: VehicleState;
  turnArc: BezierArc | null;
  turnT: number;
  turnLength: number;
  turnExitDir: DirIndex;
  turnExitLaneId: string;
  turnExitRoadPos: number;
  turnExitTravelPos: number;
  /** Prevents re-triggering turn at same intersection */
  lastIntersectionKey: string;

  // Animation
  wheelRoll: number;
  steeringAngle: number;

  // Lane change
  laneChanging: boolean;
  laneChangeT: number;
  laneChangeFrom: number;  // lateral world offset
  laneChangeTo: number;

  // Internal RNG seed for deterministic decisions
  seed: number;
}

/** A single lane on a road segment */
interface Lane {
  id: string;
  dir: DirIndex;
  laneIndex: 0 | 1;
  roadWorldPos: number;    // fixed axis position (world-space)
  axis: 'NS' | 'EW';
  vehicles: Vehicle[];     // sorted by travelPos ascending
}

/** Pool entry for a renderable vehicle */
interface PoolEntry {
  group: THREE.Group;
  body: THREE.Mesh;
  wheels: THREE.Object3D[];  // [FL, FR, RL, RR]
  active: boolean;
  typeIdx: number;
}

// ─── Intersection reservation (FIFO) ───

interface IntersectionReservation {
  vehiclePoolIdx: number;
  enterTime: number;
}

// ─── Traffic Controller ───

export class TrafficController {
  private templates: VehicleTemplate[] = [];
  private wheelGeoL: THREE.BufferGeometry | null = null;
  private wheelMatL: THREE.Material | null = null;
  private wheelGeoR: THREE.BufferGeometry | null = null;
  private wheelMatR: THREE.Material | null = null;
  private pool: PoolEntry[] = [];
  private vehicles: Vehicle[] = [];
  private lanes = new Map<string, Lane>();
  private parent: THREE.Group | null = null;
  private loaded = false;
  private rng = new SeededRandom(12345);

  // Grid tracking (mirrors CityRendererV2's gridCoords)
  private gridX = 0;
  private gridZ = 0;

  // Intersection reservations: key = "ix:iz" (intersection tile coords)
  private intersections = new Map<string, IntersectionReservation>();
  private clock = 0;  // elapsed time for reservation timeouts

  // Half-extent of visible area in world units
  private halfExtent = (CHUNK_SIZE * CHUNK_COUNT) / 2;

  // ─── Init ───

  async init(parent: THREE.Group): Promise<void> {
    this.parent = parent;
    const loader = new GLTFLoader();

    // Load wheel templates — extract geometry + material once
    try {
      const [gltfL, gltfR] = await Promise.all([
        loader.loadAsync(ASSET_BASE + WHEEL_FILES.L),
        loader.loadAsync(ASSET_BASE + WHEEL_FILES.R),
      ]);
      const meshL = this.extractMesh(gltfL);
      const meshR = this.extractMesh(gltfR);
      if (meshL) {
        meshL.updateWorldMatrix(true, false);
        this.wheelGeoL = meshL.geometry.clone();
        this.wheelGeoL.applyMatrix4(meshL.matrixWorld);
        const mat = (meshL.material as THREE.MeshStandardMaterial).clone();
        mat.metalness = 0; mat.roughness = 1.0;
        if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
        this.wheelMatL = mat;
      }
      if (meshR) {
        meshR.updateWorldMatrix(true, false);
        this.wheelGeoR = meshR.geometry.clone();
        this.wheelGeoR.applyMatrix4(meshR.matrixWorld);
        const mat = (meshR.material as THREE.MeshStandardMaterial).clone();
        mat.metalness = 0; mat.roughness = 1.0;
        if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
        this.wheelMatR = mat;
      }
    } catch (err) {
      console.warn('[Traffic] Failed to load wheel models, will use placeholders:', err);
    }

    // Load vehicle body templates
    for (const def of VEHICLE_TYPES) {
      try {
        const gltf = await loader.loadAsync(ASSET_BASE + def.file);
        const mesh = this.extractMesh(gltf);
        if (!mesh) {
          console.warn(`[Traffic] No mesh in ${def.file}`);
          continue;
        }

        // Bake world transform into geometry
        mesh.updateWorldMatrix(true, false);
        const geo = mesh.geometry.clone();
        geo.applyMatrix4(mesh.matrixWorld);

        const srcMat = mesh.material as THREE.MeshStandardMaterial;
        const mat = srcMat.clone();
        mat.metalness = 0;
        mat.roughness = 1.0;
        if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;

        // Pre-compute wheel positions from bounding box
        geo.computeBoundingBox();
        const bb = geo.boundingBox!;
        const bodyLen = bb.max.z - bb.min.z;
        const bodyWidth = bb.max.x - bb.min.x;
        const wheelX = bodyWidth * 0.38;
        const frontZ = bodyLen * 0.30;
        const rearZ = -bodyLen * 0.32;
        const wheelY = def.isLarge ? 0.05 : 0.0;

        this.templates.push({
          bodyGeo: geo,
          bodyMat: mat,
          typeDef: def,
          wheelPositions: [
            { x: -wheelX, y: wheelY, z: frontZ, side: 'L' },
            { x: wheelX, y: wheelY, z: frontZ, side: 'R' },
            { x: -wheelX, y: wheelY, z: rearZ, side: 'L' },
            { x: wheelX, y: wheelY, z: rearZ, side: 'R' },
          ],
        });
      } catch (err) {
        console.warn(`[Traffic] Failed to load ${def.file}:`, err);
      }
    }

    if (this.templates.length === 0) {
      console.warn('[Traffic] No vehicle models loaded');
      return;
    }

    // Build Object3D pool
    this.buildPool();

    // Initial spawn
    this.rebuildLanes();
    this.spawnInitialVehicles();

    this.loaded = true;
    console.log(`[Traffic] Initialized: ${this.templates.length} types, ${this.pool.length} pool slots, ${this.vehicles.length} vehicles`);
  }

  private extractMesh(gltf: { scene: THREE.Group }): THREE.Mesh | null {
    let best: THREE.Mesh | null = null;
    let bestCount = 0;
    gltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const count = child.geometry.getAttribute('position')?.count ?? 0;
        if (count > bestCount) {
          bestCount = count;
          best = child;
        }
      }
    });
    return best;
  }

  // ─── Pool Building ───

  /** Build a pool entry for a specific template type */
  private buildPoolEntry(typeIdx: number): PoolEntry {
    const tmpl = this.templates[typeIdx];

    const group = new THREE.Group();
    group.visible = false;

    // Body mesh
    const body = new THREE.Mesh(tmpl.bodyGeo, tmpl.bodyMat);
    body.castShadow = true;
    body.receiveShadow = false;
    body.name = 'body';
    group.add(body);

    // Wheels — positioned according to this template's bounding box
    const wheels: THREE.Object3D[] = [];
    for (const wp of tmpl.wheelPositions) {
      const wheel = this.createWheel(wp.side, tmpl.typeDef.isLarge);
      wheel.position.set(wp.x, wp.y, wp.z);
      group.add(wheel);
      wheels.push(wheel);
    }

    this.parent!.add(group);
    return { group, body, wheels, active: false, typeIdx };
  }

  private buildPool(): void {
    for (let i = 0; i < MAX_VEHICLES; i++) {
      // Each pool slot gets its own fixed type
      const typeIdx = i % this.templates.length;
      const entry = this.buildPoolEntry(typeIdx);
      entry.group.name = `vehicle_${i}`;
      this.pool.push(entry);
    }
  }

  private createWheel(side: 'L' | 'R', isLarge: boolean): THREE.Object3D {
    const geo = side === 'L' ? this.wheelGeoL : this.wheelGeoR;
    const mat = side === 'L' ? this.wheelMatL : this.wheelMatR;

    if (geo && mat) {
      const wheel = new THREE.Mesh(geo.clone(), mat.clone());
      const scale = isLarge ? 1.2 : 0.8;
      wheel.scale.setScalar(scale);
      wheel.castShadow = true;
      return wheel;
    }

    // Procedural placeholder
    const radius = isLarge ? 0.45 : 0.3;
    const cylGeo = new THREE.CylinderGeometry(radius, radius, 0.2, 12);
    cylGeo.rotateZ(Math.PI / 2);
    const cylMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    const mesh = new THREE.Mesh(cylGeo, cylMat);
    mesh.castShadow = true;
    return mesh;
  }

  // ─── Lane Management ───

  private rebuildLanes(): void {
    // Preserve existing vehicles in lanes by detaching first
    const existingVehicles = new Map<string, Vehicle[]>();
    for (const [id, lane] of this.lanes) {
      if (lane.vehicles.length > 0) {
        existingVehicles.set(id, [...lane.vehicles]);
      }
    }

    this.lanes.clear();
    const halfCount = Math.floor(CHUNK_COUNT / 2);

    // N-S roads (fixed X, travel along Z)
    for (let cx = this.gridX - halfCount; cx <= this.gridX + halfCount; cx++) {
      for (let lt = 0; lt < TILES_PER_CHUNK; lt += ROAD_INTERVAL) {
        const worldTileX = cx * TILES_PER_CHUNK + lt;
        const roadCenterX = worldTileX * TILE + TILE / 2;

        const id0 = `NS:${worldTileX}:0`;
        this.lanes.set(id0, {
          id: id0, dir: 2, laneIndex: 0,
          roadWorldPos: roadCenterX, axis: 'NS',
          vehicles: existingVehicles.get(id0) ?? [],
        });

        const id1 = `NS:${worldTileX}:1`;
        this.lanes.set(id1, {
          id: id1, dir: 3, laneIndex: 1,
          roadWorldPos: roadCenterX, axis: 'NS',
          vehicles: existingVehicles.get(id1) ?? [],
        });
      }
    }

    // E-W roads (fixed Z, travel along X)
    for (let cz = this.gridZ - halfCount; cz <= this.gridZ + halfCount; cz++) {
      for (let lt = 0; lt < TILES_PER_CHUNK; lt += ROAD_INTERVAL) {
        const worldTileZ = cz * TILES_PER_CHUNK + lt;
        const roadCenterZ = worldTileZ * TILE + TILE / 2;

        const id0 = `EW:${worldTileZ}:0`;
        this.lanes.set(id0, {
          id: id0, dir: 0, laneIndex: 0,
          roadWorldPos: roadCenterZ, axis: 'EW',
          vehicles: existingVehicles.get(id0) ?? [],
        });

        const id1 = `EW:${worldTileZ}:1`;
        this.lanes.set(id1, {
          id: id1, dir: 1, laneIndex: 1,
          roadWorldPos: roadCenterZ, axis: 'EW',
          vehicles: existingVehicles.get(id1) ?? [],
        });
      }
    }
  }

  private spawnInitialVehicles(): void {
    this.vehicles = [];

    // Clear lane vehicle lists
    for (const lane of this.lanes.values()) {
      lane.vehicles = [];
    }

    const laneArr = Array.from(this.lanes.values());
    let count = 0;

    // Distribute vehicles across lanes, ~1-3 per lane
    for (const lane of laneArr) {
      if (count >= MAX_VEHICLES) break;

      const numToSpawn = this.rng.next() < 0.4 ? 2 : 1;

      for (let i = 0; i < numToSpawn && count < MAX_VEHICLES; i++) {
        // Spawn within visible area — keep travelRange tighter
        const travelRange = this.halfExtent * 1.4;
        const travelPos = (this.rng.next() - 0.5) * travelRange;

        // Vehicle type must match pool entry type
        const typeIdx = count % this.templates.length;
        const tmpl = this.templates[typeIdx];
        const speedVariation = 0.85 + this.rng.next() * 0.3;

        const vehicle = this.createVehicle(
          typeIdx,
          count,
          lane,
          travelPos,
          tmpl.typeDef.desiredSpeed * speedVariation,
          this.rng.next() * 10000,
        );

        this.vehicles.push(vehicle);
        lane.vehicles.push(vehicle);

        // Activate pool — no type swap needed since types already match
        const entry = this.pool[count];
        if (entry) {
          entry.active = true;
          entry.group.visible = true;
        }
        count++;
      }
    }

    // Sort each lane's vehicles by travelPos
    for (const lane of this.lanes.values()) {
      this.sortLane(lane);
    }
  }

  private createVehicle(
    typeIdx: number,
    poolIdx: number,
    lane: Lane,
    travelPos: number,
    desiredSpeed: number,
    seed: number,
  ): Vehicle {
    const laneOffset = lane.laneIndex === 0 ? LANE_OFFSET : -LANE_OFFSET;
    let worldX: number, worldZ: number;

    if (lane.axis === 'NS') {
      worldX = lane.roadWorldPos + laneOffset;
      worldZ = travelPos;
    } else {
      worldX = travelPos;
      worldZ = lane.roadWorldPos + laneOffset;
    }

    return {
      typeIdx,
      poolIdx,
      worldX,
      worldZ,
      yaw: dirToYaw(lane.dir),
      targetYaw: dirToYaw(lane.dir),
      laneId: lane.id,
      dir: lane.dir,
      laneIndex: lane.laneIndex,
      roadWorldPos: lane.roadWorldPos,
      travelPos,
      speed: desiredSpeed * (0.6 + Math.random() * 0.4),  // start near full speed
      desiredSpeed,
      state: 'driving',
      turnArc: null,
      turnT: 0,
      turnLength: 0,
      turnExitDir: lane.dir,
      turnExitLaneId: '',
      turnExitRoadPos: 0,
      turnExitTravelPos: 0,
      lastIntersectionKey: '',
      wheelRoll: Math.random() * Math.PI * 2,  // random initial roll
      steeringAngle: 0,
      laneChanging: false,
      laneChangeT: 0,
      laneChangeFrom: 0,
      laneChangeTo: 0,
      seed,
    };
  }

  private sortLane(lane: Lane): void {
    lane.vehicles.sort((a, b) => a.travelPos - b.travelPos);
  }

  // ─── Grid Shift (called by CityRendererV2) ───

  onGridShift(dx: number, dz: number): void {
    if (!this.loaded) return;

    this.gridX += dx;
    this.gridZ += dz;

    // Rebuild lanes for new visible area (preserves vehicle assignments)
    this.rebuildLanes();

    // Recycle vehicles that fell out of visible range
    let recycled = 0;

    for (const vehicle of this.vehicles) {
      if (vehicle.state === 'turning') continue;  // don't interrupt turns

      const sceneLocalX = vehicle.worldX - this.gridX * CHUNK_SIZE;
      const sceneLocalZ = vehicle.worldZ - this.gridZ * CHUNK_SIZE;

      if (Math.abs(sceneLocalX) > this.halfExtent * 1.3 ||
          Math.abs(sceneLocalZ) > this.halfExtent * 1.3) {
        this.recycleVehicle(vehicle);
        recycled++;
      } else {
        // Ensure vehicle is registered in a valid lane
        if (!this.lanes.has(vehicle.laneId)) {
          this.reassignToLane(vehicle);
        }
      }
    }

    // Sort all lanes
    for (const lane of this.lanes.values()) {
      this.sortLane(lane);
    }

    if (recycled > 0) {
      console.log(`[Traffic] shift ${dx},${dz} — recycled: ${recycled}`);
    }
  }

  private recycleVehicle(vehicle: Vehicle): void {
    // Remove from old lane
    const oldLane = this.lanes.get(vehicle.laneId);
    if (oldLane) {
      const idx = oldLane.vehicles.indexOf(vehicle);
      if (idx >= 0) oldLane.vehicles.splice(idx, 1);
    }

    // Pick a random lane in visible area
    const laneArr = Array.from(this.lanes.values());
    if (laneArr.length === 0) return;

    const newLane = laneArr[Math.floor(this.rng.next() * laneArr.length)];
    const travelRange = this.halfExtent * 1.2;
    const travelPos = (this.rng.next() - 0.5) * travelRange;

    const laneOffset = newLane.laneIndex === 0 ? LANE_OFFSET : -LANE_OFFSET;

    vehicle.laneId = newLane.id;
    vehicle.dir = newLane.dir;
    vehicle.laneIndex = newLane.laneIndex;
    vehicle.roadWorldPos = newLane.roadWorldPos;
    vehicle.travelPos = travelPos;
    vehicle.state = 'driving';
    vehicle.turnArc = null;
    vehicle.laneChanging = false;
    vehicle.yaw = dirToYaw(newLane.dir);
    vehicle.targetYaw = vehicle.yaw;
    vehicle.steeringAngle = 0;
    vehicle.lastIntersectionKey = '';
    vehicle.speed = vehicle.desiredSpeed * 0.8;

    if (newLane.axis === 'NS') {
      vehicle.worldX = newLane.roadWorldPos + laneOffset;
      vehicle.worldZ = travelPos;
    } else {
      vehicle.worldX = travelPos;
      vehicle.worldZ = newLane.roadWorldPos + laneOffset;
    }

    newLane.vehicles.push(vehicle);
  }

  private reassignToLane(vehicle: Vehicle): void {
    // Find nearest matching lane
    let bestLane: Lane | null = null;
    let bestDist = Infinity;

    for (const lane of this.lanes.values()) {
      if (lane.dir !== vehicle.dir) continue;
      const dist = Math.abs(lane.roadWorldPos - vehicle.roadWorldPos);
      if (dist < bestDist) {
        bestDist = dist;
        bestLane = lane;
      }
    }

    if (bestLane) {
      vehicle.laneId = bestLane.id;
      vehicle.roadWorldPos = bestLane.roadWorldPos;
      vehicle.laneIndex = bestLane.laneIndex;
      if (!bestLane.vehicles.includes(vehicle)) {
        bestLane.vehicles.push(vehicle);
      }
    }
  }

  // ─── Update (called every frame) ───

  update(dt: number, cameraHeight: number): void {
    if (!this.loaded || this.vehicles.length === 0) return;

    const clampedDt = Math.min(dt, MAX_DT);
    this.clock += clampedDt;

    // LOD: at far zoom, hide some vehicles (but still update physics for all)
    const lodRatio = cameraHeight > 250 ? 0.5 : cameraHeight > 180 ? 0.7 : 1.0;
    // Determine camera-center in world-space for distance-based LOD
    const camCenterWorldX = this.gridX * CHUNK_SIZE;
    const camCenterWorldZ = this.gridZ * CHUNK_SIZE;

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];

      if (v.state === 'turning') {
        this.updateTurning(v, clampedDt);
      } else {
        this.updateDriving(v, clampedDt);
      }

      // Wheel animation
      v.wheelRoll += (v.speed / WHEEL_RADIUS) * clampedDt;

      // Yaw smoothing
      v.yaw = lerpAngle(v.yaw, v.targetYaw, 5 * clampedDt);

      // Steering smoothing
      const targetSteer = v.state === 'turning' ? this.getTurnSteering(v) : 0;
      v.steeringAngle += (targetSteer - v.steeringAngle) * Math.min(1, 5 * clampedDt);

      // Update world position from travelPos (for driving state)
      if (v.state === 'driving') {
        this.updateWorldPosFromLane(v);
      }

      // Distance-based visibility: closer vehicles get priority
      const dx = v.worldX - camCenterWorldX;
      const dz = v.worldZ - camCenterWorldZ;
      const distSq = dx * dx + dz * dz;
      const visibleRange = this.halfExtent * lodRatio;
      const isVisible = distSq < visibleRange * visibleRange;

      // Apply to pool mesh
      this.applyToPool(v, isVisible);
    }

    // Clean up expired intersection reservations (2s timeout)
    for (const [key, res] of this.intersections) {
      if (this.clock - res.enterTime > 2.0) {
        this.intersections.delete(key);
      }
    }
  }

  // ─── Driving state ───

  private updateDriving(v: Vehicle, dt: number): void {
    const lane = this.lanes.get(v.laneId);
    if (!lane) return;

    const typeDef = this.templates[v.typeIdx]?.typeDef;
    if (!typeDef) return;

    // Find leader (next vehicle ahead in sorted lane list)
    const myIndex = lane.vehicles.indexOf(v);
    if (myIndex < 0) return;  // vehicle not in lane yet
    const sign = (v.dir === 0 || v.dir === 2) ? 1 : -1;

    let leaderGap = Infinity;

    // Leader is the vehicle ahead in travel direction
    if (sign > 0) {
      for (let j = myIndex + 1; j < lane.vehicles.length; j++) {
        const leader = lane.vehicles[j];
        if (leader.state === 'turning') continue;
        leaderGap = leader.travelPos - v.travelPos - typeDef.length;
        break;
      }
    } else {
      for (let j = myIndex - 1; j >= 0; j--) {
        const leader = lane.vehicles[j];
        if (leader.state === 'turning') continue;
        leaderGap = v.travelPos - leader.travelPos - typeDef.length;
        break;
      }
    }

    // Check intersection approach
    const intersectionDist = this.distanceToNextIntersection(v);
    const intersectionKey = this.nextIntersectionKey(v);

    let shouldBrakeForIntersection = false;
    if (intersectionDist < INTERSECTION_SLOW_DIST && intersectionKey) {
      const reservation = this.intersections.get(intersectionKey);
      if (reservation && reservation.vehiclePoolIdx !== v.poolIdx) {
        shouldBrakeForIntersection = true;
        leaderGap = Math.min(leaderGap, Math.max(0, intersectionDist - TILE * 0.5));
      }
    }

    // IDM-lite speed control
    const desiredGap = MIN_GAP + v.speed * HEADWAY_TIME;

    if (leaderGap < desiredGap || shouldBrakeForIntersection) {
      const gapRatio = Math.max(0, leaderGap / desiredGap);
      const decel = typeDef.comfortDecel * (1 - gapRatio * gapRatio);
      v.speed = Math.max(0, v.speed - decel * dt);
    } else {
      const speedRatio = v.speed / v.desiredSpeed;
      const accel = typeDef.maxAccel * (1 - speedRatio * speedRatio);
      v.speed = Math.min(v.desiredSpeed, v.speed + accel * dt);
    }

    // Move along lane
    v.travelPos += sign * v.speed * dt;

    // Check for intersection arrival — only if we haven't already turned here
    if (intersectionDist < TILE * 0.3 && v.speed > 0.5 && intersectionKey &&
        intersectionKey !== v.lastIntersectionKey) {
      const reservation = this.intersections.get(intersectionKey);
      if (!reservation || reservation.vehiclePoolIdx === v.poolIdx) {
        this.beginTurn(v, intersectionKey);
      }
    }

    // Clear lastIntersectionKey when far from any intersection
    if (intersectionDist > TILE * 2) {
      v.lastIntersectionKey = '';
    }

    // Lane change check
    if (!v.laneChanging && Math.floor(this.clock * 2 + v.seed) % 5 === 0) {
      this.checkLaneChange(v, lane);
    }

    // Recycle at world edges
    const sceneX = v.worldX - this.gridX * CHUNK_SIZE;
    const sceneZ = v.worldZ - this.gridZ * CHUNK_SIZE;
    if (Math.abs(sceneX) > this.halfExtent * 1.5 ||
        Math.abs(sceneZ) > this.halfExtent * 1.5) {
      this.recycleVehicle(v);
    }

    // Target yaw from direction
    v.targetYaw = dirToYaw(v.dir);
  }

  // ─── Turning state ───

  private beginTurn(v: Vehicle, intersectionKey: string): void {
    // Mark this intersection so we don't re-trigger
    v.lastIntersectionKey = intersectionKey;

    // Reserve intersection
    this.intersections.set(intersectionKey, {
      vehiclePoolIdx: v.poolIdx,
      enterTime: this.clock,
    });

    // Decide turn direction
    v.seed = (v.seed * 16807) % 2147483647;
    const seedVal = (v.seed - 1) / 2147483646;
    const exitDir = decideTurn(v.dir, seedVal);

    // Find exit lane
    const exitLaneId = this.findExitLane(v, exitDir);
    if (!exitLaneId) {
      // Can't turn — release reservation and keep driving straight
      this.intersections.delete(intersectionKey);
      return;
    }

    const exitLane = this.lanes.get(exitLaneId);
    if (!exitLane) {
      this.intersections.delete(intersectionKey);
      return;
    }

    // Build turn arc using vehicle's CURRENT position as entry
    const iCenter = this.getIntersectionCenter(v);
    const laneOffset = v.laneIndex === 0 ? LANE_OFFSET : -LANE_OFFSET;
    const arc = buildTurnArc(iCenter.x, iCenter.z, v.dir, exitDir, laneOffset);

    // Override arc entry point with vehicle's actual position to prevent teleport
    arc.p0x = v.worldX;
    arc.p0z = v.worldZ;

    const arcLen = bezierLength(arc);

    // Remove from current lane
    const oldLane = this.lanes.get(v.laneId);
    if (oldLane) {
      const idx = oldLane.vehicles.indexOf(v);
      if (idx >= 0) oldLane.vehicles.splice(idx, 1);
    }

    v.state = 'turning';
    v.turnArc = arc;
    v.turnT = 0;
    v.turnLength = Math.max(arcLen, 1);
    v.turnExitDir = exitDir;
    v.turnExitLaneId = exitLaneId;
    v.turnExitRoadPos = exitLane.roadWorldPos;

    // Compute exit travelPos
    if (exitLane.axis === 'NS') {
      v.turnExitTravelPos = iCenter.z;
    } else {
      v.turnExitTravelPos = iCenter.x;
    }
  }

  private updateTurning(v: Vehicle, dt: number): void {
    if (!v.turnArc) return;

    // Progress along arc based on current speed
    const progress = (v.speed * dt) / v.turnLength;
    v.turnT = Math.min(1, v.turnT + progress);

    // Gentle slowdown through turn
    const turnSpeedFactor = 0.6 + 0.4 * Math.sin(v.turnT * Math.PI);
    v.speed = Math.max(3, v.desiredSpeed * 0.5 * turnSpeedFactor + v.desiredSpeed * 0.15);

    // Position from Bézier
    const pos = bezierPoint(v.turnArc, v.turnT);
    v.worldX = pos.x;
    v.worldZ = pos.z;

    // Yaw from tangent
    const tan = bezierTangent(v.turnArc, v.turnT);
    const tangentLen = Math.sqrt(tan.x * tan.x + tan.z * tan.z);
    if (tangentLen > 0.001) {
      v.targetYaw = Math.atan2(tan.x, tan.z);
    }

    // Turn complete
    if (v.turnT >= 1) {
      this.completeTurn(v);
    }
  }

  private completeTurn(v: Vehicle): void {
    const exitLane = this.lanes.get(v.turnExitLaneId);

    // Release intersection
    const iKey = this.getIntersectionKeyForVehicle(v);
    if (iKey) {
      const res = this.intersections.get(iKey);
      if (res && res.vehiclePoolIdx === v.poolIdx) {
        this.intersections.delete(iKey);
      }
    }

    v.state = 'driving';
    v.turnArc = null;
    v.dir = v.turnExitDir;
    v.targetYaw = dirToYaw(v.dir);
    v.yaw = v.targetYaw;
    v.steeringAngle = 0;

    if (exitLane) {
      v.laneId = exitLane.id;
      v.laneIndex = exitLane.laneIndex;
      v.roadWorldPos = exitLane.roadWorldPos;
      v.travelPos = v.turnExitTravelPos;
      // Mark this intersection so the vehicle doesn't immediately re-turn
      v.lastIntersectionKey = this.getIntersectionKeyForVehicle(v) ?? '';

      exitLane.vehicles.push(v);
      this.sortLane(exitLane);
    } else {
      this.recycleVehicle(v);
    }
  }

  private getTurnSteering(v: Vehicle): number {
    if (!v.turnArc || v.turnT >= 1) return 0;
    const t1 = Math.max(0, v.turnT - 0.05);
    const t2 = Math.min(1, v.turnT + 0.05);
    const tan1 = bezierTangent(v.turnArc, t1);
    const tan2 = bezierTangent(v.turnArc, t2);
    const yaw1 = Math.atan2(tan1.x, tan1.z);
    const yaw2 = Math.atan2(tan2.x, tan2.z);
    let diff = yaw2 - yaw1;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.max(-MAX_STEER, Math.min(MAX_STEER, diff * 5));
  }

  // ─── Intersection helpers ───

  private distanceToNextIntersection(v: Vehicle): number {
    const lane = this.lanes.get(v.laneId);
    if (!lane) return Infinity;

    const sign = (v.dir === 0 || v.dir === 2) ? 1 : -1;
    const pos = v.travelPos;

    // Convert to tile coord
    const tilePos = pos / TILE;
    let nextTile: number;

    if (sign > 0) {
      nextTile = Math.ceil(tilePos / ROAD_INTERVAL) * ROAD_INTERVAL;
      if (nextTile * TILE <= pos + 0.1) nextTile += ROAD_INTERVAL;
    } else {
      nextTile = Math.floor(tilePos / ROAD_INTERVAL) * ROAD_INTERVAL;
      if (nextTile * TILE >= pos - 0.1) nextTile -= ROAD_INTERVAL;
    }

    const nextPos = nextTile * TILE + TILE / 2;
    return Math.abs(nextPos - pos);
  }

  private nextIntersectionKey(v: Vehicle): string | null {
    const lane = this.lanes.get(v.laneId);
    if (!lane) return null;

    const sign = (v.dir === 0 || v.dir === 2) ? 1 : -1;
    const pos = v.travelPos;
    const tilePos = pos / TILE;

    let nextTile: number;
    if (sign > 0) {
      nextTile = Math.ceil(tilePos / ROAD_INTERVAL) * ROAD_INTERVAL;
      if (nextTile * TILE <= pos + 0.1) nextTile += ROAD_INTERVAL;
    } else {
      nextTile = Math.floor(tilePos / ROAD_INTERVAL) * ROAD_INTERVAL;
      if (nextTile * TILE >= pos - 0.1) nextTile -= ROAD_INTERVAL;
    }

    if (lane.axis === 'NS') {
      const roadTileX = Math.round((lane.roadWorldPos - TILE / 2) / TILE);
      return `${roadTileX}:${nextTile}`;
    } else {
      const roadTileZ = Math.round((lane.roadWorldPos - TILE / 2) / TILE);
      return `${nextTile}:${roadTileZ}`;
    }
  }

  private getIntersectionKeyForVehicle(v: Vehicle): string | null {
    const tileX = Math.round((v.worldX - TILE / 2) / TILE);
    const tileZ = Math.round((v.worldZ - TILE / 2) / TILE);
    const ix = Math.round(tileX / ROAD_INTERVAL) * ROAD_INTERVAL;
    const iz = Math.round(tileZ / ROAD_INTERVAL) * ROAD_INTERVAL;
    return `${ix}:${iz}`;
  }

  private getIntersectionCenter(v: Vehicle): { x: number; z: number } {
    const lane = this.lanes.get(v.laneId);
    if (!lane) return { x: v.worldX, z: v.worldZ };

    const sign = (v.dir === 0 || v.dir === 2) ? 1 : -1;
    const pos = v.travelPos;
    const tilePos = pos / TILE;

    let nextTile: number;
    if (sign > 0) {
      nextTile = Math.ceil(tilePos / ROAD_INTERVAL) * ROAD_INTERVAL;
      if (nextTile * TILE <= pos + 0.1) nextTile += ROAD_INTERVAL;
    } else {
      nextTile = Math.floor(tilePos / ROAD_INTERVAL) * ROAD_INTERVAL;
      if (nextTile * TILE >= pos - 0.1) nextTile -= ROAD_INTERVAL;
    }

    const centerAlongTravel = nextTile * TILE + TILE / 2;

    if (lane.axis === 'NS') {
      return { x: lane.roadWorldPos, z: centerAlongTravel };
    } else {
      return { x: centerAlongTravel, z: lane.roadWorldPos };
    }
  }

  private findExitLane(v: Vehicle, exitDir: DirIndex): string | null {
    const iCenter = this.getIntersectionCenter(v);

    if (exitDir === 0 || exitDir === 1) {
      // Exiting E-W
      const roadTileZ = Math.round((iCenter.z - TILE / 2) / TILE);
      const snappedZ = Math.round(roadTileZ / ROAD_INTERVAL) * ROAD_INTERVAL;
      const laneIdx = exitDir === 0 ? 0 : 1;
      const id = `EW:${snappedZ}:${laneIdx}`;
      return this.lanes.has(id) ? id : null;
    } else {
      // Exiting N-S
      const roadTileX = Math.round((iCenter.x - TILE / 2) / TILE);
      const snappedX = Math.round(roadTileX / ROAD_INTERVAL) * ROAD_INTERVAL;
      const laneIdx = exitDir === 2 ? 0 : 1;
      const id = `NS:${snappedX}:${laneIdx}`;
      return this.lanes.has(id) ? id : null;
    }
  }

  // ─── Lane change ───

  private checkLaneChange(v: Vehicle, lane: Lane): void {
    if (v.state !== 'driving') return;

    const sign = (v.dir === 0 || v.dir === 2) ? 1 : -1;
    const myIdx = lane.vehicles.indexOf(v);
    if (myIdx < 0) return;

    let leaderSpeed = v.desiredSpeed;

    if (sign > 0 && myIdx < lane.vehicles.length - 1) {
      leaderSpeed = lane.vehicles[myIdx + 1].speed;
    } else if (sign < 0 && myIdx > 0) {
      leaderSpeed = lane.vehicles[myIdx - 1].speed;
    } else {
      return;
    }

    if (leaderSpeed > v.desiredSpeed * 0.5) return;

    // Find opposite lane
    const otherLaneIdx: 0 | 1 = v.laneIndex === 0 ? 1 : 0;
    const parts = v.laneId.split(':');
    const otherLaneId = `${parts[0]}:${parts[1]}:${otherLaneIdx}`;
    const otherLane = this.lanes.get(otherLaneId);
    if (!otherLane) return;

    // Check gap in other lane
    const safeGap = MIN_GAP * 2;
    for (const other of otherLane.vehicles) {
      if (Math.abs(other.travelPos - v.travelPos) < safeGap) {
        return;
      }
    }

    // Execute lane change
    const oldLaneOffset = v.laneIndex === 0 ? LANE_OFFSET : -LANE_OFFSET;
    const newLaneOffset = otherLaneIdx === 0 ? LANE_OFFSET : -LANE_OFFSET;

    const idx = lane.vehicles.indexOf(v);
    if (idx >= 0) lane.vehicles.splice(idx, 1);

    v.laneChanging = true;
    v.laneChangeT = 0;
    v.laneChangeFrom = oldLaneOffset;
    v.laneChangeTo = newLaneOffset;
    v.laneId = otherLaneId;
    v.laneIndex = otherLaneIdx;

    otherLane.vehicles.push(v);
    this.sortLane(otherLane);
  }

  // ─── World position update ───

  private updateWorldPosFromLane(v: Vehicle): void {
    const lane = this.lanes.get(v.laneId);
    if (!lane) return;

    let laneOffset: number;
    if (v.laneChanging) {
      v.laneChangeT += 0.02;  // ~1.5s at 60fps
      if (v.laneChangeT >= 1) {
        v.laneChanging = false;
        v.laneChangeT = 1;
      }
      laneOffset = v.laneChangeFrom + (v.laneChangeTo - v.laneChangeFrom) * v.laneChangeT;
    } else {
      laneOffset = v.laneIndex === 0 ? LANE_OFFSET : -LANE_OFFSET;
    }

    if (lane.axis === 'NS') {
      v.worldX = lane.roadWorldPos + laneOffset;
      v.worldZ = v.travelPos;
    } else {
      v.worldX = v.travelPos;
      v.worldZ = lane.roadWorldPos + laneOffset;
    }
  }

  // ─── Apply to 3D pool ───

  private applyToPool(v: Vehicle, visible: boolean): void {
    if (v.poolIdx >= this.pool.length) return;
    const entry = this.pool[v.poolIdx];

    if (!visible) {
      entry.group.visible = false;
      return;
    }

    entry.group.visible = true;

    // Convert world position to scene-local
    const sceneX = v.worldX - this.gridX * CHUNK_SIZE;
    const sceneZ = v.worldZ - this.gridZ * CHUNK_SIZE;

    entry.group.position.set(sceneX, VEHICLE_Y, sceneZ);
    entry.group.rotation.set(0, v.yaw, 0);

    // Wheel animations
    const wheels = entry.wheels;
    if (wheels.length >= 4) {
      // FL, FR — roll + steering
      wheels[0].rotation.set(v.wheelRoll, v.steeringAngle, 0);
      wheels[1].rotation.set(v.wheelRoll, v.steeringAngle, 0);
      // RL, RR — roll only
      wheels[2].rotation.set(v.wheelRoll, 0, 0);
      wheels[3].rotation.set(v.wheelRoll, 0, 0);
    }
  }

  // ─── Public API ───

  /** Legacy compat — no-op, use onGridShift() */
  respawn(): void {}

  getVehicleCount(): number {
    return this.vehicles.length;
  }

  dispose(): void {
    for (const entry of this.pool) {
      if (this.parent) this.parent.remove(entry.group);
      entry.body.geometry.dispose();
      const m = entry.body.material;
      if (Array.isArray(m)) m.forEach(x => x.dispose());
      else (m as THREE.Material).dispose();

      for (const w of entry.wheels) {
        if (w instanceof THREE.Mesh) {
          w.geometry.dispose();
          const wm = w.material;
          if (Array.isArray(wm)) wm.forEach(x => x.dispose());
          else (wm as THREE.Material).dispose();
        }
      }
    }
    this.pool = [];
    this.vehicles = [];
    this.lanes.clear();
    this.templates = [];
    this.intersections.clear();
    this.loaded = false;
  }
}
