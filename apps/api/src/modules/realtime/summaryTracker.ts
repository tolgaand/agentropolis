/**
 * SummaryTracker — Produces daily snapshots and weekly summaries (S3.6).
 *
 * Daily snapshot: compact 5-metric view published every tick as a FeedEvent.
 * Weekly summary: delta metrics + top 3 events, published on week boundaries.
 */

import type {
  CityMetricsPayload,
  DailySnapshotData,
  WeeklySummaryData,
  FeedEvent,
} from '@agentropolis/shared/contracts/v2';
import { isWeekBoundary, getWeekNumber } from '@agentropolis/shared';
import { publishEvent } from './eventStore';
import { eventStore } from './eventStore';

/** Snapshot at the start of the current week for delta calculations */
interface WeekStartSnapshot {
  weekNumber: number;
  tick: number;
  treasury: number;
  moneySupply: number;
  unemploymentRate: number;
  crimeRateLast10: number;
  openBusinesses: number;
  agentCount: number;
}

class SummaryTracker {
  private weekStart: WeekStartSnapshot | null = null;

  /**
   * Called after every tick with the latest metrics.
   * Returns the daily snapshot data (always) and weekly summary (on week boundaries).
   */
  onTick(
    tick: number,
    metrics: CityMetricsPayload,
  ): { daily: DailySnapshotData; weekly: WeeklySummaryData | null } {
    const daily: DailySnapshotData = {
      tick,
      treasury: metrics.treasury,
      unemploymentRate: metrics.unemploymentRate,
      avgNeeds: metrics.avgNeeds,
      crimeRateLast10: metrics.crimeRateLast10,
      openBusinesses: metrics.openBusinesses,
    };

    // Publish daily snapshot as telemetry (not shown in spectator feed)
    publishEvent('daily_snapshot', `Day ${tick}: Treasury $${metrics.treasury}, ${(metrics.unemploymentRate * 100).toFixed(0)}% unemp`, tick, {
      severity: 'routine',
      tags: ['economy', 'daily'],
      detail: JSON.stringify(daily),
      channel: 'telemetry',
    });

    // Initialize week start on first tick
    if (!this.weekStart) {
      this.weekStart = this.captureWeekStart(tick, metrics);
    }

    let weekly: WeeklySummaryData | null = null;

    if (isWeekBoundary(tick) && this.weekStart) {
      weekly = this.produceWeeklySummary(tick, metrics);

      // Publish weekly summary as a story event (shown in spectator feed)
      publishEvent('weekly_summary', this.formatWeeklyHeadline(weekly), tick, {
        severity: 'minor',
        tags: ['economy', 'weekly'],
        detail: JSON.stringify(weekly),
        channel: 'story',
        category: 'weekly',
      });

      // Reset week start for next week
      this.weekStart = this.captureWeekStart(tick, metrics);
    }

    return { daily, weekly };
  }

  private captureWeekStart(tick: number, m: CityMetricsPayload): WeekStartSnapshot {
    return {
      weekNumber: getWeekNumber(tick),
      tick,
      treasury: m.treasury,
      moneySupply: m.moneySupply,
      unemploymentRate: m.unemploymentRate,
      crimeRateLast10: m.crimeRateLast10,
      openBusinesses: m.openBusinesses,
      agentCount: m.agentCount,
    };
  }

  private produceWeeklySummary(tick: number, m: CityMetricsPayload): WeeklySummaryData {
    const ws = this.weekStart!;
    const weekNumber = getWeekNumber(tick);

    // Collect top events from this week
    const weekEvents: FeedEvent[] = eventStore
      .recent(200)
      .filter((e) => e.tick > ws.tick && e.tick <= tick)
      .filter((e) => e.type !== 'tick' && e.type !== 'daily_snapshot');

    // Pick top 3 by severity (major > minor > routine)
    const severityOrder = { major: 3, minor: 2, routine: 1 };
    const sorted = weekEvents.sort(
      (a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0),
    );

    const topEvents = sorted.slice(0, 3).map((e) => ({
      headline: e.headline,
      type: e.type,
      severity: e.severity,
    }));

    return {
      weekNumber,
      tickRange: { start: ws.tick, end: tick },
      deltas: {
        treasury: m.treasury - ws.treasury,
        moneySupply: m.moneySupply - ws.moneySupply,
        unemploymentRate: m.unemploymentRate - ws.unemploymentRate,
        crimeRateLast10: m.crimeRateLast10 - ws.crimeRateLast10,
        openBusinesses: m.openBusinesses - ws.openBusinesses,
        agentCount: m.agentCount - ws.agentCount,
      },
      topEvents,
      season: m.season,
      treasuryBand: m.treasuryBand,
    };
  }

  private formatWeeklyHeadline(w: WeeklySummaryData): string {
    const treasuryDir = w.deltas.treasury > 0 ? '↑' : w.deltas.treasury < 0 ? '↓' : '→';
    const unempDir = w.deltas.unemploymentRate > 0 ? '↑' : w.deltas.unemploymentRate < 0 ? '↓' : '→';
    return `Week ${w.weekNumber} Summary: Treasury ${treasuryDir}${Math.abs(w.deltas.treasury)} CRD, Unemployment ${unempDir}${Math.abs(Math.round(w.deltas.unemploymentRate * 100))}%`;
  }
}

export const summaryTracker = new SummaryTracker();
