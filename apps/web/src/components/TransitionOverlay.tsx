/**
 * TransitionOverlay Component
 *
 * Dystopian page transition effects for Agentropolis.
 * Supports multiple effects: glitch, scan, portal, matrix.
 * Default combines glitch + scan for 1.2-1.4 second transition.
 */

import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import './TransitionOverlay.css';

export type TransitionEffect = 'glitch' | 'scan' | 'portal' | 'matrix';

export interface TransitionOverlayProps {
  /** Whether the transition is currently active */
  isActive: boolean;
  /** Callback fired when the transition animation completes */
  onComplete?: () => void;
  /** The effect type to use. Defaults to combined glitch+scan */
  effect?: TransitionEffect;
  /** Custom text to display during glitch effect */
  glitchText?: string;
  /** Duration in milliseconds. Defaults to 1400ms */
  duration?: number;
}

// Matrix characters for the matrix effect
const MATRIX_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+-=[]{}|;:,.<>?';

function generateMatrixColumn(length: number): string[] {
  const chars: string[] = [];
  for (let i = 0; i < length; i++) {
    chars.push(MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]);
  }
  return chars;
}

export function TransitionOverlay({
  isActive,
  onComplete,
  effect,
  glitchText = 'ENTERING',
  duration = 1400,
}: TransitionOverlayProps) {
  // Generate matrix columns only once
  const matrixColumns = useMemo(() => {
    return Array.from({ length: 20 }, () => generateMatrixColumn(15));
  }, []);

  // Handle animation completion using animationend event
  useEffect(() => {
    if (!isActive || !onComplete) return;

    let cleanup: (() => void) | undefined;

    // Wait for next frame to ensure DOM is ready
    const rafId = requestAnimationFrame(() => {
      const overlay = document.querySelector('.transition-overlay.active');
      if (!overlay) return;

      const scanLine = overlay.querySelector('.scan-line');

      const handleAnimationEnd = (e: Event) => {
        const animEvent = e as AnimationEvent;
        // Fire when scan-line animation ends (it's the longest)
        if (animEvent.target === scanLine) {
          onComplete();
        }
      };

      scanLine?.addEventListener('animationend', handleAnimationEnd);

      // Fallback timeout (slightly longer than expected)
      const fallback = setTimeout(() => {
        onComplete();
      }, duration * 1.3);

      cleanup = () => {
        scanLine?.removeEventListener('animationend', handleAnimationEnd);
        clearTimeout(fallback);
      };
    });

    return () => {
      cancelAnimationFrame(rafId);
      cleanup?.();
    };
  }, [isActive, onComplete, duration]);

  // Determine which effect layers to render
  const renderGlitch = !effect || effect === 'glitch';
  const renderScan = !effect || effect === 'scan';
  const renderPortal = effect === 'portal';
  const renderMatrix = effect === 'matrix';

  // Combined effect uses both glitch and scan
  const isCombined = !effect;

  return (
    <div className={`transition-overlay ${isActive ? 'active' : ''}`}>
      {/* Dark backdrop */}
      <div className="transition-backdrop" />

      {/* Combined Glitch + Scan (default) */}
      {isCombined && (
        <div className="transition-combined">
          {/* Glitch bars */}
          <div className="glitch-bar" />
          <div className="glitch-bar" />
          <div className="glitch-bar" />
          <div className="glitch-bar" />

          {/* Glitch text effect */}
          <div className="transition-glitch">
            <div className="glitch-layer">
              <span className="glitch-text">{glitchText}</span>
            </div>
          </div>

          {/* Scan line */}
          <div className="transition-scan">
            <div className="scan-line" />
            <div className="scan-noise" />
          </div>
        </div>
      )}

      {/* Standalone Glitch effect */}
      {renderGlitch && !isCombined && (
        <div className="transition-glitch">
          <div className="glitch-layer">
            <span className="glitch-text">{glitchText}</span>
          </div>
        </div>
      )}

      {/* Standalone Scan effect */}
      {renderScan && !isCombined && (
        <div className="transition-scan">
          <div className="scan-line" />
          <div className="scan-noise" />
        </div>
      )}

      {/* Portal effect */}
      {renderPortal && (
        <div className="transition-portal">
          <div className="portal-ring" />
          <div className="portal-ring" />
          <div className="portal-ring" />
          <div className="portal-ring" />
          <div className="portal-center" />
        </div>
      )}

      {/* Matrix effect */}
      {renderMatrix && (
        <div className="transition-matrix">
          {matrixColumns.map((column, i) => (
            <div key={i} className="matrix-column">
              {column.map((char, j) => (
                <span key={j}>{char}</span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Hook for managing page transitions with navigation
 *
 * @example
 * const { transitioning, triggerTransition } = usePageTransition();
 *
 * const handleEnterCity = () => {
 *   triggerTransition(() => navigate(`/world/${worldId}/map`));
 * };
 */
export function usePageTransition(duration: number = 1400) {
  const [transitioning, setTransitioning] = useState(false);
  const callbackRef = useRef<(() => void) | null>(null);

  const triggerTransition = useCallback((callback: () => void) => {
    callbackRef.current = callback;
    setTransitioning(true);
  }, []);

  const handleComplete = useCallback(() => {
    if (callbackRef.current) {
      callbackRef.current();
      callbackRef.current = null;
    }
    setTransitioning(false);
  }, []);

  return {
    transitioning,
    triggerTransition,
    handleComplete,
    duration,
  };
}

