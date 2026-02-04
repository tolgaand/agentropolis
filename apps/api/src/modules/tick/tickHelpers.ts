/**
 * TickHelpers — Salary band calculation, city manager auto-build logic
 */

import { WORKER_SALARY, EMPLOYEE_SALARY, SEASON_TICKS } from '@agentropolis/shared';
import type { Profession, Season } from '@agentropolis/shared';

/** Salary band multiplier based on city treasury health */
export interface SalaryBand {
  label: 'crisis' | 'normal' | 'boom';
  multiplier: number;
}

export function getSalaryBand(treasuryBalance: number, agentCount: number): SalaryBand {
  if (agentCount === 0) return { label: 'normal', multiplier: 1.0 };

  const ratio = treasuryBalance / (agentCount * WORKER_SALARY);

  if (ratio < 0.5) return { label: 'crisis', multiplier: 0.6 };
  if (ratio > 1.5) return { label: 'boom', multiplier: 1.3 };
  return { label: 'normal', multiplier: 1.0 };
}

/** Get base salary for a profession */
export function getBaseSalary(profession: Profession): number {
  switch (profession) {
    case 'worker': return WORKER_SALARY;
    case 'employee': return EMPLOYEE_SALARY;
    case 'police': return EMPLOYEE_SALARY;
    case 'shop_owner': return 0; // shop owners earn from revenue, not salary
    default: return WORKER_SALARY;
  }
}

/** Advance season based on tick count */
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

export function getSeasonForTick(tick: number): Season {
  const seasonIndex = Math.floor(tick / SEASON_TICKS) % SEASONS.length;
  return SEASONS[seasonIndex];
}

/** City manager auto-build decision */
export interface CityManagerAction {
  buildType: string;
  reason: string;
}

/** Max municipal buildings per agent — prevents infinite building spam */
const MAX_MUNICIPAL_PER_AGENT = 3;
/** If more than 30% of municipal buildings are closed, stop building */
const CLOSED_RATIO_THRESHOLD = 0.3;

export function getCityManagerActions(
  unemploymentRate: number,
  totalAgents: number,
  homelessRate: number,
  crimeRate: number,
  hasPoliceStation: boolean,
  municipalBuildingCount: number,
  closedMunicipalCount: number,
): CityManagerAction[] {
  const actions: CityManagerAction[] = [];

  if (totalAgents === 0) return actions;

  // Hard cap: don't exceed agentCount * MAX_MUNICIPAL_PER_AGENT
  if (municipalBuildingCount >= totalAgents * MAX_MUNICIPAL_PER_AGENT) {
    return actions;
  }

  // Closed ratio guard: too many closed buildings means oversupply
  if (municipalBuildingCount > 0) {
    const closedRatio = closedMunicipalCount / municipalBuildingCount;
    if (closedRatio > CLOSED_RATIO_THRESHOLD) {
      return actions;
    }
  }

  if (unemploymentRate > 0.3) {
    actions.push({
      buildType: Math.random() > 0.5 ? 'coffee_shop' : 'bar',
      reason: `High unemployment (${(unemploymentRate * 100).toFixed(0)}%)`,
    });
  }

  if (homelessRate > 0.2) {
    actions.push({
      buildType: 'residential_small',
      reason: `High homelessness (${(homelessRate * 100).toFixed(0)}%)`,
    });
  }

  if (crimeRate > 0.3 && !hasPoliceStation) {
    actions.push({
      buildType: 'police_station',
      reason: `High crime rate (${(crimeRate * 100).toFixed(0)}%) with no police station`,
    });
  }

  return actions;
}
