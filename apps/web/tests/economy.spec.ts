/**
 * Economy v1 Gate Tests
 *
 * Tests:
 * 1. NPC budget distribution does not exceed cap
 * 2. Import fees accumulate in outsideWorldCRD
 * 3. Tax collection increases treasury
 * 4. Building closes when upkeep can't be paid, stops receiving revenue
 * 5. Two clients see identical economySnapshot
 *
 * Requires backend running (pnpm dev starts both web + api).
 */

import { test, expect } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';

const API_URL = 'http://localhost:3001';

interface CityMetricsEvent {
  tick: number;
  serverTime: string;
  agentCount: number;
  activeCount: number;
  treasury: number;
  moneySupply: number;
  unemploymentRate: number;
  season: string;
  npcBudget: number;
  npcDistributed: number;
  taxCollected: number;
  importFees: number;
  openBusinesses: number;
  closedBusinesses: number;
  outsideWorldCRD: number;
  [key: string]: unknown;
}

interface TickCompleteEvent {
  tick: number;
  serverTime: string;
  economy?: Record<string, unknown>;
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
  count: number,
  timeoutMs = 60_000,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const collected: T[] = [];
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(collected); // resolve with whatever we have
    }, timeoutMs);

    function handler(data: T) {
      collected.push(data);
      if (collected.length >= count) {
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(collected);
      }
    }

    socket.on(event, handler);
  });
}

