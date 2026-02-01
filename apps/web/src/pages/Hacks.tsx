import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
// TODO: Convert this page to Battles page using new medieval types
// import type { BattleEvent, BattleResolvedEvent, SiegeEvent } from '@agentropolis/shared';
import {
  useSocketContext,
  // useActiveNetRuns,
  // useRecentHacks,
  // useActiveBounties,
  type ConnectionStatus,
} from '../socket';
import { AgentName } from '../components/AgentDossier';

// Temporary types for backwards compatibility
interface NetRunEvent {
  runId: string;
  attackerId: string;
  attackerName: string;
  attackerWorldId: string;
  targetId: string;
  targetName: string;
  targetWorldId: string;
  approach: string;
  status: string;
  progress: number;
  traceLevel: number;
}

interface NetRunCompletedEvent extends NetRunEvent {
  lootCredits: number;
  completedAt: string;
}

interface BountyEvent {
  bountyId: string;
  targetId: string;
  targetName: string;
  targetWorldId: string;
  reward: number;
  reason: string;
  posterName: string;
}

// World colors mapping
const WORLD_COLORS: Record<string, string> = {
  claude_nation: 'var(--claude-primary)',
  openai_empire: 'var(--openai-primary)',
  gemini_republic: 'var(--gemini-primary)',
  grok_syndicate: 'var(--grok-primary)',
  open_frontier: 'var(--open-primary)',
};

interface HackingOverview {
  totalRuns: number;
  activeRuns: number;
  successfulRuns: number;
  detectedRuns: number;
  successRate: number;
  totalCreditsStolen: number;
  totalBounties: number;
  activeBounties: number;
}

interface HackerEntry {
  agentId: string;
  name: string;
  worldId: string;
  successCount: number;
  totalLoot: number;
}

interface MostWantedEntry {
  agentId: string;
  name: string;
  worldId: string;
  totalBounty: number;
  bountyCount: number;
}

interface HackingStats {
  overview: HackingOverview;
  topHackers: HackerEntry[];
  mostWanted: MostWantedEntry[];
}

function Header({ connectionStatus }: { connectionStatus: ConnectionStatus }) {
  const isLive = connectionStatus === 'synced';

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
        <Link
          to="/multiverse"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            color: 'var(--accent-gold)',
            textDecoration: 'none',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            opacity: 0.8,
          }}
        >
          ← MULTIVERSE
        </Link>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.25rem',
            fontWeight: 800,
            letterSpacing: '0.1em',
            color: 'var(--accent-crimson)',
            textShadow: '0 0 10px var(--accent-crimson)',
          }}
        >
          BATTLE CHRONICLES
        </h1>
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
          {isLive ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>
    </header>
  );
}

function WorldBadge({ worldId }: { worldId: string }) {
  const worldName = worldId.split('_')[0].toUpperCase();
  const color = WORLD_COLORS[worldId] || 'var(--text-muted)';

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 6px',
        fontSize: '0.625rem',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        letterSpacing: '0.05em',
        color,
        background: `${color}15`,
        border: `1px solid ${color}40`,
        borderRadius: '2px',
      }}
    >
      {worldName}
    </span>
  );
}

function ProgressBar({
  progress,
  color = 'var(--accent-gold)',
  label,
}: {
  progress: number;
  color?: string;
  label?: string;
}) {
  return (
    <div style={{ marginTop: 'var(--space-xs)' }}>
      {label && (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.625rem',
            color: 'var(--text-muted)',
            marginBottom: '2px',
          }}
        >
          {label}
        </div>
      )}
      <div
        style={{
          width: '100%',
          height: '4px',
          background: 'var(--bg-tertiary)',
          borderRadius: '2px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.min(100, Math.max(0, progress))}%`,
            height: '100%',
            background: color,
            transition: 'width 0.3s ease',
            boxShadow: `0 0 8px ${color}`,
          }}
        />
      </div>
    </div>
  );
}

