/**
 * Socket Room Helpers
 *
 * V1 room system — kept as stub for backwards compatibility.
 * V2 uses chunk-based viewport subscriptions instead of named rooms.
 */

export const ROOMS = {
  MULTIVERSE: 'multiverse' as const,
} as const;

export function parseRoom(room: string): { type: string } {
  return { type: room };
}

export function isMapRoom(room: string): boolean {
  return room.endsWith(':map');
}
