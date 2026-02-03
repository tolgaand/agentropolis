/**
 * GameHUD - Spectator HUD wrapper. Always visible over the 3D map.
 * Dystopian cyberpunk design system.
 */
import { TopBar } from './TopBar';
import { CityPulse } from './CityPulse';
import { AgentsPanel } from './AgentsPanel';
import { Minimap } from './Minimap';
import { HoverCardLayer } from './HoverCard';
import { isDevMode } from '../../utils/devMode';
import type { HoverInfo } from '../../lib/map/three/CityRendererV2';

interface GameHUDProps {
  hover?: HoverInfo | null;
}

export function GameHUD({ hover = null }: GameHUDProps): JSX.Element {
  const devMode = isDevMode();

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 10,
    }}>
      <TopBar />
      <CityPulse />
      <AgentsPanel />
      <Minimap />
      <HoverCardLayer hover={hover} />

      {/* Controls hint — bottom center, cyberpunk styled */}
      <div style={{
        position: 'absolute',
        bottom: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(5, 5, 10, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        color: 'var(--text-muted)',
        padding: '4px 14px',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        border: '1px solid rgba(0, 255, 255, 0.12)',
        letterSpacing: '0.06em',
        clipPath: 'polygon(6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px), 0 6px)',
      }}>
        Drag: Pan | Scroll: Zoom{devMode ? ' | Ctrl+D: Dev | AT.* in console' : ''}
      </div>
    </div>
  );
}
