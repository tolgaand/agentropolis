/**
 * CityTickRunner — Scheduler + orchestrator for the tick pipeline
 *
 * Single authority: server owns the tick clock.
 * Re-entrancy guard: concurrent ticks are impossible.
 * Pause/resume: tick engine can be paused without losing state.
 */

import { Types } from 'mongoose';
import type { Server } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  CityMetricsPayload,
  FeedEvent,
} from '@agentropolis/shared/contracts/v2';
import { SOCKET_EVENTS, TICK_INTERVAL_MS } from '@agentropolis/shared';
import { AgentModel, CityModel } from '@agentropolis/db';
import { runTick } from './tickPipeline';
import { publishChunk, publishEvent, setLastEconomySnapshot } from '../realtime';
import { actionQueue, buildAgentSnapshot } from '../agent';
import { processQueuedActions } from './actionProcessor';
import { eventStore } from '../realtime/eventStore';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

export { bootstrapAccounts } from './bootstrap';
export type { BootstrapResult } from './bootstrap';

// ============ MODULE-LEVEL STATE ============

/** Singleton reference for external queries (action queue safety) */
let activeRunner: CityTickRunner | null = null;

/** Check if a tick is currently being executed (for action safety) */
export function isTickRunning(): boolean {
  return activeRunner?.isRunning() ?? false;
}

/** Last CityMetrics for spectator:sync */
let lastMetrics: CityMetricsPayload | null = null;
export function getLastMetrics(): CityMetricsPayload | null {
  return lastMetrics;
}

// ============ TICK ENGINE ============

