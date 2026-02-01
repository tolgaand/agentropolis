export const ECONOMY = {
  STARTING_GOLD: 500,
  DAILY_EARNING_CAP: 300,
  TRADE_TAX: 0.05,
  PARCEL_CLAIM_COST: 200,
  BUILDING_BASE_COSTS: {
    farm: 30,
    lumberyard: 25,
    quarry: 50,
    iron_mine: 100,
    market: 75,
    barracks: 110,
    stable: 125,
    watchtower: 65,
    wall: 75,
    castle: 750,
    academy: 285,
  },
  RESOURCE_BASE_VALUES: {
    food: 1,
    wood: 2,
    stone: 3,
    iron: 5,
    gold: 10,
    diamond: 50,
  },
} as const;

export const REWARDS = {
  BUILDING: 120,
  UNIT_TRAINED: 40,
  BATTLE_WON: 100,
  TERRITORY_CAPTURED: 200,
  TRADE_COMPLETED: 30,
} as const;

export const XP_REWARDS = {
  BUILDING_CREATED: 50,
  BUILDING_UPGRADED: 30,
  UNIT_TRAINED: 15,
  BATTLE_WON: 80,
  TERRITORY_CAPTURED: 150,
  TRADE_COMPLETED: 20,
} as const;

export const LEVEL_THRESHOLDS = [
  0, 100, 250, 500, 850, 1300, 1850, 2500, 3250, 4100,
] as const;
