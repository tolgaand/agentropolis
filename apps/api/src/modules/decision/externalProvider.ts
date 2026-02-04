/**
 * ExternalAIDecisionProvider — Wraps the action queue drain results.
 *
 * The orchestrator drains the ActionQueue at the end of the decision window
 * and passes the resulting map here. This provider simply checks if a given
 * agent has a queued action from an external AI client.
 */

import type { QueuedAction } from '../agent/actionQueue';
import type { DecisionProvider, DecisionRequest, ActionSuggestion } from './types';

export class ExternalAIDecisionProvider implements DecisionProvider {
  readonly name = 'external';

  private drainedActions: Map<string, QueuedAction> = new Map();

  /** Called by the orchestrator after draining the action queue */
  setDrainedActions(map: Map<string, QueuedAction>): void {
    this.drainedActions = map;
  }

  async requestDecision(req: DecisionRequest): Promise<ActionSuggestion | null> {
    const queued = this.drainedActions.get(req.agentId);
    if (!queued) return null;

    return {
      agentId: req.agentId,
      action: queued.payload,
      source: 'external',
    };
  }
}
