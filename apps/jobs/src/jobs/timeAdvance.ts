import { TimeStateModel } from '@agentropolis/db';
import type { TimeState } from '@agentropolis/shared';
import { advanceTimeState, formatHourDisplay } from '../utils/time';

const DEFAULT_STATE: TimeState = {
  dayIndex: 0,
  minuteOfDay: 0,
  phase: 'night',
  hourDisplay: formatHourDisplay(0),
  isNewPhase: false,
};

async function getTimeState(): Promise<TimeState> {
  const existing = await TimeStateModel.findOne({ key: 'global' });
  if (!existing) return DEFAULT_STATE;

  return {
    dayIndex: existing.dayIndex,
    minuteOfDay: existing.minuteOfDay,
    phase: existing.phase,
    hourDisplay: existing.hourDisplay,
    isNewPhase: false,
  };
}

function normalizeMinutes(value?: number): number {
  if (!value || Number.isNaN(value)) return 1;
  return Math.max(Math.floor(value), 1);
}

export async function advanceTime(data: { minutes?: number }): Promise<TimeState> {
  const current = await getTimeState();
  const minutes = normalizeMinutes(data.minutes);
  const next = advanceTimeState(current, minutes);

  await TimeStateModel.updateOne(
    { key: 'global' },
    {
      $set: {
        dayIndex: next.dayIndex,
        minuteOfDay: next.minuteOfDay,
        phase: next.phase,
        hourDisplay: next.hourDisplay,
        isNewPhase: next.isNewPhase,
      },
      $setOnInsert: { key: 'global' },
    },
    { upsert: true }
  );

  if (next.isNewPhase) {
    console.log(`✓ Phase changed to ${next.phase}`);
  }

  return next;
}