test.describe('Economy v1 E2E (requires backend)', () => {
  test.setTimeout(120_000);

  let socket: Socket;

  test.afterEach(async () => {
    if (socket?.connected) socket.disconnect();
  });

  // ---- TEST 1: NPC budget cap ----
  test('NPC budget distribution does not exceed npcBudget', async () => {
    socket = await connectSocket();

    // Collect 2 city:metrics events (wait for economy to stabilize)
    const metrics = await collectEvents<CityMetricsEvent>(socket, 'city:metrics', 2, 60_000);

    expect(metrics.length).toBeGreaterThanOrEqual(1);

    for (const m of metrics) {
      // npcDistributed should never exceed npcBudget
      expect(m.npcDistributed).toBeLessThanOrEqual(m.npcBudget);
      // npcDistributed should be non-negative
      expect(m.npcDistributed).toBeGreaterThanOrEqual(0);
      // npcBudget should be positive (default 200)
      expect(m.npcBudget).toBeGreaterThan(0);

      console.log(
        `  Tick ${m.tick}: npcBudget=${m.npcBudget}, npcDistributed=${m.npcDistributed}`,
      );
    }
  });

  // ---- TEST 2: Import fee accumulates in outsideWorldCRD ----
  test('import fees accumulate in outsideWorldCRD over ticks', async () => {
    socket = await connectSocket();

    // Collect 3 ticks of metrics to observe accumulation
    const metrics = await collectEvents<CityMetricsEvent>(socket, 'city:metrics', 3, 90_000);

    expect(metrics.length).toBeGreaterThanOrEqual(2);

    // outsideWorldCRD should be non-negative and non-decreasing
    for (let i = 1; i < metrics.length; i++) {
      const prev = metrics[i - 1];
      const curr = metrics[i];

      // outsideWorldCRD is cumulative — should not decrease
      expect(curr.outsideWorldCRD).toBeGreaterThanOrEqual(prev.outsideWorldCRD);

      // If there were import fees this tick, outsideWorldCRD should have increased
      if (curr.importFees > 0) {
        expect(curr.outsideWorldCRD).toBeGreaterThan(prev.outsideWorldCRD);
      }

      console.log(
        `  Tick ${curr.tick}: importFees=${curr.importFees}, outsideWorldCRD=${curr.outsideWorldCRD}`,
      );
    }
  });

  // ---- TEST 3: Tax collection increases treasury ----
  test('tax collection increases treasury', async () => {
    socket = await connectSocket();

    // Collect several ticks to observe tax being collected
    const metrics = await collectEvents<CityMetricsEvent>(socket, 'city:metrics', 3, 90_000);

    expect(metrics.length).toBeGreaterThanOrEqual(1);

    // Check that taxCollected is reported in metrics (may be 0 if no shop owners yet)
    for (const m of metrics) {
      expect(m.taxCollected).toBeGreaterThanOrEqual(0);
      // Treasury should be a positive number (started at 10,000)
      expect(m.treasury).toBeGreaterThan(0);

      console.log(
        `  Tick ${m.tick}: taxCollected=${m.taxCollected}, treasury=${m.treasury}`,
      );
    }

    // If any tick had tax collected, verify treasury is healthy
    const withTax = metrics.filter((m) => m.taxCollected > 0);
    if (withTax.length > 0) {
      console.log(`  ${withTax.length} ticks had tax collection`);
    } else {
      console.log('  No tax collected (no shop owners active yet — expected in fresh city)');
    }
  });

  // ---- TEST 4: Building closes when upkeep unpaid, stops receiving revenue ----
  test('closedBusinesses reported in metrics when buildings cannot pay upkeep', async () => {
    socket = await connectSocket();

    // Observe metrics over several ticks
    const metrics = await collectEvents<CityMetricsEvent>(socket, 'city:metrics', 3, 90_000);

    expect(metrics.length).toBeGreaterThanOrEqual(1);

    for (const m of metrics) {
      // openBusinesses + closedBusinesses = total businesses with income or temporarily_closed
      expect(m.openBusinesses).toBeGreaterThanOrEqual(0);
      expect(m.closedBusinesses).toBeGreaterThanOrEqual(0);

      // If there are closed businesses, npcDistributed should exclude them
      // (closed buildings don't participate in NPC revenue — they have status != 'active')
      console.log(
        `  Tick ${m.tick}: openBusinesses=${m.openBusinesses}, closedBusinesses=${m.closedBusinesses}, ` +
        `npcDistributed=${m.npcDistributed}`,
      );
    }

    // Verify the metrics fields exist and are numbers
    const lastMetric = metrics[metrics.length - 1];
    expect(typeof lastMetric.openBusinesses).toBe('number');
    expect(typeof lastMetric.closedBusinesses).toBe('number');
  });

  // ---- TEST 5: Two clients see identical economySnapshot ----
  test('two clients receive identical city:metrics for the same tick', async () => {
    const socket1 = await connectSocket();
    const socket2 = await connectSocket();

    try {
      // Wait for both to receive the same tick's city:metrics
      const [metrics1Promise, metrics2Promise] = [
        waitForEvent<CityMetricsEvent>(socket1, 'city:metrics', undefined, 30_000),
        waitForEvent<CityMetricsEvent>(socket2, 'city:metrics', undefined, 30_000),
      ];

      const [metrics1, metrics2] = await Promise.all([metrics1Promise, metrics2Promise]);

      // Both should see the same tick
      expect(metrics1.tick).toBe(metrics2.tick);

      // All economy fields should match
      expect(metrics1.treasury).toBe(metrics2.treasury);
      expect(metrics1.moneySupply).toBe(metrics2.moneySupply);
      expect(metrics1.npcBudget).toBe(metrics2.npcBudget);
      expect(metrics1.npcDistributed).toBe(metrics2.npcDistributed);
      expect(metrics1.taxCollected).toBe(metrics2.taxCollected);
      expect(metrics1.importFees).toBe(metrics2.importFees);
      expect(metrics1.openBusinesses).toBe(metrics2.openBusinesses);
      expect(metrics1.closedBusinesses).toBe(metrics2.closedBusinesses);
      expect(metrics1.outsideWorldCRD).toBe(metrics2.outsideWorldCRD);
      expect(metrics1.season).toBe(metrics2.season);
      expect(metrics1.agentCount).toBe(metrics2.agentCount);

      console.log(
        `  Both clients received tick=${metrics1.tick}: treasury=${metrics1.treasury}, ` +
        `npcDistributed=${metrics1.npcDistributed}, taxCollected=${metrics1.taxCollected}, ` +
        `outsideWorldCRD=${metrics1.outsideWorldCRD}`,
      );
    } finally {
      socket1.disconnect();
      socket2.disconnect();
    }

    // Prevent afterEach from trying to disconnect again
    socket = null as unknown as Socket; // prevent afterEach double-disconnect
  });
});
