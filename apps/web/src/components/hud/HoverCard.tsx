/**
 * HoverCard - Cyberpunk holographic hover display
 *
 * - Cut-corner clip-path, scan lines, chromatic aberration
 * - Holo-open animation, text flicker, glitch effects
 * - GLITCH TRANSITION on tile change: content scrambles out then resolves in
 * - Zone-themed hue shifting
 * - Follows mouse position smoothly
 * - Shift+Click pin, Escape unpin
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { HoverInfo } from '../../lib/map/three/CityRendererV2';
import './HoverCard.css';

// ─── Constants ───
const HOVER_DELAY = 60;
const HIDE_DELAY = 200;
const GLITCH_DURATION = 180; // ms for tile-change glitch
const CARD_W = 360;
const CARD_H = 320;
const PAD = 16;

// ─── Zone icons ───
const ZONE_ICONS: Record<string, string> = {
  residential: '\u{1F3E0}',
  commercial: '\u{1F3EC}',
  park: '\u{1F333}',
  civic: '\u{1F3DB}',
};

// ─── Building names ───
const NAMES: Record<string, string> = {
  bar_001: 'Bar', barbershop_001: 'Barbershop', burger_shop_001: 'Burger Shop',
  business_center_001: 'Business Center', business_center_002: 'Business Center',
  business_center_003: 'Business Center', business_center_004: 'Business Center',
  business_center_005: 'Business Center', business_center_006: 'Business Center',
  casino_001: 'Casino', cinema_001: 'Cinema', fastfood_001: 'Fast Food',
  fire_station_001: 'Fire Station', gym_001: 'Gym', hospital_001: 'Hospital',
  ice_cream_shop_001: 'Ice Cream Shop', library_001: 'Library', mall_001: 'Mall',
  music_store_001: 'Music Store', pizzeria_001: 'Pizzeria',
  police_department_001: 'Police Department', supermarket_001: 'Supermarket',
  supermarket_002: 'Supermarket', supermarket_003: 'Supermarket', tool_store_001: 'Tool Store',
};

function humanName(key: string): string {
  return NAMES[key] ?? key.replace(/_\d+$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Main export ───
export function HoverCardLayer({ hover }: { hover: HoverInfo | null }): JSX.Element {
  const [visible, setVisible] = useState(false);
  const [pinned, setPinned] = useState<HoverInfo | null>(null);
  const [display, setDisplay] = useState<HoverInfo | null>(null);
  const [glitching, setGlitching] = useState(false);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const [posState, setPosState] = useState({ left: 0, top: 0 });
  const showRef = useRef<ReturnType<typeof setTimeout>>();
  const hideRef = useRef<ReturnType<typeof setTimeout>>();
  const glitchRef = useRef<ReturnType<typeof setTimeout>>();
  const lastTileRef = useRef('');

  // Track mouse position via ref (no re-render), update position via RAF
  useEffect(() => {
    let raf = 0;
    function onMouseMove(e: MouseEvent) {
      mousePosRef.current.x = e.clientX;
      mousePosRef.current.y = e.clientY;
    }
    function tick() {
      const mx = mousePosRef.current.x;
      const my = mousePosRef.current.y;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = mx + 24;
      let top = my - 20;
      if (left + CARD_W + PAD > vw) left = mx - CARD_W - 24;
      if (top + CARD_H + PAD > vh) top = my - CARD_H;
      if (top < PAD) top = PAD;
      if (left < PAD) left = PAD;
      setPosState(prev => (prev.left === left && prev.top === top) ? prev : { left, top });
      raf = requestAnimationFrame(tick);
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Show/hide + glitch transition on tile change
  useEffect(() => {
    if (hover) {
      const tileKey = `${hover.worldX},${hover.worldZ}`;
      clearTimeout(hideRef.current);

      if (tileKey === lastTileRef.current) return;

      lastTileRef.current = tileKey;

      if (pinned && pinned.worldX === hover.worldX && pinned.worldZ === hover.worldZ) {
        setVisible(false);
        return;
      }

      clearTimeout(showRef.current);
      clearTimeout(glitchRef.current);

      if (visible && display) {
        // Card already visible, tile changed → glitch content transition (card stays open)
        setGlitching(true);
        glitchRef.current = setTimeout(() => {
          setDisplay(hover);
          setGlitching(false);
        }, GLITCH_DURATION);
      } else {
        // First show
        showRef.current = setTimeout(() => {
          setDisplay(hover);
          setVisible(true);
        }, HOVER_DELAY);
      }
    } else {
      clearTimeout(showRef.current);
      clearTimeout(glitchRef.current);
      lastTileRef.current = '';
      hideRef.current = setTimeout(() => {
        setVisible(false);
        setGlitching(false);
      }, HIDE_DELAY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover, pinned]);

  // Shift+Click pin, Escape unpin
  const onClickHandler = useCallback((e: MouseEvent) => {
    if (e.shiftKey && visible && display) {
      setPinned({ ...display });
      setVisible(false);
    }
  }, [visible, display]);

  const onKeyHandler = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setPinned(null);
  }, []);

  useEffect(() => {
    window.addEventListener('click', onClickHandler);
    window.addEventListener('keydown', onKeyHandler);
    return () => {
      window.removeEventListener('click', onClickHandler);
      window.removeEventListener('keydown', onKeyHandler);
    };
  }, [onClickHandler, onKeyHandler]);

  const pinnedPos = pinned
    ? (() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left = pinned.screenX + 24;
        let top = pinned.screenY - 20;
        if (left + CARD_W + PAD > vw) left = pinned.screenX - CARD_W - 24;
        if (top + CARD_H + PAD > vh) top = pinned.screenY - CARD_H;
        if (top < PAD) top = PAD;
        if (left < PAD) left = PAD;
        return { left, top };
      })()
    : { left: 0, top: 0 };

  const zone = display?.zone?.toLowerCase() ?? '';
  const cardClass = `hover-card${visible && display ? ' visible' : ''}${glitching ? ' glitching' : ''}`;

  return (
    <>
      {/* Floating hover card */}
      <div
        className={cardClass}
        data-zone={zone}
        style={{ left: posState.left, top: posState.top }}
      >
        {display && (
          <div className="hc-content">
            <CardContent hover={display} />
          </div>
        )}
      </div>

      {/* Pinned card */}
      {pinned && (
        <div
          className="hover-card visible pinned"
          data-zone={pinned.zone?.toLowerCase() ?? ''}
          style={{ left: pinnedPos.left, top: pinnedPos.top }}
        >
          <div className="hc-close" onClick={() => setPinned(null)}>×</div>
          <div className="hc-content">
            <CardContent hover={pinned} />
          </div>
        </div>
      )}
    </>
  );
}

