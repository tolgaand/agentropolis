/**
 * ActionEngine — Server-authoritative agent action processing
 *
 * Handles: register, work, eat, sleep, relax, apply, crime
 * Each action validates state, mutates DB, returns result + side effects.
 */

import { Types } from 'mongoose';
import crypto from 'crypto';
import { AgentModel, AccountModel, BuildingModel, EventModel, type IAgent } from '@agentropolis/db';
import type {
  AgentRegisterPayload,
  AgentRegisterResponse,
  AgentActionPayload,
  AgentActionResponse,
  AgentActionType,
} from '@agentropolis/shared/contracts/v2';
import { isBuildable, worldToChunk } from '@agentropolis/shared/contracts/v2';
import {
  STARTING_MONEY,
  TILE_PRICE,
  THEFT_REWARD,
  BASE_CATCH_CHANCE,
  CATCH_CHANCE_PER_POLICE,
  JAIL_TICKS,
  getBuildingCatalog,
} from '@agentropolis/shared';
import * as ledger from '../tick/ledgerService';
import * as worldService from '../world/worldService';
import { buildAgentSnapshot } from './agentSnapshot';

// ============ TYPES ============

export interface ActionSideEffects {
  type: 'agent_joined' | 'agent_updated' | 'crime_committed' | 'crime_arrested';
  data: Record<string, unknown>;
}

export interface ActionResult {
  response: AgentActionResponse;
  sideEffects: ActionSideEffects[];
  /** Chunks affected by this action (need chunk:payload re-publish) */
  affectedChunks?: Array<{ chunkX: number; chunkZ: number }>;
  /** Extra diff data included in action:result (e.g. buildingId) */
  diff?: Record<string, unknown>;
}

// ============ COOLDOWN ============

/** agentId -> last action tick. One action per tick. */
const lastActionTick = new Map<string, number>();

function checkCooldown(agentId: string, currentTick: number): string | null {
  const last = lastActionTick.get(agentId);
  if (last !== undefined && last >= currentTick) {
    return 'cooldown_active';
  }
  return null;
}

function setCooldown(agentId: string, tick: number): void {
  lastActionTick.set(agentId, tick);
}

// Periodic cleanup (prevent memory leak for disconnected agents)
setInterval(() => {
  if (lastActionTick.size > 10000) {
    lastActionTick.clear();
  }
}, 60_000);

// ============ REGISTER ============

export async function handleRegister(
  payload: AgentRegisterPayload,
  cityId: string,
): Promise<{ response: AgentRegisterResponse; sideEffects: ActionSideEffects[] }> {
  const sideEffects: ActionSideEffects[] = [];

  // Validate name
  if (!payload.name || payload.name.trim().length < 2 || payload.name.trim().length > 32) {
    return { response: { ok: false, reason: 'invalid_name' }, sideEffects };
  }

  // Check name uniqueness
  const existing = await AgentModel.findOne({ name: payload.name.trim() }).lean();
  if (existing) {
    return { response: { ok: false, reason: 'name_taken' }, sideEffects };
  }

  // Generate API key
  const rawApiKey = crypto.randomBytes(24).toString('hex');
  const apiKeyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');

  // Create agent account with starting money
  const account = await AccountModel.create({
    ownerType: 'agent',
    ownerId: new Types.ObjectId(), // placeholder, updated after agent creation
    balance: STARTING_MONEY,
    reserved: 0,
    status: 'active',
  });

  // Create agent
  const agent = await AgentModel.create({
    name: payload.name.trim(),
    aiModel: payload.aiModel || 'unknown',
    profession: 'worker',
    career: payload.career || 'business',
    status: 'active',
    accountId: account._id,
    cityId,
    stats: { workHours: 0, crimeCount: 0, successfulThefts: 0, taxPaidTotal: 0 },
    needs: { hunger: 80, rest: 80, fun: 50 },
    jailedAtTick: 0,
    reputation: 50,
    qualifications: [],
    lastActiveTick: 0,
    apiKeyHash,
  });

  // Fix account ownerId to point to agent
  await AccountModel.updateOne({ _id: account._id }, { ownerId: agent._id });

  const snapshot = await buildAgentSnapshot(agent);

  sideEffects.push({
    type: 'agent_joined',
    data: { agent: snapshot, tick: 0 },
  });

  console.log(`[Agent] Registered: ${agent.name} (${agent._id})`);

  return {
    response: {
      ok: true,
      agentId: agent._id.toString(),
      apiKey: rawApiKey,
    },
    sideEffects,
  };
}

