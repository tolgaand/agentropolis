import { useState, useEffect, useRef } from 'react';
import { useSocketContext, type ConnectionStatus } from '../socket';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

THREE.Cache.enabled = true;

const MODEL_MANIFEST_PATH = '/assets/models/manifest.json';
const ARTWORK_PATH = '/assets/loading-artwork.webp';

const PROPHECY_TEXT: Record<string, string> = {
  idle: 'Awakening\u2026',
  connecting: 'Calling the Council\u2026',
  connected: 'Raising the City\u2026',
  synced: 'The Gates Open.',
  disconnected: 'Signal Lost\u2026',
  retrying: 'Reaching Out\u2026',
  failed: 'The Council is Silent.',
};

// ── Burn transition CSS (injected once) ──────────────────────────────
const BURN_STYLE_ID = 'ls-burn-css';
function injectBurnCSS() {
  if (document.getElementById(BURN_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = BURN_STYLE_ID;
  s.textContent = `
    @keyframes ls-burn {
      0%   { -webkit-mask-image: radial-gradient(circle at 50% 50%, transparent 0%,   black 0%,   black 100%); }
      20%  { -webkit-mask-image: radial-gradient(circle at 50% 50%, transparent 8%,   rgba(0,0,0,.2) 14%, black 22%, black 100%); }
      50%  { -webkit-mask-image: radial-gradient(circle at 50% 50%, transparent 28%,  rgba(0,0,0,.15) 36%, black 48%, black 100%); }
      80%  { -webkit-mask-image: radial-gradient(circle at 50% 50%, transparent 55%,  rgba(0,0,0,.1) 65%, black 80%, black 100%); }
      100% { -webkit-mask-image: radial-gradient(circle at 50% 50%, transparent 100%, black 100%); }
    }
    @keyframes ls-glow {
      0%   { opacity:0; box-shadow: inset 0 0 0 rgba(201,120,20,0); }
      30%  { opacity:1; box-shadow: inset 0 0 100px rgba(201,120,20,.35), inset 0 0 250px rgba(139,50,0,.2); }
      70%  { opacity:1; box-shadow: inset 0 0 160px rgba(201,120,20,.5),  inset 0 0 350px rgba(139,50,0,.3); }
      100% { opacity:0; box-shadow: inset 0 0 0 rgba(201,120,20,0); }
    }
    @keyframes ls-content-fade {
      0%   { opacity:1; transform: translateY(0); }
      100% { opacity:0; transform: translateY(12px); }
    }
    .ls-burning    { animation: ls-burn 1.6s ease-in-out forwards; }
    .ls-glow       { animation: ls-glow 1.8s ease-out forwards; }
    .ls-fade-out   { animation: ls-content-fade .6s ease-out forwards; }
  `;
  document.head.appendChild(s);
}

// ── Component ────────────────────────────────────────────────────────
export function LoadingScreen({ onReady }: { onReady: () => void }) {
  const { connectionStatus, retryIn, reconnect } = useSocketContext();

  // Stable ref for onReady to avoid effect re-runs
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const [modelsProgress, setModelsProgress] = useState(0);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [artworkLoaded, setArtworkLoaded] = useState(false);
  const [phase, setPhase] = useState<'loading' | 'burning' | 'done'>('loading');
  const transitionStartedRef = useRef(false);

  const connProgress = (s: ConnectionStatus) => {
    const m: Record<ConnectionStatus, number> = {
      idle: 0, connecting: 20, connected: 60, synced: 100,
      disconnected: 30, retrying: 30, failed: 0,
    };
    return m[s] ?? 0;
  };

  const isReady = modelsLoaded && connectionStatus === 'synced';
  const isFailed = connectionStatus === 'failed';
  const progress = Math.min(100, connProgress(connectionStatus) * 0.4 + modelsProgress * 0.6);
  const prophecy = PROPHECY_TEXT[connectionStatus] || 'Loading\u2026';

  // Inject CSS once and clean up on unmount
  useEffect(() => {
    injectBurnCSS();
    return () => {
      const styleEl = document.getElementById(BURN_STYLE_ID);
      if (styleEl) {
        styleEl.remove();
      }
    };
  }, []);

  // Preload artwork via <img> onLoad (no separate Image() needed)
  // artworkLoaded is set by the img onLoad below

  // Preload 3D models
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(MODEL_MANIFEST_PATH);
        if (!res.ok || cancelled) { setModelsProgress(100); setModelsLoaded(true); return; }
        const manifest = await res.json();
        if (!manifest.source || cancelled) { setModelsProgress(100); setModelsLoaded(true); return; }

        const dir = MODEL_MANIFEST_PATH.substring(0, MODEL_MANIFEST_PATH.lastIndexOf('/'));
        const loader = new GLTFLoader();
        const draco = new DRACOLoader();
        draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
        draco.setDecoderConfig({ type: 'js' });
        loader.setDRACOLoader(draco);

        await new Promise<void>(resolve => {
          loader.load(
            `${dir}/${manifest.source}`,
            () => { if (!cancelled) { setModelsProgress(100); setModelsLoaded(true); } resolve(); },
            (e) => { if (!cancelled && e.lengthComputable) setModelsProgress((e.loaded / e.total) * 100); },
            () => { if (!cancelled) { setModelsProgress(100); setModelsLoaded(true); } resolve(); },
          );
        });
      } catch { if (!cancelled) { setModelsProgress(100); setModelsLoaded(true); } }
    })();
    return () => { cancelled = true; };
  }, []);

  // Transition: show "The Gates Open." → burn → done
  useEffect(() => {
    if (!isReady || transitionStartedRef.current) return;
    transitionStartedRef.current = true;

    // 700ms to read "The Gates Open.", then start burn
    const t1 = setTimeout(() => setPhase('burning'), 700);
    // 700 + 1600 burn = 2300ms total, then signal parent
    const t2 = setTimeout(() => {
      setPhase('done');
      onReadyRef.current();
    }, 2300);

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isReady]); // no onReady in deps — use ref

  if (phase === 'done') return null;

  const isBurning = phase === 'burning';

  return (
    <div
      className={isBurning ? 'ls-burning' : undefined}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#110e08',
        pointerEvents: isBurning ? 'none' : 'auto',
      }}
    >
      {/* ── Artwork layer ── */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        <img
          src={ARTWORK_PATH}
          alt=""
          onLoad={() => setArtworkLoaded(true)}
          onError={() => setArtworkLoaded(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center 30%', // keep top part (title) visible
            opacity: artworkLoaded ? Math.min(1, progress / 50) : 0,
            transition: 'opacity 1s ease-out',
            filter: isBurning ? 'brightness(1.1) saturate(1.2)' : 'brightness(0.95)',
          }}
        />
      </div>

      {/* ── Vignette ── */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at 50% 45%, transparent 25%, rgba(17,14,8,0.75) 100%)',
        pointerEvents: 'none',
      }} />

      {/* ── Bottom gradient ── */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        height: '35%',
        background: 'linear-gradient(to top, rgba(17,14,8,0.97) 0%, rgba(17,14,8,0.5) 55%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* ── Burn glow overlay ── */}
      {isBurning && (
        <div className="ls-glow" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      )}

      {/* ── UI content ── */}
      <div
        className={isBurning ? 'ls-fade-out' : undefined}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingBottom: '5vh',
          gap: 0,
        }}
      >
        <p style={{
          fontSize: 'clamp(0.85rem, 1.1vw, 1.1rem)',
          color: '#c9a84c',
          letterSpacing: '0.3em',
          fontFamily: 'var(--font-mono, monospace)',
          textTransform: 'uppercase',
          textShadow: '0 0 20px rgba(201,168,76,0.35), 0 2px 6px rgba(0,0,0,0.9)',
          margin: '0 0 20px 0',
        }}>
          {prophecy}
        </p>

        {/* Progress bar */}
        <div style={{
          width: 'clamp(200px, 25vw, 320px)',
          height: '2px',
          background: 'rgba(201,168,76,0.1)',
          borderRadius: '1px',
          overflow: 'hidden',
          marginBottom: '10px',
        }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            background: isFailed ? '#8b2020' : 'linear-gradient(90deg, #8b6914, #c9a84c)',
            borderRadius: '1px',
            transition: 'width 0.5s ease-out',
            boxShadow: isFailed ? '0 0 6px rgba(139,32,32,.5)' : '0 0 6px rgba(201,168,76,.35)',
          }} />
        </div>

        <p style={{
          fontSize: '0.6rem',
          color: 'rgba(201,168,76,0.3)',
          fontFamily: 'var(--font-mono, monospace)',
          letterSpacing: '0.12em',
          margin: 0,
        }}>
          {Math.round(progress)}%
        </p>

        {isFailed && (
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <p style={{
              fontSize: '0.75rem', color: '#8b2020',
              fontFamily: 'var(--font-mono, monospace)', margin: '0 0 10px 0',
            }}>
              Connection failed
              {retryIn !== null && <span style={{ color: '#c9a84c' }}> [{retryIn}s]</span>}
            </p>
            <button
              onClick={reconnect}
              style={{
                padding: '7px 22px',
                background: 'rgba(139,32,32,0.2)',
                border: '1px solid rgba(139,32,32,0.5)',
                color: '#c9a84c',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.7rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,32,32,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(139,32,32,0.2)'; }}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
