/**
 * CityPulse - Left panel: city event news feed.
 * Dystopian cyberpunk: glass morphism, neon accents, scan-line overlay,
 * angular clip-path, holographic shimmer.
 */
import { useState, useMemo } from 'react';
import { useFeedEvents, useTickPulse } from '../../socket/socket.context';
import type { FeedEvent } from '@agentropolis/shared/contracts/v2';

type FilterTab = 'all' | 'buildings' | 'crime' | 'economy' | 'agents';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'buildings', label: 'Bld' },
  { key: 'crime',     label: 'Crm' },
  { key: 'economy',   label: 'Eco' },
  { key: 'agents',    label: 'Agt' },
];

const SEVERITY_COLORS: Record<string, string> = {
  routine: 'rgba(0, 255, 255, 0.5)',
  minor: 'rgba(255, 200, 0, 0.8)',
  major: 'rgba(255, 50, 50, 0.9)',
};

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h`;
}

export function CityPulse(): JSX.Element {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const feedEvents = useFeedEvents();
  const tickPulse = useTickPulse();

  const filtered = useMemo(() => {
    if (activeTab === 'all') return feedEvents;
    return feedEvents.filter((e) => e.tags.includes(activeTab));
  }, [feedEvents, activeTab]);

  const hasEvents = filtered.length > 0;

  return (
    <div style={{
      position: 'absolute',
      top: 58,
      left: 12,
      width: collapsed ? 36 : 280,
      maxHeight: 'calc(100vh - 260px)',
      transition: 'width 0.25s ease',
      pointerEvents: 'auto',
      zIndex: 15,
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
          border: '1px solid rgba(0, 255, 255, 0.15)',
          borderBottom: collapsed ? undefined : 'none',
          boxShadow: '0 0 20px rgba(0, 255, 255, 0.08), 0 4px 24px rgba(0,0,0,0.5)',
          position: 'relative',
          clipPath: collapsed
            ? 'polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px)'
            : 'polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%, 0 8px)',
        }}
      >
        {/* Neon accent line — pulses on tick */}
        <div style={{
          position: 'absolute',
          top: 0, left: 8, right: 8,
          height: 2,
          background: tickPulse
            ? 'linear-gradient(90deg, var(--neon-cyan), rgba(0,255,255,0.9), var(--neon-cyan))'
            : 'linear-gradient(90deg, transparent, var(--neon-cyan), transparent)',
          opacity: tickPulse ? 1 : 0.6,
          transition: 'all 0.3s ease',
        }} />

        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 3, height: 10,
              background: 'var(--neon-cyan)',
              boxShadow: '0 0 6px var(--neon-cyan)',
            }} />
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              fontFamily: 'var(--font-display)',
              color: 'var(--neon-cyan)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              textShadow: '0 0 8px rgba(0,255,255,0.4)',
            }}>
              City Pulse
            </span>
            {feedEvents.length > 0 && (
              <span style={{
                fontSize: 9,
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                background: 'rgba(255,255,255,0.05)',
                padding: '1px 6px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                {feedEvents.length}
              </span>
            )}
          </div>
        )}
        <span style={{
          color: 'var(--neon-cyan)',
          fontSize: 8,
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)',
          transition: 'transform 0.2s',
          lineHeight: 1,
          fontFamily: 'var(--font-mono)',
          textShadow: '0 0 4px var(--neon-cyan)',
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
          border: '1px solid rgba(0, 255, 255, 0.15)',
          borderTop: 'none',
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px))',
        }}>
          {/* Filter tabs */}
          <div style={{
            display: 'flex',
            gap: 2,
            padding: '6px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={(e) => { e.stopPropagation(); setActiveTab(tab.key); }}
                style={{
                  background: activeTab === tab.key ? 'rgba(0,255,255,0.08)' : 'transparent',
                  border: activeTab === tab.key
                    ? '1px solid rgba(0,255,255,0.25)'
                    : '1px solid transparent',
                  color: activeTab === tab.key ? 'var(--neon-cyan)' : 'var(--text-muted)',
                  fontSize: 9,
                  padding: '2px 8px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: activeTab === tab.key ? 600 : 400,
                  letterSpacing: '0.06em',
                  transition: 'all 0.15s',
                  textShadow: activeTab === tab.key ? '0 0 4px var(--neon-cyan)' : 'none',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Event list or empty state */}
          {hasEvents ? (
            <div style={{
              maxHeight: 'calc(100vh - 380px)',
              overflowY: 'auto',
              padding: '4px 0',
            }}>
              {filtered.slice(0, 50).map((event) => (
                <FeedEventRow key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <div style={{ padding: '24px 14px', textAlign: 'center' }}>
              <div style={{
                width: 8, height: 8,
                borderRadius: '50%',
                background: 'var(--neon-cyan)',
                boxShadow: '0 0 8px var(--neon-cyan), 0 0 16px rgba(0,255,255,0.3)',
                margin: '0 auto 12px',
                animation: 'status-pulse 2s ease-in-out infinite',
              }} />
              <div style={{
                color: 'var(--text-primary)',
                fontSize: 12,
                lineHeight: 1.6,
                fontWeight: 500,
                fontFamily: 'var(--font-body)',
              }}>
                Waiting for city events...
              </div>
              <div style={{
                color: 'var(--text-muted)',
                fontSize: 10,
                marginTop: 4,
                lineHeight: 1.5,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.04em',
              }}>
                Events will stream here once simulation starts.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FeedEventRow({ event }: { event: FeedEvent }): JSX.Element {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      padding: '5px 12px',
      borderBottom: '1px solid rgba(255,255,255,0.03)',
      transition: 'background 0.15s',
    }}>
      {/* Severity dot */}
      <div style={{
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: SEVERITY_COLORS[event.severity] ?? SEVERITY_COLORS.routine,
        boxShadow: event.severity !== 'routine'
          ? `0 0 6px ${SEVERITY_COLORS[event.severity]}`
          : 'none',
        marginTop: 4,
        flexShrink: 0,
      }} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {event.headline}
        </div>
        {event.detail && (
          <div style={{
            fontSize: 9,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            lineHeight: 1.3,
            marginTop: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {event.detail}
          </div>
        )}
      </div>

      {/* Timestamp */}
      <span style={{
        fontSize: 8,
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
        flexShrink: 0,
        marginTop: 2,
        opacity: 0.6,
      }}>
        {relativeTime(event.ts)}
      </span>
    </div>
  );
}
