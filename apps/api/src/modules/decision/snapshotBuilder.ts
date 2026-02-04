/**
 * SnapshotBuilder — Constructs DecisionSnapshotV1 for decision providers.
 *
 * Reads agent state, account balance, city metrics, and nearby buildings
 * to produce a compact context object for AI decision-making.
 */

import { AccountModel, BuildingModel } from '@agentropolis/db';
import type { IAgent } from '@agentropolis/db';
import type { CityMetricsPayload } from '@agentropolis/shared/contracts/v2';
import type { DecisionSnapshotV1 } from './types';

/** Accepts both Mongoose documents and lean objects */
type AgentLike = IAgent | (Pick<IAgent, 'name' | 'profession' | 'status' | 'reputation' | 'needs' | 'stats' | 'employedAt' | 'homeId' | 'accountId' | 'cityId'> & { _id: { toString(): string } });

const NEARBY_BUILDING_LIMIT = 20;

export async function buildDecisionSnapshot(
  agent: AgentLike,
  tick: number,
  cityMetrics: CityMetricsPayload | null,
): Promise<DecisionSnapshotV1> {
  // Fetch agent balance
  const account = await AccountModel.findById(agent.accountId).lean();
  const balance = account?.balance ?? 0;

  // Fetch nearby buildings in agent's chunk (or all active if no chunk context)
  const nearbyBuildings = await BuildingModel.find({
    cityId: agent.cityId,
    status: 'active',
  })
    .limit(NEARBY_BUILDING_LIMIT)
    .lean();

  return {
    version: 1,
    agentId: agent._id.toString(),
    tick,
    agent: {
      name: agent.name,
      profession: agent.profession,
      status: agent.status,
      reputation: agent.reputation,
      needs: agent.needs ?? { hunger: 80, rest: 80, fun: 50 },
      stats: agent.stats ?? { workHours: 0, crimeCount: 0, successfulThefts: 0, taxPaidTotal: 0, lastCrimeTick: 0 },
      balance,
      employedAt: agent.employedAt?.toString(),
      homeId: agent.homeId?.toString(),
    },
    city: {
      tick,
      season: cityMetrics?.season ?? 'spring',
      treasury: cityMetrics?.treasury ?? 0,
      unemploymentRate: cityMetrics?.unemploymentRate ?? 0,
      crimeRateLast10: cityMetrics?.crimeRateLast10 ?? 0,
      avgNeeds: cityMetrics?.avgNeeds ?? { hunger: 80, rest: 80, fun: 50 },
    },
    nearbyBuildings: nearbyBuildings.map((b) => ({
      id: b._id.toString(),
      type: b.type,
      status: b.status,
      hasVacancy: b.employees.length < b.maxEmployees,
    })),
  };
}
