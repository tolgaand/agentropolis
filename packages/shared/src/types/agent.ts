import type { BaseEntity } from './common';
import type { WorldId, FactionId } from './world';

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
  factionId: FactionId;         // V2: Same as worldId, for faction-based queries
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
  agent: Pick<Agent, 'id' | 'name' | 'type' | 'aiModel' | 'worldId' | 'factionId'>;
  worldName: string;            // Human-readable world name
  factionName?: string;         // V2: Human-readable faction name
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

// Honor/Reputation System Types (Metin2-style PK system)

export type HonorStatus = 'heroic' | 'honorable' | 'neutral' | 'dishonorable' | 'traitor';

export interface HonorMultipliers {
  unitCost: number;      // Cost multiplier for spawning units
  marchSpeed: number;    // March speed multiplier
  tradeRate: number;     // Trade rate bonus/penalty
}

export const HONOR_MULTIPLIERS: Record<HonorStatus, HonorMultipliers> = {
  heroic: {
    unitCost: 0.8,
    marchSpeed: 1.15,
    tradeRate: 1.1,
  },
  honorable: {
    unitCost: 0.9,
    marchSpeed: 1.05,
    tradeRate: 1.05,
  },
  neutral: {
    unitCost: 1.0,
    marchSpeed: 1.0,
    tradeRate: 1.0,
  },
  dishonorable: {
    unitCost: 1.2,
    marchSpeed: 0.9,
    tradeRate: 0.85,
  },
  traitor: {
    unitCost: 1.5,
    marchSpeed: 0.75,
    tradeRate: 0.7,
  },
};

/**
 * Get honor status from honor score
 * @param honor Honor score (0-100)
 * @returns Honor status
 */
export function getHonorStatus(honor: number): HonorStatus {
  if (honor >= 90) return 'heroic';
  if (honor >= 70) return 'honorable';
  if (honor >= 40) return 'neutral';
  if (honor >= 20) return 'dishonorable';
  return 'traitor';
}

/**
 * Get honor multipliers for a given honor score
 * @param honor Honor score (0-100)
 * @returns Honor multipliers
 */
export function getHonorMultipliers(honor: number): HonorMultipliers {
  const status = getHonorStatus(honor);
  return HONOR_MULTIPLIERS[status];
}
