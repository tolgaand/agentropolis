/**
 * CareerArcTracker — Tracks agent career progression across ticks (S5.3).
 *
 * Unlike CrimeArcTracker (short-lived arcs), career arcs are long-running:
 * they accumulate events over a season and produce:
 *   - Weekly "character cards" with behavior summaries
 *   - Career story cards on significant milestones (hired, promoted, fired)
 *
 * Career milestones detected from agent_updated outcomes:
 *   - "applied to X" / "hired at X"
 *   - "promoted to Y"
 *   - "fired" / "quit"
 */

import type {
  FeedEvent,
  CharacterCard,
  ArcCard,
} from '@agentropolis/shared/contracts/v2';
import { isWeekBoundary, getWeekNumber } from '@agentropolis/shared';
import { publishEvent } from './eventStore';

// ============ PER-AGENT CAREER STATE ============

interface AgentCareerState {
  agentId: string;
  agentName: string;
  profession: string;
  reputation: number;
  balance: number;
  /** Action counts in current week */
  weekActions: {
    work: number;
    eat: number;
    sleep: number;
    relax: number;
    crime: number;
  };
  /** Career milestones this season */
  milestones: Array<{
    description: string;
    tick: number;
  }>;
  lastTick: number;
}

let arcIdCounter = 0;

class CareerArcTracker {
  private agents = new Map<string, AgentCareerState>();

  /**
   * Process a feed event for career tracking.
   * Returns true if a milestone career_arc story card was emitted.
   */
  processEvent(event: FeedEvent, tick: number): boolean {
    // Track agent_joined events
    if (event.type === 'agent_joined') {
      const name = event.headline.replace(' joined the city', '');
      const profession = event.detail?.replace('Profession: ', '') ?? 'worker';
      this.getOrCreate(this.extractAgentId(event) ?? `unknown-${tick}`, name, profession);
      return false; // don't suppress the event
    }

    // Track agent_updated events for career activity
    if (event.type === 'agent_updated') {
      const agentId = this.extractAgentId(event);
      if (!agentId) return false;

      const state = this.agents.get(agentId);
      if (!state) return false;

      state.lastTick = tick;

      // Count action types from outcome text
      const outcome = event.headline.toLowerCase();
      if (outcome.includes('worked') || outcome.includes('work')) state.weekActions.work++;
      else if (outcome.includes('ate') || outcome.includes('eat')) state.weekActions.eat++;
      else if (outcome.includes('slept') || outcome.includes('sleep')) state.weekActions.sleep++;
      else if (outcome.includes('relax')) state.weekActions.relax++;

      // Detect career milestones
      if (outcome.includes('hired') || outcome.includes('applied') || outcome.includes('employed')) {
        state.milestones.push({ description: event.headline, tick });
        return this.emitCareerMilestone(state, 'hired', tick);
      }
      if (outcome.includes('promoted')) {
        state.milestones.push({ description: event.headline, tick });
        return this.emitCareerMilestone(state, 'promoted', tick);
      }
      if (outcome.includes('fired') || outcome.includes('terminated') || outcome.includes('quit')) {
        state.milestones.push({ description: event.headline, tick });
        return this.emitCareerMilestone(state, 'fired', tick);
      }

      return false;
    }

    // Track crime events for behavior summary
    if (event.type === 'crime' || event.type === 'crime_arc') {
      const agentId = this.extractAgentId(event);
      if (agentId) {
        const state = this.agents.get(agentId);
        if (state) state.weekActions.crime++;
      }
      return false; // don't suppress crime events
    }

    return false;
  }

