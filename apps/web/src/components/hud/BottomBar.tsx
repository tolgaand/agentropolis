/**
 * BottomBar HUD - Ops counter badges + scrolling price ticker
 */

import { useMemo, useRef, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSocketContext, usePrices, useConnectionStatus } from '../../socket';

// -- Badge types for ops counters --
interface OpsBadge {
  label: string;
  count: number;
  color: string;
  glowColor: string;
  pulse: boolean;
}

// -- Price item (extracted from TradeTicker) --
interface PriceDisplayData {
  resourceId: string;
  name: string;
  price: number;
  change: number;
  currency: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  CLD: '\u{A7D2}',
  GPT: '\u{20B2}',
  GMN: '\u{01E4}',
  GRK: '\u{2715}',
  OPN: '\u{00D8}',
};

const RESOURCE_EMOJIS: Record<string, string> = {
  black_crude: '\u{1F6E2}\uFE0F',
  volt_dust: '\u26A1',
  signal_ore: '\u{1F4E1}',
  ghostwater: '\u{1F4A7}',
  gridsteel: '\u{1F3D7}\uFE0F',
  pulse_cells: '\u{1F50B}',
  cipher_coins: '\u{1FA99}',
  aquifer_glass: '\u{1F9EA}',
  neurotape: '\u{1F4BE}',
  contract_weave: '\u{1F4DC}',
  spectra_feeds: '\u{1F4CA}',
  ethic_engine: '\u2696\uFE0F',
  singularity_seeds: '\u{1F331}',
  oracle_shards: '\u{1F52E}',
};

const WORLD_CURRENCIES: Record<string, string> = {
  claude_nation: 'CLD',
  openai_empire: 'GPT',
  gemini_republic: 'GMN',
  grok_syndicate: 'GRK',
  open_frontier: 'OPN',
};

interface BottomBarProps {
  onBadgeClick?: (type: 'battles' | 'trades' | 'sieges') => void;
}

export const BottomBar = memo(function BottomBar({ onBadgeClick }: BottomBarProps) {
  const { t } = useTranslation();
  const { activeBattles, activeOffers, activeSieges } = useSocketContext();
  const { prices } = usePrices();
  const connectionStatus = useConnectionStatus();

  const badges: OpsBadge[] = [
    {
      label: 'BATTLES',
      count: activeBattles.length,
      color: 'var(--neon-red, #ff3366)',
      glowColor: 'rgba(255,51,102,0.4)',
      pulse: activeBattles.length > 0,
    },
    {
      label: 'TRADES',
      count: activeOffers.length,
      color: 'var(--neon-green, #10b981)',
      glowColor: 'rgba(16,185,129,0.4)',
      pulse: false,
    },
    {
      label: 'SIEGES',
      count: activeSieges.length,
      color: 'var(--neon-yellow, #fbbf24)',
      glowColor: 'rgba(251,191,36,0.4)',
      pulse: activeSieges.length > 0,
    },
  ];

  // Price ticker items
  const itemOrderRef = useRef<string[]>([]);

  useEffect(() => {
    const currentKeys = Object.keys(prices);
    const currentSet = new Set(currentKeys);
    const prevSet = new Set(itemOrderRef.current);
    const itemsChanged =
      currentKeys.length !== itemOrderRef.current.length ||
      currentKeys.some(k => !prevSet.has(k)) ||
      itemOrderRef.current.some(k => !currentSet.has(k));

    if (itemsChanged && currentKeys.length > 0) {
      // Simple shuffle
      const arr = [...currentKeys];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      itemOrderRef.current = arr;
    }
  }, [prices]);

  const tickerItems: PriceDisplayData[] = useMemo(() => {
    return itemOrderRef.current
      .map(key => {
        const p = prices[key];
        if (!p) return null;
        const emoji = RESOURCE_EMOJIS[p.resourceId] || '';
        const name = t(`resources.${p.resourceId}.name`, p.resourceId);
        return {
          resourceId: p.resourceId,
          name: emoji ? `${emoji} ${name}` : name,
          price: p.price ?? 0,
          change: p.change24h ?? 0,
          currency: WORLD_CURRENCIES[p.worldId] || 'OPN',
        };
      })
      .filter((item): item is PriceDisplayData => item !== null);
  }, [prices, t]);

  const itemCount = tickerItems.length;
  const duration = itemCount > 0 ? Math.max(10, (itemCount * 180) / 100) : 25;
  const hasData = tickerItems.length > 0;

  return (
    <div style={styles.container}>
      {/* Left: Badge counters */}
      <div style={styles.badgeSection}>
        {badges.map(badge => (
          <button
            key={badge.label}
            onClick={() => {
              const type = badge.label.toLowerCase() as 'battles' | 'trades' | 'sieges';
              onBadgeClick?.(type);
            }}
            style={{
              ...styles.badge,
              borderColor: badge.count > 0 ? badge.color : 'rgba(255,255,255,0.1)',
              color: badge.count > 0 ? badge.color : 'var(--text-muted, #666)',
              textShadow: badge.count > 0 ? `0 0 6px ${badge.glowColor}` : 'none',
              animation: badge.pulse ? 'bottombar-pulse 1.5s infinite' : 'none',
            }}
          >
            <span style={styles.badgeCount}>{badge.count}</span>
            <span style={styles.badgeLabel}>{badge.label}</span>
            {badge.count > 0 && badge.pulse && (
              <span style={{ ...styles.badgeDot, background: badge.color, boxShadow: `0 0 4px ${badge.color}` }} />
            )}
          </button>
        ))}
      </div>

      {/* Right: Price ticker */}
      <div style={styles.tickerSection}>
        {hasData ? (
          <div
            className="bottombar-ticker-strip"
            style={{ '--ticker-duration': `${duration}s` } as React.CSSProperties}
          >
            {[...tickerItems, ...tickerItems].map((p, i) => (
              <TickerItem key={`${p.resourceId}-${i}`} data={p} />
            ))}
          </div>
        ) : (
          <span style={styles.tickerLoading}>
            {connectionStatus === 'synced' ? 'AWAITING MARKET DATA...' : 'OFFLINE'}
          </span>
        )}
      </div>

      <style>{bottomBarStyles}</style>
    </div>
  );
});

