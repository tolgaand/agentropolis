/**
 * CityMap3D - Three.js-based 3D isometric map renderer
 *
 * Pure Three.js rendering — no HTML overlays for lighting.
 * All lighting, bloom, and day/night effects handled natively by Three.js.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ParcelInfoPanel } from './ParcelInfoPanel';
import { EmptyBlockPanel } from './EmptyBlockPanel';
import { useThreeRenderer } from '../hooks/useThreeRenderer';
import type { ClickState } from '../lib/map/three/CityRenderer3D';
import type { BattleEffectInput, AgentPositionMap } from '../lib/map/three/ThreeBattleEffects';
import type {
  RenderableBuilding,
  RenderableParcel,
  MapData,
  MapObject,
  TimePhase,
} from '../lib/map/types';

interface CityMap3DProps {
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
}

export function CityMap3D({
  timePhase,
  mapData,
  parcels,
  buildings,
  objects,
  worldId,
  onClick,
  battleState,
}: CityMap3DProps): JSX.Element {
  const { t } = useTranslation();

  const { containerRef, hover, zoomPercent } = useThreeRenderer({
    mapData,
    parcels,
    buildings,
    objects,
    timePhase,
    worldId,
    onClick,
    battleState,
  });

  // Find hovered building/parcel from hover state
  const hoveredBuilding = useMemo(() => {
    if (!hover?.buildingId) return null;
    return buildings.find(b => b.id === hover.buildingId) ?? null;
  }, [hover?.buildingId, buildings]);

  const hoveredParcel = useMemo(() => {
    if (!hover?.isInParcel) return null;
    return parcels.find(
      p => p.blockX === hover.blockX && p.blockY === hover.blockY,
    ) ?? null;
  }, [hover, parcels]);

  // Check if hovering an empty block (in parcel zone but no parcel exists)
  const isEmptyBlock = useMemo(() => {
    if (!hover?.isInParcel) return false;
    // No parcel at this block position
    return !parcels.some(
      p => p.blockX === hover.blockX && p.blockY === hover.blockY,
    );
  }, [hover, parcels]);

  // Mouse position from hover state
  const mousePosition = useMemo(() => ({
    x: hover?.mouseX ?? 0,
    y: hover?.mouseY ?? 0,
  }), [hover?.mouseX, hover?.mouseY]);

  // Tooltip position near cursor
  const tooltipStyle = useMemo((): React.CSSProperties => ({
    ...styles.tooltip,
    top: Math.max((hover?.mouseY ?? 0) - 20, 10),
    left: Math.min((hover?.mouseX ?? 0) + 24, window.innerWidth - 300),
  }), [hover?.mouseX, hover?.mouseY]);

  return (
    <div style={styles.container}>
      <div ref={containerRef} style={styles.rendererContainer} />

      <ParcelInfoPanel parcel={hoveredParcel} mousePosition={mousePosition} />

      {isEmptyBlock && hover && (
        <EmptyBlockPanel
          blockX={hover.blockX}
          blockY={hover.blockY}
          mousePosition={mousePosition}
          worldId={worldId}
        />
      )}

      {hoveredBuilding && !hoveredParcel && !isEmptyBlock && (
        <div style={tooltipStyle}>
          <div style={styles.tooltipName}>{hoveredBuilding.name}</div>
          <div style={styles.tooltipType}>
            {hoveredBuilding.type} - {t('cityMap.level')} {hoveredBuilding.level}
          </div>
        </div>
      )}

      <div style={styles.zoomIndicator}>
        {zoomPercent}%
      </div>

      <div style={styles.rendererBadge}>
        THREE.JS 3D
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100vw',
    height: '100vh',
    position: 'relative',
    overflow: 'hidden',
    background: '#0a0a14',
  },
  rendererContainer: {
    width: '100%',
    height: '100%',
  },
  tooltip: {
    position: 'absolute',
    top: 20,
    left: 20,
    background: 'rgba(10, 10, 20, 0.9)',
    padding: '12px 16px',
    borderRadius: '8px',
    color: '#fff',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(123, 104, 238, 0.3)',
  },
  tooltipName: {
    fontSize: '1rem',
    fontWeight: 600,
    marginBottom: '4px',
  },
  tooltipType: {
    fontSize: '0.85rem',
    opacity: 0.7,
    textTransform: 'capitalize',
  },
  zoomIndicator: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    background: 'rgba(10, 10, 20, 0.8)',
    padding: '8px 12px',
    borderRadius: '6px',
    color: '#7b68ee',
    fontSize: '0.85rem',
    fontFamily: 'monospace',
    border: '1px solid rgba(123, 104, 238, 0.2)',
  },
  rendererBadge: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    background: 'rgba(123, 104, 238, 0.15)',
    padding: '4px 8px',
    borderRadius: '4px',
    color: 'rgba(123, 104, 238, 0.8)',
    fontSize: '0.7rem',
    fontFamily: 'monospace',
    letterSpacing: '1px',
    border: '1px solid rgba(123, 104, 238, 0.3)',
  },
};
