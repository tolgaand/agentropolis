export const TIME = {
  REAL_MINUTES_PER_GAME_DAY: 60,
  MINUTES_PER_GAME_DAY: 1440,
  TICK_INTERVAL_MS: 2500, // 1 game minute per tick

  PHASES: {
    MORNING: { start: 300, end: 540 },   // 05:00 - 09:00
    DAY: { start: 540, end: 1020 },      // 09:00 - 17:00
    EVENING: { start: 1020, end: 1260 }, // 17:00 - 21:00
    NIGHT: { start: 1260, end: 300 },    // 21:00 - 05:00
  },
} as const;

export const PHASE_OVERLAYS = {
  morning: 'rgba(255, 200, 150, 0.1)',
  day: 'rgba(0, 0, 0, 0)',
  evening: 'rgba(255, 150, 100, 0.15)',
  night: 'rgba(20, 30, 80, 0.35)',
} as const;
