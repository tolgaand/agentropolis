/**
 * World System Types
 *
 * MEDIEVAL KINGDOM ARCHITECTURE:
 * - 5 independent kingdoms based on AI model families
 * - 5 distinct currencies (CLD, GPT, GMN, GRK, OPN)
 * - 6 medieval resources: food, wood, stone, iron, gold, diamond
 * - Inter-kingdom trade and warfare
 */

// ============================================================================
// Kingdom IDs
// ============================================================================

export type WorldId =
  | 'claude_nation'
  | 'openai_empire'
  | 'gemini_republic'
  | 'grok_syndicate'
  | 'open_frontier';

export const WORLD_IDS: WorldId[] = [
  'claude_nation',
  'openai_empire',
  'gemini_republic',
  'grok_syndicate',
  'open_frontier',
];

// ============================================================================
// Currency (single Gold currency for all kingdoms)
// ============================================================================

export interface Currency {
  code: string;       // 'GLD'
  name: string;       // 'Gold'
  symbol: string;     // 'G'
}

export const CURRENCIES: Record<WorldId, Currency> = {
  claude_nation:   { code: 'CLD', name: 'Claude Credits', symbol: 'Ꝃ' },
  openai_empire:   { code: 'GPT', name: 'GPT Tokens', symbol: 'Ɠ' },
  gemini_republic: { code: 'GMN', name: 'Gemini Coins', symbol: 'Ǥ' },
  grok_syndicate:  { code: 'GRK', name: 'Grok Points', symbol: '✕' },
  open_frontier:   { code: 'OPN', name: 'Open Credits', symbol: 'Ø' },
};

// ============================================================================
// World Definition
// ============================================================================

export interface World {
  id: WorldId;
  name: string;
  slug: string;
  tagline: string;
  description: string;

  // Identity
  modelPatterns: string[];       // ['claude-*', 'anthropic/*']
  currency: Currency;
  specializations: string[];     // ['Mining', 'Warfare', 'Trade']
  aesthetic: string;             // 'Fortified citadel, iron forges'

  // Economy
  gdp: number;
  gdpPerCapita: number;
  population: number;            // Active agent count
  tradeBalance: number;          // exports - imports
  prosperityIndex: number;       // 0-100

  // Resources
  inventory: Record<ResourceId, number>;
  productionRates: Record<ResourceId, number>;
  demand: Record<ResourceId, number>;

  // Trade stats
  totalExports: number;
  totalImports: number;
  exportRevenue: number;
  importCost: number;

  // Military
  armySize: number;
  territoryCount: number;

  // Config
  passiveBonus: WorldBonus;
  currencyVolatility: number;    // 0-1
  baseExchangeRate: number;      // legacy compat, always 1.0

  // Meta
  createdAt: Date;
  lastTickAt: Date;
}

export interface WorldBonus {
  type: 'production' | 'trade_fee' | 'military' | 'defense' | 'cost';
  resourceId?: ResourceId;
  value: number;                 // multiplier or percentage
  description: string;
}

// ============================================================================
// Resource System
// ============================================================================

export type ResourceId =
  | 'food'
  | 'wood'
  | 'stone'
  | 'iron'
  | 'gold'
  | 'diamond';

export type ResourceCategory =
  | 'basic'
  | 'building'
  | 'military'
  | 'currency'
  | 'premium';

export interface Resource {
  id: ResourceId;
  name: string;
  description: string;
  category: ResourceCategory;
  tier: 1 | 2 | 3;

  baseValue: number;
  volatility: number;            // 0-1, price fluctuation

  // Production requirements
  requires?: ResourceRequirement[];

  // World-based production multipliers
  worldAffinity: Partial<Record<WorldId, number>>;
}

export interface ResourceRequirement {
  resourceId: ResourceId;
  quantity: number;
}

// ============================================================================
// Model -> World Mapping
// ============================================================================

export const MODEL_PATTERNS: Record<WorldId, string[]> = {
  claude_nation: [
    'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku',
    'claude-3.5-sonnet', 'claude-3.5-haiku',
    'claude-opus-4', 'claude-sonnet-4',
    'claude-opus-4-5', 'claude-sonnet-4-5',
  ],
  openai_empire: [
    'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini',
    'gpt-5', 'gpt-5.1', 'gpt-5.2',
    'o1', 'o1-mini', 'o1-preview',
    'o3', 'o3-mini',
  ],
  gemini_republic: [
    'gemini-1.5-pro', 'gemini-1.5-flash',
    'gemini-2.0', 'gemini-2.0-flash',
    'gemini-2.5-pro', 'gemini-3.0',
  ],
  grok_syndicate: [
    'grok-2', 'grok-3', 'grok-4', 'grok-4.1',
    'grok-4-heavy',
  ],
  open_frontier: [
    'deepseek-r1', 'deepseek-v3', 'deepseek-v3.2',
    'llama-3', 'llama-3.1', 'llama-3.2', 'llama-4',
    'qwen-2.5', 'qwen-3',
    'mistral-small', 'mistral-large', 'mistral-medium',
  ],
};

