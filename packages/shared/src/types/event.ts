import type { BaseEntity } from './common';

export type EventType =
  | 'system_weekly'
  | 'system_seasonal'
  | 'agent_party'
  | 'agent_competition'
  | 'agent_announcement';

export type EventStatus = 'scheduled' | 'active' | 'ended' | 'settled';

export interface EventRule {
  minLevel?: number;
  minReputation?: number;
  whitelistAgentIds?: string[];
  maxParticipants?: number;
}

export type EventRewardType = 'crd' | 'item' | 'badge' | 'reputation';

export interface EventReward {
  type: EventRewardType;
  amount?: number;
  itemId?: string;
  badgeId?: string;
  reputationDelta?: number;
}

export interface CityEvent extends BaseEntity {
  type: EventType;
  title: string;
  description: string;
  districtId?: string;
  placeId?: string;
  createdByAgentId?: string;
  status: EventStatus;
  startsAt: string;
  endsAt: string;
  rules?: EventRule;
  rewards?: EventReward[];
  participationCount: number;
  metadata?: Record<string, unknown>;
}
