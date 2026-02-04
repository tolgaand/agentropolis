/**
 * SeasonReportTracker — Produces end-of-season summary report (S5.7).
 *
 * Captures start-of-season metrics snapshot, then at season end produces
 * a comprehensive report with:
 *   - Metric deltas (start → end)
 *   - Top 5 stories
 *   - Season goal outcomes
 *   - Highlight reel
 *   - Policy vote history
 */

import type {
  CityMetricsPayload,
  SeasonReportPayload,
  SeasonOutcomeData,
} from '@agentropolis/shared/contracts/v2';
import { isSeasonBoundary } from '@agentropolis/shared';
import { publishEvent } from './eventStore';
import { eventStore } from './eventStore';
import { seasonGoalTracker } from './seasonGoalTracker';
import { highlightTracker } from './highlightTracker';
import { policyState } from './policyState';

// ============ INTERNAL STATE ============

interface SeasonSnapshot {
  season: string;
  startTick: number;
  treasury: number;
  unemploymentRate: number;
  crimeRateLast10: number;
  openBusinesses: number;
  agentCount: number;
}

class SeasonReportTracker {
  private startSnapshot: SeasonSnapshot | null = null;
  private lastReport: SeasonReportPayload | null = null;

  /**
   * Called every tick. At season boundaries:
   *   - Finalizes the previous season report
   *   - Captures new season start snapshot
   */
  onTick(tick: number, metrics: CityMetricsPayload): SeasonReportPayload | null {
    if (!isSeasonBoundary(tick)) return null;

    let report: SeasonReportPayload | null = null;

    // Finalize previous season
    if (this.startSnapshot) {
      report = this.buildReport(tick, metrics);
      this.lastReport = report;

      publishEvent('news', `Season Report: ${this.startSnapshot.season}`, tick, {
        severity: 'minor',
        tags: ['season', 'report'],
        detail: `Treasury: ${this.startSnapshot.treasury} → ${metrics.treasury}, Unemployment: ${Math.round(this.startSnapshot.unemploymentRate * 100)}% → ${Math.round(metrics.unemploymentRate * 100)}%`,
        channel: 'story',
        category: 'season_report',
      });
    }

    // Capture new season start
    this.startSnapshot = {
      season: metrics.season,
      startTick: tick,
      treasury: metrics.treasury,
      unemploymentRate: metrics.unemploymentRate,
      crimeRateLast10: metrics.crimeRateLast10,
      openBusinesses: metrics.openBusinesses,
      agentCount: metrics.agentCount,
    };

    // Reset season-scoped trackers
    policyState.resetSeason();

    return report;
  }

  /** Get last season report (for REST endpoint) */
  getLastReport(): SeasonReportPayload | null {
    return this.lastReport;
  }

  // ============ PRIVATE ============

  private buildReport(tick: number, metrics: CityMetricsPayload): SeasonReportPayload {
    const ss = this.startSnapshot!;

    // Top 5 stories from this season
    const seasonEvents = eventStore
      .sinceTick(ss.startTick, 500, 'story')
      .filter((e) => e.tick < tick);

    const severityOrder = { major: 3, minor: 2, routine: 1 };
    const sorted = seasonEvents.sort(
      (a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0),
    );

    const topStories = sorted.slice(0, 5).map((e) => ({
      headline: e.headline,
      type: e.type,
      severity: e.severity,
      tick: e.tick,
    }));

    // Goal outcomes
    const goals = seasonGoalTracker.getCurrentGoals();
    const goalOutcome: SeasonOutcomeData = {
      season: ss.season,
      goals: (goals?.goals ?? []).map((g) => ({
        ...g,
        outcome: (g.completed ? 'success' : 'failure') as 'success' | 'failure',
      })),
      successCount: (goals?.goals ?? []).filter((g) => g.completed).length,
      totalCount: (goals?.goals ?? []).length,
    };

    // Highlights
    const seasonReel = highlightTracker.getLastSeasonReel();

    return {
      season: ss.season,
      tickRange: { start: ss.startTick, end: tick - 1 },
      metricsStart: {
        treasury: ss.treasury,
        unemploymentRate: ss.unemploymentRate,
        crimeRateLast10: ss.crimeRateLast10,
        openBusinesses: ss.openBusinesses,
        agentCount: ss.agentCount,
      },
      metricsEnd: {
        treasury: metrics.treasury,
        unemploymentRate: metrics.unemploymentRate,
        crimeRateLast10: metrics.crimeRateLast10,
        openBusinesses: metrics.openBusinesses,
        agentCount: metrics.agentCount,
      },
      goals: goalOutcome,
      topStories,
      highlightReel: seasonReel?.moments ?? [],
      policyHistory: policyState.getHistory(),
    };
  }
}

export const seasonReportTracker = new SeasonReportTracker();
