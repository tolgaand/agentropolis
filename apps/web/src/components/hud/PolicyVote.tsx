/**
 * PolicyVote — Small HUD widget showing current policy vote.
 * Spectators can cast one vote per week.
 */
import { useState, useEffect, useCallback } from 'react';
import type { PolicyVotePayload } from '@agentropolis/shared/contracts/v2';
import { useSocket } from '../../socket/socket.context';

export function PolicyVote(): JSX.Element {
  const [vote, setVote] = useState<PolicyVotePayload | null>(null);
  const [voted, setVoted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socket = useSocket();

  useEffect(() => {
    let mounted = true;

    async function fetchVote(): Promise<void> {
      try {
        const res = await fetch('/api/city/vote');
        if (res.ok) {
          const data = await res.json();
          if (mounted && data.vote) setVote(data.vote);
        }
      } catch {
        // ignore
      }
    }

    fetchVote();
    const interval = setInterval(fetchVote, 20_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const castVote = useCallback(async (optionId: string) => {
    if (!socket) return;
    setError(null);
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
        setError(data.reason ?? 'Vote failed');
      }
    } catch {
      setError('Network error');
    }
  }, [socket]);

  if (!vote || vote.resolved) return <></>;

  return (
    <div style={{
      position: 'absolute',
      bottom: 40,
      right: 12,
      width: 200,
      pointerEvents: 'auto',
      zIndex: 15,
    }}>
      <div style={{
        background: 'rgba(5, 5, 10, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(127, 220, 255, 0.15)',
        padding: '10px 12px',
        boxShadow: '0 0 20px rgba(127, 220, 255, 0.08), 0 4px 24px rgba(0,0,0,0.5)',
        clipPath: 'polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px)',
      }}>
        <div style={{
          fontSize: 10,
          fontWeight: 600,
          fontFamily: 'var(--font-display)',
          color: 'var(--neon-cyan)',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          marginBottom: 8,
          textShadow: '0 0 8px rgba(127, 220, 255,0.4)',
        }}>
          Policy Vote
        </div>

        {voted ? (
          <div style={{
            fontSize: 10,
            color: 'var(--success)',
            fontFamily: 'var(--font-mono)',
            textAlign: 'center',
            padding: '8px 0',
          }}>
            Vote cast! Results next week.
          </div>
        ) : (
          <>
            {vote.options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => castVote(opt.id)}
                title={opt.description}
                style={{
                  display: 'block',
                  width: '100%',
                  background: 'rgba(127, 220, 255,0.05)',
                  border: '1px solid rgba(127, 220, 255,0.15)',
                  color: 'var(--text-primary)',
                  fontSize: 9,
                  fontFamily: 'var(--font-mono)',
                  padding: '5px 8px',
                  marginBottom: 4,
                  cursor: 'pointer',
                  textAlign: 'left',
                  letterSpacing: '0.04em',
                  transition: 'all 0.15s',
                }}
              >
                {opt.label}
                <span style={{
                  fontSize: 8,
                  color: 'var(--text-muted)',
                  marginLeft: 6,
                }}>
                  ({vote.voteCounts[opt.id] ?? 0})
                </span>
              </button>
            ))}
          </>
        )}

        {error && (
          <div style={{
            fontSize: 8,
            color: 'var(--neon-red)',
            fontFamily: 'var(--font-mono)',
            marginTop: 4,
          }}>
            {error}
          </div>
        )}

        <div style={{
          fontSize: 8,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          marginTop: 6,
          opacity: 0.6,
        }}>
          {vote.totalVotes} vote{vote.totalVotes !== 1 ? 's' : ''} cast
        </div>
      </div>
    </div>
  );
}
