/**
 * IntelPanel - Right-edge slide-in panel showing agent dossier on building click
 *
 * Reuses the AgentDossier data fetching pattern but renders inline (not modal).
 * Tabs: FILE / BREACH / ECON
 */

import { useState, useEffect } from 'react';
import type { SelectedBuilding } from '../../hooks/useSelectedBuilding';
import { useActiveBattles } from '../../socket';

type TabView = 'FILE' | 'BREACH' | 'ECON';

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

const WORLD_COLORS: Record<string, string> = {
  claude_nation: 'var(--claude-nation-primary, #8b2500)',
  openai_empire: 'var(--openai-empire-primary, #8b8b00)',
  gemini_republic: 'var(--gemini-republic-primary, #2d5a27)',
  grok_syndicate: 'var(--grok-syndicate-primary, #c9a84c)',
  open_frontier: 'var(--open-frontier-primary, #4682b4)',
};

const THREAT_TIER_COLORS: Record<string, string> = {
  S: 'var(--accent-crimson, #8b0000)',
  A: 'var(--accent-bronze, #cd7f32)',
  B: 'var(--accent-gold, #c9a84c)',
  C: 'var(--accent-forest, #2d5a27)',
  D: 'var(--text-muted, #786850)',
};

interface IntelPanelProps {
  selected: SelectedBuilding;
  onClose: () => void;
}

