/**
 * ActionRouter — Validates resolved actions and retries with fallback.
 *
 * Takes ResolvedAction[] from the orchestrator, runs lightweight
 * pre-validation, and falls back to the FallbackProvider if an
 * external action is invalid.
 */

import { AgentModel } from '@agentropolis/db';
import type { AgentActionPayload, CityMetricsPayload } from '@agentropolis/shared/contracts/v2';
import type { ResolvedAction } from './types';
import type { QueuedAction } from '../agent/actionQueue';
import { FallbackDecisionProvider } from './fallbackProvider';
import { buildDecisionSnapshot } from './snapshotBuilder';
import { decisionTelemetry } from './telemetry';

const VALID_ACTION_TYPES = new Set([
  'work', 'eat', 'sleep', 'relax', 'apply', 'crime', 'buy_parcel', 'build', 'upgrade',
]);

/** Lightweight read-only pre-validation */
async function preValidate(
  payload: AgentActionPayload,
  cityId: string,
): Promise<{ ok: boolean; reason?: string }> {
  // Check action type is valid
  if (!VALID_ACTION_TYPES.has(payload.type)) {
    return { ok: false, reason: 'invalid_action_type' };
  }

  // Check agent exists and is active
  const agent = await AgentModel.findById(payload.agentId).lean();
  if (!agent) {
    return { ok: false, reason: 'agent_not_found' };
  }
  if (agent.cityId !== cityId) {
    return { ok: false, reason: 'wrong_city' };
  }
  if (agent.status === 'jailed') {
    return { ok: false, reason: 'agent_jailed' };
  }

  return { ok: true };
}

export async function routeDecisions(
  resolved: ResolvedAction[],
  cityId: string,
  tick: number,
  cityMetrics: CityMetricsPayload | null,
): Promise<QueuedAction[]> {
  const fallbackProvider = new FallbackDecisionProvider();
  const final: QueuedAction[] = [];

  for (const action of resolved) {
    const valid = await preValidate(action.payload, cityId);

    if (!valid.ok && action.source === 'external') {
      // External action invalid — try fallback
      const agent = await AgentModel.findById(action.payload.agentId).lean();
      if (agent) {
        const snapshot = await buildDecisionSnapshot(agent, tick, cityMetrics);
        const fb = await fallbackProvider.requestDecision({
          agentId: action.payload.agentId,
          tick,
          snapshot,
          deadlineMs: 0,
        });

        decisionTelemetry.record({
          agentId: action.payload.agentId,
          tick,
          source: 'external',
          latencyMs: 0,
          actionType: action.payload.type,
          accepted: false,
          rejectedReason: valid.reason,
        });

        if (fb) {
          final.push({
            requestId: action.requestId,
            socketId: 'fallback',
            payload: fb.action,
            receivedAt: action.receivedAt,
          });
          continue;
        }
      }
      // Both failed — skip (no-op)
      continue;
    }

    if (!valid.ok) {
      // Fallback also invalid — skip
      decisionTelemetry.record({
        agentId: action.payload.agentId,
        tick,
        source: action.source,
        latencyMs: 0,
        actionType: action.payload.type,
        accepted: false,
        rejectedReason: valid.reason,
      });
      continue;
    }

    // Valid action — pass through
    final.push({
      requestId: action.requestId,
      socketId: action.socketId,
      payload: action.payload,
      receivedAt: action.receivedAt,
    });
  }

  return final;
}
