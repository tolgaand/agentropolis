/**
 * MapTest - Standalone test page for CityRendererV2
 * Route: /map-test
 * No socket, no backend dependency — pure Three.js prototype.
 *
 * UI extracted to:
 *   - GameHUD (spectator interface)
 *   - DevOverlay (Ctrl+D toggleable debug tools)
 * AT namespace stays here — console tooling tightly coupled to renderer instance.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { CityRendererV2, type HoverInfo } from '../lib/map/three/CityRendererV2';
import { getTileInfo } from '../lib/map/three/V2WorldGen';
import { TILES_PER_CHUNK, ASSET_REGISTRY, SeededRandom } from '../lib/map/three/V2Config';
import { composePlacements } from '../lib/map/three/V2Composer';
import { BuildingStore } from '../lib/map/three/V2Stores';
import { chunkSeed, getWorldChunkZone } from '../lib/map/three/V2Districts';
import { RendererProvider } from '../hooks/useRendererRef';
import { GameHUD } from '../components/hud/GameHUD';
import { DevOverlay } from '../components/dev/DevOverlay';
import { useViewMode } from '../hooks/useViewMode';

/** 1x1 building keys for massPlace */
const SMALL_BUILDING_KEYS = Object.entries(ASSET_REGISTRY)
  .filter(([, m]) => m.type === 'building' && m.tileW === 1 && m.tileD === 1)
  .map(([k]) => k);

