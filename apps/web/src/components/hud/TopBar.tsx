/**
 * TopBar HUD - Game title, clock, global stats, connection LED
 * V2: No world selector - single unified world with factions
 */

import { useSocketContext } from '../../socket';

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
  morning: '\u2600',
  day: '\u2600',
  evening: '\u{1F305}',
  night: '\u{1F319}',
};

export function TopBar() {
  const { connected, worlds, time } = useSocketContext();

  // Aggregate stats across all worlds/factions
  const allWorlds = Object.values(worlds);
  const totalGdp = allWorlds.reduce((sum, w) => sum + (w?.gdp || 0), 0);
  const totalPop = allWorlds.reduce((sum, w) => sum + (w?.population || 0), 0);
  const avgProsperity = allWorlds.length > 0
    ? Math.round(allWorlds.reduce((sum, w) => sum + (w?.prosperityIndex || 0), 0) / allWorlds.length)
    : 0;

  return (
    <div style={styles.container}>
      {/* Game Title */}
      <div style={styles.left}>
        <span style={styles.title}>AGENTROPOLIS</span>
      </div>

      {/* Clock */}
      <div style={styles.center}>
        {time && (
          <div style={styles.clock}>
            <span style={styles.clockLabel}>DAY</span>
            <span style={styles.clockValue}>{time.day}</span>
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
          <span style={styles.statValue}>{formatNumber(totalGdp)}</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.stat}>
          <span style={styles.statLabel}>POP</span>
          <span style={styles.statValue}>{totalPop}</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.stat}>
          <span style={styles.statLabel}>PROSP</span>
          <span style={styles.statValue}>{avgProsperity}%</span>
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
    pointerEvents: 'auto',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    minWidth: '200px',
  },
  title: {
    color: '#c9a84c',
    fontWeight: 700,
    fontSize: '0.875rem',
    letterSpacing: '0.15em',
    textShadow: '0 0 12px rgba(201,168,76,0.4)',
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
    color: '#c9a84c',
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
