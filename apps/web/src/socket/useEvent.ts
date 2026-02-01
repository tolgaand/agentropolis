/**
 * useEvent Hook - Type-safe Event Subscription
 *
 * Subscribe to socket events with automatic cleanup.
 * The handler is memoized to prevent unnecessary re-subscriptions.
 */

import { useEffect, useCallback } from 'react';
import { useSocket } from './socket.context';
import type { ServerToClientEvents } from '@agentropolis/shared';

/**
 * Subscribe to a specific socket event.
 * Handler is automatically unsubscribed on unmount or when dependencies change.
 *
 * @param event - Event name (e.g., 'time.tick', 'world.update')
 * @param handler - Event handler function
 *
 * @example
 * ```tsx
 * useEvent('time.tick', (data) => {
 *   console.log('Time:', data.day, data.hour);
 * });
 * ```
 */
export function useEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E]
): void {
  const socket = useSocket();

  // Memoize handler to prevent unnecessary re-subscriptions
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedHandler = useCallback(handler, []);

  useEffect(() => {
    socket.on(event, memoizedHandler as never);

    return () => {
      socket.off(event, memoizedHandler as never);
    };
  }, [socket, event, memoizedHandler]);
}

/**
 * Subscribe to multiple socket events at once.
 *
 * @param handlers - Object mapping event names to handlers
 *
 * @example
 * ```tsx
 * useEvents({
 *   'time.tick': (data) => setTime(data),
 *   'world.update': (data) => updateWorld(data),
 * });
 * ```
 */
export function useEvents(
  handlers: Partial<{
    [E in keyof ServerToClientEvents]: ServerToClientEvents[E];
  }>
): void {
  const socket = useSocket();

  useEffect(() => {
    const entries = Object.entries(handlers) as Array<
      [keyof ServerToClientEvents, ServerToClientEvents[keyof ServerToClientEvents]]
    >;

    // Subscribe to all events
    for (const [event, handler] of entries) {
      if (handler) {
        socket.on(event, handler as never);
      }
    }

    // Cleanup: unsubscribe from all events
    return () => {
      for (const [event, handler] of entries) {
        if (handler) {
          socket.off(event, handler as never);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);
}

export default useEvent;
