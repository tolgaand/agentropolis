/**
 * Minimap - GTA-style bird's-eye view of the 3D scene.
 * Dystopian cyberpunk: angular clip-path, neon-cyan accents,
 * crosshair, holographic border glow.
 */
import { useRef, useEffect, useCallback } from 'react';
import { useRendererRef } from '../../hooks/useRendererRef';
import { TILES_PER_CHUNK } from '../../lib/map/three/V2Config';

const MAP_SIZE = 200;
const RENDER_SIZE = 512;

export function Minimap(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRendererRef();

  useEffect(() => {
    let raf = 0;
    let lastCX = -Infinity;
    let lastCZ = -Infinity;
    let frameSkip = 0;

    function loop() {
      const r = rendererRef?.current;
      const canvas = canvasRef.current;

      if (r && canvas) {
        const gc = r.getGridCoords();
        const moved = gc.x !== lastCX || gc.y !== lastCZ;
        lastCX = gc.x;
        lastCZ = gc.y;

        if (moved || frameSkip >= 8) {
          r.renderMinimap(canvas);
          frameSkip = 0;
        } else {
          frameSkip++;
        }
      } else if (!r) {
        if (frameSkip >= 30) { frameSkip = 0; } else { frameSkip++; }
      }

      raf = requestAnimationFrame(loop);
    }

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [rendererRef]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = rendererRef?.current;
    if (!r) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    const gc = r.getGridCoords();
    const chunkSpan = 3.6;
    const dcx = Math.round((nx - 0.5) * chunkSpan);
    const dcz = Math.round((ny - 0.5) * chunkSpan);

    const targetCX = gc.x + dcx;
    const targetCZ = gc.y + dcz;
    const worldX = targetCX * TILES_PER_CHUNK + Math.floor(TILES_PER_CHUNK / 2);
    const worldZ = targetCZ * TILES_PER_CHUNK + Math.floor(TILES_PER_CHUNK / 2);
    r.focusOnTile(worldX, worldZ);
  }, [rendererRef]);

  return (
    <div style={{
      position: 'absolute',
      bottom: 12,
      left: 12,
      pointerEvents: 'auto',
      zIndex: 15,
    }}>
      {/* Label */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
      }}>
        <div style={{
          width: 3, height: 10,
          background: 'var(--neon-cyan)',
          boxShadow: '0 0 6px var(--neon-cyan)',
        }} />
        <span style={{
          fontSize: 9,
          fontWeight: 600,
          fontFamily: 'var(--font-display)',
          color: 'var(--neon-cyan)',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          textShadow: '0 0 6px rgba(0,255,255,0.4)',
        }}>
          Minimap
        </span>
      </div>

      {/* Canvas container */}
      <div style={{
        width: MAP_SIZE,
        height: MAP_SIZE,
        clipPath: 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)',
        position: 'relative',
        background: 'var(--bg-void)',
        boxShadow: '0 0 20px rgba(0,255,255,0.1), 0 4px 24px rgba(0,0,0,0.5)',
      }}>
        {/* Border */}
        <div style={{
          position: 'absolute',
          inset: 0,
          border: '1px solid rgba(0,255,255,0.2)',
          clipPath: 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)',
          pointerEvents: 'none',
          zIndex: 3,
        }} />

        <canvas
          ref={canvasRef}
          width={RENDER_SIZE}
          height={RENDER_SIZE}
          onClick={handleClick}
          style={{
            width: MAP_SIZE,
            height: MAP_SIZE,
            display: 'block',
            cursor: 'pointer',
          }}
        />

        {/* Center crosshair */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}>
          <div style={{
            width: 18, height: 1,
            background: 'var(--neon-cyan)',
            opacity: 0.7,
            position: 'absolute',
            top: 0, left: -9,
            boxShadow: '0 0 4px var(--neon-cyan)',
          }} />
          <div style={{
            width: 1, height: 18,
            background: 'var(--neon-cyan)',
            opacity: 0.7,
            position: 'absolute',
            top: -9, left: 0,
            boxShadow: '0 0 4px var(--neon-cyan)',
          }} />
        </div>

        {/* Top accent line */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 12,
          right: 0,
          height: 2,
          background: 'linear-gradient(90deg, var(--neon-cyan), rgba(0,255,255,0.15), transparent)',
          pointerEvents: 'none',
          zIndex: 2,
        }} />

        {/* Scan overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,255,255,0.02) 3px, rgba(0,255,255,0.02) 4px)',
          pointerEvents: 'none',
          zIndex: 1,
          mixBlendMode: 'screen',
        }} />
      </div>
    </div>
  );
}
