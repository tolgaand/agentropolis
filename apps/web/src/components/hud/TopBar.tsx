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

type DisplayMode = 'offline' | 'stub' | 'real';

const MODE_STYLE: Record<DisplayMode, { label: string; color: string; bg: string; glow: string }> = {
  offline: { label: 'OFFLINE', color: 'var(--text-muted)',  bg: 'rgba(96,96,120,0.10)', glow: 'none' },
  stub:    { label: 'STUB',    color: 'var(--warning)',     bg: 'rgba(234,179,8,0.10)',  glow: '0 0 8px rgba(234,179,8,0.3)' },
  real:    { label: 'LIVE',    color: 'var(--neon-cyan)',   bg: 'rgba(0,255,255,0.08)',  glow: '0 0 8px rgba(0,255,255,0.4)' },
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
      {/* Bottom neon accent line */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 2,
        background: tickPulse
          ? 'linear-gradient(90deg, var(--neon-cyan), rgba(0,255,255,0.6), var(--neon-cyan))'
          : 'linear-gradient(90deg, var(--neon-cyan), rgba(0,255,255,0.15), transparent 60%)',
        opacity: tickPulse ? 1 : 0.8,
        transition: 'all 0.3s ease',
      }} />

      {/* Scan line overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,255,0.02) 2px, rgba(0,255,255,0.02) 4px)',
        pointerEvents: 'none',
      }} />

      {/* Left: Logo + mode badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Neon accent tick */}
        <div style={{
          width: 3, height: 18,
          background: 'var(--neon-cyan)',
          boxShadow: '0 0 8px var(--neon-cyan)',
          flexShrink: 0,
        }} />

        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: 15,
          fontWeight: 700,
          color: '#fff',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          textShadow: '0 0 10px rgba(0,255,255,0.4), 0 0 20px rgba(0,255,255,0.2)',
        }}>
          AGENTROPOLIS
        </span>

        {/* Mode badge - angular clip */}
        <span style={{
          fontSize: 9,
          fontWeight: 600,
          fontFamily: 'var(--font-mono)',
          color: ms.color,
          background: ms.bg,
          padding: '3px 10px',
          border: `1px solid ${ms.color}`,
          borderRadius: 0,
          clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))',
          letterSpacing: '0.10em',
          boxShadow: ms.glow,
          textShadow: `0 0 6px ${ms.color}`,
        }}>
          {ms.label}
        </span>

        {/* Season badge (from metrics) */}
        {metrics?.season && (
          <span style={{
            fontSize: 8,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            {metrics.season}
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
          <MetricChip label="AGT" value={metrics.agentCount} color="var(--neon-magenta)" />
          <MetricChip label="TRS" value={`$${metrics.treasury}`} color="var(--neon-cyan)" />
          <MetricChip label="UMP" value={`${Math.round(metrics.unemploymentRate * 100)}%`} color="var(--warning)" />
          <MetricChip label="CRM" value={`${Math.round(metrics.crimeRateLast10 * 100)}%`} color="var(--neon-red)" />
        </div>
      )}

      {/* Right: Status cluster */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {/* Tick counter */}
        {currentTick > 0 && (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{
              fontSize: 9,
              fontWeight: 600,
              color: 'var(--text-muted)',
              letterSpacing: '0.10em',
            }}>TICK</span>
            <span style={{
              color: tickPulse ? '#fff' : 'var(--neon-cyan)',
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              textShadow: tickPulse
                ? '0 0 12px var(--neon-cyan), 0 0 20px rgba(0,255,255,0.6)'
                : '0 0 6px rgba(0,255,255,0.5)',
              transition: 'all 0.3s ease',
            }}>{currentTick}</span>
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
              ? '0 0 8px var(--success), 0 0 16px rgba(34,197,94,0.3)'
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
      <span style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{
        color,
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        textShadow: `0 0 4px ${color}`,
      }}>{value}</span>
    </div>
  );
}
