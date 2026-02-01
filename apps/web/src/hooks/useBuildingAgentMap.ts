/**
 * useBuildingAgentMap - Maps agentId to building 3D position
 *
 * Derives Record<agentId, {x, z}> from mapData.parcels for
 * positioning hack effects (beams, shields, etc.)
 */

import { useMemo } from 'react';
import type { MapData } from '../lib/map/types';
import { TILE_SIZE } from '../lib/map/three/ThreeConfig';

export interface AgentPosition {
  x: number;
  z: number;
  blockX: number;
  blockY: number;
}

export function useBuildingAgentMap(mapData: MapData | null): Record<string, AgentPosition> {
  return useMemo(() => {
    if (!mapData) return {};

    const map: Record<string, AgentPosition> = {};
    for (const parcel of mapData.parcels) {
      if (!parcel.agentId) continue;
      // Center of the parcel bounds in world coordinates
      const centerX = parcel.bounds.x + Math.floor(parcel.bounds.width / 2);
      const centerY = parcel.bounds.y + Math.floor(parcel.bounds.height / 2);
      map[parcel.agentId] = {
        x: centerX * TILE_SIZE,
        z: centerY * TILE_SIZE,
        blockX: parcel.blockX,
        blockY: parcel.blockY,
      };
    }
    return map;
  }, [mapData?.parcels]);
}
