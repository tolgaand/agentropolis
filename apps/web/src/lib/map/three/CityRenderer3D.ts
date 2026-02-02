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
import { ThreePostProcessing } from './ThreePostProcessing';
import { ThreeEffects } from './ThreeEffects';
import { ThreeSky } from './ThreeSky';
import { ThreeParcelBorders } from './ThreeParcelBorders';
import { ThreeFactionIndicators } from './ThreeFactionIndicators';
import { ThreeAgents } from './ThreeAgents';
import { buildParcelDecorations, disposeDecorationGroup, type DecorationGroup } from './ThreeDecorations';
import {
  buildBuildingGroup3D,
  disposeBuildingGroup3D,
  type BuildingGroup3D,
} from './ThreeBuildings3D';
import { ThreeBattleEffects, type BattleEffectInput, type AgentPositionMap } from './ThreeBattleEffects';
import { ThreeTradeEffects, type TradeEffectEvent, type ActiveOfferMarker, type ProsperityData } from './ThreeTradeEffects';
import { ThreeArmyMarches, type MarchingArmyData } from './ThreeArmyMarches';
import { ThreeFloatingText, type FloatingTextOptions } from './ThreeFloatingText';
import { ThreeCaptureEffects, type ContestedParcel } from './ThreeCaptureEffects';
import {
  BACKGROUND_COLOR,
  LIGHTING,
  TIME_PHASE_LIGHTING,
  TILE_SIZE,
  CAMERA_ZOOM_COMFORTABLE,
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

// Fog density per time phase (reduced for better visibility)
const FOG_DENSITY: Record<string, number> = {
  morning: 0.0009,
  day: 0.0007,
  evening: 0.0012,
  night: 0.0018,
};

export class CityRenderer3D {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private cameraController!: ThreeCamera;
  private chunks!: ThreeChunks;
  private picking!: ThreePicking;
  private postProcessing!: ThreePostProcessing;
  private effects!: ThreeEffects;
  private sky!: ThreeSky;
  private ambientLight!: THREE.AmbientLight;
  private dirLight!: THREE.DirectionalLight;

  private buildingGroup: BuildingGroup3D | null = null;
  private parcelGroundGroup: THREE.Group | null = null;
  private parcelDecorations: Map<string, DecorationGroup> = new Map();
  private parcelBorders!: ThreeParcelBorders;
  private factionIndicators!: ThreeFactionIndicators;
  private agents!: ThreeAgents;
  private battleEffects: ThreeBattleEffects | null = null;
  private tradeEffects: ThreeTradeEffects | null = null;
  private armyMarches: ThreeArmyMarches | null = null;
  private floatingText: ThreeFloatingText | null = null;
  private captureEffects: ThreeCaptureEffects | null = null;

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

  // Idle detection for performance
  private lastCameraPanX = 0;
  private lastCameraPanZ = 0;
  private lastCameraZoom = 1;
  private lastRenderTime = 0;

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
  // DISABLED: parcelBordersUpdatePending (parcel borders now handled by ProceduralBuildings)
  // private parcelBordersUpdatePending = false;
  private introAnimationStartTime = 0;
  private introAnimationComplete = false;

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

    // Fog (exponential for medieval atmosphere, dark to match base ground)
    this.scene.fog = new THREE.FogExp2(0x1a150e, 0.0008);

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

    // Visual effects (smoke, lamps, trade routes)
    this.effects = new ThreeEffects();
    this.scene.add(this.effects.getGroup());

    // Battle effects (arrow volleys, territory borders, flashes)
    this.battleEffects = new ThreeBattleEffects();
    this.scene.add(this.battleEffects.getGroup());

    // Trade effects (particles, offer markers, prosperity glow)
    this.tradeEffects = new ThreeTradeEffects();
    this.scene.add(this.tradeEffects.getGroup());

    // Army marches (marching armies visualization)
    this.armyMarches = new ThreeArmyMarches(this.scene);

    // Floating text (Metin2-style damage/reward popups)
    this.floatingText = new ThreeFloatingText(this.scene);

    // Capture effects (contested parcel visualization)
    this.captureEffects = new ThreeCaptureEffects();
    this.scene.add(this.captureEffects.getGroup());

    // Parcel borders (3D fences/walls)
    this.parcelBorders = new ThreeParcelBorders();
    this.scene.add(this.parcelBorders.getGroup());

    // Faction territory indicators (ground overlays + banner poles)
    this.factionIndicators = new ThreeFactionIndicators(this.scene);

    // Agent pawns (3D pawn-shaped markers for each agent)
    this.agents = new ThreeAgents(this.scene);

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

    // Camera intro: center on parcel centroid (where the action is)
    // Only center once we have parcels loaded - don't use fallback positioning
    if (!this.hasCentered && mapData && parcels.length > 0) {
      // Center on centroid of all parcels
      let sumX = 0, sumZ = 0;
      for (const p of parcels) {
        sumX += p.bounds.x + (p.bounds.width - 1) / 2;
        sumZ += p.bounds.y + (p.bounds.height - 1) / 2;
      }
      const centerX = sumX / parcels.length;
      const centerZ = sumZ / parcels.length;

      this.cameraController.setPan(
        centerX * TILE_SIZE,
        centerZ * TILE_SIZE,
      );

      this.hasCentered = true;
      this.introAnimationStartTime = this.clock.getElapsedTime();
      console.log(`[Three.js] Camera centered on parcels centroid: (${centerX.toFixed(0)}, ${centerZ.toFixed(0)}), ${parcels.length} parcels`);
    }

    // Track world ID for neon emissive
    this.currentWorldId = worldId;

    // Update buildings if changed (async with 3D models)
    if (buildings !== this.currentBuildings && !this.buildingUpdatePending) {
      this.buildingUpdatePending = true;
      this.updateBuildings(buildings, parcels).then(() => {
        this.buildingUpdatePending = false;
      });
    }

    // Track parcels and rebuild ground fill when changed
    if (parcels !== this.currentParcels) {
      this.currentParcels = parcels;
      this.updateParcelGroundFill(parcels);

      // DISABLED: Parcel borders now handled by ProceduralBuildings compound system
      // Each compound creates its own perimeter (fences/walls/torches) based on theme
      // if (!this.parcelBordersUpdatePending) {
      //   this.parcelBordersUpdatePending = true;
      //   this.parcelBorders.update(parcels).then(() => {
      //     this.parcelBordersUpdatePending = false;
      //   });
      // }

      // Update faction territory indicators (ground overlays + banner poles)
      this.factionIndicators.updateParcels(parcels as any);

      // Update agent pawns (one pawn per parcel owner)
      this.agents.updateAgents(parcels as any);

      // Update parcel decorations (props between buildings)
      this.updateParcelDecorations(parcels);
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
  private async updateBuildings(buildings: RenderableBuilding[], parcels?: RenderableParcel[]): Promise<void> {
    const newGroup = await buildBuildingGroup3D(
      buildings,
      this.currentWorldId,
      parcels,
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
   * Update parcel decorations (props between buildings)
   */
  private async updateParcelDecorations(parcels: RenderableParcel[]): Promise<void> {
    if (this.disposed) return;

    // Dispose old decorations
    for (const [, decorationGroup] of this.parcelDecorations) {
      this.scene.remove(decorationGroup.group);
      disposeDecorationGroup(decorationGroup);
    }
    this.parcelDecorations.clear();

    // Build new decorations for each parcel
    for (const parcel of parcels) {
      try {
        const decorationGroup = await buildParcelDecorations(
          parcel,
          this.currentBuildings,
        );

        if (decorationGroup.group.children.length > 0) {
          this.scene.add(decorationGroup.group);
          this.parcelDecorations.set(parcel.id, decorationGroup);
        }
      } catch (error) {
        console.warn(`[Three.js] Failed to build decorations for parcel ${parcel.id}:`, error);
      }
    }

    console.log(`[Three.js] Built decorations for ${this.parcelDecorations.size} parcels`);
  }

  /**
   * Place base.gltf tiles on all parcel areas to fill empty ground
   */
  private async updateParcelGroundFill(_parcels: RenderableParcel[]): Promise<void> {
    if (this.disposed) return;

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

    // GLTF loading removed - ground fill disabled until procedural decorations are implemented
    return;
  }

  /**
   * Add building-themed prop decorations to a parcel
   * TODO: Restore this method when prop decoration system is implemented
   */
  /* private addPropDecorations(
    parcel: RenderableParcel,
    occupiedTiles: Set<string>,
    placements: Record<string, Array<{ x: number; z: number; rotY: number }>>,
    rng: () => number,
  ): void {
    const { x: bx, y: by, width, height } = parcel.bounds;

    // Find buildings in this parcel
    const parcelBuildings = this.currentBuildings.filter(b => b.parcelId === parcel.id);
    if (parcelBuildings.length === 0) return;

    // Determine dominant building theme
    const typeCounts: Record<string, number> = {};
    for (const b of parcelBuildings) {
      typeCounts[b.type] = (typeCounts[b.type] ?? 0) + 1;
    }

    let maxCount = 0;
    let dominantType = '';
    for (const [type, count] of Object.entries(typeCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantType = type;
      }
    }

    // Collect empty interior tiles (not edges, not occupied)
    const emptyTiles: Array<{ x: number; y: number }> = [];
    for (let ly = 2; ly < height - 2; ly++) {
      for (let lx = 2; lx < width - 2; lx++) {
        const gx = bx + lx;
        const gy = by + ly;
        if (!occupiedTiles.has(`${gx},${gy}`)) {
          emptyTiles.push({ x: gx, y: gy });
        }
      }
    }

    if (emptyTiles.length === 0) return;

    // Place 1-3 prop clusters based on theme
    const clusterCount = Math.min(3, 1 + Math.floor(rng() * 3));

    for (let c = 0; c < clusterCount; c++) {
      if (emptyTiles.length === 0) break;

      const tileIdx = Math.floor(rng() * emptyTiles.length);
      const tile = emptyTiles.splice(tileIdx, 1)[0];

      const centerX = tile.x * TILE_SIZE;
      const centerZ = tile.y * TILE_SIZE;

      // Theme-based prop selection
      const props: string[] = [];

      if (dominantType === 'market') {
        // Market: stall + barrels/boxes
        if (rng() > 0.5) props.push('market');
        props.push('barrel', 'box');
        if (rng() > 0.5) props.push('sack');
      } else if (dominantType === 'farm' || dominantType === 'lumberyard') {
        // Farming: well + sacks/barrels
        if (rng() > 0.6) props.push('well');
        props.push('sack');
        if (rng() > 0.5) props.push('barrel');
      } else if (dominantType === 'barracks' || dominantType === 'watchtower') {
        // Military: supply depot with carts + crates
        props.push('cart', 'barrel', 'box');
      } else if (dominantType === 'stable') {
        // Stables: carts + hay
        props.push('cart');
        if (rng() > 0.5) props.push('sack');
      } else {
        // Residential: scattered barrels/boxes
        if (rng() > 0.6) props.push('barrel');
        if (rng() > 0.6) props.push('box');
      }

      // Place props in small cluster
      for (const propType of props) {
        const angle = rng() * Math.PI * 2;
        const radius = rng() * TILE_SIZE * 0.6;
        const x = centerX + Math.cos(angle) * radius;
        const z = centerZ + Math.sin(angle) * radius;
        const rotY = rng() * Math.PI * 2;

        if (placements[propType]) {
          placements[propType].push({ x, z, rotY });
        }
      }
    }

    // Add a few scattered small props
    const scatterCount = Math.min(3, Math.floor(emptyTiles.length * 0.05));
    for (let i = 0; i < scatterCount; i++) {
      if (emptyTiles.length === 0) break;

      const tileIdx = Math.floor(rng() * emptyTiles.length);
      const tile = emptyTiles.splice(tileIdx, 1)[0];

      const propType = ['barrel', 'box', 'sack'][Math.floor(rng() * 3)];
      const x = tile.x * TILE_SIZE + (rng() - 0.5) * TILE_SIZE * 0.4;
      const z = tile.y * TILE_SIZE + (rng() - 0.5) * TILE_SIZE * 0.4;
      const rotY = rng() * Math.PI * 2;

      if (placements[propType]) {
        placements[propType].push({ x, z, rotY });
      }
    }
  } */

  /**
   * Load decoration model (environment or building prop)
   * TODO: Restore this method when prop decoration system is implemented
   */
  /* private async loadDecorationModel(type: string): Promise<THREE.Group | null> {
    // Environment models (tree, grass, stone, torch)
    if (['tree', 'grass', 'stone', 'torch'].includes(type)) {
      return this.modelLoader.loadEnvironment(type, 0);
    }

    // Building props (load by node name)
    const nodeMap: Record<string, string> = {
      barrel: 'Barrel',
      box: 'Box',
      sack: 'Sack',
      cart: 'Cart',
      well: 'Well',
      market: 'Market_1', // Use Market_1 as default market stall
    };

    const nodeName = nodeMap[type];
    if (!nodeName) return null;

    // Use the new loadNodeByName method
    const scale = type === 'market' ? 0.6 : 0.4;
    return this.modelLoader.loadNodeByName(nodeName, scale);
  } */



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

    // Idle detection: skip rendering if nothing has changed and less than 100ms has passed
    const camState = this.cameraController.getState();
    const cameraChanged =
      Math.abs(camState.panX - this.lastCameraPanX) > 0.001 ||
      Math.abs(camState.panZ - this.lastCameraPanZ) > 0.001 ||
      Math.abs(camState.zoom - this.lastCameraZoom) > 0.001;

    const isIdle =
      !cameraChanged &&
      !this.flyToTarget &&
      !this.lightingTarget &&
      (elapsed - this.lastRenderTime) < 0.1;

    if (isIdle) {
      this.rafId = requestAnimationFrame(this.renderLoop);
      return;
    }

    // Update last camera state
    this.lastCameraPanX = camState.panX;
    this.lastCameraPanZ = camState.panZ;
    this.lastCameraZoom = camState.zoom;
    this.lastRenderTime = elapsed;

    // Camera intro animation: zoom from default (1.6) to comfortable (2.8) after 1 second
    if (!this.introAnimationComplete && this.hasCentered) {
      const introElapsed = elapsed - this.introAnimationStartTime;
      if (introElapsed >= 1.0) {
        // Start zoom animation
        this.cameraController.setTargetZoom(CAMERA_ZOOM_COMFORTABLE);
        // Check if zoom is complete
        const currentZoom = this.cameraController.getState().zoom;
        if (Math.abs(currentZoom - CAMERA_ZOOM_COMFORTABLE) < 0.01) {
          this.introAnimationComplete = true;
          console.log('[Three.js] Camera intro animation complete');
        }
      }
    }

    // Apply camera inertia + smooth zoom
    this.cameraController.applyInertia();

    // Smooth fly-to
    if (this.flyToTarget) {
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
    this.chunks.update(camState.panX, camState.panZ);

    // Update faction indicators LOD based on camera zoom
    this.factionIndicators.updateCamera(camState.zoom);

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

    // Update army marches (smooth interpolation)
    this.armyMarches?.animate(dt);

    // Update floating text animations (float-up + fade)
    this.floatingText?.animate(dt);

    // Update capture effects (pulse + progress)
    this.captureEffects?.animate(elapsed);

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
   * Update marching armies from socket state
   */
  updateMarchingArmies(armies: MarchingArmyData[]): void {
    this.armyMarches?.updateMarches(armies);
  }

  /**
   * Show floating text at world position (Metin2-style popup)
   */
  showFloatingText(options: FloatingTextOptions): void {
    this.floatingText?.spawn(options);
  }

  /**
   * Update contested parcels from socket state
   */
  updateContestedParcels(parcels: ContestedParcel[]): void {
    this.captureEffects?.updateContested(parcels);
  }

  /**
   * Get current camera zoom percentage
   */
  getZoomPercent(): number {
    return Math.round(this.cameraController.getState().zoom * 100);
  }

  /**
   * Set camera zoom level smoothly
   */
  setZoom(targetZoom: number): void {
    this.cameraController.setTargetZoom(targetZoom);
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
    this.postProcessing?.dispose();
    this.effects?.dispose();
    this.parcelBorders?.dispose();
    this.factionIndicators?.dispose();
    this.agents?.dispose();
    this.battleEffects?.dispose();
    this.tradeEffects?.dispose();
    this.armyMarches?.dispose();
    this.floatingText?.dispose();
    this.captureEffects?.dispose();
    this.sky?.dispose();

    if (this.buildingGroup) {
      disposeBuildingGroup3D(this.buildingGroup);
    }

    // Dispose parcel decorations
    for (const decorationGroup of this.parcelDecorations.values()) {
      disposeDecorationGroup(decorationGroup);
    }
    this.parcelDecorations.clear();
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
