/**
 * Decision Engine Types — Interfaces for the decision window system.
 *
 * The decision engine sits between external AI action queues and the
 * tick pipeline, providing fallback decisions for agents that don't
 * receive external commands.
 */

import type { AgentActionPayload, AgentActionType } from '@agentropolis/shared/contracts/v2';
import type { AgentNeeds, AgentStats, Profession, AgentStatus } from '@agentropolis/shared';

// ============ DECISION SOURCE ============

export type DecisionSource = 'external' | 'fallback';

// ============ SNAPSHOT ============

/** Compact snapshot sent to decision providers for context */
export interface DecisionSnapshotV1 {
  version: 1;
  agentId: string;
  tick: number;
  agent: {
    name: string;
    profession: Profession;
    status: AgentStatus;
    reputation: number;
    needs: AgentNeeds;
    stats: AgentStats;
    balance: number;
    employedAt?: string;
    homeId?: string;
  };
  city: {
    tick: number;
    season: string;
    treasury: number;
    unemploymentRate: number;
    crimeRateLast10: number;
    avgNeeds: { hunger: number; rest: number; fun: number };
  };
  nearbyBuildings: Array<{
    id: string;
    type: string;
    status: string;
    hasVacancy: boolean;
  }>;
}

// ============ PROVIDER INTERFACE ============

/** Request object passed to a DecisionProvider */
export interface DecisionRequest {
  agentId: string;
  tick: number;
  snapshot: DecisionSnapshotV1;
  deadlineMs: number;
}

/** Output from a decision provider */
export interface ActionSuggestion {
  agentId: string;
  action: AgentActionPayload;
  source: DecisionSource;
}

/** Pluggable decision provider interface */
export interface DecisionProvider {
  readonly name: string;
  requestDecision(req: DecisionRequest): Promise<ActionSuggestion | null>;
}

// ============ RESOLVED ACTION ============

/** A queued action enriched with decision source metadata */
export interface ResolvedAction {
  requestId: string;
  socketId: string;
  payload: AgentActionPayload;
  receivedAt: number;
  source: DecisionSource;
}

// ============ TELEMETRY ============

export interface DecisionTelemetryRecord {
  agentId: string;
  tick: number;
  source: DecisionSource;
  latencyMs: number;
  actionType: AgentActionType;
  accepted: boolean;
  rejectedReason?: string;
}

export interface DecisionTelemetryAggregates {
  totalDecisions: number;
  fallbackCount: number;
  fallbackRate: number;
  avgDecisionLatencyMs: number;
  invalidActionCount: number;
  invalidActionRate: number;
}
