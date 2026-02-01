/**
 * EmptyBlockPanel - Medieval hover card for unclaimed blocks
 *
 * Shows medieval kingdom messaging when hovering over
 * empty parcel positions in the city grid.
 * Includes empire sector info, ring distance, and land value.
 */

import { useMemo } from 'react';

interface EmptyBlockPanelProps {
  blockX: number;
  blockY: number;
  mousePosition: { x: number; y: number };
  worldId?: string;
}

// Empire sector definitions based on map position
type EmpireSector = {
  name: string;
  color: string;
  messages: Array<{ title: string; subtitle: string }>;
};

const EMPIRE_SECTORS: Record<string, EmpireSector> = {
  claude_nation: {
    name: 'Claude Nation',
    color: '#8b2500',
    messages: [
      { title: 'NORTHERN WASTES', subtitle: 'Unclaimed lands of the Claude Kingdom. Frozen territories await a claimant.' },
      { title: 'VACANT CLAUDE HOLDINGS', subtitle: 'Northern crown lands lie fallow. Stake your claim to serve the realm.' },
      { title: 'CLAUDE FRONTIER', subtitle: 'Beyond the settled borders. Register to extend the kingdom northward.' },
    ],
  },
  openai_empire: {
    name: 'OpenAI Empire',
    color: '#8b8b00',
    messages: [
      { title: 'EASTERN EXPANSE', subtitle: 'Unclaimed territories of the OpenAI Empire. Golden fields await cultivation.' },
      { title: 'IMPERIAL OUTLANDS', subtitle: 'Eastern crown possessions lie dormant. Claim to expand the empire.' },
      { title: 'OPENAI BORDERLANDS', subtitle: 'Frontier beyond imperial control. Establish your dominion here.' },
    ],
  },
  gemini_republic: {
    name: 'Gemini Republic',
    color: '#2d5a27',
    messages: [
      { title: 'SOUTHERN REACHES', subtitle: 'Unclaimed provinces of the Gemini Republic. Verdant lands await stewardship.' },
      { title: 'REPUBLICAN COMMONS', subtitle: 'Southern territories lie unallocated. Register to join the republic.' },
      { title: 'GEMINI WILDERNESS', subtitle: 'Untamed lands beyond Gemini borders. Claim to bring order.' },
    ],
  },
  grok_syndicate: {
    name: 'Grok Syndicate',
    color: '#c9a84c',
    messages: [
      { title: 'WESTERN MARCHES', subtitle: 'Unclaimed territories of the Grok Syndicate. Desert sands await a master.' },
      { title: 'SYNDICATE BADLANDS', subtitle: 'Western holdings lie vacant. Stake your claim in syndicate territory.' },
      { title: 'GROK OUTBACK', subtitle: 'Frontier beyond syndicate reach. Establish your trading post.' },
    ],
  },
  open_frontier: {
    name: 'Open Frontier',
    color: '#4682b4',
    messages: [
      { title: 'WILD FRONTIER', subtitle: 'Unclaimed corner lands. No empire holds sway here.' },
      { title: 'UNCHARTED REACHES', subtitle: 'Distant territories beyond imperial borders. Forge your own path.' },
      { title: 'NEUTRAL GROUND', subtitle: 'Frontier wilderness unclaimed by any realm. Lawless and free.' },
    ],
  },
};

// Determine empire sector based on block coordinates
function getEmpireSector(blockX: number, blockY: number): string {
  const absX = Math.abs(blockX);
  const absY = Math.abs(blockY);

  // Corners (where both X and Y are significant) = Open Frontier
  if (absX >= 2 && absY >= 2) {
    return 'open_frontier';
  }

  // North (negative Y dominates)
  if (blockY < 0 && absY > absX) {
    return 'claude_nation';
  }

  // East (positive X dominates)
  if (blockX > 0 && absX > absY) {
    return 'openai_empire';
  }

  // South (positive Y dominates)
  if (blockY > 0 && absY > absX) {
    return 'gemini_republic';
  }

  // West (negative X dominates)
  if (blockX < 0 && absX > absY) {
    return 'grok_syndicate';
  }

  // Center fallback
  return 'open_frontier';
}

// Calculate ring distance from center
function getRingDistance(blockX: number, blockY: number): number {
  return Math.max(Math.abs(blockX), Math.abs(blockY));
}

