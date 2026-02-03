/**
 * useRoom Hook - Room Lifecycle Management
 *
 * V1 room system stub — V2 uses chunk-based viewport subscriptions.
 * Kept for backwards compatibility but does nothing.
 */

import { useEffect } from 'react';
import { useSocketContext } from './socket.context';

export function useRoom(roomName: string): void {
  const { connectionStatus } = useSocketContext();

  useEffect(() => {
    if (connectionStatus !== 'connected' && connectionStatus !== 'synced') {
      return;
    }
    console.log(`[useRoom] V1 room subscription ignored: ${roomName}`);
  }, [roomName, connectionStatus]);
}

export const useRoomSubscription = useRoom;

export default useRoom;
