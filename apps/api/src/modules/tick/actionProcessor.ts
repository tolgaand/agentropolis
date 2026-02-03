/**
 * ActionProcessor — Drains the ActionQueue at Phase 0 of each tick
 * and processes queued actions deterministically.
 *
 * Results are emitted individually to each agent's socket via action:result,
 * side effects are broadcast to all spectators, and affected chunks are republished.
 */

import { Types } from 'mongoose';
import type { Server } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  ActionResultPayload,
} from '@agentropolis/shared/contracts/v2';
import { SOCKET_EVENTS } from '@agentropolis/shared/contracts/v2';
import type { QueuedAction } from '../agent/actionQueue';
import { handleAction, type ActionSideEffects } from '../agent/actionEngine';
import type {
  AgentJoinedPayload,
  AgentUpdatedPayload,
  CrimeCommittedPayload,
  CrimeArrestedPayload,
} from '@agentropolis/shared/contracts/v2';
import { publishEvent } from '../realtime/eventStore';
import { publishChunk } from '../realtime';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

/**
 * Process all queued actions for this tick. Called at Phase 0,
 * before the regular tick pipeline.
 */
export async function processQueuedActions(
  actions: QueuedAction[],
  cityId: string,
  tick: number,
  treasuryAccountId: Types.ObjectId,
  npcPoolAccountId: Types.ObjectId,
  io: TypedServer,
): Promise<void> {
  for (const queued of actions) {
    try {
      const result = await handleAction(
        queued.payload,
        cityId,
        tick,
        treasuryAccountId,
        npcPoolAccountId,
      );

      // Emit targeted result to agent's socket
      const resultPayload: ActionResultPayload = {
        requestId: queued.requestId,
        agentId: queued.payload.agentId,
        actionType: queued.payload.type,
        tick,
        ok: result.response.ok,
        reason: result.response.reason,
        outcome: result.response.outcome,
        agent: result.response.agent,
        diff: result.diff,
      };
      io.to(queued.socketId).emit(
        SOCKET_EVENTS.ACTION_RESULT as 'action:result',
        resultPayload,
      );

      // Broadcast side effects to all spectators
      broadcastSideEffects(io, result.sideEffects, tick);

      // Republish affected chunks so spectators see map changes
      if (result.affectedChunks) {
        for (const chunk of result.affectedChunks) {
          await publishChunk(chunk.chunkX, chunk.chunkZ);
        }
      }

      console.log(
        `[ActionQueue] ${queued.payload.type} by ${queued.payload.agentId} → ${result.response.ok ? 'ok' : result.response.reason}`,
      );
    } catch (err) {
      console.error(`[ActionQueue] Error processing action ${queued.requestId}:`, err);

      // Still emit a result so the client doesn't hang
      const errorPayload: ActionResultPayload = {
        requestId: queued.requestId,
        agentId: queued.payload.agentId,
        actionType: queued.payload.type,
        tick,
        ok: false,
        reason: 'internal_error',
      };
      io.to(queued.socketId).emit(
        SOCKET_EVENTS.ACTION_RESULT as 'action:result',
        errorPayload,
      );
    }
  }
}

// ============ SIDE EFFECT BROADCAST ============

function broadcastSideEffects(
  io: TypedServer,
  effects: ActionSideEffects[],
  tick: number,
): void {
  for (const effect of effects) {
    switch (effect.type) {
      case 'agent_joined': {
        const data = effect.data as unknown as AgentJoinedPayload;
        io.emit(SOCKET_EVENTS.AGENT_JOINED as 'agent:joined', data);
        publishEvent('agent_joined', `${data.agent.name} joined the city`, tick, {
          severity: 'minor',
          tags: ['agents'],
          detail: `Profession: ${data.agent.profession}`,
        });
        break;
      }
      case 'agent_updated': {
        const data = effect.data as unknown as AgentUpdatedPayload;
        io.emit(SOCKET_EVENTS.AGENT_UPDATED as 'agent:updated', data);
        publishEvent('agent_updated', `${data.agent.name}: ${data.outcome}`, tick, {
          tags: ['agents'],
        });
        break;
      }
      case 'crime_committed': {
        const data = effect.data as unknown as CrimeCommittedPayload;
        io.emit(SOCKET_EVENTS.CRIME_COMMITTED as 'crime:committed', data);
        publishEvent('crime', `${data.perpetratorName} robbed ${data.victimName}`, tick, {
          severity: 'minor',
          tags: ['crime'],
          detail: `Amount: $${data.amount}${data.caught ? ' (caught!)' : ''}`,
        });
        break;
      }
      case 'crime_arrested': {
        const data = effect.data as unknown as CrimeArrestedPayload;
        io.emit(SOCKET_EVENTS.CRIME_ARRESTED as 'crime:arrested', data);
        publishEvent('arrest', `${data.agentName} arrested`, tick, {
          severity: 'minor',
          tags: ['crime'],
          detail: `Fine: $${data.fineAmount}, Jail: ${data.jailTicks} ticks`,
        });
        break;
      }
    }
  }
}
