/**
 * ArcTracker — Generic cross-tick story arc state machine (S5.2, S5.3).
 *
 * An arc tracks a sequence of related events for a single agent across
 * multiple ticks. When the arc reaches a terminal state, it emits a single
 * story card (ArcCard) summarizing the full sequence.
 *
 * Subclasses implement domain-specific state transitions.
 */

import type { ArcCard, FeedEvent, NewsSeverity } from '@agentropolis/shared/contracts/v2';
import { publishEvent } from './eventStore';

// ============ BASE ARC ============

export interface ArcStep {
  description: string;
  tick: number;
  raw?: FeedEvent;
}

export interface ActiveArc {
  arcId: string;
  arcType: 'crime' | 'career';
  agentId: string;
  agentName: string;
  startTick: number;
  steps: ArcStep[];
  state: string;              // subclass-defined FSM state
  metadata: Record<string, unknown>;
}

const ARC_EXPIRE_TICKS = 30;  // arcs older than 30 ticks without completion are expired

let arcIdCounter = 0;

export abstract class BaseArcTracker<TState extends string> {
  protected arcs = new Map<string, ActiveArc>(); // key: agentId
  protected abstract arcType: 'crime' | 'career';

  /**
   * Process a feed event. If it starts a new arc, advances an existing arc,
   * or completes one, handle accordingly.
   *
   * Returns true if the event was consumed by an arc (should not appear standalone).
   */
  abstract processEvent(event: FeedEvent, tick: number): boolean;

  /** Get currently active arcs (for debugging) */
  getActiveArcs(): ActiveArc[] {
    return Array.from(this.arcs.values());
  }

  /** Expire stale arcs and emit them as incomplete stories */
  expireStale(tick: number): ArcCard[] {
    const expired: ArcCard[] = [];
    for (const [key, arc] of this.arcs) {
      if (tick - arc.startTick > ARC_EXPIRE_TICKS) {
        // Emit partial arc
        const card = this.buildCard(arc, 'expired');
        if (card) {
          this.publishCard(card, tick);
          expired.push(card);
        }
        this.arcs.delete(key);
      }
    }
    return expired;
  }

  /** Called on each tick to handle timeouts and state-based completions */
  onTick(tick: number): void {
    this.expireStale(tick);
  }

  // ============ HELPERS ============

  protected startArc(
    agentId: string,
    agentName: string,
    tick: number,
    initialState: TState,
    firstStep: string,
    metadata?: Record<string, unknown>,
    raw?: FeedEvent,
  ): ActiveArc {
    arcIdCounter++;
    const arc: ActiveArc = {
      arcId: `${this.arcType}-${arcIdCounter}`,
      arcType: this.arcType,
      agentId,
      agentName,
      startTick: tick,
      steps: [{ description: firstStep, tick, raw }],
      state: initialState,
      metadata: metadata ?? {},
    };
    this.arcs.set(agentId, arc);
    return arc;
  }

  protected advanceArc(
    arc: ActiveArc,
    newState: TState,
    stepDescription: string,
    tick: number,
    raw?: FeedEvent,
  ): void {
    arc.state = newState;
    arc.steps.push({ description: stepDescription, tick, raw });
  }

  protected completeArc(arc: ActiveArc, outcome: string, tick: number): ArcCard | null {
    this.arcs.delete(arc.agentId);
    const card = this.buildCard(arc, outcome);
    if (card) {
      this.publishCard(card, tick);
    }
    return card;
  }

  protected abstract buildCard(arc: ActiveArc, outcome: string): ArcCard | null;

  protected publishCard(card: ArcCard, tick: number): void {
    const eventType = card.arcType === 'crime' ? 'crime_arc' : 'career_arc';
    publishEvent(eventType, card.headline, tick, {
      severity: card.severity,
      tags: [card.arcType, `agent:${card.agentId}`],
      detail: card.steps.join(' → ') + ` → ${card.outcome}`,
      channel: 'story',
      category: `${card.arcType}_arc`,
    });
  }

  protected getArc(agentId: string): ActiveArc | undefined {
    return this.arcs.get(agentId);
  }
}

// ============ CRIME ARC TRACKER ============

/**
 * Crime arc states:
 *   committed → (caught | escaped)
 *     caught → jailed → released
 *     escaped → (done — arc ends)
 */
