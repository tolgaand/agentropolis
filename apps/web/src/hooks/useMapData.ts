/**
 * useMapData - HTTP-based map data fetching
 *
 * @deprecated Use useCityState for socket-based spectator data.
 * This hook is kept for backwards compatibility with agent-facing API endpoints.
 */

import { useState, useEffect, useCallback } from 'react';
import type { RenderableBuilding, RenderableParcel, MapData, TileLayer, MapObject } from '../lib/map/types';
import { gridToScreen, getDrawOrder } from '../lib/map/coords';

const API_BASE = '/api';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: { message: string };
}

interface MapDataState {
  mapData: MapData | null;
  loading: boolean;
  error: string | null;
}

/**
 * @deprecated Use useCityState instead for spectator UI.
 */
export function useMapData() {
  const [state, setState] = useState<MapDataState>({
    mapData: null,
    loading: true,
    error: null,
  });

  const fetchData = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      const res = await fetch(`${API_BASE}/map`);

      if (!res.ok) {
        throw new Error('Failed to fetch map data');
      }

      const json: ApiResponse<MapData> = await res.json();

      if (!json.success) {
        throw new Error('API returned error');
      }

      setState({
        mapData: json.data,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Get layers by type
  const getLayer = (type: string): TileLayer | undefined => {
    return state.mapData?.layers.find(l => l.type === type);
  };

  // Pre-compute renderable objects (buildings) with screen positions and draw order
  const renderableBuildings: RenderableBuilding[] = (state.mapData?.objects || [])
    .filter((obj): obj is MapObject & { type: 'building' } => obj.type === 'building' || obj.type === 'decoration')
    .map(obj => {
      const screen = gridToScreen(obj.gridX, obj.gridY);
      return {
        id: obj.id,
        parcelId: obj.id,
        worldId: '',
        ownerId: obj.ownerId || 'system',
        type: obj.buildingType || obj.name || 'building',
        name: obj.name || 'Building',
        level: obj.level || 1,
        stats: {},
        coords: { x: obj.gridX, y: obj.gridY },
        spriteId: obj.spriteId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        screenX: screen.x,
        screenY: screen.y,
        drawOrder: getDrawOrder(obj.gridX, obj.gridY),
      };
    })
    .sort((a, b) => a.drawOrder - b.drawOrder);

  // Pre-compute renderable parcels with screen positions
  const renderableParcels: RenderableParcel[] = (state.mapData?.parcels || [])
    .map(parcel => {
      // Calculate center of parcel
      const centerX = parcel.bounds.x + Math.floor(parcel.bounds.width / 2);
      const centerY = parcel.bounds.y + Math.floor(parcel.bounds.height / 2);
      const screen = gridToScreen(centerX, centerY);

      return {
        id: parcel.id,
        agentId: parcel.agentId,
        agentName: parcel.agentName,
        worldId: parcel.worldId,
        blockX: parcel.blockX,
        blockY: parcel.blockY,
        bounds: parcel.bounds,
        defaultBuildingId: parcel.layout.mainBuilding.spriteId,
        registeredAt: parcel.registeredAt,
        legacyMessage: parcel.legacyMessage,
        theme: parcel.theme,
        terrain: parcel.terrain,
        fertilityStars: parcel.fertilityStars,
        agentData: parcel.agentData,
        screenX: screen.x,
        screenY: screen.y,
      };
    });

  return {
    ...state,
    // Legacy compatibility
    buildings: [],
    districts: [],
    // New layer-based data
    groundLayer: getLayer('ground'),
    roadLayer: getLayer('road'),
    buildingLayer: getLayer('building'),
    decorLayer: getLayer('decoration'),
    objects: state.mapData?.objects || [],
    renderableBuildings,
    renderableParcels,
    bufferZones: [],
    refresh: fetchData,
  };
}
