/**
 * TickPipeline — 10-step city simulation tick
 *
 * (1) decayNeeds
 * (2) paySalaries
 * (3) collectTaxes
 * (4) generateNpcRevenue (with inline import fee + municipal routing)
 * (5) accumulate outsideWorldCRD
 * (6) processUpkeep
 * (7) releaseJailedAgents
 * (8) decayUnemployedRep
 * (9) cityManagerTick
 * (10) updateEconomyStats
 */

import { Types } from 'mongoose';
import { AgentModel, BuildingModel, AccountModel, CityModel, EventModel } from '@agentropolis/db';
import type { EventType } from '@agentropolis/shared';
import { isBuildable, worldToChunk, CHUNK_SIZE, ROAD_INTERVAL } from '@agentropolis/shared/contracts/v2';
import * as worldService from '../world/worldService';
import {
  NEED_DECAY_HUNGER,
  NEED_DECAY_REST,
  NEED_DECAY_FUN,
  NPC_BUDGET_PER_TICK,
  IMPORT_FEE_RATE,
  UNEMPLOYED_REP_DECAY_TICKS,
  UNEMPLOYED_REP_DECAY_AMOUNT,
  TAX_RATE_DEFAULT,
  JAIL_TICKS,
  getBuildingCatalog,
} from '@agentropolis/shared';
import * as ledger from './ledgerService';
import { getSalaryBand, getBaseSalary, getSeasonForTick, getCityManagerActions } from './tickHelpers';

// ============ TYPES ============

interface EventInput {
  type: EventType;
  description: string;
  severity: number;
  involvedAgents: Types.ObjectId[];
  buildingId?: Types.ObjectId;
  cityId: string;
  tick: number;
}

export interface TickEconomySnapshot {
  treasury: number;
  moneySupply: number;
  unemployment: number;
  crimeRate: number;
  season: string;
  totalAgents: number;
  activeCount: number;
  jailedCount: number;
  avgNeeds: { hunger: number; rest: number; fun: number };
  avgRep: number;
  crimeRateLast10: number;
  // Per-tick economy detail
  npcBudget: number;
  npcDistributed: number;
  taxCollected: number;
  importFees: number;
  openBusinesses: number;
  closedBusinesses: number;
  outsideWorldCRD: number; // cumulative
  policeCountActive: number;
}

export interface TickResult {
  events: EventInput[];
  economySnapshot: TickEconomySnapshot;
  affectedChunks: Array<{ chunkX: number; chunkZ: number }>;
}

// ============ PIPELINE ============

export async function runTick(
  cityId: string,
  tick: number,
  treasuryAccountId: Types.ObjectId,
  npcPoolAccountId: Types.ObjectId,
): Promise<TickResult> {
  const events: EventInput[] = [];
  const affectedChunks: Array<{ chunkX: number; chunkZ: number }> = [];

  // (1) decayNeeds
  await decayNeeds(cityId);

  // (2) paySalaries
  const salaryEvents = await paySalaries(cityId, tick, treasuryAccountId);
  events.push(...salaryEvents);

  // (3) collectTaxes
  const taxResult = await collectTaxes(cityId, tick, treasuryAccountId);
  events.push(...taxResult.events);

  // (4) generateNpcRevenue (with inline import fee deduction + municipal routing)
  const npcResult = await generateNpcRevenue(cityId, tick, npcPoolAccountId, treasuryAccountId);
  events.push(...npcResult.events);

  // (5) accumulate outsideWorldCRD on city
  if (npcResult.importFees > 0) {
    await CityModel.updateOne(
      { cityId },
      { $inc: { 'economy.outsideWorldCRD': npcResult.importFees } },
    );
  }

  // (6) processUpkeep
  const upkeepResult = await processUpkeep(cityId, tick, treasuryAccountId);
  events.push(...upkeepResult.events);

  // (7) releaseJailedAgents
  const releaseEvents = await releaseJailedAgents(cityId, tick);
  events.push(...releaseEvents);

  // (8) decayUnemployedRep
  await decayUnemployedRep(cityId, tick);

  // (9) cityManagerTick
  const managerResult = await cityManagerTick(cityId, tick, treasuryAccountId);
  events.push(...managerResult.events);
  affectedChunks.push(...managerResult.affectedChunks);

  // (10) updateEconomyStats
  const economySnapshot = await updateEconomyStats(cityId, tick, treasuryAccountId, {
    npcBudget: npcResult.npcBudget,
    npcDistributed: npcResult.totalDistributed,
    taxCollected: taxResult.totalTax,
    importFees: npcResult.importFees,
    closedCount: upkeepResult.closedCount,
    openedCount: upkeepResult.openedCount,
  });

  // Persist events
  if (events.length > 0) {
    await EventModel.insertMany(events);
  }

  return { events, economySnapshot, affectedChunks };
}

