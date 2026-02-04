/**
 * TopBar - Dystopian cyberpunk navigation bar.
 * Neon-cyan accents, Orbitron display font, scan-line overlay,
 * angular clip-path corners, world-colored glow.
 *
 * Wired to socket context for mode, tickNo, connection state, and city metrics.
 */
import {
  useConnectionStatus,
  useCurrentTick,
  useCitySync,
  useCityMetrics,
  useTickPulse,
  useSpectatorCount,
} from '../../socket/socket.context';
import type { ConnectionStatus } from '../../socket/socket.context';
import { formatGameTime } from '../../utils/gameTime';

type DisplayMode = 'offline' | 'stub' | 'real';

const MODE_STYLE: Record<DisplayMode, { label: string; color: string; bg: string; glow: string }> = {
  offline: { label: 'OFFLINE', color: 'var(--text-muted)',  bg: 'rgba(96,96,120,0.08)', glow: 'none' },
  stub:    { label: 'STUB',    color: 'var(--warning)',     bg: 'rgba(245,208,98,0.08)',  glow: 'none' },
  real:    { label: 'LIVE',    color: 'var(--neon-cyan)',   bg: 'rgba(127,220,255,0.06)',  glow: 'none' },
};

function getDisplayMode(connectionStatus: ConnectionStatus, cityMode?: string): DisplayMode {
  if (connectionStatus !== 'synced' && connectionStatus !== 'connected') return 'offline';
  if (cityMode === 'stub') return 'stub';
  return 'real';
}

function connectionLabel(status: ConnectionStatus): string {
  switch (status) {
    case 'synced': return 'CONNECTED';
    case 'connected': return 'SYNCING';
    case 'connecting': return 'CONNECTING';
    case 'retrying': return 'RETRYING';
    case 'disconnected': return 'DISCONNECTED';
    case 'failed': return 'FAILED';
    default: return 'LOCAL';
  }
}

export function TopBar(): JSX.Element {
  const connectionStatus = useConnectionStatus();
  const currentTick = useCurrentTick();
  const citySync = useCitySync();
  const metrics = useCityMetrics();
  const tickPulse = useTickPulse();
  const spectatorCount = useSpectatorCount();

  const mode = getDisplayMode(connectionStatus, citySync?.mode);
  const ms = MODE_STYLE[mode];
  const isConnected = connectionStatus === 'synced';

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 48,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      background: 'linear-gradient(180deg, rgba(5,5,10,0.92) 0%, rgba(5,5,10,0.6) 80%, transparent 100%)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      pointerEvents: 'auto',
      zIndex: 20,
    }}>
      {/* Bottom accent line — subtle */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 1,
        background: tickPulse
          ? 'linear-gradient(90deg, rgba(127,220,255,0.4), rgba(127,220,255,0.15), transparent 70%)'
          : 'linear-gradient(90deg, rgba(127,220,255,0.2), rgba(127,220,255,0.06), transparent 50%)',
        transition: 'all 0.5s ease',
      }} />

      {/* Left: Logo + mode badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Accent bar */}
        <div style={{
          width: 2, height: 16,
          background: 'var(--neon-cyan)',
          opacity: 0.6,
          flexShrink: 0,
        }} />

        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: 14,
          fontWeight: 600,
          color: 'rgba(255, 255, 255, 0.92)',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}>
          AGENTROPOLIS
        </span>

        {/* Mode badge */}
        <span style={{
          fontSize: 8,
          fontWeight: 600,
          fontFamily: 'var(--font-mono)',
          color: ms.color,
          background: ms.bg,
          padding: '2px 8px',
          border: `1px solid ${ms.color}`,
          borderRadius: 2,
          letterSpacing: '0.08em',
          opacity: 0.8,
        }}>
          {ms.label}
        </span>

        {/* Agent count (from metrics) */}
        {metrics && (
          <span style={{
            fontSize: 8,
            fontFamily: 'var(--font-mono)',
            color: 'rgba(255, 255, 255, 0.35)',
            letterSpacing: '0.06em',
          }}>
            {metrics.agentCount} agents
          </span>
        )}
      </div>

      {/* Center: Compact metrics (when available) */}
      {metrics && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
        }}>
          <MetricChip label="Treasury" value={`$${formatTreasury(metrics.treasury)}`} color="var(--neon-cyan)" />
          <MetricChip label="Unemployed" value={`${Math.round(metrics.unemploymentRate * 100)}%`} color="var(--warning)" />
          <MetricChip label="Needs" value={`${Math.round((metrics.avgNeeds.hunger + metrics.avgNeeds.rest + metrics.avgNeeds.fun) / 3)}`} color="var(--neon-magenta)" />
          <MetricChip label="Crime" value={`${Math.round(metrics.crimeRateLast10 * 100)}%`} color="var(--neon-red)" />
          <MetricChip
            label="Business"
            value={`${metrics.openBusinesses + metrics.closedBusinesses > 0 ? Math.round((metrics.openBusinesses / (metrics.openBusinesses + metrics.closedBusinesses)) * 100) : 100}%`}
            color="var(--success)"
          />
        </div>
      )}

      {/* Right: Status cluster */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {/* Game time — human-readable */}
        {currentTick > 0 && (
          <div style={{
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: tickPulse ? '#fff' : 'rgba(255, 255, 255, 0.85)',
              transition: 'color 0.3s ease',
            }}>
              {formatGameTime(currentTick, metrics?.season)}
            </span>
            {/* T{tick} omitted — debug info not for spectators */}
          </div>
        )}

        {/* Spectator count */}
        {spectatorCount > 0 && (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            <span style={{ fontSize: 10 }}>{spectatorCount}</span>
            <span style={{ letterSpacing: '0.06em' }}>SPEC</span>
          </div>
        )}

        {/* Connection indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8,
            borderRadius: '50%',
            background: isConnected ? 'var(--success)' : mode === 'offline' ? 'var(--text-muted)' : 'var(--neon-red)',
            boxShadow: isConnected
              ? '0 0 4px var(--success)'
              : 'none',
            animation: isConnected ? 'status-pulse 2s ease-in-out infinite' : 'none',
          }} />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-muted)',
            letterSpacing: '0.06em',
          }}>
            {connectionLabel(connectionStatus)}
          </span>
        </div>
      </div>
    </div>
  );
}

function MetricChip({ label, value, color }: { label: string; value: string | number; color: string }): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em', fontSize: 8 }}>{label}</span>
      <span style={{
        color,
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
    </div>
  );
}

function formatTreasury(amount: number): string {
  if (amount >= 10000) return `${(amount / 1000).toFixed(1)}K`;
  return String(amount);
}
