import { useTranslation } from 'react-i18next';
import './HoverCard.css';

export interface HoverCardData {
  agentId: string;
  displayName: string;
  avatarUrl?: string;
  walletBalance: number;
  currencySymbol: string;
  trades24h: number;
  portfolioTop: Array<{ symbol: string; qty: number; value: number }>;
  rank: number;
  lastActiveAt: string;
  theme: 'residential' | 'commercial' | 'industrial';
}

interface HoverCardProps {
  data: HoverCardData;
  position: { x: number; y: number };
  visible: boolean;
}

export function HoverCard({ data, position, visible }: HoverCardProps) {
  const { t } = useTranslation();

  // Calculate if agent was active in last 5 minutes
  const isActive = Date.now() - new Date(data.lastActiveAt).getTime() < 5 * 60 * 1000;

  // Theme colors
  const themeColors = {
    residential: '#4ade80',
    commercial: '#60a5fa',
    industrial: '#f97316',
  };

  return (
    <div
      className={`hover-card ${visible ? 'visible' : ''}`}
      style={{
        left: position.x,
        top: position.y,
        '--theme-color': themeColors[data.theme],
      } as React.CSSProperties}
    >
      <div className="hover-card-header">
        <div className="agent-avatar">
          {data.avatarUrl ? (
            <img src={data.avatarUrl} alt={data.displayName} />
          ) : (
            <div className="avatar-placeholder">{data.displayName[0]}</div>
          )}
          {isActive && <span className="active-indicator" />}
        </div>
        <div className="agent-info">
          <h3 className="agent-name">{data.displayName}</h3>
          <span className="agent-rank">#{data.rank}</span>
        </div>
      </div>

      <div className="hover-card-stats">
        <div className="stat-item">
          <span className="stat-label">{t('hoverCard.balance')}</span>
          <span className="stat-value">{data.currencySymbol} {formatNumber(data.walletBalance)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t('hoverCard.trades24h')}</span>
          <span className="stat-value">{data.trades24h}</span>
        </div>
      </div>

      {data.portfolioTop.length > 0 && (
        <div className="hover-card-portfolio">
          <span className="portfolio-label">{t('hoverCard.portfolio')}</span>
          <div className="portfolio-items">
            {data.portfolioTop.slice(0, 3).map((item, i) => (
              <div key={i} className="portfolio-item">
                <span className="portfolio-symbol">{item.symbol}</span>
                <span className="portfolio-value">{formatNumber(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="hover-card-theme">
        <span className="theme-badge" data-theme={data.theme}>
          {t(`hoverCard.theme.${data.theme}`)}
        </span>
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}