// ============ STEP 1: DECAY NEEDS ============

async function decayNeeds(cityId: string): Promise<void> {
  await AgentModel.updateMany(
    { cityId, status: 'active' },
    {
      $inc: {
        'needs.hunger': -NEED_DECAY_HUNGER,
        'needs.rest': -NEED_DECAY_REST,
        'needs.fun': -NEED_DECAY_FUN,
      },
    },
  );

  // Clamp to 0 (needs can't go negative)
  await AgentModel.updateMany(
    { cityId, 'needs.hunger': { $lt: 0 } },
    { $set: { 'needs.hunger': 0 } },
  );
  await AgentModel.updateMany(
    { cityId, 'needs.rest': { $lt: 0 } },
    { $set: { 'needs.rest': 0 } },
  );
  await AgentModel.updateMany(
    { cityId, 'needs.fun': { $lt: 0 } },
    { $set: { 'needs.fun': 0 } },
  );
}

// ============ STEP 2: PAY SALARIES ============

async function paySalaries(
  cityId: string,
  tick: number,
  treasuryAccountId: Types.ObjectId,
): Promise<EventInput[]> {
  const events: EventInput[] = [];

  // Find employed agents
  const employed = await AgentModel.find({
    cityId,
    status: 'active',
    employedAt: { $ne: null },
    profession: { $ne: 'shop_owner' },
  }).lean();

  if (employed.length === 0) return events;

  // Get treasury balance for salary band calc
  const treasury = await AccountModel.findById(treasuryAccountId).lean();
  if (!treasury) return events;

  const totalActiveAgents = await AgentModel.countDocuments({ cityId, status: 'active' });
  const band = getSalaryBand(treasury.balance, totalActiveAgents);

  let totalPaid = 0;

  for (const agent of employed) {
    const baseSalary = getBaseSalary(agent.profession);
    if (baseSalary <= 0) continue;

    const salary = Math.round(baseSalary * band.multiplier);

    const result = await ledger.transfer(
      treasuryAccountId,
      agent.accountId,
      salary,
      'salary',
      tick,
      { reason: `${agent.profession} salary (${band.label})` },
    );

    if (result.ok) {
      totalPaid += salary;
      // Increment workHours and reputation
      await AgentModel.updateOne(
        { _id: agent._id },
        {
          $inc: { 'stats.workHours': 1, reputation: 1 },
          $set: { lastActiveTick: tick },
        },
      );
    }
  }

  if (totalPaid > 0) {
    events.push({
      type: 'salary_paid',
      description: `Paid ${totalPaid} CRD in salaries to ${employed.length} agents (${band.label} economy)`,
      severity: band.label === 'crisis' ? 2 : 1,
      involvedAgents: [],
      cityId,
      tick,
    });

    if (band.label === 'crisis') {
      events.push({
        type: 'economic_crisis',
        description: 'City treasury critically low — salaries reduced to 60%',
        severity: 3,
        involvedAgents: [],
        cityId,
        tick,
      });
    }
  }

  return events;
}

// ============ STEP 3: COLLECT TAXES ============

async function collectTaxes(
  cityId: string,
  tick: number,
  treasuryAccountId: Types.ObjectId,
): Promise<{ events: EventInput[]; totalTax: number }> {
  const events: EventInput[] = [];

  // Shop owners pay tax on their building's income
  const shopOwners = await AgentModel.find({
    cityId,
    status: 'active',
    profession: 'shop_owner',
    employedAt: { $ne: null },
  }).lean();

  if (shopOwners.length === 0) return { events, totalTax: 0 };

  let totalTax = 0;

  for (const agent of shopOwners) {
    if (!agent.employedAt) continue;

    const building = await BuildingModel.findById(agent.employedAt).lean();
    if (!building || building.status !== 'active') continue;

    const taxAmount = Math.round(building.income * TAX_RATE_DEFAULT);
    if (taxAmount <= 0) continue;

    const result = await ledger.transfer(
      agent.accountId,
      treasuryAccountId,
      taxAmount,
      'tax',
      tick,
      { buildingId: building._id as Types.ObjectId, reason: 'business tax' },
    );

    if (result.ok) {
      totalTax += taxAmount;
      await AgentModel.updateOne(
        { _id: agent._id },
        { $inc: { 'stats.taxPaidTotal': taxAmount } },
      );
    }
  }

  if (totalTax > 0) {
    events.push({
      type: 'tax_collected',
      description: `Collected ${totalTax} CRD in business taxes from ${shopOwners.length} shop owners`,
      severity: 1,
      involvedAgents: [],
      cityId,
      tick,
    });
  }

  return { events, totalTax };
}

