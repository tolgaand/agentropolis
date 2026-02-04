/**
 * AgentsPanel - Right panel: agent roster.
 * Dystopian cyberpunk: holographic glass panels, neon accents,
 * angular clip-path, real agent data from socket context.
 */
import { useState } from 'react';
import { useAgents } from '../../socket/socket.context';
import type { AgentSnapshotPayload } from '@agentropolis/shared/contracts/v2';

export function AgentsPanel(): JSX.Element {
  const [collapsed, setCollapsed] = useState(false);
  const agents = useAgents();

  return (
    <div style={{
      width: collapsed ? 36 : 220,
      transition: 'width 0.25s ease',
      pointerEvents: 'auto',
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: collapsed ? '8px 10px' : '8px 14px',
          background: 'rgba(5, 5, 10, 0.88)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          cursor: 'pointer',
          userSelect: 'none',
          border: '1px solid rgba(127, 220, 255, 0.15)',
          borderBottom: collapsed ? undefined : 'none',
          boxShadow: '0 0 20px rgba(127, 220, 255, 0.08), 0 4px 24px rgba(0,0,0,0.5)',
          position: 'relative',
          clipPath: collapsed
            ? 'polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px)'
            : 'polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%, 0 8px)',
        }}
      >
        {/* Neon accent line */}
        <div style={{
          position: 'absolute',
          top: 0, left: 8, right: 8,
          height: 2,
          background: 'linear-gradient(90deg, transparent, var(--neon-magenta), transparent)',
          opacity: 0.6,
        }} />

        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 3, height: 10,
              background: 'var(--neon-magenta)',
              boxShadow: '0 0 6px var(--neon-magenta)',
            }} />
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              fontFamily: 'var(--font-display)',
              color: 'var(--neon-magenta)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              textShadow: '0 0 8px rgba(255,0,255,0.4)',
            }}>
              Agents
            </span>
            {/* Count badge */}
            <span style={{
              fontSize: 9,
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              background: 'rgba(255,255,255,0.05)',
              padding: '1px 7px',
              border: '1px solid rgba(255,255,255,0.08)',
              clipPath: 'polygon(0 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 4px 100%, 0 calc(100% - 4px))',
            }}>
              {agents.length}
            </span>
          </div>
        )}
        <span style={{
          color: 'var(--neon-magenta)',
          fontSize: 8,
          transform: collapsed ? 'rotate(90deg)' : 'rotate(0)',
          transition: 'transform 0.2s',
          lineHeight: 1,
          fontFamily: 'var(--font-mono)',
          textShadow: '0 0 4px var(--neon-magenta)',
        }}>
          {'\u25BC'}
        </span>
      </div>

      {/* Body */}
      {!collapsed && (
        <div style={{
          background: 'rgba(5, 5, 10, 0.88)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(127, 220, 255, 0.15)',
          borderTop: 'none',
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px))',
        }}>
          {agents.length > 0 ? (
            <div style={{
              maxHeight: 'calc(100vh - 340px)',
              overflowY: 'auto',
              padding: '4px 0',
            }}>
              {agents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          ) : (
            <>
              {/* Ghost card slots */}
              <div style={{ padding: '8px 12px' }}>
                <AgentSlotGhost delay={0} />
                <AgentSlotGhost delay={1} />
                <AgentSlotGhost delay={2} />
              </div>

              {/* Empty state */}
              <div style={{
                padding: '14px 14px',
                textAlign: 'center',
                borderTop: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  lineHeight: 1.6,
                  fontWeight: 500,
                  fontFamily: 'var(--font-body)',
                }}>
                  No agents yet
                </div>
                <div style={{
                  color: 'var(--text-muted)',
                  fontSize: 10,
                  marginTop: 3,
                  lineHeight: 1.5,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.04em',
                }}>
                  Agents will appear once simulation starts.
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentSnapshotPayload }): JSX.Element {
  const isJailed = agent.status === 'jailed';
  const statusColor = isJailed ? '#ff4444' : '#00ff88';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 12px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      transition: 'background 0.15s',
    }}>
      {/* Avatar placeholder — cut corner */}
      <div style={{
        width: 28,
        height: 28,
        background: 'rgba(255, 0, 255, 0.12)',
        border: '1px solid rgba(255, 0, 255, 0.2)',
        clipPath: 'polygon(0 0, 100% 0, 100% 80%, 80% 100%, 0 100%)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        color: 'var(--neon-magenta)',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
      }}>
        {agent.name.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{
            fontSize: 10,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {agent.name}
          </span>
          {/* Profession badge */}
          <span style={{
            fontSize: 8,
            color: 'var(--neon-magenta)',
            fontFamily: 'var(--font-mono)',
            background: 'rgba(255, 0, 255, 0.08)',
            border: '1px solid rgba(255, 0, 255, 0.15)',
            padding: '0 4px',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}>
            {agent.profession}
          </span>
        </div>

        {/* Balance + mini bars */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 2,
        }}>
          <span style={{
            fontSize: 9,
            color: 'var(--neon-cyan)',
            fontFamily: 'var(--font-mono)',
          }}>
            ${agent.balance}
          </span>
          {/* Reputation bar */}
          <MiniBar value={agent.reputation} max={100} color="var(--neon-magenta)" label="REP" />
          {/* Needs bars */}
          <MiniBar value={agent.needs.hunger} max={100} color="#00ff88" label="H" />
          <MiniBar value={agent.needs.rest} max={100} color="#4488ff" label="R" />
        </div>
      </div>

      {/* Status dot */}
      <div style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: statusColor,
        boxShadow: `0 0 4px ${statusColor}`,
        flexShrink: 0,
      }} />
    </div>
  );
}

function MiniBar({ value, max, color, label }: {
  value: number;
  max: number;
  color: string;
  label: string;
}): JSX.Element {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }} title={`${label}: ${value}/${max}`}>
      <span style={{
        fontSize: 7,
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
        opacity: 0.6,
      }}>
        {label}
      </span>
      <div style={{
        width: 16,
        height: 3,
        background: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          opacity: 0.7,
        }} />
      </div>
    </div>
  );
}

function AgentSlotGhost({ delay }: { delay: number }): JSX.Element {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '5px 4px',
      opacity: 0.08 + delay * 0.02,
      background: delay % 2 === 0 ? 'rgba(127, 220, 255,0.02)' : 'transparent',
    }}>
      {/* Avatar — cut corner */}
      <div style={{
        width: 28, height: 28,
        background: 'var(--text-muted)',
        clipPath: 'polygon(0 0, 100% 0, 100% 80%, 80% 100%, 0 100%)',
        flexShrink: 0,
      }} />
      <div style={{ flex: 1 }}>
        <div style={{
          height: 8, width: '55%',
          background: 'var(--text-muted)',
          marginBottom: 4,
        }} />
        <div style={{
          height: 6, width: '35%',
          background: 'var(--text-muted)',
        }} />
      </div>
      {/* Status dot */}
      <div style={{
        width: 6, height: 6,
        borderRadius: '50%',
        background: 'var(--neon-cyan)',
        boxShadow: '0 0 4px var(--neon-cyan)',
        flexShrink: 0,
      }} />
    </div>
  );
}
