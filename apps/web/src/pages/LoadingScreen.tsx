import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSocketContext, type ConnectionStatus } from '../socket';

// Asset paths to preload (3D models loaded by ThreeModelLoader at runtime)
const ASSETS_TO_LOAD: string[] = [];

// Status message keys for each connection state
const STATUS_MESSAGE_KEYS: Record<ConnectionStatus, string> = {
  idle: 'loading.status.idle',
  connecting: 'loading.status.connecting',
  connected: 'loading.status.connected',
  synced: 'loading.status.synced',
  disconnected: 'loading.status.disconnected',
  retrying: 'loading.status.retrying',
  failed: 'loading.status.failed',
};

export function LoadingScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { connectionStatus, retryIn, reconnect } = useSocketContext();

  const [assetsProgress, setAssetsProgress] = useState(0);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  // Track previous status to detect retry attempts
  const prevStatusRef = useRef<ConnectionStatus>(connectionStatus);

  // Check if ready to proceed
  const isReady = assetsLoaded && connectionStatus === 'synced';
  const isFailed = connectionStatus === 'failed';

  // Preload assets
  const preloadAssets = useCallback(async () => {
    const totalAssets = ASSETS_TO_LOAD.length;
    let loadedCount = 0;

    const loadImage = (src: string): Promise<void> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          loadedCount++;
          setAssetsProgress((loadedCount / totalAssets) * 100);
          resolve();
        };
        img.onerror = () => {
          loadedCount++;
          setAssetsProgress((loadedCount / totalAssets) * 100);
          resolve();
        };
        img.src = src;
      });
    };

    await Promise.all(ASSETS_TO_LOAD.map(loadImage));
    setAssetsLoaded(true);
  }, []);

  useEffect(() => {
    preloadAssets();
  }, [preloadAssets]);

  // Navigate when ready
  useEffect(() => {
    if (!isReady) return;

    const fadeTimer = setTimeout(() => setFadeOut(true), 300);
    const navTimer = setTimeout(() => navigate('/multiverse'), 1000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(navTimer);
    };
  }, [isReady, navigate]);

  // Trigger shake animation on retry attempt
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = connectionStatus;

    // Shake when transitioning from retrying to connecting (new attempt)
    if (prevStatus === 'retrying' && connectionStatus === 'connecting') {
      setShakeKey(k => k + 1);
    }
  }, [connectionStatus]);

  // Calculate overall progress
  const getOverallProgress = () => {
    const assetWeight = 0.3;
    const connectionWeight = 0.7;

    let connectionProgress = 0;
    switch (connectionStatus) {
      case 'idle':
        connectionProgress = 0;
        break;
      case 'connecting':
        connectionProgress = 20;
        break;
      case 'connected':
        connectionProgress = 60;
        break;
      case 'synced':
        connectionProgress = 100;
        break;
      case 'disconnected':
      case 'retrying':
        connectionProgress = 30;
        break;
      case 'failed':
        connectionProgress = 0;
        break;
    }

    return (assetsProgress * assetWeight) + (connectionProgress * connectionWeight);
  };

  const progress = getOverallProgress();
  const statusMessage = t(STATUS_MESSAGE_KEYS[connectionStatus]);
  const isError = connectionStatus === 'disconnected' || connectionStatus === 'failed';

  return (
    <div
      key={shakeKey}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a1209 0%, #221a0f 50%, #2a2015 100%)',
        transition: 'opacity 0.7s ease-out',
        opacity: fadeOut ? 0 : 1,
        animation: shakeKey > 0 ? 'shake 0.5s ease-in-out' : 'none',
      }}
    >
      {/* Logo */}
      <div style={{
        marginBottom: '3rem',
        animation: isFailed ? 'none' : 'pulse 2s ease-in-out infinite',
      }}>
        <h1 style={{
          fontSize: '4rem',
          fontWeight: 200,
          letterSpacing: '0.3em',
          color: isFailed ? '#8b0000' : '#c9a84c',
          textShadow: isFailed ? '0 0 40px rgba(139, 0, 0, 0.5)' : '0 0 40px rgba(201, 168, 76, 0.5)',
          margin: 0,
        }}>
          AGENTROPOLIS
        </h1>
        <p style={{
          textAlign: 'center',
          fontSize: '0.9rem',
          color: '#786850',
          letterSpacing: '0.2em',
          marginTop: '0.5rem',
          fontFamily: 'var(--font-mono)',
        }}>
          {t('loading.tagline')}
        </p>
      </div>

      {/* Progress Bar */}
      <div style={{
        width: '300px',
        height: '4px',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '2px',
        overflow: 'hidden',
        marginBottom: '0.5rem',
      }}>
        <div style={{
          width: `${progress}%`,
          height: '100%',
          background: isError
            ? 'linear-gradient(90deg, #8b0000, #a0392a)'
            : 'linear-gradient(90deg, #c9a84c, #cd7f32)',
          borderRadius: '2px',
          transition: 'width 0.3s ease-out',
          boxShadow: isError
            ? '0 0 10px rgba(139, 0, 0, 0.5)'
            : '0 0 10px rgba(201, 168, 76, 0.5)',
        }} />
      </div>

      {/* Status Indicators */}
      <div style={{
        display: 'flex',
        gap: '2rem',
        marginBottom: '1rem',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.7rem',
        color: '#584830',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: assetsLoaded ? '#2d5a27' : '#c9a84c',
            boxShadow: assetsLoaded ? '0 0 6px #2d5a27' : 'none',
          }} />
          {t('loading.assets')} {assetsLoaded ? t('common.loaded') : t('common.loading')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: connectionStatus === 'synced' ? '#2d5a27'
              : isError ? '#8b0000'
              : '#c9a84c',
            boxShadow: connectionStatus === 'synced' ? '0 0 6px #2d5a27'
              : isError ? '0 0 6px #8b0000'
              : 'none',
            animation: connectionStatus === 'connecting' || connectionStatus === 'retrying'
              ? 'blink 1s infinite'
              : 'none',
          }} />
          {t('loading.uplink')} {connectionStatus === 'synced' ? t('common.active') : isError ? t('common.error') : t('common.pending')}
        </div>
      </div>

      {/* Status Message */}
      <p style={{
        fontSize: '0.8rem',
        color: isError ? '#a0392a' : '#786850',
        letterSpacing: '0.1em',
        fontFamily: 'var(--font-mono)',
      }}>
        {statusMessage}
        {connectionStatus === 'retrying' && retryIn !== null && (
          <span style={{ color: '#c9a84c' }}> [{retryIn}s]</span>
        )}
      </p>

      {/* Retry Button (only on failed state) */}
      {isFailed && (
        <button
          onClick={reconnect}
          style={{
            marginTop: '1.5rem',
            padding: '0.75rem 2rem',
            background: 'transparent',
            border: '1px solid #8b0000',
            color: '#8b0000',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            letterSpacing: '0.1em',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#8b0000';
            e.currentTarget.style.color = '#1a1209';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#8b0000';
          }}
        >
          {t('loading.retryConnection')}
        </button>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10% { transform: translateX(-8px) rotate(-0.5deg); }
          20% { transform: translateX(8px) rotate(0.5deg); }
          30% { transform: translateX(-6px) rotate(-0.3deg); }
          40% { transform: translateX(6px) rotate(0.3deg); }
          50% { transform: translateX(-4px) rotate(-0.2deg); }
          60% { transform: translateX(4px) rotate(0.2deg); }
          70% { transform: translateX(-2px) rotate(-0.1deg); }
          80% { transform: translateX(2px) rotate(0.1deg); }
          90% { transform: translateX(-1px); }
        }
      `}</style>
    </div>
  );
}
