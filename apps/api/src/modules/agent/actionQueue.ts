/**
 * ActionQueue — In-memory FIFO queue for agent actions.
 *
 * Actions are enqueued from the socket handler and drained at the start
 * of each tick for deterministic processing. One action per agent per tick.
 */

import type { AgentActionPayload } from '@agentropolis/shared/contracts/v2';

// ============ TYPES ============

export interface QueuedAction {
  requestId: string;
  socketId: string;
  payload: AgentActionPayload;
  receivedAt: number;
}

// ============ QUEUE ============

class ActionQueue {
  private queue: QueuedAction[] = [];
  private agentHasAction = new Set<string>();

  /**
   * Enqueue an action. Returns ok:false if agent already has a pending action
   * for this tick window. Generates requestId if client didn't provide one.
   */
  enqueue(
    socketId: string,
    payload: AgentActionPayload,
  ): { ok: boolean; reason?: string; requestId: string } {
    const requestId = payload.requestId || `${payload.agentId}-${Date.now()}`;

    if (this.agentHasAction.has(payload.agentId)) {
      return { ok: false, reason: 'action_already_queued', requestId };
    }

    this.agentHasAction.add(payload.agentId);
    this.queue.push({
      requestId,
      socketId,
      payload: { ...payload, requestId },
      receivedAt: Date.now(),
    });

    return { ok: true, requestId };
  }

  /**
   * Drain the queue: returns all queued actions in deterministic order
   * (receivedAt ASC, then agentId ASC, then requestId ASC as tiebreaker).
   * Clears the queue and dedup set for the next tick window.
   */
  drain(): QueuedAction[] {
    const snapshot = [...this.queue];
    this.queue = [];
    this.agentHasAction.clear();

    // Deterministic stable sort
    snapshot.sort((a, b) => {
      if (a.receivedAt !== b.receivedAt) return a.receivedAt - b.receivedAt;
      const agentCmp = a.payload.agentId.localeCompare(b.payload.agentId);
      if (agentCmp !== 0) return agentCmp;
      return a.requestId.localeCompare(b.requestId);
    });

    return snapshot;
  }

  /** Number of actions currently queued */
  size(): number {
    return this.queue.length;
  }

  /** Clear queue without processing (e.g. on shutdown) */
  clear(): void {
    this.queue = [];
    this.agentHasAction.clear();
  }
}

export const actionQueue = new ActionQueue();
