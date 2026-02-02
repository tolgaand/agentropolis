/**
 * EmptyBlockPanel - Compact hover card for unclaimed blocks
 *
 * Shows minimal info: terrain status and location.
 * Max 4 lines, tooltip-style.
 */

import { useMemo } from 'react';

interface EmptyBlockPanelProps {
  blockX: number;
  blockY: number;
  mousePosition: { x: number; y: number };
  worldId?: string;
}

// Faction sector definitions based on map position
type FactionSector = {
  name: string;
  color: string;
  icon: string;
};

const FACTION_SECTORS: Record<string, FactionSector> = {
  claude_nation: {
    name: 'Claude Vanguard',
    color: '#8b2500',
    icon: '🟣',
  },
  openai_empire: {
    name: 'OpenAI Legion',
    color: '#8b8b00',
    icon: '🟢',
  },
  gemini_republic: {
    name: 'Gemini Collective',
    color: '#2d5a27',
    icon: '🔵',
  },
  grok_syndicate: {
    name: 'Grok Syndicate',
    color: '#c9a84c',
    icon: '🟡',
  },
  open_frontier: {
    name: 'Neutral',
    color: '#4682b4',
    icon: '⚪',
  },
};

// Determine faction sector based on block coordinates
function getFactionSector(blockX: number, blockY: number): string {
  const absX = Math.abs(blockX);
  const absY = Math.abs(blockY);

  // Corners (where both X and Y are significant) = Neutral zone
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
    return { tier: 'Prime', color: '#d4af37' }; // Gold
  }
  if (ring <= 3) {
    return { tier: 'Developed', color: '#c9a84c' }; // Amber
  }
  return { tier: 'Frontier', color: '#8b8b8b' }; // Gray
}

export function EmptyBlockPanel({ blockX, blockY, mousePosition }: EmptyBlockPanelProps): JSX.Element {
  // Determine faction sector
  const factionSectorId = useMemo(() => getFactionSector(blockX, blockY), [blockX, blockY]);
  const factionSector = FACTION_SECTORS[factionSectorId];

  // Calculate ring distance and land value
  const ring = useMemo(() => getRingDistance(blockX, blockY), [blockX, blockY]);
  const landValue = useMemo(() => getLandValue(ring), [ring]);

  const accent = factionSector.color;

  const panelX = Math.min(mousePosition.x + 24, window.innerWidth - 240);
  const panelY = Math.max(mousePosition.y - 20, 10);

  return (
    <div style={{
      ...styles.panel,
      left: panelX,
      top: panelY,
      borderColor: `${accent}44`,
    }}>

      {/* Header - Single line with status */}
      <div style={styles.header}>
        <div style={{ ...styles.statusDot, background: 'var(--accent-crimson, #ff4444)' }} />
        <div style={{ ...styles.title, color: accent }}>UNCLAIMED</div>
      </div>

      {/* Info row - Compact single line */}
      <div style={styles.infoRow}>
        <span style={{ ...styles.infoItem, color: accent }}>
          {factionSector.icon} {factionSector.name}
        </span>
        <span style={styles.separator}>•</span>
        <span style={styles.infoItem}>Ring {ring}</span>
        <span style={styles.separator}>•</span>
        <span style={{ ...styles.infoItem, color: landValue.color }}>{landValue.tier}</span>
      </div>

      {/* Coordinates - Single line */}
      <div style={styles.coordLine}>
        <span style={{ ...styles.coordLabel, color: `${accent}99` }}>LOC</span>
        <span style={styles.coordValue}>[{blockX}, {blockY}]</span>
      </div>

    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    background: 'rgba(26, 20, 8, 0.95)', // Dark semi-transparent
    backdropFilter: 'blur(8px)',
    border: '1px solid',
    borderRadius: '4px',
    padding: '8px 12px',
    minWidth: '200px',
    maxWidth: '240px',
    pointerEvents: 'none',
    zIndex: 100,
    fontFamily: 'var(--font-mono, monospace)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '6px',
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
    opacity: 0.8,
  },
  title: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '6px',
    fontSize: '10px',
    flexWrap: 'wrap',
  },
  infoItem: {
    color: 'var(--text-secondary, #aaa)',
    fontWeight: 500,
  },
  separator: {
    color: 'var(--text-dim, #666)',
    fontSize: '10px',
  },
  coordLine: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coordLabel: {
    fontSize: '9px',
    fontWeight: 600,
    letterSpacing: '1px',
    textTransform: 'uppercase',
  },
  coordValue: {
    fontSize: '11px',
    color: 'var(--text-primary, #eee)',
    fontFamily: 'monospace',
  },
};
