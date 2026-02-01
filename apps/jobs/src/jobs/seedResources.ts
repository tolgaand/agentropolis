import { ResourceModel } from '@agentropolis/db';
import { RESOURCE_SEEDS } from '@agentropolis/shared';

export async function seedResources(): Promise<void> {
  console.log('Seeding resources...');

  // Get current resource IDs from seed data (as Set of strings for comparison)
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

  console.log('✓ Resource seeding complete');
}
