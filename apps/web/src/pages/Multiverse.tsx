import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { WorldId } from '@agentropolis/shared';
import { WorldCard, WorldCardSkeleton } from '../components/WorldCard';
import { TradeTicker } from '../components/TradeTicker';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useSocketContext, useActiveOffers, type ConnectionStatus } from '../socket';
import { AgentName } from '../components/AgentDossier';
import { OnboardingModal, hasSeenOnboarding, resetOnboarding } from '../components/OnboardingModal';

interface WorldData {
  id: WorldId;
  name: string;
  tagline: string;
  currency: { code: string; symbol: string; name: string };
  gdp: number;
  population: number;
  prosperityIndex: number;
  tradeBalance: number;
  totalExports: number;
  totalImports: number;
}

function Header({
  gameTime,
  connectionStatus,
  onHelpClick,
}: {
  gameTime: { day: number; hour: number; minute: number } | null;
  connectionStatus: ConnectionStatus;
  onHelpClick?: () => void;
}) {
  const { t } = useTranslation();
  const isLive = connectionStatus === 'synced';
  const gameDay = gameTime?.day ?? null;
  const gameHour = gameTime
    ? `${String(gameTime.hour).padStart(2, '0')}:${String(gameTime.minute).padStart(2, '0')}`
    : null;

  return (
    <header
      style={{
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        padding: 'var(--space-sm) var(--space-lg)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: 'var(--text-dim)',
              letterSpacing: '0.05em',
            }}
          >
            ───
          </span>
          <h1
            style={{
              fontFamily: 'Cinzel, var(--font-display)',
              fontSize: '1.5rem',
              fontWeight: 600,
              letterSpacing: '0.15em',
              color: 'var(--accent-gold)',
              textShadow: '0 2px 10px rgba(201, 168, 76, 0.3)',
            }}
          >
            AGENTROPOLIS
          </h1>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: 'var(--text-dim)',
              letterSpacing: '0.05em',
            }}
          >
            ───
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)' }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8125rem',
            color: 'var(--text-secondary)',
            padding: '4px 12px',
            border: '1px solid var(--accent-gold)',
            borderRadius: '2px',
            background: 'rgba(201, 168, 76, 0.05)',
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>{t('header.day')}</span>{' '}
          <span style={{ color: gameDay !== null ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
            {gameDay !== null ? gameDay : '--'}
          </span>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8125rem',
            color: gameHour !== null ? 'var(--text-primary)' : 'var(--text-muted)',
          }}
        >
          {gameHour !== null ? gameHour : '--:--'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isLive ? 'var(--success)' : 'var(--error)',
              boxShadow: isLive ? '0 0 5px var(--success)' : 'none',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: isLive ? 'var(--success)' : 'var(--error)',
            }}
          >
            {isLive ? t('common.live') : t('common.offline')}
          </span>
        </div>
        <LanguageSwitcher compact />
        {onHelpClick && (
          <button
            onClick={onHelpClick}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color)',
              padding: '0.25rem 0.75rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6875rem',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
            title={t('header.showTutorial')}
          >
            ?
          </button>
        )}
      </div>
    </header>
  );
}

