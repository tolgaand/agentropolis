/**
 * Socket Room Helpers
 *
 * Utilities for constructing room names and managing room state.
 */

import type { WorldId, SocketRoom } from '@agentropolis/shared';

/**
 * Room name constants and constructors
 */
export const ROOMS = {
  MULTIVERSE: 'multiverse' as const,
  world: (worldId: WorldId): SocketRoom => `world:${worldId}`,
  worldMap: (worldId: WorldId): SocketRoom => `world:${worldId}:map`,
} as const;

/**
 * Parse a room name to extract its type and parameters
 */
export function parseRoom(room: SocketRoom): {
  type: 'multiverse' | 'world' | 'worldMap';
  worldId?: WorldId;
} {
  if (room === 'multiverse') {
    return { type: 'multiverse' };
  }

  const worldMapMatch = room.match(/^world:(.+):map$/);
  if (worldMapMatch) {
    return { type: 'worldMap', worldId: worldMapMatch[1] as WorldId };
  }

  const worldMatch = room.match(/^world:(.+)$/);
  if (worldMatch) {
    return { type: 'world', worldId: worldMatch[1] as WorldId };
  }

  // Fallback
  return { type: 'multiverse' };
}

/**
 * Check if a room is a map room (for clearing map state on leave)
 */
export function isMapRoom(room: SocketRoom): boolean {
  return room.endsWith(':map');
}
