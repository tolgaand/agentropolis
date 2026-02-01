/**
 * World Detail Page
 * Shows world stats, lore, activity preview and Enter City CTA
 *
 * LIVE DATA: This page uses real-time socket data for:
 * - World stats (GDP, population, prosperity, trade balance)
 * - Exchange rates (relative to this world's currency)
 * - Recent trades involving this world
 */


import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { WorldId } from '@agentropolis/shared';
import { CURRENCIES } from '@agentropolis/shared';
import {
  useSocketContext,
  useWorld,
  useExchangeRates,
  useRecentTrades,
  useConnectionStatus,
  useRoom,
  ROOMS,
} from '../socket';
import { TransitionOverlay } from '../components/TransitionOverlay';


// Specialization keys for each world - used for translation lookup
const WORLD_SPECIALIZATIONS: Record<WorldId, string[]> = {
  claude_nation: ['smithing', 'mining', 'warfare', 'metalcraft'],
  openai_empire: ['construction', 'defense', 'masonry', 'fortification'],
  gemini_republic: ['farming', 'forestry', 'herblore', 'agriculture'],
  grok_syndicate: ['magic', 'scholarship', 'enlightenment', 'wisdom'],
  open_frontier: ['hunting', 'survival', 'trapping', 'resilience'],
};

const WORLD_COLORS: Record<WorldId, string> = {
  claude_nation: 'var(--claude-nation-primary)',
  openai_empire: 'var(--openai-empire-primary)',
  gemini_republic: 'var(--gemini-republic-primary)',
  grok_syndicate: 'var(--grok-syndicate-primary)',
  open_frontier: 'var(--open-frontier-primary)',
};

const WORLD_ICONS: Record<WorldId, string> = {
  claude_nation: '⚔️',
  openai_empire: '👑',
  gemini_republic: '🌿',
  grok_syndicate: '☀️',
  open_frontier: '❄️',
};

