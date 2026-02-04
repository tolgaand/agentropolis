/**
 * useSeasonSync — Watches city metrics season and pushes it to the renderer.
 */
import { useEffect, useRef } from 'react';
import { useCityMetrics } from '../socket/socket.context';
import { useRendererRef } from './useRendererRef';

export function useSeasonSync(): void {
  const metrics = useCityMetrics();
  const rendererRef = useRendererRef();
  const lastSeason = useRef<string>('');

  useEffect(() => {
    const season = metrics?.season;
    if (!season || season === lastSeason.current) return;
    lastSeason.current = season;

    const renderer = rendererRef?.current;
    if (renderer) {
      renderer.setSeason(season);
    }
  }, [metrics?.season, rendererRef]);
}
