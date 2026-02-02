/**
 * CityRendererV2 - Infinitown-style isometric city renderer
 *
 * Architecture (matching Infinitown exactly):
 *  - Pre-composed blocks loaded as complete GLB scenes
 *  - 7×7 visible chunk grid, 9×9 virtual table with wrap-around
 *  - Each chunk = 1 block + 4 road lanes + 1 intersection
 *  - Scene moves (not camera) for infinite pan illusion
 *  - PerspectiveCamera with narrow FOV for isometric feel
 *  - Fog hides edges, clouds float above
 */

import * as THREE from 'three';
import {
  CHUNK_SIZE, CHUNK_COUNT, TABLE_SIZE,
  BLOCK_SIZE, ROAD_WIDTH,
  CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR,
  CAMERA_OFFSET_X, CAMERA_OFFSET_Z,
  ZOOM_MIN_HEIGHT, ZOOM_MAX_HEIGHT, ZOOM_LERP,
  PAN_SPEED, PAN_LERP,
  FOG_COLOR, FOG_NEAR, FOG_FAR,
  SHADOWMAP_RESOLUTION, DIR_LIGHT_COLOR, DIR_LIGHT_INTENSITY,
  BLOCK_TYPES, ROAD_LANE_NS, ROAD_LANE_EW, ROAD_INTERSECTION,
  SeededRandom,
  type CityRendererV2Callbacks,
} from './V2Config';
import { loadAllAssets, cloneBlock } from './V2Assets';

export type { HoverInfo, CityRendererV2Callbacks } from './V2Config';

// ==================== TYPES ====================

interface ChunkData {
  node: THREE.Group;
  tableX: number;
  tableZ: number;
}

// ==================== RENDERER ====================

export class CityRendererV2 {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private container!: HTMLDivElement;
  private rafId = 0;
  private disposed = false;

  // Infinitown: scene container moves, camera stays fixed
  private chunkScene!: THREE.Group;

  // Pan state: accumulated offset from dragging
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

  // Table: virtual 9×9 grid of pre-generated chunks
  private table: ChunkData[][] = [];
  private chunks: THREE.Group[][] = [];

  // Asset templates
  private assets!: Map<string, THREE.Group>;
  private rng = new SeededRandom(42);

  // Clouds
  private clouds: THREE.Group[] = [];

  // Lighting
  private dirLight!: THREE.DirectionalLight;

  // ==================== INIT ====================

  async init(container: HTMLDivElement, _callbacks?: CityRendererV2Callbacks): Promise<void> {
    this.container = container;

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

    // Camera (Infinitown: FOV=30, position(80, 200, 80), lookAt(0,0,0))
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

    // Events
    this.bindEvents();

    // Start render loop
    this.animate();
  }

  private setupLighting(): void {
    // Ambient + hemisphere
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    this.scene.add(new THREE.HemisphereLight(0x87CEEB, 0x8B7355, 0.4));

    // Directional sun (Infinitown: position(100, 150, -40), color warm)
    this.dirLight = new THREE.DirectionalLight(DIR_LIGHT_COLOR, DIR_LIGHT_INTENSITY);
    this.dirLight.position.set(100, 150, -40);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.radius = 1;
    this.dirLight.shadow.bias = -0.001;
    this.dirLight.shadow.mapSize.width = SHADOWMAP_RESOLUTION;
    this.dirLight.shadow.mapSize.height = SHADOWMAP_RESOLUTION;
    this.dirLight.shadow.camera.near = 50;
    this.dirLight.shadow.camera.far = 300;
    this.resizeShadowFrustum();
    this.chunkScene.add(this.dirLight);
    this.chunkScene.add(this.dirLight.target);
  }

  private resizeShadowFrustum(): void {
    const aspect = Math.max(this.container.clientWidth / this.container.clientHeight, 1.25);
    const size = 75 * aspect;
    this.dirLight.shadow.camera.left = -size * 0.9;
    this.dirLight.shadow.camera.right = size * 1.3;
    this.dirLight.shadow.camera.top = size;
    this.dirLight.shadow.camera.bottom = -size;
    this.dirLight.shadow.camera.updateProjectionMatrix();
  }

  // ==================== BUILD SCENE ====================

