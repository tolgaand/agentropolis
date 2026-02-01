/**
 * CityCommand - Full-screen 3D map with HUD overlays
 *
 * Replaces the WorldMap + WorldDetail split with a single unified experience.
 * Shows the 3D city viewport with TopBar, BottomBar, EventFeed, and IntelPanel as HUD layers.
 */

import { useMemo, useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { WorldId, TimeState } from '@agentropolis/shared';
import { CityMapSwitch as CityMap } from '../components/CityMapSwitch';
import { WorldEntryScreen } from '../components/WorldEntryScreen';
import { TopBar } from '../components/hud/TopBar';
import { BottomBar } from '../components/hud/BottomBar';
import { EventFeed } from '../components/hud/EventFeed';
import { IntelPanel } from '../components/hud/IntelPanel';
import { FloatingPanel } from '../components/hud/FloatingPanel';
import { useSocketContext, useRoom, ROOMS } from '../socket';
import { useNotificationQueue } from '../hooks/useNotificationQueue';
import { useSelectedBuilding } from '../hooks/useSelectedBuilding';
import { useBuildingAgentMap } from '../hooks/useBuildingAgentMap';
import { gridToScreen, getDrawOrder } from '../lib/map/coords';
import type { ClickState } from '../lib/map/three/CityRenderer3D';
import type { RenderableBuilding, RenderableParcel } from '../lib/map/types';

const DEFAULT_TIME_STATE: TimeState = {
  dayIndex: 1,
  minuteOfDay: 540,
  phase: 'day',
  hourDisplay: '09:00',
  isNewPhase: false,
};

const WORLD_THEMES: Record<string, { primary: string; glow: string }> = {
  claude_nation: { primary: '#8b5cf6', glow: 'rgba(139,92,246,0.5)' },
  openai_empire: { primary: '#10b981', glow: 'rgba(16,185,129,0.5)' },
  gemini_republic: { primary: '#06b6d4', glow: 'rgba(6,182,212,0.5)' },
  grok_syndicate: { primary: '#f59e0b', glow: 'rgba(245,158,11,0.5)' },
  open_frontier: { primary: '#ef4444', glow: 'rgba(239,68,68,0.5)' },
};

const WORLD_NAMES: Record<string, string> = {
  claude_nation: 'Claude Nation',
  openai_empire: 'OpenAI Empire',
  gemini_republic: 'Gemini Republic',
  grok_syndicate: 'Grok Syndicate',
  open_frontier: 'Open Frontier',
};

export function CityCommand() {
  const { t } = useTranslation();
  const { worldId: routeWorldId } = useParams<{ worldId: string }>();
  const navigate = useNavigate();

  const [worldId, setWorldId] = useState<WorldId>((routeWorldId || 'claude_nation') as WorldId);
  const [entryComplete, setEntryComplete] = useState(false);
  const [floatingPanel, setFloatingPanel] = useState<'battles' | 'trades' | 'sieges' | null>(null);

  const {
    connectionStatus,
    mapData,
    mapTimeState,
    activeBattles,
  } = useSocketContext();

  // Subscribe to world map room
  useRoom(ROOMS.worldMap(worldId));

  // Hide scanlines overlay while in-game
  useEffect(() => {
    document.body.classList.add('in-game');
    return () => document.body.classList.remove('in-game');
  }, []);

  const theme = WORLD_THEMES[worldId] || WORLD_THEMES.open_frontier;
  const worldName = WORLD_NAMES[worldId] || 'Unknown World';

  // Notification queue for EventFeed
  const { notifications } = useNotificationQueue();

  // Selected building for IntelPanel
  const { selected, selectBuilding, clearSelection } = useSelectedBuilding();

  // Data readiness
  const dataReady = connectionStatus === 'synced' && mapData !== null;

  // Handle world change from TopBar selector
  const handleWorldChange = useCallback((newWorldId: WorldId) => {
    setWorldId(newWorldId);
    navigate(`/world/${newWorldId}`, { replace: true });
    setEntryComplete(false);
    clearSelection();
  }, [navigate, clearSelection]);

  // Handle building click from 3D renderer
  const handleMapClick = useCallback((click: ClickState) => {
    // Find which parcel/agent is at this block
    if (!mapData) return;
    const parcel = mapData.parcels.find(
      p => p.blockX === click.blockX && p.blockY === click.blockY
    );
    if (parcel) {
      selectBuilding({
        buildingId: click.buildingId || parcel.id,
        agentId: parcel.agentId,
        blockX: click.blockX,
        blockY: click.blockY,
      });
    } else {
      clearSelection();
    }
  }, [mapData, selectBuilding, clearSelection]);

  // Handle badge click in BottomBar
  const handleBadgeClick = useCallback((type: 'battles' | 'trades' | 'sieges') => {
    setFloatingPanel(prev => prev === type ? null : type);
  }, []);

  // Keyboard shortcuts: 1-5 switch worlds, ESC close panel
  useEffect(() => {
    const WORLD_KEYS: Record<string, WorldId> = {
      '1': 'claude_nation' as WorldId,
      '2': 'openai_empire' as WorldId,
      '3': 'gemini_republic' as WorldId,
      '4': 'grok_syndicate' as WorldId,
      '5': 'open_frontier' as WorldId,
    };

    const handler = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      if (e.key === 'Escape') {
        clearSelection();
        setFloatingPanel(null);
        return;
      }

      const targetWorld = WORLD_KEYS[e.key];
      if (targetWorld && targetWorld !== worldId) {
        handleWorldChange(targetWorld);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [worldId, handleWorldChange, clearSelection]);

  // Compute renderable parcels from map data
  const parcels = useMemo<RenderableParcel[]>(() => {
    if (!mapData) return [];
    return mapData.parcels.map(parcel => {
      const centerX = parcel.bounds.x + Math.floor(parcel.bounds.width / 2);
      const centerY = parcel.bounds.y + Math.floor(parcel.bounds.height / 2);
      const screen = gridToScreen(centerX, centerY);
      return {
        id: parcel.id,
        agentId: parcel.agentId,
        agentName: parcel.agentName,
        worldId: parcel.worldId,
        blockX: parcel.blockX,
        blockY: parcel.blockY,
        bounds: parcel.bounds,
        defaultBuildingId: parcel.layout.mainBuilding.spriteId,
        registeredAt: parcel.registeredAt,
        legacyMessage: parcel.legacyMessage,
        theme: parcel.theme,
        agentData: parcel.agentData,
        screenX: screen.x,
        screenY: screen.y,
      };
    });
  }, [mapData?.parcels]);

  // Compute renderable buildings from map data
  const buildings = useMemo<RenderableBuilding[]>(() => {
    if (!mapData) return [];
    return mapData.objects
      .filter(obj => obj.type === 'building' || obj.type === 'decoration')
      .map(obj => {
        const screen = gridToScreen(obj.gridX, obj.gridY);
        return {
          id: obj.id,
          parcelId: obj.parcelId || obj.id,
          worldId: '',
          ownerId: obj.ownerId || 'system',
          type: obj.buildingType || obj.name || 'building',
          name: obj.name || 'Building',
          level: obj.level || 1,
          stats: {},
          coords: { x: obj.gridX, y: obj.gridY },
          spriteId: obj.spriteId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          screenX: screen.x,
          screenY: screen.y,
          drawOrder: getDrawOrder(obj.gridX, obj.gridY),
        };
      })
      .sort((a, b) => a.drawOrder - b.drawOrder);
  }, [mapData?.objects]);

  const objects = mapData?.objects || [];
  const timeState = mapTimeState ?? DEFAULT_TIME_STATE;

  // Agent position map for battle effects
  const agentPositions = useBuildingAgentMap(mapData);

  // Battle state for 3D effects
  const battleState = useMemo(() => ({
    activeBattles: activeBattles.map((battle: any) => ({
      battleId: battle.battleId,
      attackerId: battle.attackerId,
      defenderId: battle.defenderId,
      attackerWorldId: battle.attackerWorldId,
      defenderWorldId: battle.defenderWorldId,
      status: battle.status,
      attackerArmy: battle.attackerArmy,
      defenderArmy: battle.defenderArmy,
    })),
    agentPositions,
  }), [activeBattles, agentPositions]);

  // Error: invalid world
  if (!routeWorldId || !WORLD_THEMES[worldId]) {
    return (
      <div style={styles.errorContainer}>
        <div style={styles.errorText}>{t('worldDetail.worldNotFound')}</div>
        <Link to="/multiverse" style={styles.backLink}>{'\u2190'} {t('worldDetail.backToMultiverse')}</Link>
      </div>
    );
  }

  // Connection error
  if (connectionStatus === 'failed') {
    return (
      <div style={styles.errorContainer}>
        <div style={{ fontSize: '3rem' }}>{'{'}</div>
        <div style={styles.errorText}>CONNECTION LOST</div>
        <button style={styles.retryBtn} onClick={() => window.location.reload()}>
          RETRY
        </button>
      </div>
    );
  }

  // Entry screen
  if (!entryComplete) {
    return (
      <>
        <WorldEntryScreen
          worldName={worldName}
          worldColor={theme.primary}
          onComplete={() => setEntryComplete(true)}
          minDuration={800}
          dataReady={dataReady}
        />
        {mapData && (
          <div style={{ position: 'fixed', opacity: 0, pointerEvents: 'none' }}>
            <CityMap
              timePhase={timeState.phase}
              mapData={mapData}
              parcels={parcels}
              buildings={buildings}
              objects={objects}
              worldId={worldId}
            />
          </div>
        )}
      </>
    );
  }

  return (
    <div style={styles.container}>
      {/* 3D City Viewport - full screen, unobstructed */}
      <div style={styles.viewport}>
        <CityMap
          timePhase={timeState.phase}
          mapData={mapData}
          parcels={parcels}
          buildings={buildings}
          objects={objects}
          worldId={worldId}
          onClick={handleMapClick}
          battleState={battleState}
        />
      </div>

      {/* HUD Layers - absolute positioned over the viewport */}
      <div style={styles.hudLayer}>
        {/* Top Bar */}
        <TopBar
          worldId={worldId}
          onWorldChange={handleWorldChange}
          worldColor={theme.primary}
        />

        {/* Left: Event Feed */}
        <EventFeed notifications={notifications} />

        {/* Right: Intel Panel (on building click) */}
        {selected && (
          <IntelPanel selected={selected} onClose={clearSelection} />
        )}

        {/* Bottom Bar */}
        <BottomBar onBadgeClick={handleBadgeClick} />

        {/* Floating Panel (on badge click) */}
        {floatingPanel && (
          <FloatingPanel type={floatingPanel} onClose={() => setFloatingPanel(null)} />
        )}
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
    background: 'var(--bg-void, #0a0a14)',
  },
  viewport: {
    position: 'absolute',
    inset: 0,
    zIndex: 1,
  },
  hudLayer: {
    position: 'absolute',
    inset: 0,
    zIndex: 10,
    pointerEvents: 'none',
  },
  errorContainer: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-void, #0a0a14)',
    gap: '16px',
  },
  errorText: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.25rem',
    color: 'var(--error, #ef4444)',
  },
  retryBtn: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.875rem',
    padding: '8px 24px',
    background: 'var(--neon-cyan, #22d3ee)',
    color: 'var(--bg-void, #0a0a14)',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
  },
  backLink: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.875rem',
    color: 'var(--text-muted, #666)',
    textDecoration: 'none',
  },
};