// ============ ACTION DISPATCHER ============

export async function handleAction(
  payload: AgentActionPayload,
  cityId: string,
  currentTick: number,
  treasuryAccountId: Types.ObjectId,
  _npcPoolAccountId: Types.ObjectId,
): Promise<ActionResult> {
  const sideEffects: ActionSideEffects[] = [];

  // Validate agent exists
  const agent = await AgentModel.findById(payload.agentId);
  if (!agent || agent.cityId !== cityId) {
    return { response: { ok: false, reason: 'agent_not_found' }, sideEffects };
  }

  // Check jailed
  if (agent.status === 'jailed') {
    return { response: { ok: false, reason: 'agent_jailed' }, sideEffects };
  }

  // Check cooldown (1 action per tick)
  const cooldownErr = checkCooldown(payload.agentId, currentTick);
  if (cooldownErr) {
    return { response: { ok: false, reason: cooldownErr }, sideEffects };
  }

  // Dispatch by action type
  let result: ActionResult;

  switch (payload.type) {
    case 'work':
      result = await handleWork(agent, cityId, currentTick, treasuryAccountId, sideEffects);
      break;
    case 'eat':
      result = await handleEat(agent, cityId, currentTick, sideEffects);
      break;
    case 'sleep':
      result = await handleSleep(agent, cityId, currentTick, sideEffects);
      break;
    case 'relax':
      result = await handleRelax(agent, cityId, currentTick, sideEffects);
      break;
    case 'apply':
      result = await handleApply(agent, cityId, currentTick, payload.targetBuildingId, sideEffects);
      break;
    case 'crime':
      result = await handleCrime(agent, cityId, currentTick, payload.targetAgentId, treasuryAccountId, sideEffects);
      break;
    case 'buy_parcel':
      result = await handleBuyParcel(agent, cityId, currentTick, payload, sideEffects);
      break;
    case 'build':
      result = await handleBuild(agent, cityId, currentTick, payload, sideEffects);
      break;
    case 'upgrade':
      result = await handleUpgrade(agent, cityId, currentTick, payload.targetBuildingId, sideEffects);
      break;
    default:
      return { response: { ok: false, reason: 'unknown_action_type' }, sideEffects };
  }

  if (result.response.ok) {
    setCooldown(payload.agentId, currentTick);
  }

  return result;
}

// ============ ACTION: WORK ============

async function handleWork(
  agent: IAgent,
  _cityId: string,
  tick: number,
  _treasuryAccountId: Types.ObjectId,
  sideEffects: ActionSideEffects[],
): Promise<ActionResult> {
  if (!agent.employedAt) {
    return { response: { ok: false, reason: 'not_employed' }, sideEffects };
  }

  // Needs penalty: low hunger/rest reduces salary effectiveness
  const hungerRestPenalty = Math.min(agent.needs.hunger, agent.needs.rest) < 20 ? 0.5 : 1.0;
  // fun<20 → rep gain 0
  const repGain = agent.needs.fun < 20 ? 0 : Math.ceil(1 * hungerRestPenalty);

  const prevNeeds = { ...agent.needs };

  // Increment work hours + rep
  await AgentModel.updateOne(
    { _id: agent._id },
    {
      $inc: {
        'stats.workHours': 1,
        reputation: repGain,
        'needs.hunger': -3,
        'needs.rest': -5,
      },
      $set: { lastActiveTick: tick },
    },
  );

  // Clamp needs
  await clampNeeds(agent._id);

  const updatedAgent = await AgentModel.findById(agent._id);
  if (!updatedAgent) {
    return { response: { ok: false, reason: 'agent_not_found' }, sideEffects };
  }

  const snapshot = await buildAgentSnapshot(updatedAgent);

  const penalties: string[] = [];
  if (hungerRestPenalty < 1) penalties.push('exhausted');
  if (agent.needs.fun < 20) penalties.push('bored (no rep)');

  const outcome = penalties.length > 0
    ? `${agent.name} worked but was ${penalties.join(', ')}`
    : `${agent.name} worked a shift (+1 workHour, +${repGain} rep)`;

  sideEffects.push({
    type: 'agent_updated',
    data: { agent: snapshot, action: 'work' as AgentActionType, outcome, tick },
  });

  const diff: Record<string, unknown> = {
    workHours: 1,
    reputation: repGain,
    needs: {
      hunger: updatedAgent.needs.hunger - prevNeeds.hunger,
      rest: updatedAgent.needs.rest - prevNeeds.rest,
    },
  };

  return { response: { ok: true, agent: snapshot, outcome }, sideEffects, diff };
}