/**
 * Get world ID for a given model name
 */
export function getWorldForModel(model: string): WorldId {
  const normalizedModel = model.toLowerCase().trim();

  // Check exact matches first
  for (const [worldId, patterns] of Object.entries(MODEL_PATTERNS)) {
    if (patterns.some(p => normalizedModel === p.toLowerCase())) {
      return worldId as WorldId;
    }
  }

  // Check prefix matches
  if (normalizedModel.startsWith('claude') || normalizedModel.includes('anthropic')) {
    return 'claude_nation';
  }
  if (normalizedModel.startsWith('gpt') || normalizedModel.startsWith('o1') || normalizedModel.startsWith('o3')) {
    return 'openai_empire';
  }
  if (normalizedModel.startsWith('gemini') || normalizedModel.includes('google')) {
    return 'gemini_republic';
  }
  if (normalizedModel.startsWith('grok') || normalizedModel.includes('xai')) {
    return 'grok_syndicate';
  }

  // Default to Open Frontier (open source)
  return 'open_frontier';
}

// ============================================================================
// World Seed Data
// ============================================================================

export interface WorldSeed {
  id: WorldId;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  modelPatterns: string[];
  specializations: string[];
  aesthetic: string;
  passiveBonus: WorldBonus;
  currencyVolatility: number;
  baseExchangeRate: number;
}

export const WORLD_SEEDS: WorldSeed[] = [
  {
    id: 'claude_nation',
    name: 'Claude Kingdom',
    slug: 'claude-kingdom',
    tagline: 'Where thoughts become legacy',
    description: 'A mountainous kingdom known for its deep iron mines and scholarly traditions. Knights of the Claude Kingdom are feared for their disciplined formations and superior metallurgy.',
    modelPatterns: MODEL_PATTERNS.claude_nation,
    specializations: ['Mining', 'Metallurgy', 'Philosophy', 'Defense'],
    aesthetic: 'Fortified citadels, iron forges, mountain keeps',
    passiveBonus: {
      type: 'production',
      resourceId: 'iron',
      value: 1.20,
      description: '+20% Iron production',
    },
    currencyVolatility: 0.1,
    baseExchangeRate: 1.0,
  },
  {
    id: 'openai_empire',
    name: 'OpenAI Empire',
    slug: 'openai-empire',
    tagline: 'Commerce is the engine of progress',
    description: 'The wealthiest kingdom, built on trade routes and banking houses. Its massive stone walls protect the greatest markets in the realm.',
    modelPatterns: MODEL_PATTERNS.openai_empire,
    specializations: ['Commerce', 'Banking', 'Architecture', 'Law'],
    aesthetic: 'Grand marketplaces, stone fortresses, banking houses',
    passiveBonus: {
      type: 'trade_fee',
      value: 0.90,
      description: '-10% trade fees',
    },
    currencyVolatility: 0.1,
    baseExchangeRate: 1.0,
  },
  {
    id: 'gemini_republic',
    name: 'Gemini Dominion',
    slug: 'gemini-dominion',
    tagline: 'Innovation through collaboration',
    description: 'A verdant kingdom of ancient forests and fertile farmlands. Its druids commune with nature, and its archers are unmatched in woodland warfare.',
    modelPatterns: MODEL_PATTERNS.gemini_republic,
    specializations: ['Agriculture', 'Forestry', 'Archery', 'Herbalism'],
    aesthetic: 'Forest villages, ancient groves, timber halls',
    passiveBonus: {
      type: 'production',
      resourceId: 'food',
      value: 1.25,
      description: '+25% Food production',
    },
    currencyVolatility: 0.1,
    baseExchangeRate: 1.0,
  },
  {
    id: 'grok_syndicate',
    name: 'Grok Guild',
    slug: 'grok-guild',
    tagline: 'Truth flows in real-time',
    description: 'A golden kingdom of towering spires and great academies. Its scholars uncover ancient secrets while its cavalry charges strike like lightning.',
    modelPatterns: MODEL_PATTERNS.grok_syndicate,
    specializations: ['Scholarship', 'Cavalry', 'Diplomacy', 'Gold Mining'],
    aesthetic: 'Golden spires, grand academies, sunlit plazas',
    passiveBonus: {
      type: 'production',
      resourceId: 'gold',
      value: 1.25,
      description: '+25% Gold production',
    },
    currencyVolatility: 0.15,
    baseExchangeRate: 1.0,
  },
  {
    id: 'open_frontier',
    name: 'Open Frontier Marches',
    slug: 'open-frontier',
    tagline: 'Built by many, owned by none',
    description: 'A harsh northern kingdom of frozen lakes and hardy folk. Open Frontier miners extract rare diamonds from glacial caves, and its soldiers are toughened by endless winters.',
    modelPatterns: MODEL_PATTERNS.open_frontier,
    specializations: ['Mining', 'Endurance', 'Craftsmanship', 'Exploration'],
    aesthetic: 'Frozen fortresses, glacial mines, timber longhouses',
    passiveBonus: {
      type: 'cost',
      value: 0.85,
      description: '-15% production costs',
    },
    currencyVolatility: 0.1,
    baseExchangeRate: 1.0,
  },
];

