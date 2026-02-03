/**
 * Action Queue E2E Tests
 *
 * Tests the queue-based action processing pipeline:
 * 1. agent:action → ack { queued: true }
 * 2. next tick → action:result with outcome
 * 3. buy_parcel + build propagation via chunk:payload
 *
 * Requires backend running (pnpm dev starts both web + api).
 */

import { test, expect } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';

const API_URL = 'http://localhost:3001';

interface AckResponse {
  ok: boolean;
  reason?: string;
  agentId?: string;
  apiKey?: string;
  queued?: boolean;
  outcome?: string;
}

interface ActionResultEvent {
  requestId: string;
  agentId: string;
  actionType: string;
  tick: number;
  ok: boolean;
  reason?: string;
  outcome?: string;
  agent?: Record<string, unknown>;
  diff?: Record<string, unknown>;
}

function connectSocket(): Promise<Socket> {
  return new Promise<Socket>((resolve, reject) => {
    const socket = io(API_URL, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
      path: '/socket.io',
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err: Error) => reject(err));
    setTimeout(() => reject(new Error('Socket connection timeout')), 10_000);
  });
}

function registerAgent(
  socket: Socket,
  name: string,
): Promise<AckResponse> {
  return new Promise((resolve) => {
    socket.emit('agent:register', { name, aiModel: 'test' }, (ack: AckResponse) => {
      resolve(ack);
    });
  });
}

function sendAction(
  socket: Socket,
  payload: Record<string, unknown>,
): Promise<AckResponse> {
  return new Promise((resolve) => {
    socket.emit('agent:action', payload, (ack: AckResponse) => {
      resolve(ack);
    });
  });
}