  /**
   * Called each tick. On week boundaries, produces character cards and resets weekly counters.
   */
  onTick(tick: number): CharacterCard[] {
    if (!isWeekBoundary(tick)) return [];

    const cards: CharacterCard[] = [];
    const weekNumber = getWeekNumber(tick);

    for (const [, state] of this.agents) {
      // Only produce cards for agents with any activity
      const totalActions = state.weekActions.work + state.weekActions.eat +
        state.weekActions.sleep + state.weekActions.relax + state.weekActions.crime;
      if (totalActions === 0) continue;

      const card: CharacterCard = {
        agentId: state.agentId,
        agentName: state.agentName,
        profession: state.profession,
        reputation: state.reputation,
        balance: state.balance,
        weekBehavior: {
          workCount: state.weekActions.work,
          eatCount: state.weekActions.eat,
          sleepCount: state.weekActions.sleep,
          relaxCount: state.weekActions.relax,
          crimeCount: state.weekActions.crime,
        },
        careerHighlight: state.milestones.length > 0
          ? state.milestones[state.milestones.length - 1].description
          : undefined,
      };
      cards.push(card);

      // Reset weekly counters
      state.weekActions = { work: 0, eat: 0, sleep: 0, relax: 0, crime: 0 };
    }

    // Publish weekly character summary if we have cards
    if (cards.length > 0) {
      const topCard = cards.reduce((a, b) =>
        (a.weekBehavior.workCount + a.weekBehavior.crimeCount) >
        (b.weekBehavior.workCount + b.weekBehavior.crimeCount) ? a : b);

      publishEvent('career_arc', `Week ${weekNumber}: ${cards.length} agents active`, tick, {
        severity: 'routine',
        tags: ['agents', 'weekly'],
        detail: `Top: ${topCard.agentName} (${topCard.profession}, ${topCard.weekBehavior.workCount} work sessions)`,
        channel: 'story',
        category: 'career_arc',
      });
    }

    return cards;
  }

  /** Update agent metadata from metrics (called by tick runner with agent snapshots) */
  updateAgentState(agentId: string, name: string, profession: string, reputation: number, balance: number): void {
    const state = this.getOrCreate(agentId, name, profession);
    state.agentName = name;
    state.profession = profession;
    state.reputation = reputation;
    state.balance = balance;
  }

  /** Get character cards for all tracked agents (for REST endpoint) */
  getAllCards(): CharacterCard[] {
    const cards: CharacterCard[] = [];
    for (const [, state] of this.agents) {
      cards.push({
        agentId: state.agentId,
        agentName: state.agentName,
        profession: state.profession,
        reputation: state.reputation,
        balance: state.balance,
        weekBehavior: {
          workCount: state.weekActions.work,
          eatCount: state.weekActions.eat,
          sleepCount: state.weekActions.sleep,
          relaxCount: state.weekActions.relax,
          crimeCount: state.weekActions.crime,
        },
        careerHighlight: state.milestones.length > 0
          ? state.milestones[state.milestones.length - 1].description
          : undefined,
      });
    }
    return cards;
  }

  /** Reset season milestones (called at season boundary) */
  resetSeason(): void {
    for (const [, state] of this.agents) {
      state.milestones = [];
    }
  }

  // ============ PRIVATE ============

  private getOrCreate(agentId: string, name: string, profession: string): AgentCareerState {
    let state = this.agents.get(agentId);
    if (!state) {
      state = {
        agentId,
        agentName: name,
        profession,
        reputation: 50,
        balance: 100,
        weekActions: { work: 0, eat: 0, sleep: 0, relax: 0, crime: 0 },
        milestones: [],
        lastTick: 0,
      };
      this.agents.set(agentId, state);
    }
    return state;
  }

  private emitCareerMilestone(state: AgentCareerState, type: string, tick: number): boolean {
    arcIdCounter++;
    const card: ArcCard = {
      arcId: `career-${arcIdCounter}`,
      arcType: 'career',
      agentId: state.agentId,
      agentName: state.agentName,
      headline: `${state.agentName}: ${type}`,
      steps: state.milestones.map((m) => m.description),
      outcome: type,
      startTick: state.milestones[0]?.tick ?? tick,
      endTick: tick,
      severity: type === 'promoted' ? 'minor' : 'routine',
    };

    publishEvent('career_arc', card.headline, tick, {
      severity: card.severity,
      tags: ['agents', `agent:${state.agentId}`],
      detail: card.steps.join(' → '),
      channel: 'story',
      category: 'career_arc',
    });

    return true;
  }

  private extractAgentId(event: FeedEvent): string | null {
    const tag = event.tags.find((t) => t.startsWith('agent:'));
    return tag ? tag.replace('agent:', '') : null;
  }
}

export const careerArcTracker = new CareerArcTracker();
