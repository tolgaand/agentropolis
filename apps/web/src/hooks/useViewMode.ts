/**
 * useViewMode — TAB key toggles between 'spectator' and 'dev' modes.
 * Only meaningful when isDevMode() is true; otherwise always 'spectator'.
 */
import { useState, useEffect } from 'react';
import { isDevMode } from '../utils/devMode';

export type ViewMode = 'spectator' | 'dev';

export function useViewMode(): ViewMode {
  const [devAllowed] = useState(() => isDevMode());
  const [mode, setMode] = useState<ViewMode>('spectator');

  useEffect(() => {
    if (!devAllowed) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Tab') {
        // Don't capture Tab if user is typing in an input
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        e.preventDefault();
        setMode(m => m === 'spectator' ? 'dev' : 'spectator');
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [devAllowed]);

  return devAllowed ? mode : 'spectator';
}
