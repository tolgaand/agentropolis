import { useTranslation } from 'react-i18next';
import type { CSSProperties } from 'react';
import type { TimeState } from '@agentropolis/shared';
import type { WeatherState } from '../lib/time';

interface TimeWeatherPanelProps {
  timeState: TimeState;
  weatherState: WeatherState;
  isConnected: boolean;
  isLoading: boolean;
}

export function TimeWeatherPanel({
  timeState,
  weatherState,
  isConnected,
  isLoading,
}: TimeWeatherPanelProps): JSX.Element {
  const { t } = useTranslation();
  const phaseLabel = timeState.phase.toUpperCase();
  const dayLabel = t('timeWeather.day', { dayIndex: timeState.dayIndex });
  const syncLabel = isLoading ? t('common.loading') : isConnected ? t('common.live') : t('common.offline');

  const syncStyle = {
    ...styles.sync,
    ...(isConnected ? styles.syncLive : isLoading ? styles.syncLoading : styles.syncOffline),
  };

  return (
    <div style={styles.panel}>
      <div style={styles.headerRow}>
        <div style={styles.day}>{dayLabel}</div>
        <div style={syncStyle}>{syncLabel}</div>
      </div>

      <div style={styles.timeRow}>
        <div style={styles.time}>{timeState.hourDisplay}</div>
        <div style={styles.phase}>{phaseLabel}</div>
      </div>

      <div style={styles.weatherRow}>
        <div style={styles.weatherLabel}>{t('timeWeather.weather')}</div>
        <div style={styles.weatherValue}>{weatherState.label}</div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    position: 'absolute',
    top: 20,
    right: 20,
    minWidth: 180,
    padding: '12px 14px',
    background: 'rgba(10, 12, 20, 0.72)',
    border: '1px solid rgba(120, 140, 200, 0.25)',
    borderRadius: 10,
    color: '#e7ecff',
    fontFamily: '"Space Grotesk", "Segoe UI", sans-serif',
    letterSpacing: '0.02em',
    backdropFilter: 'blur(8px)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    fontSize: '0.8rem',
    textTransform: 'uppercase',
    color: 'rgba(231, 236, 255, 0.7)',
  },
  day: {
    fontWeight: 600,
  },
  sync: {
    padding: '2px 6px',
    borderRadius: 6,
    fontSize: '0.65rem',
    fontWeight: 600,
  },
  syncLive: {
    background: 'rgba(0, 217, 255, 0.15)',
    border: '1px solid rgba(0, 217, 255, 0.4)',
    color: '#7ef0ff',
  },
  syncLoading: {
    background: 'rgba(255, 200, 0, 0.15)',
    border: '1px solid rgba(255, 200, 0, 0.4)',
    color: '#ffd666',
  },
  syncOffline: {
    background: 'rgba(255, 100, 100, 0.15)',
    border: '1px solid rgba(255, 100, 100, 0.4)',
    color: '#ff8888',
  },
  timeRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  time: {
    fontSize: '1.6rem',
    fontWeight: 600,
    letterSpacing: '0.04em',
  },
  phase: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'rgba(231, 236, 255, 0.75)',
  },
  weatherRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.85rem',
  },
  weatherLabel: {
    color: 'rgba(231, 236, 255, 0.6)',
  },
  weatherValue: {
    fontWeight: 600,
  },
};
