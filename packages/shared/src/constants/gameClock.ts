/**
 * GameClock — Centralized time-scale helpers for the simulation.
 *
 * All periodic checks should use these instead of raw modulo with magic numbers.
 *
 * Time scales:
 *   Tick  = 1 unit (20s real-time)  — heartbeat
 *   Week  = 7 ticks                 — settlement / big-effect cadence
 *   Season = 100 ticks              — macro-economic cycles
 */

import { WEEK_TICKS, SEASON_TICKS, SEASON_RAMP_TICKS } from './economy';

/** True on the first tick of each week (tick 7, 14, 21, …) */
export function isWeekBoundary(tick: number): boolean {
  return tick > 0 && tick % WEEK_TICKS === 0;
}

/** True on the first tick of each season (tick 1, 101, 201, …) */
export function isSeasonBoundary(tick: number): boolean {
  return tick === 1 || tick % SEASON_TICKS === 1;
}

/** Which week number within the current season (0-indexed) */
export function getWeekInSeason(tick: number): number {
  const tickInSeason = ((tick - 1) % SEASON_TICKS);
  return Math.floor(tickInSeason / WEEK_TICKS);
}

/** Absolute week number since simulation start (0-indexed) */
export function getWeekNumber(tick: number): number {
  return Math.floor((tick - 1) / WEEK_TICKS);
}

/**
 * Season transition progress: 0.0 → 1.0 over the first SEASON_RAMP_TICKS
 * of a new season. Returns 1.0 for the rest of the season.
 *
 * Use this to ramp economic parameters gradually at season boundaries.
 */
export function getSeasonRampProgress(tick: number): number {
  const tickInSeason = ((tick - 1) % SEASON_TICKS);
  if (tickInSeason >= SEASON_RAMP_TICKS) return 1.0;
  return tickInSeason / SEASON_RAMP_TICKS;
}

/** Remaining ticks in the current season */
export function getRemainingSeasonTicks(tick: number): number {
  const tickInSeason = ((tick - 1) % SEASON_TICKS) + 1;
  return Math.max(1, SEASON_TICKS - tickInSeason + 1);
}

/** Remaining weeks in the current season */
export function getRemainingSeasonWeeks(tick: number): number {
  return Math.max(1, Math.ceil(getRemainingSeasonTicks(tick) / WEEK_TICKS));
}
