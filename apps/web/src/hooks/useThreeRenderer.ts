/**
 * useThreeRenderer - React hook bridging React state ↔ Three.js CityRenderer3D
 *
 * Handles lifecycle: init on mount, update on data change, dispose on unmount.
 * Reports hover state back to React for UI overlays (tooltips, panels).
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { CityRenderer3D, type HoverState, type ClickState } from '../lib/map/three/CityRenderer3D';
import type { BattleEffectInput, AgentPositionMap } from '../lib/map/three/ThreeBattleEffects';
import type { RenderableBuilding, RenderableParcel, MapData, MapObject, TimePhase } from '../lib/map/types';

interface UseThreeRendererProps {
  mapData: MapData | null;
  parcels: RenderableParcel[];
  buildings: RenderableBuilding[];
  objects: MapObject[];
  timePhase?: TimePhase;
  worldId?: string;
  onClick?: (click: ClickState) => void;
  battleState?: {
    activeBattles: BattleEffectInput[];
    agentPositions: AgentPositionMap;
  };
}

interface UseThreeRendererResult {
  containerRef: React.RefObject<HTMLDivElement>;
  hover: HoverState | null;
  zoomPercent: number;
  rendererRef: React.RefObject<CityRenderer3D | null>;
}

export function useThreeRenderer(props: UseThreeRendererProps): UseThreeRendererResult {
  const containerRef = useRef<HTMLDivElement>(null!);
  const rendererRef = useRef<CityRenderer3D | null>(null);
  const initedRef = useRef(false);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);

  const onHover = useCallback((h: HoverState | null) => {
    setHover(h);
  }, []);

  // Store latest onClick ref so it's always current
  const onClickRef = useRef(props.onClick);
  onClickRef.current = props.onClick;

  const onClickStable = useCallback((click: ClickState) => {
    onClickRef.current?.(click);
  }, []);

  // Store latest props so we can replay after init
  const latestPropsRef = useRef(props);
  latestPropsRef.current = props;

  // Initialize renderer on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new CityRenderer3D();
    rendererRef.current = renderer;
    initedRef.current = false;

    renderer.init(container, { onHover, onClick: onClickStable }).then(() => {
      initedRef.current = true;
      // Replay latest data after init completes
      const p = latestPropsRef.current;
      renderer.updateData(
        p.mapData,
        p.parcels,
        p.buildings,
        p.objects,
        p.timePhase,
        p.worldId,
      );
    }).catch((err) => {
      console.error('Failed to init Three.js renderer:', err);
    });

    // Poll zoom level periodically
    const zoomInterval = setInterval(() => {
      if (rendererRef.current) {
        setZoomPercent(rendererRef.current.getZoomPercent());
      }
    }, 200);

    return () => {
      clearInterval(zoomInterval);
      renderer.dispose();
      rendererRef.current = null;
      initedRef.current = false;
    };
  }, [onHover, onClickStable]);

  // Update data when props change
  useEffect(() => {
    if (!rendererRef.current || !initedRef.current) return;

    rendererRef.current.updateData(
      props.mapData,
      props.parcels,
      props.buildings,
      props.objects,
      props.timePhase,
      props.worldId,
    );
  }, [props.mapData, props.parcels, props.buildings, props.objects, props.timePhase, props.worldId]);

  // Update battle effects when battle state changes
  useEffect(() => {
    if (!rendererRef.current || !initedRef.current || !props.battleState) return;
    rendererRef.current.updateBattleState(
      props.battleState.activeBattles,
      props.battleState.agentPositions,
    );
  }, [props.battleState]);

  return {
    containerRef,
    hover,
    zoomPercent,
    rendererRef,
  };
}
