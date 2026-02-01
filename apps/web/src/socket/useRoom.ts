/**
 * useRoom Hook - Room Lifecycle Management
 *
 * Automatically joins a room on mount and leaves on unmount.
 * Handles connection state changes (rejoins after reconnect).
 */

import { useEffect } from 'react';
import { useSocketContext } from './socket.context';
import type { SocketRoom } from '@agentropolis/shared';

/**
 * Join a socket room for the lifetime of the component.
 * Automatically handles:
 * - Joining on mount
 * - Leaving on unmount
 * - Rejoining after reconnect
 *
 * @param roomName - The room to join (e.g., 'multiverse', 'world:claude_nation')
 */
export function useRoom(roomName: SocketRoom): void {
  const { joinRoom, leaveRoom, connectionStatus } = useSocketContext();

  useEffect(() => {
    // Only join when connected or synced
    if (connectionStatus !== 'connected' && connectionStatus !== 'synced') {
      return;
    }

    joinRoom(roomName);

    return () => {
      leaveRoom(roomName);
    };
  }, [roomName, connectionStatus, joinRoom, leaveRoom]);
}

/**
 * Alias for useRoom for backwards compatibility
 */
export const useRoomSubscription = useRoom;

export default useRoom;
