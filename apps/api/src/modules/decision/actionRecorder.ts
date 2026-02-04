/**
 * ActionRecorder — Records executed actions per tick for replay/debugging.
 *
 * Ring buffer holding the last 500 ticks of action history.
 */

import type { ResolvedAction } from './types';

interface TickRecord {
  tick: number;
  actions: ResolvedAction[];
  recordedAt: string;
}

const MAX_TICKS = 500;

class ActionRecorder {
  private buffer: TickRecord[] = [];

  record(tick: number, actions: ResolvedAction[]): void {
    this.buffer.unshift({
      tick,
      actions,
      recordedAt: new Date().toISOString(),
    });
    if (this.buffer.length > MAX_TICKS) {
      this.buffer.length = MAX_TICKS;
    }
  }

  getByTick(tick: number): TickRecord | undefined {
    return this.buffer.find((r) => r.tick === tick);
  }

  getRecent(limit: number): TickRecord[] {
    return this.buffer.slice(0, limit);
  }

  size(): number {
    return this.buffer.length;
  }
}

export const actionRecorder = new ActionRecorder();
