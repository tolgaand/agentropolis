import { test, expect } from '@playwright/test';

// Extend window type for AT namespace
declare global {
  interface Window {
    AT: {
      smoke: () => Promise<Array<{ test: string; status: string; detail: string }>>;
      setMode: (mode: 'offline' | 'stub' | 'real') => string;
      getMode: () => string;
      testModeSwitch: () => Promise<{ pass: boolean; results: Array<{ from: string; to: string; ok: boolean }> }>;
      testCleanup: () => Promise<{ pass: boolean }>;
      socketConnected: () => boolean;
      regression: () => Array<{ status: string }>;
      subscribeChunks: (chunks: Array<{ chunkX: number; chunkZ: number }>) => unknown[];
      unsubscribeChunks: (chunks: Array<{ chunkX: number; chunkZ: number }>) => void;
      citySync: () => { cityId: string; seed: number; mode: string } | null;
      placeReal: (assetKey: string, worldX: number, worldZ: number, opts?: {
        ownerId?: string; rotY?: number; tileW?: number; tileD?: number;
      }) => Promise<{ ok: boolean; buildingId?: string; reason?: string }>;
      removeReal: (buildingId: string, ownerId?: string) => Promise<{ ok: boolean; reason?: string }>;
      buyParcel: (worldX: number, worldZ: number, ownerId: string) => Promise<{ ok: boolean; reason?: string }>;
      modeAudit: (mode?: 'offline' | 'stub' | 'real') => Promise<{
        log: Array<{ t: number; mode: string; socket: boolean; activeChunks: number }>;
        stableMode: boolean; finalSocket: boolean;
      }>;
      teleportTest: (repeats?: number) => Promise<{
        pass: boolean;
        results: Array<{ repeat: number; pass: boolean; failures: string[] }>;
      }>;
    };
    __v2?: {
      getRealLayerStore?: () => {
        getBuildingsInChunk: (cx: number, cz: number) => unknown[];
      };
      getActiveChunks?: () => Array<{ chunkX: number; chunkZ: number }>;
      getGridCoords?: () => { x: number; y: number };
      focusOnTile?: (worldX: number, worldZ: number) => void;
    };
  }
}

/** Wait for AT namespace + renderer to be ready (status text = "Ready") */
async function waitForReady(page: import('@playwright/test').Page) {
  // Wait for the page to have AT namespace
  await page.waitForFunction(() => typeof window.AT !== 'undefined', null, {
    timeout: 20_000,
  });
  // Wait for renderer init (status badge shows "Ready")
  await page.waitForFunction(
    () => document.body.innerText.includes('Ready'),
    null,
    { timeout: 30_000 },
  );
}

