/**
 * useCityState - City state hook using centralized socket
 *
 * REFACTORED: Now uses the centralized socket singleton from ../socket/
 * instead of creating its own connection.
 *
 * SPECTATOR-FIRST ARCHITECTURE:
 * - Receives full map_state on connect via centralized socket
 * - Listens to city_event for live updates
 * - NO HTTP polling - everything via socket
 */

import { useMemo } from 'react';
import type { MapData, MapObject, TimeState } from '@agentropolis/shared';
import { useSocketContext } from '../socket';
import { gridToScreen, getDrawOrder } from '../lib/map/coords';
import type { RenderableBuilding, RenderableParcel } from '../lib/map/types';

const DEFAULT_TIME_STATE: TimeState = {
  dayIndex: 1,
  minuteOfDay: 540,
  phase: 'day',
  hourDisplay: '09:00',
  isNewPhase: false,
};

export interface CityState {
  // Map data
  mapData: MapData | null;
  parcels: RenderableParcel[];
  buildings: RenderableBuilding[];
  objects: MapObject[];

  // Time
  timeState: TimeState;

  // Connection
  isConnected: boolean;
  isLoading: boolean;
  spectatorCount: number;

  // Error
  error: string | null;
}

/**
 * Hook for city/map state using the centralized socket context.
 *
 * NOTE: This hook now reads from the centralized SocketContext.
 * The socket connection is managed by SocketProvider in App.tsx.
 * Map state events (map_state, city_event) are handled in socket.context.tsx.
 */
export function useCityState(): CityState {
  // Get state from centralized socket context
  const {
    mapData,
    mapTimeState,
    spectatorCount,
    connectionStatus,
  } = useSocketContext();

  const isConnected = connectionStatus === 'synced';
  const isLoading = connectionStatus === 'connecting' || connectionStatus === 'connected';
  const error = connectionStatus === 'failed' ? 'Connection failed' : null;

  // Compute renderable parcels
  const parcels = useMemo<RenderableParcel[]>(() => {
    if (!mapData) return [];

    return mapData.parcels.map(parcel => {
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
  }, [mapData?.parcels]);

  // Compute renderable buildings
  const buildings = useMemo<RenderableBuilding[]>(() => {
    if (!mapData) return [];

    return mapData.objects
      .filter(obj => obj.type === 'building' || obj.type === 'decoration')
      .map(obj => {
        const screen = gridToScreen(obj.gridX, obj.gridY);
        return {
          id: obj.id,
          parcelId: obj.parcelId || obj.id,
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
  }, [mapData?.objects]);

  return {
    mapData,
    parcels,
    buildings,
    objects: mapData?.objects || [],
    timeState: mapTimeState ?? DEFAULT_TIME_STATE,
    isConnected,
    isLoading,
    spectatorCount,
    error,
  };
}