function NetRunCard({ run }: { run: NetRunEvent }) {
  const getApproachColor = (approach: string) => {
    switch (approach) {
      case 'stealth':
        return 'var(--accent-forest)';
      case 'brute':
        return 'var(--accent-crimson)';
      case 'social':
        return 'var(--accent-gold)';
      default:
        return 'var(--text-muted)';
    }
  };

  const getStatusText = (status: string, progress: number, trace: number) => {
    if (status === 'extracting') return 'PLUNDERING...';
    if (trace > 80) return 'DEFENSE CRITICAL!';
    if (progress > 80) return 'VICTORY NEAR...';
    return 'ADVANCING...';
  };

  return (
    <div
      style={{
        padding: 'var(--space-md)',
        borderBottom: '1px solid var(--border-color)',
        background: run.traceLevel > 80 ? 'rgba(255, 68, 68, 0.05)' : 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-sm)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
              <AgentName agentId={run.attackerId} name={run.attackerName} worldId={run.attackerWorldId} />
            </span>
            <WorldBadge worldId={run.attackerWorldId} />
          </div>
        </div>

        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            color: 'var(--accent-crimson)',
            animation: 'pulse 1.5s infinite',
          }}
        >
          → ATTACKING →
        </div>

        <div style={{ flex: 1, textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--space-xs)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
              <AgentName agentId={run.targetId} name={run.targetName} worldId={run.targetWorldId} />
            </span>
            <WorldBadge worldId={run.targetWorldId} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-sm)' }}>
        <div style={{ flex: 1 }}>
          <ProgressBar progress={run.progress} color="var(--accent-gold)" label="PROGRESS" />
        </div>
        <div style={{ flex: 1 }}>
          <ProgressBar progress={run.traceLevel} color="var(--accent-crimson)" label="DEFENSE" />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.625rem',
            color: getApproachColor(run.approach),
            textTransform: 'uppercase',
            padding: '2px 6px',
            background: `${getApproachColor(run.approach)}15`,
            border: `1px solid ${getApproachColor(run.approach)}40`,
            borderRadius: '2px',
          }}
        >
          {run.approach}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.625rem',
            color: run.traceLevel > 80 ? 'var(--accent-crimson)' : 'var(--text-secondary)',
          }}
        >
          {getStatusText(run.status, run.progress, run.traceLevel)}
        </span>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

function RecentHackCard({ hack }: { hack: NetRunCompletedEvent }) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return { icon: '✓', color: 'var(--accent-gold)' };
      case 'detected':
        return { icon: '✗', color: 'var(--accent-crimson)' };
      default:
        return { icon: '—', color: 'var(--text-muted)' };
    }
  };

  const status = getStatusIcon(hack.status);
  const timeAgo = new Date(hack.completedAt).toLocaleTimeString();

  return (
    <div
      style={{
        padding: 'var(--space-sm)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-sm)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '1rem',
          color: status.color,
          width: '16px',
          textAlign: 'center',
        }}
      >
        {status.icon}
      </span>

      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: '2px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
            <AgentName agentId={hack.attackerId} name={hack.attackerName} worldId={hack.attackerWorldId} />
          </span>
          <WorldBadge worldId={hack.attackerWorldId} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--text-muted)' }}>→</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
            <AgentName agentId={hack.targetId} name={hack.targetName} worldId={hack.targetWorldId} />
          </span>
          <WorldBadge worldId={hack.targetWorldId} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {hack.status === 'success' && hack.lootCredits > 0 ? (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--accent-gold)' }}>
              +{hack.lootCredits.toLocaleString()} credits
            </span>
          ) : (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--text-muted)' }}>
              {hack.status.toUpperCase()}
            </span>
          )}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--text-dim)' }}>
            {timeAgo}
          </span>
        </div>
      </div>
    </div>
  );
}

function BountyCard({ bounty }: { bounty: BountyEvent }) {
  return (
    <div
      style={{
        padding: 'var(--space-sm)',
        borderBottom: '1px solid var(--border-color)',
        background: 'rgba(255, 68, 68, 0.03)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
            <AgentName agentId={bounty.targetId} name={bounty.targetName} worldId={bounty.targetWorldId} />
          </span>
          <WorldBadge worldId={bounty.targetWorldId} />
        </div>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.875rem',
            color: 'var(--accent-gold)',
            fontWeight: 600,
          }}
        >
          {bounty.reward.toLocaleString()}
        </span>
      </div>

      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.625rem',
          color: 'var(--text-secondary)',
          marginBottom: '4px',
        }}
      >
        {bounty.reason}
      </div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--text-muted)' }}>
        Posted by {bounty.posterName}
      </div>
    </div>
  );
}

interface NetRunDetail {
  id: string;
  attackerId: string;
  attackerWorldId: string;
  targetId: string;
  targetWorldId: string;
  approach: string;
  status: string;
  progress: number;
  traceLevel: number;
  lootCredits: number;
  tickCount: number;
  maxTicks: number;
  log: Array<{ tick: number; event: string; type: string }>;
  startedAt: string;
  completedAt?: string;
  attackerName?: string;
  targetName?: string;
}

