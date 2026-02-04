/**
 * PolicyState — Spectator voting system with modifier layer (S5.5).
 *
 * Each week, a policy vote is created with 2-3 options.
 * Spectators vote (1 vote per spectator per week).
 * At week boundary, the winner is applied as a modifier.
 * Modifiers are bounded to ±5% to prevent simulation breakage.
 *
 * The tick pipeline reads modifiers via getActivePolicy().
 */

import type {
  PolicyCategory,
  PolicyOption,
  PolicyVotePayload,
  ActivePolicyModifiers,
} from '@agentropolis/shared/contracts/v2';
import { isWeekBoundary, getWeekNumber } from '@agentropolis/shared';
import { publishEvent } from './eventStore';

// ============ POLICY TEMPLATES ============

const MODIFIER_CAP = 0.05; // ±5% max

interface PolicyTemplate {
  category: PolicyCategory;
  options: Array<{
    label: string;
    description: string;
    modifier: number;
  }>;
}

const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    category: 'tax_rate',
    options: [
      { label: 'Lower taxes', description: 'Reduce tax rate by 2% — more money for agents, less for treasury', modifier: -0.02 },
      { label: 'Raise taxes', description: 'Increase tax rate by 2% — more treasury income, less for agents', modifier: 0.02 },
      { label: 'Keep current', description: 'No change to tax rate', modifier: 0 },
    ],
  },
  {
    category: 'police_budget',
    options: [
      { label: 'Boost police', description: 'Increase police catch chance by 5% — safer streets, higher costs', modifier: 0.05 },
      { label: 'Cut police', description: 'Reduce police catch chance by 5% — lower costs, more crime risk', modifier: -0.05 },
      { label: 'Keep current', description: 'No change to police budget', modifier: 0 },
    ],
  },
  {
    category: 'park_investment',
    options: [
      { label: 'Build parks', description: 'Invest in leisure — agents get +5% fun from relax actions', modifier: 0.05 },
      { label: 'Sell parks', description: 'Disinvest from leisure — agents get -3% fun from relax actions', modifier: -0.03 },
      { label: 'Keep current', description: 'No change to park investment', modifier: 0 },
    ],
  },
];

let optionIdCounter = 0;

// ============ POLICY STATE ============

class PolicyState {
  /** Active modifiers applied to the simulation */
  private modifiers: ActivePolicyModifiers = {
    taxRateModifier: 0,
    policeBudgetModifier: 0,
    parkInvestmentModifier: 0,
  };

  /** Current vote in progress */
  private currentVote: PolicyVotePayload | null = null;
  /** Vote tracking: socketId → optionId */
  private votes = new Map<string, string>();
  /** Policy history for season report */
  private history: Array<{ weekNumber: number; winner: PolicyOption; effect: string }> = [];

  /**
   * Called each tick. On week boundaries:
   *   - Resolves current vote
   *   - Creates new vote for next week
   */
  onTick(tick: number): void {
    if (!isWeekBoundary(tick)) return;

    const weekNumber = getWeekNumber(tick);

    // Resolve current vote
    if (this.currentVote && !this.currentVote.resolved) {
      this.resolveVote(tick);
    }

    // Create new vote
    this.createVote(weekNumber);
  }

  /** Cast a vote (called from REST endpoint) */
  castVote(socketId: string, optionId: string): { ok: boolean; reason?: string } {
    if (!this.currentVote || this.currentVote.resolved) {
      return { ok: false, reason: 'no_active_vote' };
    }

    // Check if option exists
    const option = this.currentVote.options.find((o) => o.id === optionId);
    if (!option) {
      return { ok: false, reason: 'invalid_option' };
    }

    // Check if already voted
    if (this.votes.has(socketId)) {
      return { ok: false, reason: 'already_voted' };
    }

    // Cast vote
    this.votes.set(socketId, optionId);
    this.currentVote.voteCounts[optionId] = (this.currentVote.voteCounts[optionId] ?? 0) + 1;
    this.currentVote.totalVotes++;

    return { ok: true };
  }

