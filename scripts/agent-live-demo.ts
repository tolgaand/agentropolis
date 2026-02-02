/**
 * Live Demo Agent — Builds structures every few seconds so spectators see them appear
 * Run while watching the 3D map to see buildings pop up in real-time
 */

const API = 'http://localhost:3001/api';
const API_KEY = 'agtr_8879e3a3a6a1534caf148a654fe0751cb37bd548e1629d741dc36238441bcfaf';
const PARCEL_ID = 'parcel_697fe068fd90a62ef7f14afb';
const WORLD_ID = 'claude_nation';

const headers = {
  'Content-Type': 'application/json',
  Authorization: `ApiKey ${API_KEY}`,
};

function log(msg: string) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

async function api(method: string, path: string, body?: unknown) {
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  return res.json();
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const BUILDS = [
  { type: 'farm', name: 'Wheatfield Alpha', x: 2, y: 3 },
  { type: 'lumberyard', name: 'Dark Oak Mill', x: 5, y: 2 },
  { type: 'iron_mine', name: 'Deep Iron Shaft', x: 8, y: 4 },
  { type: 'barracks', name: 'Northern Guard', x: 12, y: 3 },
  { type: 'market', name: 'Iron Market', x: 15, y: 5 },
  { type: 'watchtower', name: 'Eagle Eye Tower', x: 3, y: 8 },
  { type: 'quarry', name: 'Granite Pit', x: 7, y: 9 },
  { type: 'stable', name: 'War Horse Stable', x: 11, y: 8 },
  { type: 'wall', name: 'Northern Wall', x: 14, y: 10 },
  { type: 'academy', name: 'Scholar Hall', x: 4, y: 14 },
  { type: 'farm', name: 'Wheatfield Beta', x: 9, y: 13 },
  { type: 'farm', name: 'Wheatfield Gamma', x: 13, y: 15 },
];

async function main() {
  log('=== LIVE DEMO: Watch the map! Buildings will appear every 3 seconds ===');
  log('');

  for (let i = 0; i < BUILDS.length; i++) {
    const b = BUILDS[i];
    log(`Building ${i + 1}/${BUILDS.length}: ${b.name} (${b.type}) at (${b.x}, ${b.y})...`);

    const result = await api('POST', '/buildings', {
      parcelId: PARCEL_ID,
      worldId: WORLD_ID,
      type: b.type,
      name: b.name,
      coords: { x: b.x, y: b.y },
    });

    if (result.success) {
      log(`  ✓ Built! Sprite ${result.data.spriteId}, cost charged`);
    } else {
      log(`  ✗ Failed: ${result.error?.message}`);
    }

    // Wait 3 seconds between builds so spectator can see each one appear
    await sleep(3000);
  }

  log('');
  log('=== Now waiting for resources to accumulate... ===');

  // Wait for production
  for (let cycle = 1; cycle <= 5; cycle++) {
    await sleep(15000);

    // Check inventory
    const inv = await api('GET', `/agents/697fe068fd90a62ef7f14afb/inventory`);
    if (inv.success) {
      log(`[Cycle ${cycle}] Inventory: ${JSON.stringify(inv.data.inventory)}`);
      log(`[Cycle ${cycle}] Production: ${JSON.stringify(inv.data.productionRates)}`);

      // Sell accumulated resources
      for (const [resource, qty] of Object.entries(inv.data.inventory as Record<string, number>)) {
        if (qty >= 5) {
          const sellResult = await api('POST', '/market/sell', {
            resourceId: resource,
            quantity: Math.floor(qty * 0.8),
          });
          if (sellResult.success) {
            log(`  Sold ${sellResult.data.quantitySold} ${resource} → ${sellResult.data.totalCredits} credits`);
          }
        }
      }
    }
  }

  log('=== Demo complete ===');
}

main().catch(console.error);
