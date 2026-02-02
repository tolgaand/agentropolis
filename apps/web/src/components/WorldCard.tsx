import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Lottie from 'lottie-react';
import type { WorldId } from '@agentropolis/shared';
import { TransitionOverlay } from './TransitionOverlay';

interface WorldData {
  id: WorldId;
  name: string;
  tagline: string;
  currency: { code: string; symbol: string };
  gdp: number;
  population: number;
  prosperityIndex: number;
}

const WORLD_COLORS: Record<WorldId, string> = {
  claude_nation: 'var(--claude-nation-primary)',
  openai_empire: 'var(--openai-empire-primary)',
  gemini_republic: 'var(--gemini-republic-primary)',
  grok_syndicate: 'var(--grok-syndicate-primary)',
  open_frontier: 'var(--open-frontier-primary)',
};

const WORLD_ICONS: Record<WorldId, string> = {
  claude_nation: '⚔️',
  openai_empire: '👑',
  gemini_republic: '📜',
  grok_syndicate: '🛡️',
  open_frontier: '🚩',
};

const WORLD_LOTTIE: Record<WorldId, string> = {
  claude_nation: '/assets/lottie/sword.json',
  openai_empire: '/assets/lottie/crown.json',
  gemini_republic: '/assets/lottie/scroll.json',
  grok_syndicate: '/assets/lottie/shield.json',
  open_frontier: '/assets/lottie/banner.json',
};

// Lottie cache to prevent refetching
const lottieCache = new Map<string, object>();

function useLottieData(path: string) {
  const [data, setData] = useState<object | null>(lottieCache.get(path) || null);

  useEffect(() => {
    if (lottieCache.has(path)) {
      setData(lottieCache.get(path)!);
      return;
    }

    fetch(path)
      .then(r => r.json())
      .then(d => {
        lottieCache.set(path, d);
        setData(d);
      })
      .catch(() => {
        // Silently fail - fallback icon will be used
      });
  }, [path]);

  return data;
}

