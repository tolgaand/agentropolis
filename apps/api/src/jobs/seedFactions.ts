import { FactionModel } from '@agentropolis/db';
import { FACTION_SEEDS } from '@agentropolis/shared';

export async function seedFactions(): Promise<void> {
  console.log('[FactionSeed] Seeding factions...');

  for (const seed of FACTION_SEEDS) {
    const existing = await FactionModel.findById(seed.id);

    if (!existing) {
      await FactionModel.create({
        _id: seed.id,
        name: seed.name,
        slug: seed.slug,
        tagline: seed.tagline,
        description: seed.description,
        color: seed.color,
        bias: seed.bias,

        // Stats - initial values
        population: 0,
        totalPower: 0,
        territory: 0,
        treasury: 0,
        score: 0,

        // Bonuses
        passiveBonus: seed.passiveBonus,

        // Diplomacy - start neutral
        relations: new Map(),
      });
      console.log(`[FactionSeed]   → Created faction: ${seed.name}`);
    } else {
      console.log(`[FactionSeed]   → Faction exists: ${seed.name}`);
    }
  }

  console.log('[FactionSeed] ✓ Faction seeding complete');
}
