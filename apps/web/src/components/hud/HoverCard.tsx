/**
 * HoverCardLayer — MicroTooltip (hover) + Inspector (click)
 *
 * MicroTooltip: tiny single-line label following mouse, pointer-events: none
 * Inspector: fixed right-side panel, slides in on click, pinnable
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { HoverInfo } from '../../lib/map/three/CityRendererV2';
import './HoverCard.css';

// ─── Constants ───
const SHOW_DELAY = 250;
const HIDE_DELAY = 150;
const TOOLTIP_OFFSET_X = 16;
const TOOLTIP_OFFSET_Y = -8;

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

// ─── Props ───
interface HoverCardLayerProps {
  hover?: HoverInfo | null;
  selected?: HoverInfo | null;
}

// ─── Main export ───
export function HoverCardLayer({ hover = null, selected = null }: HoverCardLayerProps): JSX.Element {
  // ── MicroTooltip state ──
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipData, setTooltipData] = useState<HoverInfo | null>(null);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const [tooltipPos, setTooltipPos] = useState({ left: 0, top: 0 });
  const showRef = useRef<ReturnType<typeof setTimeout>>();
  const hideRef = useRef<ReturnType<typeof setTimeout>>();
  const lastTileRef = useRef('');

  // ── Inspector state ──
  const [inspected, setInspected] = useState<HoverInfo | null>(null);
  const [pinned, setPinned] = useState(false);

  // Track mouse for tooltip positioning
  useEffect(() => {
    let raf = 0;
    function onMouseMove(e: MouseEvent) {
      mousePosRef.current.x = e.clientX;
      mousePosRef.current.y = e.clientY;
    }
    function tick() {
      const mx = mousePosRef.current.x;
      const my = mousePosRef.current.y;
      const left = mx + TOOLTIP_OFFSET_X;
      const top = my + TOOLTIP_OFFSET_Y;
      setTooltipPos(prev => (prev.left === left && prev.top === top) ? prev : { left, top });
      raf = requestAnimationFrame(tick);
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Show/hide tooltip on hover changes
  useEffect(() => {
    if (hover) {
      const tileKey = `${hover.worldX},${hover.worldZ}`;
      clearTimeout(hideRef.current);

      if (tileKey === lastTileRef.current) return;
      lastTileRef.current = tileKey;

      // Don't show tooltip if inspecting the same tile
      if (inspected && inspected.worldX === hover.worldX && inspected.worldZ === hover.worldZ) {
        setTooltipVisible(false);
        return;
      }

      clearTimeout(showRef.current);
      showRef.current = setTimeout(() => {
        setTooltipData(hover);
        setTooltipVisible(true);
      }, SHOW_DELAY);
    } else {
      clearTimeout(showRef.current);
      lastTileRef.current = '';
      hideRef.current = setTimeout(() => {
        setTooltipVisible(false);
      }, HIDE_DELAY);
    }
  }, [hover, inspected]);

  // Handle click → open inspector
  useEffect(() => {
    if (selected) {
      // If pinned and clicking the same tile, ignore
      if (pinned && inspected &&
          inspected.worldX === selected.worldX && inspected.worldZ === selected.worldZ) {
        return;
      }
      setInspected(selected);
      setTooltipVisible(false);
      // If not pinned, auto-close behavior is default
    }
  }, [selected, pinned, inspected]);

  // Escape to close inspector
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && inspected) {
        setInspected(null);
        setPinned(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inspected]);

  const closeInspector = useCallback(() => {
    setInspected(null);
    setPinned(false);
  }, []);

  const togglePin = useCallback(() => {
    setPinned(p => !p);
  }, []);

  // Tooltip content — only show for buildings (not empty tiles or roads)
  const hasBuilding = !!tooltipData?.building;
  const ttIcon = tooltipData
    ? (ZONE_ICONS[tooltipData.zone?.toLowerCase()] ?? '\u{1F4CD}')
    : '';
  const ttLabel = tooltipData?.building ? humanName(tooltipData.building) : '';
  const ttZone = tooltipData?.zone ?? '';
  const showTooltip = tooltipVisible && tooltipData && hasBuilding;

  return (
    <>
      {/* MicroTooltip — tiny single-line hover label (buildings only) */}
      <div
        className={`micro-tooltip${showTooltip ? ' visible' : ''}`}
        style={{ left: tooltipPos.left, top: tooltipPos.top }}
      >
        <span className="mt-icon">{ttIcon}</span>
        {ttLabel}
        <span className="mt-sep">&middot;</span>
        {ttZone}
      </div>

      {/* Inspector — fixed right panel */}
      <div className={`inspector-panel${inspected ? ' open' : ''}${pinned ? ' pinned' : ''}`}>
        {inspected && (
          <InspectorContent
            info={inspected}
            pinned={pinned}
            onTogglePin={togglePin}
            onClose={closeInspector}
          />
        )}
      </div>
    </>
  );
}

// ─── Building Economy Data Cache ───
interface BuildingEconomy {
  income: number;
  operatingCost: number;
  employeeCount: number;
  maxEmployees: number;
  status: string;
}

const buildingCache = new Map<string, BuildingEconomy>();

