/**
 * SeasonReport — Modal overlay showing end-of-season summary.
 * Triggered by clicking a "Season Report" button or auto-shown on season end.
 */
import { useState, useEffect } from 'react';
import type { SeasonReportPayload } from '@agentropolis/shared/contracts/v2';

export function SeasonReport(): JSX.Element {
  const [report, setReport] = useState<SeasonReportPayload | null>(null);
  const [open, setOpen] = useState(false);
  const [hasReport, setHasReport] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function fetchReport(): Promise<void> {
      try {
        const res = await fetch('/api/city/report');
        if (res.ok) {
          const data = await res.json();
          if (mounted && data.season) {
            setReport(data);
            setHasReport(true);
          }
        }
      } catch {
        // ignore
      }
    }

    fetchReport();
    const interval = setInterval(fetchReport, 30_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (!hasReport) return <></>;

  return (
    <>
      {/* Trigger button — bottom left */}
      <div style={{
        position: 'absolute',
        bottom: 40,
        left: 12,
        pointerEvents: 'auto',
        zIndex: 15,
      }}>
        <button
          onClick={() => setOpen(true)}
          style={{
            background: 'rgba(5, 5, 10, 0.88)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(127, 220, 255, 0.15)',
            color: 'var(--neon-cyan)',
            fontSize: 9,
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            padding: '6px 14px',
            cursor: 'pointer',
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            textShadow: '0 0 6px rgba(127, 220, 255,0.4)',
            boxShadow: '0 0 12px rgba(127, 220, 255,0.08)',
            clipPath: 'polygon(6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px), 0 6px)',
          }}
        >
          Season Report
        </button>
      </div>

      {/* Modal overlay */}
      {open && report && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            pointerEvents: 'auto',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(5, 5, 10, 0.95)',
              border: '1px solid rgba(127, 220, 255, 0.2)',
              maxWidth: 480,
              width: '90vw',
              maxHeight: '80vh',
              overflowY: 'auto',
              padding: 24,
              boxShadow: '0 0 40px rgba(127, 220, 255,0.1), 0 8px 32px rgba(0,0,0,0.6)',
              clipPath: 'polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px), 0 12px)',
            }}
          >
            {/* Title */}
            <div style={{
              fontSize: 16,
              fontWeight: 700,
              fontFamily: 'var(--font-display)',
              color: 'var(--neon-cyan)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              textShadow: '0 0 10px rgba(127, 220, 255,0.4)',
              marginBottom: 16,
              textAlign: 'center',
            }}>
              Season {report.season} Report
            </div>

            {/* Metrics delta */}
            <div style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              marginBottom: 16,
              letterSpacing: '0.04em',
            }}>
              <div style={{ color: 'var(--neon-cyan)', fontWeight: 600, marginBottom: 6, letterSpacing: '0.08em' }}>
                METRICS
              </div>
              <MetricDelta label="Treasury" start={report.metricsStart.treasury} end={report.metricsEnd.treasury} unit=" CRD" />
              <MetricDelta label="Unemployment" start={Math.round(report.metricsStart.unemploymentRate * 100)} end={Math.round(report.metricsEnd.unemploymentRate * 100)} unit="%" />
              <MetricDelta label="Crime Rate" start={Math.round(report.metricsStart.crimeRateLast10 * 100)} end={Math.round(report.metricsEnd.crimeRateLast10 * 100)} unit="%" />
              <MetricDelta label="Businesses" start={report.metricsStart.openBusinesses} end={report.metricsEnd.openBusinesses} />
              <MetricDelta label="Agents" start={report.metricsStart.agentCount} end={report.metricsEnd.agentCount} />
            </div>

            {/* Goals */}
            {report.goals.goals.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600,
                  color: 'var(--neon-cyan)', letterSpacing: '0.08em', marginBottom: 6,
                }}>
                  GOALS ({report.goals.successCount}/{report.goals.totalCount})
                </div>
                {report.goals.goals.map((g, i) => (
                  <div key={i} style={{
                    fontSize: 9,
                    fontFamily: 'var(--font-mono)',
                    color: g.outcome === 'success' ? 'var(--success)' : 'var(--neon-red)',
                    marginBottom: 2,
                  }}>
                    {g.outcome === 'success' ? '\u2713' : '\u2717'} {g.label}
                  </div>
                ))}
              </div>
            )}

            {/* Top Stories */}
            {report.topStories.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600,
                  color: 'var(--neon-cyan)', letterSpacing: '0.08em', marginBottom: 6,
                }}>
                  TOP STORIES
                </div>
                {report.topStories.map((s, i) => (
                  <div key={i} style={{
                    fontSize: 9,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-primary)',
                    marginBottom: 3,
                    paddingLeft: 8,
                    borderLeft: `2px solid ${s.severity === 'major' ? 'var(--neon-red)' : 'var(--neon-cyan)'}`,
                  }}>
                    {s.headline}
                  </div>
                ))}
              </div>
            )}

            {/* Policy History */}
            {report.policyHistory.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600,
                  color: 'var(--neon-cyan)', letterSpacing: '0.08em', marginBottom: 6,
                }}>
                  POLICY VOTES
                </div>
                {report.policyHistory.map((p, i) => (
                  <div key={i} style={{
                    fontSize: 9,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                    marginBottom: 2,
                  }}>
                    Week {p.weekNumber}: {p.winner.label} ({p.effect})
                  </div>
                ))}
              </div>
            )}

            {/* Close button */}
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'rgba(127, 220, 255,0.08)',
                  border: '1px solid rgba(127, 220, 255,0.25)',
                  color: 'var(--neon-cyan)',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  padding: '6px 20px',
                  cursor: 'pointer',
                  letterSpacing: '0.08em',
                  textShadow: '0 0 4px var(--neon-cyan)',
                }}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MetricDelta({ label, start, end, unit = '' }: {
  label: string;
  start: number;
  end: number;
  unit?: string;
}): JSX.Element {
  const delta = end - start;
  const arrow = delta > 0 ? '\u2191' : delta < 0 ? '\u2193' : '\u2192';
  const color = delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--neon-red)' : 'var(--text-muted)';

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
      <span>{label}</span>
      <span>
        <span style={{ opacity: 0.6 }}>{start}{unit}</span>
        <span style={{ color, margin: '0 4px' }}>{arrow}</span>
        <span style={{ color: 'var(--text-primary)' }}>{end}{unit}</span>
      </span>
    </div>
  );
}