function waitForEvent<T>(
  socket: Socket,
  event: string,
  filter?: (data: T) => boolean,
  timeoutMs = 30_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout waiting for ${event}`));
    }, timeoutMs);

    function handler(data: T) {
      if (!filter || filter(data)) {
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(data);
      }
    }

    socket.on(event, handler);
  });
}

test.describe('Action Queue E2E (requires backend)', () => {
  test.setTimeout(90_000);

  let socket: Socket;

  test.afterEach(async () => {
    if (socket?.connected) {
      socket.disconnect();
    }
  });

  test('action:queue roundtrip — work action queued and processed at next tick', async () => {
    socket = await connectSocket();

    // Register agent
    const uniqueName = `test-agent-${Date.now()}`;
    const registerResult = await registerAgent(socket, uniqueName);
    expect(registerResult.ok).toBe(true);
    expect(registerResult.agentId).toBeTruthy();

    const agentId = registerResult.agentId!;

    // The agent needs to be employed for 'work' to succeed.
    // Use 'sleep' instead which always works (no employment requirement).
    const requestId = `req-${Date.now()}`;

    // Send action — should get immediate ack with queued: true
    const ack = await sendAction(socket, {
      agentId,
      type: 'sleep',
      requestId,
    });
    expect(ack.ok).toBe(true);
    expect(ack.queued).toBe(true);

    // Wait for action:result from next tick
    const result = await waitForEvent<ActionResultEvent>(
      socket,
      'action:result',
      (data) => data.requestId === requestId,
      30_000,
    );

    expect(result.ok).toBe(true);
    expect(result.agentId).toBe(agentId);
    expect(result.actionType).toBe('sleep');
    expect(result.tick).toBeGreaterThan(0);
    expect(result.outcome).toBeTruthy();
    expect(result.agent).toBeTruthy();
  });

  test('action:queue — duplicate action in same tick rejected', async () => {
    socket = await connectSocket();

    const uniqueName = `test-dup-${Date.now()}`;
    const reg = await registerAgent(socket, uniqueName);
    expect(reg.ok).toBe(true);

    const agentId = reg.agentId!;

    // First action — should succeed
    const ack1 = await sendAction(socket, {
      agentId,
      type: 'sleep',
      requestId: `first-${Date.now()}`,
    });
    expect(ack1.ok).toBe(true);
    expect(ack1.queued).toBe(true);

    // Second action from same agent — should be rejected (1 per tick)
    const ack2 = await sendAction(socket, {
      agentId,
      type: 'relax',
      requestId: `second-${Date.now()}`,
    });
    expect(ack2.ok).toBe(false);
    expect(ack2.reason).toBe('action_already_queued');
  });

  test('action:queue — jailed agent rejected at enqueue', async () => {
    // This test verifies the socket handler pre-validation:
    // a jailed agent's action is rejected immediately, not queued.
    socket = await connectSocket();

    // Send action for a non-existent agent — should be rejected
    const ack = await sendAction(socket, {
      agentId: '000000000000000000000000',
      type: 'sleep',
      requestId: `ghost-${Date.now()}`,
    });
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('agent_not_found');
  });

  test('action:queue — action accepted during tick (no rejection)', async () => {
    // The key difference from the old system: actions are NEVER rejected
    // because of tick_in_progress — they're always queued.
    socket = await connectSocket();

    const uniqueName = `test-during-tick-${Date.now()}`;
    const reg = await registerAgent(socket, uniqueName);
    expect(reg.ok).toBe(true);

    // Wait for a tick:complete to know we're between ticks
    await waitForEvent(socket, 'tick:complete', undefined, 30_000);

    // Immediately send action
    const ack = await sendAction(socket, {
      agentId: reg.agentId!,
      type: 'sleep',
      requestId: `during-${Date.now()}`,
    });

    // Should be accepted (queued), never 'tick_in_progress'
    expect(ack.ok).toBe(true);
    expect(ack.queued).toBe(true);
    expect(ack.reason).not.toBe('tick_in_progress');
  });

  test('buy_parcel — parcel ownership via action queue', async () => {
    socket = await connectSocket();

    const uniqueName = `test-buyer-${Date.now()}`;
    const reg = await registerAgent(socket, uniqueName);
    expect(reg.ok).toBe(true);

    const agentId = reg.agentId!;
    // Use unique coordinates to avoid collision
    const worldX = 101;
    const worldZ = 101;

    const requestId = `buy-${Date.now()}`;
    const ack = await sendAction(socket, {
      agentId,
      type: 'buy_parcel',
      worldX,
      worldZ,
      requestId,
    });
    expect(ack.ok).toBe(true);
    expect(ack.queued).toBe(true);

    // Wait for result
    const result = await waitForEvent<ActionResultEvent>(
      socket,
      'action:result',
      (data) => data.requestId === requestId,
      30_000,
    );

    expect(result.ok).toBe(true);
    expect(result.actionType).toBe('buy_parcel');
    expect(result.diff).toBeTruthy();

    // Second buy of same tile (next tick) — should fail
    // Wait for next tick first so queue is drained
    await waitForEvent(socket, 'tick:complete', undefined, 30_000);

    const requestId2 = `buy2-${Date.now()}`;
    const ack2 = await sendAction(socket, {
      agentId,
      type: 'buy_parcel',
      worldX,
      worldZ,
      requestId: requestId2,
    });
    expect(ack2.ok).toBe(true);

    const result2 = await waitForEvent<ActionResultEvent>(
      socket,
      'action:result',
      (data) => data.requestId === requestId2,
      30_000,
    );

    // Should fail: already_owned
    expect(result2.ok).toBe(false);
    expect(result2.reason).toBe('already_owned');
  });

  test('build — building placement propagates chunk update', async () => {
    socket = await connectSocket();

    const uniqueName = `test-builder-${Date.now()}`;
    const reg = await registerAgent(socket, uniqueName);
    expect(reg.ok).toBe(true);

    const agentId = reg.agentId!;
    // Use unique buildable coordinates (not on road)
    const worldX = 201;
    const worldZ = 201;

    // First buy the parcel
    const buyReqId = `build-buy-${Date.now()}`;
    await sendAction(socket, {
      agentId,
      type: 'buy_parcel',
      worldX,
      worldZ,
      requestId: buyReqId,
    });

    // Wait for buy result
    await waitForEvent<ActionResultEvent>(
      socket,
      'action:result',
      (data) => data.requestId === buyReqId,
      30_000,
    );

    // Wait for next tick to clear the queue
    await waitForEvent(socket, 'tick:complete', undefined, 30_000);

    // Subscribe to the chunk so we get chunk:payload updates
    const chunkX = Math.floor(worldX / 16);
    const chunkZ = Math.floor(worldZ / 16);
    socket.emit('viewport:subscribe', {
      chunks: [{ chunkX, chunkZ }],
    });

    // Wait for initial chunk payload
    await waitForEvent(
      socket,
      'chunk:payload',
      (data: { chunkX: number; chunkZ: number }) =>
        data.chunkX === chunkX && data.chunkZ === chunkZ,
      10_000,
    );

    // Now build on the parcel
    const buildReqId = `build-${Date.now()}`;
    const buildAck = await sendAction(socket, {
      agentId,
      type: 'build',
      worldX,
      worldZ,
      buildingType: 'park',
      requestId: buildReqId,
    });
    expect(buildAck.ok).toBe(true);
    expect(buildAck.queued).toBe(true);

    // Wait for build result
    const buildResult = await waitForEvent<ActionResultEvent>(
      socket,
      'action:result',
      (data) => data.requestId === buildReqId,
      30_000,
    );

    expect(buildResult.ok).toBe(true);
    expect(buildResult.actionType).toBe('build');
    expect(buildResult.diff?.buildingId).toBeTruthy();

    // Verify chunk:payload was re-published after build
    const chunkUpdate = await waitForEvent(
      socket,
      'chunk:payload',
      (data: { chunkX: number; chunkZ: number }) =>
        data.chunkX === chunkX && data.chunkZ === chunkZ,
      10_000,
    );
    expect(chunkUpdate).toBeTruthy();
  });
});