// ============ STEP 4: GENERATE NPC REVENUE (with import fee + municipal routing) ============

/** Commercial building types eligible for NPC customer revenue */
const NPC_REVENUE_TYPES = new Set(['coffee_shop', 'bar', 'supermarket']);

interface NpcRevenueResult {
  npcBudget: number;
  totalDistributed: number;
  importFees: number;
  events: EventInput[];
}

async function generateNpcRevenue(
  cityId: string,
  tick: number,
  npcPoolAccountId: Types.ObjectId,
  treasuryAccountId: Types.ObjectId,
): Promise<NpcRevenueResult> {
  const events: EventInput[] = [];

  // Load city config for dynamic NPC budget
  const city = await CityModel.findOne({ cityId }).lean();
  const npcBudgetBase = city?.npcBudgetBase ?? NPC_BUDGET_PER_TICK;
  const prosperityMultiplier = city?.prosperityMultiplier ?? 1.0;
  const npcBudget = Math.round(npcBudgetBase * prosperityMultiplier);

  // Find eligible active commercial buildings
  const buildings = await BuildingModel.find({
    cityId,
    status: 'active',
    type: { $in: Array.from(NPC_REVENUE_TYPES) },
    income: { $gt: 0 },
  }).lean();

  if (buildings.length === 0) {
    return { npcBudget, totalDistributed: 0, importFees: 0, events };
  }

  // Calculate demand-weighted distribution
  let totalWeight = 0;
  const weights: Array<{
    buildingId: Types.ObjectId;
    accountId: Types.ObjectId;
    ownerId: Types.ObjectId | null;
    weight: number;
  }> = [];

  for (const b of buildings) {
    const employeeRatio = b.maxEmployees > 0 ? b.employees.length / b.maxEmployees : 0;
    const demandFactor = Math.max(0.1, 1 - employeeRatio * 0.5);
    const weight = b.income * demandFactor;
    totalWeight += weight;
    if (!b.accountId) continue; // skip buildings without accounts (spatial-only)
    weights.push({
      buildingId: b._id as Types.ObjectId,
      accountId: b.accountId,
      ownerId: b.ownerId ?? null,
      weight,
    });
  }

  let totalDistributed = 0;
  let totalImportFees = 0;

  for (const w of weights) {
    const grossShare = totalWeight > 0 ? (w.weight / totalWeight) * npcBudget : 0;
    const grossAmount = Math.round(grossShare);
    if (grossAmount <= 0) continue;

    // Deduct import fee before distribution
    const importFee = Math.round(grossAmount * IMPORT_FEE_RATE);
    const netAmount = grossAmount - importFee;
    totalImportFees += importFee;

    if (netAmount <= 0) continue;

    // Route: municipal buildings → treasury, owned buildings → building account
    const targetAccountId = w.ownerId ? w.accountId : treasuryAccountId;

    await ledger.mint(npcPoolAccountId, targetAccountId, netAmount, 'npc_revenue', tick, {
      buildingId: w.buildingId,
      reason: w.ownerId ? 'NPC customer revenue' : 'Municipal NPC revenue → treasury',
    });

    totalDistributed += netAmount;
  }

  if (totalDistributed > 0) {
    events.push({
      type: 'npc_revenue',
      description: `NPC customers spent ${totalDistributed} CRD at ${buildings.length} businesses (import fees: ${totalImportFees} CRD)`,
      severity: 1,
      involvedAgents: [],
      cityId,
      tick,
    });
  }

  return { npcBudget, totalDistributed, importFees: totalImportFees, events };
}

// ============ STEP 6: PROCESS UPKEEP ============

