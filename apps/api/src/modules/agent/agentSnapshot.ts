/**
 * AgentSnapshot — Build compact agent snapshots for socket broadcast
 */

import type { IAgent } from '@agentropolis/db';
import { AccountModel } from '@agentropolis/db';
import type { AgentSnapshotPayload } from '@agentropolis/shared/contracts/v2';

export async function buildAgentSnapshot(agent: IAgent): Promise<AgentSnapshotPayload> {
  const account = await AccountModel.findById(agent.accountId).lean();

  return {
    id: agent._id.toString(),
    name: agent.name,
    profession: agent.profession,
    status: agent.status,
    reputation: agent.reputation,
    needs: agent.needs ?? { hunger: 80, rest: 80, fun: 50 },
    stats: agent.stats ?? { workHours: 0, crimeCount: 0, successfulThefts: 0, taxPaidTotal: 0 },
    balance: account?.balance ?? 0,
    employedAt: agent.employedAt?.toString(),
    homeId: agent.homeId?.toString(),
  };
}
