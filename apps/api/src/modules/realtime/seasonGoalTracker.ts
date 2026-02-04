/**
 * SeasonGoalTracker — Selects goals at season start, tracks progress,
 * produces outcome event at season end (S5.1).
 *
 * Goals are automatically chosen based on current city metrics:
 *   - "Reduce unemployment below X%"
 *   - "Increase active businesses by +N"
 *   - "Reduce crime rate below X%"
 *   - "Keep treasury above Y CRD"
 *
 * 2-4 goals per season. Evaluation runs every tick to update progress bars.
 */

import type {
  CityMetricsPayload,
  SeasonGoal,
  SeasonGoalsPayload,
  SeasonOutcomeData,
} from '@agentropolis/shared/contracts/v2';
import { isSeasonBoundary } from '@agentropolis/shared';
import { publishEvent } from './eventStore';

// ============ GOAL TEMPLATES ============

interface GoalTemplate {
  metric: SeasonGoal['metric'];
  direction: SeasonGoal['direction'];
  /** Given current value, produce a target and label */
  generate(current: number): { target: number; label: string } | null;
}

const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    metric: 'unemploymentRate',
    direction: 'below',
    generate(current: number) {
      if (current <= 0.05) return null; // already very low
      const target = Math.max(0.05, current - 0.15);
      return {
        target,
        label: `Reduce unemployment below ${Math.round(target * 100)}%`,
      };
    },
  },
  {
    metric: 'openBusinesses',
    direction: 'increase',
    generate(current: number) {
      const increase = Math.max(1, Math.ceil(current * 0.2));
      return {
        target: current + increase,
        label: `Grow active businesses to ${current + increase}+`,
      };
    },
  },
  {
    metric: 'crimeRateLast10',
    direction: 'below',
    generate(current: number) {
      if (current <= 0.02) return null; // already very low
      const target = Math.max(0.02, current - 0.10);
      return {
        target,
        label: `Reduce crime rate below ${Math.round(target * 100)}%`,
      };
    },
  },
  {
    metric: 'treasury',
    direction: 'above',
    generate(current: number) {
      if (current >= 10_000) {
        // Already high — maintain goal
        return { target: 8_000, label: 'Keep treasury above 8,000 CRD' };
      }
      const target = Math.max(500, Math.round(current * 1.3));
      return { target, label: `Grow treasury to ${target}+ CRD` };
    },
  },
];

let goalIdCounter = 0;

// ============ TRACKER ============

class SeasonGoalTracker {
  private currentGoals: SeasonGoal[] = [];
  private currentSeason = '';
  private seasonStartTick = 0;

  /**
   * Called every tick. Handles:
   *  - Season start: select goals
   *  - Mid-season: update progress
   *  - Season end: produce outcome
   */
  onTick(
    tick: number,
    metrics: CityMetricsPayload,
  ): { goals: SeasonGoalsPayload | null; outcome: SeasonOutcomeData | null } {
    let outcome: SeasonOutcomeData | null = null;

    // Season boundary: finalize old goals, then start new ones
    if (isSeasonBoundary(tick)) {
      // Finalize previous season (if we had goals)
      if (this.currentGoals.length > 0) {
        outcome = this.finalizeGoals(metrics);
      }
      // Start new season goals
      this.startNewSeason(tick, metrics);
    }

    // Update progress
    this.updateProgress(metrics);

    const goals: SeasonGoalsPayload = {
      season: metrics.season,
      seasonTick: this.seasonStartTick,
      goals: this.currentGoals,
    };

    return { goals, outcome };
  }

  /** Get current goals (for REST endpoint / reconnect) */
  getCurrentGoals(): SeasonGoalsPayload | null {
    if (this.currentGoals.length === 0) return null;
    return {
      season: this.currentSeason,
      seasonTick: this.seasonStartTick,
      goals: this.currentGoals,
    };
  }

  private startNewSeason(tick: number, metrics: CityMetricsPayload): void {
    this.currentSeason = metrics.season;
    this.seasonStartTick = tick;
    this.currentGoals = this.selectGoals(metrics);

    if (this.currentGoals.length > 0) {
      publishEvent('season_goals', `New season: ${this.currentGoals.length} goals set`, tick, {
        severity: 'minor',
        tags: ['economy', 'season'],
        detail: this.currentGoals.map((g) => g.label).join(' | '),
        channel: 'story',
        category: 'season_goals',
      });
    }
  }

