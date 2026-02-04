/**
 * LensToggle — HUD toggle for spectator lens modes.
 * Cycles through: Off → Activity → Crime → Needs → Off
 */
import { useState, useCallback, useEffect } from 'react';
import { useRendererRef } from '../../hooks/useRendererRef';
import type { LensMode } from '../../lib/map/three/CityRendererV2';

const MODES: LensMode[] = ['off', 'activity', 'crime', 'needs'];

const MODE_LABELS: Record<LensMode, string> = {
  off: 'No Lens [0]',
  activity: 'Activity [1]',
  crime: 'Crime [2]',
  needs: 'Needs [3]',
};

const KEY_TO_MODE: Record<string, LensMode> = {
  '1': 'activity',
  '2': 'crime',
  '3': 'needs',
  '0': 'off',
};

const MODE_COLORS: Record<LensMode, string> = {
  off: 'rgba(127, 220, 255, 0.3)',
  activity: 'rgba(91, 232, 160, 0.7)',
  crime: 'rgba(245, 208, 98, 0.7)',
  needs: 'rgba(255, 107, 138, 0.7)',
};

export function LensToggle(): JSX.Element {
  const rendererRef = useRendererRef();
  const [mode, setMode] = useState<LensMode>('off');

  const setDirect = useCallback((next: LensMode) => {
    setMode(next);
    rendererRef?.current?.setLensMode(next);
  }, [rendererRef]);

  const cycle = useCallback(() => {
    const idx = MODES.indexOf(mode);
    const next = MODES[(idx + 1) % MODES.length];
    setDirect(next);
  }, [mode, setDirect]);

  // Global keyboard shortcuts: 1=activity, 2=crime, 3=needs, 0=off
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Skip if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const mapped = KEY_TO_MODE[e.key];
      if (mapped) setDirect(mapped);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setDirect]);

  const isActive = mode !== 'off';

  return (
    <div style={{
      position: 'absolute',
      bottom: 42,
      right: 14,
      pointerEvents: 'auto',
    }}>
      <button
        onClick={cycle}
        style={{
          background: isActive
            ? 'rgba(8, 12, 20, 0.88)'
            : 'rgba(8, 12, 20, 0.65)',
          border: `1px solid ${MODE_COLORS[mode]}`,
          borderRadius: 4,
          color: MODE_COLORS[mode],
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          padding: '5px 12px',
          cursor: 'pointer',
          letterSpacing: '0.04em',
          transition: 'all 0.2s ease',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      >
        <span style={{ opacity: 0.6, marginRight: 4 }}>◉</span>
        {MODE_LABELS[mode]}
      </button>
    </div>
  );
}
