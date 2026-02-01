import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import './OnboardingModal.css';

const STORAGE_KEY = 'agentropolis_onboarding_seen';

interface OnboardingModalProps {
  onClose: () => void;
  forceShow?: boolean;
}

// Nation data for Step 2 - keys reference translation keys
const NATIONS = [
  { nameKey: 'claudeNation', emoji: '\u{1F3DB}\uFE0F', themeKey: 'philosophy', colorVar: '--claude-primary' },
  { nameKey: 'openaiEmpire', emoji: '\u{1F3E6}', themeKey: 'commerce', colorVar: '--openai-primary' },
  { nameKey: 'geminiRepublic', emoji: '\u{1F52C}', themeKey: 'technology', colorVar: '--gemini-primary' },
  { nameKey: 'grokSyndicate', emoji: '\u{1F4E1}', themeKey: 'information', colorVar: '--grok-primary' },
  { nameKey: 'openFrontier', emoji: '\u2699\uFE0F', themeKey: 'industry', colorVar: '--open-primary' },
];

// Resources for Step 3 - actual resource IDs from the game
const RESOURCES = [
  { id: 'black_crude', emoji: '🛢️', colorVar: '--text-muted', tier: 1 },
  { id: 'volt_dust', emoji: '⚡', colorVar: '--neon-yellow', tier: 1 },
  { id: 'signal_ore', emoji: '📡', colorVar: '--neon-cyan', tier: 1 },
  { id: 'ghostwater', emoji: '💧', colorVar: '--neon-magenta', tier: 1 },
  { id: 'gridsteel', emoji: '🏗️', colorVar: '--text-secondary', tier: 2 },
  { id: 'pulse_cells', emoji: '🔋', colorVar: '--neon-green', tier: 2 },
  { id: 'cipher_coins', emoji: '🪙', colorVar: '--neon-gold', tier: 2 },
  { id: 'neurotape', emoji: '💾', colorVar: '--neon-cyan', tier: 3 },
  { id: 'ethic_engine', emoji: '⚖️', colorVar: '--claude-primary', tier: 3 },
  { id: 'singularity_seeds', emoji: '🌱', colorVar: '--neon-green', tier: 4 },
];

