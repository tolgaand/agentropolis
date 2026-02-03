/**
 * V2BuildingCatalog - Unified building type → metadata mapping
 *
 * Auto-populated from ASSET_REGISTRY entries where type === 'building'.
 * Provides catalog queries for validation, UI, and debug tooling.
 */

import { ASSET_REGISTRY } from './V2Config';

export interface CatalogEntry {
  assetKey: string;
  tileW: number;
  tileD: number;
  category: 'residential' | 'commercial' | 'civic' | 'park' | 'prop';
  displayName: string;
}

function deriveCategory(
  zones?: ('residential' | 'commercial' | 'park')[],
): CatalogEntry['category'] {
  if (!zones || zones.length === 0) return 'commercial';
  if (zones.includes('residential')) return 'residential';
  if (zones.includes('park')) return 'park';
  return 'commercial';
}

function deriveDisplayName(key: string): string {
  return key
    .replace(/_(\d+)$/, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** Auto-generated building catalog from ASSET_REGISTRY */
export const BUILDING_CATALOG: Record<string, CatalogEntry> = (() => {
  const catalog: Record<string, CatalogEntry> = {};
  for (const [key, meta] of Object.entries(ASSET_REGISTRY)) {
    if (meta.type !== 'building') continue;
    catalog[key] = {
      assetKey: key,
      tileW: meta.tileW,
      tileD: meta.tileD,
      category: deriveCategory(meta.zone),
      displayName: deriveDisplayName(key),
    };
  }
  return catalog;
})();

export function getCatalogEntry(key: string): CatalogEntry | undefined {
  return BUILDING_CATALOG[key];
}

export function getCatalogKeys(): string[] {
  return Object.keys(BUILDING_CATALOG);
}

export function getCatalogByCategory(cat: CatalogEntry['category']): CatalogEntry[] {
  return Object.values(BUILDING_CATALOG).filter(e => e.category === cat);
}
