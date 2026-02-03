export type EventType =
  | 'agent_joined'
  | 'promotion'
  | 'building_built'
  | 'crime'
  | 'arrest'
  | 'economic_boom'
  | 'salary_paid'
  | 'tax_collected'
  | 'npc_revenue'
  | 'agent_jailed'
  | 'agent_released'
  | 'building_closed'
  | 'building_opened'
  | 'economic_crisis'
  | 'city_build';

export type CrimeType = 'theft';

export type NewsSeverity = 'breaking' | 'major' | 'minor' | 'routine';

export interface EventData {
  id: string;
  type: EventType;
  involvedAgents: string[];
  districtId?: string;
  buildingId?: string;
  severity: number;
  resolved: boolean;
  description: string;
  tick: number;
  cityId: string;
}

export interface NewsItemData {
  id: string;
  type: EventType;
  headline: string;
  body?: string;
  severity: NewsSeverity;
  tick: number;
  districtId?: string;
  buildingId?: string;
  agentIds: string[];
  tags: string[];
  expiresAtTick?: number;
  isPublic: boolean;
  cityId: string;
}
