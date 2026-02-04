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
  FeedChannel,
  NewsSeverity,
} from '@agentropolis/shared/contracts/v2';
import { SOCKET_EVENTS } from '@agentropolis/shared/contracts/v2';
import { generateNewsHeadline } from './newsTemplates';

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

  /** Get events since a given tick (inclusive), with optional limit and channel filter */
  sinceTick(tick: number, limit = 200, channel?: FeedChannel): FeedEvent[] {
    let results = this.buffer.filter((e) => e.tick >= tick);
    if (channel) {
      results = results.filter((e) => e.channel === channel);
    }
    return results.slice(0, limit);
  }

  /** Get only story-channel events */
  recentStory(n: number): FeedEvent[] {
    return this.buffer.filter((e) => e.channel === 'story').slice(0, n);
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
 * S4.2: `channel` determines story (spectator) vs telemetry (debug).
 * S4.3: `category` enables news template rendering on the client.
 */
export function publishEvent(
  type: FeedEventType,
  headline: string,
  tick: number,
  opts?: {
    detail?: string;
    severity?: NewsSeverity;
    tags?: string[];
    channel?: FeedChannel;
    category?: string;
  },
): FeedEvent {
  eventCounter++;

  // S4.3: Apply news templates for story-channel events
  let finalHeadline = headline;
  let finalDetail = opts?.detail;
  if (opts?.channel === 'story' && opts?.category) {
    const templated = generateNewsHeadline(opts.category, headline, opts.detail);
    finalHeadline = templated.headline;
    if (templated.body) finalDetail = templated.body;
  }

  const event: FeedEvent = {
    id: `${tick}-${eventCounter}`,
    type,
    headline: finalHeadline,
    detail: finalDetail,
    severity: opts?.severity ?? 'routine',
    tick,
    ts: new Date().toISOString(),
    tags: opts?.tags ?? [],
    channel: opts?.channel,
    category: opts?.category,
  };

  eventStore.push(event);

  if (ioRef) {
    ioRef.emit(SOCKET_EVENTS.FEED_EVENT as 'feed:event', event);
  }

  return event;
}