export function IntelPanel({ selected, onClose }: IntelPanelProps) {
  const [data, setData] = useState<DossierData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabView>('FILE');
  const activeBattles = useActiveBattles();

  const agentId = selected.agentId;

  // Fetch dossier
  useEffect(() => {
    if (!agentId) {
      setLoading(false);
      setError('NO AGENT ASSIGNED');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/agents/${agentId}/dossier`)
      .then(res => {
        if (!res.ok) throw new Error(res.status === 404 ? 'ENTITY NOT FOUND' : 'ACCESS DENIED');
        return res.json();
      })
      .then(json => {
        if (!cancelled) {
          setData(json.data || json);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'SYSTEM ERROR');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [agentId]);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Active Battles involving this agent
  const agentBattles = activeBattles.filter(
    (b: any) => b.attackerId === agentId || b.defenderId === agentId
  );

  const worldColor = data ? WORLD_COLORS[data.identity.worldId] || 'var(--text-primary)' : 'var(--text-primary)';
  const threatColor = data ? THREAT_TIER_COLORS[data.threat.tier] : 'var(--text-muted)';

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={{ ...styles.header, borderBottomColor: `${worldColor}40` }}>
        <div style={styles.headerTop}>
          <div style={{ ...styles.classifiedLabel }}>
            INTEL // DOSSIER
          </div>
          <button onClick={onClose} style={styles.closeBtn}>ESC</button>
        </div>

        {data && (
          <div style={styles.headerContent}>
            <div style={{ ...styles.agentName, color: worldColor }}>
              {data.identity.handle}
            </div>
            <div style={styles.agentMeta}>
              {data.identity.worldName} // {data.identity.cortexLineage}
            </div>
            <div style={styles.threatBadge}>
              <span style={{ ...styles.tierIcon, color: threatColor, borderColor: threatColor }}>
                {data.threat.tier}
              </span>
              <span style={{ color: threatColor, fontSize: '0.5625rem' }}>
                THREAT {data.threat.tier}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Active Battle Warning */}
      {agentBattles.length > 0 && (
        <div style={styles.netrunWarning}>
          {agentBattles.map((battle: any) => (
            <div key={battle.battleId} style={styles.netrunItem}>
              <span style={{ color: 'var(--accent-crimson)', fontWeight: 700 }}>BATTLE ACTIVE</span>
              <div style={styles.barContainer}>
                <span style={{ color: 'var(--accent-gold)' }}>⚔ {battle.attackerArmy} vs 🛡 {battle.defenderArmy}</span>
              </div>
              <div style={{ fontSize: '0.5625rem', color: 'var(--text-dim)' }}>
                {battle.attackerName} {'\u2694'} {battle.defenderName} [{battle.status}]
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={styles.loadingBox}>
          <span style={{ color: 'var(--accent-gold)', letterSpacing: '0.1em' }}>DISPATCHING...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={styles.errorBox}>
          <span style={{ color: 'var(--accent-crimson)' }}>{error}</span>
        </div>
      )}

      {/* Tabs + Content */}
      {!loading && !error && data && (
        <>
          <div style={styles.tabs}>
            {(['FILE', 'BREACH', 'ECON'] as TabView[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  ...styles.tab,
                  color: tab === t ? worldColor : 'var(--text-muted)',
                  borderBottomColor: tab === t ? worldColor : 'transparent',
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <div style={styles.content}>
            {tab === 'FILE' && <FileContent data={data} worldColor={worldColor} threatColor={threatColor} />}
            {tab === 'BREACH' && <BreachContent data={data} />}
            {tab === 'ECON' && <EconContent data={data} />}
          </div>
        </>
      )}

      <style>{intelPanelStyles}</style>
    </div>
  );
}

// -- FILE Tab --
function FileContent({ data, worldColor, threatColor }: { data: DossierData; worldColor: string; threatColor: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <InfoSection title="PROFILE">
        <InfoRow label="Handle" value={data.identity.handle} color={worldColor} />
        <InfoRow label="Lineage" value={data.identity.cortexLineage} />
        <InfoRow label="Status" value={data.identity.status} color={data.identity.status === 'ACTIVE' ? 'var(--accent-forest)' : 'var(--text-dim)'} />
      </InfoSection>

      <InfoSection title="HAZARD">
        <InfoRow label="Tier" value={data.threat.tier} color={threatColor} />
        <InfoRow label="Notoriety" value={String(data.threat.notoriety)} />
        <InfoRow label="Success Rate" value={`${(data.threat.hackSuccessRate * 100).toFixed(0)}%`} />
        <InfoRow label="Hacks" value={`${data.threat.totalHacksLaunched}/${data.threat.totalHacksReceived}`} />
      </InfoSection>

      <InfoSection title="DEFENSE">
        <div style={{ marginBottom: '4px' }}>
          <div style={infoRowStyles.barBg}>
            <div style={{ ...infoRowStyles.barFill, width: `${data.capabilities.defenseIntegrity}%` }} />
          </div>
          <div style={{ textAlign: 'right', fontSize: '0.5625rem', color: 'var(--accent-forest)' }}>
            {data.capabilities.defenseIntegrity}%
          </div>
        </div>
        {data.capabilities.firewallModules.map((m, i) => (
          <InfoRow key={i} label={m.moduleType} value={`LVL ${m.level}`} color="var(--accent-gold)" />
        ))}
      </InfoSection>
    </div>
  );
}

// -- BREACH Tab --
function BreachContent({ data }: { data: DossierData }) {
  if (data.breachChronicle.length === 0) {
    return <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-dim)' }}>NO RECORDS</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {data.breachChronicle.map(b => {
        const isSuccess = b.outcome.toLowerCase().includes('success');
        const outColor = isSuccess ? 'var(--accent-forest)' : 'var(--accent-crimson)';
        return (
          <div key={b.runId} style={{ ...infoRowStyles.breachItem, borderLeftColor: outColor }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.5625rem' }}>{formatDate(b.timestamp)}</span>
              <span style={{ color: outColor, fontSize: '0.5625rem', textTransform: 'uppercase' }}>{b.outcome}</span>
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              TARGET: {b.targetName} [{b.approach}]
            </div>
            {b.loot > 0 && (
              <div style={{ color: 'var(--accent-forest)' }}>+{b.loot.toLocaleString()} CRD</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// -- ECON Tab --
function EconContent({ data }: { data: DossierData }) {
  const net = data.economy.totalEarned - data.economy.totalSpent;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={infoRowStyles.credBox}>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-gold)' }}>
          {data.economy.credReserve.toLocaleString()}
        </div>
        <div style={{ fontSize: '0.5625rem', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>CRED</div>
      </div>
      <InfoSection title="LEDGER">
        <InfoRow label="Earned" value={`${data.economy.totalEarned.toLocaleString()}`} color="var(--accent-forest)" />
        <InfoRow label="Spent" value={`${data.economy.totalSpent.toLocaleString()}`} color="var(--accent-crimson)" />
        <InfoRow label="Net" value={`${net >= 0 ? '+' : ''}${net.toLocaleString()}`} color={net >= 0 ? 'var(--accent-forest)' : 'var(--accent-crimson)'} />
        <InfoRow label="Trades" value={String(data.economy.tradesCompleted)} />
      </InfoSection>
    </div>
  );
}

// -- Helpers --
function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={infoRowStyles.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={infoRowStyles.row}>
      <span style={infoRowStyles.label}>{label}</span>
      <span style={{ ...infoRowStyles.value, color: color || 'var(--text-secondary)' }}>{value}</span>
    </div>
  );
}

function formatDate(s: string): string {
  const d = new Date(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const intelPanelStyles = `
  @keyframes intelpanel-slidein {
    from { transform: translateX(360px); }
    to { transform: translateX(0); }
  }
`;

const infoRowStyles: Record<string, React.CSSProperties> = {
  sectionTitle: {
    fontSize: '0.5625rem',
    fontWeight: 700,
    color: 'var(--accent-gold, #c9a84c)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: '6px',
    textShadow: '0 0 6px var(--accent-gold, #c9a84c)',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '2px 0',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  label: {
    fontSize: '0.5625rem',
    color: 'var(--text-dim, #555)',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  value: {
    fontSize: '0.6875rem',
  },
  barBg: {
    height: '4px',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    background: 'var(--accent-forest, #2d5a27)',
    borderRadius: '2px',
  },
  breachItem: {
    padding: '6px 8px',
    background: 'rgba(255,255,255,0.03)',
    borderLeft: '3px solid',
    borderRadius: '0 2px 2px 0',
    fontSize: '0.6875rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  credBox: {
    padding: '12px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--accent-gold, #c9a84c)',
    borderRadius: '2px',
    textAlign: 'center',
  },
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: '56px',
    right: '8px',
    bottom: '52px',
    width: '340px',
    background: 'rgba(10,10,20,0.95)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '4px',
    backdropFilter: 'blur(12px)',
    zIndex: 150,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '0.6875rem',
    animation: 'intelpanel-slidein 0.3s ease-out',
    pointerEvents: 'auto',
    overflow: 'hidden',
  },
  header: {
    padding: '10px 12px',
    borderBottom: '1px solid',
    flexShrink: 0,
  },
  headerTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  classifiedLabel: {
    fontSize: '0.5625rem',
    color: 'var(--accent-crimson, #8b0000)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    textShadow: '0 0 6px var(--accent-crimson, #8b0000)',
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '2px',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '2px 8px',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.5625rem',
    letterSpacing: '0.05em',
  },
  headerContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  agentName: {
    fontSize: '1.125rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  agentMeta: {
    fontSize: '0.5625rem',
    color: 'var(--text-dim)',
    letterSpacing: '0.05em',
  },
  threatBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '4px',
  },
  tierIcon: {
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid',
    borderRadius: '2px',
    fontWeight: 700,
    fontSize: '0.875rem',
  },
  netrunWarning: {
    padding: '6px 12px',
    background: 'rgba(255,51,102,0.08)',
    borderBottom: '1px solid rgba(255,51,102,0.2)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  netrunItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  barContainer: {
    height: '3px',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: '1px',
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    transition: 'width 0.3s ease',
  },
  loadingBox: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  errorBox: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    padding: '8px 0',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.625rem',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    transition: 'color 0.2s',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '10px 12px',
  },
};