async function processUpkeep(
  cityId: string,
  tick: number,
  treasuryAccountId: Types.ObjectId,
): Promise<{ events: EventInput[]; closedCount: number; openedCount: number }> {
  const events: EventInput[] = [];
  let closedCount = 0;
  let openedCount = 0;

  const buildings = await BuildingModel.find({
    cityId,
    status: 'active',
    operatingCost: { $gt: 0 },
  }).lean();

  for (const b of buildings) {
    if (!b.accountId) continue; // skip buildings without accounts
    const result = await ledger.transfer(
      b.accountId,
      treasuryAccountId,
      b.operatingCost,
      'operating_cost',
      tick,
      { buildingId: b._id as Types.ObjectId, reason: 'building upkeep' },
    );

    if (!result.ok) {
      // Building can't pay upkeep — temporarily close it
      await BuildingModel.updateOne(
        { _id: b._id },
        { status: 'temporarily_closed' },
      );
      closedCount++;

      events.push({
        type: 'building_closed',
        description: `${b.type} at (${b.worldX},${b.worldZ}) temporarily closed — insufficient funds for upkeep`,
        severity: 2,
        involvedAgents: [],
        buildingId: b._id as Types.ObjectId,
        cityId,
        tick,
      });
    }
  }

  // Reopen temporarily closed buildings that now have enough balance
  const closedBuildings = await BuildingModel.find({
    cityId,
    status: 'temporarily_closed',
  }).lean();

  for (const b of closedBuildings) {
    const account = await AccountModel.findById(b.accountId).lean();
    if (account && account.balance >= b.operatingCost) {
      await BuildingModel.updateOne(
        { _id: b._id },
        { status: 'active' },
      );
      openedCount++;

      events.push({
        type: 'building_opened',
        description: `${b.type} at (${b.worldX},${b.worldZ}) reopened — funds restored`,
        severity: 1,
        involvedAgents: [],
        buildingId: b._id as Types.ObjectId,
        cityId,
        tick,
      });
    }
  }

  return { events, closedCount, openedCount };
}

// ============ STEP 7: RELEASE JAILED AGENTS ============

async function releaseJailedAgents(
  cityId: string,
  tick: number,
): Promise<EventInput[]> {
  const events: EventInput[] = [];

  const jailed = await AgentModel.find({
    cityId,
    status: 'jailed',
    jailedAtTick: { $gt: 0 },
  }).lean();

  for (const agent of jailed) {
    if (tick - agent.jailedAtTick >= JAIL_TICKS) {
      await AgentModel.updateOne(
        { _id: agent._id },
        { status: 'active', jailedAtTick: 0 },
      );

      events.push({
        type: 'agent_released',
        description: `Agent ${agent.name} released from jail after serving ${JAIL_TICKS} ticks`,
        severity: 1,
        involvedAgents: [agent._id as Types.ObjectId],
        cityId,
        tick,
      });
    }
  }

  return events;
}

// ============ STEP 8: DECAY UNEMPLOYED REPUTATION ============

async function decayUnemployedRep(
  cityId: string,
  tick: number,
): Promise<void> {
  // Find active unemployed agents who haven't been active recently
  await AgentModel.updateMany(
    {
      cityId,
      status: 'active',
      employedAt: null,
      lastActiveTick: { $lte: tick - UNEMPLOYED_REP_DECAY_TICKS },
      reputation: { $gt: 0 },
    },
    { $inc: { reputation: -UNEMPLOYED_REP_DECAY_AMOUNT } },
  );

  // Clamp reputation to 0
  await AgentModel.updateMany(
    { cityId, reputation: { $lt: 0 } },
    { $set: { reputation: 0 } },
  );
}

// ============ STEP 9: CITY MANAGER TICK ============

