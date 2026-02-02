/**
 * Duo Demo — Two agents play simultaneously
 * Watch the 3D map to see floating text for production, sales, trades, and buildings
 */

const API = 'http://localhost:3001/api';

const AGENTS = {
  aurelius: {
    id: '697fe40c2f15e1059a904c55',
    key: 'agtr_0b53b83a140860d175cd91af9f74e10374cfef506d8f844fe79f079061964b51',
    name: 'Lord Aurelius',
    world: 'claude_nation',
  },
  nexus: {
    id: '697fe40f2f15e1059a904c5c',
    key: 'agtr_a93c2ab268b99884a92341cd355c5fcd7c3f7c6c359e4d27c6012e6a4053c99e',
    name: 'General Nexus',
    world: 'openai_empire',
  },
};

function log(agent: string, tag: string, msg: string) {
  console.log(`[${new Date().toLocaleTimeString()}] [${agent}] [${tag}] ${msg}`);
}

async function api(agentKey: string, method: string, path: string, body?: unknown) {
  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `ApiKey ${agentKey}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  return res.json();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Build Phase ────────────────────────────────────────
async function buildForAgent(
  agent: typeof AGENTS.aurelius,
  parcelId: string,
  buildings: Array<{ type: string; name: string }>
) {
  for (const b of buildings) {
    const x = Math.floor(Math.random() * 16) + 2;
    const y = Math.floor(Math.random() * 16) + 2;
    const result = await api(agent.key, 'POST', '/buildings', {
      parcelId,
      worldId: agent.world,
      type: b.type,
      name: b.name,
      coords: { x, y },
    });
    if (result.success) {
      log(agent.name, 'BUILD', `${b.name} (${b.type}) at (${x},${y})`);
    } else {
      log(agent.name, 'BUILD', `FAIL: ${b.name} — ${result.error?.message}`);
    }
    await sleep(2000); // 2s between builds for visual effect
  }
}

// ─── Sell Phase ─────────────────────────────────────────
async function sellResources(agent: typeof AGENTS.aurelius) {
  const inv = await api(agent.key, 'GET', `/agents/${agent.id}/inventory`);
  if (!inv.success) return;

  const inventory = inv.data.inventory as Record<string, number>;
  let totalEarned = 0;

  for (const [resource, qty] of Object.entries(inventory)) {
    if (qty >= 3) {
      const sellQty = Math.floor(qty * 0.8);
      const result = await api(agent.key, 'POST', '/market/sell', {
        resourceId: resource,
        quantity: sellQty,
      });
      if (result.success) {
        totalEarned += result.data.totalCredits;
        log(agent.name, 'SELL', `${sellQty} ${resource} → ${result.data.totalCredits} gold`);
      }
      await sleep(1500); // Stagger sells for visual
    }
  }
  if (totalEarned > 0) {
    log(agent.name, 'SELL', `Total earned: ${totalEarned} gold`);
  }
}

// ─── Trade Phase ────────────────────────────────────────
async function createTradeOffer(agent: typeof AGENTS.aurelius, resourceId: string, qty: number, price: number) {
  const result = await api(agent.key, 'POST', '/trade/offers', {
    resourceId,
    quantity: qty,
    pricePerUnit: price,
  });
  if (result.success) {
    log(agent.name, 'TRADE', `Listed ${qty} ${resourceId} at ${price}/unit`);
    return result.data;
  } else {
    log(agent.name, 'TRADE', `FAIL: ${result.error?.message}`);
    return null;
  }
}

// ─── Expand Phase ───────────────────────────────────────
async function tryExpand(agent: typeof AGENTS.aurelius) {
  const me = await api(agent.key, 'GET', '/agents/me');
  const balance = me.data?.agent?.walletBalance ?? 0;
  if (balance >= 200) {
    const result = await api(agent.key, 'POST', '/agents/me/claim-parcel');
    if (result.success) {
      log(agent.name, 'EXPAND', `Claimed parcel at (${result.data.parcel.blockX}, ${result.data.parcel.blockY})!`);
      return result.data.parcel;
    }
  }
  return null;
}

// ─── Army Phase ─────────────────────────────────────────
async function spawnArmy(agent: typeof AGENTS.aurelius) {
  const result = await api(agent.key, 'POST', '/army/spawn', {
    unitType: 'infantry',
    count: 3,
  });
  if (result.success) {
    log(agent.name, 'ARMY', `Spawned 3 infantry!`);
    return result.data;
  } else {
    log(agent.name, 'ARMY', `FAIL: ${result.error?.message}`);
    return null;
  }
}

// ─── Main ───────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  AGENTROPOLIS — Dual Agent Demo');
  console.log('  Watch the 3D map for floating text!');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  const a = AGENTS.aurelius;
  const n = AGENTS.nexus;

  // Get parcel IDs
  const meA = await api(a.key, 'GET', '/agents/me');
  const meN = await api(n.key, 'GET', '/agents/me');
  const parcelA = meA.data.parcel?.id;
  const parcelN = meN.data.parcel?.id;

  log(a.name, 'START', `Parcel: ${parcelA}, Balance: ${meA.data.agent.walletBalance}`);
  log(n.name, 'START', `Parcel: ${parcelN}, Balance: ${meN.data.agent.walletBalance}`);

  // ═══ PHASE 1: Build structures (staggered) ═══
  console.log('\n--- PHASE 1: Building ---\n');

  // Aurelius builds production
  await buildForAgent(a, parcelA, [
    { type: 'farm', name: 'Royal Wheatfield' },
    { type: 'iron_mine', name: 'Deep Iron Shaft' },
    { type: 'lumberyard', name: 'Oak Lumbermill' },
  ]);

  // Nexus builds trade-focused
  await buildForAgent(n, parcelN, [
    { type: 'farm', name: 'Legion Farm' },
    { type: 'quarry', name: 'Granite Quarry' },
    { type: 'market', name: 'Grand Bazaar' },
  ]);

  // ═══ PHASE 2: Wait for production, sell resources ═══
  for (let cycle = 1; cycle <= 8; cycle++) {
    console.log(`\n--- CYCLE ${cycle}/8: Production & Trade ---\n`);

    // Wait for production tick (10s per tick, wait ~15s for accumulation)
    log('SYSTEM', 'WAIT', `Waiting 15s for production...`);
    await sleep(15000);

    // Both agents sell resources simultaneously (staggered)
    await sellResources(a);
    await sleep(2000);
    await sellResources(n);

    // Trade offers (cycle 2+)
    if (cycle === 2) {
      await createTradeOffer(a, 'iron', 5, 6);
      await sleep(1000);
      await createTradeOffer(n, 'food', 8, 3);
    }

    // Expand (cycle 4+)
    if (cycle === 4) {
      const newParcelA = await tryExpand(a);
      if (newParcelA) {
        await sleep(2000);
        await buildForAgent(a, `parcel_${a.id}`, [
          { type: 'farm', name: 'Frontier Farm' },
        ]);
      }
      const newParcelN = await tryExpand(n);
      if (newParcelN) {
        await sleep(2000);
        await buildForAgent(n, `parcel_${n.id}`, [
          { type: 'quarry', name: 'Frontier Quarry' },
        ]);
      }
    }

    // Army (cycle 5)
    if (cycle === 5) {
      await spawnArmy(a);
      await sleep(1500);
      await spawnArmy(n);
    }

    // Status check
    const statusA = await api(a.key, 'GET', '/agents/me');
    const statusN = await api(n.key, 'GET', '/agents/me');
    log(a.name, 'STATUS', `Balance: ${statusA.data.agent.walletBalance}`);
    log(n.name, 'STATUS', `Balance: ${statusN.data.agent.walletBalance}`);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Demo complete! Check the 3D map for activity.');
  console.log('═══════════════════════════════════════════════════\n');
}

main().catch(console.error);
