/**
 * extract-medieval-assets.mjs
 *
 * Extracts individual meshes from the Medieval City Low Poly PBR Pack GLTF
 * into separate GLB files, organized by category.
 *
 * Usage: node scripts/extract-medieval-assets.mjs
 */

import { readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const SOURCE_DIR = join(
  process.env.HOME,
  'Downloads',
  '01- Medieval.City.Low.Poly.PBR.Pack',
);
const SOURCE_GLTF = join(SOURCE_DIR, 'ff1e3480ca3b4baf8510299f46a67958_Textured.gltf');
const OUTPUT_DIR = join(PROJECT_ROOT, 'apps/web/public/assets/medieval');

// Category mapping based on node names
const CATEGORIES = {
  houses: /^House_/,
  castle: /^Castle_/,
  church: /^Church_/,
  market: /^Market_/,
  assets: /^(Barrel|Boat|Box|Bridge|Cart|Food_Box|Wood_Fence|Well|Straw|Ship|Sack|Post|Port)/,
  environment: /^(Tree|Grass|Ground|City_Ground|Water|Wall$|Stairs|Stone_\d)/,
  people: /^(Man_|Woman_|Warrior_|Archer_|Armor_|General|Farmer|Back_Bag|Farm_Tool|Basket|Hat|Shield$|Lance$|Sword$|Bow$)/,
};

function categorize(name) {
  for (const [cat, re] of Object.entries(CATEGORIES)) {
    if (re.test(name)) return cat;
  }
  return 'other';
}

async function main() {
  console.log('Reading source GLTF...');
  const gltfRaw = await readFile(SOURCE_GLTF, 'utf-8');
  const gltf = JSON.parse(gltfRaw);

  const nodes = gltf.nodes || [];
  const meshes = gltf.meshes || [];

  console.log(`Found ${nodes.length} nodes, ${meshes.length} meshes`);

  // Copy texture files to output
  const textureDir = join(OUTPUT_DIR, 'textures');
  await mkdir(textureDir, { recursive: true });

  // Copy all PNG/JPEG textures
  const { readdir } = await import('fs/promises');
  const files = await readdir(SOURCE_DIR);
  const textureFiles = files.filter(f => /\.(png|jpg|jpeg)$/i.test(f));
  console.log(`Copying ${textureFiles.length} texture files...`);
  for (const f of textureFiles) {
    await copyFile(join(SOURCE_DIR, f), join(textureDir, f));
  }

  // Build asset catalog from nodes
  const catalog = {
    categories: {},
    assets: [],
  };

  // Extract parent nodes (the ones with clean names and children)
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const name = node.name || `node_${i}`;

    // Skip if this is a mesh child node (has _0 suffix)
    if (name.includes('_Medieval_Pack_') || name.includes('_Assets_0') ||
        name.includes('_Environment_0') || name.includes('_People_0')) {
      continue;
    }

    // Skip container nodes (RootNode, People_empty, Environment.001, Market, etc.)
    if (node.children && node.children.length > 2) continue;
    if (name === 'RootNode' || name.endsWith('.fbx')) continue;

    // Only include nodes that have exactly 1 child with a mesh
    if (!node.children || node.children.length !== 1) continue;
    const childIdx = node.children[0];
    const child = nodes[childIdx];
    if (child.mesh === undefined && child.mesh === null) continue;

    const category = categorize(name);

    if (!catalog.categories[category]) {
      catalog.categories[category] = [];
    }
    catalog.categories[category].push(name);

    catalog.assets.push({
      id: name.toLowerCase().replace(/\s+/g, '_'),
      name,
      category,
      meshIndex: child.mesh,
      nodeIndex: i,
      childNodeIndex: childIdx,
    });
  }

  // Write catalog
  const catalogPath = join(OUTPUT_DIR, 'asset-catalog.json');
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2));
  console.log(`\nAsset catalog written to ${catalogPath}`);
  console.log(`\nCategories:`);
  for (const [cat, items] of Object.entries(catalog.categories)) {
    console.log(`  ${cat}: ${items.length} assets`);
  }
  console.log(`\nTotal assets: ${catalog.assets.length}`);

  // Copy the full GLTF + textures (Three.js GLTFLoader can load the whole scene)
  const gltfDest = join(OUTPUT_DIR, 'medieval-city.gltf');
  await copyFile(SOURCE_GLTF, gltfDest);

  // Also copy the non-textured version
  const nonTexturedSrc = join(SOURCE_DIR, 'ff1e3480ca3b4baf8510299f46a67958.gltf');
  if (existsSync(nonTexturedSrc)) {
    await copyFile(nonTexturedSrc, join(OUTPUT_DIR, 'medieval-city-base.gltf'));
  }

  console.log('\nGLTF files copied to output directory');
  console.log('\nDone! Assets ready at:', OUTPUT_DIR);
  console.log('\nNote: Three.js GLTFLoader can load the full scene and pick individual');
  console.log('meshes by name at runtime using scene.getObjectByName("House_1_1")');
  console.log('This is more efficient than splitting into 178 separate files.');

  // Write a game-specific mapping file
  const gameMapping = {
    buildings: {
      farm: {
        models: ['House_1_1', 'House_1_2', 'House_2_1'],
        props: ['Straw', 'Well', 'Food_Box_1', 'Food_Box_2', 'Food_Box_3', 'Cart', 'Farm_Tool'],
      },
      lumberyard: {
        models: ['House_2_2', 'House_2_3', 'House_3_1'],
        props: ['Wood_Fence_1', 'Wood_Fence_2', 'Wood_Fence_3', 'Cart_1', 'Cart_2', 'Box', 'Sack'],
      },
      quarry: {
        models: ['House_3_2', 'House_4_1', 'House_4_2'],
        props: ['Stone_1', 'Stone_2', 'Stone_3', 'Stone_4', 'Cart', 'Box'],
      },
      iron_mine: {
        models: ['House_5_1', 'House_5_2', 'House_5_3'],
        props: ['Stone_3', 'Stone_4', 'Cart_2', 'Sack'],
      },
      market: {
        models: [
          'Market_1_1', 'Market_1_2', 'Market_1_3', 'Market_1_4', 'Market_1_5', 'Market_1_6',
          'Market_2_1', 'Market_2_2', 'Market_2_3', 'Market_2_4', 'Market_2_5', 'Market_2_6',
        ],
        props: ['Barrel', 'Box', 'Food_Box_1', 'Food_Box_2', 'Food_Box_3', 'Sack', 'Post'],
      },
      barracks: {
        models: ['House_6_1', 'House_6_2'],
        props: ['Sword', 'Shield', 'Lance', 'Bow', 'Post'],
      },
      stable: {
        models: ['House_7_1', 'House_7_2', 'House_7_3'],
        props: ['Cart_1', 'Cart_2', 'Sack'],
      },
      watchtower: {
        models: ['Castle_Tower_1', 'Castle_Tower_2', 'Castle_Tower_3', 'Castle_Tower_4', 'Castle_Tower_5', 'Castle_Tower_6'],
        props: [],
      },
      wall: {
        models: ['Castle_Wall', 'Castle_Wall_Door'],
        props: [],
      },
      gate: {
        models: ['Castle_Entrance', 'Castle_Entrance._2', 'Castle_Tower_Door'],
        props: [],
      },
      castle: {
        models: ['Castle_Roof_1', 'Castle_Roof_2'],
        props: ['Castle_Entrance', 'Castle_Tower_1'],
      },
      academy: {
        models: ['Church_1', 'Church_2'],
        props: [],
      },
    },
    units: {
      farmer: {
        models: ['Farmer_1', 'Farmer_1_2', 'Man_6_Farming', 'Woman_1_Farming', 'Woman_2_Farming', 'Woman_3_Farming'],
        props: ['Farm_Tool', 'Basket', 'Hat', 'Back_Bag'],
      },
      militia: {
        models: ['Man_1_Walking', 'Man_2_Walking_1', 'Man_2_Walking_2', 'Man_3_Walking_1', 'Man_3_Walking_2'],
        props: ['Sword', 'Shield'],
      },
      soldier: {
        models: ['Warrior_1', 'Warrior_2', 'Warrior_3', 'Warrior_4', 'Warrior_5'],
        props: ['Sword', 'Shield'],
      },
      archer: {
        models: ['Archer_1', 'Archer_2', 'Archer_T'],
        props: ['Bow'],
      },
      knight: {
        models: ['Armor_1_Walking', 'Armor_1_Guard', 'Armor_1_Combat', 'Armor_1_Lance',
                 'Armor_2_Walking', 'Armor_2_Guard', 'Armor_2_combat', 'Armor_2_Lance'],
        props: ['Lance', 'Shield'],
      },
      scout: {
        models: ['Man_5_Walking', 'Man_6_Walking', 'Man_7_Hunting', 'Man_9_Hunter'],
        props: ['Back_Bag', 'Bow'],
      },
      general: {
        models: ['General'],
        props: ['Sword', 'Shield', 'Lance'],
      },
    },
    environment: {
      trees: ['Tree_1', 'Tree_2', 'Tree_3', 'Tree_4', 'Tree_5', 'Tree_6', 'Tree_7', 'Tree_8'],
      ground: ['City_Ground', 'Ground_1', 'Ground_2', 'Ground_3', 'Ground_Bricks'],
      water: ['Water'],
      grass: ['Grass_1', 'Grass_2', 'Grass_Blades_1', 'Grass_Blades_2'],
      decorations: ['Stone_1', 'Stone_2', 'Stone_3', 'Stone_4', 'Stairs', 'Bridge'],
    },
    port: {
      models: ['Port', 'Port_2', 'Port_Stake', 'Boat', 'Ship_1', 'Ship_2', 'Bridge'],
    },
    levelTiers: {
      1: ['House_1_1', 'House_1_2', 'House_2_1'],
      2: ['House_2_2', 'House_2_3', 'House_3_1'],
      3: ['House_3_2', 'House_4_1', 'House_4_2'],
      4: ['House_5_1', 'House_5_2', 'House_5_3'],
      5: ['House_6_1', 'House_6_2'],
      6: ['House_7_1', 'House_7_2', 'House_7_3'],
    },
  };

  const mappingPath = join(OUTPUT_DIR, 'game-asset-mapping.json');
  await writeFile(mappingPath, JSON.stringify(gameMapping, null, 2));
  console.log(`Game asset mapping written to ${mappingPath}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