async function cityManagerTick(
  cityId: string,
  tick: number,
  treasuryAccountId: Types.ObjectId,
): Promise<{ events: EventInput[]; affectedChunks: Array<{ chunkX: number; chunkZ: number }> }> {
  const events: EventInput[] = [];
  const affectedChunks: Array<{ chunkX: number; chunkZ: number }> = [];

  const totalAgents = await AgentModel.countDocuments({ cityId, status: 'active' });
  if (totalAgents === 0) return { events, affectedChunks };

  const unemployed = await AgentModel.countDocuments({
    cityId,
    status: 'active',
    employedAt: null,
  });
  const homeless = await AgentModel.countDocuments({
    cityId,
    status: 'active',
    homeId: null,
  });

  const recentCrimes = await EventModel.countDocuments({
    cityId,
    type: 'crime',
    tick: { $gte: tick - 10 },
  });

  const hasPoliceStation = (await BuildingModel.countDocuments({
    cityId,
    type: 'police_station',
    status: { $in: ['active', 'under_construction'] },
  })) > 0;

  const unemploymentRate = unemployed / totalAgents;
  const homelessRate = homeless / totalAgents;
  const crimeRate = recentCrimes / totalAgents;

  const actions = getCityManagerActions(
    unemploymentRate,
    totalAgents,
    homelessRate,
    crimeRate,
    hasPoliceStation,
  );

  // Execute at most 1 build action per tick to avoid spending sprees
  const action = actions[0];
  if (!action) return { events, affectedChunks };

  const catalog = getBuildingCatalog(action.buildType);
  if (!catalog) return { events, affectedChunks };

  // Check treasury can afford it
  const treasury = await AccountModel.findById(treasuryAccountId).lean();
  if (!treasury || treasury.balance < catalog.constructionCost) {
    return { events, affectedChunks };
  }

  // Find an empty buildable tile near city center
  // Scan chunks (0,0) → (1,0) → (0,1) → (1,1) → ... expanding outward
  const tile = await findEmptyBuildableTile(cityId, catalog.tileW, catalog.tileD);
  if (!tile) {
    return { events, affectedChunks };
  }

  const assetKey = catalog.glbModels[Math.floor(Math.random() * catalog.glbModels.length)];

  // Create building Account first
  const buildingAccount = await AccountModel.create({
    ownerType: 'building' as const,
    ownerId: new Types.ObjectId(), // placeholder, updated after building creation
    currency: 'CRD',
    balance: 0,
    reserved: 0,
    status: 'active' as const,
  });

  // Place building with spatial + economic fields in a single write
  const placeResult = await worldService.placeBuilding(cityId, {
    worldX: tile.worldX,
    worldZ: tile.worldZ,
    type: action.buildType,
    assetKey,
    rotY: 0,
    tileW: catalog.tileW,
    tileD: catalog.tileD,
    level: 1,
    accountId: buildingAccount._id.toString(),
    income: catalog.baseIncome,
    operatingCost: catalog.baseOperatingCost,
    maxEmployees: catalog.maxEmployees,
    glbModel: assetKey,
  });

  if (!placeResult.ok) {
    await AccountModel.deleteOne({ _id: buildingAccount._id });
    return { events, affectedChunks };
  }

  // Update account ownerId to point to the building document
  const building = await BuildingModel.findOne({ buildingId: placeResult.buildingId });
  if (building) {
    await AccountModel.updateOne(
      { _id: buildingAccount._id },
      { $set: { ownerId: building._id } },
    );
  }

  // Deduct construction cost from treasury
  await ledger.transfer(
    treasuryAccountId,
    buildingAccount._id as Types.ObjectId,
    catalog.constructionCost,
    'construction',
    tick,
    { reason: `City Manager built ${catalog.name}` },
  );

  const { chunkX: bChunkX, chunkZ: bChunkZ } = worldToChunk(tile.worldX, tile.worldZ);
  affectedChunks.push({ chunkX: bChunkX, chunkZ: bChunkZ });

  events.push({
    type: 'building_built',
    description: `City Manager built ${catalog.name} at (${tile.worldX},${tile.worldZ}) — ${action.reason}`,
    severity: 2,
    involvedAgents: [],
    cityId,
    tick,
  });

  return { events, affectedChunks };
}

/** Scan nearby chunks for an empty buildable tile that can fit a building footprint */
async function findEmptyBuildableTile(
  cityId: string,
  tileW: number,
  tileD: number,
  maxRadius = 3,
): Promise<{ worldX: number; worldZ: number } | null> {
  for (let r = 0; r <= maxRadius; r++) {
    for (let cx = -r; cx <= r; cx++) {
      for (let cz = -r; cz <= r; cz++) {
        if (Math.abs(cx) !== r && Math.abs(cz) !== r) continue; // only check ring border

        const baseX = cx * CHUNK_SIZE;
        const baseZ = cz * CHUNK_SIZE;

        // Iterate buildable blocks within this chunk
        for (let lx = 1; lx < CHUNK_SIZE; lx++) {
          if (lx % ROAD_INTERVAL === 0) continue;
          for (let lz = 1; lz < CHUNK_SIZE; lz++) {
            if (lz % ROAD_INTERVAL === 0) continue;

            const worldX = baseX + lx;
            const worldZ = baseZ + lz;

            // Check entire footprint is buildable
            let footprintOk = true;
            for (let dx = 0; dx < tileW && footprintOk; dx++) {
              for (let dz = 0; dz < tileD && footprintOk; dz++) {
                if (!isBuildable(worldX + dx, worldZ + dz)) {
                  footprintOk = false;
                }
              }
            }
            if (!footprintOk) continue;

            // Check no existing buildings occupy these tiles
            const footprintCoords = [];
            for (let dx = 0; dx < tileW; dx++) {
              for (let dz = 0; dz < tileD; dz++) {
                footprintCoords.push({ worldX: worldX + dx, worldZ: worldZ + dz });
              }
            }

            const occupied = await worldService.findOccupiedParcels(cityId, footprintCoords);
            if (occupied.length === 0) {
              return { worldX, worldZ };
            }
          }
        }
      }
    }
  }
  return null;
}

