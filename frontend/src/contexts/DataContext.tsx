import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getDuckDBService } from '../services/duckdb-service';

export interface DatabaseInfo {
  id: string;
  name: string;
  fileName: string;
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

interface DataContextType {
  // Загруженные базы данных
  databases: DatabaseInfo[];
  currentDatabase: DatabaseInfo | null;
  
  // Результаты запросов
  queryResults: QueryResult | null;
  isLoading: boolean;
  error: string | null;
  
  // Методы
  addDatabase: (file: File, data: any[]) => Promise<void>;
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

  // Обработка сообщений от DuckDB worker о восстановлении данных
  useEffect(() => {
    const duckDBService = getDuckDBService();
    
    const handleWorkerMessage = (data: any) => {
      if (data.restored && data.rows > 0) {
        console.log('DataContext: получено сообщение о восстановлении данных:', data);
        
        // Создаем запись о восстановленной базе данных
        const restoredDatabase: DatabaseInfo = {
          id: 'restored_db',
          name: 'Восстановленная база данных',
          fileName: 'restored_data.db',
          uploadDate: new Date(),
          rowCount: data.rows,
          columns: [] // Колонки будут определены при первом запросе
        };
        
        setDatabases(prev => {
          // Проверяем, есть ли уже восстановленная база
          const existingIndex = prev.findIndex(db => db.id === 'restored_db');
          if (existingIndex >= 0) {
            // Обновляем существующую запись
            const updated = [...prev];
            updated[existingIndex] = restoredDatabase;
            return updated;
          } else {
            // Добавляем новую запись
            return [restoredDatabase, ...prev];
          }
        });
        
        setCurrentDatabase(restoredDatabase);
        console.log('DataContext: создана запись о восстановленной базе данных');
      }
    };
    
    // Подписываемся на сообщения от worker
    duckDBService.on('message', handleWorkerMessage);
    
    // Очистка при размонтировании
    return () => {
      duckDBService.off('message', handleWorkerMessage);
    };
  }, []);

  const addDatabase = useCallback(async (file: File, data: any[]) => {
    const columns = data.length > 0 ? Object.keys(data[0]) : [];
    const newDatabase: DatabaseInfo = {
      id: `db_${Date.now()}`,
      name: file.name.replace(/\.[^/.]+$/, ""), // убираем расширение
      fileName: file.name,
      uploadDate: new Date(),
      rowCount: data.length,
      columns
    };

    setDatabases(prev => [...prev, newDatabase]);
    setCurrentDatabase(newDatabase);
    
    // Сохраняем данные в sessionStorage для текущей сессии
    sessionStorage.setItem(`database_${newDatabase.id}`, JSON.stringify(data));
    
    return Promise.resolve();
  }, []);

  const selectDatabase = useCallback((databaseId: string) => {
    const database = databases.find(db => db.id === databaseId);
    if (database) {
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