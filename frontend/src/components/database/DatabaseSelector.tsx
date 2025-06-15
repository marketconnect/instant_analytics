import React from 'react';
import { useData } from '../../contexts/DataContext';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './DatabaseSelector.module.css';

const DatabaseSelector: React.FC = () => {
  const { databases, currentDatabase, selectDatabase, removeDatabase } = useData();
  const { t } = useLanguage();

  const handleRemoveDatabase = (databaseId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Предотвращаем выбор базы данных при клике на удаление
    
    if (confirm('Вы уверены, что хотите удалить эту базу данных из списка? Данные в DuckDB останутся, но информация о базе будет удалена.')) {
      removeDatabase(databaseId);
    }
  };

  if (databases.length === 0) {
    return (
      <div className={styles.card}>
        <h3>{t('selectDatabase')}</h3>
        <p className={styles.emptyMessage}>
          {t('noDatabaseSelected')}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h3>{t('selectDatabase')}</h3>
      
      {currentDatabase && (
        <div className={styles.currentDatabaseInfo}>
          <div className={styles.currentDatabaseName}>
            {t('currentDatabase')}: {currentDatabase.name}
          </div>
          <div className={styles.currentDatabaseDetails}>
            {t('rowCount')}: {currentDatabase.rowCount.toLocaleString()} | 
            {' '}{t('columns')}: {currentDatabase.columns.length} |
            {' '}{t('uploadDate')}: {currentDatabase.uploadDate.toLocaleDateString()}
          </div>
        </div>
      )}

      <div className={styles.selectContainer}>
        <label className={styles.selectLabel}>
          {t('loadedDatabases')}:
        </label>
        <select
          value={currentDatabase?.id || ''}
          onChange={(e) => selectDatabase(e.target.value)}
          className={`input-field ${styles.select}`}
        >
          <option value="">{t('selectDatabase')}</option>
          {databases.map((db) => (
            <option key={db.id} value={db.id}>
              {db.name} ({db.rowCount.toLocaleString()} {t('rowCount').toLowerCase()})
            </option>
          ))}
        </select>
      </div>

      {databases.length > 0 && (
        <div className={styles.databaseInfoSection}>
          <h4 className={styles.databaseInfoTitle}>
            {t('databaseInfo')}
          </h4>
          <div className={styles.databaseList}>
            {databases.map((db) => (
              <div 
                key={db.id}
                className={`${styles.databaseItem} ${db.id === currentDatabase?.id ? styles.selected : styles.unselected}`}
                onClick={() => selectDatabase(db.id)}
              >
                <div className={styles.databaseContent}>
                  <div className={`${styles.databaseName} ${db.id === currentDatabase?.id ? styles.selected : styles.unselected}`}>
                    {db.id === currentDatabase?.id && '✓ '}{db.name}
                  </div>
                  <div className={styles.databaseDetails}>
                    {db.fileName} • {db.rowCount.toLocaleString()} {t('rowCount').toLowerCase()} • {db.columns.length} {t('columns').toLowerCase()}
                  </div>
                </div>
                <button
                  onClick={(e) => handleRemoveDatabase(db.id, e)}
                  className={styles.removeButton}
                  title="Удалить базу данных из списка"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DatabaseSelector; 