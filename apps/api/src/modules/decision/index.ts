/**
 * Decision module — barrel export
 */

export { DecisionOrchestrator, isDecisionWindowOpen } from './orchestrator';
export { routeDecisions } from './actionRouter';
export { buildDecisionSnapshot } from './snapshotBuilder';
export { decisionTelemetry } from './telemetry';
export { FallbackDecisionProvider } from './fallbackProvider';
export { ExternalAIDecisionProvider } from './externalProvider';
export { actionRecorder } from './actionRecorder';

export type {
  DecisionSource,
  DecisionSnapshotV1,
  DecisionRequest,
  ActionSuggestion,
  DecisionProvider,
  ResolvedAction,
  DecisionTelemetryRecord,
  DecisionTelemetryAggregates,
} from './types';
