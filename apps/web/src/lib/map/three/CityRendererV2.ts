/**
 * CityRendererV2 - Infinitown-style isometric city renderer
 *
 * Architecture:
 *  - Individual assets loaded as geometry+material, rendered via InstancedMesh
 *  - 5x5 visible chunk grid, 7x7 virtual table with wrap-around
 *  - Each chunk = 16x16 tile grid (roads every 4 tiles + 3x3 buildable blocks)
 *  - Scene moves (not camera) for infinite pan illusion
 *  - PerspectiveCamera with narrow FOV for isometric feel
 *  - Fog hides edges, clouds float above
 *  - V2Composer merges procedural + override buildings
 *  - Hover raycasting provides tile info via getTileInfo
 */

import * as THREE from 'three';
import {
  TILE,
  TILES_PER_CHUNK,
  CHUNK_SIZE, CHUNK_COUNT, TABLE_SIZE,
  CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR,
  CAMERA_OFFSET_X, CAMERA_OFFSET_Z,
  ZOOM_MIN_HEIGHT, ZOOM_MAX_HEIGHT, ZOOM_LERP,
  PAN_SPEED, PAN_LERP,
  FOG_COLOR, FOG_NEAR, FOG_FAR,
  SHADOWMAP_RESOLUTION,
  ASSET_REGISTRY,
  SeededRandom,
  type Placement,
  type HoverInfo,
  type CityRendererV2Callbacks,
} from './V2Config';
import { loadAllRegistryAssets, createInstancedMesh, type ExtractedAsset } from './V2Assets';
import { validateChunk } from './V2Layout';
import { getWorldChunkZone, chunkSeed, type DistrictZone } from './V2Districts';
import { updateEffectsTime, applyWindowFlicker, applyTreeSway, applyLampGlow } from './V2Effects';
import { composePlacements, coveredTiles, type ComposerContext } from './V2Composer';
import { ParcelStore, BuildingStore, type BuildingInfo, type ParcelInfo } from './V2Stores';
import { getTileInfo } from './V2WorldGen';
import { OfflineDataSource } from './V2DataSource';
import { getCatalogEntry } from './V2BuildingCatalog';
import { ChunkStatsCache, type ChunkStat } from './V2ChunkStats';
import { MultiSourceRouter, type DataSourceMode } from './V2MultiDataSource';
import { SeasonController } from './V2Season';
import { WorldFXController, type WorldFXType } from './V2WorldFX';
import { IndicatorController, type BuildingIndicator } from './V2Indicators';
import { LensController, type LensMode, type LensBuildingData } from './V2Lens';
import { TrafficController } from './V2Traffic';
import { ParticleController } from './V2Particles';
import { AgentSpriteController, type AgentSpriteData } from './V2AgentSprites';

export type { HoverInfo, CityRendererV2Callbacks } from './V2Config';
export type { ChunkStat } from './V2ChunkStats';
export type { DataSourceMode } from './V2MultiDataSource';
export type { WorldFXType } from './V2WorldFX';
export type { BuildingIndicator, IndicatorType } from './V2Indicators';
export type { LensMode, LensBuildingData } from './V2Lens';
export type { AgentSpriteData } from './V2AgentSprites';

export interface PlaceBuildingResult {
  ok: boolean;
  reason?: string;
  collidedWith?: string[];
}

export interface ExportedState {
  version: number;
  worldSeed: number;
  createdAt: string;
  overrides: BuildingInfo[];
  parcels: ParcelInfo[];
}

// ==================== RENDERER ====================

export class CityRendererV2 {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private container!: HTMLDivElement;
  private rafId = 0;
  private disposed = false;
  private hasAutoStarted = false;

  // Infinitown: scene container moves, camera stays fixed
  private chunkScene!: THREE.Group;

  // Pan state
  private panOffset = new THREE.Vector2(0, 0);
  private lastPanOffset = new THREE.Vector2(0, 0);
  private worldOffset = new THREE.Vector3(0, 0, 0);
  private smoothWorldOffset = new THREE.Vector3(0, 0, 0);
  private sceneOffset = new THREE.Vector3(0, 0, 0);

  // Drag state
  private isDragging = false;
  private dragStart = new THREE.Vector2(0, 0);

  // Zoom (camera height)
  private targetHeight = ZOOM_MAX_HEIGHT;
  private currentHeight = ZOOM_MAX_HEIGHT;

  // Grid tracking
  private gridCoords = new THREE.Vector2(0, 0);

  // Table: virtual 7x7 grid of placement data
  private table: Placement[][][] = [];

  // Global InstancedMesh map: one per asset key
  private meshes = new Map<string, THREE.InstancedMesh>();

  // Extracted assets for reference
  private assets = new Map<string, ExtractedAsset>();

  private rng = new SeededRandom(42);


  // Clouds
  private clouds: THREE.Group[] = [];

  // Lighting
  private dirLight!: THREE.DirectionalLight;
  private ambientLight!: THREE.AmbientLight;
  private hemiLight!: THREE.HemisphereLight;

  // Reusable dummy for matrix computation
  private dummy = new THREE.Object3D();

  // Clock for animation effects
  private clock = new THREE.Clock();

  // Season atmosphere controller
  private seasonController = new SeasonController();

  // World effects (crime pulse, building closed/opened)
  private worldFX = new WorldFXController();

  // In-world building status indicators
  private indicators = new IndicatorController();

  // Lens overlay system (activity, crime, needs)
  private lens = new LensController();

  // Traffic particle system (fake cars on roads)
  private traffic = new TrafficController();
  private particles = new ParticleController();
  private agentSprites = new AgentSpriteController();

  // Minimap: top-down orthographic camera + render target
  private minimapCamera: THREE.OrthographicCamera | null = null;
  private minimapTarget: THREE.WebGLRenderTarget | null = null;

