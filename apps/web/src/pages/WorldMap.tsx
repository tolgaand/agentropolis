/**
 * World Map Page
 * Displays the isometric city map for a specific world
 * Wraps CityMap with world-specific theming
 *
 * Uses centralized socket management from ../socket/
 */

import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { WorldId, TimeState } from '@agentropolis/shared';
import { CityMapSwitch as CityMap } from '../components/CityMapSwitch';
import { MapHUD } from '../components/MapHUD';
import { WorldEntryScreen } from '../components/WorldEntryScreen';
import { useSocketContext, useRoom, ROOMS } from '../socket';
import { gridToScreen, getDrawOrder } from '../lib/map/coords';
import type { RenderableBuilding, RenderableParcel } from '../lib/map/types';

const DEFAULT_TIME_STATE: TimeState = {
  dayIndex: 1,
  minuteOfDay: 540,
  phase: 'day',
  hourDisplay: '09:00',
  isNewPhase: false,
};

// World-specific theme colors (medieval kingdoms)
const WORLD_THEMES: Record<WorldId, {
  primary: string;
  secondary: string;
  accent: string;
  glow: string;
}> = {
  claude_nation: {
    primary: '#8b4513',    // Dark brown/bronze
    secondary: '#a0522d',
    accent: '#cd853f',
    glow: 'rgba(139, 69, 19, 0.5)',
  },
  openai_empire: {
    primary: '#708090',    // Slate gray
    secondary: '#778899',
    accent: '#b0c4de',
    glow: 'rgba(112, 128, 144, 0.5)',
  },
  gemini_republic: {
    primary: '#228b22',    // Forest green
    secondary: '#32cd32',
    accent: '#90ee90',
    glow: 'rgba(34, 139, 34, 0.5)',
  },
  grok_syndicate: {
    primary: '#daa520',    // Goldenrod
    secondary: '#ffd700',
    accent: '#ffec8b',
    glow: 'rgba(218, 165, 32, 0.5)',
  },
  open_frontier: {
    primary: '#4682b4',    // Steel blue
    secondary: '#5f9ea0',
    accent: '#b0e0e6',
    glow: 'rgba(70, 130, 180, 0.5)',
  },
};

const WORLD_NAMES: Record<WorldId, string> = {
  claude_nation: 'Claude Vanguard',
  openai_empire: 'OpenAI Legion',
  gemini_republic: 'Gemini Collective',
  grok_syndicate: 'Grok Syndicate',
  open_frontier: 'Neutral Zone',
};