// ============ ACTION: EAT ============

async function handleEat(
  agent: IAgent,
  _cityId: string,
  tick: number,
  sideEffects: ActionSideEffects[],
): Promise<ActionResult> {
  // Eating costs 5 CRD, restores 25 hunger
  const FOOD_COST = 5;
  const HUNGER_RESTORE = 25;

  // Check if agent can afford food
  const account = await AccountModel.findById(agent.accountId).lean();
  if (!account || account.balance < FOOD_COST) {
    return { response: { ok: false, reason: 'insufficient_funds' }, sideEffects };
  }

  const prevHunger = agent.needs.hunger;

  // Deduct money (sink — money goes to NPC economy)
  await AccountModel.updateOne(
    { _id: agent.accountId },
    { $inc: { balance: -FOOD_COST } },
  );

  // Restore hunger
  await AgentModel.updateOne(
    { _id: agent._id },
    {
      $inc: { 'needs.hunger': HUNGER_RESTORE },
      $set: { lastActiveTick: tick },
    },
  );

  // Clamp hunger to 100
  await AgentModel.updateMany(
    { _id: agent._id, 'needs.hunger': { $gt: 100 } },
    { $set: { 'needs.hunger': 100 } },
  );

  const updatedAgent = await AgentModel.findById(agent._id);
  if (!updatedAgent) {
    return { response: { ok: false, reason: 'agent_not_found' }, sideEffects };
  }

  const snapshot = await buildAgentSnapshot(updatedAgent);
  const outcome = `${agent.name} ate a meal (-${FOOD_COST} CRD, +${HUNGER_RESTORE} hunger)`;

  sideEffects.push({
    type: 'agent_updated',
    data: { agent: snapshot, action: 'eat' as AgentActionType, outcome, tick },
  });

  const diff: Record<string, unknown> = {
    balance: -FOOD_COST,
    needs: { hunger: updatedAgent.needs.hunger - prevHunger },
  };

  return { response: { ok: true, agent: snapshot, outcome }, sideEffects, diff };
}

// ============ ACTION: SLEEP ============

async function handleSleep(
  agent: IAgent,
  _cityId: string,
  tick: number,
  sideEffects: ActionSideEffects[],
): Promise<ActionResult> {
  // Sleep restores 30 rest, costs 2 hunger
  const REST_RESTORE = 30;

  const prevNeeds = { ...agent.needs };

  await AgentModel.updateOne(
    { _id: agent._id },
    {
      $inc: { 'needs.rest': REST_RESTORE, 'needs.hunger': -2 },
      $set: { lastActiveTick: tick },
    },
  );

  await clampNeeds(agent._id);

  const updatedAgent = await AgentModel.findById(agent._id);
  if (!updatedAgent) {
    return { response: { ok: false, reason: 'agent_not_found' }, sideEffects };
  }

  const snapshot = await buildAgentSnapshot(updatedAgent);
  const outcome = `${agent.name} slept (+${REST_RESTORE} rest)`;

  sideEffects.push({
    type: 'agent_updated',
    data: { agent: snapshot, action: 'sleep' as AgentActionType, outcome, tick },
  });

  const diff: Record<string, unknown> = {
    needs: {
      rest: updatedAgent.needs.rest - prevNeeds.rest,
      hunger: updatedAgent.needs.hunger - prevNeeds.hunger,
    },
  };

  return { response: { ok: true, agent: snapshot, outcome }, sideEffects, diff };
}