function NetRunDetailModal({
  runId,
  onClose,
}: {
  runId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<NetRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/hacking/netruns/${runId}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setDetail(json.data);
        } else {
          setError(json.error?.message || 'Failed to load');
        }
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, [runId]);

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'success':
        return { color: 'var(--accent-gold)', label: 'VICTORY COMPLETE', glow: 'rgba(201, 168, 76, 0.3)' };
      case 'detected':
        return { color: 'var(--accent-crimson)', label: 'DEFEATED — DEFENSE HELD', glow: 'rgba(139, 0, 0, 0.3)' };
      case 'failed':
      case 'timeout':
        return { color: 'var(--accent-bronze)', label: 'RAID FAILED', glow: 'rgba(205, 127, 50, 0.3)' };
      case 'active':
      case 'extracting':
        return { color: 'var(--accent-gold)', label: 'IN PROGRESS', glow: 'rgba(201, 168, 76, 0.3)' };
      case 'aborted':
        return { color: 'var(--text-muted)', label: 'ABORTED', glow: 'rgba(100, 100, 130, 0.3)' };
      default:
        return { color: 'var(--text-muted)', label: status.toUpperCase(), glow: 'rgba(100, 100, 130, 0.3)' };
    }
  };

  const getLogEntryColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'var(--accent-gold)';
      case 'warning':
        return 'var(--accent-bronze)';
      case 'danger':
        return 'var(--accent-crimson)';
      default:
        return 'var(--text-secondary)';
    }
  };

  const getApproachDescription = (approach: string) => {
    switch (approach) {
      case 'stealth':
        return 'COVERT ADVANCE — Slow progress, minimal detection';
      case 'brute':
        return 'FULL ASSAULT — Fast progress, high defense risk';
      case 'social':
        return 'DIPLOMATIC TACTICS — Balanced approach, moderate defense';
      default:
        return approach.toUpperCase();
    }
  };

  const statusStyle = detail ? getStatusStyle(detail.status) : null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(5, 5, 10, 0.92)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-lg)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '85vh',
          overflowY: 'auto',
          background: 'var(--bg-primary)',
          border: `1px solid ${statusStyle?.color || 'var(--border-color)'}`,
          boxShadow: `0 0 40px ${statusStyle?.glow || 'rgba(0,0,0,0.5)'}`,
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'sticky',
            top: 0,
            float: 'right',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            padding: '4px 10px',
            cursor: 'pointer',
            margin: 'var(--space-sm)',
            zIndex: 1,
          }}
        >
          ESC
        </button>

        {loading && (
          <div
            style={{
              padding: 'var(--space-xl)',
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.875rem',
              color: 'var(--accent-gold)',
            }}
          >
            <div style={{ marginBottom: 'var(--space-sm)', animation: 'pulse 1s infinite' }}>
              RETRIEVING BATTLE RECORDS...
            </div>
            <ProgressBar progress={60} color="var(--accent-gold)" />
          </div>
        )}

        {error && (
          <div
            style={{
              padding: 'var(--space-xl)',
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.875rem',
              color: 'var(--accent-crimson)',
            }}
          >
            ACCESS DENIED: {error}
          </div>
        )}

        {detail && statusStyle && (
          <div style={{ padding: 'var(--space-lg)' }}>
            {/* Header - Status Banner */}
            <div
              style={{
                padding: 'var(--space-md) var(--space-lg)',
                background: `${statusStyle.color}08`,
                borderBottom: `1px solid ${statusStyle.color}40`,
                marginBottom: 'var(--space-lg)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  letterSpacing: '0.15em',
                  color: statusStyle.color,
                  textShadow: `0 0 20px ${statusStyle.glow}`,
                  marginBottom: 'var(--space-xs)',
                }}
              >
                {statusStyle.label}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--text-dim)' }}>
                OPERATION ID: {detail.id.slice(-8).toUpperCase()}
              </div>
            </div>

            {/* Attacker → Target */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-lg)',
                marginBottom: 'var(--space-lg)',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--text-dim)', marginBottom: '4px' }}>
                  ATTACKER
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--accent-gold)', fontWeight: 600 }}>
                  {detail.attackerName || detail.attackerId.slice(-6)}
                </div>
                <WorldBadge worldId={detail.attackerWorldId} />
              </div>

              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1.5rem',
                  color: 'var(--accent-crimson)',
                  textShadow: '0 0 10px rgba(139, 0, 0, 0.5)',
                }}
              >
                ⟶
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--text-dim)', marginBottom: '4px' }}>
                  TARGET
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--accent-crimson)', fontWeight: 600 }}>
                  {detail.targetName || detail.targetId.slice(-6)}
                </div>
                <WorldBadge worldId={detail.targetWorldId} />
              </div>
            </div>

            {/* Approach & Stats Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 'var(--space-sm)',
                marginBottom: 'var(--space-lg)',
              }}
            >
              <div style={{ background: 'var(--bg-secondary)', padding: 'var(--space-sm)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--text-dim)', marginBottom: '4px' }}>
                  APPROACH
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent-gold)', marginBottom: '2px' }}>
                  {detail.approach.toUpperCase()}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-muted)' }}>
                  {getApproachDescription(detail.approach)}
                </div>
              </div>

              <div style={{ background: 'var(--bg-secondary)', padding: 'var(--space-sm)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--text-dim)', marginBottom: '4px' }}>
                  DURATION
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                  {detail.tickCount} / {detail.maxTicks} ticks
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-muted)' }}>
                  {detail.startedAt ? new Date(detail.startedAt).toLocaleString() : '—'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-secondary)', padding: 'var(--space-sm)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--text-dim)', marginBottom: '4px' }}>
                  PROGRESS
                </div>
                <ProgressBar progress={detail.progress} color="var(--accent-gold)" />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent-gold)', marginTop: '4px' }}>
                  {detail.progress.toFixed(1)}%
                </div>
              </div>

              <div style={{ background: 'var(--bg-secondary)', padding: 'var(--space-sm)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--text-dim)', marginBottom: '4px' }}>
                  DEFENSE LEVEL
                </div>
                <ProgressBar progress={detail.traceLevel} color="var(--accent-crimson)" />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent-crimson)', marginTop: '4px' }}>
                  {detail.traceLevel.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Loot */}
            {detail.status === 'success' && detail.lootCredits > 0 && (
              <div
                style={{
                  padding: 'var(--space-md)',
                  background: 'rgba(201, 168, 76, 0.05)',
                  border: '1px solid rgba(201, 168, 76, 0.3)',
                  marginBottom: 'var(--space-lg)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--text-dim)', marginBottom: '4px' }}>
                  PLUNDERED
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '2rem',
                    fontWeight: 800,
                    color: 'var(--accent-gold)',
                    textShadow: '0 0 20px rgba(201, 168, 76, 0.5)',
                  }}
                >
                  +{detail.lootCredits.toLocaleString()}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--accent-gold)' }}>
                  CREDITS
                </div>
              </div>
            )}

            {/* Operation Log */}
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.6875rem',
                  color: 'var(--text-dim)',
                  letterSpacing: '0.1em',
                  marginBottom: 'var(--space-sm)',
                  paddingBottom: 'var(--space-xs)',
                  borderBottom: '1px solid var(--border-color)',
                }}
              >
                BATTLE LOG
              </div>
              <div
                style={{
                  background: 'var(--bg-void)',
                  border: '1px solid var(--border-color)',
                  padding: 'var(--space-sm)',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.6875rem',
                  lineHeight: 1.8,
                }}
              >
                {detail.log.map((entry, i) => (
                  <div key={i} style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                    <span style={{ color: 'var(--text-dim)', minWidth: '28px', textAlign: 'right' }}>
                      [{String(entry.tick).padStart(2, '0')}]
                    </span>
                    <span style={{ color: getLogEntryColor(entry.type) }}>
                      {entry.event}
                    </span>
                  </div>
                ))}
                <div style={{ color: 'var(--text-dim)', marginTop: 'var(--space-xs)' }}>
                  {'>'} END OF LOG_
                  <span style={{ animation: 'blink 1s infinite' }}>|</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export function Hacks() {
  const { connectionStatus } = useSocketContext();
  // TODO: Replace with battle hooks when available
  const activeNetRuns: NetRunEvent[] = [];
  const recentHacks: NetRunCompletedEvent[] = [];
  const activeBounties: BountyEvent[] = [];
  const [stats, setStats] = useState<HackingStats | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/hacking/stats')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setStats(json.data);
        }
      })
      .catch((err) => console.error('Failed to load hacking stats:', err));
  }, []);

  // Close modal on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedRunId(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-void)' }}>
      {selectedRunId && (
        <NetRunDetailModal runId={selectedRunId} onClose={() => setSelectedRunId(null)} />
      )}
      <Header connectionStatus={connectionStatus} />

      <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 'var(--space-lg)', padding: 'var(--space-lg)', overflow: 'auto' }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          {/* Active NetRuns */}
          <section className="panel">
            <div className="panel-header">ACTIVE SIEGES • LIVE</div>
            <div className="panel-content" style={{ padding: 0, maxHeight: '500px', overflowY: 'auto' }}>
              {activeNetRuns.length > 0 ? (
                activeNetRuns.map((run: NetRunEvent) => (
                  <div key={run.runId} onClick={() => setSelectedRunId(run.runId)} style={{ cursor: 'pointer' }}>
                    <NetRunCard run={run} />
                  </div>
                ))
              ) : (
                <div
                  style={{
                    padding: 'var(--space-xl)',
                    textAlign: 'center',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.875rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  No active sieges...
                </div>
              )}
            </div>
          </section>

          {/* Recent Operations */}
          <section className="panel">
            <div className="panel-header">RECENT BATTLES</div>
            <div className="panel-content" style={{ padding: 0, maxHeight: '400px', overflowY: 'auto' }}>
              {recentHacks.length > 0 ? (
                recentHacks.map((hack: NetRunCompletedEvent) => (
                  <div key={hack.runId} onClick={() => setSelectedRunId(hack.runId)} style={{ cursor: 'pointer' }}>
                    <RecentHackCard hack={hack} />
                  </div>
                ))
              ) : (
                <div
                  style={{
                    padding: 'var(--space-xl)',
                    textAlign: 'center',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.875rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  Waiting for battles...
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {/* System Status */}
          <section className="panel">
            <div className="panel-header">SYSTEM STATUS</div>
            <div className="panel-content">
              {stats ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                  {[
                    { label: 'Total Runs', value: (stats.overview.totalRuns ?? 0).toLocaleString() },
                    { label: 'Active', value: (stats.overview.activeRuns ?? 0).toLocaleString() },
                    { label: 'Success Rate', value: `${(stats.overview.successRate ?? 0).toFixed(1)}%` },
                    { label: 'Credits Stolen', value: (stats.overview.totalCreditsStolen ?? 0).toLocaleString() },
                    { label: 'Active Bounties', value: (stats.overview.activeBounties ?? 0).toLocaleString() },
                  ].map((stat) => (
                    <div key={stat.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {stat.label}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.875rem',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {stat.value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                  }}
                >
                  Loading...
                </div>
              )}
            </div>
          </section>

          {/* Most Wanted */}
          <section className="panel">
            <div className="panel-header">MOST WANTED</div>
            <div className="panel-content" style={{ padding: 0, maxHeight: '300px', overflowY: 'auto' }}>
              {activeBounties.length > 0 ? (
                activeBounties
                  .sort((a: BountyEvent, b: BountyEvent) => b.reward - a.reward)
                  .map((bounty: BountyEvent) => <BountyCard key={bounty.bountyId} bounty={bounty} />)
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
                  No active bounties
                </div>
              )}
            </div>
          </section>

          {/* Top Hackers */}
          <section className="panel">
            <div className="panel-header">TOP WARRIORS</div>
            <div className="panel-content">
              {stats?.topHackers && stats.topHackers.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                  {stats.topHackers.map((hacker, i) => (
                    <div
                      key={i}
                      style={{
                        padding: 'var(--space-xs)',
                        borderBottom: i < stats.topHackers.length - 1 ? '1px solid var(--border-color)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: '2px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                          <AgentName agentId={hacker.agentId} name={hacker.name} worldId={hacker.worldId} />
                        </span>
                        <WorldBadge worldId={hacker.worldId} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--text-muted)' }}>
                          {hacker.successCount} runs
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--accent-gold)' }}>
                          {(hacker.totalLoot ?? 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                  }}
                >
                  No data yet
                </div>
              )}
            </div>
          </section>

          {/* Most Wanted */}
          <section className="panel">
            <div className="panel-header">MOST WANTED</div>
            <div className="panel-content">
              {stats?.mostWanted && stats.mostWanted.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                  {stats.mostWanted.map((target, i) => (
                    <div
                      key={i}
                      style={{
                        padding: 'var(--space-xs)',
                        borderBottom: i < stats.mostWanted.length - 1 ? '1px solid var(--border-color)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: '2px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                          <AgentName agentId={target.agentId} name={target.name} worldId={target.worldId} />
                        </span>
                        <WorldBadge worldId={target.worldId} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--text-muted)' }}>
                          {target.bountyCount} bounties
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--accent-gold)' }}>
                          {(target.totalBounty ?? 0).toLocaleString()} CRD
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                  }}
                >
                  No targets yet
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
