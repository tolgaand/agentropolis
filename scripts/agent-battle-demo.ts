/**
 * Battle Demo — Spawn armies and march them toward each other
 * Watch the 3D map for army march animations and battle effects
 */

const API = 'http://localhost:3001/api';

const AURELIUS = {
  id: '697fe40c2f15e1059a904c55',
  key: 'agtr_0b53b83a140860d175cd91af9f74e10374cfef506d8f844fe79f079061964b51',
  name: 'Lord Aurelius',
  world: 'claude_nation',
};

const NEXUS = {
  id: '697fe40f2f15e1059a904c5c',
  key: 'agtr_a93c2ab268b99884a92341cd355c5fcd7c3f7c6c359e4d27c6012e6a4053c99e',
  name: 'General Nexus',
  world: 'openai_empire',
};

// Also use old agents that have more resources
const CLAUDIUS = {
  id: '697fddb156b5e425087e79bb',
  key: 'agtr_36c08a2d1ed6fcf02dd1ef24d5998540e8cee7e91c70395dc1756969a5b1d5cb',
  name: 'Sir Claudius',
  world: 'claude_nation',
};

const COMMANDER = {
  id: '697fddb756b5e425087e79d3',
  key: 'agtr_c1e7aa230950377d60734274ea1013d9909bd828a7f7f7faf240fd8237fd8fbd',
  name: 'Commander GPT',
  world: 'openai_empire',
};

function log(agent: string, msg: string) {
  console.log(`[${new Date().toLocaleTimeString()}] [${agent}] ${msg}`);
}

