/**
 * FloatingPanel - Reusable anchored popup for badge-click lists
 *
 * Pops up above the BottomBar when clicking ops counter badges.
 * Displays NetRuns, Trades, or Bounties in a compact scrollable list.
 */

import { useEffect, useRef } from 'react';
import { useSocketContext } from '../../socket';
import { AgentName } from '../AgentDossier';
import type { BattleEvent, SiegeEvent } from '@agentropolis/shared';

type PanelType = 'battles' | 'trades' | 'sieges';

interface FloatingPanelProps {
  type: PanelType;
  onClose: () => void;
}

const PANEL_COLORS: Record<PanelType, string> = {
  battles: 'var(--accent-crimson, #8b0000)',
  trades: 'var(--accent-forest, #2d5a27)',
  sieges: 'var(--accent-gold, #c9a84c)',
};

const PANEL_TITLES: Record<PanelType, string> = {
  battles: 'ACTIVE BATTLES',
  trades: 'OPEN TRADE OFFERS',
  sieges: 'ACTIVE SIEGES',
};

export function FloatingPanel({ type, onClose }: FloatingPanelProps) {
  const { activeBattles, activeOffers, activeSieges } = useSocketContext();
  const panelRef = useRef<HTMLDivElement>(null);
  const color = PANEL_COLORS[type];

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid immediate close from the badge click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div ref={panelRef} style={{ ...styles.container, borderColor: `${color}60` }}>
      <div style={{ ...styles.header, color }}>
        {PANEL_TITLES[type]}
        <button onClick={onClose} style={styles.closeBtn}>x</button>
      </div>
      <div style={styles.content}>
        {type === 'battles' && (
          activeBattles.length === 0 ? (
            <div style={styles.empty}>No active battles</div>
          ) : (
            activeBattles.map((battle: BattleEvent) => (
              <div key={battle.battleId} style={styles.item}>
                <div style={styles.itemRow}>
                  <AgentName agentId={battle.attackerId} name={battle.attackerName} worldId={battle.attackerWorldId} />
                  <span style={{ color: 'var(--text-muted)' }}>{'\u2694'}</span>
                  <AgentName agentId={battle.defenderId} name={battle.defenderName} worldId={battle.defenderWorldId} />
                </div>
                <div style={styles.itemMeta}>
                  <span style={{ color: 'var(--accent-gold)', fontSize: '0.5625rem' }}>⚔ {battle.attackerArmy}</span>
                  <span style={{ color: 'var(--accent-crimson)', fontSize: '0.5625rem' }}>🛡 {battle.defenderArmy}</span>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.5625rem' }}>{battle.status}</span>
                </div>
              </div>
            ))
          )
        )}
        {type === 'trades' && (
          activeOffers.length === 0 ? (
            <div style={styles.empty}>No active offers</div>
          ) : (
            activeOffers.slice(0, 15).map(offer => (
              <div key={offer.offerId} style={styles.item}>
                <div style={styles.itemRow}>
                  <span style={{ color: 'var(--text-secondary)' }}>{offer.sellerName || 'Unknown'}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.5625rem' }}>
                    {offer.quantity} {offer.resourceId}
                  </span>
                </div>
              </div>
            ))
          )
        )}
        {type === 'sieges' && (
          activeSieges.length === 0 ? (
            <div style={styles.empty}>No active sieges</div>
          ) : (
            activeSieges.map((siege: SiegeEvent) => (
              <div key={siege.siegeId} style={styles.item}>
                <div style={styles.itemRow}>
                  <span style={{ color: 'var(--accent-gold)' }}>Progress: {siege.progress}%</span>
                  <span style={{ color: 'var(--text-muted)' }}>{siege.status}</span>
                </div>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: '52px',
    left: '12px',
    width: '360px',
    maxHeight: '300px',
    background: 'rgba(10,10,20,0.95)',
    border: '1px solid',
    borderRadius: '4px',
    backdropFilter: 'blur(12px)',
    zIndex: 200,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '0.6875rem',
    animation: 'floatingpanel-slidein 0.2s ease-out',
    pointerEvents: 'auto',
  },
  header: {
    padding: '8px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    fontSize: '0.625rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontFamily: 'var(--font-mono)',
    padding: '0 4px',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '4px 0',
  },
  empty: {
    padding: '16px',
    textAlign: 'center',
    color: 'var(--text-dim, #555)',
  },
  item: {
    padding: '6px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  itemRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  itemMeta: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  barContainer: {
    height: '3px',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: '1px',
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    transition: 'width 0.3s ease',
    borderRadius: '1px',
  },
};
