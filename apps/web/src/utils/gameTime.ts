/**
 * Human-readable game time formatting.
 * Converts tick number + season into "Week 3 · Summer" style labels.
 */
import { getWeekInSeason, WEEK_TICKS } from '@agentropolis/shared';

/** Format tick as "Week N" (1-indexed week within season) */
export function formatWeek(tick: number): string {
  const week = getWeekInSeason(tick) + 1;
  return `Week ${week}`;
}

/** Format tick as "Day N" within week (1-indexed) */
export function formatDay(tick: number): string {
  const dayInWeek = ((tick - 1) % WEEK_TICKS) + 1;
  return `Day ${dayInWeek}`;
}

/** Capitalize season name */
export function formatSeason(season: string): string {
  return season.charAt(0).toUpperCase() + season.slice(1).toLowerCase();
}

/** Full human-readable time: "Week 3 · Summer" */
export function formatGameTime(tick: number, season?: string): string {
  const week = formatWeek(tick);
  if (season) {
    return `${week} · ${formatSeason(season)}`;
  }
  return week;
}