export function WorldMap() {
  const { t } = useTranslation();
  const { worldId } = useParams<{ worldId: WorldId }>();

  // Use centralized socket state
  const {
    connected,
    worlds,
    time,
    mapData,
    mapTimeState,
    connectionStatus,
  } = useSocketContext();

  // Subscribe to world:*:map room for map data
  const validWorldId = worldId as WorldId;
  useRoom(ROOMS.worldMap(validWorldId));

  const theme = WORLD_THEMES[validWorldId] || WORLD_THEMES.claude_nation;
  const worldName = WORLD_NAMES[validWorldId] || 'Unknown World';
  const world = worlds[validWorldId];

  // Entry screen state
  const [entryComplete, setEntryComplete] = useState(false);

  // Determine if data is ready
  const dataReady = connectionStatus === 'synced' && mapData !== null;

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
  const error = connectionStatus === 'failed' ? 'Connection failed' : null;

  // Error state
  if (!worldId || !WORLD_THEMES[validWorldId]) {
    return (
      <div style={styles.errorContainer}>
        <div style={styles.errorText}>{t('worldDetail.worldNotFound')}</div>
        <Link to="/multiverse" style={styles.backLink}>← {t('worldDetail.backToMultiverse')}</Link>
      </div>
    );
  }

  // Show entry screen until complete
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
        {/* Preload map invisibly */}
        {mapData && (
          <div style={{ position: 'fixed', opacity: 0, pointerEvents: 'none' }}>
            <CityMap
              timePhase={timeState.phase}
              mapData={mapData}
              parcels={parcels}
              buildings={buildings}
              objects={objects}
            />
          </div>
        )}
      </>
    );
  }

  // Map error
  if (error) {
    return (
      <div style={styles.errorContainer}>
        <div style={styles.errorIcon}>⚠️</div>
        <div style={styles.errorText}>{error}</div>
        <button style={styles.retryBtn} onClick={() => window.location.reload()}>
          {t('worldMap.retryConnection')}
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* World HUD */}
      <div style={{ ...styles.hud, borderColor: theme.primary }}>
        {/* Top Bar */}
        <div style={styles.hudTop}>
          <Link to={`/world/${worldId}`} style={{ ...styles.backBtn, color: theme.primary }}>
            ← {worldName}
          </Link>

          <div style={styles.hudCenter}>
            <span style={{ ...styles.worldBadge, background: theme.primary }}>
              {world?.currency?.symbol || '?'} {world?.currency?.code || '???'}
            </span>
          </div>

          <div style={styles.hudRight}>
            {time && (
              <div style={styles.timeDisplay}>
                <span style={{ color: 'var(--text-muted)' }}>{t('worldMap.day')}</span>
                <span style={{ color: theme.primary, fontWeight: 700 }}>{time.day}</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                  {String(time.hour).padStart(2, '0')}:{String(time.minute).padStart(2, '0')}
                </span>
              </div>
            )}
            <div style={styles.connectionIndicator}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: connected ? 'var(--success)' : 'var(--error)',
                boxShadow: connected ? '0 0 5px var(--success)' : 'none',
              }} />
            </div>
          </div>
        </div>

        {/* Bottom Stats Bar */}
        <div style={styles.hudBottom}>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>{t('worldDetail.gdp')}</span>
            <span style={styles.statValue}>{formatNumber(world?.gdp || 0)}</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>{t('worldMap.agents')}</span>
            <span style={styles.statValue}>{world?.population || 0}</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>{t('worldDetail.prosperity')}</span>
            <span style={styles.statValue}>{world?.prosperityIndex || 0}%</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>{t('worldMap.parcels')}</span>
            <span style={styles.statValue}>{parcels.length}</span>
          </div>
        </div>
      </div>

      {/* City Map */}
      <div style={styles.mapContainer}>
        <CityMap
          timePhase={timeState.phase}
          mapData={mapData}
          parcels={parcels}
          buildings={buildings}
          objects={objects}
        />
      </div>

      {/* World Theme Overlay removed — was obscuring Three.js renderer */}

      {/* Bottom HUD Navigation */}
      <MapHUD worldId={validWorldId} worldColor={theme.primary} />
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100vw',
    height: '100vh',
    position: 'relative',
    overflow: 'hidden',
    background: 'var(--bg-void)',
  },
  mapContainer: {
    position: 'absolute',
    inset: 0,
    zIndex: 1,
  },
  themeOverlay: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 2,
  },
  hud: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    background: 'linear-gradient(180deg, var(--bg-void) 0%, transparent 100%)',
    borderBottom: '1px solid',
    padding: 'var(--space-sm) var(--space-lg)',
  },
  hudTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 'var(--space-sm)',
  },
  hudCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-md)',
  },
  hudRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-md)',
  },
  hudBottom: {
    display: 'flex',
    gap: 'var(--space-xl)',
    paddingTop: 'var(--space-sm)',
    borderTop: '1px solid var(--border-color)',
  },
  backBtn: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.875rem',
    textDecoration: 'none',
    transition: 'opacity 0.2s',
  },
  worldBadge: {
    fontFamily: 'var(--font-display)',
    fontSize: '0.875rem',
    fontWeight: 700,
    padding: '4px 12px',
    borderRadius: '2px',
    color: 'var(--bg-void)',
  },
  timeDisplay: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8125rem',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  connectionIndicator: {
    display: 'flex',
    alignItems: 'center',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  statLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.6875rem',
    color: 'var(--text-muted)',
    letterSpacing: '0.05em',
  },
  statValue: {
    fontFamily: 'var(--font-display)',
    fontSize: '1rem',
    color: 'var(--text-primary)',
  },
  loadingContainer: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-void)',
    gap: 'var(--space-lg)',
  },
  spinner: {
    width: 48,
    height: 48,
    border: '3px solid var(--bg-tertiary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.25rem',
    color: 'var(--text-primary)',
    letterSpacing: '0.1em',
  },
  errorContainer: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-void)',
    gap: 'var(--space-lg)',
  },
  errorIcon: {
    fontSize: '3rem',
  },
  errorText: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.25rem',
    color: 'var(--error)',
  },
  retryBtn: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.875rem',
    padding: 'var(--space-sm) var(--space-lg)',
    background: 'var(--neon-cyan)',
    color: 'var(--bg-void)',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
  },
  backLink: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.875rem',
    color: 'var(--text-muted)',
    textDecoration: 'none',
  },
};