test.describe('MapTest Gate Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForReady(page);
    // Reset to offline — auto-start may have switched to stub/real
    await page.evaluate(() => window.AT.setMode('offline'));
  });

  test('AT.smoke() — all sub-tests pass', async ({ page }) => {
    const summary = await page.evaluate(() => window.AT.smoke());

    // Log results for CI visibility
    for (const row of summary) {
      console.log(`  ${row.status} ${row.test}: ${row.detail}`);
    }

    const failed = summary.filter(r => r.status !== 'PASS');
    expect(failed, `Failed tests: ${failed.map(f => f.test).join(', ')}`).toHaveLength(0);
  });

  test('AT.setMode("stub") — stub mode works', async ({ page }) => {
    const mode = await page.evaluate(() => {
      window.AT.setMode('stub');
      return window.AT.getMode();
    });
    expect(mode).toBe('stub');

    // Run regression in stub mode (determinism still holds)
    const reg = await page.evaluate(() => window.AT.regression());
    const allPass = reg.every(r => r.status === 'PASS');
    expect(allPass, 'Determinism regression failed in stub mode').toBe(true);

    // Switch back
    await page.evaluate(() => window.AT.setMode('offline'));
  });

  test('AT.setMode("real") — real mode sets without crash', async ({ page }) => {
    // Real mode won't have a backend in CI, but it should not crash
    const mode = await page.evaluate(() => {
      window.AT.setMode('real');
      return window.AT.getMode();
    });
    expect(mode).toBe('real');

    // Socket won't connect without backend — that's expected
    // Just verify no crash and we can switch back
    const backMode = await page.evaluate(() => {
      window.AT.setMode('offline');
      return window.AT.getMode();
    });
    expect(backMode).toBe('offline');
  });

  test('AT.testModeSwitch() — all transitions pass', async ({ page }) => {
    const result = await page.evaluate(() => window.AT.testModeSwitch());

    for (const r of result.results) {
      console.log(`  ${r.from} → ${r.to}: ${r.ok ? 'OK' : 'FAIL'}`);
    }

    expect(result.pass, 'Mode switch transitions failed').toBe(true);
  });

  test('AT.testCleanup() — subscribe/unsubscribe cleanup', async ({ page }) => {
    const result = await page.evaluate(() => window.AT.testCleanup());
    expect(result.pass, 'Cleanup test failed').toBe(true);
  });

  test('Auto-AOI — stub mode auto-subscribes visible chunks on mode switch', async ({ page }) => {
    // Switch to stub mode — auto-AOI should subscribe visible 5x5 chunks
    const result = await page.evaluate(() => {
      window.AT.setMode('stub');
      const active = window.__v2?.getActiveChunks?.() ?? [];
      const grid = window.__v2?.getGridCoords?.() ?? { x: 0, y: 0 };
      const mode = window.AT.getMode();
      window.AT.setMode('offline');
      return { activeCount: active.length, grid, mode };
    });
    expect(result.mode).toBe('stub');
    // 5x5 = 25 visible chunks should be subscribed
    expect(result.activeCount).toBe(25);
  });

  test('Auto-AOI — focusOnTile updates subscriptions in stub mode', async ({ page }) => {
    const result = await page.evaluate(() => {
      window.AT.setMode('stub');
      const before = window.__v2?.getActiveChunks?.() ?? [];
      // Focus on a far-away tile (chunk 100, 100)
      window.__v2?.focusOnTile?.(1600, 1600);
      const after = window.__v2?.getActiveChunks?.() ?? [];
      const grid = window.__v2?.getGridCoords?.() ?? { x: 0, y: 0 };
      window.AT.setMode('offline');
      return {
        beforeCount: before.length,
        afterCount: after.length,
        grid,
        // Check that chunks are centered around the new grid coords
        hasNewCenter: after.some((c: { chunkX: number; chunkZ: number }) =>
          c.chunkX === grid.x && c.chunkZ === grid.y
        ),
      };
    });
    expect(result.beforeCount).toBe(25);
    expect(result.afterCount).toBe(25);
    expect(result.grid.x).toBe(100); // 1600 / 16 = 100
    expect(result.grid.y).toBe(100);
    expect(result.hasNewCenter).toBe(true);
  });

  test('Auto-AOI — switching to offline clears all subscriptions', async ({ page }) => {
    const result = await page.evaluate(() => {
      window.AT.setMode('stub');
      const stubActive = window.__v2?.getActiveChunks?.()?.length ?? 0;
      window.AT.setMode('offline');
      const offlineActive = window.__v2?.getActiveChunks?.()?.length ?? 0;
      return { stubActive, offlineActive };
    });
    expect(result.stubActive).toBe(25);
    expect(result.offlineActive).toBe(0);
  });
  test('AT.teleportTest() — pan-and-return determinism (10 repeats)', async ({ page }) => {
    const result = await page.evaluate(() => window.AT.teleportTest(10));

    for (const r of result.results) {
      console.log(`  repeat ${r.repeat}: ${r.pass ? 'PASS' : 'FAIL'} ${r.failures.length > 0 ? r.failures.join(',') : ''}`);
    }

    expect(result.pass, 'Teleport test failed — buildings changed after pan').toBe(true);
  });

  test('AT.modeAudit("stub") — mode stays stable', async ({ page }) => {
    // modeAudit polls mode every 200ms, verify it stays 'stub'
    const result = await page.evaluate(() => window.AT.modeAudit('stub', 3));

    expect(result.stableMode, 'Mode did not stay stable as "stub"').toBe(true);
  });
});

/**
 * Auto-start tests — require backend running.
 * Verify that renderer auto-switches mode based on server city:sync without manual AT.setMode().
 */
