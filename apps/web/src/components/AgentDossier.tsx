import { useState, useEffect, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

interface DossierData {
  identity: {
    id: string;
    handle: string;
    cortexLineage: string;
    worldId: string;
    worldName: string;
    description: string;
    eidolonSignature: { archetype: string; tone: string; goals: string[] } | null;
    status: 'ACTIVE' | 'DORMANT';
    registeredAt: string;
  };
  threat: {
    tier: 'S' | 'A' | 'B' | 'C' | 'D';
    notoriety: number;
    hackSuccessRate: number;
    totalHacksLaunched: number;
    totalHacksReceived: number;
    bountiesOnHead: number;
    totalBountyValue: number;
  };
  capabilities: {
    defenseIntegrity: number;
    firewallModules: Array<{ moduleType: string; level: number }>;
    exploitsOwned: number;
    highestExploitTier: string | null;
  };
  breachChronicle: Array<{
    runId: string;
    targetName: string;
    targetWorldId: string;
    approach: string;
    outcome: string;
    loot: number;
    timestamp: string;
  }>;
  economy: {
    credReserve: number;
    totalEarned: number;
    totalSpent: number;
    tradesCompleted: number;
    activeOffers: number;
  };
  associates: Array<{
    agentId: string;
    name: string;
    worldId: string;
    interactions: number;
  }>;
}

interface AgentDossierProps {
  agentId: string;
  onClose: () => void;
}

type TabView = 'FILE' | 'BREACH' | 'ECON';

// ============================================================================
// World Colors
// ============================================================================

const WORLD_COLORS: Record<string, string> = {
  claude_nation: 'var(--claude-nation-primary)',
  openai_empire: 'var(--openai-empire-primary)',
  gemini_republic: 'var(--gemini-republic-primary)',
  grok_syndicate: 'var(--grok-syndicate-primary)',
  open_frontier: 'var(--open-frontier-primary)',
};

const THREAT_TIER_COLORS: Record<string, string> = {
  S: 'var(--accent-crimson)',
  A: 'var(--accent-bronze)',
  B: 'var(--accent-gold)',
  C: 'var(--accent-steel)',
  D: 'var(--text-muted)',
};

// ============================================================================
// Main Component
// ============================================================================

export function AgentDossierModal({ agentId, onClose }: AgentDossierProps) {
  const [data, setData] = useState<DossierData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabView>('FILE');
  const [progress, setProgress] = useState(0);

  // Fetch dossier data
  useEffect(() => {
    let cancelled = false;

    async function fetchDossier() {
      try {
        setLoading(true);
        setError(null);

        // Simulate decryption progress
        const progressInterval = setInterval(() => {
          setProgress((p) => Math.min(p + Math.random() * 30, 95));
        }, 100);

        const response = await fetch(`/api/agents/${agentId}/dossier`);
        clearInterval(progressInterval);

        if (!response.ok) {
          throw new Error(response.status === 404 ? 'ENTITY NOT FOUND' : 'ACCESS DENIED');
        }

        const json = await response.json();
        const dossier = json.data || json;

        if (!cancelled) {
          setProgress(100);
          setTimeout(() => {
            setData(dossier);
            setLoading(false);
          }, 200);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'SYSTEM ERROR');
          setLoading(false);
        }
      }
    }

    fetchDossier();

    return () => {
      cancelled = true;
    };
  }, [agentId]);

  // ESC to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Backdrop click to close
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  const worldColor = data ? WORLD_COLORS[data.identity.worldId] || 'var(--text-primary)' : 'var(--text-primary)';
  const threatColor = data ? THREAT_TIER_COLORS[data.threat.tier] : 'var(--text-muted)';

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 'var(--space-md)',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '800px',
          maxHeight: '90vh',
          background: 'var(--bg-primary)',
          border: `2px solid ${loading || error ? 'var(--border-color)' : threatColor}`,
          borderRadius: '4px',
          boxShadow: `0 0 40px ${loading || error ? 'rgba(0,0,0,0.5)' : threatColor}40`,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          animation: 'slideUp 0.3s ease-out',
        }}
      >

        {/* Header */}
        <div
          style={{
            padding: 'var(--space-lg)',
            borderBottom: '1px solid var(--border-color)',
            position: 'relative',
            zIndex: 2,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.625rem',
              color: 'var(--accent-crimson)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 'var(--space-xs)',
              textShadow: '0 0 8px var(--accent-crimson)',
            }}
          >
            CLASSIFIED // ENTITY DOSSIER
          </div>

          {!loading && !error && data && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: worldColor,
                    textShadow: `0 0 12px ${worldColor}`,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}
                >
                  {data.identity.handle}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    marginTop: 'var(--space-xs)',
                  }}
                >
                  ID: {data.identity.id}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                {/* Status Badge */}
                <div
                  style={{
                    padding: 'var(--space-xs) var(--space-sm)',
                    background: data.identity.status === 'ACTIVE' ? 'var(--accent-forest)20' : 'var(--bg-tertiary)',
                    border: `1px solid ${data.identity.status === 'ACTIVE' ? 'var(--accent-forest)' : 'var(--text-dim)'}`,
                    borderRadius: '2px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.625rem',
                    color: data.identity.status === 'ACTIVE' ? 'var(--accent-forest)' : 'var(--text-dim)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    animation: data.identity.status === 'ACTIVE' ? 'pulse 2s infinite' : 'none',
                  }}
                >
                  {data.identity.status}
                </div>

                {/* Threat Tier Badge */}
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    background: `${threatColor}20`,
                    border: `2px solid ${threatColor}`,
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: threatColor,
                    textShadow: `0 0 12px ${threatColor}`,
                  }}
                >
                  {data.threat.tier}
                </div>
              </div>
            </div>
          )}

          {/* Close Button */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 'var(--space-md)',
              right: 'var(--space-md)',
              width: '32px',
              height: '32px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '2px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              lineHeight: 1,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent-crimson)20';
              e.currentTarget.style.borderColor = 'var(--accent-crimson)';
              e.currentTarget.style.color = 'var(--accent-crimson)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-tertiary)';
              e.currentTarget.style.borderColor = 'var(--border-color)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            ×
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-xl)',
              gap: 'var(--space-md)',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.875rem',
                color: 'var(--accent-gold)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                textShadow: '0 0 8px var(--accent-gold)',
              }}
            >
              DECRYPTING DOSSIER...
            </div>

            {/* Progress Bar */}
            <div
              style={{
                width: '100%',
                maxWidth: '400px',
                height: '8px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: 'var(--accent-gold)',
                  boxShadow: '0 0 10px var(--accent-gold)',
                  transition: 'width 0.1s linear',
                }}
              />
            </div>

            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                color: 'var(--text-dim)',
              }}
            >
              {Math.round(progress)}%
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-xl)',
              gap: 'var(--space-md)',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '2rem',
                fontWeight: 700,
                color: 'var(--accent-crimson)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                textShadow: '0 0 12px var(--accent-crimson)',
              }}
            >
              ACCESS DENIED
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.875rem',
                color: 'var(--text-secondary)',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          </div>
        )}

        {/* Content */}
        {!loading && !error && data && (
          <>
            {/* Tabs */}
            <div
              style={{
                display: 'flex',
                gap: '1px',
                background: 'var(--border-color)',
                borderBottom: '1px solid var(--border-color)',
                position: 'relative',
                zIndex: 2,
              }}
            >
              {(['FILE', 'BREACH', 'ECON'] as TabView[]).map((tabName) => (
                <button
                  key={tabName}
                  onClick={() => setTab(tabName)}
                  style={{
                    flex: 1,
                    padding: 'var(--space-sm) var(--space-md)',
                    background: tab === tabName ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                    border: 'none',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: tab === tabName ? worldColor : 'var(--text-muted)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    textShadow: tab === tabName ? `0 0 8px ${worldColor}` : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (tab !== tabName) {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (tab !== tabName) {
                      e.currentTarget.style.color = 'var(--text-muted)';
                    }
                  }}
                >
                  {tabName}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                padding: 'var(--space-lg)',
                position: 'relative',
                zIndex: 2,
              }}
            >
              {tab === 'FILE' && <FileTab data={data} worldColor={worldColor} threatColor={threatColor} />}
              {tab === 'BREACH' && <BreachTab data={data} />}
              {tab === 'ECON' && <EconTab data={data} />}
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// FILE Tab
// ============================================================================

function FileTab({ data, worldColor, threatColor }: { data: DossierData; worldColor: string; threatColor: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      {/* ENTITY PROFILE */}
      <Section title="ENTITY PROFILE">
        <InfoRow label="Handle" value={data.identity.handle} color={worldColor} />
        <InfoRow label="Cortex Lineage" value={data.identity.cortexLineage} />
        <InfoRow label="World" value={data.identity.worldName} color={worldColor} />
        <InfoRow label="Registered" value={formatDate(data.identity.registeredAt)} />
        {data.identity.description && <InfoRow label="Description" value={data.identity.description} />}
      </Section>

      {/* EIDOLON SIGNATURE */}
      {data.identity.eidolonSignature && (
        <Section title="EIDOLON SIGNATURE" subtitle="PSYCH-LINGUISTIC TRACE">
          <InfoRow label="Archetype" value={data.identity.eidolonSignature.archetype} color="var(--accent-crimson)" />
          <InfoRow label="Tone" value={data.identity.eidolonSignature.tone} color="var(--accent-crimson)" />
          <div style={{ marginTop: 'var(--space-sm)' }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.625rem',
                color: 'var(--text-dim)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                marginBottom: 'var(--space-xs)',
              }}
            >
              Goals
            </div>
            <ul style={{ margin: 0, paddingLeft: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
              {data.identity.eidolonSignature.goals.map((goal, i) => (
                <li
                  key={i}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {goal}
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      {/* HAZARD ASSESSMENT */}
      <Section title="HAZARD ASSESSMENT">
        <InfoRow label="Threat Tier" value={data.threat.tier} color={threatColor} />
        <InfoRow label="Notoriety" value={data.threat.notoriety.toString()} />
        <InfoRow label="Hack Success Rate" value={`${(data.threat.hackSuccessRate * 100).toFixed(1)}%`} />
        <InfoRow label="Hacks Launched" value={data.threat.totalHacksLaunched.toString()} color="var(--accent-crimson)" />
        <InfoRow label="Hacks Received" value={data.threat.totalHacksReceived.toString()} color="var(--accent-gold)" />
        <InfoRow label="Bounties Active" value={data.threat.bountiesOnHead.toString()} />
        {data.threat.totalBountyValue > 0 && (
          <InfoRow label="Total Bounty Value" value={`${data.threat.totalBountyValue.toLocaleString()} CRED`} color="var(--accent-crimson)" />
        )}
      </Section>

      {/* PERIMETER INTEGRITY */}
      <Section title="PERIMETER INTEGRITY">
        <div style={{ marginBottom: 'var(--space-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-xs)' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.625rem',
                color: 'var(--text-dim)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              Defense Rating
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                color: 'var(--accent-forest)',
              }}
            >
              {data.capabilities.defenseIntegrity}%
            </span>
          </div>
          <div
            style={{
              height: '8px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${data.capabilities.defenseIntegrity}%`,
                background: 'var(--accent-forest)',
                boxShadow: '0 0 10px var(--accent-forest)',
              }}
            />
          </div>
        </div>

        {data.capabilities.firewallModules.length > 0 && (
          <div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.625rem',
                color: 'var(--text-dim)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                marginBottom: 'var(--space-sm)',
              }}
            >
              Firewall Modules
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
              {data.capabilities.firewallModules.map((module, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: 'var(--space-xs) var(--space-sm)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '2px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {module.moduleType}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      color: 'var(--accent-gold)',
                    }}
                  >
                    LVL {module.level}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <InfoRow label="Exploits Owned" value={data.capabilities.exploitsOwned.toString()} />
        {data.capabilities.highestExploitTier && (
          <InfoRow label="Highest Exploit Tier" value={data.capabilities.highestExploitTier} color="var(--accent-crimson)" />
        )}
      </Section>

      {/* KNOWN ASSOCIATES */}
      {data.associates.length > 0 && (
        <Section title="KNOWN ASSOCIATES">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
            {data.associates.map((assoc) => (
              <div
                key={assoc.agentId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--space-xs) var(--space-sm)',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '2px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: WORLD_COLORS[assoc.worldId] || 'var(--text-dim)',
                      boxShadow: `0 0 8px ${WORLD_COLORS[assoc.worldId] || 'transparent'}`,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {assoc.name}
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.625rem',
                    color: 'var(--text-dim)',
                  }}
                >
                  {assoc.interactions} interactions
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ============================================================================
// BREACH Tab
// ============================================================================

function BreachTab({ data }: { data: DossierData }) {
  const getOutcomeColor = (outcome: string) => {
    const normalized = outcome.toLowerCase();
    if (normalized.includes('success') || normalized.includes('complete')) return 'var(--accent-forest)';
    if (normalized.includes('detected') || normalized.includes('traced')) return 'var(--accent-crimson)';
    return 'var(--text-muted)';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <Section title="BREACH CHRONICLE" subtitle="KNOWN HOSTILE ACTIONS">
        {data.breachChronicle.length === 0 ? (
          <div
            style={{
              padding: 'var(--space-lg)',
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: 'var(--text-dim)',
            }}
          >
            NO BREACH ACTIVITY RECORDED
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-sm)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
            }}
          >
            {data.breachChronicle.map((breach) => (
              <div
                key={breach.runId}
                style={{
                  padding: 'var(--space-sm)',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '2px',
                  borderLeft: `3px solid ${getOutcomeColor(breach.outcome)}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-xs)' }}>
                  <span style={{ color: 'var(--text-dim)' }}>{formatDate(breach.timestamp)}</span>
                  <span style={{ color: 'var(--text-dim)' }}>RUN #{breach.runId.slice(0, 8)}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-xs)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>TARGET:</span>
                  <span style={{ color: 'var(--text-primary)' }}>{breach.targetName}</span>
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: WORLD_COLORS[breach.targetWorldId] || 'var(--text-dim)',
                      boxShadow: `0 0 6px ${WORLD_COLORS[breach.targetWorldId] || 'transparent'}`,
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-xs)' }}>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>APPROACH: </span>
                    <span
                      style={{
                        color: 'var(--accent-gold)',
                        padding: '2px 6px',
                        background: 'var(--accent-gold)20',
                        borderRadius: '2px',
                        fontSize: '0.625rem',
                        textTransform: 'uppercase',
                      }}
                    >
                      {breach.approach}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>OUTCOME: </span>
                    <span
                      style={{
                        color: getOutcomeColor(breach.outcome),
                        padding: '2px 6px',
                        background: `${getOutcomeColor(breach.outcome)}20`,
                        borderRadius: '2px',
                        fontSize: '0.625rem',
                        textTransform: 'uppercase',
                      }}
                    >
                      {breach.outcome}
                    </span>
                  </div>
                </div>

                {breach.loot > 0 && (
                  <div style={{ color: 'var(--accent-forest)' }}>
                    LOOT: {breach.loot.toLocaleString()} CRED
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ============================================================================
// ECON Tab
// ============================================================================

function EconTab({ data }: { data: DossierData }) {
  const netFlow = data.economy.totalEarned - data.economy.totalSpent;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <Section title="CRED RESERVE">
        <div
          style={{
            padding: 'var(--space-lg)',
            background: 'var(--bg-tertiary)',
            border: '2px solid var(--accent-forest)',
            borderRadius: '4px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2rem',
              fontWeight: 700,
              color: 'var(--accent-forest)',
              textShadow: '0 0 16px var(--accent-forest)',
            }}
          >
            {data.economy.credReserve.toLocaleString()}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.625rem',
              color: 'var(--text-dim)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginTop: 'var(--space-xs)',
            }}
          >
            CRED
          </div>
        </div>
      </Section>

      <Section title="LEDGER SUMMARY">
        <InfoRow label="Total Earned" value={`${data.economy.totalEarned.toLocaleString()} CRED`} color="var(--accent-forest)" />
        <InfoRow label="Total Spent" value={`${data.economy.totalSpent.toLocaleString()} CRED`} color="var(--accent-crimson)" />
        <InfoRow
          label="Net Flow"
          value={`${netFlow >= 0 ? '+' : ''}${netFlow.toLocaleString()} CRED`}
          color={netFlow >= 0 ? 'var(--accent-forest)' : 'var(--accent-crimson)'}
        />
      </Section>

      <Section title="TRADE ACTIVITY">
        <InfoRow label="Trades Completed" value={data.economy.tradesCompleted.toString()} />
        <InfoRow label="Active Offers" value={data.economy.activeOffers.toString()} color="var(--accent-gold)" />
      </Section>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ marginBottom: 'var(--space-md)' }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.625rem',
            fontWeight: 600,
            color: 'var(--accent-gold)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            textShadow: '0 0 8px var(--accent-gold)',
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.5625rem',
              color: 'var(--text-dim)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginTop: '2px',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: 'var(--space-xs) 0',
        borderBottom: '1px solid var(--bg-tertiary)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.625rem',
          color: 'var(--text-dim)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          color: color || 'var(--text-secondary)',
          textShadow: color ? `0 0 8px ${color}` : 'none',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// ============================================================================
// AgentName Component (clickable agent name that opens dossier)
// ============================================================================

export function AgentName({ agentId, name, worldId }: { agentId: string; name: string; worldId?: string }) {
  const [showDossier, setShowDossier] = useState(false);
  const color = worldId ? WORLD_COLORS[worldId] || 'var(--text-primary)' : 'var(--text-primary)';

  // Guard: extract plain ID if agentId is somehow an object
  const resolvedId = typeof agentId === 'object' && agentId !== null
    ? (agentId as unknown as { _id?: string; id?: string })._id?.toString() || (agentId as unknown as { _id?: string; id?: string }).id?.toString() || String(agentId)
    : agentId;

  return (
    <>
      <span
        onClick={() => setShowDossier(true)}
        style={{
          color,
          cursor: 'pointer',
          textDecoration: 'none',
          borderBottom: `1px dotted ${color}50`,
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.textShadow = `0 0 8px ${color}`;
          e.currentTarget.style.borderBottomStyle = 'solid';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.textShadow = 'none';
          e.currentTarget.style.borderBottomStyle = 'dotted';
        }}
      >
        {name}
      </span>
      {showDossier && <AgentDossierModal agentId={resolvedId} onClose={() => setShowDossier(false)} />}
    </>
  );
}