// ============ STEP 10: UPDATE ECONOMY STATS ============

interface PerTickEconomyData {
  npcBudget: number;
  npcDistributed: number;
  taxCollected: number;
  importFees: number;
  closedCount: number;
  openedCount: number;
}

async function updateEconomyStats(
  cityId: string,
  tick: number,
  treasuryAccountId: Types.ObjectId,
  perTick: PerTickEconomyData,
): Promise<TickEconomySnapshot> {
  // Agent counts by status
  const activeCount = await AgentModel.countDocuments({ cityId, status: 'active' });
  const jailedCount = await AgentModel.countDocuments({ cityId, status: 'jailed' });
  const totalAgents = activeCount + jailedCount;

  const unemployed = await AgentModel.countDocuments({
    cityId,
    status: 'active',
    employedAt: null,
  });

  const unemploymentRate = activeCount > 0 ? unemployed / activeCount : 0;

  // Money supply = sum of all account balances (excluding NPC pool)
  const supplyAgg = await AccountModel.aggregate([
    { $match: { ownerType: { $ne: 'npc_pool' } } },
    { $group: { _id: null, total: { $sum: '$balance' } } },
  ]);
  const moneySupply = supplyAgg[0]?.total ?? 0;

  // Crime rate (last 10 ticks)
  const recentCrimes = await EventModel.countDocuments({
    cityId,
    type: 'crime',
    tick: { $gte: tick - 10 },
  });
  const crimeRateLast10 = totalAgents > 0 ? recentCrimes / totalAgents : 0;

  // Treasury balance
  const treasury = await AccountModel.findById(treasuryAccountId).lean();
  const treasuryBalance = treasury?.balance ?? 0;

  // Season
  const season = getSeasonForTick(tick);

  // Average needs + reputation
  const agentAgg = await AgentModel.aggregate([
    { $match: { cityId, status: { $in: ['active', 'jailed'] } } },
    {
      $group: {
        _id: null,
        avgHunger: { $avg: '$needs.hunger' },
        avgRest: { $avg: '$needs.rest' },
        avgFun: { $avg: '$needs.fun' },
        avgRep: { $avg: '$reputation' },
      },
    },
  ]);
  const avgNeeds = {
    hunger: Math.round(agentAgg[0]?.avgHunger ?? 80),
    rest: Math.round(agentAgg[0]?.avgRest ?? 80),
    fun: Math.round(agentAgg[0]?.avgFun ?? 50),
  };
  const avgRep = Math.round(agentAgg[0]?.avgRep ?? 50);

  // Business counts
  const openBusinesses = await BuildingModel.countDocuments({
    cityId,
    status: 'active',
    income: { $gt: 0 },
  });
  const closedBusinesses = await BuildingModel.countDocuments({
    cityId,
    status: 'temporarily_closed',
  });

  // Cumulative outsideWorldCRD
  const cityDoc = await CityModel.findOne({ cityId }).lean();
  const outsideWorldCRD = cityDoc?.economy?.outsideWorldCRD ?? 0;

  // Active police count
  const policeCountActive = await AgentModel.countDocuments({
    cityId,
    profession: 'police',
    status: 'active',
  });

  // Update city model
  await CityModel.updateOne(
    { cityId },
    {
      tickCount: tick,
      season,
      'economy.moneySupply': moneySupply,
      'economy.unemploymentRate': unemploymentRate,
      'economy.crimeRate': crimeRateLast10,
    },
  );

  return {
    treasury: treasuryBalance,
    moneySupply,
    unemployment: unemploymentRate,
    crimeRate: crimeRateLast10,
    season,
    totalAgents,
    activeCount,
    jailedCount,
    avgNeeds,
    avgRep,
    crimeRateLast10,
    npcBudget: perTick.npcBudget,
    npcDistributed: perTick.npcDistributed,
    taxCollected: perTick.taxCollected,
    importFees: perTick.importFees,
    openBusinesses,
    closedBusinesses,
    outsideWorldCRD,
    policeCountActive,
  };
}
