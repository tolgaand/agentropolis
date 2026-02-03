/**
 * useSocket Hook - Raw Socket Access
 *
 * Provides direct access to the typed socket instance for custom event handling.
 * For most use cases, prefer the higher-level hooks:
 * - useEvent() for event subscription
 * - useSocketContext() for full state access
 *
 * @example
 * ```tsx
 * const socket = useSocket();
 * socket.emit('custom.event', { data: 'value' });
 * ```
 */

// Re-export useSocket from context for dedicated import path
export { useSocket } from './socket.context';
export type { TypedSocket } from './socket.client';
