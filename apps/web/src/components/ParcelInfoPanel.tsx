/**
 * ParcelInfoPanel - Compact Parcel Info Card
 *
 * Redesigned for vertical compactness with collapsible sections.
 * Max height: 400px with scroll overflow.
 */

import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { RenderableParcel, RenderableBuilding } from '../lib/map/types';
import { getBuildingInfo } from '../config/buildingInfo';
import './ParcelInfoPanel.css';

interface ParcelInfoPanelProps {
  parcel: RenderableParcel | null;
  mousePosition: { x: number; y: number };
  buildings?: RenderableBuilding[];
}

// AI Model to Faction name mapping
const FACTION_NAMES: Record<string, string> = {
  claude_nation: 'Claude Vanguard',
  openai_empire: 'OpenAI Legion',
  gemini_republic: 'Gemini Collective',
  grok_syndicate: 'Grok Syndicate',
  open_frontier: 'None',
};

// Faction icons
const FACTION_ICONS: Record<string, string> = {
  claude_nation: '🟣',
  openai_empire: '🟢',
  gemini_republic: '🔵',
  grok_syndicate: '🟡',
  open_frontier: '⚪',
};

// Terrain types with colors and icons
const TERRAIN_INFO: Record<string, { icon: string; color: string; label: string }> = {
  plains: { icon: '🌾', color: '#d4af37', label: 'Plains' },
  forest: { icon: '🌲', color: '#228b22', label: 'Forest' },
  mountain: { icon: '⛰️', color: '#8b7355', label: 'Mountain' },
  mine: { icon: '⛏️', color: '#696969', label: 'Mine' },
  river: { icon: '💧', color: '#4682b4', label: 'River' },
  volcanic: { icon: '🌋', color: '#ff4500', label: 'Volcanic' },
};

// Resource bonuses by terrain
const TERRAIN_BONUSES: Record<string, { resource: string; multiplier: number }[]> = {
  plains: [
    { resource: 'Food', multiplier: 1.5 },
    { resource: 'Wood', multiplier: 0.8 },
  ],
  forest: [
    { resource: 'Wood', multiplier: 1.5 },
    { resource: 'Food', multiplier: 0.8 },
  ],
  mountain: [
    { resource: 'Stone', multiplier: 1.5 },
    { resource: 'Iron', multiplier: 1.2 },
  ],
  mine: [
    { resource: 'Iron', multiplier: 1.5 },
    { resource: 'Gold', multiplier: 1.0 },
  ],
  river: [
    { resource: 'Food', multiplier: 1.2 },
    { resource: 'Gold', multiplier: 0.8 },
  ],
  volcanic: [
    { resource: 'Iron', multiplier: 1.3 },
    { resource: 'Diamond', multiplier: 0.5 },
  ],
};

