/**
 * EventFeed HUD - Left-edge notification stack with auto-fading toasts
 */

import { useEffect, useState } from 'react';
import type { Notification, NotificationType } from '../../hooks/useNotificationQueue';

const TYPE_COLORS: Record<NotificationType, string> = {
  hack: 'var(--accent-crimson, #8b0000)',
  breach: 'var(--accent-crimson, #8b0000)',
  trade: 'var(--accent-forest, #2d5a27)',
  bounty: 'var(--accent-gold, #c9a84c)',
  agent: 'var(--accent-gold, #c9a84c)',
};

const TYPE_BORDER_COLORS: Record<NotificationType, string> = {
  hack: 'rgba(139,0,0,0.4)',
  breach: 'rgba(139,0,0,0.6)',
  trade: 'rgba(45,90,39,0.4)',
  bounty: 'rgba(201,168,76,0.4)',
  agent: 'rgba(201,168,76,0.4)',
};

interface EventFeedProps {
  notifications: Notification[];
  onEventClick?: (notification: Notification) => void;
}

export function EventFeed({ notifications, onEventClick }: EventFeedProps) {
  return (
    <div style={styles.container}>
      {notifications.map(notif => (
        <EventToast
          key={notif.id}
          notification={notif}
          onClick={() => onEventClick?.(notif)}
        />
      ))}
      <style>{eventFeedStyles}</style>
    </div>
  );
}

function EventToast({ notification, onClick }: { notification: Notification; onClick: () => void }) {
  const [opacity, setOpacity] = useState(0);
  const color = TYPE_COLORS[notification.type];
  const borderColor = TYPE_BORDER_COLORS[notification.type];

  // Fade in on mount
  useEffect(() => {
    requestAnimationFrame(() => setOpacity(1));
  }, []);

  // Fade out as toast ages
  useEffect(() => {
    const EXPIRY_MS = 15_000;
    const FADE_START = 12_000;

    const interval = setInterval(() => {
      const currentAge = Date.now() - notification.timestamp;
      if (currentAge > FADE_START) {
        const fadeProgress = (currentAge - FADE_START) / (EXPIRY_MS - FADE_START);
        setOpacity(Math.max(0, 1 - fadeProgress));
      }
    }, 100);

    return () => clearInterval(interval);
  }, [notification.timestamp]);

  return (
    <div
      onClick={onClick}
      style={{
        ...styles.toast,
        borderLeftColor: borderColor,
        opacity,
        cursor: notification.targetAgentId ? 'pointer' : 'default',
      }}
    >
      <div style={{ ...styles.toastType, color }}>
        {notification.type.toUpperCase()}
      </div>
      <div style={styles.toastMessage}>
        {notification.message}
      </div>
      {notification.detail && (
        <span style={{ ...styles.toastDetail, color }}> {notification.detail}</span>
      )}
    </div>
  );
}

const eventFeedStyles = `
  @keyframes eventfeed-slidein {
    from { transform: translateX(-20px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
`;

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: '60px',
    left: '8px',
    width: '280px',
    zIndex: 90,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    pointerEvents: 'auto',
  },
  toast: {
    padding: '6px 10px',
    background: 'rgba(10,10,20,0.85)',
    borderLeft: '3px solid',
    borderRadius: '0 2px 2px 0',
    backdropFilter: 'blur(8px)',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '0.6875rem',
    transition: 'opacity 0.3s ease',
    animation: 'eventfeed-slidein 0.3s ease-out',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '4px',
  },
  toastType: {
    fontSize: '0.5625rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    flexShrink: 0,
  },
  toastMessage: {
    color: 'var(--text-secondary, #ccc)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '230px',
  },
  toastDetail: {
    fontSize: '0.625rem',
    opacity: 0.8,
  },
};
