/**
 * HighlightTracker — Selects top moments for weekly/season highlight reels (S5.4).
 *
 * Tracks notable events each tick and produces:
 *   - Weekly highlight reel (3-5 top moments) on week boundaries
 *   - Season highlight reel at season end
 *
 * Categories:
 *   - money: biggest treasury gain/loss
 *   - crime: most dramatic crime event
 *   - building: most buildings opened/closed
 *   - band_change: treasury band transitions (crisis→normal, etc.)
 *   - agent: notable agent events
 */

import type {
  CityMetricsPayload,
  HighlightMoment,
  HighlightReelPayload,
  NewsSeverity,
} from '@agentropolis/shared/contracts/v2';
import { isWeekBoundary, getWeekNumber, isSeasonBoundary } from '@agentropolis/shared';
import { publishEvent } from './eventStore';
import { eventStore } from './eventStore';

// ============ INTERNAL TRACKING ============

interface WeekHighlightState {
  weekNumber: number;
  startTick: number;
  /** Treasury at week start */
  treasuryStart: number;
  /** Biggest single-tick treasury change */
  biggestTreasurySwing: { amount: number; tick: number; direction: 'gain' | 'loss' } | null;
  /** Band changes */
  bandChanges: Array<{ from: string; to: string; tick: number }>;
  /** Previous tick's band */
  lastBand: string;
  /** Previous tick's treasury */
  lastTreasury: number;
  /** Crime events count */
  crimeCount: number;
  /** Building opens/closes */
  buildingOpens: number;
  buildingCloses: number;
}

let momentIdCounter = 0;

class HighlightTracker {
  private weekState: WeekHighlightState | null = null;
  private seasonMoments: HighlightMoment[] = [];
  private lastSeasonReelPayload: HighlightReelPayload | null = null;

  /**
   * Called every tick with metrics.
   * Returns weekly reel on week boundary, season reel on season boundary.
   */
  onTick(
    tick: number,
    metrics: CityMetricsPayload,
  ): { weeklyReel: HighlightReelPayload | null; seasonReel: HighlightReelPayload | null } {
    let weeklyReel: HighlightReelPayload | null = null;
    let seasonReel: HighlightReelPayload | null = null;

    // Season boundary: finalize season reel
    if (isSeasonBoundary(tick) && this.seasonMoments.length > 0) {
      seasonReel = this.finalizeSeasonReel(metrics.season, tick);
    }

    // Week boundary: finalize weekly reel
    if (isWeekBoundary(tick) && this.weekState) {
      weeklyReel = this.finalizeWeeklyReel(tick, metrics);
    }

    // Init or update week state
    if (!this.weekState || isWeekBoundary(tick)) {
      this.weekState = {
        weekNumber: getWeekNumber(tick),
        startTick: tick,
        treasuryStart: metrics.treasury,
        biggestTreasurySwing: null,
        bandChanges: [],
        lastBand: metrics.treasuryBand,
        lastTreasury: metrics.treasury,
        crimeCount: 0,
        buildingOpens: 0,
        buildingCloses: 0,
      };
    }

    // Track treasury swings
    const treasuryDelta = metrics.treasury - this.weekState.lastTreasury;
    if (this.weekState.biggestTreasurySwing === null ||
        Math.abs(treasuryDelta) > Math.abs(this.weekState.biggestTreasurySwing.amount)) {
      if (Math.abs(treasuryDelta) > 50) { // minimum threshold
        this.weekState.biggestTreasurySwing = {
          amount: treasuryDelta,
          tick,
          direction: treasuryDelta >= 0 ? 'gain' : 'loss',
        };
      }
    }

    // Track band changes
    if (metrics.treasuryBand !== this.weekState.lastBand) {
      this.weekState.bandChanges.push({
        from: this.weekState.lastBand,
        to: metrics.treasuryBand,
        tick,
      });
    }

    this.weekState.lastBand = metrics.treasuryBand;
    this.weekState.lastTreasury = metrics.treasury;

    // Count crime/building events from this tick's feed
    const tickEvents = eventStore.recent(50).filter((e) => e.tick === tick);
    for (const event of tickEvents) {
      if (event.type === 'crime' || event.type === 'crime_arc') this.weekState.crimeCount++;
      if (event.headline?.includes('opened') || event.headline?.includes('built')) this.weekState.buildingOpens++;
      if (event.headline?.includes('closed') || event.headline?.includes('shut')) this.weekState.buildingCloses++;
    }

    return { weeklyReel, seasonReel };
  }