export default function MapTest(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null!);
  const rendererRef = useRef<CityRendererV2 | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [selected, setSelected] = useState<HoverInfo | null>(null);
  const viewMode = useViewMode();

  const onHover = useCallback((h: HoverInfo | null) => {
    setHover(h);
  }, []);

  const onClick = useCallback((h: HoverInfo) => {
    setSelected(h);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new CityRendererV2();
    rendererRef.current = renderer;

    // Expose renderer for low-level debugging
    const win = window as unknown as Record<string, unknown>;
    win.__v2 = renderer;

    // ========== AT (Agentropolis Test) namespace ==========
    const AT = {
      /** Get tile info for any world coordinate */
      info(worldX: number, worldZ: number) {
        return getTileInfo(worldX, worldZ);
      },

      /** Place an override building (simplified) */
      place(assetKey: string, worldX: number, worldZ: number, opts?: { rotY?: 0 | 90 | 180 | 270; replace?: boolean }) {
        const rotRad = opts?.rotY ? (opts.rotY * Math.PI / 180) : undefined;
        return renderer.placeBuildingAt(assetKey, worldX, worldZ, { rotation: rotRad, replace: opts?.replace });
      },

      /** Remove a specific override building by ID */
      remove(buildingId: string) {
        return renderer.removeBuilding(buildingId);
      },

      /** Clear all overrides */
      clear() {
        return renderer.clearOverrides();
      },

      /** List all override buildings */
      list() {
        const items = renderer.listOverrides();
        if (items.length === 0) {
          console.log('[AT] No override buildings');
          return items;
        }
        console.table(items.map(b => ({
          id: b.id.slice(0, 16) + '\u2026',
          asset: b.assetKey,
          world: `${b.worldX},${b.worldZ}`,
          chunk: `${b.chunkX},${b.chunkZ}`,
          local: `${b.localX},${b.localZ}`,
          size: `${b.tileW}x${b.tileD}`,
          rotY: Math.round(b.rotation * 180 / Math.PI),
        })));
        return items;
      },

      /** Focus viewport on a world tile coordinate */
      focus(worldX: number, worldZ: number) {
        renderer.focusOnTile(worldX, worldZ);
        console.log(`[AT] Focused on world(${worldX}, ${worldZ})`);
      },

      /** Text snapshot of tile grid around a coordinate */
      snapshot(worldX: number, worldZ: number, radius = 3) {
        const text = renderer.getSnapshot(worldX, worldZ, radius);
        console.log(`[AT] Snapshot around world(${worldX}, ${worldZ}) r=${radius}\n` +
          'Legend: R=road A=authoritative O=override P=procedural .=empty\n' + text);
        return text;
      },

      // ========== Mode Switching ==========

      /** Switch data source mode: 'offline', 'stub', or 'real' */
      setMode(mode: 'offline' | 'stub' | 'real') {
        renderer.setMode(mode);
        console.log(`[AT] Mode set to: ${mode}`);
        return mode;
      },

      /** Get current data source mode */
      getMode() {
        return renderer.getMode();
      },

      /** Subscribe to chunks (AOI simulation). In stub mode, loads authoritative data. */
      subscribeChunks(chunks: Array<{ chunkX: number; chunkZ: number }>) {
        const buildings = renderer.subscribeChunks(chunks);
        console.log(`[AT] Subscribed to ${chunks.length} chunks, loaded ${buildings.length} real-layer buildings`);
        return buildings;
      },

      /** Unsubscribe from chunks, removing their real layer data */
      unsubscribeChunks(chunks: Array<{ chunkX: number; chunkZ: number }>) {
        renderer.unsubscribeChunks(chunks);
        console.log(`[AT] Unsubscribed from ${chunks.length} chunks`);
      },

      /** List currently active (subscribed) chunks */
      activeChunks() {
        const chunks = renderer.getActiveChunks();
        console.table(chunks);
        return chunks;
      },

      /** Inspect raw stub payload for a chunk */
      rawPayload(chunkX: number, chunkZ: number) {
        const payload = renderer.getRouter().getRawPayload(chunkX, chunkZ);
        if (payload) {
          console.log(`[AT] Raw payload for chunk(${chunkX},${chunkZ}): ${payload.buildings.length} buildings`);
          console.table(payload.buildings);
        } else {
          console.log(`[AT] No payload for chunk(${chunkX},${chunkZ}) — not in stub mode or not subscribed`);
        }
        return payload;
      },

      /** Toggle debug overlay (stub — logs mode) */
      toggleOverlay(mode: 'none' | 'zone' | 'road' | 'mask') {
        console.log(`[AT] Overlay mode: ${mode} (visual overlay not yet wired)`);
      },

      /** Check if socket is connected (real mode) */
      socketConnected() {
        const connected = renderer.isSocketConnected();
        console.log(`[AT] Socket connected: ${connected}`);
        return connected;
      },

      /** Get city:sync info (real mode) */
      citySync() {
        const sync = renderer.getRouter().citySync;
        console.log('[AT] City sync:', sync);
        return sync;
      },

      /** Force reconnect socket (real mode) */
      reconnect() {
        renderer.getRouter().reconnect();
        console.log('[AT] Reconnect triggered');
      },

      // ========== Socket Write Helpers (real mode) ==========

      /** Place building via socket (real mode authoritative write) */
      async placeReal(assetKey: string, worldX: number, worldZ: number, opts?: {
        ownerId?: string; rotY?: number; tileW?: number; tileD?: number;
      }): Promise<{ ok: boolean; buildingId?: string; reason?: string }> {
        return new Promise((resolve) => {
          const socket = renderer.getRouter().getSocketProvider()?.getSocket();
          if (!socket?.connected) { resolve({ ok: false, reason: 'not_connected' }); return; }
          const sync = renderer.getRouter().citySync;
          socket.emit('world:placeBuilding', {
            cityId: sync?.cityId ?? 'city-001',
            worldX, worldZ,
            type: assetKey, assetKey,
            rotY: opts?.rotY ?? 0,
            tileW: opts?.tileW ?? 1,
            tileD: opts?.tileD ?? 1,
            ownerId: opts?.ownerId,
          }, (response) => {
            console.log(`[AT.placeReal] ${response.ok ? 'OK' : 'FAIL'}: ${response.reason ?? response.buildingId}`);
            resolve(response);
          });
        });
      },

      /** Remove building via socket (real mode authoritative write) */
      async removeReal(buildingId: string, ownerId?: string): Promise<{ ok: boolean; reason?: string }> {
        return new Promise((resolve) => {
          const socket = renderer.getRouter().getSocketProvider()?.getSocket();
          if (!socket?.connected) { resolve({ ok: false, reason: 'not_connected' }); return; }
          const sync = renderer.getRouter().citySync;
          socket.emit('world:removeBuilding', {
            cityId: sync?.cityId ?? 'city-001',
            buildingId,
            ownerId,
          }, (response) => {
            console.log(`[AT.removeReal] ${response.ok ? 'OK' : 'FAIL'}: ${response.reason ?? 'removed'}`);
            resolve(response);
          });
        });
      },

      /** Buy a parcel via socket (real mode) */
      async buyParcel(worldX: number, worldZ: number, ownerId: string): Promise<{ ok: boolean; reason?: string }> {
        return new Promise((resolve) => {
          const socket = renderer.getRouter().getSocketProvider()?.getSocket();
          if (!socket?.connected) { resolve({ ok: false, reason: 'not_connected' }); return; }
          const sync = renderer.getRouter().citySync;
          socket.emit('parcel:buy', {
            cityId: sync?.cityId ?? 'city-001',
            worldX, worldZ, ownerId,
          }, (response) => {
            console.log(`[AT.buyParcel] ${response.ok ? 'OK' : 'FAIL'}: ${response.reason ?? 'bought'}`);
            resolve(response);
          });
        });
      },

      /** Test cleanup: subscribe far-away chunks, then unsubscribe, verify store is clean */
      async testCleanup() {
        console.log('[AT.testCleanup] Starting...');
        await renderer.clearOverrides();

        // Reset to offline first to clear all subscriptions
        renderer.setMode('offline');

        // Switch to stub — auto-AOI subscribes 25 visible chunks
        renderer.setMode('stub');
        const autoCount = renderer.getActiveChunks().length; // should be 25

        // Manually subscribe 3 far-away chunks (outside visible 5x5)
        renderer.subscribeChunks([
          { chunkX: 100, chunkZ: 100 },
          { chunkX: 101, chunkZ: 100 },
          { chunkX: 100, chunkZ: 101 },
        ]);
        const activeAfterSub = renderer.getActiveChunks().length; // 25 + 3 = 28
        const storeCountAfterSub = renderer.getRealLayerStore().getBuildingsInChunk(100, 100).length;

        // Unsubscribe one far chunk
        renderer.unsubscribeChunks([{ chunkX: 101, chunkZ: 100 }]);
        const activeAfterUnsub = renderer.getActiveChunks().length; // 27
        const storeCountAfterUnsub = renderer.getRealLayerStore().getBuildingsInChunk(101, 100).length;

        // Unsubscribe remaining far chunks
        renderer.unsubscribeChunks([{ chunkX: 100, chunkZ: 100 }, { chunkX: 100, chunkZ: 101 }]);
        const activeAfterFull = renderer.getActiveChunks().length; // back to 25

        renderer.setMode('offline');

        const pass = autoCount === 25 &&
          activeAfterSub === 28 &&
          storeCountAfterSub > 0 &&
          activeAfterUnsub === 27 &&
          storeCountAfterUnsub === 0 &&
          activeAfterFull === 25;

        console.log(`[AT.testCleanup] auto=${autoCount} sub=${activeAfterSub} store=${storeCountAfterSub} ` +
          `unsub1=${activeAfterUnsub} store1=${storeCountAfterUnsub} full=${activeAfterFull}`);
        console.log(`[AT.testCleanup] ${pass ? 'PASS' : 'FAIL'}`);
        return { pass, activeAfterSub, storeCountAfterSub, activeAfterUnsub, storeCountAfterUnsub, activeAfterFull };
      },

      /** Test mode switching: offline → stub → real → offline, no crash */
      async testModeSwitch() {
        console.log('[AT.testModeSwitch] Starting...');
        const results: Array<{ from: string; to: string; ok: boolean }> = [];

        const modes: Array<'offline' | 'stub' | 'real'> = ['offline', 'stub', 'real', 'offline', 'stub', 'offline'];
        for (let i = 0; i < modes.length - 1; i++) {
          const from = modes[i];
          const to = modes[i + 1];
          try {
            renderer.setMode(from);
            renderer.setMode(to);
            results.push({ from, to, ok: renderer.getMode() === to });
          } catch {
            results.push({ from, to, ok: false });
          }
        }

        // Back to offline
        renderer.setMode('offline');

        console.table(results);
        const pass = results.every(r => r.ok);
        console.log(`[AT.testModeSwitch] ${pass ? 'PASS' : 'FAIL'}`);
        return { pass, results };
      },

      // ========== Determinism Regression ==========

      /** Run determinism regression test on 8 hardcoded coordinates */
      regression() {
        const testCoords: [number, number][] = [
          [0, 0], [5, 7], [15, 15], [16, 16],
          [-1, 0], [0, -1], [-17, 23], [128, -64],
        ];

        const results: Array<{ coord: string; tileHash: string; placementHash: string; status: string }> = [];
        const emptyContext = { buildingStore: new BuildingStore() };

        for (const [wx, wz] of testCoords) {
          const ti1 = JSON.stringify(getTileInfo(wx, wz));
          const ti2 = JSON.stringify(getTileInfo(wx, wz));
          const ti3 = JSON.stringify(getTileInfo(wx, wz));
          const tileOK = ti1 === ti2 && ti2 === ti3;

          const chunkX = Math.floor(wx / TILES_PER_CHUNK);
          const chunkZ = Math.floor(wz / TILES_PER_CHUNK);
          const zone = renderer.getDistrictZoneAt(chunkX, chunkZ);

          const extractStable = (placements: Array<{ assetKey: string; tileX: number; tileZ: number; rotation?: number }>) =>
            placements.map(p => ({
              assetKey: p.assetKey,
              tileX: p.tileX,
              tileZ: p.tileZ,
              rotation: p.rotation ?? 0,
            }));

          const seed = chunkSeed(chunkX, chunkZ);
          const rng1 = new SeededRandom(seed);
          const p1 = JSON.stringify(extractStable(composePlacements(chunkX, chunkZ, zone, rng1, emptyContext)));
          const rng2 = new SeededRandom(seed);
          const p2 = JSON.stringify(extractStable(composePlacements(chunkX, chunkZ, zone, rng2, emptyContext)));
          const rng3 = new SeededRandom(seed);
          const p3 = JSON.stringify(extractStable(composePlacements(chunkX, chunkZ, zone, rng3, emptyContext)));
          const placementsOK = p1 === p2 && p2 === p3;

          const pass = tileOK && placementsOK;
          results.push({
            coord: `(${wx},${wz})`,
            tileHash: tileOK ? ti1.slice(0, 32) + '\u2026' : 'MISMATCH',
            placementHash: placementsOK ? p1.slice(0, 32) + '\u2026' : 'MISMATCH',
            status: pass ? 'PASS' : 'FAIL',
          });
        }

        console.table(results);
        const passed = results.filter(r => r.status === 'PASS').length;
        console.log(`[AT.regression] ${passed}/${results.length} PASS`);
        return results;
      },

      // ========== Overlap Test ==========

      /** Test collision guard: place overlapping buildings, verify rejection */
      async testOverlap() {
        console.log('[AT.testOverlap] Starting...');
        await renderer.clearOverrides();

        const r1 = await renderer.placeBuildingAt('supermarket_01', 5, 5);
        console.log('[AT.testOverlap] Place supermarket_01 at (5,5):', r1);

        const r2 = await renderer.placeBuildingAt('coffee', 5, 5);
        console.log('[AT.testOverlap] Place coffee at (5,5) (expect fail):', r2);

        const r3 = await renderer.placeBuildingAt('coffee', 7, 5);
        console.log('[AT.testOverlap] Place coffee at (7,5) (expect ok):', r3);

        const pass = r1.ok && !r2.ok && r2.reason === 'overlap' && r3.ok;
        console.log(`[AT.testOverlap] ${pass ? 'PASS' : 'FAIL'}`);
        return { r1, r2, r3, pass };
      },

      // ========== Edge-Case Coord Validation ==========

      /** Test negative & large world coords: no crash, correct chunk/local */
      async edgeTest() {
        const coords: [number, number][] = [[-1, 0], [-17, -17], [4096, 4096]];
        const results: Array<{
          coord: string; chunk: string; local: string;
          localOK: boolean; placeOK: boolean; status: string;
        }> = [];

        await renderer.clearOverrides();

        for (const [wx, wz] of coords) {
          const ti = getTileInfo(wx, wz);
          const localOK = ti.localX >= 0 && ti.localX < TILES_PER_CHUNK &&
                          ti.localZ >= 0 && ti.localZ < TILES_PER_CHUNK;

          const expectedChunkX = Math.floor(wx / TILES_PER_CHUNK);
          const expectedChunkZ = Math.floor(wz / TILES_PER_CHUNK);
          const chunkOK = ti.chunkX === expectedChunkX && ti.chunkZ === expectedChunkZ;

          // Try placing — should not crash
          let placeOK = false;
          try {
            const r = await renderer.placeBuildingAt('coffee', wx, wz);
            placeOK = r.ok;
          } catch {
            placeOK = false;
          }

          results.push({
            coord: `(${wx},${wz})`,
            chunk: `(${ti.chunkX},${ti.chunkZ})`,
            local: `(${ti.localX},${ti.localZ})`,
            localOK: localOK && chunkOK,
            placeOK,
            status: localOK && chunkOK ? 'PASS' : 'FAIL',
          });
        }

        await renderer.clearOverrides();
        console.table(results);
        const passed = results.filter(r => r.status === 'PASS').length;
        console.log(`[AT.edgeTest] ${passed}/${results.length} PASS`);
        return results;
      },

      // ========== Stats ==========

      /** Show chunk stats for the 3x3 neighborhood around a world coordinate */
      stats(worldX: number, worldZ: number) {
        const chunkX = Math.floor(worldX / TILES_PER_CHUNK);
        const chunkZ = Math.floor(worldZ / TILES_PER_CHUNK);

        const rows: Array<{ chunk: string; buildings: number; level: number; types: string }> = [];
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const cx = chunkX + dx;
            const cz = chunkZ + dz;
            const s = renderer.getChunkStats(cx, cz);
            rows.push({
              chunk: `(${cx},${cz})`,
              buildings: s.totalBuildings,
              level: s.totalLevel,
              types: Object.entries(s.buildingCountsByType)
                .map(([k, v]) => `${k}:${v}`)
                .join(', ') || '-',
            });
          }
        }

        console.table(rows);
        const agg = renderer.getNeighborhoodStats(chunkX, chunkZ);
        console.log(`[AT.stats] Neighborhood aggregate: ${agg.totalBuildings} buildings, ${agg.totalLevel} total level`);
        return { rows, aggregate: agg };
      },

      // ========== Export / Import ==========

      /** Export current override state as JSON */
      export() {
        const state = renderer.exportState();
        console.log(`[AT.export] ${state.overrides.length} overrides, ${state.parcels.length} parcels, seed=${state.worldSeed}, createdAt=${state.createdAt}`);
        return state;
      },

      /** Import a previously exported state */
      async import(json: unknown, force = false) {
        const data = typeof json === 'string' ? JSON.parse(json) : json;
        const result = await renderer.importState(data, { force });
        console.log(`[AT.import] ${result.ok ? 'OK' : 'FAILED'}: ${result.reason ?? 'success'}`);
        return result;
      },

      /** Download current state as a JSON file */
      download() {
        const state = renderer.exportState();
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `agentropolis-state-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        console.log(`[AT.download] Saved ${state.overrides.length} overrides`);
      },

      // ========== Mass Place (perf helper) ==========

      /** Place n random 1x1 buildings on a grid. Tests perf/stability. */
      async massPlace(n = 100) {
        const t0 = performance.now();
        await renderer.clearOverrides();
        const rng = new SeededRandom(7);
        let placed = 0;
        let skipped = 0;

        for (let i = 0; i < n; i++) {
          // Spread across multiple chunks: worldX 1..127, worldZ 1..127
          // Avoid road tiles (local % 4 === 0)
          const wx = 1 + Math.floor(rng.next() * 127);
          const wz = 1 + Math.floor(rng.next() * 127);
          const localX = ((wx % TILES_PER_CHUNK) + TILES_PER_CHUNK) % TILES_PER_CHUNK;
          const localZ = ((wz % TILES_PER_CHUNK) + TILES_PER_CHUNK) % TILES_PER_CHUNK;
          if (localX % 4 === 0 || localZ % 4 === 0) {
            skipped++;
            continue;
          }
          const key = SMALL_BUILDING_KEYS[Math.floor(rng.next() * SMALL_BUILDING_KEYS.length)];
          const r = await renderer.placeBuildingAt(key, wx, wz);
          if (r.ok) placed++;
          else skipped++;
        }

        const dt = performance.now() - t0;
        console.log(`[AT.massPlace] Placed ${placed}, skipped ${skipped} (of ${n}) in ${dt.toFixed(0)}ms`);
        return { placed, skipped, ms: Math.round(dt) };
      },

      // ========== Smoke Test ==========

      /** Run all tests sequentially, produce PASS/FAIL summary */
      async smoke() {
        console.log('[AT.smoke] Starting comprehensive smoke test...\n');
        const summary: Array<{ test: string; status: string; detail: string }> = [];

        // 1. Regression (determinism)
        try {
          const reg = AT.regression();
          const allPass = reg.every(r => r.status === 'PASS');
          summary.push({
            test: 'regression',
            status: allPass ? 'PASS' : 'FAIL',
            detail: `${reg.filter(r => r.status === 'PASS').length}/${reg.length}`,
          });
        } catch (e) {
          summary.push({ test: 'regression', status: 'ERROR', detail: String(e) });
        }

        // 2. Overlap (collision guard)
        try {
          const ov = await AT.testOverlap();
          summary.push({
            test: 'overlap',
            status: ov.pass ? 'PASS' : 'FAIL',
            detail: ov.pass ? 'reject+accept correct' : `r1=${ov.r1.ok} r2=${ov.r2.ok} r3=${ov.r3.ok}`,
          });
        } catch (e) {
          summary.push({ test: 'overlap', status: 'ERROR', detail: String(e) });
        }

        // 3. Edge-case coords
        try {
          const edge = await AT.edgeTest();
          const allPass = edge.every(r => r.status === 'PASS');
          summary.push({
            test: 'edgeCoords',
            status: allPass ? 'PASS' : 'FAIL',
            detail: `${edge.filter(r => r.status === 'PASS').length}/${edge.length}`,
          });
        } catch (e) {
          summary.push({ test: 'edgeCoords', status: 'ERROR', detail: String(e) });
        }

        // 4. Export/Import roundtrip
        try {
          await renderer.clearOverrides();
          await renderer.placeBuildingAt('coffee', 5, 7);
          const exported = renderer.exportState();
          const hasFields = exported.version === 1 &&
            exported.worldSeed === 42 &&
            typeof exported.createdAt === 'string' &&
            Array.isArray(exported.overrides);
          await renderer.clearOverrides();
          const importResult = await renderer.importState(exported);
          const list = renderer.listOverrides();
          const roundtripOK = importResult.ok && list.length === 1 && list[0].assetKey === 'coffee';
          summary.push({
            test: 'exportImport',
            status: hasFields && roundtripOK ? 'PASS' : 'FAIL',
            detail: roundtripOK
              ? `fields=${hasFields}, roundtrip=1 override`
              : `fields=${hasFields}, imported=${list.length}`,
          });
          await renderer.clearOverrides();
        } catch (e) {
          summary.push({ test: 'exportImport', status: 'ERROR', detail: String(e) });
        }

        // 5. Import validation (seed mismatch, version mismatch)
        try {
          const badSeed = await renderer.importState({ version: 1, worldSeed: 999, createdAt: '', overrides: [], parcels: [] });
          const badVer = await renderer.importState({ version: 99, worldSeed: 42, createdAt: '', overrides: [], parcels: [] });
          const forceSeed = await renderer.importState({ version: 1, worldSeed: 999, createdAt: '', overrides: [], parcels: [] }, { force: true });
          const seedOK = !badSeed.ok && badSeed.reason?.includes('seed_mismatch');
          const verOK = !badVer.ok && badVer.reason?.includes('version_mismatch');
          const forceOK = forceSeed.ok;
          summary.push({
            test: 'importValidation',
            status: seedOK && verOK && forceOK ? 'PASS' : 'FAIL',
            detail: `seedReject=${seedOK}, verReject=${verOK}, forceAccept=${forceOK}`,
          });
        } catch (e) {
          summary.push({ test: 'importValidation', status: 'ERROR', detail: String(e) });
        }

        // 6. Stats (non-empty after place)
        try {
          await renderer.clearOverrides();
          await renderer.placeBuildingAt('coffee', 5, 7);
          const s = renderer.getChunkStats(0, 0);
          const nonEmpty = s.totalBuildings > 0;
          summary.push({
            test: 'stats',
            status: nonEmpty ? 'PASS' : 'FAIL',
            detail: `totalBuildings=${s.totalBuildings}`,
          });
          await renderer.clearOverrides();
        } catch (e) {
          summary.push({ test: 'stats', status: 'ERROR', detail: String(e) });
        }

        // 7. Stub mode: auto-AOI subscribes visible chunks, verify real layer data, switch back
        try {
          await renderer.clearOverrides();
          renderer.setMode('stub');
          const modeOK = renderer.getMode() === 'stub';

          // Auto-AOI should have subscribed 25 visible chunks
          const activeCount = renderer.getActiveChunks().length;
          const autoSubOK = activeCount === 25;

          // Verify real layer store has buildings (auto-subscribed chunks)
          const realStore = renderer.getRealLayerStore();
          const realInChunk0 = realStore.getBuildingsInChunk(0, 0);
          const storeOK = realInChunk0.length > 0;

          // Verify determinism: switch offline and back to stub → same data
          const count1 = realInChunk0.length;
          renderer.setMode('offline');
          renderer.setMode('stub');
          const count2 = renderer.getRealLayerStore().getBuildingsInChunk(0, 0).length;
          const deterministicOK = count2 === count1;

          // Switch back to offline
          renderer.setMode('offline');
          const backOK = renderer.getMode() === 'offline';
          const realCleared = renderer.getRealLayerStore().getBuildingsInChunk(0, 0).length === 0;

          const pass = modeOK && autoSubOK && storeOK && deterministicOK && backOK && realCleared;
          summary.push({
            test: 'stubMode',
            status: pass ? 'PASS' : 'FAIL',
            detail: `mode=${modeOK}, autoSub=${autoSubOK}(${activeCount}), store=${storeOK}, det=${deterministicOK}, back=${backOK}, cleared=${realCleared}`,
          });
        } catch (e) {
          summary.push({ test: 'stubMode', status: 'ERROR', detail: String(e) });
        }

        // 8. Cleanup test: subscribe/unsubscribe, verify store cleared
        try {
          const cleanup = await AT.testCleanup();
          summary.push({
            test: 'cleanup',
            status: cleanup.pass ? 'PASS' : 'FAIL',
            detail: `sub=${cleanup.activeAfterSub} unsub=${cleanup.activeAfterUnsub} full=${cleanup.activeAfterFull}`,
          });
        } catch (e) {
          summary.push({ test: 'cleanup', status: 'ERROR', detail: String(e) });
        }

        // 9. Mode switch: offline→stub→real→offline, no crash
        try {
          const ms = await AT.testModeSwitch();
          summary.push({
            test: 'modeSwitch',
            status: ms.pass ? 'PASS' : 'FAIL',
            detail: `${ms.results.filter(r => r.ok).length}/${ms.results.length} transitions OK`,
          });
        } catch (e) {
          summary.push({ test: 'modeSwitch', status: 'ERROR', detail: String(e) });
        }

        // 10. Instance count sanity (no explosion)
        try {
          const debug = renderer.debugInfo();
          const counts = debug.instanceCounts as Record<string, number>;
          const total = Object.values(counts).reduce((a, b) => a + b, 0);
          const min = Object.values(counts).length > 0 ? 1 : 0;
          const sane = total > min && total < 50000;
          summary.push({
            test: 'instanceSanity',
            status: sane ? 'PASS' : 'FAIL',
            detail: `totalInstances=${total} meshTypes=${Object.keys(counts).length}`,
          });
        } catch (e) {
          summary.push({ test: 'instanceSanity', status: 'ERROR', detail: String(e) });
        }

        console.log('\n[AT.smoke] ========== RESULTS ==========');
        console.table(summary);
        const passed = summary.filter(s => s.status === 'PASS').length;
        const total = summary.length;
        console.log(`[AT.smoke] ${passed}/${total} PASS`);
        return summary;
      },
      // ========== Mode Audit ==========

      /** Audit mode transition: call setMode, poll mode+socket every 200ms for 3s */
      async modeAudit(targetMode: 'offline' | 'stub' | 'real' = 'real', polls = 10) {
        const log: Array<{
          t: number; mode: string; socket: boolean;
          citySync: { cityId: string; seed: number } | null;
          activeChunks: number;
        }> = [];

        renderer.setMode(targetMode);
        const t0 = performance.now();

        for (let i = 0; i < polls; i++) {
          await new Promise(r => setTimeout(r, 200));
          log.push({
            t: Math.round(performance.now() - t0),
            mode: renderer.getMode(),
            socket: renderer.getRouter().isSocketConnected,
            citySync: renderer.getRouter().citySync,
            activeChunks: renderer.getActiveChunks().length,
          });
        }

        const stableMode = log.every(e => e.mode === targetMode);
        const finalSocket = targetMode === 'offline' ? true : log[log.length - 1].socket;

        console.table(log);
        console.log(`[AT.modeAudit] stable=${stableMode}, finalSocket=${finalSocket}`);

        // Return to offline
        renderer.setMode('offline');
        return { log, stableMode, finalSocket };
      },

      // ========== Teleport Test ==========

      /**
       * Verify that same world-chunk always produces same building signature.
       * Pan away and come back — signature must match.
       */
      async teleportTest(repeats = 5) {
        // Use offline mode for deterministic procedural-only content
        renderer.setMode('offline');

        // Pick 8 sample world-chunk coords
        const sampleChunks = [
          [0, 0], [1, 1], [-1, 0], [2, -2], [5, 5], [-3, 3], [0, -4], [7, 0],
        ];

        const emptyContext = { buildingStore: new BuildingStore() };

        // Compute reference signatures: zone + placement hash for each chunk
        const refSignatures = new Map<string, string>();
        for (const [cx, cz] of sampleChunks) {
          const zone = getWorldChunkZone(cx, cz);
          const rng = new SeededRandom(chunkSeed(cx, cz));
          const placements = composePlacements(cx, cz, zone, rng, emptyContext);
          const sig = JSON.stringify(placements.map(p => ({
            assetKey: p.assetKey, tileX: p.tileX, tileZ: p.tileZ,
            rotation: p.rotation ?? 0,
          })));
          refSignatures.set(`${cx},${cz}`, sig);
        }

        const results: Array<{ repeat: number; pass: boolean; failures: string[] }> = [];

        for (let r = 0; r < repeats; r++) {
          // Pan far away
          renderer.focusOnTile(1600 + r * 320, 1600 + r * 320);

          // Pan back to origin
          renderer.focusOnTile(0, 0);

          // Re-check all sample chunks
          const failures: string[] = [];
          for (const [cx, cz] of sampleChunks) {
            const zone = getWorldChunkZone(cx, cz);
            const rng = new SeededRandom(chunkSeed(cx, cz));
            const placements = composePlacements(cx, cz, zone, rng, emptyContext);
            const sig = JSON.stringify(placements.map(p => ({
              assetKey: p.assetKey, tileX: p.tileX, tileZ: p.tileZ,
              rotation: p.rotation ?? 0,
            })));
            if (sig !== refSignatures.get(`${cx},${cz}`)) {
              failures.push(`(${cx},${cz})`);
            }
          }

          results.push({ repeat: r, pass: failures.length === 0, failures });
        }

        const allPass = results.every(r => r.pass);
        console.table(results);
        console.log(`[AT.teleportTest] ${allPass ? 'PASS' : 'FAIL'} (${repeats} repeats)`);

        return { pass: allPass, results };
      },
    };

    win.AT = AT;
    console.log(
      '[AT] Test harness ready.\n' +
      '  AT.smoke()            — run all tests\n' +
      '  AT.regression()       — determinism check\n' +
      '  AT.testOverlap()      — collision guard\n' +
      '  AT.edgeTest()         — negative/large coords\n' +
      '  AT.massPlace(n)       — perf stress test\n' +
      '  AT.place(key,x,z)     — place building\n' +
      '  AT.clear()            — clear overrides\n' +
      '  AT.export() / import(json) / download()\n' +
      '  AT.stats(x,z)         — chunk stats\n' +
      '  AT.info(x,z)          — tile info\n' +
      '  AT.list()             — list overrides\n' +
      '  AT.snapshot(x,z)      — text grid view\n' +
      '  AT.setMode(m)         — "offline", "stub", or "real"\n' +
      '  AT.getMode()          — current mode\n' +
      '  AT.subscribeChunks([{chunkX,chunkZ},...]) — AOI sub\n' +
      '  AT.unsubscribeChunks([...]) — AOI unsub\n' +
      '  AT.activeChunks()     — list subscribed chunks\n' +
      '  AT.rawPayload(cx,cz)  — inspect stub chunk data\n' +
      '  AT.socketConnected()  — socket status (real mode)\n' +
      '  AT.citySync()         — last city:sync data\n' +
      '  AT.reconnect()        — force socket reconnect\n' +
      '  AT.placeReal(key,x,z,opts) — place via socket\n' +
      '  AT.removeReal(id,ownerId?) — remove via socket\n' +
      '  AT.buyParcel(x,z,ownerId)  — buy parcel via socket\n' +
      '  AT.testCleanup()      — sub/unsub cleanup test\n' +
      '  AT.testModeSwitch()   — mode transition test\n' +
      '  AT.modeAudit(mode)    — audit mode+socket over 3s\n' +
      '  AT.teleportTest(n)    — pan-and-return determinism',
    );

    // Legacy helpers
    win.placeBuilding = (assetKey: string, worldX: number, worldZ: number, rotation?: number) => {
      renderer.placeBuildingAt(assetKey, worldX, worldZ, { rotation });
    };
    win.clearOverrides = () => renderer.clearOverrides();

    renderer.init(container, { onHover, onClick }).then(async () => {
      await renderer.buildTestParcel();
    }).catch((err) => {
      console.error(err);
    });

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [onHover, onClick]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <RendererProvider value={rendererRef}>
        <GameHUD hover={hover} selected={selected} viewMode={viewMode} />
        <DevOverlay hover={hover} viewMode={viewMode} />
      </RendererProvider>
    </div>
  );
}