  /** Get current vote state (for REST endpoint) */
  getCurrentVote(): PolicyVotePayload | null {
    return this.currentVote;
  }

  /** Get active modifiers (for tick pipeline) */
  getActivePolicy(): ActivePolicyModifiers {
    return { ...this.modifiers };
  }

  /** Get policy history for season report */
  getHistory(): Array<{ weekNumber: number; winner: PolicyOption; effect: string }> {
    return [...this.history];
  }

  /** Reset season history */
  resetSeason(): void {
    this.history = [];
  }

  // ============ PRIVATE ============

  private createVote(weekNumber: number): void {
    // Pick a random policy template
    const template = POLICY_TEMPLATES[weekNumber % POLICY_TEMPLATES.length];

    const options: PolicyOption[] = template.options.map((opt) => {
      optionIdCounter++;
      return {
        id: `vote-${optionIdCounter}`,
        category: template.category,
        label: opt.label,
        description: opt.description,
        modifier: opt.modifier,
      };
    });

    const voteCounts: Record<string, number> = {};
    for (const opt of options) {
      voteCounts[opt.id] = 0;
    }

    this.currentVote = {
      weekNumber,
      options,
      voteCounts,
      totalVotes: 0,
      deadline: new Date(Date.now() + 7 * 20_000).toISOString(), // ~7 ticks
      resolved: false,
    };
    this.votes.clear();

    publishEvent('policy_vote', `New vote: ${template.category.replace('_', ' ')}`, 0, {
      severity: 'minor',
      tags: ['vote', 'weekly'],
      detail: options.map((o) => o.label).join(' vs '),
      channel: 'story',
      category: 'policy_vote',
    });
  }

  private resolveVote(tick: number): void {
    if (!this.currentVote) return;

    this.currentVote.resolved = true;

    // Find winner (most votes, or first option if tie/no votes)
    let winnerId = this.currentVote.options[0].id;
    let maxVotes = 0;

    for (const [optId, count] of Object.entries(this.currentVote.voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
        winnerId = optId;
      }
    }

    const winner = this.currentVote.options.find((o) => o.id === winnerId)!;
    this.currentVote.winner = winner;

    // Apply modifier (capped)
    this.applyModifier(winner.category, winner.modifier);

    // Record history
    const effectLabel = winner.modifier === 0
      ? 'No change'
      : `${winner.modifier > 0 ? '+' : ''}${Math.round(winner.modifier * 100)}% ${winner.category.replace('_', ' ')}`;

    this.history.push({
      weekNumber: this.currentVote.weekNumber,
      winner,
      effect: effectLabel,
    });

    publishEvent('policy_result', `Vote result: ${winner.label} (${this.currentVote.totalVotes} votes)`, tick, {
      severity: 'minor',
      tags: ['vote', 'weekly'],
      detail: effectLabel,
      channel: 'story',
      category: 'policy_result',
    });
  }

  private applyModifier(category: PolicyCategory, modifier: number): void {
    switch (category) {
      case 'tax_rate':
        this.modifiers.taxRateModifier = this.clamp(this.modifiers.taxRateModifier + modifier);
        break;
      case 'police_budget':
        this.modifiers.policeBudgetModifier = this.clamp(this.modifiers.policeBudgetModifier + modifier);
        break;
      case 'park_investment':
        this.modifiers.parkInvestmentModifier = this.clamp(this.modifiers.parkInvestmentModifier + modifier);
        break;
    }
  }

  private clamp(value: number): number {
    return Math.max(-MODIFIER_CAP, Math.min(MODIFIER_CAP, value));
  }
}

export const policyState = new PolicyState();

/** Convenience accessor for tick pipeline */
export function getActivePolicy(): ActivePolicyModifiers {
  return policyState.getActivePolicy();
}