// ─── Inspector Content ───
function InspectorContent({ info, pinned, onTogglePin, onClose }: {
  info: HoverInfo;
  pinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
}): JSX.Element {
  const hasBuilding = !!info.building;
  const [economy, setEconomy] = useState<BuildingEconomy | null>(null);
  const [econLoading, setEconLoading] = useState(false);

  // Fetch building economic data when buildingId changes
  useEffect(() => {
    if (!info.buildingId) {
      setEconomy(null);
      return;
    }

    const cached = buildingCache.get(info.buildingId);
    if (cached) {
      setEconomy(cached);
      return;
    }

    let cancelled = false;
    setEconLoading(true);
    fetch(`/api/buildings/${info.buildingId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data) return;
        const econ: BuildingEconomy = {
          income: data.income ?? 0,
          operatingCost: data.operatingCost ?? 0,
          employeeCount: data.employeeCount ?? 0,
          maxEmployees: data.maxEmployees ?? 0,
          status: data.status ?? 'unknown',
        };
        buildingCache.set(info.buildingId!, econ);
        setEconomy(econ);
      })
      .catch(() => { /* ignore fetch errors */ })
      .finally(() => { if (!cancelled) setEconLoading(false); });

    return () => { cancelled = true; };
  }, [info.buildingId]);
  const isRoad = info.isRoad;
  const icon = isRoad ? '\u{1F6E3}' : ZONE_ICONS[info.zone?.toLowerCase()] ?? '\u{1F4CD}';
  const title = hasBuilding
    ? humanName(info.building!)
    : isRoad ? 'Road' : info.owner ? 'Parcel' : 'Empty Tile';
  const tileType = hasBuilding ? 'BUILDING' : isRoad ? 'ROAD' : info.owner ? 'PARCEL' : 'TILE';
  const subtitle = `${(info.zone ?? 'unknown').toUpperCase()} // ${tileType}`;

  const statusClass = isRoad ? 'road' : info.buildable ? 'buildable' : 'occupied';
  const statusLabel = isRoad ? 'ROAD' : info.buildable ? 'BUILDABLE' : 'OCCUPIED';

  return (
    <>
      <div className="ins-header">
        <div className="ins-icon">{icon}</div>
        <div className="ins-title-group">
          <div className="ins-name">{title}</div>
          <div className="ins-sub">{subtitle}</div>
        </div>
        <div className="ins-actions">
          <button
            className={`ins-btn${pinned ? ' active' : ''}`}
            onClick={onTogglePin}
            title={pinned ? 'Unpin' : 'Pin'}
          >
            {pinned ? '\u{1F4CC}' : '\u{1F4CC}'}
          </button>
          <button className="ins-btn" onClick={onClose} title="Close (Esc)">
            \u00D7
          </button>
        </div>
      </div>

      <div className="ins-stats">
        <div className="ins-stat">
          <div className="ins-stat-label">District</div>
          <div className="ins-stat-value">{info.district}</div>
        </div>
        <div className="ins-stat">
          <div className="ins-stat-label">Zone</div>
          <div className="ins-stat-value">{info.zone}</div>
        </div>
        <div className="ins-stat">
          <div className="ins-stat-label">Block</div>
          <div className="ins-stat-value">{Math.abs(info.worldX)}{info.worldX >= 0 ? 'E' : 'W'}, {Math.abs(info.worldZ)}{info.worldZ >= 0 ? 'S' : 'N'}</div>
        </div>
        <div className="ins-stat">
          <div className="ins-stat-label">Land Price</div>
          <div className="ins-stat-value">{info.landPrice} CRD</div>
        </div>
      </div>

      {hasBuilding && (
        <div className="ins-demand">
          <div className="ins-demand-label">Demand Index</div>
          <div className="ins-demand-bar">
            <div
              className="ins-demand-fill"
              style={{ width: `${Math.min(100, info.demandIndex * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Economy section — only for real (DB-backed) buildings */}
      {info.buildingId && (
        <div className="ins-stats" style={{ borderTop: '1px solid rgba(127, 220, 255, 0.06)' }}>
          {econLoading ? (
            <div className="ins-stat" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>
              <div className="ins-stat-label">Economy</div>
              <div className="ins-stat-value" style={{ fontSize: 10, opacity: 0.4 }}>Loading...</div>
            </div>
          ) : economy ? (
            <>
              <div className="ins-stat">
                <div className="ins-stat-label">Income</div>
                <div className="ins-stat-value" style={{ color: 'rgba(91, 232, 160, 0.9)' }}>{economy.income} CRD</div>
              </div>
              <div className="ins-stat">
                <div className="ins-stat-label">Expenses</div>
                <div className="ins-stat-value" style={{ color: 'rgba(255, 107, 138, 0.9)' }}>{economy.operatingCost} CRD</div>
              </div>
              <div className="ins-stat">
                <div className="ins-stat-label">Staff</div>
                <div className="ins-stat-value">{economy.employeeCount}/{economy.maxEmployees}</div>
              </div>
              <div className="ins-stat">
                <div className="ins-stat-label">Status</div>
                <div className="ins-stat-value" style={{
                  color: economy.status === 'active' ? 'rgba(91, 232, 160, 0.9)' : 'rgba(255, 107, 138, 0.9)',
                  textTransform: 'uppercase',
                  fontSize: 11,
                }}>{economy.status}</div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Procedural label for non-DB buildings */}
      {hasBuilding && !info.buildingId && (
        <div style={{
          padding: '6px 16px',
          borderTop: '1px solid rgba(127, 220, 255, 0.06)',
          fontSize: 9,
          fontFamily: 'var(--font-mono)',
          color: 'rgba(255, 255, 255, 0.3)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          Procedural
        </div>
      )}

      <div className="ins-footer">
        <div className={`ins-status-dot ${statusClass}`} />
        <span className="ins-status-text">
          {statusLabel} {info.owner ? `// ${info.owner}` : '// UNOWNED'}
        </span>
      </div>
    </>
  );
}
