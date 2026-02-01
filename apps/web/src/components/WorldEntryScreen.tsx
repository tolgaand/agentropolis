import { useEffect, useState } from 'react';
import './WorldEntryScreen.css';

interface WorldEntryScreenProps {
  worldName: string;
  worldColor: string;
  onComplete: () => void;
  minDuration?: number;
  dataReady: boolean;
}

export function WorldEntryScreen({
  worldName,
  worldColor,
  onComplete,
  minDuration = 800,
  dataReady,
}: WorldEntryScreenProps) {
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  // Minimum delay timer
  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), minDuration);
    return () => clearTimeout(timer);
  }, [minDuration]);

  // Trigger fade out when both conditions met
  useEffect(() => {
    if (minTimeElapsed && dataReady && !fadeOut) {
      setFadeOut(true);
      setTimeout(onComplete, 500); // Wait for fade out animation
    }
  }, [minTimeElapsed, dataReady, fadeOut, onComplete]);

  return (
    <div
      className={`world-entry-screen ${fadeOut ? 'fade-out' : ''}`}
      style={{ '--world-color': worldColor } as React.CSSProperties}
    >
      <div className="entry-backdrop" />

      <div className="entry-content">
        {/* Glitch text with world name */}
        <div className="entry-glitch-container">
          <div className="entry-glitch-text" data-text={worldName}>
            {worldName}
          </div>
        </div>

        {/* Glitch bars */}
        <div className="entry-glitch-bar" />
        <div className="entry-glitch-bar" />
        <div className="entry-glitch-bar" />

        {/* Scan line */}
        <div className="entry-scan-line" />

        {/* Static noise overlay */}
        <div className="entry-noise" />
      </div>
    </div>
  );
}
