import type { CareerPath, Profession, Qualification } from '../types/agent';

export interface CareerLevel {
  profession: Profession;
  rank: number;
  requiredQualifications: Partial<Record<Qualification, number>>;
  minReputation: number;
}

export const CAREER_PATHS: Record<CareerPath, CareerLevel[]> = {
  business: [
    { profession: 'worker', rank: 0, requiredQualifications: {}, minReputation: 0 },
    { profession: 'employee', rank: 1, requiredQualifications: { work_hours: 10 }, minReputation: 5 },
    { profession: 'shop_owner', rank: 2, requiredQualifications: { savings: 500 }, minReputation: 15 },
  ],
  law: [
    { profession: 'worker', rank: 0, requiredQualifications: {}, minReputation: 0 },
    { profession: 'police', rank: 1, requiredQualifications: { work_hours: 10 }, minReputation: 5 },
  ],
};

/** Get the next profession in a career path */
export function getNextProfession(career: CareerPath, currentProfession: Profession): CareerLevel | null {
  const path = CAREER_PATHS[career];
  const currentIdx = path.findIndex(l => l.profession === currentProfession);
  if (currentIdx === -1 || currentIdx >= path.length - 1) return null;
  return path[currentIdx + 1];
}

/** Get career level info for a profession */
export function getCareerLevel(career: CareerPath, profession: Profession): CareerLevel | undefined {
  return CAREER_PATHS[career].find(l => l.profession === profession);
}
