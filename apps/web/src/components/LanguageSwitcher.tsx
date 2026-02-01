import { useTranslation } from 'react-i18next';
import { supportedLanguages, type SupportedLanguage } from '../i18n';

interface LanguageSwitcherProps {
  /** Compact mode shows only the language code */
  compact?: boolean;
  /** Custom styles */
  style?: React.CSSProperties;
}

const FLAG_EMOJIS: Record<SupportedLanguage, string> = {
  en: 'EN',
  tr: 'TR',
};

export function LanguageSwitcher({ compact = false, style }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();
  const currentLang = (i18n.language?.split('-')[0] as SupportedLanguage) || 'en';

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value as SupportedLanguage;
    i18n.changeLanguage(newLang);
  };

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        ...style,
      }}
    >
      <select
        value={currentLang}
        onChange={handleChange}
        aria-label="Select language"
        style={{
          appearance: 'none',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-color)',
          borderRadius: '2px',
          padding: compact ? '0.25rem 1.5rem 0.25rem 0.5rem' : '0.375rem 2rem 0.375rem 0.75rem',
          fontFamily: 'var(--font-mono)',
          fontSize: compact ? '0.6875rem' : '0.75rem',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          letterSpacing: '0.05em',
          outline: 'none',
          transition: 'border-color 0.2s, color 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--neon-cyan)';
          e.currentTarget.style.color = 'var(--text-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-color)';
          e.currentTarget.style.color = 'var(--text-secondary)';
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--neon-cyan)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-color)';
        }}
      >
        {supportedLanguages.map((lang) => (
          <option key={lang} value={lang}>
            {compact ? FLAG_EMOJIS[lang] : `${FLAG_EMOJIS[lang]} ${t(`language.${lang}`)}`}
          </option>
        ))}
      </select>
      {/* Dropdown arrow */}
      <span
        style={{
          position: 'absolute',
          right: compact ? '0.375rem' : '0.5rem',
          pointerEvents: 'none',
          color: 'var(--text-muted)',
          fontSize: '0.5rem',
        }}
      >
        ▼
      </span>
    </div>
  );
}
