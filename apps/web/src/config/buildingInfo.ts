/**
 * Building Information Configuration
 *
 * Provides descriptions and production info for each building type.
 * Used in ParcelInfoPanel to help users understand building purposes.
 */

import type { BuildingType } from '@agentropolis/shared';

export interface BuildingInfo {
  description: string;
  produces: string;
  icon: string;
}

export const BUILDING_INFO: Record<BuildingType, BuildingInfo> = {
  farm: {
    description: 'Produces food for the faction',
    produces: 'Food',
    icon: '🌾',
  },
  lumberyard: {
    description: 'Harvests wood from nearby forests',
    produces: 'Wood',
    icon: '🪵',
  },
  quarry: {
    description: 'Extracts stone from the earth',
    produces: 'Stone',
    icon: '⛏️',
  },
  iron_mine: {
    description: 'Mines iron ore deposits',
    produces: 'Iron',
    icon: '⚒️',
  },
  market: {
    description: 'Enables trade and commerce',
    produces: 'Gold',
    icon: '💰',
  },
  barracks: {
    description: 'Trains infantry soldiers',
    produces: 'Infantry',
    icon: '⚔️',
  },
  stable: {
    description: 'Breeds and trains cavalry',
    produces: 'Cavalry',
    icon: '🐎',
  },
  watchtower: {
    description: 'Provides early warning of attacks',
    produces: 'Defense',
    icon: '🏹',
  },
  wall: {
    description: 'Fortifies the settlement perimeter',
    produces: 'Defense',
    icon: '🧱',
  },
  castle: {
    description: 'Seat of power, strongest defense',
    produces: 'Command',
    icon: '🏰',
  },
  academy: {
    description: 'Researches new technologies',
    produces: 'Knowledge',
    icon: '📚',
  },
};

/**
 * Get building info by type
 */
export function getBuildingInfo(type: BuildingType | string): BuildingInfo | null {
  return BUILDING_INFO[type as BuildingType] ?? null;
}
