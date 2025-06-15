import { useState, useCallback, useEffect } from 'react';
import { tableFromIPC } from 'apache-arrow';
import type { AnalyticsData, VizSettings, ImportStatus, ColumnDef } from '../types/analytics';
import { getDuckDBService } from '../services/duckdb-service';
import { useData } from '../contexts/DataContext';

const DEFAULT_VIZ_SETTINGS: VizSettings = {
  xField: '',
  yField: '',
  chartType: 'auto'
};

export const useAnalytics = () => {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({
    gridData: [],
    columnDefs: [],
    vizSettings: DEFAULT_VIZ_SETTINGS
  });
  
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM t LIMIT 20');
  const [isLoading, setIsLoading] = useState(false);
  const [fileImported, setFileImported] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus>({
    status: 'idle',
    message: ''
  });

  const duckDBService = getDuckDBService();
  const { currentDatabase } = useData();

  // Проверяем, есть ли уже восстановленная база данных при инициализации
  useEffect(() => {
    console.log('useAnalytics: проверяем текущую базу данных:', currentDatabase);
    
    if (currentDatabase && currentDatabase.rowCount > 0) {
      console.log('useAnalytics: найдена восстановленная база данных, устанавливаем fileImported = true');
      setFileImported(true);
      setImportStatus({
        status: 'success',
        message: `✅ Данные доступны: ${currentDatabase.rowCount} строк (${currentDatabase.name})`,
        rows: currentDatabase.rowCount,
        type: currentDatabase.name
      });
    }
  }, [currentDatabase]);

  // Выполнение SQL запроса
  const executeSQL = useCallback(async (query: string, checkFileImported = true) => {
    console.log('executeSQL вызван:', { query, checkFileImported, fileImported });
    
    if (checkFileImported && !fileImported) {
      console.log('executeSQL: блокировка из-за !fileImported');
      throw new Error('Сначала загрузите файл данных');
    }

    setIsLoading(true);
    
    try {
      console.log('Выполняем SQL запрос:', query);
      const result = await duckDBService.executeSQLQuery(query);
      console.log('Получен результат от сервиса:', result);
      
      // Преобразуем результат в формат для ag-Grid
      const tbl = tableFromIPC(new Uint8Array(result.data));
      const data = tbl.toArray();
      console.log('Данные преобразованы для ag-Grid:', data);
      
      setImportStatus({
        status: 'success',
        message: `🔍 ${result.message} (${data.length} строк)`
      });

      if (data.length > 0) {
        // Создаем определения колонок для ag-Grid
        const columns: ColumnDef[] = Object.keys(data[0]).map(field => ({
          field: field,
          sortable: true,
          filter: true,
          resizable: true
        }));

        // Обновляем данные используя функциональный setState
        setAnalyticsData(prev => {
          // Обновляем настройки визуализации если они пустые
          const newVizSettings = { ...prev.vizSettings };
          if (!newVizSettings.xField || !newVizSettings.yField) {
            const firstRow = data[0];
            const stringFields = Object.keys(firstRow).filter(f => typeof firstRow[f] === 'string');
            const numberFields = Object.keys(firstRow).filter(f => typeof firstRow[f] === 'number');
            
            newVizSettings.xField = stringFields[0] || Object.keys(firstRow)[0] || '';
            newVizSettings.yField = numberFields[0] || Object.keys(firstRow)[1] || Object.keys(firstRow)[0] || '';
          }

          return {
            gridData: data,
            columnDefs: columns,
            vizSettings: newVizSettings
          };
        });
      } else {
        setAnalyticsData(prev => ({
          ...prev,
          gridData: [],
          columnDefs: []
        }));
      }
      
    } catch (error) {
      console.error('SQL execution error:', error);
      setImportStatus({
        status: 'error',
        message: `❌ Ошибка запроса: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [fileImported, duckDBService]);

  // Обработчик загрузки файла
  const handleFileUpload = useCallback(async (file: File) => {
    console.log('handleFileUpload вызван для файла:', file.name);
    setIsLoading(true);
    setImportStatus({ status: 'loading', message: 'Загрузка файла...' });

    try {
      const buffer = await file.arrayBuffer();
      const result = await duckDBService.importFile(buffer, file.name);
      
      setImportStatus({
        status: 'success',
        message: `✅ ${result.message}`,
        rows: result.rows,
        type: result.type
      });
      
      console.log('Файл успешно загружен, устанавливаем fileImported = true');
      setFileImported(true);
      
      // Выполняем запрос для получения данных и обновления информации о базе
      setTimeout(async () => {
        try {
          await executeSQL('SELECT * FROM t LIMIT 20', false);
        } catch (error) {
          console.error('Ошибка при выполнении запроса после загрузки:', error);
        }
      }, 200);

      // Возвращаем результат с информацией о количестве строк
      return result;

    } catch (error) {
      console.error('Ошибка загрузки файла:', error);
      setImportStatus({
        status: 'error',
        message: `❌ Ошибка загрузки: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
      });
      setFileImported(false);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [duckDBService, executeSQL]);

  // Автоматически выполняем запрос после импорта файла или восстановления базы данных
  useEffect(() => {
    if (fileImported && currentDatabase) {
      console.log('useAnalytics: выполняем запрос для текущей базы данных:', currentDatabase.name);
      executeSQL('SELECT * FROM t LIMIT 20', false).catch(console.error);
    }
  }, [fileImported, executeSQL, currentDatabase]);

  // Обновление настроек визуализации
  const updateVizSettings = useCallback((settings: Partial<VizSettings>) => {
    setAnalyticsData(prev => ({
      ...prev,
      vizSettings: { ...prev.vizSettings, ...settings }
    }));
  }, []);

  // Быстрые запросы
  const executeQuickQuery = useCallback(async (query: string) => {
    setSqlQuery(query);
    await executeSQL(query);
  }, [executeSQL]);

  // Обработка восстановленных данных из локального хранилища
  useEffect(() => {
    console.log('useAnalytics: подписываемся на сообщения от worker');
    
    const handleWorkerMessage = (data: any) => {
      console.log('useAnalytics: получено сообщение от worker:', data);
      
      // Обработка восстановления множественных баз данных
      if (data.restored && data.databases && Array.isArray(data.databases) && data.databases.length > 0 && !fileImported) {
        console.log('useAnalytics: получено сообщение о восстановлении множественных баз данных:', data.databases.length);
        setFileImported(true);
        setImportStatus({
          status: 'success',
          message: `✅ Восстановлено ${data.databases.length} баз данных из локального хранилища`,
          rows: data.databases.reduce((total: number, db: any) => total + (db.rowCount || 0), 0),
          type: 'Восстановленные базы данных'
        });
        console.log('useAnalytics: fileImported установлен в true для множественных баз данных');
      }
      
      // Обработка импорта новой базы данных
      if (data.imported && data.databaseInfo && !fileImported) {
        console.log('useAnalytics: получено сообщение об импорте новой базы данных:', data.databaseInfo);
        setFileImported(true);
        setImportStatus({
          status: 'success',
          message: `✅ Импортирована база данных: ${data.databaseInfo.name} (${data.rows} строк)`,
          rows: data.rows,
          type: data.type
        });
        console.log('useAnalytics: fileImported установлен в true для новой базы данных');
      }
    };
    
    // Подписываемся на сообщения от worker
    duckDBService.on('message', handleWorkerMessage);
    console.log('useAnalytics: подписка на сообщения установлена');
    
    // Очистка при размонтировании
    return () => {
      console.log('useAnalytics: отписываемся от сообщений worker');
      duckDBService.off('message', handleWorkerMessage);
    };
  }, [duckDBService, fileImported]);

  // Экспорт в Excel
  const exportToExcel = useCallback(async (sql?: string, fileName?: string) => {
    const exportSQL = sql || sqlQuery;
    const exportFileName = fileName || 'export';
    
    if (!fileImported) {
      throw new Error('Сначала загрузите файл данных');
    }

    setIsLoading(true);
    
    try {
      console.log('Экспорт в Excel:', { exportSQL, exportFileName });
      const excelBuffer = await duckDBService.exportToExcel(exportSQL, exportFileName);
      
      // Создаем blob и скачиваем файл
      const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${exportFileName}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setImportStatus({
        status: 'success',
        message: `📊 Excel файл скачан: ${exportFileName}.xlsx`
      });
      
    } catch (error) {
      console.error('Export error:', error);
      setImportStatus({
        status: 'error',
        message: `❌ Ошибка экспорта: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [fileImported, duckDBService, sqlQuery]);

  return {
    // Данные
    analyticsData,
    sqlQuery,
    setSqlQuery,
    isLoading,
    fileImported,
    importStatus,
    
    // Методы
    handleFileUpload,
    executeSQL,
    executeQuickQuery,
    updateVizSettings,
    exportToExcel,
  };
}; 