test.describe('MapTest Auto-Start (requires backend)', () => {
  test.setTimeout(60_000);

  test('Auto-start — renderer switches to server mode without manual setMode', async ({ page }) => {
    // Fresh page load — no manual AT.setMode() calls
    await page.goto('/');

    // Wait for AT namespace
    await page.waitForFunction(() => typeof window.AT !== 'undefined', null, {
      timeout: 20_000,
    });

    // Wait for renderer to be ready (assets loaded)
    await page.waitForFunction(
      () => document.body.innerText.includes('Ready'),
      null,
      { timeout: 30_000 },
    );

    // Wait for auto-start: mode should leave 'offline' within 10s
    await page.waitForFunction(
      () => window.AT.getMode() !== 'offline',
      null,
      { timeout: 10_000 },
    );

    // Capture final state
    const result = await page.evaluate(() => {
      const mode = window.AT.getMode();
      const sync = window.AT.citySync();
      const activeChunks = window.__v2?.getActiveChunks?.()?.length ?? 0;
      return { mode, serverMode: sync?.mode ?? null, activeChunks };
    });

    console.log(`  Server mode: ${result.serverMode}`);
    console.log(`  Client mode: ${result.mode}`);
    console.log(`  Active chunks: ${result.activeChunks}`);

    // Client mode must match server mode mapping:
    // server stub → client stub, server real/hybrid → client real
    expect(result.serverMode).toBeTruthy();
    const expectedMode = result.serverMode === 'stub' ? 'stub' : 'real';
    expect(result.mode, `Expected mode=${expectedMode} from server mode=${result.serverMode}`).toBe(expectedMode);

    // Auto-AOI must be engaged
    expect(result.activeChunks, 'Auto-AOI should subscribe visible chunks').toBeGreaterThan(0);

    // Cleanup
    await page.evaluate(() => window.AT.setMode('offline'));
  });
});

/**
 * Real mode tests — require backend running (pnpm dev starts both web + api).
 * These tests verify end-to-end socket connectivity and chunk data delivery.
 */
