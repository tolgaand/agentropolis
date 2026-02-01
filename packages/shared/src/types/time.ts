export type TimePhase = 'morning' | 'day' | 'evening' | 'night';

export interface TimeState {
  dayIndex: number;
  minuteOfDay: number; // 0-1439
  phase: TimePhase;
  hourDisplay: string; // "14:30"
  isNewPhase: boolean;
}