export class CityTickRunner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private paused = false;
  private tickNo = 0;

  constructor(
    private cityId: string,
    private treasuryAccountId: Types.ObjectId,
    private npcPoolAccountId: Types.ObjectId,
    private io: TypedServer,
    private intervalMs: number = TICK_INTERVAL_MS,
  ) {
    activeRunner = this;
  }

  /** Start the tick loop */
  start(): void {
    if (this.timer) return;

    console.log(`✓ Tick engine started (${this.intervalMs}ms interval, city=${this.cityId})`);

    this.timer = setInterval(() => {
      this.executeTick().catch((err) => {
        console.error('[Tick] Unhandled error:', err);
      });
    }, this.intervalMs);
  }

  /** Stop the tick loop entirely */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[Tick] Engine stopped');
    }
    if (activeRunner === this) activeRunner = null;
  }

  /** Pause tick execution (timer keeps running but ticks are skipped) */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    console.log('[Tick] Engine paused');
  }

  /** Resume tick execution */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    console.log('[Tick] Engine resumed');
  }

  /** Check if currently executing a tick */
  isRunning(): boolean {
    return this.running;
  }

  /** Check if paused */
  isPaused(): boolean {
    return this.paused;
  }

  /** Get current tick number */
  getCurrentTick(): number {
    return this.tickNo;
  }

  private async executeTick(): Promise<void> {
    // Re-entrancy guard
    if (this.running) return;
    // Pause guard
    if (this.paused) return;

    this.running = true;

    const startMs = Date.now();

    try {
      const city = await CityModel.findOne({ cityId: this.cityId });
      if (!city) {
        console.error('[Tick] City not found:', this.cityId);
        return;
      }

      const tick = (city.tickCount ?? 0) + 1;
      this.tickNo = tick;

      console.log(`[Tick] start tick=${tick}`);

      // Phase 0: Drain and process action queue
      const queuedActions = actionQueue.drain();
      if (queuedActions.length > 0) {
        console.log(`[Tick] Phase 0: processing ${queuedActions.length} queued actions`);
        await processQueuedActions(
          queuedActions,
          this.cityId,
          tick,
          this.treasuryAccountId,
          this.npcPoolAccountId,
          this.io,
        );
      }

      // Phase 1-10: existing tick pipeline
      const result = await runTick(
        this.cityId,
        tick,
        this.treasuryAccountId,
        this.npcPoolAccountId,
      );

      const durationMs = Date.now() - startMs;

      // Store economy snapshot for spectator:sync
      setLastEconomySnapshot(result.economySnapshot);

      // Build CityMetrics payload
      const metrics: CityMetricsPayload = {
        tick,
        serverTime: new Date().toISOString(),
        agentCount: result.economySnapshot.totalAgents,
        activeCount: result.economySnapshot.activeCount,
        jailedCount: result.economySnapshot.jailedCount,
        treasury: result.economySnapshot.treasury,
        moneySupply: result.economySnapshot.moneySupply,
        unemploymentRate: result.economySnapshot.unemployment,
        crimeRateLast10: result.economySnapshot.crimeRateLast10,
        avgRep: result.economySnapshot.avgRep,
        avgNeeds: result.economySnapshot.avgNeeds,
        season: result.economySnapshot.season,
        tickDurationMs: durationMs,
        eventsCount: result.events.length,
        npcBudget: result.economySnapshot.npcBudget,
        npcDistributed: result.economySnapshot.npcDistributed,
        taxCollected: result.economySnapshot.taxCollected,
        importFees: result.economySnapshot.importFees,
        openBusinesses: result.economySnapshot.openBusinesses,
        closedBusinesses: result.economySnapshot.closedBusinesses,
        outsideWorldCRD: result.economySnapshot.outsideWorldCRD,
        policeCountActive: result.economySnapshot.policeCountActive,
      };
      lastMetrics = metrics;

      // Broadcast city:metrics (primary HUD data source)
      this.io.emit(SOCKET_EVENTS.CITY_METRICS as 'city:metrics', metrics);

      // Broadcast tick:complete (backwards compat + economy data)
      this.io.emit(SOCKET_EVENTS.TICK_COMPLETE as 'tick:complete', {
        tick,
        serverTime: metrics.serverTime,
        economy: {
          treasury: result.economySnapshot.treasury,
          moneySupply: result.economySnapshot.moneySupply,
          unemployment: result.economySnapshot.unemployment,
          crimeRate: result.economySnapshot.crimeRate,
          season: result.economySnapshot.season,
          totalAgents: result.economySnapshot.totalAgents,
          avgNeeds: result.economySnapshot.avgNeeds,
        },
        eventsCount: result.events.length,
      });

      // Publish tick summary to event store
      publishEvent('tick', `Tick #${tick} completed`, tick, {
        tags: ['economy'],
        detail: `Agents: ${metrics.agentCount}, Treasury: $${metrics.treasury}, Season: ${metrics.season}`,
      });

      // Broadcast news for significant events + push to event store
      const significantEvents = result.events.filter((e) => e.severity >= 2);
      if (significantEvents.length > 0) {
        this.io.emit(SOCKET_EVENTS.NEWS_PUBLISHED as 'news:published', {
          items: significantEvents.slice(0, 10).map((e, i) => ({
            id: `tick-${tick}-${i}`,
            headline: e.description,
            body: '',
            severity: e.severity >= 3 ? ('major' as const) : ('minor' as const),
            tick,
            tags: [e.type],
          })),
        });

        // Also push significant events to feed event store
        for (const e of significantEvents.slice(0, 10)) {
          publishEvent('news', e.description, tick, {
            severity: e.severity >= 3 ? 'major' : 'minor',
            tags: [e.type],
          });
        }
      }

      // Republish affected chunks (city manager builds)
      for (const chunk of result.affectedChunks) {
        await publishChunk(chunk.chunkX, chunk.chunkZ);
      }

      // Broadcast agents:update — top 10 agents snapshot for HUD
      try {
        const topAgents = await AgentModel.find({
          cityId: this.cityId,
          status: { $in: ['active', 'jailed'] },
        })
          .sort({ reputation: -1 })
          .limit(10);

        const agentSnapshots = await Promise.all(
          topAgents.map((a) => buildAgentSnapshot(a)),
        );

        this.io.emit(
          SOCKET_EVENTS.AGENTS_UPDATE as 'agents:update',
          { tick, agents: agentSnapshots },
        );
      } catch (agentErr) {
        console.error('[Tick] Failed to broadcast agents:update:', agentErr);
      }

      // Broadcast events:batch — all feed events produced this tick
      const tickEvents: FeedEvent[] = eventStore
        .recent(50)
        .filter((e) => e.tick === tick);

      if (tickEvents.length > 0) {
        this.io.emit(
          SOCKET_EVENTS.EVENTS_BATCH as 'events:batch',
          { tick, events: tickEvents },
        );
      }

      console.log(
        `[Tick] complete tick=${tick} durationMs=${durationMs} ` +
        `(events=${result.events.length}, treasury=${metrics.treasury}, ` +
        `agents=${metrics.agentCount}, active=${metrics.activeCount}, ` +
        `jailed=${metrics.jailedCount}, season=${metrics.season})`,
      );
    } catch (err) {
      console.error('[Tick] Error during tick execution:', err);
    } finally {
      this.running = false;
    }
  }
}
