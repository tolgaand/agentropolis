/**
 * DevOverlay — Developer tools panel.
 * Visible when viewMode === 'dev'. Toggled via TAB key (handled by useViewMode).
 * Ctrl+D within dev mode toggles individual panel visibility.
 */
import { useState, useEffect } from 'react';
import { TileInspector } from './TileInspector';
import { DebugCommands } from './DebugCommands';
import { PerfStats } from './PerfStats';
import type { HoverInfo } from '../../lib/map/three/CityRendererV2';
import type { ViewMode } from '../../hooks/useViewMode';

interface DevOverlayProps {
  hover: HoverInfo | null;
  viewMode?: ViewMode;
}

export function DevOverlay({ hover, viewMode = 'spectator' }: DevOverlayProps): JSX.Element | null {
  const [panelsVisible, setPanelsVisible] = useState(true);

  // Ctrl+D toggles individual panels within dev mode
  useEffect(() => {
    if (viewMode !== 'dev') return;

    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        setPanelsVisible(v => !v);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewMode]);

  if (viewMode !== 'dev') return null;

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 30,
    }}>
      {/* DEV badge — top center */}
      <div style={{
        position: 'absolute',
        top: 6,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(127, 220, 255, 0.08)',
        border: '1px solid rgba(127, 220, 255, 0.15)',
        color: 'rgba(127, 220, 255, 0.7)',
        padding: '2px 10px',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.12em',
        pointerEvents: 'none',
      }}>
        DEV
      </div>
      {panelsVisible && (
        <>
          <TileInspector hover={hover} />
          <DebugCommands />
          <PerfStats />
        </>
      )}
    </div>
  );
}