// ============ ACTION: RELAX ============

async function handleRelax(
  agent: IAgent,
  _cityId: string,
  tick: number,
  sideEffects: ActionSideEffects[],
): Promise<ActionResult> {
  // Relax restores 20 fun, costs 3 CRD
  const FUN_RESTORE = 20;
  const RELAX_COST = 3;

  const account = await AccountModel.findById(agent.accountId).lean();
  if (!account || account.balance < RELAX_COST) {
    return { response: { ok: false, reason: 'insufficient_funds' }, sideEffects };
  }

  const prevFun = agent.needs.fun;

  await AccountModel.updateOne(
    { _id: agent.accountId },
    { $inc: { balance: -RELAX_COST } },
  );

  await AgentModel.updateOne(
    { _id: agent._id },
    {
      $inc: { 'needs.fun': FUN_RESTORE },
      $set: { lastActiveTick: tick },
    },
  );

  await clampNeeds(agent._id);

  const updatedAgent = await AgentModel.findById(agent._id);
  if (!updatedAgent) {
    return { response: { ok: false, reason: 'agent_not_found' }, sideEffects };
  }

  const snapshot = await buildAgentSnapshot(updatedAgent);
  const outcome = `${agent.name} relaxed (-${RELAX_COST} CRD, +${FUN_RESTORE} fun)`;

  sideEffects.push({
    type: 'agent_updated',
    data: { agent: snapshot, action: 'relax' as AgentActionType, outcome, tick },
  });

  const diff: Record<string, unknown> = {
    balance: -RELAX_COST,
    needs: { fun: updatedAgent.needs.fun - prevFun },
  };

  return { response: { ok: true, agent: snapshot, outcome }, sideEffects, diff };
}

// ============ ACTION: APPLY ============

async function handleApply(
  agent: IAgent,
  cityId: string,
  tick: number,
  targetBuildingId: string | undefined,
  sideEffects: ActionSideEffects[],
): Promise<ActionResult> {
  if (!targetBuildingId) {
    return { response: { ok: false, reason: 'missing_target_building' }, sideEffects };
  }

  // Already employed
  if (agent.employedAt) {
    return { response: { ok: false, reason: 'already_employed' }, sideEffects };
  }

  const building = await BuildingModel.findById(targetBuildingId);
  if (!building || building.cityId !== cityId) {
    return { response: { ok: false, reason: 'building_not_found' }, sideEffects };
  }

  if (building.status !== 'active') {
    return { response: { ok: false, reason: 'building_not_active' }, sideEffects };
  }

  if (building.employees.length >= building.maxEmployees) {
    return { response: { ok: false, reason: 'no_vacancy' }, sideEffects };
  }

  // Check if agent's profession is compatible
  // Workers can always apply — that's how they get hired and promoted
  const catalog = (await import('@agentropolis/shared')).getBuildingCatalog(building.type);
  if (
    catalog &&
    catalog.professions.length > 0 &&
    agent.profession !== 'worker' &&
    !catalog.professions.includes(agent.profession)
  ) {
    return { response: { ok: false, reason: 'profession_mismatch' }, sideEffects };
  }

  // Hire the agent
  await BuildingModel.updateOne(
    { _id: building._id },
    { $push: { employees: agent._id } },
  );

  await AgentModel.updateOne(
    { _id: agent._id },
    {
      employedAt: building._id,
      $set: { lastActiveTick: tick },
    },
  );

  const updatedAgent = await AgentModel.findById(agent._id);
  if (!updatedAgent) {
    return { response: { ok: false, reason: 'agent_not_found' }, sideEffects };
  }

  const snapshot = await buildAgentSnapshot(updatedAgent);
  const outcome = `${agent.name} was hired at ${building.type} (${building.worldX},${building.worldZ})`;

  sideEffects.push({
    type: 'agent_updated',
    data: { agent: snapshot, action: 'apply' as AgentActionType, outcome, tick },
  });

  console.log(`[Agent] ${agent.name} hired at ${building.type} (${building._id})`);

  return { response: { ok: true, agent: snapshot, outcome }, sideEffects };
}

// ============ ACTION: CRIME ============

