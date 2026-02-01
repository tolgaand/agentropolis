/**
 * Map State Service
 *
 * In-memory city state management for spectator-first architecture.
 * All spectators receive this state via socket on connect.
 *
 * BLOCK SYSTEM (20x20):
 * - Each parcel occupies a 20x20 tile block
 * - 3-tile roads separate blocks
 * - Block (0,0) reserved for World Monument
 * - Ring expansion pattern for placement
 */

import {
  MapData,
  MapParcel,
  MapObject,
  TILE_IDS,
  setTileAt,
  generateParcelLayout,
  PARCEL_SIZE,
  blockToTileCoords,
  getThemeForAiModel,
  getBlocksInRing,
  MAP_CONSTANTS,
  AgentHoverData,
  deriveParcelDNA,
  compactDNA,
  PARCEL_DNA_VERSION,
  type CompactParcelDNA,
  type TerrainType,
  type ParcelTheme,
  type WorldId,
} from '@agentropolis/shared';
import { generateInitialCity, findNextParcelPosition, generateRoadsForParcel, SEED_PARCELS, getEmpireForBlock } from './placement';
import type { SeedParcelConfig } from './placement';

interface CityState {
  map: MapData;
  spectatorCount: number;
  lastUpdate: Date;
  // Track occupied blocks: Set of "blockX,blockY" strings
  occupiedBlocks: Set<string>;
}

class MapStateService {
  private state: CityState;

  constructor() {
    this.state = this.initializeCity();
    this.seedEmpireParcels();
  }

  /**
   * Initialize a fresh city
   */
  private initializeCity(): CityState {
    const { map } = generateInitialCity();

    // Block (0,0) is reserved for World Monument
    const occupiedBlocks = new Set<string>();
    occupiedBlocks.add('0,0');

    return {
      map,
      spectatorCount: 0,
      lastUpdate: new Date(),
      occupiedBlocks,
    };
  }

  /**
   * Seed empire parcels — pre-populate the map with founder settlements.
   * Each empire gets 3 parcels in its sector (Ring 1-2).
   * These are placed at explicit block positions, not via ring expansion.
   */
  private seedEmpireParcels(): void {
    const timestamp = '2026-01-01T00:00:00.000Z'; // Fixed timestamp for deterministic seeds

    for (let i = 0; i < SEED_PARCELS.length; i++) {
      const config = SEED_PARCELS[i];
      const blockKey = `${config.blockX},${config.blockY}`;

      // Skip if already occupied (e.g., from DB restore)
      if (this.state.occupiedBlocks.has(blockKey)) {
        continue;
      }

      try {
        this.assignParcelAtBlock(config, timestamp, i);
        console.log(`[MapState] Seeded ${config.agentName} at block (${config.blockX},${config.blockY})`);
      } catch (err) {
        console.error(`[MapState] Failed to seed ${config.agentName}:`, err);
      }
    }

    console.log(`[MapState] Empire seeding complete: ${this.state.map.parcels.length} parcels, ${this.state.map.objects.length} objects`);
  }

  /**
   * Place a parcel at a specific block position (for seed population).
   * Unlike assignParcelToAgent which uses ring expansion, this places at exact coordinates.
   */
  private assignParcelAtBlock(
    config: SeedParcelConfig,
    timestamp: string,
    regOrder: number = 0,
  ): { parcel: MapParcel; objects: MapObject[] } {
    const { blockX, blockY, worldId, agentName, aiModel, legacyMessage } = config;
    const agentId = `seed_${worldId}_${blockX}_${blockY}`;

    // Convert block coordinates to tile coordinates
    const tileCoords = blockToTileCoords(blockX, blockY);

    // Derive DNA from djb2 hash
    const theme = getThemeForAiModel(aiModel);
    const dna = deriveParcelDNA(
      worldId as WorldId,
      agentId,
      agentName,
      regOrder,
      blockX,
      blockY,
      theme,
    );

    // Generate layout from DNA seed
    const layout = generateParcelLayout(theme as ParcelTheme, dna.layoutSeed);

    // Create agent hover data
    const agentData: AgentHoverData = {
      id: agentId,
      name: agentName,
      aiModel,
      legacyMessage,
      registeredAt: timestamp,
    };

    // Create parcel
    const parcel: MapParcel = {
      id: `parcel_${agentId}`,
      agentId,
      agentName,
      worldId,
      blockX,
      blockY,
      bounds: {
        x: tileCoords.x,
        y: tileCoords.y,
        width: PARCEL_SIZE,
        height: PARCEL_SIZE,
      },
      theme: theme as ParcelTheme,
      layout,
      registeredAt: timestamp,
      legacyMessage,
      agentData,
      terrain: dna.terrain,
      fertilityStars: dna.fertilityStars,
      startingBuilding: dna.startingBuilding,
    };

    // Generate objects from layout
    const objects = this.generateParcelObjects(parcel);

    // Update ground layer
    this.markParcelGround(parcel);

    // Generate road connections
    generateRoadsForParcel(parcel, this.state.map.layers, this.state.occupiedBlocks);

    // Mark block as occupied
    this.state.occupiedBlocks.add(`${blockX},${blockY}`);

    // Add to state
    this.state.map.parcels.push(parcel);
    this.state.map.objects.push(...objects);

    return { parcel, objects };
  }

