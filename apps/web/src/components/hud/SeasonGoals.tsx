/**
 * SeasonGoals — Right panel showing current season goals + inline policy vote.
 * Soft-tech styled: glass panels, subtle borders, progress bars.
 */
import { useState, useEffect, useCallback } from 'react';
import type { SeasonGoalsPayload, PolicyVotePayload } from '@agentropolis/shared/contracts/v2';
import { useSocket } from '../../socket/socket.context';

const GOAL_COLORS: Record<string, string> = {
  unemploymentRate: 'var(--warning)',
  openBusinesses: 'var(--success)',
  crimeRateLast10: 'var(--neon-red)',
  treasury: 'var(--neon-cyan)',
};

export function SeasonGoals(): JSX.Element {
  const [collapsed, setCollapsed] = useState(false);
  const [goals, setGoals] = useState<SeasonGoalsPayload | null>(null);
  const [vote, setVote] = useState<PolicyVotePayload | null>(null);
  const [voted, setVoted] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const socket = useSocket();

  // Fetch goals + vote from REST on mount + poll every 20s
  useEffect(() => {
    let mounted = true;

    async function fetchData(): Promise<void> {
      try {
        const [goalsRes, voteRes] = await Promise.all([
          fetch('/api/city/goals').catch(() => null),
          fetch('/api/city/vote').catch(() => null),
        ]);
        if (goalsRes?.ok) {
          const data = await goalsRes.json();
          if (mounted && (data.goals || data.season)) setGoals(data);
        }
        if (voteRes?.ok) {
          const data = await voteRes.json();
          if (mounted && data.vote) setVote(data.vote);
        }
      } catch {
        // ignore
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 20_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const castVote = useCallback(async (optionId: string) => {
    if (!socket) return;
    setVoteError(null);
    try {
      const res = await fetch('/api/city/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionId, socketId: socket.id }),
      });
      const data = await res.json();
      if (data.ok) {
        setVoted(true);
      } else {
        setVoteError(data.reason ?? 'Vote failed');
      }
    } catch {
      setVoteError('Network error');
    }
  }, [socket]);

  const hasGoals = goals && goals.goals && goals.goals.length > 0;
  const hasVote = vote && !vote.resolved;

  // Hide panel entirely if nothing to show
  if (!hasGoals && !hasVote) return <></>;

  return (
    <div style={{
      width: collapsed ? 36 : 220,
      transition: 'width 0.25s ease',
      pointerEvents: 'auto',
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: collapsed ? '8px 10px' : '8px 12px',
          background: 'rgba(8, 12, 20, 0.85)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          cursor: 'pointer',
          userSelect: 'none',
          border: '1px solid rgba(127, 220, 255, 0.1)',
          borderBottom: collapsed ? undefined : 'none',
          borderRadius: collapsed ? 4 : '4px 4px 0 0',
        }}
      >
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
              color: 'var(--neon-cyan)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}>
              Goals
            </span>
            {goals?.season && (
              <span style={{
                fontSize: 8,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                {goals.season}
              </span>
            )}
          </div>
        )}
        <span style={{
          color: 'var(--text-muted)',
          fontSize: 8,
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)',
          transition: 'transform 0.2s',
          lineHeight: 1,
          fontFamily: 'var(--font-mono)',
        }}>
          {'\u25BC'}
        </span>
      </div>

      {/* Body */}
      {!collapsed && (
        <div style={{
          background: 'rgba(8, 12, 20, 0.85)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(127, 220, 255, 0.1)',
          borderTop: 'none',
          padding: '8px 10px',
          borderRadius: '0 0 4px 4px',
        }}>
          {/* Goals section */}
          {hasGoals && goals!.goals.map((goal) => {
            const color = GOAL_COLORS[goal.metric] ?? 'var(--neon-cyan)';
            const pct = Math.round(goal.progress * 100);
            return (
              <div key={goal.id} style={{ marginBottom: 8 }}>
                <div style={{
                  fontSize: 9,
                  fontFamily: 'var(--font-mono)',
                  color: goal.completed ? 'var(--success)' : 'var(--text-primary)',
                  lineHeight: 1.4,
                  marginBottom: 3,
                  letterSpacing: '0.02em',
                }}>
                  {goal.completed ? '\u2713 ' : ''}{goal.label}
                </div>
                <div style={{
                  height: 3,
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: goal.completed
                      ? 'var(--success)'
                      : `linear-gradient(90deg, ${color}, ${color}88)`,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            );
          })}

          {/* Inline Policy Vote */}
          {hasVote && (
            <>
              <div style={{
                borderTop: '1px solid rgba(127, 220, 255, 0.08)',
                margin: '6px 0 8px',
              }} />
              <div style={{
                fontSize: 8,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}>
                Policy Vote
              </div>

              {voted ? (
                <div style={{
                  fontSize: 9,
                  color: 'var(--success)',
                  fontFamily: 'var(--font-mono)',
                  padding: '4px 0',
                }}>
                  Vote cast. Results next week.
                </div>
              ) : (
                <>
                  {vote!.options.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => castVote(opt.id)}
                      title={opt.description}
                      style={{
                        display: 'block',
                        width: '100%',
                        background: 'rgba(127, 220, 255, 0.04)',
                        border: '1px solid rgba(127, 220, 255, 0.1)',
                        borderRadius: 3,
                        color: 'var(--text-primary)',
                        fontSize: 9,
                        fontFamily: 'var(--font-mono)',
                        padding: '4px 8px',
                        marginBottom: 3,
                        cursor: 'pointer',
                        textAlign: 'left',
                        letterSpacing: '0.03em',
                        transition: 'background 0.15s',
                      }}
                    >
                      {opt.label}
                      <span style={{ fontSize: 8, color: 'var(--text-muted)', marginLeft: 6 }}>
                        ({vote!.voteCounts[opt.id] ?? 0})
                      </span>
                    </button>
                  ))}
                </>
              )}

              {voteError && (
                <div style={{ fontSize: 8, color: 'var(--neon-red)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                  {voteError}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