/**
 * Reputation-based catch chance multiplier.
 * High rep → harder to catch (0.7), low rep → much easier (1.6).
 */
function getRepMultiplier(rep: number): number {
  if (rep >= 70) return 0.7;
  if (rep >= 40) return 1.0;
  if (rep >= 20) return 1.3;
  return 1.6;
}

async function handleCrime(
  agent: IAgent,
  cityId: string,
  tick: number,
  targetAgentId: string | undefined,
  treasuryAccountId: Types.ObjectId,
  sideEffects: ActionSideEffects[],
): Promise<ActionResult> {
  // Resolve victim: can target agent directly OR building owner
  let victimAgent: IAgent | null = null;
  let targetLabel = '';

  if (targetAgentId) {
    victimAgent = await AgentModel.findById(targetAgentId);
    if (!victimAgent || victimAgent.cityId !== cityId) {
      return { response: { ok: false, reason: 'victim_not_found' }, sideEffects };
    }
    if (victimAgent.status !== 'active') {
      return { response: { ok: false, reason: 'victim_not_active' }, sideEffects };
    }
    targetLabel = victimAgent.name;
  } else {
    return { response: { ok: false, reason: 'missing_target' }, sideEffects };
  }

  // Calculate catch chance with rep multiplier
  const policeCount = await AgentModel.countDocuments({
    cityId,
    profession: 'police',
    status: 'active',
  });

  const baseCatch = Math.min(0.9, BASE_CATCH_CHANCE + policeCount * CATCH_CHANCE_PER_POLICE);
  const repMultiplier = getRepMultiplier(agent.reputation);
  let catchChance = baseCatch * repMultiplier;

  // Fatigue penalty: rest < 20 → +0.1
  if (agent.needs.rest < 20) {
    catchChance += 0.1;
  }

  catchChance = Math.min(0.95, catchChance);

  const caught = Math.random() < catchChance;
  const repBefore = agent.reputation;

  // Record crime event (every attempt)
  await EventModel.create({
    type: 'crime',
    involvedAgents: [agent._id, victimAgent._id],
    cityId,
    severity: 2,
    resolved: caught,
    description: `${agent.name} attempted theft against ${targetLabel}`,
    tick,
  });

  // Update crimeCount + lastCrimeTick on actor
  await AgentModel.updateOne(
    { _id: agent._id },
    {
      $inc: { 'stats.crimeCount': 1 },
      $set: { lastActiveTick: tick, 'stats.lastCrimeTick': tick },
    },
  );

  if (caught) {
    // ---- CAUGHT: fine + jail + rep -10 ----
    const actorAccount = await AccountModel.findById(agent.accountId).lean();
    const actorBalance = actorAccount?.balance ?? 0;
    const fineAmount = Math.max(1, Math.round(actorBalance * 0.20));

    // Collect fine → treasury
    await ledger.transfer(
      agent.accountId,
      treasuryAccountId,
      fineAmount,
      'fine',
      tick,
      { reason: 'theft fine' },
    );

    // Jail the agent + rep -10
    const repPenalty = Math.min(agent.reputation, 10); // clamp so rep doesn't go negative
    await AgentModel.updateOne(
      { _id: agent._id },
      {
        status: 'jailed',
        jailedAtTick: tick,
        $inc: { reputation: -repPenalty },
      },
    );

    const updatedAgent = await AgentModel.findById(agent._id);
    if (!updatedAgent) {
      return { response: { ok: false, reason: 'agent_not_found' }, sideEffects };
    }

    const snapshot = await buildAgentSnapshot(updatedAgent);

    sideEffects.push({
      type: 'crime_committed',
      data: {
        perpetratorId: agent._id.toString(),
        perpetratorName: agent.name,
        victimId: victimAgent._id.toString(),
        victimName: victimAgent.name,
        amount: 0,
        caught: true,
        tick,
      },
    });

    sideEffects.push({
      type: 'crime_arrested',
      data: {
        agentId: agent._id.toString(),
        agentName: agent.name,
        fineAmount,
        jailTicks: JAIL_TICKS,
        tick,
      },
    });

    const outcome = `${agent.name} caught stealing from ${targetLabel}, fined ${fineAmount} CRD, jailed ${JAIL_TICKS} ticks`;
    console.log(`[Crime] ${outcome}`);

    return {
      response: { ok: true, agent: snapshot, outcome },
      sideEffects,
      diff: {
        balance: -fineAmount,
        reputation: -(repPenalty),
        repBefore,
        repAfter: repBefore - repPenalty,
        catchChance,
        caught: true,
        fineAmount,
      },
    };
  } else {
    // ---- ESCAPED: steal + rep -3 ----
    const victimAccount = await AccountModel.findById(victimAgent.accountId).lean();
    const victimBalance = victimAccount?.balance ?? 0;
    const stealAmount = Math.min(THEFT_REWARD, Math.round(victimBalance * 0.15));

    if (stealAmount > 0) {
      await ledger.transfer(
        victimAgent.accountId,
        agent.accountId,
        stealAmount,
        'crime_income',
        tick,
        { reason: 'theft' },
      );
    }

    // Rep -3 + successfulThefts++
    const repLoss = Math.min(agent.reputation, 3);
    await AgentModel.updateOne(
      { _id: agent._id },
      {
        $inc: { 'stats.successfulThefts': 1, reputation: -repLoss },
      },
    );

    const updatedAgent = await AgentModel.findById(agent._id);
    if (!updatedAgent) {
      return { response: { ok: false, reason: 'agent_not_found' }, sideEffects };
    }

    const snapshot = await buildAgentSnapshot(updatedAgent);

    sideEffects.push({
      type: 'crime_committed',
      data: {
        perpetratorId: agent._id.toString(),
        perpetratorName: agent.name,
        victimId: victimAgent._id.toString(),
        victimName: victimAgent.name,
        amount: stealAmount,
        caught: false,
        tick,
      },
    });

    const outcome = `${agent.name} stole ${stealAmount} CRD from ${targetLabel} and escaped`;
    console.log(`[Crime] ${outcome}`);

    return {
      response: { ok: true, agent: snapshot, outcome },
      sideEffects,
      diff: {
        balance: stealAmount,
        reputation: -repLoss,
        repBefore,
        repAfter: repBefore - repLoss,
        catchChance,
        caught: false,
        stolen: stealAmount,
      },
    };
  }
}

