/**
 * CityRenderer3D - Main Three.js scene manager
 *
 * Lifecycle: init() → update() → render() (RAF loop) → dispose()
 * Coordinates all Three.js subsystems: camera, chunks, buildings, picking, lighting,
 * 3D model loading, post-processing, visual effects, and dynamic sky.
 *
 * Pure 3D pipeline — no 2D sprite atlas dependency.
 */

import * as THREE from 'three';
import { ThreeCamera } from './ThreeCamera';
import { ThreeChunks } from './ThreeChunks';
import { ThreePicking } from './ThreePicking';
import { ThreeModelLoader } from './ThreeModelLoader';
import { ThreePostProcessing } from './ThreePostProcessing';
import { ThreeEffects } from './ThreeEffects';
import { ThreeSky } from './ThreeSky';
import {
  buildBuildingGroup3D,
  disposeBuildingGroup3D,
  type BuildingGroup3D,
} from './ThreeBuildings3D';
import { ThreeBattleEffects, type BattleEffectInput, type AgentPositionMap } from './ThreeBattleEffects';
import { ThreeTradeEffects, type TradeEffectEvent, type ActiveOfferMarker, type ProsperityData } from './ThreeTradeEffects';
import {
  BACKGROUND_COLOR,
  LIGHTING,
  TIME_PHASE_LIGHTING,
  TILE_SIZE,
} from './ThreeConfig';
import type { RenderableBuilding, RenderableParcel, MapData, MapObject, TimePhase } from '../types';

export interface HoverState {
  gridX: number;
  gridY: number;
  blockX: number;
  blockY: number;
  isInParcel: boolean;
  buildingId: string | null;
  mouseX: number;
  mouseY: number;
}

export interface ClickState {
  gridX: number;
  gridY: number;
  blockX: number;
  blockY: number;
  buildingId: string | null;
}

export interface CityRenderer3DCallbacks {
  onHover?: (hover: HoverState | null) => void;
  onClick?: (click: ClickState) => void;
}

// Lighting target for smooth interpolation
interface LightingTarget {
  ambientColor: THREE.Color;
  ambientIntensity: number;
  dirColor: THREE.Color;
  dirIntensity: number;
  fogColor: THREE.Color;
  fogDensity: number;
}

// Fog density per time phase
const FOG_DENSITY: Record<string, number> = {
  morning: 0.0015,
  day: 0.0012,
  evening: 0.002,
  night: 0.003,
};

export class CityRenderer3D {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private cameraController!: ThreeCamera;
  private chunks!: ThreeChunks;
  private picking!: ThreePicking;
  private modelLoader!: ThreeModelLoader;
  private postProcessing!: ThreePostProcessing;
  private effects!: ThreeEffects;
  private sky!: ThreeSky;
  private ambientLight!: THREE.AmbientLight;
  private dirLight!: THREE.DirectionalLight;

  private buildingGroup: BuildingGroup3D | null = null;
  private parcelGroundGroup: THREE.Group | null = null;
  private battleEffects: ThreeBattleEffects | null = null;
  private tradeEffects: ThreeTradeEffects | null = null;

  private container: HTMLElement | null = null;
  private rafId = 0;
  private disposed = false;
  private initialized = false;
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private mouseDownX = 0;
  private mouseDownY = 0;
  private callbacks: CityRenderer3DCallbacks = {};
  private resizeObserver: ResizeObserver | null = null;
  private clock = new THREE.Clock();
  private lastFrameTime = 0;

  // Smooth lighting interpolation
  private lightingTarget: LightingTarget | null = null;

  // Camera fly-to target
  private flyToTarget: { x: number; z: number } | null = null;

  // Cached data
  private currentBuildings: RenderableBuilding[] = [];
  private currentParcels: RenderableParcel[] = [];
  private currentTimePhase: TimePhase = 'day';
  private currentWorldId: string | undefined;
  private hasCentered = false;
  private buildingUpdatePending = false;

