/**
 * Master Builder Demo — Builds cheap structures to show live updates
 * Uses only farms/watchtowers (25-70 credits each) to maximize builds with 500 balance
 */

const API = 'http://localhost:3001/api';
const API_KEY = 'agtr_1e028093efe1480d65d1cf34a50af7cb7e2b98a374eef70823d19f464e3f0ea1';
const AGENT_ID = '697fe0adfd90a62ef7f14c44';
const PARCEL_ID = 'parcel_697fe0adfd90a62ef7f14c44';
const WORLD_ID = 'gemini_republic';

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

// Cheap buildings (30-70 credits each) — should fit ~7 buildings in 500 credits
const BUILDS = [
  { type: 'farm', name: 'Herb Garden', x: 3, y: 3 },
  { type: 'farm', name: 'Grain Field', x: 7, y: 2 },
  { type: 'quarry', name: 'Stone Circle', x: 12, y: 4 },
  { type: 'lumberyard', name: 'Forest Edge Mill', x: 4, y: 8 },
  { type: 'watchtower', name: 'Gemini Spire', x: 15, y: 7 },
  { type: 'farm', name: 'Golden Meadow', x: 9, y: 12 },
  { type: 'iron_mine', name: 'Crystal Mine', x: 14, y: 14 },
];

async function main() {
  log('=== MASTER BUILDER: Watch the 3D map! Buildings appear every 4s ===');
  log(`Building on parcel at Gemini Order territory`);
  log('');

  let built = 0;
  for (const b of BUILDS) {
    log(`[${built + 1}/${BUILDS.length}] Constructing ${b.name} (${b.type})...`);

    const result = await api('POST', '/buildings', {
      parcelId: PARCEL_ID,
      worldId: WORLD_ID,
      type: b.type,
      name: b.name,
      coords: { x: b.x, y: b.y },
    });

    if (result.success) {
      built++;
      log(`  >> ${b.name} is now visible on the map!`);
    } else {
      log(`  !! ${result.error?.message}`);
      if (result.error?.message?.includes('Insufficient')) break;
    }

    await sleep(4000);
  }

  log(`\nBuilt ${built} structures. Now producing resources...`);

  // Production + sell loop
  for (let i = 1; i <= 8; i++) {
    await sleep(12000);

    const inv = await api('GET', `/agents/${AGENT_ID}/inventory`);
    if (!inv.success) continue;

    const resources = inv.data.inventory as Record<string, number>;
    const rates = inv.data.productionRates as Record<string, number>;
    log(`\n[Tick ${i}] Production: ${Object.entries(rates).map(([k, v]) => `${k}:${v.toFixed(1)}`).join(', ')}`);
    log(`[Tick ${i}] Inventory: ${Object.entries(resources).map(([k, v]) => `${k}:${Math.floor(v as number)}`).join(', ')}`);

    // Sell resources
    for (const [resource, qty] of Object.entries(resources)) {
      if ((qty as number) >= 3) {
        const sellQty = Math.floor((qty as number) * 0.8);
        const result = await api('POST', '/market/sell', { resourceId: resource, quantity: sellQty });
        if (result.success) {
          log(`  Sold ${result.data.quantitySold} ${resource} for ${result.data.totalCredits} credits`);
        }
      }
    }

    // Check balance
    const me = await api('GET', '/agents/me');
    if (me.success) {
      log(`  Balance: ${me.data.wallet?.balance ?? '?'} credits`);
    }
  }

  log('\n=== Master Builder demo complete ===');
}

main().catch(console.error);