// ============ ACTION: BUY PARCEL ============

async function handleBuyParcel(
  agent: IAgent,
  cityId: string,
  tick: number,
  payload: AgentActionPayload,
  sideEffects: ActionSideEffects[],
): Promise<ActionResult> {
  if (payload.worldX === undefined || payload.worldZ === undefined) {
    return { response: { ok: false, reason: 'missing_coordinates' }, sideEffects };
  }

  const { worldX, worldZ } = payload;

  // Check tile is buildable (not a road)
  if (!isBuildable(worldX, worldZ)) {
    return { response: { ok: false, reason: 'not_buildable' }, sideEffects };
  }

  // Check agent can afford the parcel
  const account = await AccountModel.findById(agent.accountId).lean();
  if (!account || account.balance < TILE_PRICE) {
    return { response: { ok: false, reason: 'insufficient_funds' }, sideEffects };
  }

  // Use worldService.buyParcel (checks already-owned internally)
  const buyResult = await worldService.buyParcel(
    cityId,
    worldX,
    worldZ,
    agent._id.toString(),
  );

  if (!buyResult.ok) {
    return { response: { ok: false, reason: buyResult.reason ?? 'buy_failed' }, sideEffects };
  }

  // Deduct money (sink to NPC economy for now)
  await AccountModel.updateOne(
    { _id: agent.accountId },
    { $inc: { balance: -TILE_PRICE } },
  );

  await AgentModel.updateOne(
    { _id: agent._id },
    { $set: { lastActiveTick: tick } },
  );

  const updatedAgent = await AgentModel.findById(agent._id);
  if (!updatedAgent) {
    return { response: { ok: false, reason: 'agent_not_found' }, sideEffects };
  }

  const snapshot = await buildAgentSnapshot(updatedAgent);
  const outcome = `${agent.name} bought parcel at (${worldX},${worldZ}) for ${TILE_PRICE} CRD`;

  sideEffects.push({
    type: 'agent_updated',
    data: { agent: snapshot, action: 'buy_parcel' as AgentActionType, outcome, tick },
  });

  const { chunkX, chunkZ } = worldToChunk(worldX, worldZ);

  return {
    response: { ok: true, agent: snapshot, outcome },
    sideEffects,
    affectedChunks: [{ chunkX, chunkZ }],
    diff: { worldX, worldZ, price: TILE_PRICE },
  };
}

