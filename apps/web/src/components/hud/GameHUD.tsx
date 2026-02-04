/**
 * GameHUD - Spectator HUD wrapper. Always visible over the 3D map.
 */
import { TopBar } from './TopBar';
import { CityPulse } from './CityPulse';
import { AgentsPanel } from './AgentsPanel';
import { Minimap } from './Minimap';
import { HoverCardLayer } from './HoverCard';
import { SeasonGoals } from './SeasonGoals';
import { SeasonReport } from './SeasonReport';
import { LensToggle } from './LensToggle';
import { EventToast } from './EventToast';
import type { HoverInfo } from '../../lib/map/three/CityRendererV2';
import type { ViewMode } from '../../hooks/useViewMode';
import { useSeasonSync } from '../../hooks/useSeasonSync';
import { useWorldLifecycle } from '../../hooks/useWorldLifecycle';

interface GameHUDProps {
  hover?: HoverInfo | null;
  selected?: HoverInfo | null;
  viewMode?: ViewMode;
}

export function GameHUD({ hover = null, selected = null, viewMode = 'spectator' }: GameHUDProps): JSX.Element {
  const isDev = viewMode === 'dev';

  // Push season from socket metrics to Three.js renderer
  useSeasonSync();

  // Bridge socket events → WorldFX + Indicators
  useWorldLifecycle();

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 10,
    }}>
      <TopBar />
      <EventToast />
      <CityPulse />
      <Minimap />
      <SeasonReport />
      <HoverCardLayer hover={hover} selected={selected} />
      <LensToggle />

      {/* Right column — stacked panels */}
      <div style={{
        position: 'absolute',
        top: 58,
        right: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxHeight: 'calc(100vh - 120px)',
        overflowY: 'auto',
        overflowX: 'hidden',
        pointerEvents: 'none',
        zIndex: 15,
      }}>
        <SeasonGoals />
        <AgentsPanel />
      </div>

      {/* Controls hint — bottom center */}
      <div style={{
        position: 'absolute',
        bottom: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(8, 12, 20, 0.78)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        color: 'rgba(255, 255, 255, 0.4)',
        padding: '4px 14px',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        border: '1px solid rgba(127, 220, 255, 0.08)',
        letterSpacing: '0.04em',
      }}>
        Drag: Pan | Scroll: Zoom | Click: Inspect | 1/2/3: Lens{isDev ? ' | TAB: Spectator' : ' | TAB: Dev'}
      </div>
    </div>
  );
}
