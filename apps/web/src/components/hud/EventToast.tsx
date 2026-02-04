/**
 * EventToast — Notification toasts for major city events.
 * Shows only severity='major' or 'minor' events as brief toasts.
 * Auto-dismisses after 5 seconds. Max 3 visible at once.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useFeedEvents } from '../../socket/socket.context';
import type { FeedEvent } from '@agentropolis/shared/contracts/v2';

interface Toast {
  id: string;
  headline: string;
  severity: string;
  fadingOut: boolean;
}

const MAX_TOASTS = 3;
const TOAST_DURATION = 5000;
const FADE_DURATION = 400;

const SEVERITY_BORDER: Record<string, string> = {
  major: 'rgba(255, 107, 138, 0.5)',
  minor: 'rgba(245, 208, 98, 0.4)',
};

const SEVERITY_DOT: Record<string, string> = {
  major: '#ff6b8a',
  minor: '#f5d062',
};

export function EventToast(): JSX.Element {
  const feedEvents = useFeedEvents();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenRef = useRef(new Set<string>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: string) => {
    // Start fade out
    setToasts(prev => prev.map(t => t.id === id ? { ...t, fadingOut: true } : t));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, FADE_DURATION);
  }, []);

  // Watch for new major/minor events
  useEffect(() => {
    if (feedEvents.length === 0) return;

    const newToasts: Toast[] = [];
    for (const event of feedEvents) {
      if (seenRef.current.has(event.id)) continue;
      seenRef.current.add(event.id);

      // Only show major and minor events
      if (event.severity !== 'major' && event.severity !== 'minor') continue;

      // Filter zero-value noise
      if (isZeroValueEvent(event)) continue;

      newToasts.push({
        id: event.id,
        headline: event.headline,
        severity: event.severity,
        fadingOut: false,
      });
    }

    if (newToasts.length === 0) return;

    setToasts(prev => {
      const combined = [...newToasts, ...prev].slice(0, MAX_TOASTS);
      return combined;
    });

    // Set auto-dismiss timers
    for (const toast of newToasts) {
      const timer = setTimeout(() => {
        dismissToast(toast.id);
        timersRef.current.delete(toast.id);
      }, TOAST_DURATION);
      timersRef.current.set(toast.id, timer);
    }
  }, [feedEvents, dismissToast]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  if (toasts.length === 0) return <></>;

  return (
    <div style={{
      position: 'absolute',
      top: 58,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      pointerEvents: 'none',
      zIndex: 20,
      maxWidth: 360,
      width: '100%',
    }}>
      {toasts.map(toast => (
        <div
          key={toast.id}
          style={{
            background: 'rgba(8, 12, 20, 0.88)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: `1px solid ${SEVERITY_BORDER[toast.severity] ?? 'rgba(127, 220, 255, 0.15)'}`,
            borderRadius: 4,
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            opacity: toast.fadingOut ? 0 : 1,
            transform: toast.fadingOut ? 'translateY(-8px)' : 'translateY(0)',
            transition: `opacity ${FADE_DURATION}ms ease, transform ${FADE_DURATION}ms ease`,
            pointerEvents: 'auto',
            cursor: 'pointer',
          }}
          onClick={() => dismissToast(toast.id)}
        >
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: SEVERITY_DOT[toast.severity] ?? '#7fdcff',
            boxShadow: `0 0 6px ${SEVERITY_DOT[toast.severity] ?? '#7fdcff'}`,
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: 11,
            fontFamily: 'var(--font-body)',
            color: 'var(--text-primary)',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {toast.headline}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Filter out zero-value noise events */
function isZeroValueEvent(event: FeedEvent): boolean {
  const h = event.headline.toLowerCase();
  // "... 0 agents paid 0 CRD" or "Treasury up 0 CRD"
  if (h.includes('0 agents paid 0') || h.includes('treasury up 0 crd') || h.includes('treasury down 0 crd')) {
    return true;
  }
  return false;
}