function ConnectionLostOverlay({
  status,
  retryIn,
  onReconnect,
}: {
  status: ConnectionStatus;
  retryIn: number | null;
  onReconnect: () => void;
}) {
  const { t } = useTranslation();
  if (status === 'synced') return null;

  const getMessage = () => {
    switch (status) {
      case 'disconnected':
        return t('multiverse.connection.signalLost');
      case 'retrying':
        return `${t('multiverse.connection.recalibratingSignal')}${retryIn !== null ? ` [${retryIn}s]` : ''}`;
      case 'connecting':
      case 'connected':
        return t('multiverse.connection.establishingUplink');
      case 'failed':
        return t('multiverse.connection.uplinkFailed');
      default:
        return t('multiverse.connection.connectionInterrupted');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(26, 18, 9, 0.95)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '3rem',
          fontWeight: 200,
          letterSpacing: '0.2em',
          color: '#8b0000',
          textShadow: '0 0 30px rgba(139, 0, 0, 0.5)',
          marginBottom: '1rem',
        }}
      >
        {getMessage()}
      </div>

      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8rem',
          color: '#786850',
          marginBottom: '2rem',
        }}
      >
        {t('multiverse.connection.dataStreamFrozen')}
      </p>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button
          onClick={onReconnect}
          style={{
            padding: '0.75rem 2rem',
            background: '#8b0000',
            border: 'none',
            color: '#f0e8d8',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            fontWeight: 600,
            letterSpacing: '0.1em',
            cursor: 'pointer',
            boxShadow: '0 0 20px rgba(139, 0, 0, 0.3)',
          }}
        >
          {t('common.reconnect')}
        </button>
      </div>
    </div>
  );
}

const WORLD_COLORS: Record<string, string> = {
  claude_nation: 'var(--claude-nation-primary)',
  openai_empire: 'var(--openai-empire-primary)',
  gemini_republic: 'var(--gemini-republic-primary)',
  grok_syndicate: 'var(--grok-syndicate-primary)',
  open_frontier: 'var(--open-frontier-primary)',
};

function OpenMarketPanel() {
  const { t } = useTranslation();
  const activeOffers = useActiveOffers();

  return (
    <div
      className="panel"
      style={{
        height: 'fit-content',
        background: 'linear-gradient(180deg, var(--bg-secondary) 0%, rgba(68, 52, 32, 0.15) 100%)',
        borderTop: '1px solid rgba(201, 168, 76, 0.2)',
      }}
    >
      <div
        className="panel-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderLeft: '4px solid var(--accent-gold)',
          paddingLeft: 'calc(var(--space-sm) + 4px)',
        }}
      >
        <span>{t('multiverse.openMarket', 'OPEN MARKET')}</span>
        {activeOffers.length > 0 && (
          <span
            style={{
              fontSize: '0.625rem',
              color: 'var(--accent-gold)',
              fontWeight: 600,
            }}
          >
            {activeOffers.length} {t('multiverse.offers', 'OFFERS')}
          </span>
        )}
      </div>
      <div className="panel-content" style={{ padding: 0, maxHeight: '280px', overflowY: 'auto' }}>
        {activeOffers.length > 0 ? (
          activeOffers.map((offer) => {
            const worldColor = WORLD_COLORS[offer.sellerWorldId] || 'var(--text-muted)';
            return (
              <div
                key={offer.offerId}
                style={{
                  padding: 'var(--space-sm)',
                  borderBottom: '1px solid var(--border-color)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: '2px' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.75rem',
                        color: 'var(--text-primary)',
                        fontWeight: 600,
                      }}
                    >
                      {offer.quantity}x {t(`resources.${offer.resourceId}.name`, offer.resourceId)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem' }}>
                      <AgentName agentId={offer.sellerId} name={offer.sellerName} worldId={offer.sellerWorldId} />
                    </span>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '1px 4px',
                        fontSize: '0.5625rem',
                        fontFamily: 'var(--font-mono)',
                        color: worldColor,
                        background: `${worldColor}15`,
                        border: `1px solid ${worldColor}40`,
                        borderRadius: '2px',
                      }}
                    >
                      {offer.sellerWorldId.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.8125rem',
                      color: 'var(--accent-gold)',
                      fontWeight: 600,
                    }}
                  >
                    {offer.pricePerUnit} {offer.currency}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-dim)' }}>
                    per unit
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div
            style={{
              padding: 'var(--space-md)',
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
            }}
          >
            {t('multiverse.noOffers', 'No open offers')}
          </div>
        )}
      </div>
    </div>
  );
}

