/**
 * EventStore — In-memory ring buffer for FeedEvents.
 * Keeps the last N events for spectator:sync backlog delivery.
 */

import type { Server } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  FeedEvent,
  FeedEventType,
  NewsSeverity,
} from '@agentropolis/shared/contracts/v2';
import { SOCKET_EVENTS } from '@agentropolis/shared/contracts/v2';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

const MAX_SIZE = 500;

class EventStore {
  private buffer: FeedEvent[] = [];

  push(event: FeedEvent): void {
    this.buffer.unshift(event);
    if (this.buffer.length > MAX_SIZE) {
      this.buffer.length = MAX_SIZE;
    }
  }

  recent(n: number): FeedEvent[] {
    return this.buffer.slice(0, n);
  }

  size(): number {
    return this.buffer.length;
  }
}

export const eventStore = new EventStore();

let ioRef: TypedServer | null = null;
let eventCounter = 0;

export function setEventStoreIO(io: TypedServer): void {
  ioRef = io;
}

/**
 * Create a FeedEvent, push to EventStore, and broadcast to all connected clients.
 */
export function publishEvent(
  type: FeedEventType,
  headline: string,
  tick: number,
  opts?: {
    detail?: string;
    severity?: NewsSeverity;
    tags?: string[];
  },
): FeedEvent {
  eventCounter++;
  const event: FeedEvent = {
    id: `${tick}-${eventCounter}`,
    type,
    headline,
    detail: opts?.detail,
    severity: opts?.severity ?? 'routine',
    tick,
    ts: new Date().toISOString(),
    tags: opts?.tags ?? [],
  };

  eventStore.push(event);

  if (ioRef) {
    ioRef.emit(SOCKET_EVENTS.FEED_EVENT as 'feed:event', event);
  }

  return event;
}
