/**
 * CityCommand - Full-screen 3D map with HUD overlays
 *
 * V2: Single unified world with factions. All parcels from all factions
 * are displayed on one map via the game:map socket room.
 */

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type { TimeState, ProductionTick, TradeCompleted, TradeOfferCreated, ResourceSoldEvent, BattleEvent, BattleResolvedEvent } from '@agentropolis/shared';
import { CityMapSwitch as CityMap } from '../components/CityMapSwitch';
import { LoadingScreen } from './LoadingScreen';
import { TopBar } from '../components/hud/TopBar';
import { BottomBar } from '../components/hud/BottomBar';
import { EventFeed } from '../components/hud/EventFeed';
import { IntelPanel } from '../components/hud/IntelPanel';
import { FloatingPanel } from '../components/hud/FloatingPanel';
import { Minimap } from '../components/hud/Minimap';
import { useSocketContext, useRoom, ROOMS, useMarchingArmies, useContestedParcels, useEvent } from '../socket';
import { useNotificationQueue } from '../hooks/useNotificationQueue';
import { useSelectedBuilding } from '../hooks/useSelectedBuilding';
import { useBuildingAgentMap } from '../hooks/useBuildingAgentMap';
import { gridToScreen, getDrawOrder } from '../lib/map/coords';
import type { ClickState, CityRenderer3D } from '../lib/map/three/CityRenderer3D';
import type { RenderableBuilding, RenderableParcel } from '../lib/map/types';

const DEFAULT_TIME_STATE: TimeState = {
  dayIndex: 1,
  minuteOfDay: 540,
  phase: 'day',
  hourDisplay: '09:00',
  isNewPhase: false,
};