  /**
   * Find a block position in the agent's empire sector.
   * Scans rings 1-5 for unoccupied blocks that belong to the empire.
   * Returns null if no sector blocks available (caller falls back to ring expansion).
   */
  private findSectorAwarePosition(worldId: WorldId): { blockX: number; blockY: number } | null {
    for (let ring = 1; ring <= MAP_CONSTANTS.MAX_RING; ring++) {
      const blocks = getBlocksInRing(ring);
      for (const block of blocks) {
        const key = `${block.blockX},${block.blockY}`;
        if (this.state.occupiedBlocks.has(key)) continue;
        const sectorEmpire = getEmpireForBlock(block.blockX, block.blockY);
        if (sectorEmpire === worldId) {
          return block;
        }
      }
    }

    return null;
  }

  /**
   * Get the full map state (sent to spectators on connect)
   */
  getMapData(): MapData {
    return this.state.map;
  }

  /**
   * Get map data filtered by worldId
   * Returns only parcels and objects belonging to the specified world
   */
  getMapDataForWorld(worldId: string): MapData {
    const filteredParcels = this.state.map.parcels.filter(p => p.worldId === worldId);
    const parcelIds = new Set(filteredParcels.map(p => p.id));
    const filteredObjects = this.state.map.objects.filter(o =>
      !o.parcelId || parcelIds.has(o.parcelId) || o.meta?.systemOwned
    );

    return {
      ...this.state.map,
      parcels: filteredParcels,
      objects: filteredObjects,
    };
  }

  /**
   * Get spectator count
   */
  getSpectatorCount(): number {
    return this.state.spectatorCount;
  }

  /**
   * Update spectator count
   */
  setSpectatorCount(count: number): void {
    this.state.spectatorCount = count;
  }

  /**
   * Get set of occupied blocks
   */
  getOccupiedBlocks(): Set<string> {
    return this.state.occupiedBlocks;
  }

