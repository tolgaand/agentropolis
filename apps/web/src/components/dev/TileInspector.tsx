/**
 * TileInspector - Hover tile info card.
 * Signal-Negative design: vellum panel, asymmetric notch,
 * brass rule, data cells with film-strip banding, signal pips.
 */
import type { HoverInfo } from '../../lib/map/three/CityRendererV2';

interface TileInspectorProps {
  hover: HoverInfo | null;
}

export function TileInspector({ hover }: TileInspectorProps): JSX.Element | null {
  if (!hover) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 54,
      left: 16,
      width: 250,
      pointerEvents: 'none',
      fontFamily: 'var(--font-body)',
    }}>
      <div style={{
        background: 'var(--panel-bg)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid var(--panel-border)',
        boxShadow: 'var(--panel-shadow)',
        overflow: 'hidden',
        position: 'relative',
        clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
      }}>
        {/* Brass rule — top */}
        <div style={{
          height: 2,
          background: 'linear-gradient(90deg, var(--hud-brass), rgba(176,142,74,0.2), transparent)',
        }} />

        {/* Blueprint grid overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(231,225,215,0.015) 3px, rgba(231,225,215,0.015) 6px)`,
          mixBlendMode: 'soft-light',
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        {/* Header row: icon + title + signal pip */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '9px 12px 7px',
          position: 'relative',
          zIndex: 1,
        }}>
          {/* Icon — notched square */}
          <div style={{
            width: 28, height: 28,
            background: 'var(--hud-cell-bg)',
            border: '1px solid var(--hud-cell-border)',
            clipPath: 'polygon(0 0, 100% 0, 100% 80%, 80% 100%, 0 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            color: 'var(--hud-label)',
          }}>
            {hover.buildable ? '\u2302' : '\u2261'}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--hud-value)',
              letterSpacing: '0.04em',
              fontFamily: 'var(--font-display)',
            }}>
              {hover.building || hover.zone.toUpperCase()}
            </div>
            <div style={{
              fontSize: 9,
              fontWeight: 600,
              color: 'var(--hud-brass)',
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-mono)',
            }}>
              {hover.district} / {hover.zone}
            </div>
          </div>

          {/* Signal pip */}
          <div style={{
            width: 7, height: 7,
            background: hover.buildable ? 'var(--hud-teal)' : 'var(--hud-red)',
            clipPath: 'polygon(0 0, 100% 0, 100% 70%, 70% 100%, 0 100%)',
            flexShrink: 0,
          }} />
        </div>

        {/* Data grid — 2x2 cells */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 1,
          padding: '0 12px 8px',
          position: 'relative',
          zIndex: 1,
        }}>
          <Cell label="WORLD" value={`${hover.worldX}, ${hover.worldZ}`} />
          <Cell label="CHUNK" value={`${hover.chunkX}, ${hover.chunkZ}`} />
          <Cell label="LOCAL" value={`${hover.localX}, ${hover.localZ}`} />
          <Cell label="PRICE" value={`${hover.landPrice} CRD`} accent />
        </div>

        {/* Demand + Buildable */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 1,
          padding: '0 12px 8px',
          position: 'relative',
          zIndex: 1,
        }}>
          <Cell label="DEMAND" value={String(hover.demandIndex)} />
          <Cell label="BUILDABLE" value={hover.buildable ? 'Yes' : 'No (road)'}
            valueColor={hover.buildable ? 'var(--hud-teal)' : 'var(--hud-red)'} />
        </div>

        {/* Owner stamp */}
        {hover.owner && (
          <div style={{
            padding: '0 12px 8px',
            position: 'relative',
            zIndex: 1,
          }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              background: 'var(--hud-brass-dim)',
              border: '1px solid rgba(176,142,74,0.18)',
              padding: '3px 9px',
              fontSize: 10,
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
              color: 'var(--hud-brass)',
              letterSpacing: '0.06em',
            }}>
              {hover.owner}
            </div>
          </div>
        )}

        {/* Bottom status bar */}
        <div style={{
          padding: '5px 12px',
          borderTop: '1px solid var(--hud-cell-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          position: 'relative',
          zIndex: 1,
        }}>
          <div style={{
            width: 5, height: 5,
            background: hover.buildable ? 'var(--hud-teal)' : 'var(--hud-label)',
            clipPath: 'polygon(0 0, 100% 0, 100% 70%, 70% 100%, 0 100%)',
          }} />
          <span style={{
            fontSize: 9,
            fontFamily: 'var(--font-mono)',
            color: 'var(--hud-label)',
            letterSpacing: '0.06em',
          }}>
            {hover.buildable ? 'BUILDABLE' : 'ROAD'} / {hover.zone.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value, accent, valueColor }: {
  label: string;
  value: string;
  accent?: boolean;
  valueColor?: string;
}): JSX.Element {
  return (
    <div style={{
      background: 'var(--hud-cell-bg)',
      border: '1px solid var(--hud-cell-border)',
      padding: '5px 7px',
    }}>
      <div style={{
        fontSize: 8,
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        color: 'var(--hud-label)',
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        marginBottom: 1,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        color: valueColor ?? (accent ? 'var(--hud-brass)' : 'var(--hud-value)'),
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
    </div>
  );
}