type CrimeArcState = 'committed' | 'caught' | 'escaped' | 'jailed' | 'released';

export class CrimeArcTracker extends BaseArcTracker<CrimeArcState> {
  protected arcType = 'crime' as const;

  processEvent(event: FeedEvent, tick: number): boolean {
    const agentId = this.extractAgentId(event);
    if (!agentId) return false;

    const existing = this.getArc(agentId);

    // Crime committed — start new arc (or replace stale one)
    if (event.type === 'crime') {
      const agentName = this.extractAgentName(event);
      const amount = this.extractAmount(event);
      const caught = event.detail?.includes('caught') ?? false;

      if (caught) {
        // Instant resolve: committed + caught in same event
        const arc = this.startArc(agentId, agentName, tick, 'caught',
          `Committed crime (stole $${amount})`, { amount, victimName: '' }, event);
        this.advanceArc(arc, 'caught', 'Caught red-handed', tick);
        // Don't complete yet — wait for jailed event
        return true;
      }

      // Crime committed, not caught
      this.startArc(agentId, agentName, tick, 'committed',
        `Committed crime (stole $${amount})`, { amount }, event);
      return true;
    }

    // Arrest — advance arc
    if (event.type === 'arrest' && existing) {
      const fineMatch = event.detail?.match(/Fine: \$(\d+)/);
      const jailMatch = event.detail?.match(/Jail: (\d+)/);
      this.advanceArc(existing, 'jailed',
        `Arrested (fine: $${fineMatch?.[1] ?? '?'}, jail: ${jailMatch?.[1] ?? '?'} ticks)`, tick, event);
      existing.metadata.fineAmount = fineMatch ? Number(fineMatch[1]) : 0;
      existing.metadata.jailTicks = jailMatch ? Number(jailMatch[1]) : 0;
      return true;
    }

    // Agent released from jail — check if we have a crime arc
    if (event.headline?.includes('released from jail') && existing && existing.state === 'jailed') {
      this.advanceArc(existing, 'released', 'Released from jail', tick, event);
      this.completeArc(existing, 'Served time and released', tick);
      return true;
    }

    return false;
  }

  /**
   * Check for escaped arcs (committed but no arrest within a few ticks).
   * Called each tick via onTick.
   */
  override onTick(tick: number): void {
    // Mark stale "committed" arcs as escaped (no arrest within 3 ticks)
    for (const [, arc] of this.arcs) {
      if (arc.state === 'committed' && tick - arc.startTick >= 3) {
        this.advanceArc(arc, 'escaped' as CrimeArcState, 'Escaped without arrest', tick);
        this.completeArc(arc, 'Got away clean', tick);
      }
    }

    // Standard expiry for arcs stuck in other states
    super.onTick(tick);
  }

  protected buildCard(arc: ActiveArc, outcome: string): ArcCard {
    const steps = arc.steps.map((s) => s.description);
    const wasJailed = arc.state === 'released' || arc.state === 'jailed';
    const severity: NewsSeverity = wasJailed ? 'major' : 'minor';

    return {
      arcId: arc.arcId,
      arcType: 'crime',
      agentId: arc.agentId,
      agentName: arc.agentName,
      headline: wasJailed
        ? `${arc.agentName} committed a crime, was caught and jailed`
        : `${arc.agentName} committed a crime and escaped`,
      steps,
      outcome,
      startTick: arc.startTick,
      endTick: arc.steps[arc.steps.length - 1].tick,
      severity,
    };
  }

  private extractAgentId(event: FeedEvent): string | null {
    const tag = event.tags.find((t) => t.startsWith('agent:'));
    return tag ? tag.replace('agent:', '') : null;
  }

  private extractAgentName(event: FeedEvent): string {
    // "Name robbed Victim" or "Name arrested"
    const parts = event.headline.split(' robbed ');
    if (parts.length >= 2) return parts[0];
    return event.headline.split(' ')[0];
  }

  private extractAmount(event: FeedEvent): number {
    const match = event.detail?.match(/Amount: \$(\d+)/);
    return match ? Number(match[1]) : 0;
  }
}

/** Singleton crime arc tracker */
export const crimeArcTracker = new CrimeArcTracker();