  /**
   * Assign a parcel to a new agent
   * Returns the parcel and its objects
   *
   * If existingDNA is provided (restore from DB), uses the saved layout.
   * Otherwise generates a new layout and returns DNA to be saved.
   *
   * Sector-aware: tries to place in the agent's empire sector first,
   * falls back to normal ring expansion if no sector blocks available.
   */
  assignParcelToAgent(
    agentId: string,
    agentName: string,
    aiModel: string,
    worldId: string,
    legacyMessage?: string,
    registeredAt?: Date | string,
    existingDNA?: CompactParcelDNA,
    regOrder?: number,
  ): { parcel: MapParcel; objects: MapObject[]; dna: CompactParcelDNA } {
    // Try sector-aware placement first, fall back to ring expansion
    const blockPosition = this.findSectorAwarePosition(worldId as WorldId)
      || findNextParcelPosition(this.state.occupiedBlocks);

    if (!blockPosition) {
      throw new Error('No available blocks for new parcel');
    }

    // Convert block coordinates to tile coordinates
    const tileCoords = blockToTileCoords(blockPosition.blockX, blockPosition.blockY);

    // Use existing DNA or derive new
    let theme: ParcelTheme;
    let layoutSeed: string;
    let terrain: TerrainType;
    let fertilityStars: number;
    let startingBuilding: string;
    let compactDnaResult: CompactParcelDNA;

    if (existingDNA && existingDNA.v >= PARCEL_DNA_VERSION) {
      theme = existingDNA.t as ParcelTheme;
      layoutSeed = existingDNA.s;
      terrain = existingDNA.tr as TerrainType;
      fertilityStars = existingDNA.fs;
      startingBuilding = existingDNA.sb;
      compactDnaResult = existingDNA;
    } else {
      // Derive fresh DNA from djb2 hash
      theme = getThemeForAiModel(aiModel);
      const order = regOrder ?? this.state.map.parcels.length;
      const dna = deriveParcelDNA(
        worldId as WorldId,
        agentId,
        agentName,
        order,
        blockPosition.blockX,
        blockPosition.blockY,
        theme,
      );
      layoutSeed = dna.layoutSeed;
      terrain = dna.terrain;
      fertilityStars = dna.fertilityStars;
      startingBuilding = dna.startingBuilding;
      compactDnaResult = compactDNA(dna);
    }

    // Always regenerate layout deterministically from seed+theme
    const layout = generateParcelLayout(theme, layoutSeed);

    // Use provided registeredAt or default to now
    const regDate = registeredAt
      ? (typeof registeredAt === 'string' ? registeredAt : registeredAt.toISOString())
      : new Date().toISOString();

    // Create agent hover data
    const agentData: AgentHoverData = {
      id: agentId,
      name: agentName,
      aiModel,
      legacyMessage,
      registeredAt: regDate,
    };

    // Create parcel with DNA-derived properties
    const parcel: MapParcel = {
      id: `parcel_${agentId}`,
      agentId,
      agentName,
      worldId,
      blockX: blockPosition.blockX,
      blockY: blockPosition.blockY,
      bounds: {
        x: tileCoords.x,
        y: tileCoords.y,
        width: PARCEL_SIZE,
        height: PARCEL_SIZE,
      },
      theme,
      layout,
      registeredAt: regDate,
      legacyMessage,
      agentData,
      terrain,
      fertilityStars,
      startingBuilding,
    };

    // Generate objects from layout
    console.log(`[MapState] Parcel ${parcel.id}: layout has ${layout.secondaryBuildings.length} secondary buildings, ${layout.decorations.length} decorations`);
    const objects = this.generateParcelObjects(parcel);
    console.log(`[MapState] Parcel ${parcel.id}: generated ${objects.length} total objects (buildings=${objects.filter(o => o.type === 'building').length}, decos=${objects.filter(o => o.type === 'decoration').length})`);

    // Update ground layer for parcel
    this.markParcelGround(parcel);

    // Generate road connections for this parcel
    generateRoadsForParcel(parcel, this.state.map.layers, this.state.occupiedBlocks);

    // Mark block as occupied
    this.state.occupiedBlocks.add(`${blockPosition.blockX},${blockPosition.blockY}`);

    // Add to state
    this.state.map.parcels.push(parcel);
    this.state.map.objects.push(...objects);
    this.state.lastUpdate = new Date();

    return { parcel, objects, dna: compactDnaResult };
  }

  /**
   * Generate MapObjects from parcel layout
   */
  private generateParcelObjects(parcel: MapParcel): MapObject[] {
    const objects: MapObject[] = [];
    const { layout, bounds, id, agentId } = parcel;

    // Main building
    objects.push({
      id: `${id}_main`,
      type: 'building',
      gridX: bounds.x + layout.mainBuilding.localX,
      gridY: bounds.y + layout.mainBuilding.localY,
      spriteId: layout.mainBuilding.spriteId,
      buildingType: layout.mainBuilding.buildingType,
      name: layout.mainBuilding.name,
      ownerId: agentId,
      parcelId: id,
      level: layout.mainBuilding.level,
    });

    // Secondary buildings
    layout.secondaryBuildings.forEach((building, i) => {
      objects.push({
        id: `${id}_secondary_${i}`,
        type: 'building',
        gridX: bounds.x + building.localX,
        gridY: bounds.y + building.localY,
        spriteId: building.spriteId,
        buildingType: building.buildingType,
        name: building.name,
        ownerId: agentId,
        parcelId: id,
        level: building.level,
      });
    });

    // Decorations
    layout.decorations.forEach((deco, i) => {
      objects.push({
        id: `${id}_deco_${i}`,
        type: 'decoration',
        gridX: bounds.x + deco.localX,
        gridY: bounds.y + deco.localY,
        spriteId: deco.spriteId,
        ownerId: agentId,
        parcelId: id,
      });
    });

    return objects;
  }

  /**
   * Mark parcel ground tiles (brown/tan color)
   */
  private markParcelGround(parcel: MapParcel): void {
    const groundLayer = this.state.map.layers.find(l => l.type === 'ground');
    if (!groundLayer) return;

    const { bounds, layout } = parcel;

    // Fill parcel area with parcel ground
    for (let y = 0; y < bounds.height; y++) {
      for (let x = 0; x < bounds.width; x++) {
        setTileAt(groundLayer, bounds.x + x, bounds.y + y, TILE_IDS.PARCEL_GROUND);
      }
    }

    // Add path tiles
    for (const tile of layout.groundTiles) {
      setTileAt(groundLayer, bounds.x + tile.localX, bounds.y + tile.localY, tile.tileId);
    }
  }

