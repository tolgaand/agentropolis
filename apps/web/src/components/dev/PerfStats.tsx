/**
 * PerfStats - Zoom level + draw call counter (dev overlay).
 * Signal-Negative design: graphite chip, mono data, brass label tick.
 */
import { useState, useEffect } from 'react';
import { useRendererRef } from '../../hooks/useRendererRef';

export function PerfStats(): JSX.Element {
  const rendererRef = useRendererRef();
  const [zoom, setZoom] = useState(100);
  const [drawCalls, setDrawCalls] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const r = rendererRef?.current;
      if (r) {
        setZoom(r.getZoomPercent());
        setDrawCalls(r.getDrawCalls());
      }
    }, 200);
    return () => clearInterval(interval);
  }, [rendererRef]);

  return (
    <div style={{
      position: 'absolute',
      bottom: 16,
      right: 16,
      background: 'var(--panel-bg)',
      backdropFilter: 'blur(var(--panel-blur))',
      WebkitBackdropFilter: 'blur(var(--panel-blur))',
      border: '1px solid var(--panel-border)',
      color: 'var(--hud-value)',
      padding: '4px 10px',
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      fontWeight: 500,
      pointerEvents: 'auto',
      boxShadow: 'var(--panel-shadow)',
      display: 'flex',
      alignItems: 'center',
      gap: 5,
    }}>
      {/* Top brass rule */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 1,
        background: 'linear-gradient(90deg, transparent, var(--hud-brass), transparent)',
      }} />
      <span style={{ color: 'var(--hud-label)', fontSize: 8, fontWeight: 700, letterSpacing: '0.10em' }}>ZOOM</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{zoom}%</span>
      <span style={{ color: 'var(--hud-cell-border)', margin: '0 1px' }}>|</span>
      <span style={{ color: 'var(--hud-label)', fontSize: 8, fontWeight: 700, letterSpacing: '0.10em' }}>DRAWS</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{drawCalls}</span>
    </div>
  );
}
