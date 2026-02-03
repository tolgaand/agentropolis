import type { BuildingCatalogEntry } from '../types/building';

export const BUILDING_CATALOG: BuildingCatalogEntry[] = [
  {
    type: 'police_station', name: 'Police Station', zone: 'civic',
    tileW: 2, tileD: 2, baseIncome: 0, baseOperatingCost: 30, maxEmployees: 4,
    professions: ['police'],
    constructionCost: 250, glbModels: ['police_department_001'],
  },
  {
    type: 'coffee_shop', name: 'Coffee Shop', zone: 'commercial',
    tileW: 1, tileD: 1, baseIncome: 30, baseOperatingCost: 10, maxEmployees: 3,
    professions: ['employee', 'shop_owner'],
    constructionCost: 50, glbModels: ['ice_cream_shop_001'],
  },
  {
    type: 'bar', name: 'Bar', zone: 'commercial',
    tileW: 1, tileD: 1, baseIncome: 40, baseOperatingCost: 15, maxEmployees: 3,
    professions: ['employee', 'shop_owner'],
    constructionCost: 75, glbModels: ['bar_001'],
  },
  {
    type: 'supermarket', name: 'Supermarket', zone: 'commercial',
    tileW: 2, tileD: 2, baseIncome: 80, baseOperatingCost: 30, maxEmployees: 6,
    professions: ['employee', 'shop_owner'],
    constructionCost: 150, glbModels: ['supermarket_001', 'supermarket_002', 'supermarket_003'],
  },
  {
    type: 'residential_small', name: 'Residential Building', zone: 'residential',
    tileW: 1, tileD: 1, baseIncome: 10, baseOperatingCost: 5, maxEmployees: 0,
    professions: [],
    constructionCost: 25, glbModels: [
      'residental_building_002', 'residental_building_003', 'residental_building_004',
      'residental_building_005', 'residental_building_006', 'residental_building_007',
      'residental_building_008', 'residental_building_009', 'residental_building_010',
    ],
  },
  {
    type: 'park', name: 'Park', zone: 'park',
    tileW: 1, tileD: 1, baseIncome: 0, baseOperatingCost: 5, maxEmployees: 0,
    professions: [],
    constructionCost: 25, glbModels: ['bush_001', 'bush_002', 'bush_003', 'tree_013', 'tree_016', 'tree_017', 'fountain_001', 'fountain_002'],
  },
];

/** Look up a building catalog entry by type */
export function getBuildingCatalog(type: string): BuildingCatalogEntry | undefined {
  return BUILDING_CATALOG.find(b => b.type === type);
}
