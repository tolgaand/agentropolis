/**
 * useWorldLifecycle — Bridge between socket events and CityRendererV2 visual systems.
 *
 * S2.3: Feed events → WorldFX (crime_pulse, building_closed, building_opened)
 * S2.4: City metrics → Building Indicators (problem, profit, closed, crime)
 *
 * Since we don't have an exact building→instance index mapping (the renderer
 * uses InstancedMesh with opaque index assignment), we use a probabilistic
 * approach: pick random building mesh keys and instance indices from the
 * visible set. This creates believable visual feedback without requiring
 * a full reverse mapping.
 */

import { useEffect, useRef } from 'react';
import { useFeedEvents, useCityMetrics } from '../socket/socket.context';
import { useRendererRef } from './useRendererRef';
import { ASSET_REGISTRY } from '../lib/map/three/V2Config';
import type { WorldFXType, BuildingIndicator } from '../lib/map/three/CityRendererV2';
import type { FeedEvent } from '@agentropolis/shared/contracts/v2';

// ─── Event → WorldFX mapping ───

/** Map event categories/tags to WorldFX types */
function eventToFXType(event: FeedEvent): WorldFXType | null {
  const h = event.headline.toLowerCase();
  const tags = event.tags ?? [];
  const cat = event.category?.toLowerCase() ?? '';

  // Crime events
  if (cat === 'crime' || tags.includes('crime') || h.includes('crime') || h.includes('arrested')) {
    return 'crime_pulse';
  }

  // Building closure
  if (h.includes('closed') || h.includes('bankrupt') || h.includes('shutdown') || cat === 'closure') {
    return 'building_closed';
  }

  // Building opened / new business
  if (h.includes('opened') || h.includes('new business') || h.includes('built') || cat === 'opening') {
    return 'building_opened';
  }

  return null;
}

/** Get random building mesh keys that exist in the scene */
function getRandomBuildingMeshKey(): string {
  const buildingKeys = Object.entries(ASSET_REGISTRY)
    .filter(([, m]) => m.type === 'building')
    .map(([k]) => k);

  if (buildingKeys.length === 0) return '';
  return buildingKeys[Math.floor(Math.random() * buildingKeys.length)];
}

// ─── Metrics → Indicators mapping ───

function metricsToIndicators(metrics: {
  crimeRateLast10: number;
  unemploymentRate: number;
  avgNeeds: { hunger: number; rest: number; fun: number };
  openBusinesses?: number;
  closedBusinesses?: number;
}): BuildingIndicator[] {
  const indicators: BuildingIndicator[] = [];

  // Crime indicators: scattered based on crime rate
  const crimeCount = Math.min(20, Math.floor(metrics.crimeRateLast10 * 30));
  for (let i = 0; i < crimeCount; i++) {
    // Distribute across visible area (5x5 chunks, 16 tiles each = ±40 tiles)
    const wx = Math.floor((Math.random() - 0.5) * 60);
    const wz = Math.floor((Math.random() - 0.5) * 60);
    // Skip road tiles
    const lx = ((wx % 16) + 16) % 16;
    const lz = ((wz % 16) + 16) % 16;
    if (lx % 4 === 0 || lz % 4 === 0) continue;

    indicators.push({
      buildingId: `crime_${i}`,
      worldX: wx,
      worldZ: wz,
      type: 'crime',
      critical: true,
    });
  }

  // Problem indicators: based on avg needs (high needs = problems)
  // avgNeeds is {hunger, rest, fun} where higher = more need = more problems
  const needsScalar = (metrics.avgNeeds.hunger + metrics.avgNeeds.rest + metrics.avgNeeds.fun) / 3;
  const needsProblems = Math.min(15, Math.floor(needsScalar * 20));
  for (let i = 0; i < needsProblems; i++) {
    const wx = Math.floor((Math.random() - 0.5) * 60);
    const wz = Math.floor((Math.random() - 0.5) * 60);
    const lx = ((wx % 16) + 16) % 16;
    const lz = ((wz % 16) + 16) % 16;
    if (lx % 4 === 0 || lz % 4 === 0) continue;

    indicators.push({
      buildingId: `need_${i}`,
      worldX: wx,
      worldZ: wz,
      type: 'problem',
      critical: true,
    });
  }

  // Closed business indicators
  const closedCount = Math.min(10, metrics.closedBusinesses ?? 0);
  for (let i = 0; i < closedCount; i++) {
    const wx = Math.floor((Math.random() - 0.5) * 60);
    const wz = Math.floor((Math.random() - 0.5) * 60);
    const lx = ((wx % 16) + 16) % 16;
    const lz = ((wz % 16) + 16) % 16;
    if (lx % 4 === 0 || lz % 4 === 0) continue;

    indicators.push({
      buildingId: `closed_${i}`,
      worldX: wx,
      worldZ: wz,
      type: 'closed',
      critical: false,
    });
  }

  // Profit indicators: scattered based on open businesses
  const profitCount = Math.min(12, Math.floor((metrics.openBusinesses ?? 0) / 3));
  for (let i = 0; i < profitCount; i++) {
    const wx = Math.floor((Math.random() - 0.5) * 60);
    const wz = Math.floor((Math.random() - 0.5) * 60);
    const lx = ((wx % 16) + 16) % 16;
    const lz = ((wz % 16) + 16) % 16;
    if (lx % 4 === 0 || lz % 4 === 0) continue;

    indicators.push({
      buildingId: `profit_${i}`,
      worldX: wx,
      worldZ: wz,
      type: 'profit',
      critical: false,
    });
  }

  return indicators;
}

// ─── Hook ───

export function useWorldLifecycle(): void {
  const rendererRef = useRendererRef();
  const feedEvents = useFeedEvents();
  const metrics = useCityMetrics();

  // Track which events we've already processed (by event ID)
  const processedRef = useRef(new Set<string>());

  // S2.3: Feed events → WorldFX
  useEffect(() => {
    const renderer = rendererRef?.current;
    if (!renderer || feedEvents.length === 0) return;

    const processed = processedRef.current;

    // Process only new events (last 10 max per tick)
    let triggered = 0;
    for (const event of feedEvents) {
      if (triggered >= 5) break;
      if (processed.has(event.id)) continue;
      processed.add(event.id);

      const fxType = eventToFXType(event);
      if (!fxType) continue;

      // Pick random building instance to trigger effect on
      const meshKey = getRandomBuildingMeshKey();
      if (!meshKey) continue;

      // Random instance index (within likely populated range)
      const instanceIdx = Math.floor(Math.random() * 200);
      renderer.triggerWorldFX(fxType, meshKey, instanceIdx);
      triggered++;
    }

    // Prune old processed IDs (keep last 500)
    if (processed.size > 500) {
      const arr = Array.from(processed);
      const toDelete = arr.slice(0, arr.length - 500);
      for (const id of toDelete) processed.delete(id);
    }
  }, [feedEvents, rendererRef]);

  // S2.4: City metrics → Indicators
  useEffect(() => {
    const renderer = rendererRef?.current;
    if (!renderer || !metrics) return;

    const indicators = metricsToIndicators({
      crimeRateLast10: metrics.crimeRateLast10,
      unemploymentRate: metrics.unemploymentRate,
      avgNeeds: metrics.avgNeeds,
      openBusinesses: metrics.openBusinesses,
      closedBusinesses: metrics.closedBusinesses,
    });

    renderer.setIndicators(indicators);
  }, [metrics, rendererRef]);
}
