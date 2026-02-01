/**
 * Seed Data Job
 *
 * Seeds/updates worlds and resources on server startup.
 * Uses upsert to update existing data and remove obsolete entries.
 */

import { WorldModel, ResourceModel } from '@agentropolis/db';
import { WORLD_SEEDS, RESOURCE_SEEDS, CURRENCIES } from '@agentropolis/shared';

/**
 * Seed worlds data
 */
export async function seedWorlds(): Promise<void> {
  console.log('[Seed] Seeding worlds...');

  for (const seed of WORLD_SEEDS) {
    const currency = CURRENCIES[seed.id];
    await WorldModel.findOneAndUpdate(
      { _id: seed.id },
      {
        _id: seed.id,
        name: seed.name,
        slug: seed.slug,
        tagline: seed.tagline,
        description: seed.description,
        modelPatterns: seed.modelPatterns,
        currency: currency,
        specializations: seed.specializations,
        aesthetic: seed.aesthetic,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`  → Upserted world: ${seed.name}`);
  }

  console.log('[Seed] ✓ Worlds seeding complete');
}

/**
 * Seed resources data
 */
export async function seedResources(): Promise<void> {
  console.log('[Seed] Seeding resources...');

  // Get current resource IDs from seed data
  const seedResourceIds = new Set<string>(RESOURCE_SEEDS.map(r => r.id));

  // Delete old resources that are no longer in seed data
  const existingResources = await ResourceModel.find({}).lean();
  for (const existing of existingResources) {
    const existingId = String(existing._id);
    if (!seedResourceIds.has(existingId)) {
      await ResourceModel.deleteOne({ _id: existing._id });
      console.log(`  → Deleted obsolete resource: ${existing.name}`);
    }
  }

  // Upsert all resources from seed data
  for (const seed of RESOURCE_SEEDS) {
    await ResourceModel.findOneAndUpdate(
      { _id: seed.id },
      {
        _id: seed.id,
        name: seed.name,
        description: seed.description,
        category: seed.category,
        tier: seed.tier,
        baseValue: seed.baseValue,
        volatility: seed.volatility,
        requires: seed.requires ?? [],
        worldAffinity: new Map(Object.entries(seed.worldAffinity)),
      },
      { upsert: true, new: true }
    );
    console.log(`  → Upserted resource: ${seed.name} (Tier ${seed.tier})`);
  }

  console.log('[Seed] ✓ Resources seeding complete');
}

/**
 * Run all seed jobs
 */
export async function runSeedJobs(): Promise<void> {
  await seedWorlds();
  await seedResources();
}
