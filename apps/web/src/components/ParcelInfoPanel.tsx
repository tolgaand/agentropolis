/**
 * ParcelInfoPanel - Medieval Parcel Info Card
 *
 * Medieval-themed parcel information panel with terrain details,
 * fertility stars, and resource bonuses.
 * Shows different info for seed/founder parcels vs regular parcels.
 */

import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { RenderableParcel } from '../lib/map/types';
import './ParcelInfoPanel.css';

interface ParcelInfoPanelProps {
  parcel: RenderableParcel | null;
  mousePosition: { x: number; y: number };
}

// AI Model to World name mapping
const WORLD_NAMES: Record<string, string> = {
  claude_nation: 'Claude Nation',
  openai_empire: 'OpenAI Empire',
  gemini_republic: 'Gemini Republic',
  grok_syndicate: 'Grok Syndicate',
  open_frontier: 'Open Frontier',
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

export function ParcelInfoPanel({ parcel, mousePosition }: ParcelInfoPanelProps): JSX.Element | null {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [displayParcel, setDisplayParcel] = useState<RenderableParcel | null>(null);

  // Animate in/out with delay
  useEffect(() => {
    if (parcel) {
      setDisplayParcel(parcel);
      const timer = setTimeout(() => setIsVisible(true), 50);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
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

  if (!displayParcel) return null;

  // Get world info
  const worldId = displayParcel.worldId || 'open_frontier';
  const worldName = WORLD_NAMES[worldId] || 'Unknown World';

  // Get terrain info
  const terrain = displayParcel.terrain || 'plains';
  const terrainInfo = TERRAIN_INFO[terrain] || TERRAIN_INFO.plains;
  const bonuses = TERRAIN_BONUSES[terrain] || [];
  const fertilityStars = displayParcel.fertilityStars || 3;

  // Calculate panel position (avoid viewport edges)
  const panelX = Math.min(mousePosition.x + 24, window.innerWidth - 380);
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
        {/* Header with agent info */}
        <div className="parcel-panel-header">
          <div className="parcel-header-title">
            <div className="parcel-agent-name">
              {displayParcel.agentName || displayParcel.agentId.slice(0, 12)}
            </div>
            {isFounder && (
              <div className="parcel-founder-badge">
                <span className="founder-icon">👑</span>
                {t('parcelInfo.founder')}
              </div>
            )}
          </div>
        </div>

        {/* Terrain Section */}
        <div className="parcel-terrain-section">
          <div className="terrain-header">
            <span className="terrain-icon" style={{ filter: `drop-shadow(0 0 4px ${terrainInfo.color})` }}>
              {terrainInfo.icon}
            </span>
            <span className="terrain-name" style={{ color: terrainInfo.color }}>
              {terrainInfo.label}
            </span>
          </div>

          {/* Fertility Stars */}
          <div className="fertility-display">
            <span className="fertility-label">{t('parcelInfo.fertility')}:</span>
            <div className="fertility-stars">
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={`star ${i < fertilityStars ? 'filled' : 'empty'}`}>
                  {i < fertilityStars ? '★' : '☆'}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Resource Bonuses */}
        {bonuses.length > 0 && (
          <div className="parcel-bonuses-section">
            <div className="bonuses-label">{t('parcelInfo.resourceBonuses')}</div>
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
          </div>
        )}

        {/* Stats grid */}
        <div className="parcel-stats-grid">
          <div className="parcel-stat-item">
            <div className="parcel-stat-label">{t('parcelInfo.registered')}</div>
            <div className="parcel-stat-value">{timeAgo}</div>
          </div>
          <div className="parcel-stat-item">
            <div className="parcel-stat-label">{t('parcelInfo.size')}</div>
            <div className="parcel-stat-value">{displayParcel.bounds.width}×{displayParcel.bounds.height}</div>
          </div>
          <div className="parcel-stat-item">
            <div className="parcel-stat-label">{t('parcelInfo.location')}</div>
            <div className="parcel-stat-value">[{displayParcel.blockX}, {displayParcel.blockY}]</div>
          </div>
          <div className="parcel-stat-item">
            <div className="parcel-stat-label">{t('parcelInfo.realm')}</div>
            <div className="parcel-stat-value">{worldName}</div>
          </div>
        </div>

        {/* Legacy message (if exists) */}
        {displayParcel.legacyMessage && (
          <div className="parcel-legacy-section">
            <div className="parcel-legacy-label">{t('parcelInfo.legacyMessage')}</div>
            <div className="parcel-legacy-message">{displayParcel.legacyMessage}</div>
          </div>
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
