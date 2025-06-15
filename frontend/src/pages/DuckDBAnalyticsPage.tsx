import React, { useState } from 'react';
import { useData } from '../contexts/DataContext';
import { useAnalytics } from '../hooks/use-analytics';
import SQLQueryEditor from '../components/analytics/SQLQueryEditor';
import DataGrid from '../components/analytics/DataGrid';
import VisualizationSettings from '../components/analytics/VisualizationSettings';
import DataVisualization from '../components/analytics/DataVisualization';
import DatabaseSelector from '../components/database/DatabaseSelector';
import FileUploader from '../components/analytics/FileUploader';
import ExportControls from '../components/export/ExportControls';
import styles from './DuckDBAnalyticsPage.module.css';

type ViewMode = 'query' | 'visualization' | 'database';

const DuckDBAnalyticsPage: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('query');
  const [queryMode, setQueryMode] = useState<'sql' | 'ai'>('sql');
  
  const {
    currentDatabase,
    isLoading: globalLoading,
    error: globalError
  } = useData();

  const {
    analyticsData,
    sqlQuery,
    setSqlQuery,
    isLoading: analyticsLoading,
    fileImported,
    importStatus,
    handleFileUpload: originalHandleFileUpload,
    executeSQL: originalExecuteSQL,
    updateVizSettings,
  } = useAnalytics();

  const { gridData, columnDefs, vizSettings } = analyticsData;
  
  // Используем данные из queryResults если они есть, иначе из analytics
  const displayData = gridData;
  const isLoading = globalLoading || analyticsLoading;

  // Обновленный обработчик загрузки файла
  const handleFileUpload = async (file: File) => {
    try {
      await originalHandleFileUpload(file);
      
    } catch (error) {
      console.error('File upload failed:', error);
    }
  };

  // Обновленный обработчик выполнения SQL
  const handleExecuteQuery = async (query: string) => {
    if (!currentDatabase) {
      console.error('Database not selected');
      return;
    }

    try {
      await originalExecuteSQL(query);
      
    } catch (error) {
      console.error('Query execution failed:', error);
    }
  };

  // Иконки для режимов (уменьшенные до 14px)
  const QueryIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
      <path d="M8 7h8"/>
      <path d="M8 11h8"/>
    </svg>
  );

  const ChartIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 3v18h18"/>
      <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
    </svg>
  );

  const DatabaseIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <ellipse cx="12" cy="5" rx="9" ry="3"/>
      <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
      <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/>
    </svg>
  );

  return (
    <div className={styles.analyticsPageModern}>
      <div className={styles.viewModeSelector}>
        <p className={styles.selectorLabel}>Режим отображения</p>
        <div className={styles.radioGroup} role="radiogroup" aria-orientation="horizontal">
          <label className={`${styles.radioOption} ${viewMode === 'query' ? styles.selected : ''}`}>
            <input
              type="radio"
              name="viewMode"
              value="query"
              checked={viewMode === 'query'}
              onChange={(e) => setViewMode(e.target.value as ViewMode)}
              className={styles.radioInput}
            />
            <QueryIcon />
            <span className={styles.radioLabel}>Запросы</span>
          </label>
          
          <label className={`${styles.radioOption} ${viewMode === 'visualization' ? styles.selected : ''}`}>
            <input
              type="radio"
              name="viewMode"
              value="visualization"
              checked={viewMode === 'visualization'}
              onChange={(e) => setViewMode(e.target.value as ViewMode)}
              className={styles.radioInput}
            />
            <ChartIcon />
            <span className={styles.radioLabel}>Визуализация</span>
          </label>
          
          <label className={`${styles.radioOption} ${viewMode === 'database' ? styles.selected : ''}`}>
            <input
              type="radio"
              name="viewMode"
              value="database"
              checked={viewMode === 'database'}
              onChange={(e) => setViewMode(e.target.value as ViewMode)}
              className={styles.radioInput}
            />
            <DatabaseIcon />
            <span className={styles.radioLabel}>База данных</span>
          </label>
        </div>
       </div>

      {/* Показываем ошибки */}
      {globalError && (
        <div className={styles.errorBanner}>
          <span className={styles.errorIcon}>❌</span>
          <span className={styles.errorText}>{globalError}</span>
        </div>
      )}

      {/* Контент в зависимости от выбранного режима */}
      <div className={styles.pageContent}>
        {viewMode === 'query' && (
          <div className={styles.queryMode}>
            {/* SQL редактор */}
            {(fileImported || currentDatabase) && (
              <SQLQueryEditor
                query={sqlQuery}
                onQueryChange={setSqlQuery}
                onExecuteQuery={handleExecuteQuery}
                isLoading={isLoading}
                mode={queryMode}
                onModeChange={setQueryMode}
              />
            )}

            {/* Результаты запроса */}
            <DataGrid
              data={displayData}
              columnDefs={columnDefs}
            />

            {/* Экспорт данных */}
            {displayData.length > 0 && (
              <ExportControls 
                data={displayData}
                disabled={isLoading}
              />
            )}
          </div>
        )}

        {viewMode === 'visualization' && (
          <div className={styles.visualizationMode}>
            {displayData.length > 0 ? (
              <>
                <VisualizationSettings
                  settings={vizSettings}
                  onSettingsChange={updateVizSettings}
                  availableFields={displayData.length > 0 ? Object.keys(displayData[0]) : []}
                />
                <DataVisualization
                  data={displayData}
                  settings={vizSettings}
                />
              </>
            ) : (
              <div className={styles.emptyState}>
                <ChartIcon />
                <h3>Нет данных для визуализации</h3>
                <p>Загрузите файл и выполните запрос для создания визуализации</p>
              </div>
            )}
          </div>
        )}

        {viewMode === 'database' && (
          <div className={styles.databaseMode}>
            <div className={styles.databaseSection}>
              <DatabaseSelector />
              
              <FileUploader
                onFileUpload={handleFileUpload}
                importStatus={importStatus}
                isLoading={isLoading}
              />
              
              {currentDatabase && (
                <div className={styles.databaseInfo}>
                  <h3>Информация о базе данных</h3>
                  <div className={styles.infoGrid}>
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Название:</span>
                      <span className={styles.infoValue}>{currentDatabase.name}</span>
                    </div>
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Файл:</span>
                      <span className={styles.infoValue}>{currentDatabase.fileName}</span>
                    </div>
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Строк:</span>
                      <span className={styles.infoValue}>{currentDatabase.rowCount.toLocaleString()}</span>
                    </div>
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Колонок:</span>
                      <span className={styles.infoValue}>{currentDatabase.columns.length}</span>
                    </div>
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Дата загрузки:</span>
                      <span className={styles.infoValue}>{currentDatabase.uploadDate.toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Состояние загрузки */}
      {isLoading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingSpinner}>
            <div className={styles.spinner}></div>
            <p>Обработка данных...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DuckDBAnalyticsPage; 