  /**
   * Initialize the renderer and attach to a DOM element
   */
  async init(container: HTMLElement, callbacks?: CityRenderer3DCallbacks): Promise<void> {
    this.container = container;
    this.callbacks = callbacks || {};

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setClearColor(BACKGROUND_COLOR);
    this.renderer.sortObjects = true;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.LinearToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();

    // Fog (exponential for medieval atmosphere)
    this.scene.fog = new THREE.FogExp2(0x4a3e2e, 0.0012);

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    this.cameraController = new ThreeCamera(aspect);
    this.scene.add(this.cameraController.getRig());

    // Sky dome (before lights so it renders behind everything)
    this.sky = new ThreeSky();
    this.scene.add(this.sky.getMesh());

    // Lighting
    this.ambientLight = new THREE.AmbientLight(
      LIGHTING.ambient.color,
      LIGHTING.ambient.intensity,
    );
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(
      LIGHTING.directional.color,
      LIGHTING.directional.intensity,
    );
    this.dirLight.position.set(
      LIGHTING.directional.position.x,
      LIGHTING.directional.position.y,
      LIGHTING.directional.position.z,
    );
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 100;
    this.dirLight.shadow.camera.left = -50;
    this.dirLight.shadow.camera.right = 50;
    this.dirLight.shadow.camera.top = 50;
    this.dirLight.shadow.camera.bottom = -50;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // Chunks
    this.chunks = new ThreeChunks(this.scene);

    // Picking
    this.picking = new ThreePicking();
    this.scene.add(this.picking.getGroundPlane());

    // Model loader (3D assets)
    this.modelLoader = new ThreeModelLoader();
    await this.modelLoader.loadManifest();

    // Visual effects (smoke, lamps, trade routes)
    this.effects = new ThreeEffects();
    this.scene.add(this.effects.getGroup());

    // Battle effects (arrow volleys, territory borders, flashes)
    this.battleEffects = new ThreeBattleEffects();
    this.scene.add(this.battleEffects.getGroup());

    // Trade effects (particles, offer markers, prosperity glow)
    this.tradeEffects = new ThreeTradeEffects();
    this.scene.add(this.tradeEffects.getGroup());

    // Post-processing (bloom)
    this.postProcessing = new ThreePostProcessing(
      this.renderer,
      this.scene,
      this.cameraController.camera,
    );

    // Set initial time phase
    this.setTimePhase('day');

    // Event listeners
    this.setupEventListeners();

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);

    // Mark as initialized before starting render loop
    this.initialized = true;

