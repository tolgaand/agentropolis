/**
 * useTimeState - Server-centric time state hook using centralized socket
 *
 * REFACTORED: Now uses the centralized socket singleton from ../socket/
 * instead of creating its own connection.
 *
 * Time is ONLY managed by the server. This hook:
 * 1. Reads time state from centralized socket context
 * 2. Time updates come via socket events handled in socket.context.tsx
 * 3. NEVER simulates time locally
 */

import { useMemo } from 'react';
import type { TimeState } from '@agentropolis/shared';
import { useSocketContext } from '../socket';
import { DEFAULT_WEATHER, type WeatherState } from '../lib/time';

const DEFAULT_TIME_STATE: TimeState = {
  dayIndex: 1,
  minuteOfDay: 540,
  phase: 'day',
  hourDisplay: '09:00',
  isNewPhase: false,
};

export interface UseTimeStateOptions {
  /** @deprecated No longer used - time comes from socket */
  timeApiUrl?: string;
}

export interface TimeWeatherState {
  timeState: TimeState;
  weatherState: WeatherState;
  isConnected: boolean;
  isLoading: boolean;
}

/**
 * Hook for time and weather state using the centralized socket context.
 *
 * NOTE: This hook now reads from the centralized SocketContext.
 * The socket connection is managed by SocketProvider in App.tsx.
 * Time updates are handled via time.tick and city_event in socket.context.tsx.
 *
 * @param _options - Deprecated, no longer used
 */
export function useTimeState(_options: UseTimeStateOptions = {}): TimeWeatherState {
  // Get state from centralized socket context
  const { mapTimeState, connectionStatus } = useSocketContext();

  const isConnected = connectionStatus === 'synced';
  const isLoading = connectionStatus === 'connecting' || connectionStatus === 'connected';

  // Use mapTimeState from context (which is updated by city_event and map_state)
  const timeState: TimeState = mapTimeState ?? DEFAULT_TIME_STATE;

  // Weather state (static for now, can be extended)
  const weatherState = useMemo<WeatherState>(() => DEFAULT_WEATHER, []);

  return { timeState, weatherState, isConnected, isLoading };
}