test.describe('MapTest Real Mode (requires backend)', () => {
  // Real mode tests need more time: renderer init + socket connect + chunk data round-trip
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for AT namespace + renderer to be ready
    await page.waitForFunction(() => typeof window.AT !== 'undefined', null, {
      timeout: 20_000,
    });
    await page.waitForFunction(
      () => document.body.innerText.includes('Ready'),
      null,
      { timeout: 30_000 },
    );
  });

  test('AT real mode — socket connects and receives chunk:payload via auto-AOI', async ({ page }) => {
    // Switch to real mode — auto-AOI subscribes 25 visible chunks
    const mode = await page.evaluate(() => {
      window.AT.setMode('real');
      return window.AT.getMode();
    });
    expect(mode).toBe('real');

    // Wait for socket connection
    await page.waitForFunction(
      () => window.AT.socketConnected(),
      null,
      { timeout: 15_000 },
    );

    // Auto-AOI should have already subscribed chunks including (0,0)
    const activeCount = await page.evaluate(() =>
      window.__v2?.getActiveChunks?.()?.length ?? 0,
    );
    expect(activeCount).toBe(25);

    // Wait for chunk:payload to arrive (auto-AOI subscription)
    await page.waitForFunction(() => {
      const store = window.__v2?.getRealLayerStore?.();
      return store && store.getBuildingsInChunk(0, 0).length > 0;
    }, null, { timeout: 15_000 });

    // Capture count for determinism check
    const count1 = await page.evaluate(() => {
      const store = window.__v2?.getRealLayerStore?.();
      return store?.getBuildingsInChunk(0, 0).length ?? 0;
    });
    expect(count1).toBeGreaterThan(0);

    // Switch offline and back to real — same count (determinism)
    await page.evaluate(() => window.AT.setMode('offline'));
    await page.evaluate(() => window.AT.setMode('real'));

    await page.waitForFunction(
      () => window.AT.socketConnected(),
      null,
      { timeout: 15_000 },
    );

    await page.waitForFunction(() => {
      const store = window.__v2?.getRealLayerStore?.();
      return store && store.getBuildingsInChunk(0, 0).length > 0;
    }, null, { timeout: 15_000 });

    const count2 = await page.evaluate(() => {
      const store = window.__v2?.getRealLayerStore?.();
      return store?.getBuildingsInChunk(0, 0).length ?? 0;
    });
    expect(count2).toBe(count1);

    // Cleanup
    await page.evaluate(() => window.AT.setMode('offline'));
  });

  test('AT.placeReal — place + remove building via socket', async ({ page }) => {
    await page.evaluate(() => window.AT.setMode('real'));
    await page.waitForFunction(() => window.AT.socketConnected(), null, { timeout: 15_000 });

    // Subscribe to chunk 0,0
    await page.evaluate(() => window.AT.subscribeChunks([{ chunkX: 0, chunkZ: 0 }]));

    // Wait for initial chunk data
    await page.waitForTimeout(1000);

    // Place building at buildable tile (1,1) — not a road
    const placeResult = await page.evaluate(() =>
      window.AT.placeReal('coffee', 1, 1, { ownerId: 'test-user' }),
    );
    expect(placeResult.ok).toBe(true);
    expect(placeResult.buildingId).toBeTruthy();

    // Wait for chunk update to arrive
    await page.waitForTimeout(500);

    // Remove building
    const removeResult = await page.evaluate((bid: string) =>
      window.AT.removeReal(bid, 'test-user'),
      placeResult.buildingId!,
    );
    expect(removeResult.ok).toBe(true);

    // Cleanup
    await page.evaluate(() => window.AT.setMode('offline'));
  });

  test('AT.placeReal — road tile rejected', async ({ page }) => {
    await page.evaluate(() => window.AT.setMode('real'));
    await page.waitForFunction(() => window.AT.socketConnected(), null, { timeout: 15_000 });

    // Tile (0,1) is a road (localX=0, 0%4===0)
    const result = await page.evaluate(() =>
      window.AT.placeReal('coffee', 0, 1, { ownerId: 'test-user' }),
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_buildable');

    await page.evaluate(() => window.AT.setMode('offline'));
  });

  test('Auto-AOI real mode — setMode("real") auto-subscribes visible chunks', async ({ page }) => {
    await page.evaluate(() => window.AT.setMode('real'));
    await page.waitForFunction(() => window.AT.socketConnected(), null, { timeout: 15_000 });

    // Auto-AOI should have subscribed 25 chunks automatically
    const activeCount = await page.evaluate(() =>
      window.__v2?.getActiveChunks?.()?.length ?? 0,
    );
    expect(activeCount).toBe(25);

    // Wait for at least one chunk:payload to arrive
    await page.waitForFunction(() => {
      const store = window.__v2?.getRealLayerStore?.();
      return store && store.getBuildingsInChunk(0, 0).length > 0;
    }, null, { timeout: 15_000 });

    const count = await page.evaluate(() => {
      const store = window.__v2?.getRealLayerStore?.();
      return store?.getBuildingsInChunk(0, 0).length ?? 0;
    });
    expect(count).toBeGreaterThan(0);

    await page.evaluate(() => window.AT.setMode('offline'));
  });

  test('AT.buyParcel — buy + ownership enforcement', async ({ page }) => {
    await page.evaluate(() => window.AT.setMode('real'));
    await page.waitForFunction(() => window.AT.socketConnected(), null, { timeout: 15_000 });

    // Use unique coordinates to avoid collision with other tests
    const testX = 5;
    const testZ = 5;

    // Buy parcel
    const buyResult = await page.evaluate(([x, z]: [number, number]) =>
      window.AT.buyParcel(x, z, 'user-A'),
      [testX, testZ] as [number, number],
    );
    expect(buyResult.ok).toBe(true);

    // Another user tries to buy same parcel — should fail
    const buyResult2 = await page.evaluate(([x, z]: [number, number]) =>
      window.AT.buyParcel(x, z, 'user-B'),
      [testX, testZ] as [number, number],
    );
    expect(buyResult2.ok).toBe(false);
    expect(buyResult2.reason).toBe('already_owned');

    await page.evaluate(() => window.AT.setMode('offline'));
  });
});