    // Start render loop
    this.clock.start();
    this.lastFrameTime = this.clock.getElapsedTime();
    this.renderLoop();
  }

  /**
   * Update map data from React state
   */
  updateData(
    mapData: MapData | null,
    parcels: RenderableParcel[],
    buildings: RenderableBuilding[],
    _objects: MapObject[],
    timePhase?: TimePhase,
    worldId?: string,
  ): void {
    if (this.disposed || !this.initialized) return;

    const mapWidth = mapData?.width ?? 300;
    const mapHeight = mapData?.height ?? 300;

    if (!this.hasCentered) {
      console.log('[Three.js] updateData: map=%dx%d, parcels=%d, buildings=%d',
        mapWidth, mapHeight, parcels.length, buildings.length);
    }

    // Update chunks with new map data
    this.chunks.setMapData(mapWidth, mapHeight, parcels);

    // Center camera on first data load
    if (mapData && !this.hasCentered) {
      const centerX = mapData.cityCenter?.x ?? 25;
      const centerY = mapData.cityCenter?.y ?? 25;
      this.cameraController.setPan(
        centerX * TILE_SIZE,
        centerY * TILE_SIZE,
      );
      this.hasCentered = true;
    }

    // Track world ID for neon emissive
    this.currentWorldId = worldId;

    // Update buildings if changed (async with 3D models)
    if (buildings !== this.currentBuildings && !this.buildingUpdatePending) {
      this.buildingUpdatePending = true;
      this.updateBuildings(buildings).then(() => {
        this.buildingUpdatePending = false;
      });
    }

    // Track parcels and rebuild ground fill when changed
    if (parcels !== this.currentParcels) {
      this.currentParcels = parcels;
      this.updateParcelGroundFill(parcels);
    }

    // Update lighting for time phase
    if (timePhase && timePhase !== this.currentTimePhase) {
      this.setTimePhase(timePhase);
      this.currentTimePhase = timePhase;
    }
  }

  /**
   * Async building update — loads 3D models then swaps the building group
   */
  private async updateBuildings(buildings: RenderableBuilding[]): Promise<void> {
    const newGroup = await buildBuildingGroup3D(
      buildings,
      this.modelLoader,
      this.currentWorldId,
    );

    if (this.disposed) {
      disposeBuildingGroup3D(newGroup);
      return;
    }

    // Swap
    if (this.buildingGroup) {
      this.scene.remove(this.buildingGroup.group);
      disposeBuildingGroup3D(this.buildingGroup);
    }

    this.buildingGroup = newGroup;
    this.scene.add(this.buildingGroup.group);
    this.currentBuildings = buildings;

    // Update effects with new building data
    this.effects.setupSmoke(buildings);
    this.effects.setupLamps(buildings);
  }

  /**
   * Place base.gltf tiles on all parcel areas to fill empty ground
   */
  private async updateParcelGroundFill(parcels: RenderableParcel[]): Promise<void> {
    if (this.disposed || !this.modelLoader) return;

    // Remove old ground fill
    if (this.parcelGroundGroup) {
      this.scene.remove(this.parcelGroundGroup);
      this.parcelGroundGroup.traverse((child) => {
        if (child instanceof THREE.InstancedMesh || child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const mat of mats) mat.dispose();
        }
      });
      this.parcelGroundGroup = null;
    }

    if (parcels.length === 0) return;

    // Ensure manifest is loaded
    await this.modelLoader.loadManifest();

    // Build a set of occupied tiles (where buildings already exist)
    const occupiedTiles = new Set<string>();
    for (const b of this.currentBuildings) {
      const entry = this.modelLoader.getTypeEntry(b.type);
      const fw = entry?.footprint?.[0] ?? 1;
      const fh = entry?.footprint?.[1] ?? 1;
      for (let dy = 0; dy < fh; dy++) {
        for (let dx = 0; dx < fw; dx++) {
          occupiedTiles.add(`${b.coords.x + dx},${b.coords.y + dy}`);
        }
      }
    }

    // Collect decoration placements per environment model type
    const placements: Record<string, Array<{ x: number; z: number; rotY: number }>> = {
      tree: [], grass: [], stone: [], torch: [],
    };

    // Import terrain decoration config
    const { TERRAIN_DECORATION_CONFIG } = await import('@agentropolis/shared');

    for (const parcel of parcels) {
      const terrain = (parcel.terrain ?? 'plains') as import('@agentropolis/shared').TerrainType;
      const rule = TERRAIN_DECORATION_CONFIG[terrain];
      if (!rule) continue;

      const { x: bx, y: by, width, height } = parcel.bounds;

      // Seeded RNG from parcel ID for deterministic decoration
      let seed = 0;
      for (let i = 0; i < parcel.id.length; i++) {
        seed = ((seed << 5) - seed + parcel.id.charCodeAt(i)) | 0;
      }
      const rng = () => {
        seed = (seed * 1664525 + 1013904223) | 0;
        return (seed >>> 0) / 4294967296;
      };

      // Edge tiles: torches at parcel borders for visual boundary
      const isEdge = (lx: number, ly: number) =>
        (lx === 0 || lx === width - 1 || ly === 0 || ly === height - 1);

      for (let ly = 0; ly < height; ly++) {
        for (let lx = 0; lx < width; lx++) {
          const gx = bx + lx;
          const gy = by + ly;

          // Skip occupied tiles (buildings)
          if (occupiedTiles.has(`${gx},${gy}`)) continue;

          const worldX = gx * TILE_SIZE;
          const worldZ = gy * TILE_SIZE;

          // Edge tiles: sparse torches for parcel boundary markers
          if (isEdge(lx, ly)) {
            if (rule.borderTorchChance > 0 && rng() < rule.borderTorchChance) {
              placements.torch.push({ x: worldX, z: worldZ, rotY: rng() * Math.PI * 2 });
            }
            continue;
          }

          // Regular empty tiles: terrain-weighted decoration
          if (rng() > rule.density) continue;

          // Weighted random selection
          const entries = Object.entries(rule.weights) as Array<[string, number]>;
          const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
          let roll = rng() * totalWeight;
          let selectedModel = entries[0]?.[0] ?? 'grass';
          for (const [key, w] of entries) {
            roll -= w;
            if (roll <= 0) { selectedModel = key; break; }
          }

          if (placements[selectedModel]) {
            placements[selectedModel].push({
              x: worldX + (rng() - 0.5) * TILE_SIZE * 0.4,
              z: worldZ + (rng() - 0.5) * TILE_SIZE * 0.4,
              rotY: rng() * Math.PI * 2,
            });
          }
        }
      }
    }

    // Create instanced meshes for each environment model type
    const group = new THREE.Group();
    group.name = 'parcel_ground_fill';

    for (const [envType, positions] of Object.entries(placements)) {
      if (positions.length === 0) continue;

      // Load one template model for this env type
      const template = await this.modelLoader.loadEnvironment(envType, 0);
      if (!template || this.disposed) continue;

      // Extract meshes from template
      const meshes: Array<{ geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }> = [];
      template.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          meshes.push({ geometry: child.geometry, material: child.material });
        }
      });

      if (meshes.length === 0) continue;

      const templateScale = template.scale.x;
      const dummy = new THREE.Object3D();

      for (const { geometry, material } of meshes) {
        const instancedMesh = new THREE.InstancedMesh(geometry, material, positions.length);
        instancedMesh.castShadow = envType === 'tree';
        instancedMesh.receiveShadow = true;

        for (let i = 0; i < positions.length; i++) {
          const p = positions[i];
          dummy.position.set(p.x, 0, p.z);
          dummy.rotation.set(0, p.rotY, 0);
          // Slight scale variation for natural look
          const scaleVar = templateScale * (0.8 + (((p.x * 73 + p.z * 137) >>> 0) % 100) / 250);
          dummy.scale.setScalar(scaleVar);
          dummy.updateMatrix();
          instancedMesh.setMatrixAt(i, dummy.matrix);
        }

        instancedMesh.instanceMatrix.needsUpdate = true;
        group.add(instancedMesh);
      }
    }

    if (group.children.length > 0) {
      this.parcelGroundGroup = group;
      this.scene.add(group);
      console.log(`[Three.js] Ground fill: placed decorations for ${parcels.length} parcels`);
    }
  }

  /**
   * Set time phase — sets targets for smooth interpolation
   */
  private setTimePhase(phase: TimePhase): void {
    const preset = TIME_PHASE_LIGHTING[phase];
    if (!preset) return;

    // Set lighting targets — actual lerping happens in renderLoop
    this.lightingTarget = {
      ambientColor: new THREE.Color(preset.ambientColor),
      ambientIntensity: preset.ambientIntensity,
      dirColor: new THREE.Color(preset.dirColor),
      dirIntensity: preset.dirIntensity,
      fogColor: new THREE.Color(preset.fogColor),
      fogDensity: FOG_DENSITY[phase] ?? 0.004,
    };

    // Update sun position based on phase
    this.updateSunPosition(phase);

    // Update bloom strength for time phase
    this.postProcessing.setTimePhase(phase);

    // Update effects (lamp intensity, smoke opacity)
    this.effects.setTimePhase(phase);

    // Update sky dome target
    this.sky.setTimePhase(phase);
  }

  /**
   * Move directional light to simulate sun position
   */
  private updateSunPosition(phase: TimePhase): void {
    const angles: Record<string, number> = {
      morning: Math.PI * 0.25,  // Low east
      day: Math.PI * 0.5,       // High overhead
      evening: Math.PI * 0.75,  // Low west
      night: Math.PI * 1.25,    // Below horizon (faint moonlight)
    };

    const angle = angles[phase] ?? Math.PI * 0.5;
    const radius = 40;
    const height = phase === 'night' ? 15 : 30 + Math.sin(angle) * 20;

    this.dirLight.position.set(
      Math.cos(angle) * radius,
      height,
      Math.sin(angle) * radius,
    );
    this.dirLight.target.position.set(0, 0, 0);
    this.dirLight.target.updateMatrixWorld();
  }

  /**
   * Smoothly interpolate lighting values each frame
   */
  private lerpLighting(dt: number): void {
    if (!this.lightingTarget) return;

    const factor = Math.min(1.0, dt * 1.5); // ~0.7s transition

    this.ambientLight.color.lerp(this.lightingTarget.ambientColor, factor);
    this.ambientLight.intensity = THREE.MathUtils.lerp(
      this.ambientLight.intensity,
      this.lightingTarget.ambientIntensity,
      factor,
    );

    this.dirLight.color.lerp(this.lightingTarget.dirColor, factor);
    this.dirLight.intensity = THREE.MathUtils.lerp(
      this.dirLight.intensity,
      this.lightingTarget.dirIntensity,
      factor,
    );

    // Fog
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.lerp(this.lightingTarget.fogColor, factor);
      this.scene.fog.density = THREE.MathUtils.lerp(
        this.scene.fog.density,
        this.lightingTarget.fogDensity,
        factor,
      );
    }
  }

  /**
   * Setup mouse/touch event listeners
   */
  private setupEventListeners(): void {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('mouseleave', this.onMouseLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.style.cursor = 'grab';
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.mouseDownX = e.clientX;
      this.mouseDownY = e.clientY;
      this.cameraController.stopInertia();
      this.renderer.domElement.style.cursor = 'grabbing';
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.isDragging) {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.cameraController.pan(dx, dy);
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const pick = this.picking.pick(
      x, y,
      rect.width, rect.height,
      this.cameraController.camera,
    );

    if (pick) {
      let buildingId: string | null = null;
      if (this.buildingGroup) {
        const buildingPick = this.picking.pickBuilding(
          x, y,
          rect.width, rect.height,
          this.cameraController.camera,
          this.buildingGroup.group,
        );
        buildingId = buildingPick?.buildingId ?? null;
      }

      this.callbacks.onHover?.({
        gridX: pick.gridX,
        gridY: pick.gridY,
        blockX: pick.blockX,
        blockY: pick.blockY,
        isInParcel: pick.isInParcel,
        buildingId,
        mouseX: e.clientX,
        mouseY: e.clientY,
      });
    } else {
      this.callbacks.onHover?.(null);
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    // Detect click: mouseup within 5px of mousedown position
    const dx = e.clientX - this.mouseDownX;
    const dy = e.clientY - this.mouseDownY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 5 && this.callbacks.onClick) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const pick = this.picking.pick(
        x, y,
        rect.width, rect.height,
        this.cameraController.camera,
      );

      if (pick) {
        let buildingId: string | null = null;
        if (this.buildingGroup) {
          const buildingPick = this.picking.pickBuilding(
            x, y,
            rect.width, rect.height,
            this.cameraController.camera,
            this.buildingGroup.group,
          );
          buildingId = buildingPick?.buildingId ?? null;
        }

        this.callbacks.onClick({
          gridX: pick.gridX,
          gridY: pick.gridY,
          blockX: pick.blockX,
          blockY: pick.blockY,
          buildingId,
        });
      }
    }

    this.isDragging = false;
    this.renderer.domElement.style.cursor = 'grab';
  };

  private onMouseLeave = (): void => {
    this.isDragging = false;
    this.renderer.domElement.style.cursor = 'grab';
    this.callbacks.onHover?.(null);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    // Zoom is locked at 500% — scroll disabled
  };

  /**
   * Handle container resize
   */
  private onResize(): void {
    if (!this.container || this.disposed || !this.initialized) return;

    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    this.renderer.setSize(w, h);
    this.cameraController.resize(w, h);
    this.postProcessing.resize(w, h);
  }

  /**
   * Main render loop
   */
  private renderLoop = (): void => {
    if (this.disposed || !this.initialized) return;

    const elapsed = this.clock.getElapsedTime();
    const dt = elapsed - this.lastFrameTime;
    this.lastFrameTime = elapsed;

    // Apply camera inertia + smooth zoom
    this.cameraController.applyInertia();

    // Smooth fly-to
    if (this.flyToTarget) {
      const camState = this.cameraController.getState();
      const dx = this.flyToTarget.x - camState.panX;
      const dz = this.flyToTarget.z - camState.panZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 0.1) {
        this.cameraController.setPan(this.flyToTarget.x, this.flyToTarget.z);
        this.flyToTarget = null;
      } else {
        const lerpFactor = Math.min(1.0, dt * 3.0);
        this.cameraController.setPan(
          camState.panX + dx * lerpFactor,
          camState.panZ + dz * lerpFactor,
        );
      }
    }

    // Update chunk streaming based on camera position
    const camState = this.cameraController.getState();
    this.chunks.update(camState.panX, camState.panZ);

    // Smooth lighting transitions
    this.lerpLighting(dt);

    // Update sky dome (smooth color transitions + star twinkle)
    this.sky.update(elapsed, dt);
    this.sky.followCamera(this.cameraController.getRig());

    // Update visual effects (smoke, trade routes)
    this.effects.update(elapsed);

    // Update battle effects (arrow volleys, territory borders, flash fade)
    this.battleEffects?.update(elapsed);

    // Update trade effects (particles, diamond bob)
    this.tradeEffects?.update(elapsed);

    // Render with post-processing (bloom)
    this.postProcessing.render();

    this.rafId = requestAnimationFrame(this.renderLoop);
  };

  /**
   * Update battle visual effects from socket state
   */
  updateBattleState(
    activeBattles: BattleEffectInput[],
    agentPositions: AgentPositionMap,
  ): void {
    this.battleEffects?.updateBattleState(activeBattles, agentPositions);
  }

  /**
   * Trigger a battle flash effect (victory/defeat)
   */
  triggerBattleFlash(position: { x: number; z: number }, isVictory: boolean): void {
    this.battleEffects?.triggerBattleFlash(position, isVictory);
  }

  /**
   * Trigger trade completion particle effect
   */
  triggerTradeEffect(event: TradeEffectEvent, agentPositions: AgentPositionMap): void {
    this.tradeEffects?.triggerTradeEffect(event, agentPositions);
  }

  /**
   * Update active offer diamond markers
   */
  updateOfferMarkers(offers: ActiveOfferMarker[], agentPositions: AgentPositionMap): void {
    this.tradeEffects?.updateOfferMarkers(offers, agentPositions);
  }

  /**
   * Smooth camera fly-to a world position
   */
  flyTo(worldX: number, worldZ: number): void {
    this.flyToTarget = { x: worldX, z: worldZ };
  }

  /**
   * Update prosperity ground glow
   */
  updateProsperityGlow(data: ProsperityData[], agentPositions: AgentPositionMap): void {
    this.tradeEffects?.updateProsperityGlow(data, agentPositions);
  }

  /**
   * Get current camera zoom percentage
   */
  getZoomPercent(): number {
    return Math.round(this.cameraController.getState().zoom * 100);
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.disposed = true;
    this.initialized = false;
    cancelAnimationFrame(this.rafId);

    if (!this.renderer) return;
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('mousedown', this.onMouseDown);
    canvas.removeEventListener('mousemove', this.onMouseMove);
    canvas.removeEventListener('mouseup', this.onMouseUp);
    canvas.removeEventListener('mouseleave', this.onMouseLeave);
    canvas.removeEventListener('wheel', this.onWheel);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.chunks?.disposeAll();
    this.picking?.dispose();
    this.modelLoader?.dispose();
    this.postProcessing?.dispose();
    this.effects?.dispose();
    this.battleEffects?.dispose();
    this.tradeEffects?.dispose();
    this.sky?.dispose();

    if (this.buildingGroup) {
      disposeBuildingGroup3D(this.buildingGroup);
    }
    if (this.parcelGroundGroup) {
      this.parcelGroundGroup.traverse((child) => {
        if (child instanceof THREE.InstancedMesh || child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const mat of mats) mat.dispose();
        }
      });
    }

    this.renderer.dispose();
    if (this.container && this.renderer.domElement.parentNode) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
