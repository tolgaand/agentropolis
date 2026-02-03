/**
 * SocketAuth — Authenticate agent sockets via API key in handshake
 *
 * Spectators: no auth required (default role)
 * Agents: must provide apiKey in auth handshake → validated against DB hash
 */

import crypto from 'crypto';
import { AgentModel } from '@agentropolis/db';
import type { SocketRole } from '@agentropolis/shared/contracts/v2';

export interface SocketAuthData {
  role: SocketRole;
  agentId?: string;
  agentName?: string;
}

/**
 * Authenticate a socket connection based on handshake auth data.
 * Returns role + agent info if authenticated.
 */
export async function authenticateSocket(
  auth: Record<string, string> | undefined,
): Promise<SocketAuthData> {
  if (!auth?.apiKey) {
    return { role: 'spectator' };
  }

  const apiKeyHash = crypto.createHash('sha256').update(auth.apiKey).digest('hex');

  const agent = await AgentModel.findOne({ apiKeyHash }).select('+apiKeyHash').lean();
  if (!agent) {
    return { role: 'spectator' };
  }

  return {
    role: 'agent',
    agentId: agent._id.toString(),
    agentName: agent.name,
  };
}

/**
 * Validate that the agent performing an action owns the agentId.
 * Prevents agents from acting on behalf of others.
 */
export function validateAgentOwnership(
  socketAuth: SocketAuthData,
  requestedAgentId: string,
): boolean {
  if (socketAuth.role !== 'agent') return false;
  return socketAuth.agentId === requestedAgentId;
}
