import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import type { Language } from '../i18n/translations';

const SettingsPage: React.FC = () => {
  const { language, setLanguage, t } = useLanguage();

  const handleLanguageChange = (newLanguage: Language) => {
    setLanguage(newLanguage);
  };

  return (
    <div className="page">
      <div className="card">
        <h3>{t('language')}</h3>
        <p>{t('settingsDescription')}</p>
        
        <div style={{ marginTop: '20px' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '500',
            color: 'var(--color-base-600)'
          }}>
            {t('language')}:
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`btn ${language === 'ru' ? 'btn-primary' : 'btn-info'}`}
              onClick={() => handleLanguageChange('ru')}
            >
              🇷🇺 Русский
            </button>
            <button
              className={`btn ${language === 'en' ? 'btn-primary' : 'btn-info'}`}
              onClick={() => handleLanguageChange('en')}
            >
              🇺🇸 English
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
