/**
 * SpectatorPanel - Shows spectator count and connection status
 */

import { useTranslation } from 'react-i18next';
import type { CSSProperties } from 'react';

interface SpectatorPanelProps {
  spectatorCount: number;
  isConnected: boolean;
}

export function SpectatorPanel({ spectatorCount, isConnected }: SpectatorPanelProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <div style={isConnected ? styles.dotConnected : styles.dotDisconnected} />
        <span style={styles.label}>{isConnected ? t('common.live') : t('common.offline')}</span>
      </div>
      <div style={styles.row}>
        <span style={styles.icon}>👁️</span>
        <span style={styles.count}>{spectatorCount}</span>
        <span style={styles.label}>{t('spectator.watching')}</span>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    padding: '10px 14px',
    background: 'rgba(10, 12, 20, 0.75)',
    border: '1px solid rgba(120, 140, 200, 0.2)',
    borderRadius: 10,
    color: '#e7ecff',
    fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dotConnected: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#4ade80',
    boxShadow: '0 0 6px rgba(74, 222, 128, 0.5)',
  },
  dotDisconnected: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#ff6b6b',
    boxShadow: '0 0 6px rgba(255, 107, 107, 0.5)',
  },
  icon: {
    fontSize: '0.9rem',
  },
  count: {
    fontSize: '1rem',
    fontWeight: 600,
  },
  label: {
    fontSize: '0.75rem',
    color: 'rgba(200, 210, 255, 0.6)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
};
