import { WorldModel } from '@agentropolis/db';
import { WORLD_SEEDS, CURRENCIES } from '@agentropolis/shared';

export async function seedWorlds(): Promise<void> {
  console.log('Seeding worlds...');

  for (const seed of WORLD_SEEDS) {
    const existing = await WorldModel.findById(seed.id);

    if (!existing) {
      await WorldModel.create({
        _id: seed.id,
        name: seed.name,
        slug: seed.slug,
        tagline: seed.tagline,
        description: seed.description,
        modelPatterns: seed.modelPatterns,
        currency: CURRENCIES[seed.id],
        specializations: seed.specializations,
        aesthetic: seed.aesthetic,

        // Economy - initial values
        gdp: 0,
        gdpPerCapita: 0,
        population: 0,
        tradeBalance: 0,
        prosperityIndex: 50,

        // Resources - start empty
        inventory: new Map(),
        productionRates: new Map(),
        demand: new Map(),

        // Trade stats
        totalExports: 0,
        totalImports: 0,
        exportRevenue: 0,
        importCost: 0,

        // Config
        passiveBonus: seed.passiveBonus,
        currencyVolatility: seed.currencyVolatility,
        baseExchangeRate: seed.baseExchangeRate,
        currentExchangeRate: seed.baseExchangeRate,

        // Meta
        lastTickAt: new Date(),
      });
      console.log(`  → Created world: ${seed.name}`);
    } else {
      console.log(`  → World exists: ${seed.name}`);
    }
  }

  console.log('✓ World seeding complete');
}
