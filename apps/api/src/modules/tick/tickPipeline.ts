/**
 * TickPipeline — 13-step city simulation tick (Sprint 2: closed-loop economy)
 *
 * (1)  decayNeeds
 * (2)  allocateDemandBudget (season start only)
 * (3)  paySalaries
 * (4)  collectTaxes
 * (5)  generateNpcRevenue (transfer from demand budget, no mint)
 * (6)  accumulate outsideWorldCRD
 * (7)  processUpkeep (accrual every tick, weekly settlement — S3.2)
 * (8)  collectLivingExpenses (weekly — S3.2)
 * (9)  releaseJailedAgents
 * (10) decayUnemployedRep
 * (11) cityManagerTick
 * (12) updateEconomyStats (with flow metrics)
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
  IMPORT_FEE_RATE,
  UNEMPLOYED_REP_DECAY_TICKS,
  UNEMPLOYED_REP_DECAY_AMOUNT,
  TAX_RATE_DEFAULT,
  JAIL_TICKS,
  SEASON_TICKS,
  LIVING_EXPENSE_AMOUNT,
  LIVING_EXPENSE_REP_PENALTY,
  DEMAND_BUDGET_BASE_RATE,
  DEMAND_BUDGET_MIN,
  DEMAND_BUDGET_MAX,
  TREASURY_BAND_LOW,
  WEEK_TICKS,
  SEASON_RAMP_TICKS,
  isWeekBoundary,
  getSeasonRampProgress,
  getBuildingCatalog,
} from '@agentropolis/shared';
import * as ledger from './ledgerService';
import { getSalaryBand, getBaseSalary, getSeasonForTick, getCityManagerActions } from './tickHelpers';
import { TreasuryBandTracker } from './treasuryBand';
import { getActivePolicy } from '../realtime/policyState';

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

/** Per-tick flow metrics for economy monitoring (S2.1) */
export interface TickFlowMetrics {
  mintedThisTick: number;
  sunkThisTick: number;
  wagesPaid: number;
  taxCollected: number;
  npcSpendingPaid: number;
  importFees: number;
  livingExpensesCollected: number;
  operatingCostsSunk: number;
  demandBudgetAllocated: number;
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
  // S2.1: Flow metrics
  flow: TickFlowMetrics;
  demandBudgetBalance: number;
  treasuryBand: 'crisis' | 'normal' | 'boom';
}

export interface TickResult {
  events: EventInput[];
  economySnapshot: TickEconomySnapshot;
  affectedChunks: Array<{ chunkX: number; chunkZ: number }>;
}

// ============ TREASURY BAND (smoothed with hysteresis — S3.4) ============

/** Singleton tracker — persists across ticks for moving average */
const treasuryBandTracker = new TreasuryBandTracker();

/** Export for external queries (e.g. decision engine, REST endpoints) */
export function getTreasuryBandTracker(): TreasuryBandTracker {
  return treasuryBandTracker;
}

// ============ PIPELINE ============