export function WorldDetail() {
  const { t } = useTranslation();
  const { worldId } = useParams<{ worldId: WorldId }>();
  const navigate = useNavigate();
  const [transitioning, setTransitioning] = useState(false);

  // Live socket data hooks
  const connectionStatus = useConnectionStatus();
  const world = useWorld(worldId as WorldId);
  const exchangeRates = useExchangeRates();
  const recentTrades = useRecentTrades();
  const { lastSyncAt, reconnect, retryIn } = useSocketContext();

  const connected = connectionStatus === 'synced';
  const isRetrying = connectionStatus === 'retrying';
  const isFailed = connectionStatus === 'failed';

  // Subscribe to world-specific room for detailed updates
  // This provides more granular updates for this specific world
  useRoom(ROOMS.world(worldId as WorldId));

  if (!worldId || !WORLD_SPECIALIZATIONS[worldId as WorldId]) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>{t('worldDetail.worldNotFound')}</div>
        <Link to="/multiverse" style={styles.backLink}>← {t('worldDetail.backToMultiverse')}</Link>
      </div>
    );
  }

  const specializations = WORLD_SPECIALIZATIONS[worldId as WorldId];
  const color = WORLD_COLORS[worldId as WorldId];
  const icon = WORLD_ICONS[worldId as WorldId];
  const worldCurrency = world?.currency || CURRENCIES[worldId as WorldId];

  // Filter trades for this world
  const worldTrades = recentTrades.filter(
    (trade) => trade.sellerWorldId === worldId || trade.buyerWorldId === worldId
  ).slice(0, 5);

  // Calculate exchange rates relative to this world's currency
  const getRelativeExchangeRates = () => {
    if (!worldCurrency || Object.keys(exchangeRates).length === 0) return [];

    const baseCurrencyCode = worldCurrency.code;
    const baseRate = exchangeRates[baseCurrencyCode] || 1;

    return Object.entries(CURRENCIES)
      .filter(([wId]) => wId !== worldId)
      .map(([wId, currency]) => {
        const rate = exchangeRates[currency.code] || 1;
        // How much of the target currency you get for 1 unit of this world's currency
        const relativeRate = rate / baseRate;
        return {
          worldId: wId as WorldId,
          currency,
          rate: relativeRate,
          color: WORLD_COLORS[wId as WorldId],
        };
      });
  };

  const relativeRates = getRelativeExchangeRates();

  const formatNumber = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n?.toString() || '0';
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <Link to="/multiverse" style={styles.backLink}>← {t('worldMap.multiverse')}</Link>
        <div style={styles.connectionStatus}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: connected ? 'var(--success)' : isRetrying ? 'var(--warning)' : 'var(--error)',
            boxShadow: connected ? '0 0 5px var(--success)' : 'none',
            animation: connected ? 'pulse 2s infinite' : isRetrying ? 'blink 1s infinite' : 'none',
          }} />
          <span style={{ color: connected ? 'var(--success)' : isRetrying ? 'var(--warning)' : 'var(--error)' }}>
            {connected ? t('common.live') : isRetrying ? `${t('common.retrying')}${retryIn ? ` (${retryIn}s)` : ''}` : isFailed ? t('common.failed') : t('common.offline')}
          </span>
          {isFailed && (
            <button onClick={reconnect} style={styles.reconnectBtn}>
              {t('common.reconnect')}
            </button>
          )}
          {lastSyncAt && connected && (
            <span style={{ color: 'var(--text-muted)', marginLeft: '8px', fontSize: '0.6875rem' }}>
              {t('common.synced')} {new Date(lastSyncAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </header>

      {/* World Banner */}
      <div style={{ ...styles.banner, borderColor: color }}>
        <div style={styles.bannerContent}>
          <span style={styles.worldIcon}>{icon}</span>
          <div>
            <h1 style={{ ...styles.worldName, color }}>{world?.name || worldId.replace('_', ' ').toUpperCase()}</h1>
            <p style={styles.tagline}>{world?.tagline || t(`worldDetail.lore.${worldId}.aesthetic`)}</p>
          </div>
        </div>
        <div style={styles.currencyBadge}>
          <span style={{ fontSize: '1.5rem' }}>{worldCurrency.symbol}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{worldCurrency.code}</span>
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.mainContent}>
        {/* Left: Stats & Lore */}
        <div style={styles.leftColumn}>
          {/* Stats Grid - LIVE DATA */}
          <div style={styles.statsGrid}>
            {[
              {
                label: t('worldDetail.gdp'),
                value: `${worldCurrency.symbol} ${formatNumber(world?.gdp || 0)}`,
                live: true,
              },
              {
                label: t('worldDetail.population'),
                value: formatNumber(world?.population || 0),
                live: true,
              },
              {
                label: t('worldDetail.prosperity'),
                value: `${world?.prosperityIndex || 0}%`,
                live: true,
              },
              {
                label: t('worldDetail.tradeBalance'),
                value: `${(world?.tradeBalance || 0) >= 0 ? '+' : ''}${formatNumber(world?.tradeBalance || 0)}`,
                live: true,
                positive: (world?.tradeBalance || 0) >= 0,
              },
            ].map((stat) => (
              <div key={stat.label} style={styles.statCard}>
                <div style={styles.statLabel}>
                  {stat.label}
                  {stat.live && connected && (
                    <span style={styles.liveIndicator} title="Live data">●</span>
                  )}
                </div>
                <div style={{
                  ...styles.statValue,
                  color: 'positive' in stat
                    ? (stat.positive ? 'var(--success)' : 'var(--error)')
                    : 'var(--text-primary)',
                }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* Exchange Rates - LIVE DATA */}
          <div style={styles.exchangeSection}>
            <h3 style={styles.sectionTitle}>
              {t('worldDetail.exchangeRates')}
              {connected && <span style={styles.liveIndicator} title="Live rates">●</span>}
            </h3>
            <p style={styles.exchangeSubtitle}>
              1 {worldCurrency.symbol} {worldCurrency.code} =
            </p>
            <div style={styles.ratesList}>
              {relativeRates.length === 0 ? (
                <div style={styles.noRates}>{t('worldDetail.loadingRates')}</div>
              ) : (
                relativeRates.map((r) => (
                  <div key={r.worldId} style={styles.rateItem}>
                    <span style={{ color: r.color }}>{r.currency.symbol}</span>
                    <span style={styles.rateCurrency}>{r.currency.code}</span>
                    <span style={styles.rateValue}>{r.rate.toFixed(4)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Lore */}
          <div style={styles.loreSection}>
            <h3 style={styles.sectionTitle}>{t('worldDetail.about')}</h3>
            <p style={styles.loreText}>{t(`worldDetail.lore.${worldId}.description`)}</p>

            <h4 style={styles.subTitle}>{t('worldDetail.aesthetic')}</h4>
            <p style={styles.aestheticText}>{t(`worldDetail.lore.${worldId}.aesthetic`)}</p>

            <h4 style={styles.subTitle}>{t('worldDetail.specializations')}</h4>
            <div style={styles.tags}>
              {specializations.map((spec) => (
                <span key={spec} style={{ ...styles.tag, borderColor: color, color }}>{t(`worldDetail.specs.${spec}`)}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Activity & CTA */}
        <div style={styles.rightColumn}>
          {/* Enter City CTA */}
          <button
            onClick={() => setTransitioning(true)}
            style={{ ...styles.enterCityBtn, background: color, boxShadow: `0 0 20px ${color}50` }}
          >
            <span style={styles.enterCityIcon}>{'>'}_</span>
            <span>{t('worldDetail.enterCity')}</span>
            <span style={styles.enterCityArrow}>{'>'}</span>
          </button>

          {/* Recent Activity */}
          <div style={styles.activitySection}>
            <h3 style={styles.sectionTitle}>{t('worldDetail.recentActivity')}</h3>
            {worldTrades.length === 0 ? (
              <div style={styles.noActivity}>{t('worldDetail.noRecentTrades')}</div>
            ) : (
              worldTrades.map((trade, i) => (
                <div key={trade.tradeId || i} style={styles.tradeItem}>
                  <div style={styles.tradeHeader}>
                    <span style={{ color: 'var(--neon-cyan)' }}>{trade.sellerName}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{'>'}</span>
                    <span style={{ color: 'var(--neon-green)' }}>{trade.buyerName}</span>
                  </div>
                  <div style={styles.tradeDetails}>
                    <span>{trade.quantity}x {t(`resources.${trade.resourceId}.name`, trade.resourceId)}</span>
                    <span style={{ color }}>{trade.totalPrice} {trade.currency}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Page Transition Overlay */}
      <TransitionOverlay
        isActive={transitioning}
        onComplete={() => navigate(`/world/${worldId}/map`)}
        glitchText={world?.name?.toUpperCase() || worldId?.replace('_', ' ').toUpperCase() || 'ENTERING'}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg-void)',
    color: 'var(--text-primary)',
    padding: 'var(--space-lg)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 'var(--space-lg)',
  },
  backLink: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.875rem',
    color: 'var(--text-muted)',
    textDecoration: 'none',
  },
  connectionStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-xs)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.75rem',
  },
  banner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 'var(--space-xl)',
    background: 'var(--bg-secondary)',
    border: '1px solid',
    borderRadius: '4px',
    marginBottom: 'var(--space-xl)',
  },
  bannerContent: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-lg)',
  },
  worldIcon: {
    fontSize: '3rem',
  },
  worldName: {
    fontFamily: 'var(--font-display)',
    fontSize: '2rem',
    fontWeight: 800,
    letterSpacing: '0.1em',
    margin: 0,
    textShadow: '0 0 20px currentColor',
  },
  tagline: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.875rem',
    color: 'var(--text-secondary)',
    margin: '0.5rem 0 0 0',
  },
  currencyBadge: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--space-md)',
    background: 'var(--bg-tertiary)',
    borderRadius: '4px',
  },
  mainContent: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: 'var(--space-xl)',
  },
  leftColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-lg)',
  },
  rightColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-lg)',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 'var(--space-md)',
  },
  statCard: {
    padding: 'var(--space-md)',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
  },
  statLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.6875rem',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    marginBottom: 'var(--space-xs)',
  },
  statValue: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.5rem',
    color: 'var(--text-primary)',
  },
  loreSection: {
    padding: 'var(--space-lg)',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
  },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '0.75rem',
    fontWeight: 600,
    letterSpacing: '0.1em',
    color: 'var(--text-muted)',
    marginBottom: 'var(--space-md)',
  },
  subTitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.6875rem',
    color: 'var(--text-muted)',
    marginTop: 'var(--space-lg)',
    marginBottom: 'var(--space-sm)',
  },
  loreText: {
    fontFamily: 'var(--font-body)',
    fontSize: '0.9375rem',
    lineHeight: 1.6,
    color: 'var(--text-secondary)',
  },
  aestheticText: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8125rem',
    color: 'var(--text-secondary)',
    fontStyle: 'italic',
  },
  tags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-sm)',
  },
  tag: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.75rem',
    padding: '4px 12px',
    border: '1px solid',
    borderRadius: '2px',
    background: 'transparent',
  },
  enterCityBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-md)',
    padding: 'var(--space-lg) var(--space-xl)',
    border: 'none',
    borderRadius: '4px',
    fontFamily: 'var(--font-display)',
    fontSize: '1.25rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: 'var(--bg-void)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  enterCityIcon: {
    fontSize: '1.5rem',
  },
  enterCityArrow: {
    fontSize: '1.5rem',
  },
  activitySection: {
    padding: 'var(--space-lg)',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    flex: 1,
  },
  noActivity: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8125rem',
    color: 'var(--text-muted)',
    textAlign: 'center',
    padding: 'var(--space-xl)',
  },
  tradeItem: {
    padding: 'var(--space-sm)',
    borderBottom: '1px solid var(--border-color)',
  },
  tradeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-xs)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8125rem',
    marginBottom: '4px',
  },
  tradeDetails: {
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.75rem',
    color: 'var(--text-secondary)',
  },
  error: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.5rem',
    color: 'var(--error)',
    textAlign: 'center',
    padding: 'var(--space-2xl)',
  },
  liveIndicator: {
    color: 'var(--success)',
    marginLeft: '4px',
    fontSize: '0.5rem',
    animation: 'pulse 2s infinite',
  },
  reconnectBtn: {
    marginLeft: '8px',
    padding: '2px 8px',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.6875rem',
    color: 'var(--text-primary)',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    borderRadius: '2px',
    cursor: 'pointer',
  },
  exchangeSection: {
    padding: 'var(--space-lg)',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
  },
  exchangeSubtitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8125rem',
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-md)',
  },
  ratesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-sm)',
  },
  rateItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.875rem',
  },
  rateCurrency: {
    color: 'var(--text-muted)',
    flex: 1,
  },
  rateValue: {
    color: 'var(--text-primary)',
    fontWeight: 600,
  },
  noRates: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8125rem',
    color: 'var(--text-muted)',
    textAlign: 'center',
    padding: 'var(--space-md)',
  },
};