// ─── Card content ───
function CardContent({ hover }: { hover: HoverInfo }): JSX.Element {
  const hasBuilding = !!hover.building;
  const isRoad = hover.isRoad;
  const icon = isRoad ? '\u{1F6E3}' : ZONE_ICONS[hover.zone?.toLowerCase()] ?? '\u{1F4CD}';
  const title = hasBuilding
    ? humanName(hover.building!)
    : isRoad ? 'Road' : hover.owner ? 'Parcel' : 'Empty Tile';
  const tileType = hasBuilding ? 'BUILDING' : isRoad ? 'ROAD' : hover.owner ? 'PARCEL' : 'TILE';
  const subtitle = `${(hover.zone ?? 'unknown').toUpperCase()} // ${tileType}`;

  return (
    <>
      <div className="hc-header">
        <div className="hc-icon">
          <span className="hc-icon-text">{icon}</span>
        </div>
        <div className="hc-title-group">
          <div className="hc-name">{title}</div>
          <div className="hc-sub">{subtitle}</div>
        </div>
        <div className="hc-status">
          <div className="hc-status-dot" />
          <div className="hc-status-ring" />
        </div>
      </div>

      <div className="hc-stats-grid">
        <div className="hc-stat-item">
          <div className="hc-stat-label">District</div>
          <div className="hc-stat-value">{hover.district}</div>
        </div>
        <div className="hc-stat-item">
          <div className="hc-stat-label">Zone</div>
          <div className="hc-stat-value">{hover.zone}</div>
        </div>
        <div className="hc-stat-item">
          <div className="hc-stat-label">Block</div>
          <div className="hc-stat-value">[{hover.worldX}, {hover.worldZ}]</div>
        </div>
        <div className="hc-stat-item">
          <div className="hc-stat-label">Land Price</div>
          <div className="hc-stat-value">{hover.landPrice} CRD</div>
        </div>
      </div>

      <div className="hc-zone-badge">
        <span className="hc-zone-icon">{icon}</span>
        {hover.district}
      </div>

      {hasBuilding && (
        <div className="hc-demand-section">
          <div className="hc-demand-label">Demand Index</div>
          <div className="hc-demand-bar-wrap">
            <div
              className="hc-demand-fill"
              style={{ width: `${Math.min(100, hover.demandIndex * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="hc-activity-bar">
        <div className="hc-activity-dot" />
        <span className="hc-activity-text">
          {hover.isRoad ? 'ROAD' : hover.buildable ? 'BUILDABLE' : 'OCCUPIED'} // {hover.owner ?? 'UNOWNED'}
        </span>
      </div>
    </>
  );
}
