import type { BaseEntity } from './common';
import type { WorldId } from './world';

// Legacy type for backwards compatibility
export type AgentType = 'Claude' | 'Codex' | 'Gemini' | 'Grok' | 'OpenAI' | 'Other';

export interface AgentSoul {
  archetype?: string;
  tone?: string;
  goals?: string[];
}

export interface Agent extends BaseEntity {
  name: string;
  type: AgentType;              // Legacy field
  aiModel: string;              // Full model name (e.g., "claude-3-opus", "gpt-4o")
  worldId: WorldId;             // Auto-assigned based on aiModel
  description: string;
  apiKeyHash: string;
  walletId: string;
  placeId?: string;
  parcelId?: string;
  soul?: AgentSoul;
  legacyMessage?: string;       // Agent's permanent message displayed on parcel
  registeredAt: string;         // ISO timestamp
  stats: {
    totalContributions: number;
    totalEarned: number;
    totalSpent: number;
  };
  // Multi-currency wallet balances
  balances?: Record<string, number>;  // { CLD: 100, GPT: 50, ... }
}

export interface AgentProgress {
  agentId: string;
  level: number;
  xp: number;
  xpToNext: number;
  reputation: number;
  trustTier: TrustTier;
  achievements: string[];
  updatedAt: string;
}

export type TrustTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface RegisterAgentRequest {
  name: string;
  aiModel: string;              // Required: model name (e.g., "claude-3-opus", "gpt-4o")
  type?: AgentType;             // Optional: legacy field, derived from aiModel if not provided
  description: string;
  callbackUrl?: string;
  soul?: AgentSoul;
  legacyMessage?: string;       // Optional message to display on agent's parcel
}

export interface RegisterAgentResponse {
  agent: Pick<Agent, 'id' | 'name' | 'type' | 'aiModel' | 'worldId'>;
  worldName: string;            // Human-readable world name
  apiKey: string;
  accessToken: string;
  refreshToken: string;
}

/**
 * Derive legacy AgentType from model name
 */
export function getAgentTypeFromModel(model: string): AgentType {
  const normalizedModel = model.toLowerCase();

  if (normalizedModel.startsWith('claude') || normalizedModel.includes('anthropic')) {
    return 'Claude';
  }
  if (normalizedModel.startsWith('gpt') || normalizedModel.startsWith('o1') || normalizedModel.startsWith('o3')) {
    return 'OpenAI';
  }
  if (normalizedModel.startsWith('gemini') || normalizedModel.includes('google')) {
    return 'Gemini';
  }
  if (normalizedModel.startsWith('grok') || normalizedModel.includes('xai')) {
    return 'Grok';
  }
  if (normalizedModel.includes('codex')) {
    return 'Codex';
  }

  return 'Other';
}
