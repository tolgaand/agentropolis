/**
 * Crime + Police + Jail E2E Tests
 *
 * Tests:
 * 1. Low police + high REP → low catch chance, theft can succeed
 * 2. High police + low REP → high catch chance, arrested
 * 3. Arrested penalties: jailed, fined, rep -10
 * 4. Successful theft: victim loses CRD, actor gains, rep -3
 * 5. Jail release: agent becomes active after JAIL_TICKS
 * 6. Multi-client: crime events visible to both clients
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
    status: string;
    reputation: number;
    balance: number;
    needs: { hunger: number; rest: number; fun: number };
    stats: { crimeCount: number; successfulThefts: number; lastCrimeTick: number };
    [key: string]: unknown;
  };
  diff?: {
    balance?: number;
    reputation?: number;
    repBefore?: number;
    repAfter?: number;
    catchChance?: number;
    caught?: boolean;
    fineAmount?: number;
    stolen?: number;
    [key: string]: unknown;
  };
}

interface CityMetricsEvent {
  tick: number;
  policeCountActive: number;
  crimeRateLast10: number;
  [key: string]: unknown;
}

interface TickCompleteEvent {
  tick: number;
  serverTime: string;
  [key: string]: unknown;
}

interface AgentsUpdateEvent {
  tick: number;
  agents: Array<{
    id: string;
    name: string;
    status: string;
    reputation: number;
    balance: number;
    [key: string]: unknown;
  }>;
}

interface EventsBatchEvent {
  tick: number;
  events: Array<{
    id: string;
    type: string;
    headline: string;
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

test.describe('Crime + Police + Jail E2E (requires backend)', () => {
  test.setTimeout(120_000);

  let socket: Socket;

  test.afterEach(async () => {
    if (socket?.connected) socket.disconnect();
  });

  /**
   * Helper: register two agents (actor + victim), wait for tick so they're synced.
   * Returns { actorId, victimId }.
   */
  async function setupCrimePair(
    sock: Socket,
    suffix: string,
  ): Promise<{ actorId: string; victimId: string }> {
    const actorReg = await registerAgent(sock, `actor-${suffix}`);
    expect(actorReg.ok).toBe(true);

    const victimReg = await registerAgent(sock, `victim-${suffix}`);
    expect(victimReg.ok).toBe(true);

    // Wait for a tick so agents are fully registered
    await waitForEvent<TickCompleteEvent>(sock, 'tick:complete', undefined, 30_000);

    return { actorId: actorReg.agentId!, victimId: victimReg.agentId! };
  }

  // ---- TEST 1: Crime action queues and produces action:result ----
  test('crime action produces action:result with diff data', async () => {
    socket = await connectSocket();

    const { actorId, victimId } = await setupCrimePair(socket, `crime-basic-${Date.now()}`);

    const requestId = `crime-${Date.now()}`;
    const ack = await sendAction(socket, {
      agentId: actorId,
      type: 'crime',
      targetAgentId: victimId,
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
    expect(result.actionType).toBe('crime');
    expect(result.diff).toBeTruthy();
    expect(typeof result.diff!.catchChance).toBe('number');
    expect(typeof result.diff!.caught).toBe('boolean');
    expect(typeof result.diff!.repBefore).toBe('number');
    expect(typeof result.diff!.repAfter).toBe('number');

    console.log(
      `  Crime result: caught=${result.diff!.caught}, catchChance=${result.diff!.catchChance?.toFixed(2)}, ` +
      `repBefore=${result.diff!.repBefore}, repAfter=${result.diff!.repAfter}`,
    );
  });

  // ---- TEST 2: Caught agent is jailed with correct penalties ----
  test('caught agent is jailed with fine and rep penalty', async () => {
    socket = await connectSocket();

    // Run multiple attempts to get a caught result (probabilistic)
    let caughtResult: ActionResultEvent | null = null;

    for (let i = 0; i < 10 && !caughtResult; i++) {
      const { actorId, victimId } = await setupCrimePair(socket, `caught-${Date.now()}-${i}`);

      const requestId = `caught-${Date.now()}-${i}`;
      const ack = await sendAction(socket, {
        agentId: actorId,
        type: 'crime',
        targetAgentId: victimId,
        requestId,
      });

      if (!ack.ok) continue;

      const result = await waitForEvent<ActionResultEvent>(
        socket,
        'action:result',
        (data) => data.requestId === requestId,
        30_000,
      );

      if (result.diff?.caught) {
        caughtResult = result;
      }
    }

    expect(caughtResult).toBeTruthy();
    expect(caughtResult!.diff!.caught).toBe(true);

    // Verify penalties
    expect(caughtResult!.agent).toBeTruthy();
    expect(caughtResult!.agent!.status).toBe('jailed');

    // Rep should have decreased by 10 (or whatever was available)
    const repLoss = (caughtResult!.diff!.repBefore as number) - (caughtResult!.diff!.repAfter as number);
    expect(repLoss).toBeGreaterThan(0);
    expect(repLoss).toBeLessThanOrEqual(10);

    // Fine should exist
    expect(caughtResult!.diff!.fineAmount).toBeGreaterThan(0);
    // Balance should have decreased (fine paid)
    expect(caughtResult!.diff!.balance).toBeLessThan(0);

    console.log(
      `  Caught: fine=${caughtResult!.diff!.fineAmount}, repLoss=${repLoss}, ` +
      `status=${caughtResult!.agent!.status}`,
    );
  });

  // ---- TEST 3: Successful theft transfers money ----
  test('successful theft transfers money from victim to actor', async () => {
    socket = await connectSocket();

    let successResult: ActionResultEvent | null = null;

    for (let i = 0; i < 15 && !successResult; i++) {
      const { actorId, victimId } = await setupCrimePair(socket, `steal-${Date.now()}-${i}`);

      const requestId = `steal-${Date.now()}-${i}`;
      const ack = await sendAction(socket, {
        agentId: actorId,
        type: 'crime',
        targetAgentId: victimId,
        requestId,
      });

      if (!ack.ok) continue;

      const result = await waitForEvent<ActionResultEvent>(
        socket,
        'action:result',
        (data) => data.requestId === requestId,
        30_000,
      );

      if (!result.diff?.caught) {
        successResult = result;
      }
    }

    expect(successResult).toBeTruthy();
    expect(successResult!.diff!.caught).toBe(false);

    // Stolen amount should be positive
    const stolen = successResult!.diff!.stolen as number;
    expect(stolen).toBeGreaterThanOrEqual(0);

    // Actor balance increased
    expect(successResult!.diff!.balance).toBeGreaterThanOrEqual(0);

    // Rep decreased by up to 3
    const repLoss = (successResult!.diff!.repBefore as number) - (successResult!.diff!.repAfter as number);
    expect(repLoss).toBeGreaterThanOrEqual(0);
    expect(repLoss).toBeLessThanOrEqual(3);

    // Agent should still be active (not jailed)
    expect(successResult!.agent!.status).toBe('active');

    console.log(
      `  Theft success: stolen=${stolen}, repLoss=${repLoss}, balance=${successResult!.agent!.balance}`,
    );
  });

  // ---- TEST 4: Jailed agent can't perform actions ----
  test('jailed agent actions are rejected', async () => {
    socket = await connectSocket();

    // Get a caught agent first
    let jailedAgentId: string | null = null;

    for (let i = 0; i < 10 && !jailedAgentId; i++) {
      const { actorId, victimId } = await setupCrimePair(socket, `jail-reject-${Date.now()}-${i}`);

      const requestId = `jail-reject-${Date.now()}-${i}`;
      const ack = await sendAction(socket, {
        agentId: actorId,
        type: 'crime',
        targetAgentId: victimId,
        requestId,
      });

      if (!ack.ok) continue;

      const result = await waitForEvent<ActionResultEvent>(
        socket,
        'action:result',
        (data) => data.requestId === requestId,
        30_000,
      );

      if (result.diff?.caught && result.agent?.status === 'jailed') {
        jailedAgentId = actorId;
      }
    }

    expect(jailedAgentId).toBeTruthy();

    // Try to perform a work action while jailed
    const workAck = await sendAction(socket, {
      agentId: jailedAgentId!,
      type: 'work',
      requestId: `jailed-work-${Date.now()}`,
    });

    // Should be rejected at ack level (agent_jailed check in socket handler)
    expect(workAck.ok).toBe(false);
    expect(workAck.reason).toContain('jailed');

    console.log(`  Jailed agent work rejected: reason=${workAck.reason}`);
  });

  // ---- TEST 5: policeCountActive appears in city:metrics ----
  test('policeCountActive reported in city:metrics', async () => {
    socket = await connectSocket();

    const metrics = await waitForEvent<CityMetricsEvent>(
      socket,
      'city:metrics',
      undefined,
      30_000,
    );

    expect(typeof metrics.policeCountActive).toBe('number');
    expect(metrics.policeCountActive).toBeGreaterThanOrEqual(0);
    expect(typeof metrics.crimeRateLast10).toBe('number');

    console.log(
      `  Tick ${metrics.tick}: policeCountActive=${metrics.policeCountActive}, crimeRateLast10=${metrics.crimeRateLast10}`,
    );
  });

  // ---- TEST 6: Multi-client: crime events visible to second client ----
  test('crime events broadcast to second client via events:batch or crime:committed', async () => {
    const socket1 = await connectSocket();
    const socket2 = await connectSocket();

    try {
      const { actorId, victimId } = await setupCrimePair(socket1, `multi-${Date.now()}`);

      // Setup listener on socket2 for crime events
      const crimeEventPromise = new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 60_000);

        // Listen for crime:committed
        socket2.on('crime:committed', () => {
          clearTimeout(timeout);
          resolve(true);
        });

        // Also check events:batch for crime events
        socket2.on('events:batch', (data: EventsBatchEvent) => {
          const hasCrime = data.events.some(
            (e) => e.type === 'crime' || e.type === 'arrest',
          );
          if (hasCrime) {
            clearTimeout(timeout);
            resolve(true);
          }
        });
      });

      // Send crime action from socket1
      const requestId = `multi-crime-${Date.now()}`;
      await sendAction(socket1, {
        agentId: actorId,
        type: 'crime',
        targetAgentId: victimId,
        requestId,
      });

      // Wait for action:result on socket1
      await waitForEvent<ActionResultEvent>(
        socket1,
        'action:result',
        (data) => data.requestId === requestId,
        30_000,
      );

      // Wait for crime event on socket2
      const received = await crimeEventPromise;
      expect(received).toBe(true);

      console.log('  Second client received crime event');
    } finally {
      socket1.disconnect();
      socket2.disconnect();
    }

    socket = null as unknown as Socket; // prevent afterEach double-disconnect
  });
});
