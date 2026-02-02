/**
 * MapTest - Standalone test page for CityRendererV2
 * Route: /map-test
 * No socket, no backend dependency — pure Three.js prototype.
 */

import { useRef, useEffect, useState } from 'react';
import { CityRendererV2 } from '../lib/map/three/CityRendererV2';

export default function MapTest(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null!);
  const rendererRef = useRef<CityRendererV2 | null>(null);
  const [status, setStatus] = useState<string>('Initializing...');
  const [zoom, setZoom] = useState(100);
  const [drawCalls, setDrawCalls] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new CityRendererV2();
    rendererRef.current = renderer;

    // Expose for debugging
    (window as unknown as Record<string, unknown>).__v2 = renderer;

    renderer.init(container).then(async () => {
      setStatus('Loading assets...');
      await renderer.buildTestParcel();
      setStatus('Ready');
    }).catch((err) => {
      setStatus(`Error: ${err.message}`);
      console.error(err);
    });

    const zoomInterval = setInterval(() => {
      if (rendererRef.current) {
        setZoom(rendererRef.current.getZoomPercent());
        setDrawCalls(rendererRef.current.getDrawCalls());
      }
    }, 200);

    return () => {
      clearInterval(zoomInterval);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Status badge */}
      <div style={{
        position: 'absolute',
        top: 16,
        left: 16,
        background: 'rgba(0,0,0,0.7)',
        color: status === 'Ready' ? '#4ade80' : '#fbbf24',
        padding: '8px 14px',
        borderRadius: 8,
        fontFamily: 'monospace',
        fontSize: 14,
      }}>
        CityRendererV2 — {status}
      </div>

      {/* Zoom + draw calls indicator */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        background: 'rgba(0,0,0,0.7)',
        color: '#60a5fa',
        padding: '6px 12px',
        borderRadius: 6,
        fontFamily: 'monospace',
        fontSize: 13,
      }}>
        {zoom}% | {drawCalls} draws
      </div>

      {/* Controls help */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        background: 'rgba(0,0,0,0.5)',
        color: '#94a3b8',
        padding: '6px 12px',
        borderRadius: 6,
        fontFamily: 'monospace',
        fontSize: 11,
      }}>
        Drag: Pan | Scroll: Zoom
      </div>
    </div>
  );
}