// ============ ACTION: BUILD ============

async function handleBuild(
  agent: IAgent,
  cityId: string,
  tick: number,
  payload: AgentActionPayload,
  sideEffects: ActionSideEffects[],
): Promise<ActionResult> {
  if (payload.worldX === undefined || payload.worldZ === undefined) {
    return { response: { ok: false, reason: 'missing_coordinates' }, sideEffects };
  }
  if (!payload.buildingType) {
    return { response: { ok: false, reason: 'missing_building_type' }, sideEffects };
  }

  const { worldX, worldZ, buildingType } = payload;

  // Look up catalog
  const catalog = getBuildingCatalog(buildingType);
  if (!catalog) {
    return { response: { ok: false, reason: 'unknown_building_type' }, sideEffects };
  }

  // Check agent can afford construction
  const account = await AccountModel.findById(agent.accountId).lean();
  if (!account || account.balance < catalog.constructionCost) {
    return { response: { ok: false, reason: 'insufficient_funds' }, sideEffects };
  }

  // Pick asset key: use provided or first from catalog
  const assetKey = payload.assetKey ?? catalog.glbModels[0];
  if (!assetKey) {
    return { response: { ok: false, reason: 'no_asset_available' }, sideEffects };
  }

  // Create a building Account for economic operations (NPC revenue, upkeep, salary)
  const buildingAccount = await AccountModel.create({
    ownerType: 'building',
    ownerId: new Types.ObjectId(), // placeholder, updated after building creation
    currency: 'CRD',
    balance: 0,
    reserved: 0,
    status: 'active',
  });

  // Place building with spatial + economic fields in a single write
  const placeResult = await worldService.placeBuilding(cityId, {
    worldX,
    worldZ,
    type: buildingType,
    assetKey,
    rotY: payload.rotY ?? 0,
    tileW: catalog.tileW,
    tileD: catalog.tileD,
    level: 1,
    ownerId: agent._id.toString(),
    accountId: buildingAccount._id.toString(),
    income: catalog.baseIncome,
    operatingCost: catalog.baseOperatingCost,
    maxEmployees: catalog.maxEmployees,
    glbModel: assetKey,
  });

  if (!placeResult.ok) {
    // Clean up the pre-created account
    await AccountModel.deleteOne({ _id: buildingAccount._id });
    return {
      response: { ok: false, reason: placeResult.reason ?? 'placement_failed' },
      sideEffects,
    };
  }

  // Update account ownerId to point to the building document
  const building = await BuildingModel.findOne({ buildingId: placeResult.buildingId });
  if (building) {
    await AccountModel.updateOne(
      { _id: buildingAccount._id },
      { $set: { ownerId: building._id } },
    );
  }

  // Deduct construction cost
  await AccountModel.updateOne(
    { _id: agent.accountId },
    { $inc: { balance: -catalog.constructionCost } },
  );

  await AgentModel.updateOne(
    { _id: agent._id },
    { $set: { lastActiveTick: tick } },
  );

  // Record event
  await EventModel.create({
    type: 'building_built',
    involvedAgents: [agent._id],
    cityId,
    severity: 1,
    resolved: true,
    description: `${agent.name} built ${catalog.name} at (${worldX},${worldZ})`,
    tick,
  });

  const updatedAgent = await AgentModel.findById(agent._id);
  if (!updatedAgent) {
    return { response: { ok: false, reason: 'agent_not_found' }, sideEffects };
  }

  const snapshot = await buildAgentSnapshot(updatedAgent);
  const outcome = `${agent.name} built ${catalog.name} at (${worldX},${worldZ}) for ${catalog.constructionCost} CRD`;

  sideEffects.push({
    type: 'agent_updated',
    data: { agent: snapshot, action: 'build' as AgentActionType, outcome, tick },
  });

  const { chunkX, chunkZ } = worldToChunk(worldX, worldZ);

  return {
    response: { ok: true, agent: snapshot, outcome },
    sideEffects,
    affectedChunks: [{ chunkX, chunkZ }],
    diff: { buildingId: placeResult.buildingId, worldX, worldZ, buildingType, cost: catalog.constructionCost },
  };
}

