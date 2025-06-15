import React from 'react';
import { useData } from '../../contexts/DataContext';
import { useLanguage } from '../../i18n/LanguageContext';

const DatabaseSelector: React.FC = () => {
  const { databases, currentDatabase, selectDatabase } = useData();
  const { t } = useLanguage();

  if (databases.length === 0) {
    return (
      <div className="card">
        <h3>{t('selectDatabase')}</h3>
        <p style={{ color: 'var(--color-text-muted)' }}>
          {t('noDatabaseSelected')}
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>{t('selectDatabase')}</h3>
      
      {currentDatabase && (
        <div style={{ 
          marginBottom: '20px', 
          padding: '12px', 
          background: 'var(--color-bg-secondary)', 
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)'
        }}>
          <div style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--color-base-600)' }}>
            {t('currentDatabase')}: {currentDatabase.name}
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            {t('rowCount')}: {currentDatabase.rowCount.toLocaleString()} | 
            {' '}{t('columns')}: {currentDatabase.columns.length} |
            {' '}{t('uploadDate')}: {currentDatabase.uploadDate.toLocaleDateString()}
          </div>
        </div>
      )}

      <div>
        <label style={{ 
          display: 'block', 
          marginBottom: '8px', 
          fontWeight: '500',
          color: 'var(--color-base-600)'
        }}>
          {t('loadedDatabases')}:
        </label>
        <select
          value={currentDatabase?.id || ''}
          onChange={(e) => selectDatabase(e.target.value)}
          className="input-field"
          style={{ width: '100%' }}
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
        <div style={{ marginTop: '20px' }}>
          <h4 style={{ marginBottom: '12px', color: 'var(--color-base-600)' }}>
            {t('databaseInfo')}
          </h4>
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {databases.map((db) => (
              <div 
                key={db.id}
                style={{
                  padding: '8px 12px',
                  marginBottom: '8px',
                  background: db.id === currentDatabase?.id ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => selectDatabase(db.id)}
              >
                <div style={{ fontWeight: '500', marginBottom: '4px' }}>
                  {db.name}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  {db.fileName} • {db.rowCount.toLocaleString()} {t('rowCount').toLowerCase()} • {db.columns.length} {t('columns').toLowerCase()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DatabaseSelector; 