  // Sparse stores for backend integration
  private parcelStore = new ParcelStore();
  private buildingStore = new BuildingStore();
  private realLayerStore = new BuildingStore();
  private dataSource = new OfflineDataSource();
  private chunkStats = new ChunkStatsCache();
  private router = new MultiSourceRouter({
    onChunkLoaded: (chunkX, chunkZ, buildings) => {
      // Feed stub data into the real layer store (sync)
      for (const b of buildings) {
        this.realLayerStore.add(b);
      }
      console.log(`[V2] RealLayer loaded chunk(${chunkX},${chunkZ}): ${buildings.length} buildings`);
    },
    onChunkUpdated: (chunkX, chunkZ, buildings) => {
      // Async callback from socket — clear old data for this chunk, load new
      const existing = this.realLayerStore.getBuildingsInChunk(chunkX, chunkZ);
      for (const b of existing) {
        this.realLayerStore.remove(b.id);
      }
      for (const b of buildings) {
        this.realLayerStore.add(b);
      }
      console.log(`[V2] RealLayer updated chunk(${chunkX},${chunkZ}): ${buildings.length} buildings`);
      this.regenerateAndRefresh();
    },
    onModeChanged: () => {
      // Clear real layer when switching modes
      this.realLayerStore.clear();
      this.regenerateAndRefresh();
    },
    onCitySync: (data) => {
      console.log(`[V2] city:sync received: mode=${data.mode}, seed=${data.seed}, cityId=${data.cityId}`);
      // Auto-switch based on server mode (once per renderer instance)
      if (!this.hasAutoStarted && this.router.mode === 'offline') {
        this.hasAutoStarted = true;
        // Map server CityMode → client DataSourceMode
        // stub → stub, real → real, hybrid → real (hybrid = authoritative real layer + procedural decor)
        const clientMode: DataSourceMode = data.mode === 'stub' ? 'stub' : 'real';
        console.log(`[V2] Auto-switching to ${clientMode} mode (server mode=${data.mode})`);
        this.setMode(clientMode);
      }
    },
    onReconnect: () => {
      console.log('[V2] Socket reconnected — chunks will be re-delivered');
    },
  });

  // Hover state
  private callbacks: CityRendererV2Callbacks = {};
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hoverNDC = new THREE.Vector2();
  private lastHover: HoverInfo | null = null;
  private screenProjection = new THREE.Vector3(); // reused for screen projection

  // ==================== INIT ====================

  async init(container: HTMLDivElement, callbacks?: CityRendererV2Callbacks): Promise<void> {
    this.container = container;
    if (callbacks) this.callbacks = callbacks;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Camera (Infinitown: FOV=30, elevated isometric view)
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, CAMERA_NEAR, CAMERA_FAR);
    this.camera.position.set(CAMERA_OFFSET_X, ZOOM_MAX_HEIGHT, CAMERA_OFFSET_Z);
    this.camera.lookAt(0, 0, 0);

    // Chunk scene container (this moves, camera stays)
    this.chunkScene = new THREE.Group();
    this.chunkScene.name = 'chunkScene';
    this.scene.add(this.chunkScene);

    // Lighting
    this.setupLighting();

    // Attach season controller to scene refs
    this.seasonController.attach({
      scene: this.scene,
      ambientLight: this.ambientLight,
      hemiLight: this.hemiLight,
      dirLight: this.dirLight,
      clouds: this.clouds,
    });

    // Events
    this.bindEvents();

