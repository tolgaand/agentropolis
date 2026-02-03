/**
 * Socket Client Singleton
 *
 * Provides a single socket connection for the entire application.
 * Uses lazy initialization - socket is created on first access.
 *
 * IMPORTANT: This is the ONLY place where socket.io client is instantiated.
 * All other code should use useSocket() hook or getSocket() function.
 */

import { io, type Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@agentropolis/shared/contracts/v2';

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;

const SOCKET_URL = import.meta.env.VITE_API_URL || '';

/**
 * Socket configuration
 * Note: We handle reconnection ourselves for better UX control
 */
const SOCKET_CONFIG = {
  transports: ['websocket'],
  autoConnect: true,
  reconnection: false, // We handle reconnection ourselves
  path: '/socket.io',
};

/**
 * Get the singleton socket instance.
 * Creates the socket on first call.
 */
export function getSocket(): TypedSocket {
  if (!socket) {
    console.log('[Socket] Creating socket connection to', SOCKET_URL);
    socket = io(SOCKET_URL, SOCKET_CONFIG);
  }
  return socket;
}

/**
 * Disconnect and destroy the socket instance.
 * Useful for cleanup on app unmount or manual disconnect.
 */
export function disconnectSocket(): void {
  if (socket) {
    console.log('[Socket] Disconnecting socket');
    socket.disconnect();
    socket = null;
  }
}

/**
 * Check if socket is currently connected
 */
export function isSocketConnected(): boolean {
  return socket?.connected ?? false;
}

/**
 * Force reconnect the socket
 */
export function reconnectSocket(): void {
  if (socket) {
    console.log('[Socket] Reconnecting...');
    socket.connect();
  } else {
    // Create new socket if none exists
    getSocket();
  }
}