  private selectGoals(metrics: CityMetricsPayload): SeasonGoal[] {
    const metricValues: Record<SeasonGoal['metric'], number> = {
      unemploymentRate: metrics.unemploymentRate,
      openBusinesses: metrics.openBusinesses,
      crimeRateLast10: metrics.crimeRateLast10,
      treasury: metrics.treasury,
    };

    const candidates: SeasonGoal[] = [];

    for (const template of GOAL_TEMPLATES) {
      const current = metricValues[template.metric];
      const result = template.generate(current);
      if (!result) continue;

      goalIdCounter++;
      candidates.push({
        id: `goal-${goalIdCounter}`,
        label: result.label,
        metric: template.metric,
        direction: template.direction,
        target: result.target,
        startValue: current,
        currentValue: current,
        progress: 0,
        completed: false,
      });
    }

    // Pick 2-4 goals (shuffle and take)
    const shuffled = candidates.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(4, Math.max(2, shuffled.length)));
  }

  private updateProgress(metrics: CityMetricsPayload): void {
    const metricValues: Record<SeasonGoal['metric'], number> = {
      unemploymentRate: metrics.unemploymentRate,
      openBusinesses: metrics.openBusinesses,
      crimeRateLast10: metrics.crimeRateLast10,
      treasury: metrics.treasury,
    };

    for (const goal of this.currentGoals) {
      goal.currentValue = metricValues[goal.metric];
      goal.progress = this.calculateProgress(goal);
      goal.completed = goal.progress >= 1.0;
    }
  }

  private calculateProgress(goal: SeasonGoal): number {
    const { direction, startValue, currentValue, target } = goal;

    switch (direction) {
      case 'below': {
        // Need current to go below target. Start is above target.
        if (currentValue <= target) return 1.0;
        if (startValue <= target) return 1.0; // was already below
        const totalNeeded = startValue - target;
        if (totalNeeded <= 0) return 1.0;
        return Math.max(0, Math.min(1, (startValue - currentValue) / totalNeeded));
      }
      case 'above': {
        // Need current to be above target
        if (currentValue >= target) return 1.0;
        if (startValue >= target) {
          // Was already above — progress = how much we maintained
          return currentValue >= target ? 1.0 : currentValue / target;
        }
        const totalNeeded = target - startValue;
        if (totalNeeded <= 0) return 1.0;
        return Math.max(0, Math.min(1, (currentValue - startValue) / totalNeeded));
      }
      case 'increase': {
        // Need current to increase to target
        if (currentValue >= target) return 1.0;
        const totalNeeded = target - startValue;
        if (totalNeeded <= 0) return 1.0;
        return Math.max(0, Math.min(1, (currentValue - startValue) / totalNeeded));
      }
      case 'decrease': {
        // Need current to decrease to target
        if (currentValue <= target) return 1.0;
        const totalNeeded = startValue - target;
        if (totalNeeded <= 0) return 1.0;
        return Math.max(0, Math.min(1, (startValue - currentValue) / totalNeeded));
      }
    }
  }

  private finalizeGoals(metrics: CityMetricsPayload): SeasonOutcomeData {
    this.updateProgress(metrics);

    const goalsWithOutcome = this.currentGoals.map((g) => ({
      ...g,
      outcome: (g.completed ? 'success' : 'failure') as 'success' | 'failure',
    }));

    const successCount = goalsWithOutcome.filter((g) => g.outcome === 'success').length;
    const totalCount = goalsWithOutcome.length;

    const outcome: SeasonOutcomeData = {
      season: this.currentSeason,
      goals: goalsWithOutcome,
      successCount,
      totalCount,
    };

    // Publish season outcome as story event
    const resultLabel = successCount === totalCount
      ? 'All goals achieved!'
      : successCount > 0
        ? `${successCount}/${totalCount} goals achieved`
        : 'No goals achieved';

    publishEvent('season_outcome', `Season ${this.currentSeason} ended: ${resultLabel}`, metrics.tick, {
      severity: successCount === totalCount ? 'minor' : successCount === 0 ? 'major' : 'minor',
      tags: ['economy', 'season'],
      detail: JSON.stringify(outcome),
      channel: 'story',
      category: 'season_outcome',
    });

    return outcome;
  }
}

export const seasonGoalTracker = new SeasonGoalTracker();