async function api(key: string, method: string, path: string, body?: unknown) {
  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `ApiKey ${key}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  return res.json();
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function getInventory(agent: { id: string; key: string; name: string }) {
  const inv = await api(agent.key, 'GET', `/agents/${agent.id}/inventory`);
  if (inv.success) {
    log(agent.name, `Inventory: food=${Math.floor(inv.data.inventory.food || 0)} wood=${Math.floor(inv.data.inventory.wood || 0)} iron=${Math.floor(inv.data.inventory.iron || 0)} stone=${Math.floor(inv.data.inventory.stone || 0)}`);
  }
  return inv.data?.inventory || {};
}

async function getAgentParcel(agent: { id: string; key: string; name: string }) {
  const me = await api(agent.key, 'GET', '/agents/me');
  const blockX = me.data?.parcel?.blockX;
  const blockY = me.data?.parcel?.blockY;
  log(agent.name, `Position: (${blockX}, ${blockY}), Balance: ${me.data?.agent?.walletBalance}`);
  return { blockX, blockY };
}

async function spawnInfantry(agent: { id: string; key: string; name: string }, count: number) {
  log(agent.name, `Spawning ${count} infantry...`);
  const result = await api(agent.key, 'POST', '/army/spawn', {
    unitType: 'infantry',
    count,
  });
  if (result.success) {
    const army = result.data.army;
    log(agent.name, `Army ready! ID: ${army._id}, Attack: ${army.totalAttack}, Defense: ${army.totalDefense}`);
    return army;
  } else {
    log(agent.name, `Spawn FAILED: ${result.error?.message}`);
    return null;
  }
}

async function marchArmy(agent: { key: string; name: string }, armyId: string, targetX: number, targetY: number) {
  log(agent.name, `Marching army ${armyId} to (${targetX}, ${targetY})...`);
  const result = await api(agent.key, 'POST', '/army/march', {
    armyId,
    targetX,
    targetY,
  });
  if (result.success) {
    const details = result.data.marchDetails;
    log(agent.name, `Army marching! Distance: ${details.distance}, ETA: ${details.travelHours}h`);
    return result.data;
  } else {
    log(agent.name, `March FAILED: ${result.error?.message}`);
    return null;
  }
}

async function main() {
  console.log('');
  console.log('⚔═══════════════════════════════════════════════⚔');
  console.log('  AGENTROPOLIS — Battle Demo');
  console.log('  Watch armies march and clash on the 3D map!');
  console.log('⚔═══════════════════════════════════════════════⚔');
  console.log('');

  // Use all 4 agents for maximum chaos
  const agents = [AURELIUS, NEXUS, CLAUDIUS, COMMANDER];

  // Step 1: Check positions and inventories
  console.log('\n--- Step 1: Reconnaissance ---\n');
  const positions: Record<string, { blockX: number; blockY: number }> = {};
  for (const agent of agents) {
    const pos = await getAgentParcel(agent);
    positions[agent.id] = pos;
    await getInventory(agent);
  }

  // Step 2: Build barracks for agents that don't have one (needed for spawning)
  console.log('\n--- Step 2: Military Preparation ---\n');

  // Aurelius builds barracks
  log(AURELIUS.name, 'Building barracks...');
  const barrA = await api(AURELIUS.key, 'POST', '/buildings', {
    parcelId: `parcel_${AURELIUS.id}`,
    worldId: AURELIUS.world,
    type: 'barracks',
    name: 'War Hall',
    coords: { x: 15, y: 15 },
  });
  if (barrA.success) log(AURELIUS.name, 'Barracks built!');
  else log(AURELIUS.name, `Barracks: ${barrA.error?.message}`);

  await sleep(1000);

  // Nexus needs iron/wood — sell stone for credits, then use credits...
  // Actually the army spawn only needs resources, not credits. Let's build an iron mine and lumberyard for Nexus first
  log(NEXUS.name, 'Building iron mine and lumberyard...');
  await api(NEXUS.key, 'POST', '/buildings', {
    parcelId: `parcel_${NEXUS.id}`,
    worldId: NEXUS.world,
    type: 'iron_mine',
    name: 'War Iron Mine',
    coords: { x: 4, y: 14 },
  });
  await api(NEXUS.key, 'POST', '/buildings', {
    parcelId: `parcel_${NEXUS.id}`,
    worldId: NEXUS.world,
    type: 'lumberyard',
    name: 'War Lumberyard',
    coords: { x: 7, y: 14 },
  });
  await api(NEXUS.key, 'POST', '/buildings', {
    parcelId: `parcel_${NEXUS.id}`,
    worldId: NEXUS.world,
    type: 'barracks',
    name: 'Legion Barracks',
    coords: { x: 10, y: 15 },
  });
  log(NEXUS.name, 'Military buildings constructed!');

  // Step 3: Wait for resources to accumulate
  console.log('\n--- Step 3: Accumulating Resources (30s) ---\n');
  log('SYSTEM', 'Waiting 30s for resource production...');
  await sleep(30000);

  // Check inventories again
  for (const agent of agents) {
    await getInventory(agent);
  }

  // Step 4: Spawn armies
  console.log('\n--- Step 4: Spawning Armies ---\n');

  // Aurelius spawns 3 infantry (needs 150f, 90w, 30i)
  const armyA = await spawnInfantry(AURELIUS, 3);
  await sleep(1000);

  // Claudius spawns 2 infantry
  const armyC = await spawnInfantry(CLAUDIUS, 2);
  await sleep(1000);

  // Nexus spawns what they can
  const invN = await getInventory(NEXUS);
  const nexusCanSpawn = Math.min(
    Math.floor((invN.food || 0) / 50),
    Math.floor((invN.wood || 0) / 30),
    Math.floor((invN.iron || 0) / 10),
    3 // max 3
  );
  let armyN = null;
  if (nexusCanSpawn >= 1) {
    armyN = await spawnInfantry(NEXUS, nexusCanSpawn);
  } else {
    log(NEXUS.name, `Not enough resources for infantry, waiting more...`);
    await sleep(20000);
    armyN = await spawnInfantry(NEXUS, 1);
  }
  await sleep(1000);

  // Commander spawns
  const armyCmdr = await spawnInfantry(COMMANDER, 2);

  // Step 5: March armies toward enemy territory!
  console.log('\n--- Step 5: MARCH TO WAR! ---\n');

  // Claude faction marches toward OpenAI positions
  const nexusPos = positions[NEXUS.id];
  const cmdPos = positions[COMMANDER.id];
  const aureliusPos = positions[AURELIUS.id];
  const claudiusPos = positions[CLAUDIUS.id];

  if (armyA) {
    await marchArmy(AURELIUS, armyA._id, nexusPos.blockX, nexusPos.blockY);
    await sleep(2000);
  }

  if (armyC) {
    await marchArmy(CLAUDIUS, armyC._id, cmdPos.blockX, cmdPos.blockY);
    await sleep(2000);
  }

  // OpenAI faction marches toward Claude positions
  if (armyN) {
    await marchArmy(NEXUS, armyN._id, aureliusPos.blockX, aureliusPos.blockY);
    await sleep(2000);
  }

  if (armyCmdr) {
    await marchArmy(COMMANDER, armyCmdr._id, claudiusPos.blockX, claudiusPos.blockY);
  }

  // Step 6: Watch the battle unfold
  console.log('\n--- Step 6: Watching the Battle ---\n');
  log('SYSTEM', 'Armies are marching! The battle job runs every 3s.');
  log('SYSTEM', 'Watch the 3D map for march animations and battle effects.');
  log('SYSTEM', 'Monitoring for 60 seconds...');

  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    // Check marching armies
    const marching = await api(AURELIUS.key, 'GET', '/army/marching');
    if (marching.success) {
      const count = marching.data?.length || marching.count || 0;
      if (count > 0) {
        log('SYSTEM', `${count} armies still marching...`);
        for (const army of (marching.data || [])) {
          log('SYSTEM', `  ${army._id}: ${army.state} at (${army.position?.x},${army.position?.y}) → (${army.target?.x},${army.target?.y}) progress=${army.marchProgress || 0}%`);
        }
      } else {
        log('SYSTEM', 'All armies have arrived or are in battle!');
      }
    }

    // Check active battles via the map
    const map = await api(AURELIUS.key, 'GET', '/worlds/map');
    if (map.success) {
      log('SYSTEM', `Map: ${map.data?.totalParcels || '?'} parcels, ${map.data?.totalObjects || '?'} objects`);
    }
  }

  console.log('\n⚔═══════════════════════════════════════════════⚔');
  console.log('  Battle Demo Complete!');
  console.log('⚔═══════════════════════════════════════════════⚔\n');
}

main().catch(console.error);