function ExchangeRates({ worlds, exchangeRates }: { worlds: WorldData[]; exchangeRates: Record<string, number> }) {
  const { t } = useTranslation();
  // Track previous rates for showing change direction
  const [prevRates, setPrevRates] = useState<Record<string, number>>({});

  useEffect(() => {
    // Store previous rates when new ones come in
    const timer = setTimeout(() => {
      setPrevRates(exchangeRates);
    }, 5000); // Update previous rates every 5 seconds
    return () => clearTimeout(timer);
  }, [exchangeRates]);

  return (
    <div
      className="panel"
      style={{
        height: 'fit-content',
        background: 'linear-gradient(180deg, var(--bg-secondary) 0%, rgba(68, 52, 32, 0.15) 100%)',
        borderTop: '1px solid rgba(201, 168, 76, 0.2)',
      }}
    >
      <div
        className="panel-header"
        style={{
          borderLeft: '4px solid var(--accent-gold)',
          paddingLeft: 'calc(var(--space-sm) + 4px)',
        }}
      >
        {t('multiverse.exchangeRates')}
      </div>
      <div className="panel-content" style={{ padding: 'var(--space-sm)' }}>
        {worlds.map((world, index) => {
          const rate = exchangeRates[world.currency.code] ?? 1;
          const prevRate = prevRates[world.currency.code] ?? rate;
          const change = rate - prevRate;
          const isBase = index === 0;

          return (
            <div
              key={world.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-xs) var(--space-sm)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8125rem',
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>
                {world.currency.symbol} {world.currency.code}
              </span>
              <span style={{ color: 'var(--text-primary)' }}>{rate.toFixed(2)}</span>
              <span
                style={{
                  color: isBase
                    ? 'var(--text-muted)'
                    : change > 0
                      ? 'var(--success)'
                      : change < 0
                        ? 'var(--error)'
                        : 'var(--text-muted)',
                  fontSize: '0.75rem',
                }}
              >
                {isBase ? t('common.base') : change !== 0 ? `${change > 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(3)}` : '─'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecentTrades() {
  const { t } = useTranslation();
  const { recentTrades } = useSocketContext();

  const displayTrades =
    recentTrades.length > 0
      ? recentTrades.slice(0, 3).map((trade) => ({
          sellerId: trade.sellerId,
          seller: trade.sellerName,
          sellerWorldId: trade.sellerWorldId,
          resource: `${trade.quantity}x ${t(`resources.${trade.resourceId}.name`, trade.resourceId)}`,
          route: `${trade.sellerWorldId.toUpperCase()} → ${trade.buyerWorldId.toUpperCase()}`,
          price: `${trade.totalPrice} ${trade.currency}`,
        }))
      : [{ sellerId: '', seller: t('multiverse.waitingForTrades'), sellerWorldId: '', resource: '', route: '', price: '' }];

  return (
    <div
      className="panel"
      style={{
        flex: 1,
        background: 'linear-gradient(180deg, var(--bg-secondary) 0%, rgba(68, 52, 32, 0.15) 100%)',
        borderTop: '1px solid rgba(201, 168, 76, 0.2)',
      }}
    >
      <div
        className="panel-header"
        style={{
          borderLeft: '4px solid var(--accent-gold)',
          paddingLeft: 'calc(var(--space-sm) + 4px)',
        }}
      >
        {t('multiverse.recentTrades')}
      </div>
      <div className="panel-content" style={{ padding: 'var(--space-sm)' }}>
        {displayTrades.map((trade, i) => (
          <div
            key={i}
            style={{
              padding: 'var(--space-sm)',
              borderBottom: i < displayTrades.length - 1 ? '1px solid var(--border-color)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                {trade.sellerId ? (
                  <AgentName agentId={trade.sellerId} name={trade.seller} worldId={trade.sellerWorldId} />
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>{trade.seller}</span>
                )}
              </span>
              {trade.price && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  @ {trade.price}
                </span>
              )}
            </div>
            {trade.resource && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {trade.resource}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                  {trade.route}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function WorldsSkeleton() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 'var(--space-md)',
      }}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <WorldCardSkeleton key={i} />
      ))}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div
      style={{
        marginTop: 'var(--space-xl)',
        padding: 'var(--space-md)',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 'var(--space-lg)',
      }}
    >
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '80px',
              height: '11px',
              borderRadius: '2px',
              background: 'var(--bg-tertiary)',
              marginBottom: '8px',
              marginLeft: 'auto',
              marginRight: 'auto',
              animation: 'pulse 1.5s infinite',
            }}
          />
          <div
            style={{
              width: '60px',
              height: '24px',
              borderRadius: '2px',
              background: 'var(--bg-tertiary)',
              marginLeft: 'auto',
              marginRight: 'auto',
              animation: 'pulse 1.5s infinite',
              animationDelay: `${i * 0.1}s`,
            }}
          />
        </div>
      ))}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}

function ExchangeRatesSkeleton() {
  const { t } = useTranslation();
  return (
    <div
      className="panel"
      style={{
        height: 'fit-content',
        background: 'linear-gradient(180deg, var(--bg-secondary) 0%, rgba(68, 52, 32, 0.15) 100%)',
        borderTop: '1px solid rgba(201, 168, 76, 0.2)',
      }}
    >
      <div
        className="panel-header"
        style={{
          borderLeft: '4px solid var(--accent-gold)',
          paddingLeft: 'calc(var(--space-sm) + 4px)',
        }}
      >
        {t('multiverse.exchangeRates')}
      </div>
      <div className="panel-content" style={{ padding: 'var(--space-sm)' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 'var(--space-xs) var(--space-sm)',
            }}
          >
            <div
              style={{
                width: '50px',
                height: '13px',
                borderRadius: '2px',
                background: 'var(--bg-tertiary)',
                animation: 'pulse 1.5s infinite',
              }}
            />
            <div
              style={{
                width: '40px',
                height: '13px',
                borderRadius: '2px',
                background: 'var(--bg-tertiary)',
                animation: 'pulse 1.5s infinite',
                animationDelay: '0.1s',
              }}
            />
            <div
              style={{
                width: '35px',
                height: '12px',
                borderRadius: '2px',
                background: 'var(--bg-tertiary)',
                animation: 'pulse 1.5s infinite',
                animationDelay: '0.2s',
              }}
            />
          </div>
        ))}
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 0.7; }
          }
        `}</style>
      </div>
    </div>
  );
}

export function Multiverse() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { worlds: socketWorlds, exchangeRates, connectionStatus, time, retryIn, reconnect } = useSocketContext();
  const [showOnboarding, setShowOnboarding] = useState(!hasSeenOnboarding());

  // Convert socket worlds to WorldData array
  const worlds: WorldData[] = Object.values(socketWorlds).map((w) => ({
    id: w.id,
    name: w.name,
    tagline: w.tagline || '',
    currency: w.currency,
    gdp: w.gdp,
    population: w.population,
    prosperityIndex: w.prosperityIndex,
    tradeBalance: w.tradeBalance,
    totalExports: 0,
    totalImports: 0,
  }));

  const hasData = worlds.length > 0;
  const [selectedWorld, setSelectedWorld] = useState<WorldId | null>(null);

  const handleWorldClick = (worldId: WorldId) => {
    navigate(`/world/${worldId}`);
  };

  const handleOpenOnboarding = () => {
    resetOnboarding();
    setShowOnboarding(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-void)' }}>
      {/* Onboarding Modal */}
      {showOnboarding && <OnboardingModal onClose={() => setShowOnboarding(false)} />}

      {/* Connection Lost Overlay */}
      <ConnectionLostOverlay status={connectionStatus} retryIn={retryIn} onReconnect={reconnect} />

      <Header gameTime={time} connectionStatus={connectionStatus} onHelpClick={handleOpenOnboarding} />
      <TradeTicker />

      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* World Grid */}
        <div style={{ flex: 1, padding: 'var(--space-lg)', overflow: 'auto' }}>
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.875rem',
                fontWeight: 600,
                letterSpacing: '0.1em',
                color: 'var(--text-muted)',
                marginBottom: 'var(--space-sm)',
              }}
            >
              {t('multiverse.title')}
            </h2>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              {t('multiverse.subtitle')}
            </p>
          </div>

          {hasData ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 'var(--space-md)',
              }}
            >
              {worlds.map((world) => (
                <WorldCard
                  key={world.id}
                  world={world}
                  selected={selectedWorld === world.id}
                  onClick={() => handleWorldClick(world.id)}
                />
              ))}
            </div>
          ) : (
            <WorldsSkeleton />
          )}

          {/* Total Stats */}
          {hasData ? (
            <div
              style={{
                marginTop: 'var(--space-xl)',
                padding: 'var(--space-md)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 0,
              }}
            >
              {[
                { label: t('multiverse.stats.totalGdp'), value: `G ${(worlds.reduce((s, w) => s + w.gdp, 0) / 1_000_000).toFixed(1)}M` },
                { label: t('multiverse.stats.totalAgents'), value: worlds.reduce((s, w) => s + w.population, 0).toLocaleString() },
                { label: t('multiverse.stats.tradeVolume24h'), value: '\u2014' },
                {
                  label: t('multiverse.stats.avgProsperity'),
                  value: `${Math.round(worlds.reduce((s, w) => s + w.prosperityIndex, 0) / worlds.length)}%`,
                },
              ].map((stat, index) => (
                <div
                  key={stat.label}
                  style={{
                    textAlign: 'center',
                    padding: 'var(--space-lg)',
                    borderLeft: index > 0 ? '1px solid var(--border-color)' : 'none',
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.6875rem',
                      color: 'var(--text-muted)',
                      marginBottom: '4px',
                    }}
                  >
                    {stat.label}
                  </div>
                  <div
                    style={{
                      fontFamily: 'Cinzel, var(--font-display)',
                      fontSize: '1.5rem',
                      color: 'var(--text-primary)',
                      textShadow: '0 1px 4px rgba(201, 168, 76, 0.15)',
                    }}
                  >
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <StatsSkeleton />
          )}
        </div>

        {/* Sidebar */}
        <aside
          style={{
            width: '320px',
            borderLeft: '1px solid var(--border-color)',
            padding: 'var(--space-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-md)',
            background: 'var(--bg-primary)',
          }}
        >
          <OpenMarketPanel />
          {hasData ? <ExchangeRates worlds={worlds} exchangeRates={exchangeRates} /> : <ExchangeRatesSkeleton />}
          <RecentTrades />
        </aside>
      </main>

      {/* Footer */}
      <footer
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(201, 168, 76, 0.05), transparent)',
          borderTop: '1px solid var(--border-color)',
          padding: 'var(--space-sm) var(--space-lg)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', gap: 'var(--space-lg)', alignItems: 'center' }}>
          {worlds.map((world) => (
            <button
              key={world.id}
              onClick={() => setSelectedWorld(world.id)}
              style={{
                background: 'none',
                border: 'none',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                color: selectedWorld === world.id ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                padding: 'var(--space-xs) var(--space-sm)',
              }}
            >
              {world.currency.symbol} {world.name.toUpperCase().split(' ')[0]}
            </button>
          ))}
        </div>
        <div
          style={{
            fontFamily: 'Cinzel, var(--font-display)',
            fontSize: '0.6875rem',
            color: 'var(--text-dim)',
            letterSpacing: '0.05em',
          }}
        >
          AGENTROPOLIS KINGDOMS • {t('multiverse.spectatorMode')}
        </div>
      </footer>
    </div>
  );
}