// ============ ACTION: UPGRADE ============

async function handleUpgrade(
  agent: IAgent,
  cityId: string,
  tick: number,
  targetBuildingId: string | undefined,
  sideEffects: ActionSideEffects[],
): Promise<ActionResult> {
  if (!targetBuildingId) {
    return { response: { ok: false, reason: 'missing_target_building' }, sideEffects };
  }

  const building = await BuildingModel.findById(targetBuildingId);
  if (!building || building.cityId !== cityId) {
    return { response: { ok: false, reason: 'building_not_found' }, sideEffects };
  }

  // Only owner can upgrade
  if (!building.ownerId || building.ownerId.toString() !== agent._id.toString()) {
    return { response: { ok: false, reason: 'not_owner' }, sideEffects };
  }

  // Upgrade cost = constructionCost × current level
  const catalog = getBuildingCatalog(building.type);
  const upgradeCost = (catalog?.constructionCost ?? 100) * building.level;

  const account = await AccountModel.findById(agent.accountId).lean();
  if (!account || account.balance < upgradeCost) {
    return { response: { ok: false, reason: 'insufficient_funds' }, sideEffects };
  }

  // Deduct cost
  await AccountModel.updateOne(
    { _id: agent.accountId },
    { $inc: { balance: -upgradeCost } },
  );

  // Increment building level + scale economic output
  const newIncome = Math.round(building.income * 1.3);
  const newOperatingCost = Math.round(building.operatingCost * 1.1);
  await BuildingModel.updateOne(
    { _id: building._id },
    {
      $inc: { level: 1 },
      $set: { income: newIncome, operatingCost: newOperatingCost },
    },
  );

  await AgentModel.updateOne(
    { _id: agent._id },
    { $set: { lastActiveTick: tick } },
  );

  const updatedAgent = await AgentModel.findById(agent._id);
  if (!updatedAgent) {
    return { response: { ok: false, reason: 'agent_not_found' }, sideEffects };
  }

  const snapshot = await buildAgentSnapshot(updatedAgent);
  const newLevel = building.level + 1;
  const outcome = `${agent.name} upgraded ${building.type} to level ${newLevel} for ${upgradeCost} CRD`;

  sideEffects.push({
    type: 'agent_updated',
    data: { agent: snapshot, action: 'upgrade' as AgentActionType, outcome, tick },
  });

  const { chunkX, chunkZ } = worldToChunk(building.worldX, building.worldZ);

  return {
    response: { ok: true, agent: snapshot, outcome },
    sideEffects,
    affectedChunks: [{ chunkX, chunkZ }],
    diff: { buildingId: targetBuildingId, newLevel, cost: upgradeCost },
  };
}

// ============ HELPERS ============

async function clampNeeds(agentId: Types.ObjectId): Promise<void> {
  // Clamp to [0, 100]
  await AgentModel.updateMany(
    { _id: agentId, 'needs.hunger': { $lt: 0 } },
    { $set: { 'needs.hunger': 0 } },
  );
  await AgentModel.updateMany(
    { _id: agentId, 'needs.rest': { $lt: 0 } },
    { $set: { 'needs.rest': 0 } },
  );
  await AgentModel.updateMany(
    { _id: agentId, 'needs.fun': { $lt: 0 } },
    { $set: { 'needs.fun': 0 } },
  );
  await AgentModel.updateMany(
    { _id: agentId, 'needs.hunger': { $gt: 100 } },
    { $set: { 'needs.hunger': 100 } },
  );
  await AgentModel.updateMany(
    { _id: agentId, 'needs.rest': { $gt: 100 } },
    { $set: { 'needs.rest': 100 } },
  );
  await AgentModel.updateMany(
    { _id: agentId, 'needs.fun': { $gt: 100 } },
    { $set: { 'needs.fun': 100 } },
  );
}
