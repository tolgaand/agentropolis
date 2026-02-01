import { useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePrices, useConnectionStatus } from '../socket';

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

// Resource emoji mapping - names come from i18n
const RESOURCE_EMOJIS: Record<string, string> = {
  food: '🌾',
  wood: '🪵',
  stone: '🪨',
  iron: '⚔️',
  gold: '🪙',
  diamond: '💎',
};

// Mapping from worldId to currency code
const WORLD_CURRENCIES: Record<string, string> = {
  claude_nation: 'CLD',
  openai_empire: 'GPT',
  gemini_republic: 'GMN',
  grok_syndicate: 'GRK',
  open_frontier: 'OPN',
};

/**
 * Fisher-Yates shuffle with no-adjacent-duplicate rule.
 * Prevents items with the same key from appearing next to each other.
 */
function shuffleNoAdjacent<T>(items: T[], getKey: (item: T) => string): T[] {
  if (items.length <= 1) return [...items];

  const arr = [...items];

  // Fisher-Yates shuffle
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  // Fix adjacent duplicates
  for (let i = 1; i < arr.length; i++) {
    if (getKey(arr[i]) === getKey(arr[i - 1])) {
      // Find a non-adjacent swap candidate
      for (let j = i + 1; j < arr.length; j++) {
        const candidateKey = getKey(arr[j]);
        const prevKey = getKey(arr[i - 1]);
        const nextKey = j + 1 < arr.length ? getKey(arr[j + 1]) : null;

        // Candidate must not match previous item at position i-1
        // and must not create new adjacent duplicate at position j
        if (candidateKey !== prevKey && (nextKey === null || candidateKey !== nextKey)) {
          [arr[i], arr[j]] = [arr[j], arr[i]];
          break;
        }
      }
    }
  }

  return arr;
}

function PriceItem({ data }: { data: PriceDisplayData }) {
  const isUp = data.change > 0;
  const isDown = data.change < 0;
  const color = isUp ? 'var(--success)' : isDown ? 'var(--error)' : 'var(--text-muted)';
  const arrow = isUp ? '\u25B2' : isDown ? '\u25BC' : '\u2500';
  const symbol = CURRENCY_SYMBOLS[data.currency] || data.currency;

  return (
    <span
      className="ticker-item"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-xs)',
        padding: '0 var(--space-lg)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.8125rem',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <span style={{ color }}>{arrow}</span>
      <span style={{ color: 'var(--text-secondary)' }}>{data.name}</span>
      <span style={{ color: 'var(--text-primary)' }}>{data.price.toFixed(1)}</span>
      <span style={{ color: 'var(--text-muted)' }}>{symbol}</span>
      <span style={{ color, fontSize: '0.75rem' }}>
        ({isUp ? '+' : ''}{data.change.toFixed(1)}%)
      </span>
    </span>
  );
}

function LoadingTicker() {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        paddingLeft: '130px',
        height: '36px',
        gap: 'var(--space-lg)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8125rem',
          color: 'var(--text-muted)',
          animation: 'pulse 1.5s infinite',
        }}
      >
        {t('tradeTicker.awaitingMarketData')}
      </span>
    </div>
  );
}

// CSS for GPU-accelerated ticker animation
const tickerStyles = `
  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
  }

  @keyframes ticker-scroll {
    0% {
      transform: translate3d(0, 0, 0);
    }
    100% {
      transform: translate3d(-50%, 0, 0);
    }
  }

  .ticker-strip {
    display: flex;
    align-items: center;
    height: 36px;
    will-change: transform;
    animation: ticker-scroll var(--ticker-duration, 60s) linear infinite;
    backface-visibility: hidden;
    perspective: 1000px;
  }

  .ticker-strip:hover {
    animation-play-state: paused;
  }
`;

