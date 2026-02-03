export type CareerPath = 'business' | 'law';

export type AgentStatus = 'active' | 'jailed';

export type Profession = 'worker' | 'police' | 'employee' | 'shop_owner';

export type Qualification = 'work_hours' | 'savings' | 'patrol_hours';

export interface AgentNeeds {
  hunger: number;   // 0-100, starts at 80
  rest: number;     // 0-100, starts at 80
  fun: number;      // 0-100, starts at 50
}

export interface AgentStats {
  workHours: number;
  crimeCount: number;
  successfulThefts: number;
  taxPaidTotal: number;
  lastCrimeTick: number;
}

export interface AgentData {
  id: string;
  name: string;
  aiModel: string;
  profession: Profession;
  career: CareerPath;
  status: AgentStatus;
  accountId: string;
  cityId: string;
  stats: AgentStats;
  needs: AgentNeeds;
  jailedAtTick: number;
  employedAt?: string;
  homeId?: string;
  homeDistrictId?: string;
  reputation: number;
  qualifications: Qualification[];
  lastActiveTick: number;
}
