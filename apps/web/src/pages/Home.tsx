/**
 * Home Page - Spectator View
 *
 * SPECTATOR-FIRST ARCHITECTURE:
 * - All data comes via socket
 * - Shows city map with parcels and buildings
 * - Displays time, spectator count, connection status
 */

import { useTranslation } from 'react-i18next';
import { CityMapSwitch as CityMap } from '../components/CityMapSwitch';
import { TimeWeatherPanel } from '../components/TimeWeatherPanel';
import { SpectatorPanel } from '../components/SpectatorPanel';
import { useCityState } from '../hooks/useCityState';
import { DEFAULT_WEATHER } from '../lib/time';

export function Home(): JSX.Element {
  const { t } = useTranslation();
  const {
    mapData,
    parcels,
    buildings,
    objects,
    timeState,
    isConnected,
    isLoading,
    spectatorCount,
    error,
  } = useCityState();

  // Loading state
  if (isLoading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner} />
        <div style={styles.loadingText}>{t('home.connecting')}</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={styles.error}>
        <div style={styles.errorIcon}>⚠️</div>
        <div>{error}</div>
        <button style={styles.retryBtn} onClick={() => window.location.reload()}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <CityMap
        timePhase={timeState.phase}
        mapData={mapData}
        parcels={parcels}
        buildings={buildings}
        objects={objects}
      />
      <TimeWeatherPanel
        timeState={timeState}
        weatherState={DEFAULT_WEATHER}
        isConnected={isConnected}
        isLoading={isLoading}
      />
      <SpectatorPanel spectatorCount={spectatorCount} isConnected={isConnected} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  loading: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0a12',
    color: '#fff',
    gap: '1rem',
  },
  spinner: {
    width: 40,
    height: 40,
    border: '3px solid rgba(255,255,255,0.1)',
    borderTopColor: '#00d9ff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    fontSize: '1.2rem',
    opacity: 0.8,
    letterSpacing: '0.1em',
  },
  error: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0a12',
    color: '#ff6b6b',
    gap: '1rem',
  },
  errorIcon: {
    fontSize: '3rem',
  },
  retryBtn: {
    padding: '0.75rem 2rem',
    background: '#00d9ff',
    color: '#000',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 600,
  },
};