  /**
   * Get parcel by ID
   */
  getParcel(parcelId: string): MapParcel | undefined {
    return this.state.map.parcels.find(p => p.id === parcelId);
  }

  /**
   * Get parcel by agent ID
   */
  getParcelByAgent(agentId: string): MapParcel | undefined {
    return this.state.map.parcels.find(p => p.agentId === agentId);
  }

  /**
   * Get parcel by block coordinates
   */
  getParcelByBlock(blockX: number, blockY: number): MapParcel | undefined {
    return this.state.map.parcels.find(p => p.blockX === blockX && p.blockY === blockY);
  }

  /**
   * Update parcel (e.g., add building, change legacy message)
   */
  updateParcel(
    parcelId: string,
    updates: Partial<Pick<MapParcel, 'legacyMessage'>>
  ): MapParcel | null {
    const parcel = this.state.map.parcels.find(p => p.id === parcelId);
    if (!parcel) return null;

    if (updates.legacyMessage !== undefined) {
      parcel.legacyMessage = updates.legacyMessage;
      if (parcel.agentData) {
        parcel.agentData.legacyMessage = updates.legacyMessage;
      }
    }

    this.state.lastUpdate = new Date();
    return parcel;
  }

  /**
   * Add object to parcel
   */
  addObjectToParcel(parcelId: string, object: MapObject): void {
    object.parcelId = parcelId;
    this.state.map.objects.push(object);
    this.state.lastUpdate = new Date();
  }

  /**
   * Remove object from map
   */
  removeObject(objectId: string): void {
    const index = this.state.map.objects.findIndex(o => o.id === objectId);
    if (index !== -1) {
      this.state.map.objects.splice(index, 1);
      this.state.lastUpdate = new Date();
    }
  }

  /**
   * Reset city (for development)
   */
  reset(): void {
    this.state = this.initializeCity();
  }

  /**
   * Restore parcels from database
   * Called on server startup to reload existing agent parcels.
   *
   * If agent has parcelDNA saved, uses the exact same layout (deterministic).
   * If not (legacy agents), generates new layout and backfills DNA to DB.
   */
  async restoreFromDatabase(): Promise<number> {
    // Dynamic import to avoid circular dependencies
    const { AgentModel } = await import('@agentropolis/db');

    // Find all agents with parcelId, sorted by createdAt to preserve ring order
    const agentsWithParcels = await AgentModel.find({
      parcelId: { $exists: true, $ne: null },
      worldId: { $exists: true, $ne: null },
    }).sort({ createdAt: 1 }).lean();

    let restoredCount = 0;
    let backfilledCount = 0;

    for (const agent of agentsWithParcels) {
      const agentId = agent._id.toString();

      // Skip if already exists
      if (this.getParcelByAgent(agentId)) {
        continue;
      }

      try {
        // Check for existing compact DNA
        const existingDNA = (agent as Record<string, unknown>).parcelDNA as
          | CompactParcelDNA
          | { version?: number; seed?: string; theme?: string } // legacy format
          | undefined;

        // Check if DNA is in the new compact format and up to date
        const isCompactFormat = existingDNA && 'v' in existingDNA;
        const dnaVersion = isCompactFormat ? (existingDNA as CompactParcelDNA).v : 0;
        const dnaIsUpToDate = isCompactFormat && dnaVersion >= PARCEL_DNA_VERSION;
        console.log(`[MapState] Agent ${agent.name}: DNA version=${dnaVersion}, current=${PARCEL_DNA_VERSION}, upToDate=${dnaIsUpToDate}`);

        const { dna } = this.assignParcelToAgent(
          agentId,
          agent.name,
          agent.aiModel || 'unknown',
          agent.worldId || 'open_frontier',
          agent.legacyMessage,
          agent.createdAt,
          dnaIsUpToDate ? (existingDNA as CompactParcelDNA) : undefined,
        );

        // Save/update DNA if it was regenerated
        if (!dnaIsUpToDate) {
          await AgentModel.updateOne(
            { _id: agent._id },
            { $set: { parcelDNA: dna } }
          );
          backfilledCount++;
        }

        restoredCount++;
      } catch (err) {
        console.error(`[MapState] Failed to restore parcel for agent ${agent.name}:`, err);
      }
    }

    if (restoredCount > 0) {
      console.log(`[MapState] Restored ${restoredCount} parcels from database (${backfilledCount} DNA backfilled)`);
    }

    return restoredCount;
  }
}

// Singleton instance
export const mapState = new MapStateService();
