/**
 * StoryRateLimiter — Controls story event pacing for spectators (S3.5).
 *
 * Rules:
 *   - Max STORY_EVENT_MAX_PER_TICK story events per tick
 *   - Same category on cooldown for STORY_EVENT_CATEGORY_COOLDOWN ticks
 *   - Priority events (agent_released, building_closed, economic_crisis, crime_arc) bypass rate-limit
 *   - Crime/arrest events are delegated to CrimeArcTracker (S5.2) — not shown standalone
 */

import type { FeedEvent, FeedEventType } from '@agentropolis/shared/contracts/v2';
import {
  STORY_EVENT_MAX_PER_TICK,
  STORY_EVENT_CATEGORY_COOLDOWN,
  PRIORITY_EVENT_TYPES,
} from '@agentropolis/shared';
import { crimeArcTracker } from './arcTracker';
import { careerArcTracker } from './careerArcTracker';

/** Category extracted from event type for cooldown tracking */
type StoryCategory = 'crime' | 'economy' | 'agent' | 'building' | 'general';

function getCategory(type: FeedEventType | string): StoryCategory {
  if (type === 'crime' || type === 'arrest' || type === 'crime_arc') return 'crime';
  if (type === 'tick' || type === 'news') return 'general';
  if (type === 'agent_joined' || type === 'agent_updated' || type === 'promotion' || type === 'career_arc') return 'agent';
  if (type.startsWith('building')) return 'building';
  if (type.includes('economic') || type.includes('tax') || type.includes('salary') || type.includes('npc')) return 'economy';
  return 'general';
}

export class StoryRateLimiter {
  /** Last tick a category was emitted */
  private categoryCooldowns = new Map<StoryCategory, number>();
  /** Events emitted in current tick */
  private tickEventCount = 0;
  private currentTick = 0;
  /** Deferred (rate-limited) events — replayed next available tick */
  private deferred: FeedEvent[] = [];

  /**
   * Filter a batch of tick events through rate-limiting.
   * Only story-channel events are rate-limited; telemetry passes through unchanged (S4.2).
   * Crime/arrest events are intercepted by the arc tracker (S5.2).
   * Returns events that should be broadcast to spectators.
   */
  filterTickEvents(tick: number, events: FeedEvent[]): FeedEvent[] {
    // Reset per-tick counter on new tick
    if (tick !== this.currentTick) {
      this.currentTick = tick;
      this.tickEventCount = 0;
    }

    const output: FeedEvent[] = [];

    // Separate story from telemetry — telemetry bypasses all rate-limiting
    const storyEvents: FeedEvent[] = [];
    for (const event of events) {
      if (event.channel !== 'story') {
        output.push(event); // telemetry passes through
      } else {
        storyEvents.push(event);
      }
    }

    // First, emit any deferred story events from previous ticks (up to budget)
    while (this.deferred.length > 0 && this.tickEventCount < STORY_EVENT_MAX_PER_TICK) {
      const deferred = this.deferred.shift()!;
      deferred.tick = tick; // update tick to current
      output.push(deferred);
      this.tickEventCount++;
    }

    // Delegate events to arc trackers (S5.2, S5.3)
    // Arc-consumed events are suppressed from standalone display
    const remaining: FeedEvent[] = [];
    for (const event of storyEvents) {
      // Crime/arrest → crime arc tracker
      if (event.type === 'crime' || event.type === 'arrest') {
        const consumed = crimeArcTracker.processEvent(event, tick);
        if (!consumed) remaining.push(event);
        // Also feed to career tracker for behavior counting
        careerArcTracker.processEvent(event, tick);
        continue;
      }
      // Agent events → career arc tracker (non-suppressing)
      if (event.type === 'agent_joined' || event.type === 'agent_updated') {
        careerArcTracker.processEvent(event, tick);
      }
      remaining.push(event);
    }

    // Filter remaining story events through rate-limit
    for (const event of remaining) {
      // Priority events always pass (includes crime_arc, career_arc)
      if (this.isPriority(event)) {
        output.push(event);
        this.tickEventCount++;
        this.categoryCooldowns.set(getCategory(event.type), tick);
        continue;
      }

      // Per-tick cap
      if (this.tickEventCount >= STORY_EVENT_MAX_PER_TICK) {
        this.deferred.push(event);
        continue;
      }

      // Category cooldown
      const category = getCategory(event.type);
      const lastEmit = this.categoryCooldowns.get(category) ?? 0;
      if (tick - lastEmit < STORY_EVENT_CATEGORY_COOLDOWN) {
        this.deferred.push(event);
        continue;
      }

      // Pass through
      output.push(event);
      this.tickEventCount++;
      this.categoryCooldowns.set(category, tick);
    }

    // Cap deferred buffer to prevent memory growth
    if (this.deferred.length > 50) {
      this.deferred = this.deferred.slice(0, 50);
    }

    return output;
  }

  private isPriority(event: FeedEvent): boolean {
    // Arc cards are always priority
    if (event.type === 'crime_arc' || event.type === 'career_arc') return true;
    return PRIORITY_EVENT_TYPES.includes(event.type);
  }
}

/** Singleton instance */
export const storyRateLimiter = new StoryRateLimiter();
