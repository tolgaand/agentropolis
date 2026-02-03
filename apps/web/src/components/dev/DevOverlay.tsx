/**
 * DevOverlay - Ctrl+D / Cmd+D toggleable developer tools.
 * Only renders when isDevMode() is true. Signal-Negative theme.
 */
import { useState, useEffect } from 'react';
import { isDevMode } from '../../utils/devMode';
import { TileInspector } from './TileInspector';
import { DebugCommands } from './DebugCommands';
import { PerfStats } from './PerfStats';
import type { HoverInfo } from '../../lib/map/three/CityRendererV2';

interface DevOverlayProps {
  hover: HoverInfo | null;
}

export function DevOverlay({ hover }: DevOverlayProps): JSX.Element | null {
  const [visible, setVisible] = useState(true);
  const [devMode] = useState(() => isDevMode());

  useEffect(() => {
    if (!devMode) return;

    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        setVisible(v => !v);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [devMode]);

  if (!devMode || !visible) return null;

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 30,
    }}>
      {/* DEV stamp — top center */}
      <div style={{
        position: 'absolute',
        top: 6,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--hud-teal-dim)',
        border: '1px solid rgba(24,183,161,0.2)',
        color: 'var(--hud-teal)',
        padding: '2px 10px',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.12em',
        pointerEvents: 'none',
      }}>
        DEV
      </div>
      <TileInspector hover={hover} />
      <DebugCommands />
      <PerfStats />
    </div>
  );
}