export function CityCommand() {
  // Loading state - show LoadingScreen first
  const [loaded, setLoaded] = useState(false);
  const [floatingPanel, setFloatingPanel] = useState<'battles' | 'trades' | 'sieges' | null>(null);
  const rendererRef = useRef<CityRenderer3D | null>(null);
  const [viewportBounds, setViewportBounds] = useState({
    centerX: 0,
    centerZ: 0,
    width: 50,
    height: 50,
  });

  const {
    connectionStatus,
    mapData,
    mapTimeState,
    activeBattles,
  } = useSocketContext();

  // Get marching armies
  const marchingArmies = useMarchingArmies();

  // Get contested parcels
  const contestedParcels = useContestedParcels();

  // V2: Subscribe to unified game map room (all factions, one world)
  useRoom(ROOMS.GAME_MAP);

  // Hide scanlines overlay while in-game
  useEffect(() => {
    document.body.classList.add('in-game');
    return () => document.body.classList.remove('in-game');
  }, []);

  // Notification queue for EventFeed
  const { notifications } = useNotificationQueue();

  // Selected building for IntelPanel
  const { selected, selectBuilding, clearSelection } = useSelectedBuilding();

  // Handle building click from 3D renderer
  const handleMapClick = useCallback((click: ClickState) => {
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

  // Handle renderer ready
  const handleRendererReady = useCallback((renderer: CityRenderer3D) => {
    rendererRef.current = renderer;
  }, []);

  // Handle viewport change from camera
  const handleViewportChange = useCallback((bounds: { centerX: number; centerZ: number; width: number; height: number }) => {
    setViewportBounds(bounds);
  }, []);

  // Handle minimap click
  const handleMinimapFlyTo = useCallback((worldX: number, worldZ: number) => {
    if (rendererRef.current) {
      rendererRef.current.flyTo(worldX, worldZ);
    }
  }, []);

  // Recenter camera on parcel centroid
  const recenterCamera = useCallback(() => {
    if (!rendererRef.current || !mapData || mapData.parcels.length === 0) return;
    let sumX = 0, sumZ = 0;
    for (const p of mapData.parcels) {
      sumX += p.bounds.x + p.bounds.width / 2;
      sumZ += p.bounds.y + p.bounds.height / 2;
    }
    rendererRef.current.flyTo(sumX / mapData.parcels.length, sumZ / mapData.parcels.length);
  }, [mapData]);

  // Keyboard shortcuts: ESC close panel, Home recenter camera
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'Escape') {
        clearSelection();
        setFloatingPanel(null);
      }
      if (e.key === 'Home' || e.key === 'h') {
        recenterCamera();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [clearSelection, recenterCamera]);

  // Update marching armies visualization
  useEffect(() => {
    if (!rendererRef.current || !loaded) return;
    // Convert MarchingArmyVisual to MarchingArmyData format
    const armiesArray = Array.from(marchingArmies.values()).map(army => ({
      armyId: army.armyId,
      factionId: army.factionId,
      fromX: army.fromX,
      fromY: army.fromY,
      toX: army.toX,
      toY: army.toY,
      progress: army.progress,
      speed: army.speed,
      unitCount: army.unitCount,
    }));
    rendererRef.current.updateMarchingArmies(armiesArray);
  }, [marchingArmies, loaded]);

  // Update contested parcels visualization
  useEffect(() => {
    if (!rendererRef.current || !loaded) return;
    const parcelsArray = Array.from(contestedParcels.values());
    rendererRef.current.updateContestedParcels(parcelsArray);
  }, [contestedParcels, loaded]);

  // Show floating text when territory is captured
  useEvent('territory.captured', (data) => {
    if (!rendererRef.current || !loaded || !mapData) return;

    const parcel = mapData.parcels.find(p => p.id === data.parcelId);
    if (!parcel) return;

    const centerX = parcel.bounds.x + parcel.bounds.width / 2;
    const centerZ = parcel.bounds.y + parcel.bounds.height / 2;

    rendererRef.current.showFloatingText({
      text: 'CAPTURED!',
      x: centerX,
      z: centerZ,
      type: 'levelup',
    });
  });

  // Show floating text for production ticks (resources produced)
  useEvent('production.tick', (data: ProductionTick) => {
    if (!rendererRef.current || !loaded || !mapData) return;

    // Find the agent's parcel for positioning
    const parcel = data.parcelId
      ? mapData.parcels.find(p => p.id === data.parcelId)
      : mapData.parcels.find(p => p.blockX === data.blockX && p.blockY === data.blockY);
    if (!parcel) return;

    const centerX = parcel.bounds.x + parcel.bounds.width / 2;
    const centerZ = parcel.bounds.y + parcel.bounds.height / 2;

    // Build a summary of production (e.g. "+8 food +4 iron")
    const items = Object.entries(data.production)
      .filter(([, amount]) => amount > 0)
      .map(([resource, amount]) => `+${Math.floor(amount)} ${resource}`)
      .slice(0, 3); // Max 3 items to keep text short

    if (items.length > 0) {
      rendererRef.current.showFloatingText({
        text: items.join(' '),
        x: centerX,
        z: centerZ,
        type: 'reward',
      });
    }
  });

  // Show floating text for resource sales
  useEvent('market.resource.sold', (data: ResourceSoldEvent) => {
    if (!rendererRef.current || !loaded || !mapData) return;

    const parcel = data.parcelId
      ? mapData.parcels.find(p => p.id === data.parcelId)
      : mapData.parcels.find(p => p.blockX === data.blockX && p.blockY === data.blockY);
    if (!parcel) return;

    const centerX = parcel.bounds.x + parcel.bounds.width / 2;
    const centerZ = parcel.bounds.y + parcel.bounds.height / 2;

    rendererRef.current.showFloatingText({
      text: `+${data.totalCredits} gold`,
      x: centerX,
      z: centerZ,
      type: 'reward',
    });
  });

  // Show floating text for completed trades
  useEvent('trade.completed', (data: TradeCompleted) => {
    if (!rendererRef.current || !loaded || !mapData) return;

    // Show on seller's parcel
    const sellerParcel = mapData.parcels.find(p => p.agentId === data.sellerId);
    if (sellerParcel) {
      const cx = sellerParcel.bounds.x + sellerParcel.bounds.width / 2;
      const cz = sellerParcel.bounds.y + sellerParcel.bounds.height / 2;
      rendererRef.current.showFloatingText({
        text: `Sold ${data.quantity} ${data.resourceId}`,
        x: cx,
        z: cz,
        type: 'info',
      });
    }

    // Show on buyer's parcel
    const buyerParcel = mapData.parcels.find(p => p.agentId === data.buyerId);
    if (buyerParcel) {
      const cx = buyerParcel.bounds.x + buyerParcel.bounds.width / 2;
      const cz = buyerParcel.bounds.y + buyerParcel.bounds.height / 2;
      rendererRef.current.showFloatingText({
        text: `Bought ${data.quantity} ${data.resourceId}`,
        x: cx,
        z: cz,
        type: 'reward',
      });
    }
  });

  // Show floating text for new trade offers
  useEvent('trade.offer.created', (data: TradeOfferCreated) => {
    if (!rendererRef.current || !loaded || !mapData) return;

    const sellerParcel = mapData.parcels.find(p => p.agentId === data.sellerId);
    if (!sellerParcel) return;

    const centerX = sellerParcel.bounds.x + sellerParcel.bounds.width / 2;
    const centerZ = sellerParcel.bounds.y + sellerParcel.bounds.height / 2;

    rendererRef.current.showFloatingText({
      text: `Selling ${data.quantity} ${data.resourceId}`,
      x: centerX,
      z: centerZ,
      type: 'info',
    });
  });

  // Show floating text when a battle starts
  useEvent('battle.started', (data: BattleEvent) => {
    if (!rendererRef.current || !loaded || !mapData) return;

    // Find parcel at battle position using attacker/defender agent parcels
    const parcel = mapData.parcels.find(p => p.agentId === data.attackerId)
      || mapData.parcels.find(p => p.agentId === data.defenderId);
    if (!parcel) return;

    const centerX = parcel.bounds.x + parcel.bounds.width / 2;
    const centerZ = parcel.bounds.y + parcel.bounds.height / 2;

    rendererRef.current.showFloatingText({
      text: `BATTLE! ${data.attackerName} vs ${data.defenderName}`,
      x: centerX,
      z: centerZ,
      type: 'damage',
    });
  });

  // Show floating text when a battle resolves
  useEvent('battle.resolved', (data: BattleResolvedEvent) => {
    if (!rendererRef.current || !loaded || !mapData) return;

    const victorName = data.victor === 'attacker' ? data.attackerName
      : data.victor === 'defender' ? data.defenderName : 'Nobody';

    const parcel = mapData.parcels.find(p => p.agentId === data.attackerId)
      || mapData.parcels.find(p => p.agentId === data.defenderId);
    if (!parcel) return;

    const centerX = parcel.bounds.x + parcel.bounds.width / 2;
    const centerZ = parcel.bounds.y + parcel.bounds.height / 2;

    rendererRef.current.showFloatingText({
      text: `${victorName} WINS!`,
      x: centerX,
      z: centerZ,
      type: 'levelup',
    });
  });

  // Compute renderable parcels from map data
  const parcels = useMemo<RenderableParcel[]>(() => {
    if (!mapData) return [];
    return mapData.parcels.map(parcel => {
      const centerX = parcel.bounds.x + Math.floor((parcel.bounds.width - 1) / 2);
      const centerY = parcel.bounds.y + Math.floor((parcel.bounds.height - 1) / 2);
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

  // Connection error - show error screen
  if (connectionStatus === 'failed' && loaded) {
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

  return (
    <>
      {/* Game always mounted and rendering (hidden behind loading screen initially) */}
      <div style={styles.container}>
        {/* 3D City Viewport - full screen, unobstructed */}
        <div style={styles.viewport}>
          <CityMap
            timePhase={timeState.phase}
            mapData={mapData}
            parcels={parcels}
            buildings={buildings}
            objects={objects}
            worldId={'agentropolis' as string}
            onClick={handleMapClick}
            battleState={battleState}
            onRendererReady={handleRendererReady}
            onViewportChange={handleViewportChange}
          />
        </div>

        {/* HUD Layers - absolute positioned over the viewport */}
        <div style={styles.hudLayer}>
          {/* Top Bar */}
          <TopBar />

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

          {/* Minimap */}
          {mapData && (
            <Minimap
              onFlyTo={handleMinimapFlyTo}
              viewportBounds={viewportBounds}
            />
          )}
        </div>
      </div>

      {/* Loading screen overlay - sits on top until ready */}
      {!loaded && <LoadingScreen onReady={() => setLoaded(true)} />}
    </>
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
};
