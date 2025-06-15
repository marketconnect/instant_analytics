import React from 'react';
import { useAnalytics } from '../hooks/use-analytics';
import { useData } from '../contexts/DataContext';
import { useLanguage } from '../i18n/LanguageContext';
import FileUploader from '../components/analytics/FileUploader';
import SQLQueryEditor from '../components/analytics/SQLQueryEditor';
import DataGrid from '../components/analytics/DataGrid';
import VisualizationSettings from '../components/analytics/VisualizationSettings';
import DataVisualization from '../components/analytics/DataVisualization';
import DatabaseSelector from '../components/database/DatabaseSelector';
import ExportControls from '../components/export/ExportControls';

const DuckDBAnalyticsPage: React.FC = () => {
  const { t } = useLanguage();
  const { 
    currentDatabase, 
    queryResults, 
    isLoading: globalLoading, 
    error: globalError,
    setQueryResults,
    setLoading: setGlobalLoading,
    setError: setGlobalError,
    addDatabase
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
    executeQuickQuery,
    updateVizSettings,
  } = useAnalytics();

  const { gridData, columnDefs, vizSettings } = analyticsData;
  const availableFields = gridData.length > 0 ? Object.keys(gridData[0]) : [];
  
  // Используем данные из queryResults если они есть, иначе из analytics
  const displayData = queryResults?.data || gridData;
  const isLoading = globalLoading || analyticsLoading;

  // Обновленный обработчик загрузки файла
  const handleFileUpload = async (file: File) => {
    try {
      setGlobalLoading(true);
      setGlobalError(null);
      
      // Сначала загружаем через существующий хук
      await originalHandleFileUpload(file);
      
      // Получаем данные и добавляем в глобальное состояние
      // Здесь нужно получить данные после загрузки
      // Временно используем пустой массив, в реальности нужно получить данные из хука
      const data = gridData.length > 0 ? gridData : [];
      await addDatabase(file, data);
      
    } catch (error) {
      setGlobalError('Ошибка загрузки файла');
      console.error('File upload failed:', error);
    } finally {
      setGlobalLoading(false);
    }
  };

  // Обновленный обработчик выполнения SQL
  const handleExecuteQuery = async (query: string) => {
    if (!currentDatabase) {
      setGlobalError(t('noDatabaseSelected'));
      return;
    }

    try {
      setGlobalLoading(true);
      setGlobalError(null);
      
      const startTime = Date.now();
      await originalExecuteSQL(query);
      const executionTime = Date.now() - startTime;
      
      // Сохраняем результаты в глобальное состояние
      if (gridData.length > 0) {
        const columns = Object.keys(gridData[0]);
        setQueryResults({
          columns,
          data: gridData,
          query,
          executionTime
        });
      }
      
    } catch (error) {
      setGlobalError('Ошибка выполнения запроса');
      console.error('Query execution failed:', error);
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleQuickQuery = async (query: string) => {
    if (!currentDatabase) {
      setGlobalError(t('noDatabaseSelected'));
      return;
    }

    try {
      setGlobalLoading(true);
      await executeQuickQuery(query);
      
      // Также сохраняем результаты быстрых запросов
      if (gridData.length > 0) {
        const columns = Object.keys(gridData[0]);
        setQueryResults({
          columns,
          data: gridData,
          query,
          executionTime: 0
        });
      }
    } catch (error) {
      setGlobalError('Ошибка выполнения запроса');
      console.error('Quick query failed:', error);
    } finally {
      setGlobalLoading(false);
    }
  };

  return (
    <div className="analytics-page">
      
      {/* Селектор базы данных */}
      <DatabaseSelector />

      {/* Показываем ошибки */}
      {globalError && (
        <div className="card" style={{ 
          background: 'var(--color-error)', 
          color: 'white', 
          marginBottom: '16px' 
        }}>
          ❌ {globalError}
        </div>
      )}

      {/* Секция загрузки файлов */}
      <FileUploader
        onFileUpload={handleFileUpload}
        importStatus={importStatus}
        isLoading={isLoading}
      />

      {/* Экспорт данных - показываем если есть данные */}
      {displayData.length > 0 && (
        <ExportControls 
          data={displayData}
          disabled={isLoading}
        />
      )}

      {/* Секция SQL запросов */}
      {(fileImported || currentDatabase) && (
        <SQLQueryEditor
          query={sqlQuery}
          onQueryChange={setSqlQuery}
          onExecuteQuery={handleExecuteQuery}
          onQuickQuery={handleQuickQuery}
          isLoading={isLoading}
          hasData={displayData.length > 0}
        />
      )}

      {/* Результаты запроса */}
      <DataGrid
        data={displayData}
        columnDefs={columnDefs}
      />

      {/* Настройки визуализации */}
      {displayData.length > 0 && (
        <VisualizationSettings
          settings={vizSettings}
          onSettingsChange={updateVizSettings}
          availableFields={displayData.length > 0 ? Object.keys(displayData[0]) : []}
        />
      )}

      {/* Визуализация */}
      {displayData.length > 0 && (
        <DataVisualization
          data={displayData}
          settings={vizSettings}
        />
      )}

      {/* Состояние загрузки */}
      {isLoading && (
        <div className="loading-overlay">
          ⏳ {t('loading')}
        </div>
      )}
    </div>
  );
};

export default DuckDBAnalyticsPage; 