const TickerItem = memo(function TickerItem({ data }: { data: PriceDisplayData }) {
  const isUp = data.change > 0;
  const isDown = data.change < 0;
  const color = isUp ? 'var(--success, #10b981)' : isDown ? 'var(--error, #ef4444)' : 'var(--text-muted, #666)';
  const arrow = isUp ? '\u25B2' : isDown ? '\u25BC' : '\u2500';
  const symbol = CURRENCY_SYMBOLS[data.currency] || data.currency;

  return (
    <span style={styles.tickerItem}>
      <span style={{ color }}>{arrow}</span>
      <span style={{ color: 'var(--text-secondary, #999)' }}>{data.name}</span>
      <span style={{ color: 'var(--text-primary, #eee)' }}>{data.price.toFixed(1)}</span>
      <span style={{ color: 'var(--text-muted, #666)' }}>{symbol}</span>
      <span style={{ color, fontSize: '0.625rem' }}>
        ({isUp ? '+' : ''}{data.change.toFixed(1)}%)
      </span>
    </span>
  );
});

const bottomBarStyles = `
  @keyframes bottombar-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  @keyframes bottombar-ticker-scroll {
    0% { transform: translate3d(0, 0, 0); }
    100% { transform: translate3d(-50%, 0, 0); }
  }

  .bottombar-ticker-strip {
    display: flex;
    align-items: center;
    height: 100%;
    will-change: transform;
    animation: bottombar-ticker-scroll var(--ticker-duration, 60s) linear infinite;
    backface-visibility: hidden;
  }

  .bottombar-ticker-strip:hover {
    animation-play-state: paused;
  }
`;

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '44px',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    background: 'linear-gradient(0deg, rgba(10,10,20,0.95) 0%, rgba(10,10,20,0.7) 80%, transparent 100%)',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    backdropFilter: 'blur(8px)',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '0.6875rem',
  },
  badgeSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '0 12px',
    borderRight: '1px solid rgba(255,255,255,0.08)',
    height: '100%',
    flexShrink: 0,
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid',
    borderRadius: '2px',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '0.625rem',
    letterSpacing: '0.05em',
    position: 'relative',
    transition: 'all 0.2s',
  },
  badgeCount: {
    fontWeight: 700,
    fontSize: '0.75rem',
  },
  badgeLabel: {
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  badgeDot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    position: 'absolute',
    top: '-2px',
    right: '-2px',
  },
  tickerSection: {
    flex: 1,
    overflow: 'hidden',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: '8px',
  },
  tickerItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '0 12px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    fontSize: '0.6875rem',
  },
  tickerLoading: {
    color: 'var(--text-muted, #666)',
    fontSize: '0.6875rem',
    letterSpacing: '0.05em',
  },
};
