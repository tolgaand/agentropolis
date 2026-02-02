/**
 * Minimap - 2D canvas minimap with building outlines and terrain colors
 *
 * Shows parcels with terrain-based ground colors, simplified building shapes,
 * faction borders, viewport indicator, and monument marker.
 * Click to fly camera to location.
 */

import { useEffect, useRef, useState } from 'react';
import { useSocketContext } from '../../socket';
import { FACTION_COLORS, TERRAIN_GROUND_COLORS } from '../../lib/map/three/ThreeConfig';

interface MinimapProps {
  onFlyTo: (worldX: number, worldZ: number) => void;
  viewportBounds: {
    centerX: number;
    centerZ: number;
    width: number;
    height: number;
  };
}

const MINIMAP_SIZE = 160;

// Theme → building layout shapes (relative positions within parcel, 0-1 range)
const THEME_BUILDINGS: Record<string, { x: number; y: number; w: number; h: number; color: string }[]> = {
  farming: [
    { x: 0.15, y: 0.2, w: 0.35, h: 0.25, color: '#8b7355' }, // barn
    { x: 0.6, y: 0.15, w: 0.12, h: 0.12, color: '#8b7355' }, // silo
    { x: 0.7, y: 0.15, w: 0.12, h: 0.12, color: '#8b7355' }, // silo
    { x: 0.6, y: 0.55, w: 0.2, h: 0.15, color: '#5c4033' }, // shed
    { x: 0.1, y: 0.55, w: 0.25, h: 0.15, color: '#4a7a3a' }, // field
    { x: 0.38, y: 0.55, w: 0.2, h: 0.15, color: '#b8962a' }, // field
  ],
  military: [
    { x: 0.2, y: 0.25, w: 0.6, h: 0.35, color: '#6b6b6b' }, // keep
    { x: 0.05, y: 0.05, w: 0.1, h: 0.1, color: '#6b6b6b' }, // tower
    { x: 0.85, y: 0.05, w: 0.1, h: 0.1, color: '#6b6b6b' }, // tower
    { x: 0.05, y: 0.85, w: 0.1, h: 0.1, color: '#6b6b6b' }, // tower
    { x: 0.85, y: 0.85, w: 0.1, h: 0.1, color: '#6b6b6b' }, // tower
    { x: 0.15, y: 0.65, w: 0.7, h: 0.15, color: '#5a4a3a' }, // yard
  ],
  trade: [
    { x: 0.15, y: 0.2, w: 0.7, h: 0.3, color: '#8b7355' }, // market hall
    { x: 0.1, y: 0.6, w: 0.18, h: 0.1, color: '#b8862a' }, // stall
    { x: 0.32, y: 0.6, w: 0.18, h: 0.1, color: '#cc4444' }, // stall
    { x: 0.54, y: 0.6, w: 0.18, h: 0.1, color: '#b8862a' }, // stall
    { x: 0.76, y: 0.6, w: 0.18, h: 0.1, color: '#cc4444' }, // stall
    { x: 0.05, y: 0.3, w: 0.08, h: 0.2, color: '#8b6540' }, // store
    { x: 0.87, y: 0.3, w: 0.08, h: 0.2, color: '#8b6540' }, // store
  ],
  mining: [
    { x: 0.1, y: 0.05, w: 0.8, h: 0.15, color: '#4a4a4a' }, // mountain
    { x: 0.25, y: 0.35, w: 0.5, h: 0.2, color: '#6b6b6b' }, // processing
    { x: 0.05, y: 0.7, w: 0.2, h: 0.15, color: '#4a3020' }, // shed
    { x: 0.75, y: 0.7, w: 0.2, h: 0.15, color: '#4a3020' }, // shed
  ],
  noble: [
    { x: 0.15, y: 0.15, w: 0.55, h: 0.35, color: '#9b8b75' }, // manor
    { x: 0.05, y: 0.25, w: 0.1, h: 0.15, color: '#b8a890' }, // chapel
    { x: 0.2, y: 0.6, w: 0.6, h: 0.25, color: '#3a6a2a' }, // garden
    { x: 0.8, y: 0.15, w: 0.08, h: 0.15, color: '#9b8b75' }, // tower
  ],
  residential: [
    { x: 0.15, y: 0.1, w: 0.7, h: 0.2, color: '#8b7355' }, // main house
    { x: 0.05, y: 0.35, w: 0.2, h: 0.3, color: '#b8a880' }, // side house
    { x: 0.75, y: 0.35, w: 0.2, h: 0.3, color: '#8b7355' }, // side house
    { x: 0.2, y: 0.7, w: 0.25, h: 0.15, color: '#b8a880' }, // house
    { x: 0.55, y: 0.7, w: 0.2, h: 0.15, color: '#8b7355' }, // house
    { x: 0.3, y: 0.4, w: 0.4, h: 0.25, color: '#7a6a5a' }, // courtyard
  ],
  mixed: [
    { x: 0.2, y: 0.15, w: 0.6, h: 0.3, color: '#8b7355' }, // town hall
    { x: 0.05, y: 0.35, w: 0.15, h: 0.25, color: '#b8a880' }, // house
    { x: 0.8, y: 0.35, w: 0.15, h: 0.25, color: '#8b7355' }, // house
    { x: 0.15, y: 0.65, w: 0.15, h: 0.08, color: '#daa520' }, // stall
    { x: 0.35, y: 0.65, w: 0.15, h: 0.08, color: '#daa520' }, // stall
    { x: 0.55, y: 0.65, w: 0.15, h: 0.08, color: '#daa520' }, // stall
    { x: 0.55, y: 0.15, w: 0.2, h: 0.15, color: '#5c4033' }, // workshop
  ],
};