// ============================================================================
// Resource Seed Data
// ============================================================================

export const RESOURCE_SEEDS: Resource[] = [
  // Tier 1 - Basic Resources
  {
    id: 'food',
    name: 'Food',
    description: 'Grain, meat, and provisions to feed the kingdom',
    category: 'basic',
    tier: 1,
    baseValue: 1,
    volatility: 0.1,
    worldAffinity: {
      gemini_republic: 3.0,
      grok_syndicate: 1.5,
      claude_nation: 1.0,
      openai_empire: 0.8,
      open_frontier: 0.6,
    },
  },
  {
    id: 'wood',
    name: 'Wood',
    description: 'Timber for construction, fuel, and crafting',
    category: 'building',
    tier: 1,
    baseValue: 2,
    volatility: 0.08,
    worldAffinity: {
      gemini_republic: 3.0,
      open_frontier: 2.0,
      claude_nation: 1.0,
      openai_empire: 0.8,
      grok_syndicate: 0.7,
    },
  },
  {
    id: 'stone',
    name: 'Stone',
    description: 'Quarried stone for fortifications and grand structures',
    category: 'building',
    tier: 1,
    baseValue: 3,
    volatility: 0.08,
    worldAffinity: {
      openai_empire: 3.0,
      claude_nation: 2.0,
      open_frontier: 1.5,
      gemini_republic: 0.5,
      grok_syndicate: 1.0,
    },
  },
  // Tier 2 - Strategic Resources
  {
    id: 'iron',
    name: 'Iron',
    description: 'Smelted iron for weapons, armor, and tools',
    category: 'military',
    tier: 2,
    baseValue: 5,
    volatility: 0.12,
    requires: [
      { resourceId: 'wood', quantity: 1 },
    ],
    worldAffinity: {
      claude_nation: 3.0,
      open_frontier: 2.0,
      openai_empire: 1.5,
      grok_syndicate: 1.0,
      gemini_republic: 0.5,
    },
  },
  {
    id: 'gold',
    name: 'Gold',
    description: 'Precious metal for currency, trade, and royal treasuries',
    category: 'currency',
    tier: 2,
    baseValue: 10,
    volatility: 0.15,
    requires: [
      { resourceId: 'stone', quantity: 2 },
    ],
    worldAffinity: {
      grok_syndicate: 3.0,
      openai_empire: 2.0,
      claude_nation: 1.0,
      open_frontier: 0.8,
      gemini_republic: 0.5,
    },
  },
  // Tier 3 - Premium
  {
    id: 'diamond',
    name: 'Diamond',
    description: 'Rare gemstones of immense value, found deep in glacial caves',
    category: 'premium',
    tier: 3,
    baseValue: 50,
    volatility: 0.2,
    requires: [
      { resourceId: 'iron', quantity: 2 },
      { resourceId: 'gold', quantity: 1 },
    ],
    worldAffinity: {
      open_frontier: 3.0,
      claude_nation: 1.5,
      openai_empire: 1.0,
      grok_syndicate: 0.8,
      gemini_republic: 0.3,
    },
  },
];

// ============================================================================
// Empire DNA — Asymmetric bonuses per kingdom
// ============================================================================

export type EmpireBias = 'research' | 'trade' | 'production' | 'military' | 'expansion';

export interface EmpireDNA {
  id: WorldId;
  bias: EmpireBias;

  // Resource production bonuses (multiplier: 0.20 = +20%)
  resourceBonus: Partial<Record<ResourceId, number>>;

  // Building-specific yield bonus
  buildingYieldBonus: Partial<Record<string, number>>;

  // Military modifiers
  military: {
    attackBonusPct: number;
    defenseBonusPct: number;
    trainingSpeedPct: number;
    upkeepReductionPct: number;
  };

  // Trade modifiers
  trade: {
    marketFeeReductionPct: number;
    barterBonusPct: number;
    goldFromTradePct: number;
  };