export function TradeTicker() {
  const { t } = useTranslation();
  const { prices } = usePrices();
  const connectionStatus = useConnectionStatus();

  // Use ref to maintain stable item order across price updates
  // Format: "worldId:resourceId" to create unique composite keys
  const itemOrderRef = useRef<string[]>([]);

  // Only update order when the set of items changes (not on price updates)
  useEffect(() => {
    const currentKeys = Object.keys(prices);
    const currentSet = new Set(currentKeys);
    const prevSet = new Set(itemOrderRef.current);

    // Check if items have changed (different count or different keys)
    const itemsChanged =
      currentKeys.length !== itemOrderRef.current.length ||
      currentKeys.some((key) => !prevSet.has(key)) ||
      itemOrderRef.current.some((key) => !currentSet.has(key));

    if (itemsChanged && currentKeys.length > 0) {
      // Shuffle and store the new order
      itemOrderRef.current = shuffleNoAdjacent(currentKeys, (key) => {
        // Extract resourceId from the composite key for no-adjacent rule
        const price = prices[key];
        return price?.resourceId || key;
      });
    }
  }, [prices]);

  // Map ordered keys to current price data - updates in place without re-shuffling
  const shuffledItems: PriceDisplayData[] = useMemo(() => {
    return itemOrderRef.current
      .map((key) => {
        const p = prices[key];
        if (!p) return null;
        const emoji = RESOURCE_EMOJIS[p.resourceId] || '';
        const translatedName = t(`resources.${p.resourceId}.name`, p.resourceId);
        return {
          resourceId: p.resourceId,
          name: emoji ? `${emoji} ${translatedName}` : translatedName,
          price: p.price ?? 0,
          change: p.change24h ?? 0,
          currency: WORLD_CURRENCIES[p.worldId] || 'OPN',
        };
      })
      .filter((item): item is PriceDisplayData => item !== null);
  }, [prices, t]);

  // Calculate animation duration based on item count
  // Base speed: ~100 pixels per second for engaging visuals
  const itemCount = shuffledItems.length;
  const estimatedItemWidth = 180; // approximate width of each price item in pixels
  const totalWidth = itemCount * estimatedItemWidth;
  const pixelsPerSecond = 100; // Fast enough to be engaging
  // Duration for half the content (since we translate -50%)
  const duration = itemCount > 0 ? Math.max(10, totalWidth / pixelsPerSecond) : 25;

  const hasData = shuffledItems.length > 0;
  const isConnected = connectionStatus === 'synced';

  return (
    <div
      style={{
        background: 'linear-gradient(90deg, var(--bg-tertiary) 0%, rgba(68, 52, 32, 0.4) 50%, var(--bg-tertiary) 100%)',
        borderTop: '1px solid rgba(201, 168, 76, 0.2)',
        borderBottom: '1px solid rgba(201, 168, 76, 0.2)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Inject ticker animation styles */}
      <style>{tickerStyles}</style>

      {/* Label */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '120px',
          background: 'linear-gradient(90deg, var(--bg-tertiary) 80%, transparent)',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 'var(--space-md)',
          zIndex: 10,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.6875rem',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: isConnected && hasData ? 'var(--accent-gold)' : 'var(--text-muted)',
            textShadow: isConnected && hasData ? '0 0 5px rgba(201, 168, 76, 0.5)' : 'none',
          }}
        >
          {isConnected ? t('tradeTicker.livePrices') : t('tradeTicker.offline')}
        </span>
      </div>

      {/* Scrolling Ticker or Loading State */}
      {hasData ? (
        <div
          className="ticker-strip"
          style={{
            paddingLeft: '130px',
            '--ticker-duration': `${duration}s`,
          } as React.CSSProperties}
        >
          {/* Triple the items for seamless loop - ensures smooth wrap */}
          {[...shuffledItems, ...shuffledItems].map((p, i) => (
            <PriceItem key={`${p.resourceId}-${i}`} data={p} />
          ))}
        </div>
      ) : (
        <LoadingTicker />
      )}
    </div>
  );
}