export function WorldCardSkeleton() {
  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        padding: 'var(--space-md)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Header Skeleton */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
        <div
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '4px',
            background: 'var(--bg-tertiary)',
            animation: 'pulse 1.5s infinite',
          }}
        />
        <div>
          <div
            style={{
              width: '120px',
              height: '14px',
              borderRadius: '2px',
              background: 'var(--bg-tertiary)',
              marginBottom: '4px',
              animation: 'pulse 1.5s infinite',
            }}
          />
          <div
            style={{
              width: '80px',
              height: '11px',
              borderRadius: '2px',
              background: 'var(--bg-tertiary)',
              animation: 'pulse 1.5s infinite',
              animationDelay: '0.2s',
            }}
          />
        </div>
      </div>

      {/* Stats Skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-xs)', marginTop: 'var(--space-md)' }}>
        <div>
          <div
            style={{
              width: '30px',
              height: '11px',
              borderRadius: '2px',
              background: 'var(--bg-tertiary)',
              marginBottom: '4px',
              animation: 'pulse 1.5s infinite',
            }}
          />
          <div
            style={{
              width: '60px',
              height: '16px',
              borderRadius: '2px',
              background: 'var(--bg-tertiary)',
              animation: 'pulse 1.5s infinite',
              animationDelay: '0.1s',
            }}
          />
        </div>
        <div>
          <div
            style={{
              width: '40px',
              height: '11px',
              borderRadius: '2px',
              background: 'var(--bg-tertiary)',
              marginBottom: '4px',
              animation: 'pulse 1.5s infinite',
            }}
          />
          <div
            style={{
              width: '50px',
              height: '16px',
              borderRadius: '2px',
              background: 'var(--bg-tertiary)',
              animation: 'pulse 1.5s infinite',
              animationDelay: '0.15s',
            }}
          />
        </div>
      </div>

      {/* Prosperity Bar Skeleton */}
      <div style={{ marginTop: 'var(--space-md)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-xs)' }}>
          <div
            style={{
              width: '70px',
              height: '11px',
              borderRadius: '2px',
              background: 'var(--bg-tertiary)',
              animation: 'pulse 1.5s infinite',
            }}
          />
          <div
            style={{
              width: '30px',
              height: '11px',
              borderRadius: '2px',
              background: 'var(--bg-tertiary)',
              animation: 'pulse 1.5s infinite',
              animationDelay: '0.1s',
            }}
          />
        </div>
        <div style={{ height: '4px', background: 'var(--bg-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: '50%',
              background: 'var(--border-color)',
              animation: 'pulse 1.5s infinite',
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}

export function WorldCard({ world, selected, onClick, showEnterButton }: {
  world: WorldData;
  selected?: boolean;
  onClick?: () => void;
  /** Show "Enter Kingdom" button that triggers transition to map */
  showEnterButton?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [transitioning, setTransitioning] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const color = WORLD_COLORS[world.id];
  const icon = WORLD_ICONS[world.id];
  const lottiePath = WORLD_LOTTIE[world.id];
  const lottieData = useLottieData(lottiePath);

  const handleEnterCity = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card onClick from firing
    setTransitioning(true);
  };

  const handleTransitionComplete = () => {
    navigate('/game');
  };

  const formatNumber = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  // Calculate border opacity based on hover and selected states
  const borderOpacity = useMemo(() => {
    if (selected) return '80';
    if (isHovered) return '60';
    return '30';
  }, [selected, isHovered]);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '4px',
        cursor: onClick ? 'pointer' : 'default',
        transform: isHovered ? 'scale(1.02)' : 'scale(1)',
        transition: 'all 0.3s ease',
        animation: 'reveal 0.4s ease-out forwards',
      }}
    >
      {/* Top accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: color,
          zIndex: 2,
        }}
      />

      {/* Main card container */}
      <div
        style={{
          background: `linear-gradient(180deg, var(--bg-secondary) 0%, rgba(68, 52, 32, 0.3) 100%)`,
          border: `1px solid ${color}${borderOpacity}`,
          borderTop: 'none',
          padding: 'var(--space-md)',
          paddingTop: 'calc(var(--space-md) + 3px)',
          boxShadow: isHovered ? `0 0 20px ${color}40, inset 0 0 30px ${color}20` : selected ? `0 0 15px ${color}30, inset 0 0 20px ${color}15` : 'none',
          transition: 'all 0.3s ease',
        }}
      >
        {/* Header with Lottie icon */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
          {/* Lottie icon with circular background */}
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: `${color}15`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              border: `1px solid ${color}30`,
            }}
          >
            {lottieData ? (
              <Lottie
                animationData={lottieData}
                loop
                autoplay
                style={{ width: 40, height: 40 }}
              />
            ) : (
              <span style={{ fontSize: '1.5rem' }}>{icon}</span>
            )}
          </div>

          {/* Empire name and tagline */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: 'Cinzel, serif',
                fontWeight: 700,
                fontSize: '1rem',
                color: color,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '4px',
                textShadow: `0 0 10px ${color}40`,
              }}
            >
              {world.name}
            </div>
            <div
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '0.6875rem',
                color: 'var(--text-muted)',
                fontStyle: 'italic',
              }}
            >
              {world.tagline}
            </div>
          </div>
        </div>

        {/* KPI Chips */}
        <div style={{ display: 'flex', gap: 'var(--space-xs)', marginBottom: 'var(--space-md)' }}>
          {/* Power chip */}
          <div
            style={{
              flex: 1,
              background: 'var(--bg-tertiary)',
              border: `1px solid ${color}20`,
              borderRadius: '2px',
              padding: '6px 8px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '0.5625rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                marginBottom: '2px',
                letterSpacing: '0.05em',
              }}
            >
              Power
            </div>
            <div
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '0.75rem',
                color: color,
                fontWeight: 600,
              }}
            >
              —
            </div>
          </div>

          {/* Territory chip */}
          <div
            style={{
              flex: 1,
              background: 'var(--bg-tertiary)',
              border: `1px solid ${color}20`,
              borderRadius: '2px',
              padding: '6px 8px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '0.5625rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                marginBottom: '2px',
                letterSpacing: '0.05em',
              }}
            >
              Territory
            </div>
            <div
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '0.75rem',
                color: color,
                fontWeight: 600,
              }}
            >
              —
            </div>
          </div>

          {/* Treasury chip */}
          <div
            style={{
              flex: 1,
              background: 'var(--bg-tertiary)',
              border: `1px solid ${color}20`,
              borderRadius: '2px',
              padding: '6px 8px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '0.5625rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                marginBottom: '2px',
                letterSpacing: '0.05em',
              }}
            >
              Treasury
            </div>
            <div
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '0.75rem',
                color: color,
                fontWeight: 600,
              }}
            >
              {formatNumber(world.gdp)}
            </div>
          </div>
        </div>

        {/* Prosperity Bar with gradient */}
        <div style={{ marginBottom: showEnterButton ? 'var(--space-md)' : '0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-xs)' }}>
            <span
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '0.6875rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {t('worldCard.prosperity')}
            </span>
            <span
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '0.6875rem',
                color: color,
                fontWeight: 600,
              }}
            >
              {world.prosperityIndex}%
            </span>
          </div>
          <div
            style={{
              height: '6px',
              background: 'var(--bg-tertiary)',
              borderRadius: '3px',
              overflow: 'hidden',
              border: `1px solid ${color}20`,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${world.prosperityIndex}%`,
                background: `linear-gradient(90deg, ${color} 0%, transparent 100%)`,
                boxShadow: `0 0 10px ${color}80`,
                transition: 'width 0.5s ease',
              }}
            />
          </div>
        </div>

        {/* Enter Kingdom Button */}
        {showEnterButton && (
          <button
            onClick={handleEnterCity}
            style={{
              marginTop: 'var(--space-md)',
              width: '100%',
              padding: 'var(--space-sm) var(--space-md)',
              background: `${color}20`,
              border: `1px solid ${color}`,
              borderRadius: '2px',
              fontFamily: 'Cinzel, serif',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: color,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-sm)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `${color}40`;
              e.currentTarget.style.boxShadow = `0 0 15px ${color}50`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = `${color}20`;
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <span>{t('worldCard.enterKingdom')}</span>
            <span style={{ opacity: 0.7 }}>{'>'}</span>
          </button>
        )}

        {/* Page Transition Overlay */}
        <TransitionOverlay
          isActive={transitioning}
          onComplete={handleTransitionComplete}
          glitchText={world.name.toUpperCase()}
        />
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes reveal {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