function hexToRgb(hex: number): { r: number; g: number; b: number } {
  return {
    r: (hex >> 16) & 0xff,
    g: (hex >> 8) & 0xff,
    b: hex & 0xff,
  };
}

export function Minimap({ onFlyTo, viewportBounds }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const { mapData } = useSocketContext();

  // Calculate minimap bounds from parcel data + viewport position
  const mapBounds = useRef({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 });

  useEffect(() => {
    if (!mapData || mapData.parcels.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const parcel of mapData.parcels) {
      const { x, y, width, height } = parcel.bounds;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + width);
      minZ = Math.min(minZ, y);
      maxZ = Math.max(maxZ, y + height);
    }

    // Include viewport position so the viewport indicator is always visible
    if (Math.abs(viewportBounds.centerX) > 0.1 || Math.abs(viewportBounds.centerZ) > 0.1) {
      const vpHalfW = viewportBounds.width / 2;
      const vpHalfH = viewportBounds.height / 2;
      minX = Math.min(minX, viewportBounds.centerX - vpHalfW);
      maxX = Math.max(maxX, viewportBounds.centerX + vpHalfW);
      minZ = Math.min(minZ, viewportBounds.centerZ - vpHalfH);
      maxZ = Math.max(maxZ, viewportBounds.centerZ + vpHalfH);
    }

    const padding = 15;
    mapBounds.current = {
      minX: minX - padding,
      maxX: maxX + padding,
      minZ: minZ - padding,
      maxZ: maxZ + padding,
    };
  }, [mapData, viewportBounds]);

  // Render minimap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mapData || mapData.parcels.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { minX, maxX, minZ, maxZ } = mapBounds.current;
    const worldWidth = maxX - minX;
    const worldHeight = maxZ - minZ;

    // Clear canvas
    ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // Dark background (gap between parcels)
    ctx.fillStyle = '#1a1408';
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // Draw parcels with terrain ground color + building outlines
    for (const parcel of mapData.parcels) {
      const { x, y, width, height } = parcel.bounds;

      const canvasX = ((x - minX) / worldWidth) * MINIMAP_SIZE;
      const canvasY = ((y - minZ) / worldHeight) * MINIMAP_SIZE;
      const canvasW = (width / worldWidth) * MINIMAP_SIZE;
      const canvasH = (height / worldHeight) * MINIMAP_SIZE;

      // Terrain ground color
      const terrain = (parcel as { terrain?: string }).terrain ?? 'plains';
      const terrainColors = TERRAIN_GROUND_COLORS[terrain] ?? TERRAIN_GROUND_COLORS.plains;
      const topColor = hexToRgb(terrainColors.top);

      // Faction tint blend (subtle)
      const factionHex = FACTION_COLORS[parcel.worldId as keyof typeof FACTION_COLORS] || 0x888888;
      const factionRgb = hexToRgb(factionHex);
      const blend = 0.25;
      const gr = Math.round(topColor.r * (1 - blend) + factionRgb.r * blend);
      const gg = Math.round(topColor.g * (1 - blend) + factionRgb.g * blend);
      const gb = Math.round(topColor.b * (1 - blend) + factionRgb.b * blend);

      // Fill parcel ground
      ctx.fillStyle = `rgb(${gr}, ${gg}, ${gb})`;
      ctx.fillRect(canvasX, canvasY, canvasW, canvasH);

      // Draw building shapes based on theme
      const theme = (parcel as { theme?: string }).theme ?? 'mixed';
      const buildings = THEME_BUILDINGS[theme] ?? THEME_BUILDINGS.mixed;

      for (const bld of buildings) {
        ctx.fillStyle = bld.color;
        ctx.fillRect(
          canvasX + bld.x * canvasW,
          canvasY + bld.y * canvasH,
          bld.w * canvasW,
          bld.h * canvasH,
        );
      }

      // Faction border glow
      const fr = factionRgb.r, fg = factionRgb.g, fb = factionRgb.b;
      ctx.strokeStyle = `rgba(${fr}, ${fg}, ${fb}, 0.7)`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(canvasX + 0.5, canvasY + 0.5, canvasW - 1, canvasH - 1);
    }

    // Draw viewport indicator (only if camera has moved from origin)
    if (Math.abs(viewportBounds.centerX) > 0.1 || Math.abs(viewportBounds.centerZ) > 0.1) {
      const vpCenterX = ((viewportBounds.centerX - minX) / worldWidth) * MINIMAP_SIZE;
      const vpCenterZ = ((viewportBounds.centerZ - minZ) / worldHeight) * MINIMAP_SIZE;
      const vpWidth = (viewportBounds.width / worldWidth) * MINIMAP_SIZE;
      const vpHeight = (viewportBounds.height / worldHeight) * MINIMAP_SIZE;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        vpCenterX - vpWidth / 2,
        vpCenterZ - vpHeight / 2,
        vpWidth,
        vpHeight
      );

      // White dot at viewport center
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(vpCenterX, vpCenterZ, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [mapData, viewportBounds]);

  // Handle click to fly camera
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    const { minX, maxX, minZ, maxZ } = mapBounds.current;
    const worldWidth = maxX - minX;
    const worldHeight = maxZ - minZ;

    const worldX = (canvasX / MINIMAP_SIZE) * worldWidth + minX;
    const worldZ = (canvasY / MINIMAP_SIZE) * worldHeight + minZ;

    onFlyTo(worldX, worldZ);
  };

  if (collapsed) {
    return (
      <div style={styles.collapsedContainer}>
        <button
          style={styles.toggleButton}
          onClick={() => setCollapsed(false)}
          title="Expand minimap"
        >
          M
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        ...styles.container,
        opacity: isHovering ? 1 : 0.85,
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <button
        style={styles.toggleButton}
        onClick={() => setCollapsed(true)}
        title="Collapse minimap"
      >
        M
      </button>
      <canvas
        ref={canvasRef}
        width={MINIMAP_SIZE}
        height={MINIMAP_SIZE}
        style={styles.canvas}
        onClick={handleClick}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: '16px',
    right: '16px',
    width: `${MINIMAP_SIZE}px`,
    height: `${MINIMAP_SIZE}px`,
    background: '#1a1408',
    border: '1px solid rgba(201, 168, 76, 0.4)',
    borderRadius: '2px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
    pointerEvents: 'auto',
    transition: 'opacity 0.2s ease',
  },
  collapsedContainer: {
    position: 'absolute',
    bottom: '16px',
    right: '16px',
    pointerEvents: 'auto',
  },
  canvas: {
    display: 'block',
    cursor: 'pointer',
  },
  toggleButton: {
    position: 'absolute',
    top: '-28px',
    right: '0',
    width: '24px',
    height: '24px',
    background: 'rgba(26, 20, 8, 0.9)',
    border: '1px solid rgba(201, 168, 76, 0.4)',
    color: '#c9a84c',
    fontSize: '12px',
    fontFamily: 'var(--font-mono, monospace)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    transition: 'background 0.2s ease',
  },
};
