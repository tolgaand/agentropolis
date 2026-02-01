/**
 * MapHUD Component
 * Dystopian cyberpunk-styled navigation HUD bar for the world map
 * Provides navigation to multiverse and world info pages
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { WorldId } from '@agentropolis/shared';
import './MapHUD.css';

interface MapHUDProps {
  worldId: WorldId;
  worldColor: string;
}

export function MapHUD({ worldId, worldColor }: MapHUDProps) {
  const { t } = useTranslation();

  return (
    <nav
      className="map-hud"
      style={{ '--world-color': worldColor } as React.CSSProperties}
    >
      <div className="hud-accent-line" />

      <Link to="/multiverse" className="hud-nav-button">
        <span className="arrow arrow-left">{'<'}</span>
        <span>{t('worldMap.multiverse')}</span>
      </Link>

      <div className="hud-controls">
        <div className="control-item">
          <span className="control-key">LMB</span>
          <span>DRAG</span>
        </div>
        <span className="control-dot" />
        <div className="control-item">
          <span className="control-key">SCR</span>
          <span>ZOOM</span>
        </div>
      </div>

      <Link to={`/world/${worldId}`} className="hud-nav-button">
        <span>{t('worldMap.worldInfo')}</span>
        <span className="arrow">{'>'}</span>
      </Link>
    </nav>
  );
}
