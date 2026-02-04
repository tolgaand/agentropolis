/**
 * DecisionOrchestrator — Manages the decision window within each tick.
 *
 * Flow:
 * 1. Open window (7s by default) — external AI clients can POST actions
 * 2. Close window — drain the action queue
 * 3. For each active agent: check external → fallback → no-op
 * 4. Return resolved actions for validation and processing
 */

import { AgentModel } from '@agentropolis/db';
import type { CityMetricsPayload } from '@agentropolis/shared/contracts/v2';
import { DECISION_WINDOW_MS } from '@agentropolis/shared';
import { actionQueue } from '../agent';
import { buildDecisionSnapshot } from './snapshotBuilder';
import { decisionTelemetry } from './telemetry';
import { FallbackDecisionProvider } from './fallbackProvider';
import { ExternalAIDecisionProvider } from './externalProvider';
import type { ResolvedAction } from './types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Module-level window state for route-level checks */
let windowOpen = false;

export function isDecisionWindowOpen(): boolean {
  return windowOpen;
}

export class DecisionOrchestrator {
  private externalProvider = new ExternalAIDecisionProvider();
  private fallbackProvider = new FallbackDecisionProvider();

  async runDecisionWindow(
    cityId: string,
    tick: number,
    cityMetrics: CityMetricsPayload | null,
    deadlineMs: number = DECISION_WINDOW_MS,
  ): Promise<ResolvedAction[]> {
    // 1. Open window — external AI clients can submit actions
    windowOpen = true;
    console.log(`[Decision] Window opened for tick=${tick} (${deadlineMs}ms)`);
    await sleep(deadlineMs);
    windowOpen = false;
    console.log(`[Decision] Window closed for tick=${tick}`);

    // 2. Drain the action queue → Map<agentId, QueuedAction>
    const drained = actionQueue.drain();
    const actionMap = new Map(drained.map((q) => [q.payload.agentId, q]));
    this.externalProvider.setDrainedActions(actionMap);

    console.log(`[Decision] Drained ${drained.length} external actions`);

    // 3. Get all active agents
    const agents = await AgentModel.find({ cityId, status: 'active' }).lean();

    // 4. Resolve: external → fallback → no-op
    const results: ResolvedAction[] = [];

    for (const agent of agents) {
      const agentId = agent._id.toString();
      const startMs = Date.now();

      const snapshot = await buildDecisionSnapshot(agent, tick, cityMetrics);

      // Try external provider first (queue-based)
      let suggestion = await this.externalProvider.requestDecision({
        agentId,
        tick,
        snapshot,
        deadlineMs: 0,
      });

      // Fallback if no external action
      if (!suggestion) {
        suggestion = await this.fallbackProvider.requestDecision({
          agentId,
          tick,
          snapshot,
          deadlineMs: 0,
        });
      }

      const latencyMs = Date.now() - startMs;

      if (suggestion) {
        results.push({
          requestId: suggestion.action.requestId || `${suggestion.source}-${agentId}-${tick}`,
          socketId: actionMap.get(agentId)?.socketId || 'fallback',
          payload: suggestion.action,
          receivedAt: Date.now(),
          source: suggestion.source,
        });

        decisionTelemetry.record({
          agentId,
          tick,
          source: suggestion.source,
          latencyMs,
          actionType: suggestion.action.type,
          accepted: true,
        });
      }
    }

    console.log(
      `[Decision] Resolved ${results.length} actions ` +
      `(${results.filter((r) => r.source === 'external').length} external, ` +
      `${results.filter((r) => r.source === 'fallback').length} fallback)`,
    );

    return results;
  }
}