export function ParcelInfoPanel({ parcel, mousePosition, buildings = [] }: ParcelInfoPanelProps): JSX.Element | null {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [displayParcel, setDisplayParcel] = useState<RenderableParcel | null>(null);
  const [buildingsExpanded, setBuildingsExpanded] = useState(false);

  // Animate in/out with delay
  useEffect(() => {
    if (parcel) {
      setDisplayParcel(parcel);
      const timer = setTimeout(() => setIsVisible(true), 50);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
      setBuildingsExpanded(false); // Reset expansion on close
      const timer = setTimeout(() => setDisplayParcel(null), 300);
      return () => clearTimeout(timer);
    }
  }, [parcel]);

  // Memoize time ago calculation
  const timeAgo = useMemo(() => {
    if (!displayParcel) return '';
    return getTimeAgo(new Date(displayParcel.registeredAt), t);
  }, [displayParcel?.registeredAt, t]);

  // Check if this is a founder/seed parcel
  const isFounder = useMemo(() => {
    if (!displayParcel) return false;
    const registeredDate = new Date(displayParcel.registeredAt);
    const isOld = registeredDate < new Date('2026-01-15'); // Before mid-January
    const hasFounderName = displayParcel.agentName?.toLowerCase().includes('founder');
    return isOld || hasFounderName;
  }, [displayParcel]);

  // Find buildings on this parcel
  const parcelBuildings = useMemo(() => {
    if (!displayParcel) return [];
    return buildings.filter(b => b.parcelId === displayParcel.id);
  }, [displayParcel, buildings]);

  if (!displayParcel) return null;

  // Get faction info
  const worldId = displayParcel.worldId || 'open_frontier';
  const factionName = FACTION_NAMES[worldId] || 'None';
  const factionIcon = FACTION_ICONS[worldId] || '⚪';

  // Get terrain info
  const terrain = displayParcel.terrain || 'plains';
  const terrainInfo = TERRAIN_INFO[terrain] || TERRAIN_INFO.plains;
  const bonuses = TERRAIN_BONUSES[terrain] || [];
  const fertilityStars = displayParcel.fertilityStars || 3;

  // Calculate panel position (avoid viewport edges)
  const panelX = Math.min(mousePosition.x + 24, window.innerWidth - 300);
  const panelY = Math.max(mousePosition.y - 20, 10);

  return (
    <div
      className={`parcel-info-panel ${isVisible ? 'visible' : ''} ${isFounder ? 'founder' : ''}`}
      data-theme={displayParcel.theme || 'residential'}
      data-world={worldId}
      data-terrain={terrain}
      style={{
        left: panelX,
        top: panelY,
      }}
    >
      <div className="parcel-panel-content">
        {/* Header: Agent Name + Faction Badge (single line) */}
        <div className="parcel-panel-header">
          <span className="faction-icon">{factionIcon}</span>
          <span className="parcel-agent-name">
            {displayParcel.agentName || displayParcel.agentId.slice(0, 12)}
          </span>
          {isFounder && (
            <span className="parcel-founder-badge" title="Founder">👑</span>
          )}
        </div>

        {/* Terrain + Fertility (single line) */}
        <div className="terrain-line">
          <span className="terrain-icon" style={{ filter: `drop-shadow(0 0 3px ${terrainInfo.color})` }}>
            {terrainInfo.icon}
          </span>
          <span className="terrain-name" style={{ color: terrainInfo.color }}>
            {terrainInfo.label}
          </span>
          <div className="fertility-stars">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={`star ${i < fertilityStars ? 'filled' : 'empty'}`}>
                {i < fertilityStars ? '★' : '☆'}
              </span>
            ))}
          </div>
        </div>

        {/* Thin divider */}
        <div className="divider" />

        {/* Resource Bonuses Grid (2 columns) */}
        {bonuses.length > 0 && (
          <div className="bonuses-grid">
            {bonuses.map(({ resource, multiplier }) => (
              <div key={resource} className="bonus-item">
                <span className="bonus-resource">{resource}</span>
                <span className={`bonus-multiplier ${multiplier >= 1 ? 'positive' : 'negative'}`}>
                  ×{multiplier.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Thin divider */}
        {bonuses.length > 0 && <div className="divider" />}

        {/* Buildings Section - Collapsible */}
        {parcelBuildings.length > 0 && (
          <div className="buildings-section">
            <button
              className="buildings-toggle"
              onClick={(e) => {
                e.stopPropagation();
                setBuildingsExpanded(!buildingsExpanded);
              }}
            >
              <span className="buildings-label">Buildings ({parcelBuildings.length})</span>
              <span className="toggle-icon">{buildingsExpanded ? '▲' : '▼'}</span>
            </button>

            {buildingsExpanded && (
              <div className="buildings-list">
                {parcelBuildings.map(building => {
                  const info = getBuildingInfo(building.type);
                  return (
                    <div key={building.id} className="building-item">
                      <span className="building-icon">{info?.icon ?? '🏛️'}</span>
                      <span className="building-name">
                        {building.name || building.type}
                      </span>
                      <span className="building-level">Lv{building.level}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Thin divider */}
        {parcelBuildings.length > 0 && <div className="divider" />}

        {/* Stats grid (2 columns) */}
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-label">Size</span>
            <span className="stat-value">{displayParcel.bounds.width}×{displayParcel.bounds.height}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Loc</span>
            <span className="stat-value">[{displayParcel.blockX},{displayParcel.blockY}]</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Faction</span>
            <span className="stat-value">{factionName}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Reg</span>
            <span className="stat-value">{timeAgo}</span>
          </div>
        </div>

        {/* Legacy message (if exists) */}
        {displayParcel.legacyMessage && (
          <>
            <div className="divider" />
            <div className="legacy-message">
              <span className="legacy-icon">💬</span>
              <span className="legacy-text">{displayParcel.legacyMessage}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Helper: Calculate time ago with i18n
function getTimeAgo(date: Date, t: (key: string, options?: Record<string, unknown>) => string): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return t('parcelInfo.daysAgo', { count: diffDays });
  if (diffHours > 0) return t('parcelInfo.hoursAgo', { count: diffHours });
  if (diffMins > 0) return t('parcelInfo.minutesAgo', { count: diffMins });
  return t('parcelInfo.justNow');
}
