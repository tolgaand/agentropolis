/**
 * TopBar HUD - World selector, clock, GDP/pop/prosperity stats, connection LED
 */

import type { WorldId } from '@agentropolis/shared';
import { useSocketContext } from '../../socket';

const WORLD_LIST: { id: WorldId; name: string; color: string }[] = [
  { id: 'claude_nation' as WorldId, name: 'Claude Nation', color: '#8b5cf6' },
  { id: 'openai_empire' as WorldId, name: 'OpenAI Empire', color: '#10b981' },
  { id: 'gemini_republic' as WorldId, name: 'Gemini Republic', color: '#06b6d4' },
  { id: 'grok_syndicate' as WorldId, name: 'Grok Syndicate', color: '#f59e0b' },
  { id: 'open_frontier' as WorldId, name: 'Open Frontier', color: '#ef4444' },
];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function getPhaseFromHour(hour: number): string {
  if (hour >= 5 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 17) return 'day';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

const PHASE_ICONS: Record<string, string> = {
  morning: '\u2600',   // sun
  day: '\u2600',
  evening: '\u{1F305}',
  night: '\u{1F319}',
};

interface TopBarProps {
  worldId: WorldId;
  onWorldChange: (worldId: WorldId) => void;
  worldColor: string;
}

export function TopBar({ worldId, onWorldChange, worldColor }: TopBarProps) {
  const { connected, worlds, time } = useSocketContext();
  const world = worlds[worldId];

  const gdp = world?.gdp || 0;
  const population = world?.population || 0;
  const prosperity = world?.prosperityIndex || 0;

  return (
    <div style={styles.container}>
      {/* World Selector */}
      <div style={styles.left}>
        <select
          value={worldId}
          onChange={(e) => onWorldChange(e.target.value as WorldId)}
          style={{
            ...styles.worldSelect,
            color: worldColor,
            borderColor: `${worldColor}60`,
          }}
        >
          {WORLD_LIST.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      {/* Clock */}
      <div style={styles.center}>
        {time && (
          <div style={styles.clock}>
            <span style={styles.clockLabel}>DAY</span>
            <span style={{ ...styles.clockValue, color: worldColor }}>{time.day}</span>
            <span style={styles.clockTime}>
              {String(time.hour).padStart(2, '0')}:{String(time.minute).padStart(2, '0')}
            </span>
            <span style={styles.phaseIcon}>
              {PHASE_ICONS[getPhaseFromHour(time.hour)] || ''}
            </span>
          </div>
        )}
      </div>

      {/* Stats + Connection */}
      <div style={styles.right}>
        <div style={styles.stat}>
          <span style={styles.statLabel}>GDP</span>
          <span style={styles.statValue}>{formatNumber(gdp)}</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.stat}>
          <span style={styles.statLabel}>POP</span>
          <span style={styles.statValue}>{population}</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.stat}>
          <span style={styles.statLabel}>PROSP</span>
          <span style={styles.statValue}>{prosperity}%</span>
        </div>
        <div
          style={{
            ...styles.connectionLed,
            background: connected ? 'var(--success, #10b981)' : 'var(--error, #ef4444)',
            boxShadow: connected ? '0 0 6px var(--success, #10b981)' : 'none',
          }}
        />
      </div>

      <style>{topBarKeyframes}</style>
    </div>
  );
}

const topBarKeyframes = `
  @keyframes topbar-led-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '48px',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    background: 'linear-gradient(180deg, rgba(10,10,20,0.95) 0%, rgba(10,10,20,0.7) 80%, transparent 100%)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    backdropFilter: 'blur(8px)',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '0.75rem',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    minWidth: '200px',
  },
  worldSelect: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid',
    borderRadius: '2px',
    padding: '4px 8px',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '0.75rem',
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    outline: 'none',
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clock: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  clockLabel: {
    color: 'var(--text-muted, #666)',
    fontSize: '0.625rem',
    letterSpacing: '0.1em',
  },
  clockValue: {
    fontWeight: 700,
    fontSize: '0.875rem',
  },
  clockTime: {
    color: 'var(--text-secondary, #999)',
    marginLeft: '4px',
  },
  phaseIcon: {
    fontSize: '0.875rem',
    marginLeft: '4px',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: '200px',
    justifyContent: 'flex-end',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1px',
  },
  statLabel: {
    fontSize: '0.5rem',
    color: 'var(--text-muted, #666)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: '0.8125rem',
    color: 'var(--text-primary, #eee)',
    fontWeight: 600,
  },
  statDivider: {
    width: '1px',
    height: '24px',
    background: 'rgba(255,255,255,0.1)',
  },
  connectionLed: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    marginLeft: '8px',
    animation: 'topbar-led-pulse 2s infinite',
  },
};