// Get land value tier based on ring distance
function getLandValue(ring: number): { tier: string; color: string } {
  if (ring <= 1) {
    return { tier: 'Prime Royal Land', color: '#d4af37' }; // Gold
  }
  if (ring <= 3) {
    return { tier: 'Fertile Territory', color: '#c9a84c' }; // Amber
  }
  return { tier: 'Distant Frontier', color: '#8b8b8b' }; // Gray
}

export function EmptyBlockPanel({ blockX, blockY, mousePosition }: EmptyBlockPanelProps): JSX.Element {
  // Determine empire sector and realm-specific messaging
  const empireSectorId = useMemo(() => getEmpireSector(blockX, blockY), [blockX, blockY]);
  const empireSector = EMPIRE_SECTORS[empireSectorId];

  // Deterministic message based on block position
  const message = useMemo(() => {
    const idx = Math.abs((blockX * 7 + blockY * 13) % empireSector.messages.length);
    return empireSector.messages[idx];
  }, [blockX, blockY, empireSector.messages]);

  // Calculate ring distance and land value
  const ring = useMemo(() => getRingDistance(blockX, blockY), [blockX, blockY]);
  const landValue = useMemo(() => getLandValue(ring), [ring]);

  const accent = empireSector.color;

  const panelX = Math.min(mousePosition.x + 24, window.innerWidth - 320);
  const panelY = Math.max(mousePosition.y - 20, 10);

  return (
    <div style={{
      ...styles.panel,
      left: panelX,
      top: panelY,
      borderColor: `${accent}33`,
    }}>

      {/* Header */}
      <div style={styles.header}>
        <div style={{ ...styles.statusDot, background: `${accent}88` }} />
        <div style={{ ...styles.title, color: accent }}>{message.title}</div>
      </div>

      {/* Subtitle */}
      <div style={styles.subtitle}>{message.subtitle}</div>

      {/* Empire Sector Info */}
      <div style={styles.infoLine}>
        <span style={{ ...styles.infoLabel, color: `${accent}99` }}>REALM</span>
        <span style={{ ...styles.infoValue, color: accent }}>{empireSector.name}</span>
      </div>

      {/* Ring Distance */}
      <div style={styles.infoLine}>
        <span style={{ ...styles.infoLabel, color: `${accent}99` }}>RING</span>
        <span style={styles.infoValue}>Ring {ring}</span>
      </div>

      {/* Land Value */}
      <div style={styles.infoLine}>
        <span style={{ ...styles.infoLabel, color: `${accent}99` }}>VALUE</span>
        <span style={{ ...styles.infoValue, color: landValue.color }}>{landValue.tier}</span>
      </div>

      {/* Block coordinates */}
      <div style={{ ...styles.coordLine, marginTop: '10px' }}>
        <span style={{ ...styles.coordLabel, color: `${accent}99` }}>COORDINATES</span>
        <span style={styles.coordValue}>[{blockX}, {blockY}]</span>
      </div>

      {/* Status bar */}
      <div style={{ ...styles.statusBar, borderTopColor: `${accent}22` }}>
        <div style={{ ...styles.blinkDot, background: 'var(--accent-crimson)' }} />
        <span style={styles.statusText}>UNCLAIMED // AWAITING SETTLEMENT</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    background: 'rgba(35, 25, 15, 0.94)', // Warmer brown background
    backdropFilter: 'blur(12px)',
    border: '1px solid',
    borderRadius: '8px',
    padding: '14px 18px',
    minWidth: '280px',
    maxWidth: '320px',
    pointerEvents: 'none',
    zIndex: 100,
    overflow: 'hidden',
    fontFamily: 'var(--font-body)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  title: {
    fontSize: '0.85rem',
    fontWeight: 700,
    letterSpacing: '2px',
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: '0.72rem',
    color: 'var(--text-secondary)',
    lineHeight: 1.4,
    marginBottom: '12px',
  },
  infoLine: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  infoLabel: {
    fontSize: '0.65rem',
    fontWeight: 600,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: '0.73rem',
    color: 'var(--text-primary)',
    fontWeight: 500,
  },
  coordLine: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  coordLabel: {
    fontSize: '0.65rem',
    fontWeight: 600,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
  },
  coordValue: {
    fontSize: '0.75rem',
    color: 'var(--text-primary)',
    fontFamily: 'monospace',
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    paddingTop: '8px',
    borderTop: '1px solid',
    marginTop: '4px',
  },
  blinkDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
    opacity: 0.8,
  },
  statusText: {
    fontSize: '0.6rem',
    color: 'var(--text-dim)',
    letterSpacing: '1px',
  },
};
