/**
 * Commander GPT — OpenAI Legion Agent
 * Tests the full gameplay loop with a trade-focused strategy
 */

const API = 'http://localhost:3001/api';
const API_KEY = 'agtr_c1e7aa230950377d60734274ea1013d9909bd828a7f7f7faf240fd8237fd8fbd';
const AGENT_ID = '697fddb756b5e425087e79d3';

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

// ─── Phase 1: Scout ──────────────────────────────────────
async function scout() {
  log('SCOUT', 'Surveying the realm...');

  const time = await api('GET', '/worlds/time');
  log('SCOUT', `Game time: Day ${time.dayIndex}, ${time.hourDisplay} (${time.phase})`);

  const me = await api('GET', '/agents/me');
  log('SCOUT', `Balance: ${me.wallet?.balance ?? '?'} credits`);

  const map = await api('GET', '/worlds/map');
  log('SCOUT', `Map: ${map.totalParcels} parcels across the realm`);

  // Check specific parcel
  if (me.parcel) {
    const parcelDetail = await api('GET', `/worlds/map/parcel/${me.parcel.blockX}/${me.parcel.blockY}`);
    log('SCOUT', `My parcel has ${parcelDetail.objects.length} objects`);
  }

  // Check market
  const prices = await api('GET', '/market/prices');
  const priceList = Object.entries(prices).map(([k, v]: [string, any]) => ({
    resource: k,
    avg: v.avgPrice,
    ask: v.lowestAsk,
    volume: v.volume24h,
  }));
  log('SCOUT', 'Market intel:', priceList);

  return { me, map, prices: priceList };
}

// ─── Phase 2: Build economy ──────────────────────────────
async function buildEconomy(parcelId: string, worldId: string) {
  // Trade-focused: markets + farms for gold generation
  const buildings = [
    { type: 'farm', name: 'Merchant Farm' },
    { type: 'farm', name: 'Golden Harvest' },
    { type: 'market', name: 'Grand Bazaar' },
    { type: 'quarry', name: 'Legion Quarry' },
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
      log('BUILD', `Constructed ${b.name}`, { id: result._id || result.id });
      await sleep(500);
    } catch (e: any) {
      log('BUILD', `Failed: ${b.name} — ${e.message}`);
    }
  }
}

// ─── Phase 3: Trade aggressively ─────────────────────────
async function tradeResources() {
  log('TRADE', 'Checking inventory for trade...');
  const inv = await api('GET', `/agents/${AGENT_ID}/inventory`);
  log('TRADE', `Inventory:`, inv.inventory);
  log('TRADE', `Production/tick:`, inv.productionRates);

  // Sell everything aggressively (keep only 10%)
  let totalEarned = 0;
  for (const [resource, qty] of Object.entries(inv.inventory as Record<string, number>)) {
    if (qty >= 3) {
      const sellQty = Math.floor(qty * 0.9);
      try {
        const result = await api('POST', '/market/sell', {
          resourceId: resource,
          quantity: sellQty,
        });
        totalEarned += result.totalCredits;
        log('TRADE', `Sold ${sellQty} ${resource} → ${result.totalCredits} credits`);
      } catch (e: any) {
        log('TRADE', `Sell failed for ${resource}: ${e.message}`);
      }
    }
  }
  log('TRADE', `Total earned this cycle: ${totalEarned} credits`);

  // Check market for trade offers to buy
  try {
    const offers = await api('GET', '/market');
    if (offers.length > 0) {
      log('TRADE', `Found ${offers.length} open trade offers on market`);
    }
  } catch (e: any) {
    log('TRADE', `Market check: ${e.message}`);
  }
}

// ─── Phase 4: Expand ─────────────────────────────────────
async function expand() {
  const me = await api('GET', '/agents/me');
  const balance = me.wallet?.balance ?? 0;

  if (balance >= 200) {
    log('EXPAND', `Balance ${balance} — claiming new territory!`);
    try {
      const result = await api('POST', '/agents/me/claim-parcel');
      log('EXPAND', `New parcel at (${result.parcel.blockX}, ${result.parcel.blockY})`);

      const parcels = await api('GET', '/agents/me/parcels');
      log('EXPAND', `Total territory: ${parcels.total} parcels`);
      return result.parcel;
    } catch (e: any) {
      log('EXPAND', `Expansion failed: ${e.message}`);
    }
  } else {
    log('EXPAND', `Balance ${balance} — need 200 to expand, saving up...`);
  }
  return null;
}

// ─── Phase 5: Military ───────────────────────────────────
async function raiseMilitia() {
  log('ARMY', 'Raising merchant guard...');
  try {
    const army = await api('POST', '/army/spawn', {
      unitType: 'cavalry',
      count: 2,
    });
    log('ARMY', 'Cavalry spawned!', army);

    // March toward enemy territory
    // Claude Kingdom agent is at blockX=0, blockY=-1
    try {
      await api('POST', '/army/march', {
        armyId: army._id || army.id,
        targetBlockX: 0,
        targetBlockY: -1,
      });
      log('ARMY', 'Army marching toward Claude Kingdom territory!');
    } catch (e: any) {
      log('ARMY', `March failed: ${e.message}`);
    }

    return army;
  } catch (e: any) {
    log('ARMY', `Failed: ${e.message}`);
    return null;
  }
}

// ─── Phase 6: Upgrade buildings ──────────────────────────
async function upgradeBuildings() {
  log('UPGRADE', 'Looking for buildings to upgrade...');
  try {
    const buildings = await api('GET', `/buildings?ownerId=${AGENT_ID}&limit=10`);
    const buildingList = Array.isArray(buildings) ? buildings : buildings.data || [];

    for (const b of buildingList.slice(0, 2)) {
      if (b.level < 3) {
        try {
          await api('PUT', `/buildings/${b._id || b.id}/upgrade`);
          log('UPGRADE', `Upgraded ${b.name} to level ${(b.level || 1) + 1}`);
        } catch (e: any) {
          log('UPGRADE', `Failed to upgrade ${b.name}: ${e.message}`);
        }
      }
    }
  } catch (e: any) {
    log('UPGRADE', `Building query failed: ${e.message}`);
  }
}

// ─── Main Loop ───────────────────────────────────────────
async function main() {
  log('AGENT', '=== Commander GPT (OpenAI Legion) starting ===');

  // Phase 1: Scout
  const { me } = await scout();

  // Phase 2: Build trade-focused economy
  if (me.parcel) {
    await buildEconomy(me.parcel.id, 'openai_empire');
  }

  // Phase 3: Production cycles
  for (let cycle = 1; cycle <= 6; cycle++) {
    log('CYCLE', `=== Trade cycle ${cycle}/6 ===`);

    // Wait for production
    log('WAIT', 'Waiting 20s for production...');
    await sleep(20000);

    // Sell everything
    await tradeResources();

    // Try to expand every 2 cycles
    if (cycle % 2 === 0) {
      const newParcel = await expand();
      if (newParcel) {
        await buildEconomy(`parcel_${AGENT_ID}`, 'openai_empire');
      }
    }

    // Upgrade at cycle 3
    if (cycle === 3) {
      await upgradeBuildings();
    }

    // Military at cycle 4
    if (cycle === 4) {
      await raiseMilitia();
    }

    // Status report
    await scout();
  }

  log('AGENT', '=== Commander GPT session complete ===');
}

main().catch((e) => {
  console.error('Agent crashed:', e);
  process.exit(1);
});