  /** Get last season reel (for REST endpoint) */
  getLastSeasonReel(): HighlightReelPayload | null {
    return this.lastSeasonReelPayload;
  }

  // ============ FINALIZE ============

  private finalizeWeeklyReel(tick: number, _metrics: CityMetricsPayload): HighlightReelPayload {
    const ws = this.weekState!;
    const moments: HighlightMoment[] = [];

    // Treasury swing
    if (ws.biggestTreasurySwing) {
      momentIdCounter++;
      moments.push({
        id: `hl-${momentIdCounter}`,
        category: 'money',
        headline: ws.biggestTreasurySwing.direction === 'gain'
          ? `Treasury surged +${ws.biggestTreasurySwing.amount} CRD in a single tick`
          : `Treasury dropped ${ws.biggestTreasurySwing.amount} CRD in a single tick`,
        tick: ws.biggestTreasurySwing.tick,
        severity: Math.abs(ws.biggestTreasurySwing.amount) > 500 ? 'major' : 'minor',
      });
    }

    // Band changes
    for (const bc of ws.bandChanges.slice(0, 2)) {
      momentIdCounter++;
      moments.push({
        id: `hl-${momentIdCounter}`,
        category: 'band_change',
        headline: `Economy shifted from ${bc.from} to ${bc.to}`,
        tick: bc.tick,
        severity: bc.to === 'crisis' ? 'major' : 'minor',
      });
    }

    // Crime summary
    if (ws.crimeCount > 0) {
      momentIdCounter++;
      moments.push({
        id: `hl-${momentIdCounter}`,
        category: 'crime',
        headline: `${ws.crimeCount} crime${ws.crimeCount > 1 ? 's' : ''} reported this week`,
        tick,
        severity: ws.crimeCount >= 5 ? 'major' : ws.crimeCount >= 2 ? 'minor' : 'routine',
      });
    }

    // Building activity
    if (ws.buildingOpens > 0 || ws.buildingCloses > 0) {
      momentIdCounter++;
      const parts: string[] = [];
      if (ws.buildingOpens > 0) parts.push(`${ws.buildingOpens} opened`);
      if (ws.buildingCloses > 0) parts.push(`${ws.buildingCloses} closed`);
      moments.push({
        id: `hl-${momentIdCounter}`,
        category: 'building',
        headline: `Buildings: ${parts.join(', ')}`,
        tick,
        severity: ws.buildingCloses > 2 ? 'minor' : 'routine',
      });
    }

    // Take top 5
    const reel: HighlightReelPayload = {
      period: 'weekly',
      weekNumber: ws.weekNumber,
      moments: moments.slice(0, 5),
    };

    // Add to season moments
    this.seasonMoments.push(...moments);

    // Publish highlight reel as story event
    if (moments.length > 0) {
      publishEvent('highlight_reel', `Week ${ws.weekNumber} Highlights: ${moments.length} moments`, tick, {
        severity: 'minor',
        tags: ['weekly', 'highlights'],
        detail: moments.map((m) => m.headline).join(' | '),
        channel: 'story',
        category: 'highlight_reel',
      });
    }

    return reel;
  }

  private finalizeSeasonReel(season: string, tick: number): HighlightReelPayload {
    // Sort season moments by severity, deduplicate by headline
    const seen = new Set<string>();
    const unique = this.seasonMoments.filter((m) => {
      if (seen.has(m.headline)) return false;
      seen.add(m.headline);
      return true;
    });

    const severityOrder: Record<NewsSeverity, number> = { major: 3, minor: 2, routine: 1 };
    unique.sort((a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0));

    const reel: HighlightReelPayload = {
      period: 'season',
      season,
      moments: unique.slice(0, 10),
    };

    this.lastSeasonReelPayload = reel;

    // Publish season reel
    if (unique.length > 0) {
      publishEvent('highlight_reel', `Season ${season} Highlights: ${unique.length} top moments`, tick, {
        severity: 'minor',
        tags: ['season', 'highlights'],
        detail: unique.slice(0, 5).map((m) => m.headline).join(' | '),
        channel: 'story',
        category: 'highlight_reel',
      });
    }

    // Reset for next season
    this.seasonMoments = [];

    return reel;
  }
}

export const highlightTracker = new HighlightTracker();
