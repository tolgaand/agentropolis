/**
 * DebugCommands - Foldable AT command reference panel (dev overlay).
 * Signal-Negative design: graphite vellum, brass section rules.
 */
import { useState } from 'react';

export function DebugCommands(): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      position: 'absolute',
      top: 54,
      right: 16,
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      pointerEvents: 'auto',
      zIndex: 20,
    }}>
      {/* Toggle button */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'var(--panel-bg)',
          backdropFilter: 'blur(var(--panel-blur))',
          WebkitBackdropFilter: 'blur(var(--panel-blur))',
          border: '1px solid var(--panel-border)',
          color: open ? 'var(--hud-teal)' : 'var(--hud-label)',
          padding: '5px 10px',
          cursor: 'pointer',
          userSelect: 'none',
          fontWeight: 600,
          fontSize: 9,
          textAlign: 'right',
          boxShadow: 'var(--panel-shadow)',
          letterSpacing: '0.08em',
          position: 'relative',
        }}
      >
        {/* Brass rule */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 1,
          background: open ? 'var(--hud-teal)' : 'linear-gradient(90deg, transparent, var(--hud-brass))',
          opacity: open ? 0.4 : 1,
        }} />
        {open ? 'Hide Commands' : 'AT Commands'}
      </div>

      {open && (
        <div style={{
          background: 'var(--panel-bg)',
          backdropFilter: 'blur(var(--panel-blur))',
          WebkitBackdropFilter: 'blur(var(--panel-blur))',
          border: '1px solid var(--panel-border)',
          borderTop: 'none',
          color: 'var(--hud-value)',
          padding: '8px 10px',
          lineHeight: 1.7,
          minWidth: 220,
          maxHeight: 'calc(100vh - 140px)',
          overflowY: 'auto',
          boxShadow: 'var(--panel-shadow)',
        }}>
          <Section title="Tests" color="var(--hud-teal)" items={[
            ['smoke()', 'run all'],
            ['regression()', 'determinism'],
            ['testOverlap()', 'collision'],
            ['edgeTest()', 'edge coords'],
            ['massPlace(n)', 'perf'],
          ]} />
          <Section title="Building" color="var(--hud-brass)" items={[
            ['place(key,x,z)', 'add'],
            ['clear()', 'clear all'],
            ['list()', 'list overrides'],
            ['stats(x,z)', 'chunk stats'],
          ]} />
          <Section title="State" color="var(--accent-brass)" items={[
            ['export()', 'JSON out'],
            ['import(json)', 'JSON in'],
            ['download()', 'save file'],
          ]} />
          <Section title="Data Layer" color="var(--hud-red)" items={[
            ['setMode(m)', 'offline/stub/real'],
            ['subscribeChunks([...])', 'AOI sub'],
            ['activeChunks()', 'list subs'],
            ['rawPayload(cx,cz)', 'stub data'],
            ['socketConnected()', 'status'],
            ['reconnect()', 'force reconnect'],
            ['placeReal(key,x,z)', 'socket place'],
            ['removeReal(id)', 'socket remove'],
          ]} />
          <Section title="Navigation" color="var(--hud-label)" items={[
            ['info(x,z)', 'tile info'],
            ['snapshot(x,z)', 'text grid'],
            ['focus(x,z)', 'center view'],
          ]} />
        </div>
      )}
    </div>
  );
}

function Section({ title, color, items }: {
  title: string;
  color: string;
  items: [string, string][];
}): JSX.Element {
  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        marginBottom: 2,
        borderTop: '1px solid var(--hud-cell-border)',
        paddingTop: 4,
        color: 'var(--hud-label)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}>
        <div style={{ width: 2, height: 6, background: color }} />
        {title}
      </div>
      {items.map(([cmd, desc]) => (
        <div key={cmd}>
          <span style={{ color, fontWeight: 500 }}>{cmd}</span>
          <span style={{ color: 'var(--hud-dim)', marginLeft: 8, fontSize: 10 }}>{desc}</span>
        </div>
      ))}
    </div>
  );
}