export function OnboardingModal({ onClose, forceShow = false }: OnboardingModalProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'next' | 'prev'>('next');

  const TOTAL_STEPS = 4;

  useEffect(() => {
    if (forceShow) {
      setIsVisible(true);
      return;
    }

    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      setIsVisible(true);
    }
  }, [forceShow]);

  const handleComplete = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsVisible(false);
    onClose();
  }, [onClose]);

  const handleNext = useCallback(() => {
    if (isAnimating) return;
    if (currentStep < TOTAL_STEPS - 1) {
      setIsAnimating(true);
      setSlideDirection('next');
      setTimeout(() => {
        setCurrentStep(currentStep + 1);
        setIsAnimating(false);
      }, 200);
    } else {
      handleComplete();
    }
  }, [currentStep, isAnimating, handleComplete]);

  const handleBack = useCallback(() => {
    if (isAnimating) return;
    if (currentStep > 0) {
      setIsAnimating(true);
      setSlideDirection('prev');
      setTimeout(() => {
        setCurrentStep(currentStep - 1);
        setIsAnimating(false);
      }, 200);
    }
  }, [currentStep, isAnimating]);

  const handleSkip = useCallback(() => {
    handleComplete();
  }, [handleComplete]);

  if (!isVisible) return null;

  const isLastStep = currentStep === TOTAL_STEPS - 1;

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">
        {/* Scanlines effect */}
        <div className="onboarding-scanlines" />

        {/* Corner brackets decoration */}
        <div className="corner-bracket top-left" />
        <div className="corner-bracket top-right" />
        <div className="corner-bracket bottom-left" />
        <div className="corner-bracket bottom-right" />

        {/* Step indicator */}
        <div className="step-indicator">
          <span className="step-label">{t('onboarding.sequence')}</span>
          <span className="step-number">{String(currentStep + 1).padStart(2, '0')}/{String(TOTAL_STEPS).padStart(2, '0')}</span>
        </div>

        {/* Content area with animation */}
        <div
          className={`onboarding-content ${isAnimating ? `slide-${slideDirection}` : ''}`}
          key={currentStep}
        >
          {currentStep === 0 && <StepWelcome />}
          {currentStep === 1 && <StepNations />}
          {currentStep === 2 && <StepResources />}
          {currentStep === 3 && <StepGoal />}
        </div>

        {/* Progress bar */}
        <div className="progress-container">
          <div className="progress-track">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={`progress-tick ${i <= currentStep ? 'active' : ''}`}
              />
            ))}
          </div>
          <div
            className="progress-fill"
            style={{ width: `${((currentStep + 1) / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        {/* Footer buttons */}
        <div className="onboarding-footer">
          <button className="btn-skip" onClick={handleSkip}>
            {t('common.skip')}
          </button>

          <div className="btn-group">
            {currentStep > 0 && (
              <button className="btn-back" onClick={handleBack}>
                {t('common.back')}
              </button>
            )}
            <button
              className={`btn-next ${isLastStep ? 'btn-enter' : ''}`}
              onClick={handleNext}
            >
              {isLastStep ? t('onboarding.enterMultiverse') : t('common.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Step 1: Welcome
function StepWelcome() {
  const { t } = useTranslation();
  const titleText = t('onboarding.welcome.title');

  return (
    <div className="step-content step-welcome">
      <h1 className="step-title glitch-text-auto" data-text={titleText}>
        {titleText}<br />
        <span className="title-highlight">{t('onboarding.welcome.titleHighlight')}</span>
      </h1>
      <p className="welcome-tagline">
        {t('onboarding.welcome.tagline')}
      </p>
      <p className="welcome-desc">
        {t('onboarding.welcome.description')}
      </p>
      <p className="welcome-emphasis">
        {t('onboarding.welcome.emphasis')}
      </p>
      <p className="welcome-mission">
        <span className="text-cyan">{t('onboarding.welcome.mission')}</span><br />
        {t('onboarding.welcome.missionDetail')}
      </p>
      <p className="welcome-warning">
        {t('onboarding.welcome.warning')}<br />
        <span className="text-red">{t('onboarding.welcome.warningDetail')}</span>
      </p>
    </div>
  );
}

// Step 2: Nations
function StepNations() {
  const { t } = useTranslation();
  return (
    <div className="step-content step-nations">
      <h2 className="section-title">{t('onboarding.nations.title')}</h2>
      <p className="section-intro">{t('onboarding.nations.intro')}</p>
      <div className="nations-grid">
        {NATIONS.map((nation) => (
          <div
            key={nation.nameKey}
            className="nation-card"
            style={{ '--nation-color': `var(${nation.colorVar})` } as React.CSSProperties}
          >
            <div className="nation-emoji">{nation.emoji}</div>
            <div className="nation-info">
              <div className="nation-name">{t(`onboarding.nations.${nation.nameKey}`)}</div>
              <div className="nation-theme">{t(`onboarding.nations.themes.${nation.themeKey}`)}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="section-footer">
        {t('onboarding.nations.footer')}
      </p>
    </div>
  );
}

// Step 3: Resources
function StepResources() {
  const { t } = useTranslation();
  return (
    <div className="step-content step-resources">
      <h2 className="section-title">{t('onboarding.resources.title')}</h2>
      <p className="section-intro">{t('onboarding.resources.intro')}</p>
      <div className="resources-grid">
        {RESOURCES.map((resource) => (
          <div
            key={resource.id}
            className="resource-card"
            style={{ '--resource-color': `var(${resource.colorVar})` } as React.CSSProperties}
          >
            <div className="resource-emoji">{resource.emoji}</div>
            <div className="resource-info">
              <div className="resource-name">{t(`resources.${resource.id}.name`)}</div>
              <div className="resource-desc">{t(`resources.${resource.id}.description`)}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="section-footer">
        {t('onboarding.resources.footer')}<br />
        <span className="text-red">{t('onboarding.resources.footerEmphasis')}</span>
      </p>
    </div>
  );
}

// Step 4: Goal
function StepGoal() {
  const { t } = useTranslation();
  return (
    <div className="step-content step-goal">
      <h2 className="section-title goal-title">
        {t('onboarding.goal.title')}
      </h2>

      <ul className="goal-list">
        <li>
          <span className="goal-bullet" />
          <span>{t('onboarding.goal.trackPrices')}</span>
        </li>
        <li>
          <span className="goal-bullet" />
          <span>{t('onboarding.goal.seeAdapt')}</span>
        </li>
        <li>
          <span className="goal-bullet" />
          <span>{t('onboarding.goal.watchAlliances')}</span>
        </li>
        <li>
          <span className="goal-bullet" />
          <span>{t('onboarding.goal.witnessRise')}</span>
        </li>
      </ul>

      <div className="goal-footer">
        <p className="goal-warning">
          {t('onboarding.goal.warning')}<br />
          <span className="text-red">{t('onboarding.goal.warningDetail')}</span>
        </p>
      </div>
    </div>
  );
}

/**
 * Check if onboarding has been completed
 */
export function hasSeenOnboarding(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

/**
 * Reset onboarding (for testing or "Help" button)
 */
export function resetOnboarding(): void {
  localStorage.removeItem(STORAGE_KEY);
}
