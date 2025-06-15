import React from 'react';
import { useData } from '../../contexts/DataContext';
import { useLanguage } from '../../i18n/LanguageContext';

interface ExportControlsProps {
  data?: any[];
  disabled?: boolean;
}

const ExportControls: React.FC<ExportControlsProps> = ({ data, disabled = false }) => {
  const { exportData, queryResults } = useData();
  const { t } = useLanguage();

  const dataToExport = data || queryResults?.data || [];
  const hasData = dataToExport.length > 0;

  const handleExport = async (format: 'csv' | 'excel' | 'parquet' | 'json') => {
    if (!hasData) {
      alert(t('noDataToExport'));
      return;
    }
    
    try {
      await exportData(format, dataToExport);
    } catch (error) {
      console.error('Ошибка экспорта:', error);
      alert(`Ошибка экспорта: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    }
  };

  const ExportIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7,10 12,15 17,10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );

  const CsvIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10,9 9,9 8,9"/>
    </svg>
  );

  const ExcelIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
      <rect x="8" y="12" width="8" height="7"/>
      <line x1="8" y1="12" x2="16" y2="19"/>
      <line x1="16" y1="12" x2="8" y2="19"/>
    </svg>
  );

  const ParquetIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
      <rect x="8" y="11" width="8" height="2"/>
      <rect x="8" y="14" width="8" height="2"/>
      <rect x="8" y="17" width="8" height="2"/>
      <rect x="6" y="11" width="1" height="8"/>
      <rect x="17" y="11" width="1" height="8"/>
    </svg>
  );

  const JsonIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
      <path d="M10 12h4"/>
      <path d="M10 16h4"/>
      <path d="M8 12v4"/>
      <path d="M16 12v4"/>
    </svg>
  );

  return (
    <div className="card">
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ExportIcon />
        {t('exportData')}
      </h3>
      
      {!hasData && (
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '16px' }}>
          {t('noDataToExport')}
        </p>
      )}

      <div style={{ 
        display: 'flex', 
        gap: '12px', 
        flexWrap: 'wrap' 
      }}>
        <button
          className={`btn ${hasData && !disabled ? 'btn-info' : ''}`}
          onClick={() => handleExport('csv')}
          disabled={!hasData || disabled}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            opacity: (!hasData || disabled) ? 0.5 : 1
          }}
        >
          <CsvIcon />
          {t('exportToCsv')}
        </button>

        <button
          className={`btn ${hasData && !disabled ? 'btn-info' : ''}`}
          onClick={() => handleExport('excel')}
          disabled={!hasData || disabled}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            opacity: (!hasData || disabled) ? 0.5 : 1
          }}
        >
          <ExcelIcon />
          {t('exportToExcel')}
        </button>

        <button
          className={`btn ${hasData && !disabled ? 'btn-info' : ''}`}
          onClick={() => handleExport('parquet')}
          disabled={!hasData || disabled}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            opacity: (!hasData || disabled) ? 0.5 : 1
          }}
        >
          <ParquetIcon />
          {t('exportToParquet')}
        </button>

        <button
          className={`btn ${hasData && !disabled ? 'btn-info' : ''}`}
          onClick={() => handleExport('json')}
          disabled={!hasData || disabled}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            opacity: (!hasData || disabled) ? 0.5 : 1
          }}
        >
          <JsonIcon />
          JSON
        </button>
      </div>

      {hasData && (
        <div style={{ 
          marginTop: '12px', 
          fontSize: '0.875rem', 
          color: 'var(--color-text-muted)' 
        }}>
          📊 {dataToExport.length.toLocaleString()} {t('rowCount').toLowerCase()} 
          {dataToExport.length > 0 && ` • ${Object.keys(dataToExport[0]).length} ${t('columns').toLowerCase()}`}
          <br />
          💡 {t('parquetDescription')}
        </div>
      )}
    </div>
  );
};

export default ExportControls; 