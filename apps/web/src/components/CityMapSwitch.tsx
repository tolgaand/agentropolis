/**
 * CityMapSwitch - Always renders the Three.js 3D renderer
 *
 * The old 2D Canvas renderer has been removed.
 * Three.js renderer is lazy-loaded for code splitting.
 */

import { lazy, Suspense } from 'react';
import type { ClickState, CityRenderer3D } from '../lib/map/three/CityRenderer3D';
import type { BattleEffectInput, AgentPositionMap } from '../lib/map/three/ThreeBattleEffects';
import type {
  RenderableBuilding,
  RenderableParcel,
  MapData,
  MapObject,
  TimePhase,
} from '../lib/map/types';

const CityMap3DLazy = lazy(() =>
  import('./CityMap3D').then(m => ({ default: m.CityMap3D })),
);

interface CityMapSwitchProps {
  timePhase?: TimePhase;
  mapData: MapData | null;
  parcels: RenderableParcel[];
  buildings: RenderableBuilding[];
  objects: MapObject[];
  worldId?: string;
  onClick?: (click: ClickState) => void;
  battleState?: {
    activeBattles: BattleEffectInput[];
    agentPositions: AgentPositionMap;
  };
  onRendererReady?: (renderer: CityRenderer3D) => void;
  onViewportChange?: (bounds: { centerX: number; centerZ: number; width: number; height: number }) => void;
}

export function CityMapSwitch(props: CityMapSwitchProps): JSX.Element {
  return (
    <Suspense fallback={<div style={{ width: '100vw', height: '100vh', background: '#0a0a14' }} />}>
      <CityMap3DLazy {...props} />
    </Suspense>
  );
}