    // Start render loop
    this.animate();
  }

  private setupLighting(): void {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.hemiLight = new THREE.HemisphereLight(0xeef4f8, 0x8B8070, 0.4);
    this.scene.add(this.ambientLight);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff8f0, 1.1);
    this.dirLight.position.set(150, 200, -60);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.radius = 1;
    this.dirLight.shadow.bias = -0.001;
    this.dirLight.shadow.mapSize.width = SHADOWMAP_RESOLUTION;
    this.dirLight.shadow.mapSize.height = SHADOWMAP_RESOLUTION;
    this.dirLight.shadow.camera.near = 50;
    this.dirLight.shadow.camera.far = 500;
    this.resizeShadowFrustum();
    this.chunkScene.add(this.dirLight);
    this.chunkScene.add(this.dirLight.target);
  }

  private resizeShadowFrustum(): void {
    const aspect = Math.max(this.container.clientWidth / this.container.clientHeight, 1.25);
    const size = 120 * aspect;
    this.dirLight.shadow.camera.left = -size * 0.9;
    this.dirLight.shadow.camera.right = size * 1.3;
    this.dirLight.shadow.camera.top = size;
    this.dirLight.shadow.camera.bottom = -size;
    this.dirLight.shadow.camera.updateProjectionMatrix();
  }

  // ==================== BUILD SCENE ====================

  async buildTestParcel(): Promise<void> {
    // 1. Load overrides from OfflineDataSource (localStorage persistence)
    const { buildings, parcels } = await this.dataSource.loadAll();

    // Guard: React StrictMode may call dispose() while we await.
    // If disposed, abort immediately to prevent zombie renderers.
    if (this.disposed) return;

    for (const b of buildings) {
      this.buildingStore.add(b);
      this.chunkStats.onBuildingAdded(b);
    }
    for (const p of parcels) this.parcelStore.set(p.worldX, p.worldZ, p);
    if (buildings.length > 0 || parcels.length > 0) {
      console.log(`[V2] Loaded ${buildings.length} override buildings, ${parcels.length} parcels from localStorage`);
    }

    // 2. Load all registry assets (geometry + material extraction)
    this.assets = await loadAllRegistryAssets();

    // Guard: check disposed again after second async boundary
    if (this.disposed) return;

    console.log(`[V2] Loaded ${this.assets.size} asset types`);

    // 3. Create InstancedMesh for each asset type
    // Max instances: 25 chunks * ~80 placements per asset type (16x16 chunks are denser)
    const maxPerAsset = CHUNK_COUNT * CHUNK_COUNT * 60; // 25 * 60 = 1500
    for (const [key, asset] of this.assets.entries()) {
      const meta = ASSET_REGISTRY[key];
      const castShadow = meta?.type !== 'ground';
      const mesh = createInstancedMesh(asset, maxPerAsset, castShadow);
      mesh.name = `instanced_${key}`;
      this.meshes.set(key, mesh);
      this.chunkScene.add(mesh);
    }

    // 4. Generate the virtual table (7x7 placement data)
    this.generateTable();

    // 5. Populate instances from placements
    this.refreshAllChunks();

    // 6. Apply shader effects (window flicker, tree sway, lamp glow)
    applyWindowFlicker(this.meshes, maxPerAsset);
    applyTreeSway(this.meshes, maxPerAsset);
    applyLampGlow(this.meshes, maxPerAsset);

    // 7. Add clouds
    this.createClouds();

    // 8. Attach world FX to building meshes
    this.worldFX.attach(this.meshes, maxPerAsset);

    // 9. Initialize in-world indicators
    this.indicators.init(this.chunkScene);

    // 10. Attach lens controller (shares instanceColor buffers with WorldFX)
    this.lens.attach(this.meshes);

    // 11. Initialize traffic system (loads vehicle GLBs, spawns on roads)
    this.traffic.init(this.chunkScene).catch((err) => {
      console.warn('[V2] Traffic init failed:', err);
    });

    // 12. Initialize season particle system
    this.particles.init(this.chunkScene);

    // 13. Initialize agent sprite system
    this.agentSprites.init(this.chunkScene);

    // Log stats
    console.log(`[V2] InstancedMesh count: ${this.meshes.size}, draw calls should be ~${this.meshes.size + 3}`);

    // 8. Connect to server eagerly — will auto-switch to real on city:sync
    this.router.connectEagerly();
  }

  // ==================== TABLE (7x7 virtual grid of Placement[]) ====================

  private generateTable(): void {
    // Compose chunks using per-chunk deterministic RNG and world-chunk zones.
    const halfTable = Math.floor(TABLE_SIZE / 2);
    // Each cell gets its own RNG seeded by world-chunk coords so that:
    //   1. Same world-chunk always produces same procedural content
    //   2. Grid shifts don't cascade RNG changes across cells
    const context: ComposerContext = {
      buildingStore: this.buildingStore,
      realLayerStore: this.realLayerStore,
    };
    for (let x = 0; x < TABLE_SIZE; x++) {
      this.table[x] = [];
      for (let z = 0; z < TABLE_SIZE; z++) {
        const worldCX = this.gridCoords.x + (x - halfTable);
        const worldCZ = this.gridCoords.y + (z - halfTable);
        const districtZone = getWorldChunkZone(worldCX, worldCZ);
        const chunkRng = new SeededRandom(chunkSeed(worldCX, worldCZ));
        this.table[x][z] = composePlacements(worldCX, worldCZ, districtZone, chunkRng, context);
        validateChunk(this.table[x][z], `chunk(${worldCX},${worldCZ}) ${districtZone}`);
      }
    }
  }

  // ==================== INSTANCED MESH REFRESH ====================

  private refreshAllChunks(): void {
    const halfCount = Math.floor(CHUNK_COUNT / 2);

    // Track instance counts per asset
    const counts = new Map<string, number>();
    for (const key of this.meshes.keys()) {
      counts.set(key, 0);
    }

    // Table is 7x7, viewport is 5x5. The viewport maps to table indices
    // [1..5][1..5] (offset by halfTable - halfCount = 1 on each axis).
    const tableOffset = Math.floor(TABLE_SIZE / 2) - halfCount; // = 1

    // Iterate over 5x5 visible chunks
    for (let cx = 0; cx < CHUNK_COUNT; cx++) {
      for (let cz = 0; cz < CHUNK_COUNT; cz++) {
        // World position of this chunk's origin
        const chunkWorldX = (cx - halfCount) * CHUNK_SIZE;
        const chunkWorldZ = (cz - halfCount) * CHUNK_SIZE;

        // Direct table index — no wrap-around needed since we regenerate fully
        const tx = cx + tableOffset;
        const tz = cz + tableOffset;
        const placements = this.table[tx][tz];

        // Place each asset instance
        for (const p of placements) {
          const mesh = this.meshes.get(p.assetKey);
          if (!mesh) continue;

          const count = counts.get(p.assetKey) ?? 0;

          // Tile center in world space
          const meta = ASSET_REGISTRY[p.assetKey];
          const tw = meta?.tileW ?? 1;
          const td = meta?.tileD ?? 1;
          const worldX = chunkWorldX + p.tileX * TILE + (tw * TILE) / 2;
          const worldZ = chunkWorldZ + p.tileZ * TILE + (td * TILE) / 2;

          // Y offset: roads slightly lower to prevent z-fighting
          const y = meta?.type === 'road' ? -0.01 : 0;

          this.dummy.position.set(worldX, y, worldZ);
          this.dummy.rotation.set(0, p.rotation ?? 0, 0);
          this.dummy.scale.set(1, 1, 1);
          this.dummy.updateMatrix();

          mesh.setMatrixAt(count, this.dummy.matrix);
          counts.set(p.assetKey, count + 1);
        }
      }
    }

    // Apply final counts and flag for GPU upload
    for (const [key, mesh] of this.meshes.entries()) {
      mesh.count = counts.get(key) ?? 0;
      if (mesh.count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  // ==================== HOVER RAYCASTING ====================

  private updateHover(clientX: number, clientY: number): void {
    const rect = this.container.getBoundingClientRect();
    this.hoverNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.hoverNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.hoverNDC, this.camera);

    const intersect = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, intersect)) {
      if (this.lastHover !== null) {
        this.lastHover = null;
        this.callbacks.onHover?.(null);
      }
      return;
    }

    // Convert scene-space intersection to world tile coordinates
    // The chunkScene moves, so we need to account for its offset
    const scenePos = this.chunkScene.position;
    const worldSpaceX = intersect.x - scenePos.x;
    const worldSpaceZ = intersect.z - scenePos.z;

    // Convert to tile coordinates
    const tileWorldX = Math.floor(worldSpaceX / TILE);
    const tileWorldZ = Math.floor(worldSpaceZ / TILE);

    // Convert to chunk-aligned world coordinates
    // The grid origin is at the center of the visible grid
    const worldTileX = tileWorldX + this.gridCoords.x * TILES_PER_CHUNK;
    const worldTileZ = tileWorldZ + this.gridCoords.y * TILES_PER_CHUNK;

    const tileInfo = getTileInfo(worldTileX, worldTileZ);

    // Project tile center to screen coordinates for HoverCard anchoring (reuse vector)
    this.screenProjection.set(
      (tileWorldX - this.gridCoords.x * TILES_PER_CHUNK + 0.5) * TILE + this.chunkScene.position.x,
      0,
      (tileWorldZ - this.gridCoords.y * TILES_PER_CHUNK + 0.5) * TILE + this.chunkScene.position.z,
    );
    this.screenProjection.project(this.camera);
    const screenX = ((this.screenProjection.x + 1) / 2) * rect.width;
    const screenY = ((-this.screenProjection.y + 1) / 2) * rect.height;

    const hover: HoverInfo = {
      chunkX: tileInfo.chunkX,
      chunkZ: tileInfo.chunkZ,
      worldX: tileInfo.worldX,
      worldZ: tileInfo.worldZ,
      localX: tileInfo.localX,
      localZ: tileInfo.localZ,
      zone: tileInfo.zone,
      district: tileInfo.district,
      districtId: tileInfo.districtId,
      landPrice: tileInfo.landPrice,
      demandIndex: tileInfo.demandIndex,
      buildable: tileInfo.buildable,
      isRoad: tileInfo.isRoad,
      screenX,
      screenY,
    };

    // Check for parcel owner
    const parcel = this.parcelStore.get(tileInfo.worldX, tileInfo.worldZ);
    if (parcel?.ownerName) {
      hover.owner = parcel.ownerName;
    }

    // Check for authoritative (real layer) building first, then override
    const allHoverBuildings = [
      ...this.realLayerStore.getBuildingsInChunk(tileInfo.chunkX, tileInfo.chunkZ),
      ...this.buildingStore.getBuildingsInChunk(tileInfo.chunkX, tileInfo.chunkZ),
    ];
    for (const b of allHoverBuildings) {
      const rot = b.rotation ?? 0;
      const r = ((rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const rotated90 = Math.abs(r - Math.PI / 2) < 0.01 || Math.abs(r - (3 * Math.PI / 2)) < 0.01;
      const tw = rotated90 ? b.tileD : b.tileW;
      const td = rotated90 ? b.tileW : b.tileD;
      if (tileInfo.localX >= b.localX && tileInfo.localX < b.localX + tw &&
          tileInfo.localZ >= b.localZ && tileInfo.localZ < b.localZ + td) {
        hover.building = b.type;
        hover.buildingId = b.id;
        break;
      }
    }

    this.lastHover = hover;
    this.callbacks.onHover?.(hover);
  }

  // ==================== CLOUDS ====================

  private createClouds(): void {
    const cloudGeo = new THREE.SphereGeometry(15, 8, 6);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.85,
    });

    const spread = CHUNK_SIZE * CHUNK_COUNT;
    for (let i = 0; i < 8; i++) {
      const cloud = new THREE.Group();
      const count = 3 + Math.floor(this.rng.next() * 3);
      for (let j = 0; j < count; j++) {
        const sphere = new THREE.Mesh(cloudGeo, cloudMat);
        sphere.position.set(
          (this.rng.next() - 0.5) * 25,
          (this.rng.next() - 0.5) * 8,
          (this.rng.next() - 0.5) * 15,
        );
        sphere.scale.setScalar(0.5 + this.rng.next() * 0.8);
        cloud.add(sphere);
      }

      cloud.position.set(
        (this.rng.next() - 0.5) * spread,
        80 + this.rng.next() * 40,
        (this.rng.next() - 0.5) * spread,
      );
      this.chunkScene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  private updateClouds(): void {
    for (const cloud of this.clouds) {
      cloud.position.x -= 0.05;
      cloud.position.z += 0.015;
      const spread = CHUNK_SIZE * CHUNK_COUNT;
      if (cloud.position.x < -spread) cloud.position.x = spread;
      if (cloud.position.z > spread) cloud.position.z = -spread;
    }
  }

  // ==================== EVENTS ====================

  private bindEvents(): void {
    const el = this.renderer.domElement;
    el.addEventListener('mousedown', this.onMouseDown);
    el.addEventListener('mousemove', this.onMouseMove);
    el.addEventListener('mouseup', this.onMouseUp);
    el.addEventListener('mouseleave', this.onMouseUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('click', this.onClick);

    el.addEventListener('touchstart', this.onTouchStart, { passive: false });
    el.addEventListener('touchmove', this.onTouchMove, { passive: false });
    el.addEventListener('touchend', this.onTouchEnd);

    window.addEventListener('resize', this.onResize);
  }

  private onMouseDown = (e: MouseEvent): void => {
    this.isDragging = true;
    this.dragStart.set(e.pageX, e.pageY);
  };

  private onMouseMove = (e: MouseEvent): void => {
    // Always update hover (even when not dragging)
    this.updateHover(e.clientX, e.clientY);

    if (!this.isDragging) return;
    const dx = e.pageX - this.dragStart.x;
    const dy = e.pageY - this.dragStart.y;
    this.panOffset.set(
      this.lastPanOffset.x + dx,
      this.lastPanOffset.y + dy,
    );
  };

  private onMouseUp = (): void => {
    if (this.isDragging) {
      this.isDragging = false;
      this.lastPanOffset.copy(this.panOffset);
    }
  };

  private onClick = (e: MouseEvent): void => {
    if (this.lastHover && this.callbacks.onClick) {
      // Only fire click if we didn't drag significantly
      const dx = e.pageX - this.dragStart.x;
      const dy = e.pageY - this.dragStart.y;
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
        this.callbacks.onClick(this.lastHover);
      }
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -10 : 10;
    this.targetHeight = Math.max(
      ZOOM_MIN_HEIGHT,
      Math.min(ZOOM_MAX_HEIGHT, this.targetHeight - delta),
    );
  };

  private onTouchStart = (e: TouchEvent): void => {
    if (e.touches.length === 1) {
      this.isDragging = true;
      this.dragStart.set(e.touches[0].pageX, e.touches[0].pageY);
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches.length === 1 && this.isDragging) {
      const dx = e.touches[0].pageX - this.dragStart.x;
      const dy = e.touches[0].pageY - this.dragStart.y;
      this.panOffset.set(
        this.lastPanOffset.x + dx,
        this.lastPanOffset.y + dy,
      );
    }
  };

  private onTouchEnd = (): void => {
    this.isDragging = false;
    this.lastPanOffset.copy(this.panOffset);
  };

  private onResize = (): void => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.resizeShadowFrustum();
  };

  // ==================== RENDER LOOP ====================

  private animate = (): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.animate);

    // 1. Update controls — rotate pan by -45 degrees for isometric
    const cos45 = Math.cos(-Math.PI / 4);
    const sin45 = Math.sin(-Math.PI / 4);
    const rx = this.panOffset.x * cos45 - this.panOffset.y * sin45;
    const ry = this.panOffset.x * sin45 + this.panOffset.y * cos45;

    this.worldOffset.set(rx * PAN_SPEED, 0, ry * PAN_SPEED);

    // Smooth lerp
    this.smoothWorldOffset.lerp(this.worldOffset, PAN_LERP);

    // Apply to scene position
    this.chunkScene.position.addVectors(this.sceneOffset, this.smoothWorldOffset);

    // 2. Check grid shift
    this.checkGridShift();

    // 3. Smooth camera height (zoom)
    this.currentHeight += (this.targetHeight - this.currentHeight) * ZOOM_LERP;
    this.camera.position.y = this.currentHeight;
    this.camera.lookAt(0, 0, 0);

    // 4. Animate clouds
    this.updateClouds();

    // 5. Update shader effects (time uniform)
    const dt = this.clock.getDelta();
    updateEffectsTime(dt);

    // 5b. Update season atmosphere
    this.seasonController.update(dt);

    // 5c. Update world effects (crime pulse, building state)
    this.worldFX.update(this.currentHeight);

    // 5d. Update lens overlay (after WorldFX to override when active)
    this.lens.update();

    // 5e. Update in-world indicators (billboards face camera)
    this.indicators.setGridCoords(this.gridCoords.x, this.gridCoords.y);
    this.indicators.update(this.currentHeight, this.camera);

    // 5f. Update traffic particles
    this.traffic.update(dt, this.currentHeight);

    // 5g. Update season particles (snow, leaves)
    this.particles.update(dt, this.currentHeight);

    // 5h. Update agent sprites (billboard toward camera)
    this.agentSprites.setGridCoords(this.gridCoords.x, this.gridCoords.y);
    this.agentSprites.update(this.currentHeight, this.camera);

    // 6. Render
    this.renderer.render(this.scene, this.camera);
  };

  private checkGridShift(): void {
    const pos = this.chunkScene.position;
    const halfChunk = CHUNK_SIZE / 2;

    let shiftDx = 0;
    let shiftDz = 0;

    if (pos.x > halfChunk) {
      this.sceneOffset.x -= CHUNK_SIZE;
      this.gridCoords.x -= 1;
      shiftDx = -1;
    } else if (pos.x < -halfChunk) {
      this.sceneOffset.x += CHUNK_SIZE;
      this.gridCoords.x += 1;
      shiftDx = 1;
    }

    if (pos.z > halfChunk) {
      this.sceneOffset.z -= CHUNK_SIZE;
      this.gridCoords.y -= 1;
      shiftDz = -1;
    } else if (pos.z < -halfChunk) {
      this.sceneOffset.z += CHUNK_SIZE;
      this.gridCoords.y += 1;
      shiftDz = 1;
    }

    if (shiftDx !== 0 || shiftDz !== 0) {
      this.chunkScene.position.addVectors(this.sceneOffset, this.smoothWorldOffset);
      this.syncAOI();
      this.regenerateAndRefresh();
      this.traffic.onGridShift(shiftDx, shiftDz);
    }
  }

  // ==================== PUBLIC API ====================

  getParcelStore(): ParcelStore { return this.parcelStore; }
  getBuildingStore(): BuildingStore { return this.buildingStore; }
  getLastHover(): HoverInfo | null { return this.lastHover; }
  getGridCoords(): { x: number; y: number } { return { x: this.gridCoords.x, y: this.gridCoords.y }; }

  /**
   * Place an override building at a world tile coordinate.
   * Checks for collisions with existing overrides.
   * Persists to localStorage and refreshes the visible chunks.
   */
  async placeBuilding(building: BuildingInfo, opts?: { replace?: boolean }): Promise<PlaceBuildingResult> {
    // Collision check against existing overrides in the same chunk
    const newTiles = coveredTiles(building.localX, building.localZ, building.tileW, building.tileD, building.rotation);
    const existing = this.buildingStore.getBuildingsInChunk(building.chunkX, building.chunkZ);
    const colliders: string[] = [];

    for (const b of existing) {
      const bTiles = coveredTiles(b.localX, b.localZ, b.tileW, b.tileD, b.rotation);
      const bSet = new Set(bTiles.map(t => `${t.x},${t.z}`));
      for (const t of newTiles) {
        if (bSet.has(`${t.x},${t.z}`)) {
          colliders.push(b.id);
          break;
        }
      }
    }

    if (colliders.length > 0 && !opts?.replace) {
      return { ok: false, reason: 'overlap', collidedWith: colliders };
    }

    // Remove colliders if replace mode
    if (colliders.length > 0 && opts?.replace) {
      for (const id of colliders) {
        const removed = this.buildingStore.get(id);
        if (removed) this.chunkStats.onBuildingRemoved(removed);
        this.buildingStore.remove(id);
        await this.dataSource.removeBuilding(id);
      }
    }

    this.buildingStore.add(building);
    this.chunkStats.onBuildingAdded(building);
    await this.dataSource.setBuilding(building);
    this.regenerateAndRefresh();
    console.log(`[V2] Placed building "${building.type}" at world(${building.worldX},${building.worldZ})`);
    return { ok: true };
  }

  /**
   * Simplified building placement — auto-derives chunk/local/tileW/tileD from assetKey + worldX/Z.
   * Returns collision check result. Usage: renderer.placeBuildingAt('skyscraper', 5, 3)
   */
  async placeBuildingAt(
    assetKey: string,
    worldX: number,
    worldZ: number,
    opts?: { rotation?: number; replace?: boolean },
  ): Promise<PlaceBuildingResult> {
    const meta = ASSET_REGISTRY[assetKey];
    if (!meta) {
      // Also check building catalog for friendlier error
      const catalogEntry = getCatalogEntry(assetKey);
      if (!catalogEntry) {
        return { ok: false, reason: `unknown_asset: "${assetKey}"` };
      }
    }
    const resolvedMeta = meta ?? ASSET_REGISTRY[assetKey];
    if (!resolvedMeta) {
      return { ok: false, reason: `unknown_asset: "${assetKey}"` };
    }

    const chunkX = Math.floor(worldX / TILES_PER_CHUNK);
    const chunkZ = Math.floor(worldZ / TILES_PER_CHUNK);
    const localX = ((worldX % TILES_PER_CHUNK) + TILES_PER_CHUNK) % TILES_PER_CHUNK;
    const localZ = ((worldZ % TILES_PER_CHUNK) + TILES_PER_CHUNK) % TILES_PER_CHUNK;

    const building: BuildingInfo = {
      id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      worldX, worldZ,
      chunkX, chunkZ,
      localX, localZ,
      type: resolvedMeta.type,
      level: 1,
      assetKey,
      tileW: resolvedMeta.tileW,
      tileD: resolvedMeta.tileD,
      rotation: opts?.rotation,
    };

    return this.placeBuilding(building, { replace: opts?.replace });
  }

  /**
   * Remove an override building by ID.
   * Persists to localStorage and refreshes the visible chunks.
   */
  async removeBuilding(id: string): Promise<void> {
    const building = this.buildingStore.get(id);
    if (building) this.chunkStats.onBuildingRemoved(building);
    this.buildingStore.remove(id);
    await this.dataSource.removeBuilding(id);
    this.regenerateAndRefresh();
    console.log(`[V2] Removed building "${id}"`);
  }

  /** Set the current game season (triggers smooth transition) */
  setSeason(season: string): void {
    this.seasonController.setSeason(season);
    this.particles.setSeason(season as 'spring' | 'summer' | 'autumn' | 'winter');
  }

  /** Trigger a world effect on a building instance */
  triggerWorldFX(type: WorldFXType, meshKey: string, instanceIndex: number): void {
    this.worldFX.triggerEffect(type, meshKey, instanceIndex);
  }

  /** Clear all active world effects */
  clearWorldFX(): void {
    this.worldFX.clear();
  }

  /** Update building status indicators (replaces all) */
  setIndicators(indicators: BuildingIndicator[]): void {
    this.indicators.setIndicators(indicators);
  }

  /** Clear all building indicators */
  clearIndicators(): void {
    this.indicators.clear();
  }

  /** Set active lens mode ('off' | 'activity' | 'crime' | 'needs') */
  setLensMode(mode: LensMode): void {
    this.lens.setMode(mode);
  }

  /** Get current lens mode */
  getLensMode(): LensMode {
    return this.lens.getMode();
  }

  /** Feed data for the active lens */
  setLensData(data: LensBuildingData[]): void {
    this.lens.setLensData(data);
  }

  /** Update agent sprite positions on the map */
  setAgentSprites(agents: AgentSpriteData[]): void {
    this.agentSprites.setAgents(agents);
  }

  /** Clear all overrides (buildings + parcels) from stores and localStorage */
  async clearOverrides(): Promise<void> {
    this.buildingStore.clear();
    this.parcelStore.clear();
    this.chunkStats.reset();
    this.dataSource.clearAll();
    this.regenerateAndRefresh();
    console.log('[V2] Cleared all overrides');
  }

  private regenerateAndRefresh(): void {
    // Regenerate table with per-chunk RNG and world-chunk zones
    const halfTable = Math.floor(TABLE_SIZE / 2);
    const context: ComposerContext = {
      buildingStore: this.buildingStore,
      realLayerStore: this.realLayerStore,
    };
    for (let x = 0; x < TABLE_SIZE; x++) {
      this.table[x] = [];
      for (let z = 0; z < TABLE_SIZE; z++) {
        const worldCX = this.gridCoords.x + (x - halfTable);
        const worldCZ = this.gridCoords.y + (z - halfTable);
        const districtZone = getWorldChunkZone(worldCX, worldCZ);
        const chunkRng = new SeededRandom(chunkSeed(worldCX, worldCZ));
        this.table[x][z] = composePlacements(worldCX, worldCZ, districtZone, chunkRng, context);
      }
    }
    this.refreshAllChunks();
  }

  /**
   * Center viewport on a world tile coordinate.
   * Resets pan so the given tile is near screen center.
   */
  focusOnTile(worldX: number, worldZ: number): void {
    // Target scene position: tile center in world units
    const targetX = worldX * TILE + TILE / 2;
    const targetZ = worldZ * TILE + TILE / 2;

    // Reset pan state
    this.panOffset.set(0, 0);
    this.lastPanOffset.set(0, 0);
    this.worldOffset.set(0, 0, 0);
    this.smoothWorldOffset.set(0, 0, 0);

    // Set scene offset to center on target
    this.sceneOffset.set(-targetX, 0, -targetZ);
    this.chunkScene.position.copy(this.sceneOffset);

    // Update grid coords based on which chunk we're centered on
    this.gridCoords.set(
      Math.floor(worldX / TILES_PER_CHUNK),
      Math.floor(worldZ / TILES_PER_CHUNK),
    );

    this.syncAOI();
    this.regenerateAndRefresh();
  }

  /**
   * Produce a text snapshot of tiles around a world coordinate.
   * Legend: R=road, A=authoritative, O=override, P=procedural building/prop, .=empty ground
   */
  getSnapshot(centerX: number, centerZ: number, radius = 3): string {
    const lines: string[] = [];
    const header = '   ' + Array.from({ length: radius * 2 + 1 }, (_, i) => {
      const wx = centerX - radius + i;
      return String(wx).padStart(3);
    }).join('');
    lines.push(header);

    for (let dz = -radius; dz <= radius; dz++) {
      const wz = centerZ + dz;
      let row = String(wz).padStart(3) + ' ';
      for (let dx = -radius; dx <= radius; dx++) {
        const wx = centerX + dx;
        const ch = this.getTileChar(wx, wz);
        row += ch.padStart(3);
      }
      lines.push(row);
    }
    return lines.join('\n');
  }

  private getTileChar(worldX: number, worldZ: number): string {
    const localX = ((worldX % TILES_PER_CHUNK) + TILES_PER_CHUNK) % TILES_PER_CHUNK;
    const localZ = ((worldZ % TILES_PER_CHUNK) + TILES_PER_CHUNK) % TILES_PER_CHUNK;
    const chunkX = Math.floor(worldX / TILES_PER_CHUNK);
    const chunkZ = Math.floor(worldZ / TILES_PER_CHUNK);

    // Road check
    const isRoad = (localX % 4 === 0) || (localZ % 4 === 0);
    if (isRoad) return 'R';

    // RealLayer (authoritative) check — highest precedence
    const realBuildings = this.realLayerStore.getBuildingsInChunk(chunkX, chunkZ);
    for (const b of realBuildings) {
      const rot = b.rotation ?? 0;
      const r = ((rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const rotated90 = Math.abs(r - Math.PI / 2) < 0.01 || Math.abs(r - (3 * Math.PI / 2)) < 0.01;
      const tw = rotated90 ? b.tileD : b.tileW;
      const td = rotated90 ? b.tileW : b.tileD;
      if (localX >= b.localX && localX < b.localX + tw &&
          localZ >= b.localZ && localZ < b.localZ + td) {
        return 'A';  // Authoritative
      }
    }

    // Override check
    const buildings = this.buildingStore.getBuildingsInChunk(chunkX, chunkZ);
    for (const b of buildings) {
      const rot = b.rotation ?? 0;
      const r = ((rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const rotated90 = Math.abs(r - Math.PI / 2) < 0.01 || Math.abs(r - (3 * Math.PI / 2)) < 0.01;
      const tw = rotated90 ? b.tileD : b.tileW;
      const td = rotated90 ? b.tileW : b.tileD;
      if (localX >= b.localX && localX < b.localX + tw &&
          localZ >= b.localZ && localZ < b.localZ + td) {
        return 'O';
      }
    }

    // Procedural check from table
    const tx = ((chunkX % TABLE_SIZE) + TABLE_SIZE) % TABLE_SIZE;
    const tz = ((chunkZ % TABLE_SIZE) + TABLE_SIZE) % TABLE_SIZE;
    if (this.table[tx]?.[tz]) {
      for (const p of this.table[tx][tz]) {
        const meta = ASSET_REGISTRY[p.assetKey];
        if (!meta || meta.type === 'ground' || meta.type === 'road') continue;
        const ptw = meta.tileW;
        const ptd = meta.tileD;
        if (localX >= p.tileX && localX < p.tileX + ptw &&
            localZ >= p.tileZ && localZ < p.tileZ + ptd) {
          return 'P';
        }
      }
    }

    return '.';
  }

  /** List all override buildings */
  listOverrides(): Array<{
    id: string; type: string; assetKey: string;
    worldX: number; worldZ: number;
    chunkX: number; chunkZ: number;
    localX: number; localZ: number;
    tileW: number; tileD: number;
    rotation: number;
  }> {
    const result: Array<{
      id: string; type: string; assetKey: string;
      worldX: number; worldZ: number;
      chunkX: number; chunkZ: number;
      localX: number; localZ: number;
      tileW: number; tileD: number;
      rotation: number;
    }> = [];
    // Access buildings through the store's chunk index
    // We need to iterate all chunks — use a broad scan
    for (let cx = -10; cx <= 10; cx++) {
      for (let cz = -10; cz <= 10; cz++) {
        const bs = this.buildingStore.getBuildingsInChunk(cx, cz);
        for (const b of bs) {
          result.push({
            id: b.id,
            type: b.type,
            assetKey: b.assetKey,
            worldX: b.worldX,
            worldZ: b.worldZ,
            chunkX: b.chunkX,
            chunkZ: b.chunkZ,
            localX: b.localX,
            localZ: b.localZ,
            tileW: b.tileW,
            tileD: b.tileD,
            rotation: b.rotation ?? 0,
          });
        }
      }
    }
    // Deduplicate by id
    const seen = new Set<string>();
    return result.filter(b => {
      if (seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    });
  }

  // ==================== AOI (Area of Interest) ====================

  /**
   * Compute the set of world-chunk coords currently visible in the 5x5 grid.
   */
  private getVisibleChunks(): Array<{ chunkX: number; chunkZ: number }> {
    const halfCount = Math.floor(CHUNK_COUNT / 2);
    const chunks: Array<{ chunkX: number; chunkZ: number }> = [];
    for (let cx = 0; cx < CHUNK_COUNT; cx++) {
      for (let cz = 0; cz < CHUNK_COUNT; cz++) {
        chunks.push({
          chunkX: this.gridCoords.x + (cx - halfCount),
          chunkZ: this.gridCoords.y + (cz - halfCount),
        });
      }
    }
    return chunks;
  }

  /**
   * Sync AOI subscriptions with the currently visible chunk grid.
   * Subscribes to newly visible chunks, unsubscribes from chunks no longer visible.
   * Only acts in 'real' or 'stub' mode (offline has no subscriptions).
   */
  private syncAOI(): void {
    const mode = this.router.mode;
    if (mode === 'offline') return;

    const visible = this.getVisibleChunks();
    const visibleSet = new Set(visible.map(c => `${c.chunkX},${c.chunkZ}`));
    const active = this.router.getActiveChunks();
    const activeSet = new Set(active.map(c => `${c.chunkX},${c.chunkZ}`));

    // New chunks: visible but not yet active
    const toSubscribe = visible.filter(c => !activeSet.has(`${c.chunkX},${c.chunkZ}`));
    // Old chunks: active but no longer visible
    const toUnsubscribe = active.filter(c => !visibleSet.has(`${c.chunkX},${c.chunkZ}`));

    if (toUnsubscribe.length > 0) {
      // Remove real layer buildings for unsubscribed chunks
      for (const { chunkX, chunkZ } of toUnsubscribe) {
        const buildings = this.realLayerStore.getBuildingsInChunk(chunkX, chunkZ);
        for (const b of buildings) {
          this.realLayerStore.remove(b.id);
        }
      }
      this.router.unsubscribeChunks(toUnsubscribe);
      console.log(`[AOI] Unsubscribed ${toUnsubscribe.length} chunks`);
    }

    if (toSubscribe.length > 0) {
      const buildings = this.router.subscribeChunks(toSubscribe);
      if (buildings.length > 0) {
        // Stub mode returns buildings synchronously
        this.regenerateAndRefresh();
      }
      console.log(`[AOI] Subscribed ${toSubscribe.length} chunks (${buildings.length} buildings loaded)`);
    }
  }

  /**
   * Clear all AOI subscriptions and real layer data.
   * Used when switching to offline mode.
   */
  private clearAOI(): void {
    const active = this.router.getActiveChunks();
    if (active.length > 0) {
      for (const { chunkX, chunkZ } of active) {
        const buildings = this.realLayerStore.getBuildingsInChunk(chunkX, chunkZ);
        for (const b of buildings) {
          this.realLayerStore.remove(b.id);
        }
      }
      this.router.unsubscribeChunks(active);
      console.log(`[AOI] Cleared all ${active.length} subscriptions`);
    }
  }

  // ==================== MODE / SUBSCRIPTION ====================

  /** Get current data source mode */
  getMode(): DataSourceMode { return this.router.mode; }

  /** Switch between offline, stub, and real mode */
  setMode(mode: DataSourceMode): void {
    // Clear AOI before mode switch
    this.clearAOI();

    this.router.setMode(mode);

    // If switching to offline, clear real layer
    if (mode === 'offline') {
      this.realLayerStore.clear();
      this.regenerateAndRefresh();
    } else {
      // For stub and real modes, subscribe to visible chunks
      this.syncAOI();
    }
  }

  /** Check if socket is connected (real mode) */
  isSocketConnected(): boolean {
    return this.router.isSocketConnected;
  }

  /**
   * Subscribe to chunks (AOI simulation).
   * In stub mode, loads authoritative data for these chunks.
   * Returns the buildings loaded into the real layer.
   */
  subscribeChunks(chunks: Array<{ chunkX: number; chunkZ: number }>): BuildingInfo[] {
    const buildings = this.router.subscribeChunks(chunks);
    if (buildings.length > 0) {
      this.regenerateAndRefresh();
    }
    return buildings;
  }

  /** Unsubscribe from chunks and remove their real layer data */
  unsubscribeChunks(chunks: Array<{ chunkX: number; chunkZ: number }>): void {
    // Remove real layer buildings for these chunks
    for (const { chunkX, chunkZ } of chunks) {
      const buildings = this.realLayerStore.getBuildingsInChunk(chunkX, chunkZ);
      for (const b of buildings) {
        this.realLayerStore.remove(b.id);
      }
    }
    this.router.unsubscribeChunks(chunks);
    this.regenerateAndRefresh();
  }

  /** Get currently subscribed chunks */
  getActiveChunks(): Array<{ chunkX: number; chunkZ: number }> {
    return this.router.getActiveChunks();
  }

  /** Get the real layer store (authoritative data) */
  getRealLayerStore(): BuildingStore { return this.realLayerStore; }

  /** Get the MultiSourceRouter for advanced operations */
  getRouter(): MultiSourceRouter { return this.router; }

  // ==================== DISTRICT / STATS / EXPORT ====================

  /** Get the DistrictZone for a world-chunk coordinate (deterministic) */
  getDistrictZoneAt(chunkX: number, chunkZ: number): DistrictZone {
    return getWorldChunkZone(chunkX, chunkZ);
  }

  /** Get chunk stats for a single chunk */
  getChunkStats(chunkX: number, chunkZ: number): ChunkStat {
    return this.chunkStats.getStats(chunkX, chunkZ);
  }

  /** Get aggregated stats for a 3x3 neighborhood */
  getNeighborhoodStats(chunkX: number, chunkZ: number): ChunkStat {
    return this.chunkStats.getNeighborhood(chunkX, chunkZ);
  }

  /** Export full override state for persistence / sharing */
  exportState(): ExportedState {
    return {
      version: 1,
      worldSeed: 42,
      createdAt: new Date().toISOString(),
      overrides: this.buildingStore.getAll(),
      parcels: this.parcelStore.getAll(),
    };
  }

  /** Import a previously exported state. Accepts both 'overrides' and legacy 'buildings' key. */
  async importState(
    data: Partial<ExportedState> & { buildings?: BuildingInfo[] },
    opts?: { force?: boolean },
  ): Promise<{ ok: boolean; reason?: string }> {
    if (data.version == null || data.version !== 1) {
      return { ok: false, reason: `version_mismatch: expected 1, got ${data.version ?? 'undefined'}` };
    }
    if (data.worldSeed !== 42 && !opts?.force) {
      return { ok: false, reason: `seed_mismatch: expected 42, got ${data.worldSeed ?? 'undefined'}` };
    }

    // Accept both 'overrides' (new) and 'buildings' (legacy) keys
    const buildings = data.overrides ?? data.buildings ?? [];
    const parcels = data.parcels ?? [];

    // Clear current state
    this.buildingStore.clear();
    this.parcelStore.clear();
    this.chunkStats.reset();
    this.dataSource.clearAll();

    // Load buildings
    for (const b of buildings) {
      this.buildingStore.add(b);
      this.chunkStats.onBuildingAdded(b);
      await this.dataSource.setBuilding(b);
    }

    // Load parcels
    for (const p of parcels) {
      this.parcelStore.set(p.worldX, p.worldZ, p);
      await this.dataSource.setParcel(p);
    }

    this.regenerateAndRefresh();
    console.log(`[V2] Imported ${buildings.length} overrides, ${parcels.length} parcels`);
    return { ok: true };
  }

  debugInfo(): Record<string, unknown> {
    const instanceCounts: Record<string, number> = {};
    for (const [key, mesh] of this.meshes.entries()) {
      if (mesh.count > 0) instanceCounts[key] = mesh.count;
    }
    return {
      camera: this.camera.position.toArray().map(v => +v.toFixed(1)),
      chunkScenePos: this.chunkScene.position.toArray().map(v => +v.toFixed(1)),
      meshTypes: this.meshes.size,
      instanceCounts,
      drawCalls: this.renderer.info.render.calls,
    };
  }

  getZoomPercent(): number {
    return Math.round(
      ((ZOOM_MAX_HEIGHT - this.currentHeight) / (ZOOM_MAX_HEIGHT - ZOOM_MIN_HEIGHT)) * 100,
    );
  }

  getDrawCalls(): number {
    return this.renderer.info.render.calls;
  }

  /**
   * Render a top-down bird's-eye view of the scene onto a 2D canvas.
   * Used for GTA-style minimap. The orthographic camera looks straight down
   * at the scene, covering the visible chunk area. Fog is temporarily disabled.
   */
  renderMinimap(canvas: HTMLCanvasElement): void {
    if (!this.renderer || this.disposed) return;

    const size = canvas.width;

    // Lazy-init minimap camera & render target
    // Show ~1.2 chunks of area — tight enough to see individual buildings
    if (!this.minimapCamera) {
      const span = CHUNK_SIZE * 1.2;
      this.minimapCamera = new THREE.OrthographicCamera(-span, span, span, -span, 1, 800);
      this.minimapCamera.up.set(0, 0, -1); // north = up on minimap
    }
    if (!this.minimapTarget || this.minimapTarget.width !== size) {
      this.minimapTarget?.dispose();
      this.minimapTarget = new THREE.WebGLRenderTarget(size, size, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
    }

    // Position camera directly above the scene center (which is always 0,0 — scene moves)
    this.minimapCamera.position.set(0, 600, 0);
    this.minimapCamera.lookAt(0, 0, 0);
    this.minimapCamera.updateMatrixWorld();

    // Temporarily disable fog for clean top-down view
    const savedFog = this.scene.fog;
    this.scene.fog = null;

    // Hide clouds for minimap render
    const cloudVis: boolean[] = [];
    for (const c of this.clouds) {
      cloudVis.push(c.visible);
      c.visible = false;
    }

    // Render to target
    this.renderer.setRenderTarget(this.minimapTarget);
    this.renderer.render(this.scene, this.minimapCamera);
    this.renderer.setRenderTarget(null);

    // Restore fog and clouds
    this.scene.fog = savedFog;
    for (let i = 0; i < this.clouds.length; i++) {
      this.clouds[i].visible = cloudVis[i];
    }

    // Read pixels and draw to 2D canvas
    const buf = new Uint8Array(size * size * 4);
    this.renderer.readRenderTargetPixels(this.minimapTarget, 0, 0, size, size, buf);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.createImageData(size, size);

    // WebGL pixels are bottom-up, flip vertically
    for (let y = 0; y < size; y++) {
      const srcRow = (size - 1 - y) * size * 4;
      const dstRow = y * size * 4;
      for (let x = 0; x < size * 4; x++) {
        imageData.data[dstRow + x] = buf[srcRow + x];
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);

    // Dispose minimap resources
    this.minimapTarget?.dispose();

    const el = this.renderer.domElement;
    el.removeEventListener('mousedown', this.onMouseDown);
    el.removeEventListener('mousemove', this.onMouseMove);
    el.removeEventListener('mouseup', this.onMouseUp);
    el.removeEventListener('mouseleave', this.onMouseUp);
    el.removeEventListener('wheel', this.onWheel);
    el.removeEventListener('click', this.onClick);
    el.removeEventListener('touchstart', this.onTouchStart);
    el.removeEventListener('touchmove', this.onTouchMove);
    el.removeEventListener('touchend', this.onTouchEnd);
    window.removeEventListener('resize', this.onResize);

    // Dispose instanced meshes
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose();
      const m = mesh.material;
      if (Array.isArray(m)) m.forEach(x => x.dispose()); else (m as THREE.Material).dispose();
    }

    // Dispose clouds and other scene objects
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && !this.meshes.has(obj.name.replace('instanced_', ''))) {
        obj.geometry.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach(x => x.dispose()); else m.dispose();
      }
    });

    this.indicators.dispose();
    this.traffic.dispose();
    this.particles.dispose();
    this.agentSprites.dispose();
    this.renderer.dispose();
    this.container.removeChild(el);
    this.meshes.clear();
    this.clouds = [];
    this.parcelStore.clear();
    this.buildingStore.clear();
    this.realLayerStore.clear();
    this.router.reset();
  }
}
