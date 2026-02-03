/**
 * Tick Pipeline + Agent State E2E Tests
 *
 * Tests:
 * 1. Tick advances + needs decay
 * 2. Work increases balance + rep
 * 3. Eat decreases balance, increases hunger
 * 4. Same event stream for 2 clients (deterministic tick)
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
}

interface ActionResultEvent {
  requestId: string;
  agentId: string;
  actionType: string;
  tick: number;
  ok: boolean;
  reason?: string;
  outcome?: string;
  agent?: {
    id: string;
    name: string;
    needs: { hunger: number; rest: number; fun: number };
    reputation: number;
    balance: number;
    stats: { workHours: number };
    [key: string]: unknown;
  };
  diff?: Record<string, unknown>;
}

interface TickCompleteEvent {
  tick: number;
  serverTime: string;
  economy?: Record<string, unknown>;
}

interface CityMetricsEvent {
  tick: number;
  agentCount: number;
  activeCount: number;
  treasury: number;
  season: string;
  [key: string]: unknown;
}

interface AgentsUpdateEvent {
  tick: number;
  agents: Array<{
    id: string;
    name: string;
    needs: { hunger: number; rest: number; fun: number };
    reputation: number;
    balance: number;
    [key: string]: unknown;
  }>;
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

function collectEvents<T>(
  socket: Socket,
  event: string,
  durationMs: number,
): Promise<T[]> {
  return new Promise((resolve) => {
    const collected: T[] = [];
    function handler(data: T) {
      collected.push(data);
    }
    socket.on(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve(collected);
    }, durationMs);
  });
}

test.describe('Tick Pipeline E2E (requires backend)', () => {
  test.setTimeout(90_000);

  let socket: Socket;

  test.afterEach(async () => {
    if (socket?.connected) socket.disconnect();
  });

  // ---- TEST 1: Tick advances + needs decay ----
  test('tick advances and agent needs decay over 2 ticks', async () => {
    socket = await connectSocket();

    const name = `decay-test-${Date.now()}`;
    const reg = await registerAgent(socket, name);
    expect(reg.ok).toBe(true);

    const agentId = reg.agentId!;

    // Get agent initial state from spectator:sync
    const syncData = await waitForEvent<{
      agents: Array<{ id: string; needs: { hunger: number; rest: number; fun: number } }>;
    }>(socket, 'spectator:sync', undefined, 10_000);

    const initialAgent = syncData.agents.find((a) => a.id === agentId);
    expect(initialAgent).toBeTruthy();
    const initialNeeds = initialAgent!.needs;

    // Wait for 2 tick:complete events
    await waitForEvent<TickCompleteEvent>(socket, 'tick:complete', undefined, 30_000);
    await waitForEvent<TickCompleteEvent>(socket, 'tick:complete', undefined, 30_000);

    // Get updated agent from agents:update
    const agentsUpdate = await waitForEvent<AgentsUpdateEvent>(
      socket,
      'agents:update',
      (data) => data.agents.some((a) => a.id === agentId),
      30_000,
    );

    const updatedAgent = agentsUpdate.agents.find((a) => a.id === agentId);
    expect(updatedAgent).toBeTruthy();

    // Needs should have decayed (at least 2 ticks of decay)
    // NEED_DECAY_HUNGER=5, NEED_DECAY_REST=4, NEED_DECAY_FUN=3 per tick
    expect(updatedAgent!.needs.hunger).toBeLessThan(initialNeeds.hunger);
    expect(updatedAgent!.needs.rest).toBeLessThan(initialNeeds.rest);
    expect(updatedAgent!.needs.fun).toBeLessThan(initialNeeds.fun);

    console.log(
      `  Needs decay: hunger ${initialNeeds.hunger}→${updatedAgent!.needs.hunger}, ` +
      `rest ${initialNeeds.rest}→${updatedAgent!.needs.rest}, ` +
      `fun ${initialNeeds.fun}→${updatedAgent!.needs.fun}`,
    );
  });

  // ---- TEST 2: Sleep action updates agent state (balance unchanged, rest increases) ----
  test('sleep action increases rest (via action:result diff)', async () => {
    socket = await connectSocket();

    const name = `sleep-test-${Date.now()}`;
    const reg = await registerAgent(socket, name);
    expect(reg.ok).toBe(true);

    const agentId = reg.agentId!;

    // Wait for first tick so the agent gets decayed needs
    await waitForEvent<TickCompleteEvent>(socket, 'tick:complete', undefined, 30_000);

    // Send sleep action
    const requestId = `sleep-${Date.now()}`;
    const ack = await sendAction(socket, {
      agentId,
      type: 'sleep',
      requestId,
    });
    expect(ack.ok).toBe(true);
    expect(ack.queued).toBe(true);

    // Wait for action:result
    const result = await waitForEvent<ActionResultEvent>(
      socket,
      'action:result',
      (data) => data.requestId === requestId,
      30_000,
    );

    expect(result.ok).toBe(true);
    expect(result.actionType).toBe('sleep');
    expect(result.agent).toBeTruthy();
    expect(result.diff).toBeTruthy();

    // diff.needs.rest should be positive (rest increased)
    const needsDiff = result.diff?.needs as { rest: number; hunger: number } | undefined;
    expect(needsDiff).toBeTruthy();
    expect(needsDiff!.rest).toBeGreaterThan(0);

    console.log(
      `  Sleep result: rest diff=${needsDiff?.rest}, hunger diff=${needsDiff?.hunger}`,
    );
  });

  // ---- TEST 3: Eat decreases balance, increases hunger ----
  test('eat action decreases balance and increases hunger', async () => {
    socket = await connectSocket();

    const name = `eat-test-${Date.now()}`;
    const reg = await registerAgent(socket, name);
    expect(reg.ok).toBe(true);

    const agentId = reg.agentId!;

    // Wait for a tick so decay lowers hunger (starts at 80, decay will reduce it)
    await waitForEvent<TickCompleteEvent>(socket, 'tick:complete', undefined, 30_000);

    // Send eat action
    const requestId = `eat-${Date.now()}`;
    const ack = await sendAction(socket, {
      agentId,
      type: 'eat',
      requestId,
    });
    expect(ack.ok).toBe(true);
    expect(ack.queued).toBe(true);

    // Wait for action:result
    const result = await waitForEvent<ActionResultEvent>(
      socket,
      'action:result',
      (data) => data.requestId === requestId,
      30_000,
    );

    expect(result.ok).toBe(true);
    expect(result.actionType).toBe('eat');
    expect(result.diff).toBeTruthy();

    // Balance should have decreased (negative diff)
    expect(result.diff!.balance).toBeLessThan(0);

    // Hunger should have increased (positive diff)
    const needsDiff = result.diff?.needs as { hunger: number } | undefined;
    expect(needsDiff).toBeTruthy();
    expect(needsDiff!.hunger).toBeGreaterThan(0);

    // Agent snapshot should reflect the change
    expect(result.agent).toBeTruthy();
    // Starting money is 100, food cost is 5
    expect(result.agent!.balance).toBeLessThan(100);

    console.log(
      `  Eat result: balance diff=${result.diff!.balance}, hunger diff=${needsDiff?.hunger}, ` +
      `new balance=${result.agent!.balance}`,
    );
  });

  // ---- TEST 4: Same event stream for 2 clients ----
  test('two clients receive same tick number and city:metrics', async () => {
    const socket1 = await connectSocket();
    const socket2 = await connectSocket();

    try {
      // Collect tick:complete from both sockets
      const [tick1Promise, tick2Promise] = [
        waitForEvent<TickCompleteEvent>(socket1, 'tick:complete', undefined, 30_000),
        waitForEvent<TickCompleteEvent>(socket2, 'tick:complete', undefined, 30_000),
      ];

      const [tick1, tick2] = await Promise.all([tick1Promise, tick2Promise]);

      // Both must see the same tick number
      expect(tick1.tick).toBe(tick2.tick);

      console.log(`  Both clients received tick:complete #${tick1.tick}`);

      // Now collect city:metrics from both
      const [metrics1Promise, metrics2Promise] = [
        waitForEvent<CityMetricsEvent>(socket1, 'city:metrics', undefined, 30_000),
        waitForEvent<CityMetricsEvent>(socket2, 'city:metrics', undefined, 30_000),
      ];

      const [metrics1, metrics2] = await Promise.all([metrics1Promise, metrics2Promise]);

      // Same tick, same treasury, same agent count
      expect(metrics1.tick).toBe(metrics2.tick);
      expect(metrics1.treasury).toBe(metrics2.treasury);
      expect(metrics1.agentCount).toBe(metrics2.agentCount);
      expect(metrics1.season).toBe(metrics2.season);

      console.log(
        `  Both clients see: tick=${metrics1.tick}, treasury=${metrics1.treasury}, ` +
        `agents=${metrics1.agentCount}, season=${metrics1.season}`,
      );
    } finally {
      socket1.disconnect();
      socket2.disconnect();
    }

    // Prevent afterEach from trying to disconnect again
    socket = null as unknown as Socket; // prevent afterEach double-disconnect
  });
});
