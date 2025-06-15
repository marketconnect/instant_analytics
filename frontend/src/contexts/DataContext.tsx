import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getDuckDBService } from '../services/duckdb-service';

export interface DatabaseInfo {
  id: string;
  name: string;
  fileName: string;
  tableName: string;
  uploadDate: Date;
  rowCount: number;
  columns: string[];
}

export interface QueryResult {
  columns: string[];
  data: any[];
  query: string;
  executionTime: number;
}

export interface FileMetadata {
  rowCount: number;
  columns: string[];
  sampleData?: any[];
}

interface DataContextType {
  // Загруженные базы данных
  databases: DatabaseInfo[];
  currentDatabase: DatabaseInfo | null;
  
  // Результаты запросов
  queryResults: QueryResult | null;
  isLoading: boolean;
  error: string | null;
  
  // Методы
  addDatabase: (file: File, metadata: FileMetadata) => Promise<void>;
  removeDatabase: (databaseId: string) => void;
  selectDatabase: (databaseId: string) => void;
  setQueryResults: (results: QueryResult) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearData: () => void;
  
  // Экспорт
  exportData: (format: 'csv' | 'excel' | 'parquet' | 'json', data?: any[]) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

interface DataProviderProps {
  children: React.ReactNode;
}

export const DataProvider: React.FC<DataProviderProps> = ({ children }) => {
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [currentDatabase, setCurrentDatabase] = useState<DatabaseInfo | null>(null);
  const [queryResults, setQueryResults] = useState<QueryResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Загружаем список баз данных из localStorage при инициализации
  useEffect(() => {
    const savedDatabases = localStorage.getItem('databases');
    const savedCurrentDatabaseId = localStorage.getItem('currentDatabaseId');
    
    if (savedDatabases) {
      try {
        const parsedDatabases = JSON.parse(savedDatabases).map((db: any) => ({
          ...db,
          uploadDate: new Date(db.uploadDate) // Восстанавливаем Date объект
        }));
        console.log('DataContext: загружен список баз данных из localStorage:', parsedDatabases.length);
        setDatabases(parsedDatabases);
        
        // Восстанавливаем текущую базу данных
        if (savedCurrentDatabaseId && parsedDatabases.length > 0) {
          const currentDb = parsedDatabases.find((db: DatabaseInfo) => db.id === savedCurrentDatabaseId);
          if (currentDb) {
            setCurrentDatabase(currentDb);
            console.log('DataContext: восстановлена текущая база данных:', currentDb.name);
          } else {
            // Если сохраненная база не найдена, выбираем первую
            setCurrentDatabase(parsedDatabases[0]);
          }
        }
        
        // Уведомляем worker о восстановленных базах данных
        const duckDBService = getDuckDBService();
        setTimeout(() => {
          console.log('DataContext: уведомляем worker о восстановленных базах данных');
          duckDBService.sendCommand({
            action: 'restoreDatabases',
            databases: parsedDatabases,
            currentDatabaseId: savedCurrentDatabaseId || (parsedDatabases.length > 0 ? parsedDatabases[0].id : null)
          });
        }, 1000); // Даем время worker'у инициализироваться
        
      } catch (error) {
        console.error('Ошибка при загрузке списка баз данных:', error);
        localStorage.removeItem('databases');
        localStorage.removeItem('currentDatabaseId');
      }
    }
  }, []);

  // Сохраняем список баз данных в localStorage при изменении
  useEffect(() => {
    if (databases.length > 0) {
      localStorage.setItem('databases', JSON.stringify(databases));
      console.log('DataContext: сохранен список баз данных в localStorage:', databases.length);
    }
  }, [databases]);

  // Сохраняем текущую базу данных в localStorage при изменении
  useEffect(() => {
    if (currentDatabase) {
      localStorage.setItem('currentDatabaseId', currentDatabase.id);
      console.log('DataContext: сохранена текущая база данных в localStorage:', currentDatabase.name);
    }
  }, [currentDatabase]);

  // Обработка сообщений от DuckDB worker о восстановлении данных
  useEffect(() => {
    const duckDBService = getDuckDBService();
    
    const handleWorkerMessage = (data: any) => {
      console.log('DataContext: получено сообщение от worker:', data);
      
      // Обработка восстановления множественных баз данных
      if (data.restored && data.databases && Array.isArray(data.databases)) {
        console.log('DataContext: получено сообщение о восстановлении множественных баз данных:', data.databases.length);
        
        // Проверяем, есть ли уже базы данных в списке
        setDatabases(prev => {
          // Если уже есть базы данных, не перезаписываем их
          if (prev.length > 0) {
            console.log('DataContext: пропускаем восстановление, так как уже есть базы данных');
            return prev;
          }
          
          // Преобразуем данные из worker'а в формат DatabaseInfo
          const restoredDatabases: DatabaseInfo[] = data.databases.map((db: any) => ({
            id: db.id,
            name: db.name,
            fileName: db.fileName,
            tableName: db.tableName || '',
            uploadDate: new Date(db.uploadDate),
            rowCount: db.rowCount,
            columns: db.columns || []
          }));
          
          console.log('DataContext: восстановлены базы данных:', restoredDatabases.length);
          
          // Устанавливаем текущую базу данных
          if (data.currentDatabaseId && restoredDatabases.length > 0) {
            const currentDb = restoredDatabases.find(db => db.id === data.currentDatabaseId);
            if (currentDb) {
              setCurrentDatabase(currentDb);
              console.log('DataContext: установлена текущая база данных:', currentDb.name);
            }
          }
          
          return restoredDatabases;
        });
      }
      
      // Обработка импорта новой базы данных
      if (data.imported && data.databaseInfo) {
        console.log('DataContext: получено сообщение об импорте новой базы данных:', data.databaseInfo);
        
        const newDatabase: DatabaseInfo = {
          id: data.databaseInfo.id,
          name: data.databaseInfo.name,
          fileName: data.databaseInfo.fileName,
          uploadDate: new Date(data.databaseInfo.uploadDate),
          rowCount: data.databaseInfo.rowCount,
          columns: data.databaseInfo.columns || [],
          tableName: data.databaseInfo.tableName || ''
        };
        
        setDatabases(prev => [...prev, newDatabase]);
        setCurrentDatabase(newDatabase);
        console.log('DataContext: добавлена новая база данных:', newDatabase.name);
      }
      
      // Обработка переключения базы данных
      if (data.databaseSwitched && data.databaseInfo) {
        console.log('DataContext: получено сообщение о переключении базы данных:', data.databaseInfo);
        
        const switchedDatabase: DatabaseInfo = {
          id: data.databaseInfo.id,
          name: data.databaseInfo.name,
          fileName: data.databaseInfo.fileName,
          uploadDate: new Date(data.databaseInfo.uploadDate),
          rowCount: data.databaseInfo.rowCount,
          columns: data.databaseInfo.columns || [],
          tableName: data.databaseInfo.tableName || ''
        };
        
        setCurrentDatabase(switchedDatabase);
        console.log('DataContext: переключена база данных:', switchedDatabase.name);
      }
      
      // Обработка обновления tableName в localStorage
      if (data.updateLocalStorage && data.databaseId && data.tableName) {
        console.log('DataContext: обновляем tableName в localStorage для базы:', data.databaseId, 'новый tableName:', data.tableName);
        
        setDatabases(prev => {
          const updated = prev.map(db => {
            if (db.id === data.databaseId) {
              return { ...db, tableName: data.tableName };
            }
            return db;
          });
          
          // Сохраняем обновленные данные в localStorage
          localStorage.setItem('databases', JSON.stringify(updated));
          console.log('DataContext: tableName обновлен в localStorage');
          
          return updated;
        });
        
        // Обновляем текущую базу данных если это она
        if (currentDatabase?.id === data.databaseId) {
          setCurrentDatabase(prev => prev ? { ...prev, tableName: data.tableName } : null);
        }
      }
    };
    
    // Подписываемся на сообщения от worker
    duckDBService.on('message', handleWorkerMessage);
    
    // Очистка при размонтировании
    return () => {
      duckDBService.off('message', handleWorkerMessage);
    };
  }, []);

  const addDatabase = useCallback(async (file: File, metadata: FileMetadata) => {
    // Добавляем timestamp к имени файла
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    const baseName = file.name.replace(/\.[^/.]+$/, ""); // убираем расширение
    
    const newDatabase: DatabaseInfo = {
      id: `db_${timestamp}`,
      name: `${baseName} (${new Date().toLocaleString()})`,
      fileName: file.name,
      uploadDate: new Date(),
      rowCount: metadata.rowCount,
      columns: metadata.columns,
      tableName: ''
    };

    console.log('DataContext: добавляем базу данных:', {
      name: newDatabase.name,
      rowCount: newDatabase.rowCount,
      columnsCount: newDatabase.columns.length,
      columns: newDatabase.columns.slice(0, 5) // показываем первые 5 колонок
    });

    setDatabases(prev => [...prev, newDatabase]);
    setCurrentDatabase(newDatabase);
    
    // Сохраняем данные в sessionStorage для текущей сессии
    sessionStorage.setItem(`database_${newDatabase.id}`, JSON.stringify(metadata.sampleData || []));
    
    return Promise.resolve();
  }, []);

  const removeDatabase = useCallback((databaseId: string) => {
    setDatabases(prev => {
      const filtered = prev.filter(db => db.id !== databaseId);
      console.log('DataContext: удалена база данных:', databaseId);
      
      // Если удаляемая база была текущей, выбираем другую
      if (currentDatabase?.id === databaseId) {
        const newCurrent = filtered.length > 0 ? filtered[0] : null;
        setCurrentDatabase(newCurrent);
        if (newCurrent) {
          console.log('DataContext: выбрана новая текущая база данных:', newCurrent.name);
        }
      }
      
      return filtered;
    });
    
    // Удаляем данные из sessionStorage
    sessionStorage.removeItem(`database_${databaseId}`);
  }, [currentDatabase]);

  const selectDatabase = useCallback((databaseId: string) => {
    const database = databases.find(db => db.id === databaseId);
    if (database) {
      console.log('DataContext: переключение на базу данных:', database.name);
      
      // Отправляем команду переключения в worker
      const duckDBService = getDuckDBService();
      duckDBService.sendCommand({
        action: 'switchDatabase',
        databaseId: databaseId
      });
      
      // Локально обновляем состояние (worker подтвердит переключение)
      setCurrentDatabase(database);
      
      // Очищаем предыдущие результаты при смене БД
      setQueryResults(null);
      setError(null);
    }
  }, [databases]);

  const setQueryResultsCallback = useCallback((results: QueryResult) => {
    setQueryResults(results);
    setError(null);
  }, []);

  const setLoadingCallback = useCallback((loading: boolean) => {
    setIsLoading(loading);
  }, []);

  const setErrorCallback = useCallback((error: string | null) => {
    setError(error);
  }, []);

  const clearData = useCallback(() => {
    setDatabases([]);
    setCurrentDatabase(null);
    setQueryResults(null);
    setError(null);
    setIsLoading(false);
    
    // Очищаем localStorage
    localStorage.removeItem('databases');
    localStorage.removeItem('currentDatabaseId');
    
    // Очищаем sessionStorage
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith('database_')) {
        sessionStorage.removeItem(key);
      }
    });
  }, []);

  const exportData = useCallback(async (format: 'csv' | 'excel' | 'parquet' | 'json', data?: any[]) => {
    const dataToExport = data || queryResults?.data || [];
    
    if (dataToExport.length === 0) {
      alert('Нет данных для экспорта');
      return;
    }

    const fileName = `export_${new Date().toISOString().split('T')[0]}`;

    try {
      switch (format) {
        case 'csv':
          await exportToCsv(dataToExport, `${fileName}.csv`);
          break;
        case 'excel':
          await exportToExcel(dataToExport, `${fileName}.xlsx`);
          break;
        case 'parquet':
          await exportToParquet(dataToExport, fileName);
          break;
        case 'json':
          await exportToJson(dataToExport, `${fileName}.json`);
          break;
      }
    } catch (error) {
      console.error(`Ошибка экспорта ${format}:`, error);
      alert(`Ошибка экспорта: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    }
  }, [queryResults]);

  const exportToCsv = async (data: any[], filename: string) => {
    if (data.length === 0) return;
    
    console.log('Экспорт в CSV через DuckDB...');
    
    // Используем DuckDB сервис для экспорта в CSV
    const duckDBService = getDuckDBService();
    
    // Создаем SQL запрос для экспорта текущих данных
    const sql = 'SELECT * FROM t';
    const csvBuffer = await duckDBService.exportToCsv(sql, filename.replace('.csv', ''));
    
    // Скачиваем файл
    downloadBinaryFile(csvBuffer, filename, 'text/csv');
    
    console.log('CSV файл успешно экспортирован через DuckDB');
  };

  const exportToExcel = async (data: any[], filename: string) => {
    if (data.length === 0) return;
    
    console.log('Экспорт в Excel через DuckDB...');
    
    // Используем DuckDB сервис для экспорта в Excel
    const duckDBService = getDuckDBService();
    
    // Создаем SQL запрос для экспорта текущих данных
    const sql = 'SELECT * FROM t';
    const excelBuffer = await duckDBService.exportToExcel(sql, filename.replace('.xlsx', ''));
    
    // Скачиваем файл
    downloadBinaryFile(excelBuffer, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    console.log('Excel файл успешно экспортирован через DuckDB');
  };

  const exportToParquet = async (data: any[], fileName: string) => {
    if (data.length === 0) return;
    
    console.log('Экспорт в Parquet через DuckDB...');
    
    // Используем DuckDB сервис для экспорта
    const duckDBService = getDuckDBService();
    
    // Создаем SQL запрос для экспорта текущих данных
    const sql = 'SELECT * FROM t';
    const parquetBuffer = await duckDBService.exportToParquet(sql, fileName);
    
    // Скачиваем файл
    downloadBinaryFile(parquetBuffer, `${fileName}.parquet`, 'application/octet-stream');
    
    console.log('Parquet файл успешно экспортирован через DuckDB');
  };

  const exportToJson = async (data: any[], filename: string) => {
    if (data.length === 0) return;
    
    console.log('Экспорт в JSON через DuckDB...');
    
    // Используем DuckDB сервис для экспорта в JSON
    const duckDBService = getDuckDBService();
    
    // Создаем SQL запрос для экспорта текущих данных
    const sql = 'SELECT * FROM t';
    const jsonBuffer = await duckDBService.exportToJson(sql, filename.replace('.json', ''));
    
    // Скачиваем файл
    downloadBinaryFile(jsonBuffer, filename, 'application/json');
    
    console.log('JSON файл успешно экспортирован через DuckDB');
  };

  const downloadBinaryFile = (data: Uint8Array, filename: string, mimeType: string) => {
    const blob = new Blob([data], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const value: DataContextType = {
    databases,
    currentDatabase,
    queryResults,
    isLoading,
    error,
    addDatabase,
    removeDatabase,
    selectDatabase,
    setQueryResults: setQueryResultsCallback,
    setLoading: setLoadingCallback,
    setError: setErrorCallback,
    clearData,
    exportData
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = (): DataContextType => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}; 