  async buildTestParcel(): Promise<void> {
    // Load all assets
    const allFiles = [
      ...BLOCK_TYPES,
      ROAD_LANE_NS,
      ROAD_LANE_EW,
      ROAD_INTERSECTION,
    ];
    this.assets = await loadAllAssets(allFiles);

    console.log(`[V2] Loaded ${this.assets.size} asset templates`);

    // Debug: log bounds of each asset template
    for (const [name, group] of this.assets.entries()) {
      const box = new THREE.Box3().setFromObject(group);
      const size = new THREE.Vector3();
      box.getSize(size);
      console.log(`[V2 Asset] ${name}: min(${box.min.x.toFixed(1)}, ${box.min.y.toFixed(1)}, ${box.min.z.toFixed(1)}) max(${box.max.x.toFixed(1)}, ${box.max.y.toFixed(1)}, ${box.max.z.toFixed(1)}) size(${size.x.toFixed(1)}, ${size.y.toFixed(1)}, ${size.z.toFixed(1)})`);
    }

    // Generate the virtual table (9×9)
    this.generateTable();

    // Create visible chunk grid (7×7)
    this.initChunkGrid();

    // Populate chunks with initial data
    this.refreshAllChunks();

    // Add clouds
    this.createClouds();

    // Log stats
    let totalMeshes = 0;
    this.chunkScene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) totalMeshes++;
    });
    console.log(`[V2] Scene: ${totalMeshes} meshes, ${CHUNK_COUNT}×${CHUNK_COUNT} chunks`);
  }

  // ==================== TABLE (Infinitown: 9×9 virtual grid) ====================

  private generateTable(): void {
    this.rng.reset(42);

    for (let x = 0; x < TABLE_SIZE; x++) {
      this.table[x] = [];
      for (let z = 0; z < TABLE_SIZE; z++) {
        const node = this.buildChunkContent(x, z);
        this.table[x][z] = { node, tableX: x, tableZ: z };
      }
    }
  }

  /**
   * Build a single chunk's content: block + roads + intersection
   * Infinitown layout per chunk (75×75):
   *   - Block at (15, 0, 0) — offset by road width
   *   - Road lane NS at (0, 0, 0) — left side
   *   - Road lane EW at (15, 0, -15) — bottom side
   *   - Intersection at (0, 0, -15) — corner
   *
   * Actually, simpler approach:
   *   chunk origin (0,0,0) = bottom-left corner
   *   road_ns: x=0, z=0..60 (left edge, 15 wide, 60 tall)
   *   road_ew: x=0..60, z=0 (bottom edge, 60 wide, 15 tall)
   *   intersection: x=0, z=0 (corner, 15x15)
   *   block: x=15, z=15 (offset by road width)
   */
  private buildChunkContent(_tableX: number, _tableZ: number): THREE.Group {
    const chunk = new THREE.Group();
    chunk.name = 'chunk';

    // Chunk layout (75×75 units):
    //   [0,0]-[15,15]  = intersection
    //   [15,0]-[75,15] = road EW
    //   [0,15]-[15,75] = road NS
    //   [15,15]-[75,75]= block
    //
    // Blender Y → Three.js -Z, so assets extend into -Z from origin.
    // Each asset's origin is at the Blender (0,0) corner of the first tile.
    // Tiles are centered, so first tile at origin spans ±7.5 in both axes.
    // To place asset so its world bounds start at target X/Z:
    //   position.x = targetX + 7.5  (half tile offset)
    //   position.z = targetZ + totalDepth - 7.5  (flip Z + half tile)

    const HALF = ROAD_WIDTH / 2; // 7.5

    // 1. Block (60×60 footprint) at chunk grid [15,15] to [75,75]
    // Asset bounds: X(-7.5 to ~52.5), Z(-52.5 to 7.5)
    // Want: X(15..75), Z(15..75) → pos(22.5, 0, 67.5)
    const blockTemplates = BLOCK_TYPES.filter(t => this.assets.has(t));
    if (blockTemplates.length > 0) {
      const blockFile = this.rng.pick(blockTemplates);
      const template = this.assets.get(blockFile)!;
      const block = cloneBlock(template);
      block.position.set(ROAD_WIDTH + HALF, 0, ROAD_WIDTH + BLOCK_SIZE - HALF);
      block.name = 'block';
      chunk.add(block);
    }

    // 2. Road NS (15×60) at chunk grid [0,15] to [15,75]
    // Asset bounds: X(-7.5 to 7.5), Z(-52.5 to 7.5)
    // Want: X(0..15), Z(15..75) → pos(7.5, -0.01, 67.5)
    const laneNS = this.assets.get(ROAD_LANE_NS);
    if (laneNS) {
      const lane = cloneBlock(laneNS);
      lane.position.set(HALF, -0.01, ROAD_WIDTH + BLOCK_SIZE - HALF);
      chunk.add(lane);
    }

    // 3. Road EW (60×15) at chunk grid [15,0] to [75,15]
    // Asset bounds: X(-7.5 to 52.5), Z(-7.5 to 7.5)
    // Want: X(15..75), Z(0..15) → pos(22.5, -0.01, 7.5)
    const laneEW = this.assets.get(ROAD_LANE_EW);
    if (laneEW) {
      const lane = cloneBlock(laneEW);
      lane.position.set(ROAD_WIDTH + HALF, -0.01, HALF);
      chunk.add(lane);
    }

    // 4. Intersection (15×15) at chunk grid [0,0] to [15,15]
    // Asset bounds: X(-7.5 to 7.5), Z(-7.5 to 7.5)
    // Want: X(0..15), Z(0..15) → pos(7.5, -0.01, 7.5)
    const intersection = this.assets.get(ROAD_INTERSECTION);
    if (intersection) {
      const inter = cloneBlock(intersection);
      inter.position.set(HALF, -0.01, HALF);
      chunk.add(inter);
    }

    // Enable fog on all materials (like Infinitown)
    chunk.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.receiveShadow = true;
        obj.castShadow = true;
      }
    });

    return chunk;
  }

  /** Get chunk data from table with wrap-around (like Infinitown) */
  private getChunkData(x: number, z: number): ChunkData {
    // Euclidean modulo for wrap-around
    const tx = ((x % TABLE_SIZE) + TABLE_SIZE) % TABLE_SIZE;
    const tz = ((z % TABLE_SIZE) + TABLE_SIZE) % TABLE_SIZE;
    return this.table[tx][tz];
  }

  // ==================== CHUNK GRID (7×7 visible) ====================

  private initChunkGrid(): void {
    const halfCount = Math.floor(CHUNK_COUNT / 2);

    for (let x = 0; x < CHUNK_COUNT; x++) {
      this.chunks[x] = [];
      for (let z = 0; z < CHUNK_COUNT; z++) {
        const container = new THREE.Group();
        container.name = `chunk_${x}_${z}`;

        // Position in world space, centered around origin
        const cx = (x - halfCount) * CHUNK_SIZE;
        const cz = (z - halfCount) * CHUNK_SIZE;
        container.position.set(cx, 0, cz);

        this.chunkScene.add(container);
        this.chunks[x][z] = container;
      }
    }
  }

  /** Refresh all visible chunks based on current grid position */
  private refreshAllChunks(): void {
    const halfCount = Math.floor(CHUNK_COUNT / 2);

    for (let x = 0; x < CHUNK_COUNT; x++) {
      for (let z = 0; z < CHUNK_COUNT; z++) {
        const container = this.chunks[x][z];

        // Remove old content
        const old = container.getObjectByName('chunk');
        if (old) container.remove(old);

        // Get data from table based on grid coords + offset
        const tableX = this.gridCoords.x + (x - halfCount);
        const tableZ = this.gridCoords.y + (z - halfCount);
        const data = this.getChunkData(tableX, tableZ);

        // Clone and add
        const content = data.node.clone(true);
        container.add(content);
      }
    }
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
        60 + this.rng.next() * 30,
        (this.rng.next() - 0.5) * spread,
      );
      this.scene.add(cloud); // Clouds in scene, not chunkScene (they don't move with pan)
      this.clouds.push(cloud);
    }
  }

  private updateClouds(): void {
    for (const cloud of this.clouds) {
      cloud.position.x -= 0.05;
      cloud.position.z += 0.015;
      // Wrap around
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

    // Touch support
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

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    // Infinitown: mousewheel → camera height change
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

    // 1. Update controls — Infinitown style: rotate pan by -45° for isometric
    const rotated = new THREE.Vector2();
    rotated.copy(this.panOffset);
    // Rotate by -π/4 (isometric projection compensation)
    const cos45 = Math.cos(-Math.PI / 4);
    const sin45 = Math.sin(-Math.PI / 4);
    const rx = rotated.x * cos45 - rotated.y * sin45;
    const ry = rotated.x * sin45 + rotated.y * cos45;

    this.worldOffset.set(
      rx * PAN_SPEED,
      0,
      ry * PAN_SPEED,
    );

    // Smooth lerp (Infinitown: lerp factor 0.05)
    this.smoothWorldOffset.lerp(this.worldOffset, PAN_LERP);

    // Apply to scene position
    this.chunkScene.position.addVectors(this.sceneOffset, this.smoothWorldOffset);

    // 2. Check if we need to shift grid (raycast replacement — simple distance check)
    this.checkGridShift();

    // 3. Smooth camera height (zoom)
    this.currentHeight += (this.targetHeight - this.currentHeight) * ZOOM_LERP;
    this.camera.position.y = this.currentHeight;
    this.camera.lookAt(0, 0, 0);

    // 4. Animate clouds
    this.updateClouds();

    // 5. Render
    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Check if the scene has been panned far enough to shift the grid.
   * Infinitown uses raycasting against invisible planes, but we can use
   * a simpler distance-based approach.
   */
  private checkGridShift(): void {
    const pos = this.chunkScene.position;
    const halfChunk = CHUNK_SIZE / 2;

    let shifted = false;

    // Check X axis
    if (pos.x > halfChunk) {
      this.sceneOffset.x -= CHUNK_SIZE;
      this.gridCoords.x -= 1;
      shifted = true;
    } else if (pos.x < -halfChunk) {
      this.sceneOffset.x += CHUNK_SIZE;
      this.gridCoords.x += 1;
      shifted = true;
    }

    // Check Z axis
    if (pos.z > halfChunk) {
      this.sceneOffset.z -= CHUNK_SIZE;
      this.gridCoords.y -= 1;
      shifted = true;
    } else if (pos.z < -halfChunk) {
      this.sceneOffset.z += CHUNK_SIZE;
      this.gridCoords.y += 1;
      shifted = true;
    }

    if (shifted) {
      this.refreshAllChunks();
    }
  }

  // ==================== PUBLIC API ====================

  /** Debug: log scene bounding box and camera info */
  debugInfo(): Record<string, unknown> {
    const box = new THREE.Box3();
    this.chunkScene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const b = new THREE.Box3().setFromObject(obj);
        box.union(b);
      }
    });
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const info = {
      sceneBox: { min: box.min.toArray().map(v => +v.toFixed(1)), max: box.max.toArray().map(v => +v.toFixed(1)) },
      sceneSize: size.toArray().map(v => +v.toFixed(1)),
      sceneCenter: center.toArray().map(v => +v.toFixed(1)),
      camera: this.camera.position.toArray().map(v => +v.toFixed(1)),
      chunkScenePos: this.chunkScene.position.toArray().map(v => +v.toFixed(1)),
      chunkCount: this.chunks.length,
    };
    console.log('[V2 Debug]', JSON.stringify(info, null, 2));
    return info;
  }

  getZoomPercent(): number {
    return Math.round(
      ((ZOOM_MAX_HEIGHT - this.currentHeight) / (ZOOM_MAX_HEIGHT - ZOOM_MIN_HEIGHT)) * 100,
    );
  }

  getDrawCalls(): number {
    return this.renderer.info.render.calls;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);

    const el = this.renderer.domElement;
    el.removeEventListener('mousedown', this.onMouseDown);
    el.removeEventListener('mousemove', this.onMouseMove);
    el.removeEventListener('mouseup', this.onMouseUp);
    el.removeEventListener('mouseleave', this.onMouseUp);
    el.removeEventListener('wheel', this.onWheel);
    el.removeEventListener('touchstart', this.onTouchStart);
    el.removeEventListener('touchmove', this.onTouchMove);
    el.removeEventListener('touchend', this.onTouchEnd);
    window.removeEventListener('resize', this.onResize);

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach(x => x.dispose()); else m.dispose();
      }
    });
    this.renderer.dispose();
    this.container.removeChild(el);
    this.clouds = [];
  }
}
