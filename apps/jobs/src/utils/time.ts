import type { TimePhase, TimeState } from '@agentropolis/shared';

const MINUTES_PER_DAY = 24 * 60;

export function getNextUtcMidnight(from: Date = new Date()): Date {
  const next = new Date(from);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

export function advanceTimeState(state: TimeState, minutes: number): TimeState {
  const totalMinutes = state.minuteOfDay + minutes;
  const dayIncrement = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const minuteOfDay = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const phase = getPhase(minuteOfDay);

  return {
    dayIndex: state.dayIndex + dayIncrement,
    minuteOfDay,
    phase,
    hourDisplay: formatHourDisplay(minuteOfDay),
    isNewPhase: phase !== state.phase,
  };
}

export function getPhase(minuteOfDay: number): TimePhase {
  const hour = Math.floor(minuteOfDay / 60);

  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'day';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

export function formatHourDisplay(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const hourText = hour.toString().padStart(2, '0');
  const minuteText = minute.toString().padStart(2, '0');
  return `${hourText}:${minuteText}`;
}