export async function runTick(
  cityId: string,
  tick: number,
  treasuryAccountId: Types.ObjectId,
  npcPoolAccountId: Types.ObjectId,
  demandBudgetAccountId: Types.ObjectId,
): Promise<TickResult> {
  const events: EventInput[] = [];
  const affectedChunks: Array<{ chunkX: number; chunkZ: number }> = [];
  const flow: TickFlowMetrics = {
    mintedThisTick: 0,
    sunkThisTick: 0,
    wagesPaid: 0,
    taxCollected: 0,
    npcSpendingPaid: 0,
    importFees: 0,
    livingExpensesCollected: 0,
    operatingCostsSunk: 0,
    demandBudgetAllocated: 0,
  };

  // (1) decayNeeds
  await decayNeeds(cityId);

  // (2) allocateDemandBudget — ramped over first SEASON_RAMP_TICKS of each season (S3.3)
  const tickInSeason = ((tick - 1) % SEASON_TICKS);
  if (tickInSeason < SEASON_RAMP_TICKS) {
    const allocResult = await allocateDemandBudget(cityId, tick, treasuryAccountId, demandBudgetAccountId, tickInSeason);
    flow.demandBudgetAllocated = allocResult.allocated;
    events.push(...allocResult.events);
  }

  // (3) paySalaries
  const salaryResult = await paySalaries(cityId, tick, treasuryAccountId);
  events.push(...salaryResult.events);
  flow.wagesPaid = salaryResult.totalPaid;

  // (4) collectTaxes
  const taxResult = await collectTaxes(cityId, tick, treasuryAccountId);
  events.push(...taxResult.events);
  flow.taxCollected = taxResult.totalTax;

  // (5) generateNpcRevenue (transfer from demand budget, NOT mint)
  const npcResult = await generateNpcRevenue(cityId, tick, demandBudgetAccountId, treasuryAccountId, npcPoolAccountId);
  events.push(...npcResult.events);
  flow.npcSpendingPaid = npcResult.totalDistributed;
  flow.importFees = npcResult.importFees;
  flow.sunkThisTick += npcResult.importFees;

  // (6) accumulate outsideWorldCRD on city
  if (npcResult.importFees > 0) {
    await CityModel.updateOne(
      { cityId },
      { $inc: { 'economy.outsideWorldCRD': npcResult.importFees } },
    );
  }

  // (7) processUpkeep — accrual every tick, settlement on week boundary (S3.2)
  const upkeepResult = await processUpkeep(cityId, tick, npcPoolAccountId);
  events.push(...upkeepResult.events);
  flow.operatingCostsSunk = upkeepResult.totalSunk;
  flow.sunkThisTick += upkeepResult.totalSunk;

  // (8) collectLivingExpenses — weekly (S3.2)
  if (isWeekBoundary(tick)) {
    const livingResult = await collectLivingExpenses(cityId, tick, npcPoolAccountId);
    events.push(...livingResult.events);
    flow.livingExpensesCollected = livingResult.totalCollected;
    flow.sunkThisTick += livingResult.totalCollected;
  }

  // (9) releaseJailedAgents
  const releaseEvents = await releaseJailedAgents(cityId, tick);
  events.push(...releaseEvents);

  // (10) decayUnemployedRep — weekly evaluation (S3.2)
  if (isWeekBoundary(tick)) {
    await decayUnemployedRep(cityId, tick);
  }

  // (11) cityManagerTick
  const managerResult = await cityManagerTick(cityId, tick, treasuryAccountId);
  events.push(...managerResult.events);
  affectedChunks.push(...managerResult.affectedChunks);

  // (12) updateEconomyStats
  const economySnapshot = await updateEconomyStats(cityId, tick, treasuryAccountId, demandBudgetAccountId, {
    npcBudget: npcResult.npcBudget,
    npcDistributed: npcResult.totalDistributed,
    taxCollected: taxResult.totalTax,
    importFees: npcResult.importFees,
    closedCount: upkeepResult.closedCount,
    openedCount: upkeepResult.openedCount,
    flow,
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

// ============ STEP 2: ALLOCATE DEMAND BUDGET (season start) ============

async function allocateDemandBudget(
  cityId: string,
  tick: number,
  treasuryAccountId: Types.ObjectId,
  demandBudgetAccountId: Types.ObjectId,
  tickInRamp: number,
): Promise<{ allocated: number; events: EventInput[] }> {
  const events: EventInput[] = [];

  const treasury = await AccountModel.findById(treasuryAccountId).lean();
  if (!treasury) return { allocated: 0, events };

  const band = treasuryBandTracker.getBand();
  const bandMult = treasuryBandTracker.getDemandMultiplier();

  // Calculate total season allocation: base rate of treasury, scaled by band, clamped
  const rawAllocation = Math.round(treasury.balance * DEMAND_BUDGET_BASE_RATE * bandMult);
  const totalSeasonAllocation = Math.min(DEMAND_BUDGET_MAX, Math.max(DEMAND_BUDGET_MIN, rawAllocation));

  // Ramp: spread allocation over SEASON_RAMP_TICKS installments (S3.3)
  // Each ramp tick gets an equal share of the total season allocation
  const installment = Math.round(totalSeasonAllocation / SEASON_RAMP_TICKS);

  // Don't allocate more than treasury can safely provide
  const finalInstallment = Math.min(installment, Math.max(0, treasury.balance - TREASURY_BAND_LOW));

  if (finalInstallment <= 0) {
    // Only report crisis on first ramp tick to avoid spam
    if (tickInRamp === 0) {
      events.push({
        type: 'economic_crisis',
        description: `Treasury too low to fund demand budget — NPC spending will stall`,
        severity: 3,
        involvedAgents: [],
        cityId,
        tick,
      });
    }
    return { allocated: 0, events };
  }

  const result = await ledger.transfer(
    treasuryAccountId,
    demandBudgetAccountId,
    finalInstallment,
    'demand_allocation',
    tick,
    { reason: `Season demand budget ramp ${tickInRamp + 1}/${SEASON_RAMP_TICKS} (${band} band, ${bandMult}x)` },
  );

  if (result.ok) {
    // Report at start and end of ramp
    if (tickInRamp === 0) {
      const season = getSeasonForTick(tick);
      events.push({
        type: 'npc_revenue',
        description: `${season} season starting — demand budget ramping: ${totalSeasonAllocation} CRD over ${SEASON_RAMP_TICKS} ticks (${band} economy)`,
        severity: 2,
        involvedAgents: [],
        cityId,
        tick,
      });
    }
    return { allocated: finalInstallment, events };
  }

  return { allocated: 0, events };
}

// ============ STEP 3: PAY SALARIES ============

async function paySalaries(
  cityId: string,
  tick: number,
  treasuryAccountId: Types.ObjectId,
): Promise<{ events: EventInput[]; totalPaid: number }> {
  const events: EventInput[] = [];

  // Find employed agents
  const employed = await AgentModel.find({
    cityId,
    status: 'active',
    employedAt: { $ne: null },
    profession: { $ne: 'shop_owner' },
  }).lean();

  if (employed.length === 0) return { events, totalPaid: 0 };

  // Get treasury balance for salary band calc
  const treasury = await AccountModel.findById(treasuryAccountId).lean();
  if (!treasury) return { events, totalPaid: 0 };

  const totalActiveAgents = await AgentModel.countDocuments({ cityId, status: 'active' });
  const band = getSalaryBand(treasury.balance, totalActiveAgents);

  let totalPaid = 0;

  for (const agent of employed) {
    // Check that the building is actually active — no salary for closed buildings
    const building = await BuildingModel.findById(agent.employedAt).lean();
    if (!building || building.status !== 'active') {
      // Fire agent from closed/missing building
      await AgentModel.updateOne(
        { _id: agent._id },
        { $set: { employedAt: null } },
      );
      continue;
    }

    const baseSalary = getBaseSalary(agent.profession);
    if (baseSalary <= 0) continue;

    // Need penalty: hunger < 20 → salary halved
    const hungerPenalty = agent.needs.hunger < 20 ? 0.5 : 1.0;
    const salary = Math.round(baseSalary * band.multiplier * hungerPenalty);

    const result = await ledger.transfer(
      treasuryAccountId,
      agent.accountId,
      salary,
      'salary',
      tick,
      { reason: `${agent.profession} salary (${band.label})${hungerPenalty < 1 ? ' [hungry]' : ''}` },
    );

    if (result.ok) {
      totalPaid += salary;
      // Increment workHours; REP +1 only if fun >= 20
      const repGain = agent.needs.fun < 20 ? 0 : 1;
      const repNew = Math.min(100, agent.reputation + repGain);
      await AgentModel.updateOne(
        { _id: agent._id },
        {
          $inc: { 'stats.workHours': 1 },
          $set: { lastActiveTick: tick, reputation: repNew },
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

  return { events, totalPaid };
}

// ============ STEP 4: COLLECT TAXES ============

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

    const effectiveTaxRate = TAX_RATE_DEFAULT + getActivePolicy().taxRateModifier;
    const taxAmount = Math.round(building.income * effectiveTaxRate);
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

// ============ STEP 5: GENERATE NPC REVENUE (demand budget transfer, no mint) ============

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
  demandBudgetAccountId: Types.ObjectId,
  treasuryAccountId: Types.ObjectId,
  npcPoolAccountId: Types.ObjectId,
): Promise<NpcRevenueResult> {
  const events: EventInput[] = [];

  // Check demand budget balance — this is the per-tick spending cap
  const budgetAccount = await AccountModel.findById(demandBudgetAccountId).lean();
  const budgetBalance = budgetAccount?.balance ?? 0;

  // Per-tick NPC spend = budget balance / remaining ticks in season
  // During season ramp, spending is scaled by ramp progress (S3.3)
  const rampProgress = getSeasonRampProgress(tick);
  const tickInSeasonNpc = ((tick - 1) % SEASON_TICKS) + 1;
  const remainingTicks = Math.max(1, SEASON_TICKS - tickInSeasonNpc + 1);
  const rawBudget = Math.round(budgetBalance / remainingTicks);
  const npcBudget = Math.min(budgetBalance, Math.round(rawBudget * rampProgress));

  if (npcBudget <= 0) {
    return { npcBudget: 0, totalDistributed: 0, importFees: 0, events };
  }

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

    // Deduct import fee as a sink (money leaves the system)
    const importFee = Math.round(grossAmount * IMPORT_FEE_RATE);
    const netAmount = grossAmount - importFee;
    totalImportFees += importFee;

    if (netAmount <= 0) continue;

    // Route: municipal buildings → treasury, owned buildings → building account
    const targetAccountId = w.ownerId ? w.accountId : treasuryAccountId;

    // Transfer from demand budget (NOT mint)
    const result = await ledger.transfer(
      demandBudgetAccountId,
      targetAccountId,
      netAmount,
      'npc_revenue',
      tick,
      {
        buildingId: w.buildingId,
        reason: w.ownerId ? 'NPC customer revenue' : 'Municipal NPC revenue → treasury',
      },
    );

    if (result.ok) {
      totalDistributed += netAmount;
    }
  }

  // Sink import fees from demand budget to NPC pool (money destruction)
  if (totalImportFees > 0) {
    await ledger.sink(demandBudgetAccountId, npcPoolAccountId, totalImportFees, 'import_fee', tick, {
      reason: 'NPC spending import fees',
    });
  }

  if (totalDistributed > 0) {
    events.push({
      type: 'npc_revenue',
      description: `NPC customers spent ${totalDistributed} CRD at ${buildings.length} businesses (import fees: ${totalImportFees} CRD, budget remaining: ${budgetBalance - totalDistributed - totalImportFees})`,
      severity: 1,
      involvedAgents: [],
      cityId,
      tick,
    });
  }

  return { npcBudget, totalDistributed, importFees: totalImportFees, events };
}

// ============ STEP 7: PROCESS UPKEEP (accrual every tick, settle weekly — S3.2) ============

async function processUpkeep(
  cityId: string,
  tick: number,
  npcPoolAccountId: Types.ObjectId,
): Promise<{ events: EventInput[]; closedCount: number; openedCount: number; totalSunk: number }> {
  const events: EventInput[] = [];
  let closedCount = 0;
  let openedCount = 0;
  let totalSunk = 0;

  const isSettlementDay = isWeekBoundary(tick);

  // Phase A: Accrue operating cost for all active buildings (every tick)
  await BuildingModel.updateMany(
    { cityId, status: 'active', operatingCost: { $gt: 0 } },
    [{ $set: { accruedUpkeep: { $add: ['$accruedUpkeep', '$operatingCost'] } } }],
  );

  // Phase B: Settlement — only on week boundaries
  if (isSettlementDay) {
    const buildings = await BuildingModel.find({
      cityId,
      status: 'active',
      accruedUpkeep: { $gt: 0 },
    }).lean();

    for (const b of buildings) {
      if (!b.accountId) continue;

      const amount = b.accruedUpkeep;

      // Operating cost is a SINK — money leaves the system (utilities, maintenance)
      const result = await ledger.sink(
        b.accountId,
        npcPoolAccountId,
        amount,
        'operating_cost',
        tick,
        { buildingId: b._id as Types.ObjectId, reason: `weekly upkeep settlement (${WEEK_TICKS} ticks accrued)` },
      );

      if (result.ok) {
        totalSunk += amount;
        // Reset accrued
        await BuildingModel.updateOne(
          { _id: b._id },
          { $set: { accruedUpkeep: 0, lastTouchedTick: tick } },
        );
      } else {
        // Building can't pay accrued upkeep — temporarily close it
        await BuildingModel.updateOne(
          { _id: b._id },
          { $set: { status: 'temporarily_closed', lastTouchedTick: tick, accruedUpkeep: 0 } },
        );
        closedCount++;

        events.push({
          type: 'building_closed',
          description: `${b.type} at (${b.worldX},${b.worldZ}) temporarily closed — insufficient funds for weekly upkeep (${amount} CRD)`,
          severity: 2,
          involvedAgents: [],
          buildingId: b._id as Types.ObjectId,
          cityId,
          tick,
        });
      }
    }

    // Phase C: Reopen temporarily closed buildings that now have enough balance
    const closedBuildings = await BuildingModel.find({
      cityId,
      status: 'temporarily_closed',
    }).lean();

    for (const b of closedBuildings) {
      const account = await AccountModel.findById(b.accountId).lean();
      // Reopen if they can cover at least one week's operating cost
      const weeklyUpkeep = b.operatingCost * WEEK_TICKS;
      if (account && account.balance >= weeklyUpkeep) {
        await BuildingModel.updateOne(
          { _id: b._id },
          { $set: { status: 'active', lastTouchedTick: tick } },
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
  }

  return { events, closedCount, openedCount, totalSunk };
}

// ============ STEP 8: COLLECT LIVING EXPENSES ============

async function collectLivingExpenses(
  cityId: string,
  tick: number,
  npcPoolAccountId: Types.ObjectId,
): Promise<{ events: EventInput[]; totalCollected: number }> {
  const events: EventInput[] = [];
  let totalCollected = 0;
  let paidCount = 0;
  let penaltyCount = 0;

  const agents = await AgentModel.find({
    cityId,
    status: 'active',
  }).lean();

  for (const agent of agents) {
    // Try to collect living expense (sink)
    const result = await ledger.sink(
      agent.accountId,
      npcPoolAccountId,
      LIVING_EXPENSE_AMOUNT,
      'living_expense',
      tick,
      { reason: 'periodic living expense' },
    );

    if (result.ok) {
      totalCollected += LIVING_EXPENSE_AMOUNT;
      paidCount++;
    } else {
      // Can't pay → reputation penalty
      const newRep = Math.max(0, agent.reputation - LIVING_EXPENSE_REP_PENALTY);
      await AgentModel.updateOne(
        { _id: agent._id },
        { $set: { reputation: newRep } },
      );
      penaltyCount++;
    }
  }

  if (totalCollected > 0 || penaltyCount > 0) {
    events.push({
      type: 'tax_collected',
      description: `Living expenses: ${paidCount} agents paid ${totalCollected} CRD${penaltyCount > 0 ? `, ${penaltyCount} couldn't pay (rep penalty)` : ''}`,
      severity: penaltyCount > 0 ? 2 : 1,
      involvedAgents: [],
      cityId,
      tick,
    });
  }

  return { events, totalCollected };
}

// ============ STEP 9: RELEASE JAILED AGENTS ============

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

// ============ STEP 10: DECAY UNEMPLOYED REPUTATION ============

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

  // Clamp reputation to 0..100
  await AgentModel.updateMany(
    { cityId, reputation: { $lt: 0 } },
    { $set: { reputation: 0 } },
  );
  await AgentModel.updateMany(
    { cityId, reputation: { $gt: 100 } },
    { $set: { reputation: 100 } },
  );
}

// ============ STEP 11: CITY MANAGER TICK ============

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

  // Count municipal (ownerless) buildings for hard cap + closed ratio
  const municipalBuildingCount = await BuildingModel.countDocuments({
    cityId,
    ownerId: null,
  });
  const closedMunicipalCount = await BuildingModel.countDocuments({
    cityId,
    ownerId: null,
    status: 'temporarily_closed',
  });

  const unemploymentRate = unemployed / totalAgents;
  const homelessRate = homeless / totalAgents;
  const crimeRate = recentCrimes / totalAgents;

  const actions = getCityManagerActions(
    unemploymentRate,
    totalAgents,
    homelessRate,
    crimeRate,
    hasPoliceStation,
    municipalBuildingCount,
    closedMunicipalCount,
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

  // Update account ownerId + lastTouchedTick on the building document
  const building = await BuildingModel.findOne({ buildingId: placeResult.buildingId });
  if (building) {
    await AccountModel.updateOne(
      { _id: buildingAccount._id },
      { $set: { ownerId: building._id } },
    );
    await BuildingModel.updateOne(
      { _id: building._id },
      { $set: { lastTouchedTick: tick } },
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

// ============ STEP 12: UPDATE ECONOMY STATS ============

interface PerTickEconomyData {
  npcBudget: number;
  npcDistributed: number;
  taxCollected: number;
  importFees: number;
  closedCount: number;
  openedCount: number;
  flow: TickFlowMetrics;
}

async function updateEconomyStats(
  cityId: string,
  tick: number,
  treasuryAccountId: Types.ObjectId,
  demandBudgetAccountId: Types.ObjectId,
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

  // Demand budget balance
  const demandBudget = await AccountModel.findById(demandBudgetAccountId).lean();
  const demandBudgetBalance = demandBudget?.balance ?? 0;

  // Treasury band (smoothed — feeds moving average each tick)
  const treasuryBand = treasuryBandTracker.update(treasuryBalance);

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
    flow: perTick.flow,
    demandBudgetBalance,
    treasuryBand,
  };
}
