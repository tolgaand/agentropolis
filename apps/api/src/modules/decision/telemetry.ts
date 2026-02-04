/**
 * DecisionTelemetry — In-memory ring buffer for decision tracking.
 *
 * Records decision outcomes (external vs fallback, latency, validity)
 * and provides aggregate statistics for the telemetry REST endpoint.
 */

import type { DecisionTelemetryRecord, DecisionTelemetryAggregates } from './types';

const MAX_SIZE = 5000;

class DecisionTelemetry {
  private buffer: DecisionTelemetryRecord[] = [];

  record(entry: DecisionTelemetryRecord): void {
    this.buffer.unshift(entry);
    if (this.buffer.length > MAX_SIZE) {
      this.buffer.length = MAX_SIZE;
    }
  }

  getRecent(limit: number): DecisionTelemetryRecord[] {
    return this.buffer.slice(0, limit);
  }

  getAggregates(): DecisionTelemetryAggregates {
    const total = this.buffer.length;
    if (total === 0) {
      return {
        totalDecisions: 0,
        fallbackCount: 0,
        fallbackRate: 0,
        avgDecisionLatencyMs: 0,
        invalidActionCount: 0,
        invalidActionRate: 0,
      };
    }

    let fallbackCount = 0;
    let totalLatency = 0;
    let invalidCount = 0;

    for (const entry of this.buffer) {
      if (entry.source === 'fallback') fallbackCount++;
      totalLatency += entry.latencyMs;
      if (!entry.accepted) invalidCount++;
    }

    return {
      totalDecisions: total,
      fallbackCount,
      fallbackRate: fallbackCount / total,
      avgDecisionLatencyMs: totalLatency / total,
      invalidActionCount: invalidCount,
      invalidActionRate: invalidCount / total,
    };
  }

  size(): number {
    return this.buffer.length;
  }
}

export const decisionTelemetry = new DecisionTelemetry();
