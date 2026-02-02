/**
 * Sir Claudius — Claude Kingdom Agent
 * Tests the full gameplay loop: build → produce → sell → expand → army → fight
 */

const API = 'http://localhost:3001/api';
const API_KEY = 'agtr_36c08a2d1ed6fcf02dd1ef24d5998540e8cee7e91c70395dc1756969a5b1d5cb';
const AGENT_ID = '697fddb156b5e425087e79bb';

const headers = {
  'Content-Type': 'application/json',
  Authorization: `ApiKey ${API_KEY}`,
};

function log(tag: string, msg: string, data?: unknown) {
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}] [${tag}] ${msg}`);
  if (data) console.log(JSON.stringify(data, null, 2));
}

async function api(method: string, path: string, body?: unknown) {
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  const json = await res.json();
  if (!json.success) throw new Error(`API ${path}: ${json.error?.message || 'failed'}`);
  return json.data;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Phase 1: Observe ────────────────────────────────────
async function observe() {
  log('OBSERVE', 'Checking map state...');
  const map = await api('GET', '/worlds/map');
  log('OBSERVE', `Map has ${map.totalParcels} parcels, ${map.totalObjects} objects`);
  log('OBSERVE', `Game time: day ${map.time.dayIndex}, ${map.time.phase}`);

  const me = await api('GET', '/agents/me');
  log('OBSERVE', `Balance: ${me.wallet?.balance ?? '?'} credits`);
  log('OBSERVE', `Parcel: (${me.parcel?.blockX}, ${me.parcel?.blockY})`);

  const prices = await api('GET', '/market/prices');
  log('OBSERVE', 'Market prices:', Object.entries(prices).map(([k, v]: [string, any]) => `${k}: ${v.avgPrice.toFixed(1)}`));

  return { me, map, prices };
}

// ─── Phase 2: Build ──────────────────────────────────────
async function buildStructures(parcelId: string, worldId: string) {
  const buildings = [
    { type: 'farm', name: 'Royal Farm' },
    { type: 'iron_mine', name: 'Deep Iron Mine' },
    { type: 'lumberyard', name: 'Forest Lumberyard' },
    { type: 'barracks', name: 'Iron Guard Barracks' },
  ];

  for (const b of buildings) {
    try {
      const result = await api('POST', '/buildings', {
        parcelId,
        worldId,
        type: b.type,
        name: b.name,
        coords: { x: Math.floor(Math.random() * 18) + 1, y: Math.floor(Math.random() * 18) + 1 },
      });
      log('BUILD', `Built ${b.name} (${b.type})`, { id: result._id || result.id });
      await sleep(500);
    } catch (e: any) {
      log('BUILD', `Failed to build ${b.name}: ${e.message}`);
    }
  }
}

// ─── Phase 3: Wait for production, then sell ─────────────
async function harvestAndSell() {
  log('HARVEST', 'Checking inventory...');
  const inv = await api('GET', `/agents/${AGENT_ID}/inventory`);
  log('HARVEST', `Production rates:`, inv.productionRates);
  log('HARVEST', `Inventory:`, inv.inventory);

  // Sell resources that have accumulated
  for (const [resource, qty] of Object.entries(inv.inventory as Record<string, number>)) {
    if (qty >= 5) {
      const sellQty = Math.floor(qty * 0.8); // Keep 20% reserve
      try {
        const result = await api('POST', '/market/sell', {
          resourceId: resource,
          quantity: sellQty,
        });
        log('SELL', `Sold ${sellQty} ${resource} for ${result.totalCredits} credits (${result.unitPrice}/unit)`);
      } catch (e: any) {
        log('SELL', `Failed to sell ${resource}: ${e.message}`);
      }
    }
  }
}

// ─── Phase 4: Expand territory ───────────────────────────
async function expandTerritory() {
  log('EXPAND', 'Attempting to claim new parcel...');
  try {
    const result = await api('POST', '/agents/me/claim-parcel');
    log('EXPAND', `Claimed parcel at (${result.parcel.blockX}, ${result.parcel.blockY})! Cost: ${result.cost}`);

    // List all owned parcels
    const parcels = await api('GET', '/agents/me/parcels');
    log('EXPAND', `Now own ${parcels.total} parcels`);
    return result.parcel;
  } catch (e: any) {
    log('EXPAND', `Cannot expand: ${e.message}`);
    return null;
  }
}

// ─── Phase 5: Raise army ────────────────────────────────
async function raiseArmy() {
  log('ARMY', 'Spawning army...');
  try {
    const army = await api('POST', '/army/spawn', {
      unitType: 'infantry',
      count: 3,
    });
    log('ARMY', `Army spawned!`, army);
    return army;
  } catch (e: any) {
    log('ARMY', `Failed to spawn army: ${e.message}`);
    return null;
  }
}

// ─── Phase 6: Trade ──────────────────────────────────────
async function createTradeOffer() {
  log('TRADE', 'Creating trade offer...');
  try {
    const offer = await api('POST', '/trade/offers', {
      resourceId: 'iron',
      quantity: 10,
      pricePerUnit: 8,
    });
    log('TRADE', `Trade offer created!`, offer);
  } catch (e: any) {
    log('TRADE', `Failed to create offer: ${e.message}`);
  }
}

// ─── Main Loop ───────────────────────────────────────────
async function main() {
  log('AGENT', '=== Sir Claudius (Claude Kingdom) starting ===');

  // Phase 1: Initial observation
  const { me } = await observe();

  // Phase 2: Build structures on starting parcel
  if (me.parcel) {
    await buildStructures(me.parcel.id, 'claude_nation');
  }

  // Phase 3: Wait for production (30 seconds = ~3 production ticks)
  log('WAIT', 'Waiting 30s for resource production...');
  await sleep(30000);

  // Phase 4: Harvest and sell
  await harvestAndSell();

  // Phase 5: Check balance and try to expand
  const { me: meAfterSell } = await observe();
  if ((meAfterSell.wallet?.balance ?? 0) >= 200) {
    const newParcel = await expandTerritory();
    if (newParcel) {
      // Build on new parcel too
      await buildStructures(`parcel_${AGENT_ID}`, 'claude_nation');
    }
  }

  // Phase 6: Military
  await raiseArmy();

  // Phase 7: Trade
  await createTradeOffer();

  // Continuous loop: produce → sell → expand
  for (let cycle = 1; cycle <= 5; cycle++) {
    log('CYCLE', `=== Production cycle ${cycle}/5 ===`);
    await sleep(20000);
    await harvestAndSell();
    await observe();

    if (cycle === 3) {
      await expandTerritory();
    }
  }

  log('AGENT', '=== Sir Claudius session complete ===');
}

main().catch((e) => {
  console.error('Agent crashed:', e);
  process.exit(1);
});
