import type { SQLQueryResult, ImportStatus } from '../types/analytics';

class DuckDBService {
  private worker: Worker;
  private listeners: Map<string, ((data: any) => void)[]> = new Map();

  constructor() {
    this.worker = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
    this.setupWorkerListeners();
  }

  private setupWorkerListeners() {
    this.worker.onmessage = (e) => {
      console.log('DuckDBService получил сообщение от worker:', e.data);
      
      // Вызываем все listeners для события 'message'
      const messageListeners = this.listeners.get('message') || [];
      messageListeners.forEach(callback => callback(e.data));
    };

    this.worker.onerror = (error) => {
      console.error('Worker error:', error);
      const errorListeners = this.listeners.get('error') || [];
      errorListeners.forEach(callback => callback(error));
    };
  }

  // Подписка на события
  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback?: (data: any) => void) {
    if (callback) {
      // Удаляем конкретный callback
      const callbacks = this.listeners.get(event) || [];
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    } else {
      // Удаляем все callbacks для события
      this.listeners.delete(event);
    }
  }

  // Импорт файла
  importFile(fileData: ArrayBuffer, fileName: string): Promise<ImportStatus> {
    return new Promise((resolve, reject) => {
      const messageHandler = (data: any) => {
        console.log('Import messageHandler получил:', data);
        if (data.error) {
          this.off('message', messageHandler);
          reject(new Error(data.error));
        } else if (data.imported) {
          this.off('message', messageHandler);
          resolve({
            status: 'success',
            message: `Импортировано ${data.rows} строк`,
            rows: data.rows,
            type: data.type
          });
        }
      };

      this.on('message', messageHandler);
      
      this.worker.postMessage({ 
        fileData, 
        fileName 
      }, { transfer: [fileData] });
    });
  }

  // Выполнение SQL запроса
  executeSQLQuery(sql: string): Promise<SQLQueryResult> {
    return new Promise((resolve, reject) => {
      const messageHandler = (data: any) => {
        console.log('SQL messageHandler получил:', data);
        if (data.error) {
          this.off('message', messageHandler);
          reject(new Error(data.error));
        } else if (data.result) {
          this.off('message', messageHandler);
          resolve({
            data: data.result,
            rowCount: data.rowCount || 0,
            message: data.message || 'Запрос выполнен успешно'
          });
        }
      };

      this.on('message', messageHandler);
      this.worker.postMessage({ sql });
    });
  }

  // Экспорт в Excel через встроенную поддержку DuckDB
  exportToExcel(sql: string, fileName: string = 'export.xlsx'): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const messageHandler = (responseData: any) => {
        console.log('Excel export messageHandler получил:', responseData);
        if (responseData.excelExportError) {
          this.off('message', messageHandler);
          reject(new Error(responseData.excelExportError));
        } else if (responseData.excelExported) {
          this.off('message', messageHandler);
          resolve(new Uint8Array(responseData.data));
        }
      };

      this.on('message', messageHandler);
      this.worker.postMessage({ 
        exportExcel: { sql, fileName }
      });
    });
  }

  // Экспорт в Parquet через DuckDB
  exportToParquet(sql: string, fileName: string): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const messageHandler = (responseData: any) => {
        console.log('Parquet export messageHandler получил:', responseData);
        if (responseData.parquetExportError) {
          this.off('message', messageHandler);
          reject(new Error(responseData.parquetExportError));
        } else if (responseData.parquetExported) {
          this.off('message', messageHandler);
          resolve(new Uint8Array(responseData.data));
        }
      };

      this.on('message', messageHandler);
      this.worker.postMessage({ 
        exportParquet: { sql, fileName }
      });
    });
  }

  // Экспорт в CSV через DuckDB
  exportToCsv(sql: string, fileName: string): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const messageHandler = (responseData: any) => {
        console.log('CSV export messageHandler получил:', responseData);
        if (responseData.csvExportError) {
          this.off('message', messageHandler);
          reject(new Error(responseData.csvExportError));
        } else if (responseData.csvExported) {
          this.off('message', messageHandler);
          resolve(new Uint8Array(responseData.data));
        }
      };

      this.on('message', messageHandler);
      this.worker.postMessage({ 
        exportCsv: { sql, fileName }
      });
    });
  }

  // Экспорт в JSON через DuckDB
  exportToJson(sql: string, fileName: string): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const messageHandler = (responseData: any) => {
        console.log('JSON export messageHandler получил:', responseData);
        if (responseData.jsonExportError) {
          this.off('message', messageHandler);
          reject(new Error(responseData.jsonExportError));
        } else if (responseData.jsonExported) {
          this.off('message', messageHandler);
          resolve(new Uint8Array(responseData.data));
        }
      };

      this.on('message', messageHandler);
      this.worker.postMessage({ 
        exportJson: { sql, fileName }
      });
    });
  }

  // Очистка ресурсов
  destroy() {
    this.listeners.clear();
    this.worker.terminate();
  }
}

// Singleton instance
let duckDBService: DuckDBService | null = null;

export const getDuckDBService = (): DuckDBService => {
  if (!duckDBService) {
    duckDBService = new DuckDBService();
  }
  return duckDBService;
};

export const destroyDuckDBService = () => {
  if (duckDBService) {
    duckDBService.destroy();
    duckDBService = null;
  }
}; 