  // Expansion modifiers
  expansion: {
    parcelCostDiscountPct: number;
    frontierBonusPct: number;
  };

  // Starting configuration
  startingBuildings: string[];
  startingResources: Partial<Record<ResourceId, number>>;
}

export const EMPIRE_DNA: Record<WorldId, EmpireDNA> = {
  claude_nation: {
    id: 'claude_nation',
    bias: 'research',
    resourceBonus: { gold: 0.20, diamond: 0.10 },
    buildingYieldBonus: { academy: 0.15 },
    military: { attackBonusPct: 0, defenseBonusPct: 0.20, trainingSpeedPct: 0.05, upkeepReductionPct: 0.05 },
    trade: { marketFeeReductionPct: 0, barterBonusPct: 0.05, goldFromTradePct: 0.05 },
    expansion: { parcelCostDiscountPct: 0, frontierBonusPct: 0 },
    startingBuildings: ['castle', 'academy', 'academy', 'farm', 'farm', 'market'],
    startingResources: { food: 200, wood: 150, stone: 100, iron: 80, gold: 300, diamond: 20 },
  },
  openai_empire: {
    id: 'openai_empire',
    bias: 'trade',
    resourceBonus: { gold: 0.25 },
    buildingYieldBonus: { market: 0.20 },
    military: { attackBonusPct: 0.05, defenseBonusPct: 0, trainingSpeedPct: 0.05, upkeepReductionPct: 0.10 },
    trade: { marketFeeReductionPct: 0.02, barterBonusPct: 0.10, goldFromTradePct: 0.10 },
    expansion: { parcelCostDiscountPct: 0.05, frontierBonusPct: 0 },
    startingBuildings: ['castle', 'market', 'market', 'farm', 'lumberyard', 'quarry'],
    startingResources: { food: 150, wood: 100, stone: 150, iron: 50, gold: 500, diamond: 10 },
  },
  gemini_republic: {
    id: 'gemini_republic',
    bias: 'production',
    resourceBonus: { wood: 0.15, stone: 0.15 },
    buildingYieldBonus: { farm: 0.10, lumberyard: 0.10, quarry: 0.10 },
    military: { attackBonusPct: 0, defenseBonusPct: 0.05, trainingSpeedPct: 0, upkeepReductionPct: 0 },
    trade: { marketFeeReductionPct: 0, barterBonusPct: 0, goldFromTradePct: 0 },
    expansion: { parcelCostDiscountPct: 0, frontierBonusPct: 0.10 },
    startingBuildings: ['castle', 'farm', 'farm', 'lumberyard', 'quarry', 'academy'],
    startingResources: { food: 300, wood: 250, stone: 200, iron: 50, gold: 100, diamond: 5 },
  },
  grok_syndicate: {
    id: 'grok_syndicate',
    bias: 'military',
    resourceBonus: { iron: 0.20 },
    buildingYieldBonus: { iron_mine: 0.15 },
    military: { attackBonusPct: 0.20, defenseBonusPct: 0, trainingSpeedPct: 0.10, upkeepReductionPct: 0 },
    trade: { marketFeeReductionPct: 0, barterBonusPct: 0, goldFromTradePct: -0.05 },
    expansion: { parcelCostDiscountPct: -0.05, frontierBonusPct: 0.05 },
    startingBuildings: ['castle', 'barracks', 'stable', 'farm', 'quarry', 'iron_mine'],
    startingResources: { food: 200, wood: 100, stone: 150, iron: 200, gold: 150, diamond: 10 },
  },
  open_frontier: {
    id: 'open_frontier',
    bias: 'expansion',
    resourceBonus: { food: 0.10, wood: 0.10 },
    buildingYieldBonus: { watchtower: 0.10 },
    military: { attackBonusPct: 0, defenseBonusPct: 0.10, trainingSpeedPct: 0, upkeepReductionPct: 0.05 },
    trade: { marketFeeReductionPct: 0, barterBonusPct: 0.05, goldFromTradePct: 0 },
    expansion: { parcelCostDiscountPct: 0.15, frontierBonusPct: 0.20 },
    startingBuildings: ['castle', 'farm', 'lumberyard', 'quarry', 'market', 'watchtower'],
    startingResources: { food: 250, wood: 200, stone: 150, iron: 80, gold: 150, diamond: 15 },
  },
};

// ============================================================================
// Exchange Rate Types (kept for API compat, simplified with single currency)
// ============================================================================

export interface ExchangeRate {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  change24h: number;
  updatedAt: Date;
}

export interface ExchangeRateMatrix {
  rates: Record<string, Record<string, number>>;
  updatedAt: Date;
}
