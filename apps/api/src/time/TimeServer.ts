/**
 * TimeServer - Server-centric time management
 *
 * Broadcasts time_changed events to all connected clients via Socket.io.
 * 60 real-time minutes = 1 game day (1440 game minutes)
 * Time phases: morning (05:00-09:00), day (09:00-17:00), evening (17:00-21:00), night (21:00-05:00)
 */

import type { TimePhase, TimeChangedPayload, RealtimeEvent, TimeTick } from '@agentropolis/shared';
import { broadcastEvent, broadcastTimeTick } from '../socket';

// Time constants
const REAL_MINUTES_PER_GAME_DAY = 60;
const GAME_MINUTES_PER_DAY = 1440;

// Tick interval: 60 real minutes / 1440 game minutes = 0.0417 real minutes per game minute
// = 2.5 seconds per game minute
const TICK_INTERVAL_MS = 2500;

// Phase boundaries (game minutes)
const PHASES = {
  MORNING: { start: 300, end: 540 },   // 05:00 - 09:00
  DAY: { start: 540, end: 1020 },      // 09:00 - 17:00
  EVENING: { start: 1020, end: 1260 }, // 17:00 - 21:00
  NIGHT: { start: 1260, end: 300 },    // 21:00 - 05:00 (wraps around)
} as const;

interface TimeServerState {
  dayIndex: number;
  minuteOfDay: number;
  phase: TimePhase;
  startedAt: number;  // Unix timestamp when server started
}

class TimeServer {
  private state: TimeServerState;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    // Start at day 1, 09:00 (day phase)
    this.state = {
      dayIndex: 1,
      minuteOfDay: PHASES.DAY.start,
      phase: 'day',
      startedAt: Date.now(),
    };
  }

  /**
   * Start the time server tick loop
   */
  start(): void {
    if (this.isRunning) {
      console.log('[TimeServer] Already running');
      return;
    }

    console.log('[TimeServer] Starting time server...');
    console.log(`[TimeServer] Tick interval: ${TICK_INTERVAL_MS}ms (${REAL_MINUTES_PER_GAME_DAY} real min = 1 game day)`);
    console.log(`[TimeServer] Initial state: Day ${this.state.dayIndex}, ${this.formatTime(this.state.minuteOfDay)} (${this.state.phase})`);

    this.isRunning = true;
    this.intervalId = setInterval(() => this.tick(), TICK_INTERVAL_MS);

    // Broadcast initial state
    this.broadcastTime();
  }

  /**
   * Stop the time server
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[TimeServer] Stopped');
  }

  /**
   * Get current time state
   */
  getState(): Readonly<TimeServerState> {
    return { ...this.state };
  }

  /**
   * Get formatted time display (e.g., "14:30")
   */
  getTimeDisplay(): string {
    return this.formatTime(this.state.minuteOfDay);
  }

  /**
   * Advance time by one game minute
   */
  private tick(): void {
    const previousPhase = this.state.phase;

    // Advance minute
    this.state.minuteOfDay++;

    // Handle day rollover
    if (this.state.minuteOfDay >= GAME_MINUTES_PER_DAY) {
      this.state.minuteOfDay = 0;
      this.state.dayIndex++;
      console.log(`[TimeServer] New day: ${this.state.dayIndex}`);
    }

    // Update phase
    this.state.phase = this.calculatePhase(this.state.minuteOfDay);

    // Broadcast to all clients
    this.broadcastTime(previousPhase);

    // Log phase changes
    if (previousPhase !== this.state.phase) {
      console.log(`[TimeServer] Phase changed: ${previousPhase} -> ${this.state.phase} at ${this.formatTime(this.state.minuteOfDay)}`);
    }
  }

  /**
   * Calculate the current phase based on minute of day
   */
  private calculatePhase(minute: number): TimePhase {
    if (minute >= PHASES.MORNING.start && minute < PHASES.MORNING.end) {
      return 'morning';
    }
    if (minute >= PHASES.DAY.start && minute < PHASES.DAY.end) {
      return 'day';
    }
    if (minute >= PHASES.EVENING.start && minute < PHASES.EVENING.end) {
      return 'evening';
    }
    // Night phase: 21:00 (1260) to 05:00 (300) - wraps around midnight
    return 'night';
  }

  /**
   * Format minutes to time display (HH:MM)
   */
  private formatTime(minuteOfDay: number): string {
    const hours = Math.floor(minuteOfDay / 60);
    const minutes = minuteOfDay % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  /**
   * Broadcast current time to all connected clients
   */
  private broadcastTime(previousPhase?: TimePhase): void {
    // Legacy city_event format
    const payload: TimeChangedPayload = {
      dayIndex: this.state.dayIndex,
      minuteOfDay: this.state.minuteOfDay,
      phase: this.state.phase,
      previousPhase: previousPhase ?? this.state.phase,
    };

    const event: RealtimeEvent<TimeChangedPayload> = {
      type: 'time_changed',
      timestamp: new Date().toISOString(),
      payload,
      scope: 'global',
    };

    broadcastEvent(event);

    // New multiverse time.tick format
    const timeTick: TimeTick = {
      day: this.state.dayIndex,
      hour: Math.floor(this.state.minuteOfDay / 60),
      minute: this.state.minuteOfDay % 60,
      speed: 1,
      isPaused: false,
    };

    broadcastTimeTick(timeTick);
  }
}

// Singleton instance
export const timeServer = new TimeServer();
