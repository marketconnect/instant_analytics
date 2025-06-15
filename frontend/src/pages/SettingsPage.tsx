import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import type { Language } from '../i18n/translations';
import styles from './SettingsPage.module.css';

const SettingsPage: React.FC = () => {
  const { language, setLanguage, t } = useLanguage();

  const handleLanguageChange = (newLanguage: Language) => {
    setLanguage(newLanguage);
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h3>{t('language')}</h3>
        <p>{t('settingsDescription')}</p>
        
        <div className={styles.languageSection}>
          <label className={styles.label}>
            {t('language')}:
          </label>
          <div className={styles.buttonGroup}>
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
