/**
 * Time utilities for frontend display
 *
 * Note: Time is SERVER-CENTRIC. These are only display/formatting utilities.
 * All time progression happens on the server via TimeServer.
 */

import type { TimePhase } from '@agentropolis/shared';

// ============================================================================
// Weather (client-side only for now)
// ============================================================================

export type WeatherType = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow';

export interface WeatherState {
  type: WeatherType;
  label: string;
}

export const DEFAULT_WEATHER: WeatherState = { type: 'clear', label: 'Clear' };

// ============================================================================
// Display helpers
// ============================================================================

export function formatTime(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function getPhaseLabel(phase: TimePhase): string {
  switch (phase) {
    case 'morning': return 'Morning';
    case 'day': return 'Day';
    case 'evening': return 'Evening';
    case 'night': return 'Night';
    default: return 'Unknown';
  }
}

export function getPhaseEmoji(phase: TimePhase): string {
  switch (phase) {
    case 'morning': return '🌅';
    case 'day': return '☀️';
    case 'evening': return '🌆';
    case 'night': return '🌙';
    default: return '⏰';
  }
}
