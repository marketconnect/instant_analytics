console.log('Worker.ts начал загружаться');

import * as duckdb from '@duckdb/duckdb-wasm';
import { tableToIPC } from 'apache-arrow';
import * as XLSX from 'xlsx';
import { openDB, type IDBPDatabase } from 'idb';

console.log('Импорты загружены (включая SheetJS и idb), инициализируем DuckDB...');

// Используем локальные файлы вместо CDN
import mainWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import mainWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

const localBundle = {
  mainModule: mainWasm,
  mainWorker: mainWorker,
  pthreadWorker: null
};

console.log('Local bundle:', localBundle);

// === СИСТЕМА МНОЖЕСТВЕННЫХ БАЗ ДАННЫХ ===
interface DatabaseInfo {
  id: string;
  name: string;
  fileName: string;
  tableName: string;
  uploadDate: string;
  rowCount: number;
  columns: string[];
}

let idbConnection: IDBPDatabase | null = null;
let isDirty = false;
let autoSaveInterval: NodeJS.Timeout | null = null;
let databases: Map<string, DatabaseInfo> = new Map(); // Реестр всех баз данных
let currentDatabaseId: string | null = null; // Текущая активная база данных
let isInitialized = false; // Флаг инициализации
let messageQueue: any[] = []; // Очередь сообщений до инициализации

// Устанавливаем обработчик сообщений СРАЗУ, до инициализации
self.onmessage = (e: MessageEvent) => {
  console.log('Worker получил сообщение:', e.data);
  
  if (!isInitialized) {
    console.log('📬 Worker еще не инициализирован, добавляем сообщение в очередь');
    messageQueue.push(e);
    return;
  }
  
  handleMessage(e);
};

// ② создаём Worker + Logger
const dbWorker = new Worker(localBundle.mainWorker!, { type: 'module' });
console.log('DuckDB Worker создан');

const logger = new duckdb.ConsoleLogger();
const db = new duckdb.AsyncDuckDB(logger, dbWorker);
console.log('AsyncDuckDB создан');

// ③ инициализация wasm-модуля
console.log('Начинаем инициализацию WASM...');
await db.instantiate(localBundle.mainModule, localBundle.pthreadWorker);
console.log('WASM инициализирован, Worker готов к работе');

// 1. Инициализация IndexedDB
async function initPersistence() {
  console.log('Инициализация системы персистентности...');
  
  try {
    idbConnection = await openDB('ia-multi-db', 1, {
      upgrade(db) {
        console.log('Создание object stores для множественных баз данных');
        // Хранилище для метаданных баз данных
        db.createObjectStore('databases');
        // Хранилище для данных каждой базы данных
        db.createObjectStore('database_data');
      }
    });
    console.log('✅ IndexedDB инициализирован');
    
    // Загружаем все существующие базы данных
    await loadAllDatabases();
    
    // Запускаем автосохранение каждые 30 секунд
    startAutoSave();
    
  } catch (error) {
    console.error('❌ Ошибка инициализации персистентности:', error);
  }
}

// 2. Загрузка всех баз данных из IndexedDB
async function loadAllDatabases() {
  if (!idbConnection) return;
  
  try {
    console.log('🔍 Загрузка всех баз данных из IndexedDB...');
    
    // Загружаем метаданные всех баз данных
    const databaseKeys = await idbConnection.getAllKeys('databases');
    console.log(`📂 Найдено баз данных: ${databaseKeys.length}`);
    
    for (const key of databaseKeys) {
      const dbInfo = await idbConnection.get('databases', key) as DatabaseInfo;
      if (dbInfo) {
        databases.set(dbInfo.id, dbInfo);
        console.log(`📂 Загружена база данных: ${dbInfo.name} (${dbInfo.rowCount} строк)`);
        
        // Загружаем данные базы данных в DuckDB
        await loadDatabaseData(dbInfo.id);
      }
    }
    
    // Если есть базы данных, выбираем первую как текущую
    if (databases.size > 0) {
      const firstDb = Array.from(databases.values())[0];
      currentDatabaseId = firstDb.id;
      console.log(`📂 Установлена текущая база данных: ${firstDb.name}`);
      
      // Уведомляем основной поток о восстановленных базах данных
      self.postMessage({
        restored: true,
        databases: Array.from(databases.values()),
        currentDatabaseId: currentDatabaseId
      });
    }
    
  } catch (error) {
    console.error('❌ Ошибка загрузки баз данных:', error);
  }
}

// 3. Загрузка данных конкретной базы данных в DuckDB
async function loadDatabaseData(databaseId: string): Promise<boolean> {
  if (!idbConnection) return false;
  
  try {
    const dbData = await idbConnection.get('database_data', databaseId);
    if (!dbData) {
      console.log(`⚠️ Данные для базы ${databaseId} не найдены`);
      return false;
    }
    
    const dbInfo = databases.get(databaseId);
    if (!dbInfo) {
      console.log(`⚠️ Метаданные для базы ${databaseId} не найдены`);
      return false;
    }
    
    console.log(`🔄 Восстановление данных базы ${dbInfo.name} в таблицу ${dbInfo.tableName}...`);
    
    // Восстанавливаем данные из SQL дампа
    const decoder = new TextDecoder();
    const sqlContent = decoder.decode(dbData);
    
    console.log(`📄 Размер SQL дампа: ${sqlContent.length} символов`);
    console.log(`📄 Первые 200 символов SQL:`, sqlContent.substring(0, 200));
    console.log(`📄 Последние 200 символов SQL:`, sqlContent.substring(Math.max(0, sqlContent.length - 200)));
    
    const conn = await db.connect();
    try {
      // Улучшенный разбор SQL команд
      let sqlCommands: string[] = [];
      
      // Если SQL дамп не содержит точек с запятой, добавляем их
      let processedSQL = sqlContent;
      if (!sqlContent.includes(';')) {
        console.log('📄 SQL дамп не содержит точек с запятой, добавляем их');
        // Разбиваем по строкам и добавляем ; к командам CREATE и INSERT
        const lines = sqlContent.split('\n');
        const processedLines = lines.map(line => {
          const trimmedLine = line.trim();
          if (trimmedLine && !trimmedLine.startsWith('--') && 
              (trimmedLine.toUpperCase().startsWith('CREATE') || 
               trimmedLine.toUpperCase().startsWith('INSERT') ||
               trimmedLine.includes('VALUES'))) {
            return trimmedLine.endsWith(';') ? trimmedLine : trimmedLine + ';';
          }
          return line;
        });
        processedSQL = processedLines.join('\n');
        console.log(`📄 Обработанный SQL (первые 300 символов):`, processedSQL.substring(0, 300));
      }
      
      // Разбиваем по точкам с запятой
      sqlCommands = processedSQL
        .split(';')
        .map(cmd => cmd.trim())
        .filter(cmd => {
          if (!cmd) return false;
          // Убираем команды, состоящие только из комментариев
          const lines = cmd.split('\n').map(line => line.trim());
          const nonCommentLines = lines.filter(line => line && !line.startsWith('--'));
          return nonCommentLines.length > 0;
        });
      
      console.log(`📄 Найдено SQL команд: ${sqlCommands.length}`);
      
      if (sqlCommands.length > 0) {
        console.log(`📄 Первая команда:`, sqlCommands[0].substring(0, 200));
        if (sqlCommands.length > 1) {
          console.log(`📄 Вторая команда:`, sqlCommands[1].substring(0, 200));
        }
      }
      
      for (let i = 0; i < sqlCommands.length; i++) {
        const command = sqlCommands[i];
        if (command) {
          console.log(`📄 Выполняем команду ${i + 1}/${sqlCommands.length}:`, command.substring(0, 100) + '...');
          try {
            // Очищаем команду от комментариев
            const cleanCommand = command
              .split('\n')
              .map(line => line.trim())
              .filter(line => line && !line.startsWith('--'))
              .join('\n')
              .trim();
            
            if (cleanCommand) {
              await conn.query(cleanCommand);
              console.log(`✅ Команда ${i + 1} выполнена успешно`);
            }
          } catch (cmdError) {
            console.error(`❌ Ошибка выполнения команды ${i + 1}:`, cmdError);
            console.error(`❌ Команда:`, command);
          }
        }
      }
      
      // Проверяем, что таблица создана
      try {
        const checkRes = await conn.query(`SELECT COUNT(*) as count FROM "${dbInfo.tableName}"`);
        const count = checkRes.toArray()[0] as any;
        console.log(`✅ Таблица ${dbInfo.tableName} содержит ${count.count} строк`);
      } catch (checkError) {
        console.error(`❌ Ошибка проверки таблицы ${dbInfo.tableName}:`, checkError);
      }

      console.log(`✅ База данных ${dbInfo.name} восстановлена в таблицу ${dbInfo.tableName}`);
      return true;
      
    } finally {
      await conn.close();
    }
    
  } catch (error) {
    console.error(`❌ Ошибка загрузки данных базы ${databaseId}:`, error);
    return false;
  }
}

// 4. Сохранение базы данных в IndexedDB
async function saveDatabaseToIndexedDB(databaseId: string): Promise<boolean> {
  if (!idbConnection) return false;
  
  try {
    const dbInfo = databases.get(databaseId);
    if (!dbInfo) {
      console.log(`⚠️ База данных ${databaseId} не найдена для сохранения`);
      return false;
    }
    
    console.log(`💾 Сохранение базы данных ${dbInfo.name}...`);
    
    // Экспортируем данные таблицы в SQL дамп
    const sqlDump = await exportTableToSQL(dbInfo.tableName);
    if (!sqlDump) {
      console.log(`⚠️ Не удалось экспортировать таблицу ${dbInfo.tableName}`);
      return false;
    }
    
    // Сохраняем метаданные
    await idbConnection.put('databases', dbInfo, databaseId);
    
    // Сохраняем данные
    const encoder = new TextEncoder();
    const dbData = encoder.encode(sqlDump);
    await idbConnection.put('database_data', dbData, databaseId);
    
    console.log(`✅ База данных ${dbInfo.name} сохранена (${(dbData.length / 1024).toFixed(1)} KB)`);
    return true;
    
  } catch (error) {
    console.error(`❌ Ошибка сохранения базы данных ${databaseId}:`, error);
    return false;
  }
}

// 5. Экспорт таблицы в SQL дамп
async function exportTableToSQL(tableName: string): Promise<string | null> {
  try {
    const conn = await db.connect();
    
    // Получаем схему таблицы для DuckDB
    let schema = '';
    try {
      // Пытаемся получить информацию о колонках
      const columnsRes = await conn.query(`DESCRIBE "${tableName}"`);
      const columns = columnsRes.toArray();
      
      if (columns.length > 0) {
        const columnDefs = columns.map((col: any) => {
          return `"${col.column_name}" ${col.column_type}`;
        }).join(', ');
        
        schema = `CREATE TABLE "${tableName}" (${columnDefs})`;
      }
    } catch (e) {
      console.log(`⚠️ Не удалось получить схему таблицы ${tableName}, создаем базовую схему`);
      // Если не удалось получить схему, создаем базовую
      const sampleRes = await conn.query(`SELECT * FROM "${tableName}" LIMIT 1`);
      const sampleRows = sampleRes.toArray();
      if (sampleRows.length > 0) {
        const columnNames = Object.keys(sampleRows[0]);
        const columnDefs = columnNames.map(name => `"${name}" VARCHAR`).join(', ');
        schema = `CREATE TABLE "${tableName}" (${columnDefs})`;
      }
    }
    
    if (!schema) {
      console.log(`⚠️ Не удалось определить схему таблицы ${tableName}`);
      await conn.close();
      return null;
    }
    
    // Получаем данные
    const dataRes = await conn.query(`SELECT * FROM "${tableName}"`);
    const rows = dataRes.toArray();
    
    await conn.close();
    
    let sqlDump = `-- Table: ${tableName}\n`;
    sqlDump += `${schema};\n\n`;
    
    if (rows.length > 0) {
      const columns = Object.keys(rows[0]);
      sqlDump += `-- Data for table: ${tableName}\n`;
      sqlDump += `INSERT INTO "${tableName}" ("${columns.join('", "')}") VALUES\n`;
      
      const valueRows = rows.map(row => {
        const values = columns.map(col => {
          const val = row[col];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
          if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
          return String(val);
        });
        return `  (${values.join(', ')})`;
      });
      
      sqlDump += valueRows.join(',\n') + ';\n\n';
    }
    
    return sqlDump;
    
  } catch (error) {
    console.error(`❌ Ошибка экспорта таблицы ${tableName}:`, error);
    return null;
  }
}

// 6. Оценка размера и квоты
async function estimateStorageQuota() {
  try {
    const estimate = await navigator.storage.estimate();
    const quota = estimate.quota || 0;
    const usage = estimate.usage || 0;
    
    console.log(`📊 Storage quota: ${(quota / 1024 / 1024 / 1024).toFixed(2)} GB`);
    console.log(`📊 Storage usage: ${(usage / 1024 / 1024).toFixed(2)} MB`);
    
    // Получаем размер DuckDB базы
    let dbSizeMB = 0;
    try {
      const conn = await db.connect();
      const sizeRes = await conn.query(`
        SELECT count(*) AS rows,
               COALESCE(SUM(estimated_size), 0)/1024/1024 AS mb
        FROM duckdb_columns()
      `);
      const sizeData = sizeRes.toArray()[0] as any;
      dbSizeMB = sizeData?.mb || 0;
      await conn.close();
      
      console.log(`📊 DuckDB size: ${dbSizeMB.toFixed(2)} MB`);
    } catch (e) {
      console.log('📊 Не удалось оценить размер DuckDB:', e);
    }
    
    const availableGB = (quota - usage) / 1024 / 1024 / 1024;
    const needsOPFS = dbSizeMB > 500 || availableGB < 1; // > 500MB или < 1GB свободного места
    
    return {
      quota,
      usage,
      dbSizeMB,
      availableGB,
      needsOPFS
    };
  } catch (error) {
    console.error('❌ Ошибка оценки квоты:', error);
    return { quota: 0, usage: 0, dbSizeMB: 0, availableGB: 0, needsOPFS: true };
  }
}

// 7. Экспорт базы в Uint8Array
// Функция не используется, но может понадобиться в будущем
// async function exportDatabase(): Promise<Uint8Array | null> {

// 8. Сохранение в IndexedDB
// Функция не используется, но может понадобиться в будущем
// async function saveToIndexedDB(dbFile: Uint8Array): Promise<boolean> {

// 9. Сохранение в OPFS (fallback)
// Функция не используется, но может понадобиться в будущем
// async function saveToOPFS(dbFile: Uint8Array): Promise<boolean> {

// 10. Загрузка из IndexedDB
// Функция не используется, но может понадобиться в будущем
// async function loadFromIndexedDB(): Promise<Uint8Array | null> {

// 11. Загрузка из OPFS
// Функция не используется, но может понадобиться в будущем
// async function loadFromOPFS(): Promise<Uint8Array | null> {

// Функция для очистки поврежденных файлов из всех хранилищ
// Функция не используется, но может понадобиться в будущем
// async function clearCorruptedFiles() {

// 14. Автосохранение каждые 30 секунд
function startAutoSave() {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
  }
  
  autoSaveInterval = setInterval(async () => {
    if (isDirty && databases.size > 0) {
      await persistAllDatabases();
    }
  }, 30000); // 30 секунд
  
  console.log('🔄 Автосохранение запущено (интервал: 30 секунд)');
}

// 15. Принудительное сохранение перед выгрузкой
self.addEventListener('beforeunload', async () => {
  if (isDirty) {
    console.log('🔄 Принудительное сохранение перед выгрузкой...');
    await persistAllDatabases();
  }
});

// Инициализируем персистентность
await initPersistence();

// Устанавливаем флаг инициализации и обрабатываем очередь
isInitialized = true;
console.log('🚀 Worker полностью инициализирован, обрабатываем очередь сообщений');
processMessageQueue();

// 20. Обработка очереди сообщений после инициализации
function processMessageQueue() {
  console.log(`📬 Обрабатываем очередь сообщений: ${messageQueue.length} сообщений`);
  
  while (messageQueue.length > 0) {
    const message = messageQueue.shift();
    console.log('📬 Обрабатываем отложенное сообщение:', message);
    handleMessage(message);
  }
}

// 21. Обработчик сообщений
function handleMessage(e: any) {
  const data = e.data || e;
  console.log('Worker обрабатывает сообщение:', data);
  
  if (data instanceof ArrayBuffer) {
    console.log('Получен файл для импорта (старый формат), размер:', data.byteLength);
    importFile('data', new Uint8Array(data));
  } else if ('fileData' in data) {
    console.log(`Получен файл для импорта: ${data.fileName}, размер: ${data.fileData.byteLength}`);
    const fileName = data.fileName;
    importFileByName(fileName, new Uint8Array(data.fileData));
  } else if ('exportParquet' in data) {
    console.log('Получена команда экспорта в Parquet:', data.exportParquet.fileName);
    exportToParquet(data.exportParquet.sql, data.exportParquet.fileName);
  } else if ('exportExcel' in data) {
    console.log('Получена команда экспорта в Excel:', data.exportExcel.fileName);
    exportToExcel(data.exportExcel.sql, data.exportExcel.fileName);
  } else if ('exportCsv' in data) {
    console.log('Получена команда экспорта в CSV:', data.exportCsv.fileName);
    exportToCsv(data.exportCsv.sql, data.exportCsv.fileName);
  } else if ('exportJson' in data) {
    console.log('Получена команда экспорта в JSON:', data.exportJson.fileName);
    exportToJson(data.exportJson.sql, data.exportJson.fileName);
  } else if ('action' in data) {
    // Обработка команд персистентности и управления базами данных
    if (data.action === 'save') {
      console.log('Получена команда ручного сохранения');
      persistAllDatabases();
    } else if (data.action === 'getStorageInfo') {
      console.log('Получена команда получения информации о хранилище');
      estimateStorageQuota().then(info => {
        self.postMessage({ storageInfo: info });
      });
    } else if (data.action === 'switchDatabase' && 'databaseId' in data) {
      console.log('Получена команда переключения базы данных:', data.databaseId);
      switchToDatabase(data.databaseId as string);
    } else if (data.action === 'getDatabases') {
      console.log('Получена команда получения списка баз данных');
      self.postMessage({
        databases: Array.from(databases.values()),
        currentDatabaseId: currentDatabaseId
      });
    } else if (data.action === 'restoreDatabases' && 'databases' in data) {
      console.log('Получена команда восстановления баз данных из localStorage:', (data as any).databases.length);
      
      // Восстанавливаем базы данных из localStorage
      const restoredDatabases = (data as any).databases as DatabaseInfo[];
      const restoredCurrentDatabaseId = (data as any).currentDatabaseId as string | null;
      
      // Вызываем асинхронную функцию восстановления
      restoreDatabasesFromLocalStorage(restoredDatabases, restoredCurrentDatabaseId);
    }
  } else if (databases.size > 0 && 'sql' in data) {
    console.log('Выполняем SQL:', data.sql);
    runSQL(data.sql);
  }
}

async function importFileByName(fileName: string, buf: Uint8Array) {
  console.log(`Начинаем импорт файла: ${fileName}, размер: ${buf.length} байт`);
  
  try {
    const lowerName = fileName.toLowerCase();
    
    if (lowerName.endsWith('.xlsx')) {
      console.log('Определен формат по расширению: Excel (.xlsx)');
      await importExcel(fileName, buf);
    } else if (lowerName.endsWith('.parquet')) {
      console.log('Определен формат по расширению: Parquet');
      await importParquet(fileName, buf);
    } else if (lowerName.endsWith('.json')) {
      console.log('Определен формат по расширению: JSON');
      await importJson(fileName, buf);
    } else {
      console.log('Определен формат по расширению: CSV (по умолчанию)');
      await importCSV(fileName, buf);
    }
  } catch (error) {
    console.error('Ошибка при импорте файла:', error);
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
}

async function importFile(baseName: string, buf: Uint8Array) {
  console.log(`Начинаем импорт файла: ${baseName}, размер: ${buf.length} байт`);
  
  try {
    // Пробуем определить формат по магическим байтам
    const isParquet = buf.length > 4 && 
      buf[0] === 0x50 && buf[1] === 0x41 && buf[2] === 0x52 && buf[3] === 0x31; // "PAR1"
    
    if (isParquet) {
      console.log('Определен формат: Parquet');
      await importParquet(baseName + '.parquet', buf);
    } else {
      console.log('Определен формат: CSV (по умолчанию)');
      await importCSV(baseName + '.csv', buf);
    }
  } catch (error) {
    console.error('Ошибка при импорте файла:', error);
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
}

async function importCSV(name: string, buf: Uint8Array) {
  console.log(`Начинаем импорт CSV: ${name}, размер: ${buf.length} байт`);
  
  try {
    await db.registerFileBuffer(name, buf);
    console.log('CSV файл зарегистрирован в DuckDB');
    
    // Создаем уникальное имя таблицы
    const tableName = generateTableName(name);
    const databaseId = `db_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const conn = await db.connect();
    console.log('Подключение к БД создано');
    
    await conn.query(`
        CREATE TABLE "${tableName}" 
        AS SELECT * FROM read_csv_auto('${name}', header=true)
    `);
    console.log(`Таблица ${tableName} создана из CSV`);
    
    const rowsRes = await conn.query(`SELECT COUNT(*) AS cnt FROM "${tableName}"`);
    const rows = rowsRes.getChild(0)?.get(0) ?? 0;
    console.log(`Количество строк в CSV: ${rows}`);
    
    // Получаем информацию о колонках
    const columnsRes = await conn.query(`DESCRIBE "${tableName}"`);
    const columnsData = columnsRes.toArray();
    const columns = columnsData.map((col: any) => col.column_name);
    
    await conn.close();
    
    // Создаем запись в реестре баз данных
    const dbInfo: DatabaseInfo = {
      id: databaseId,
      name: name.replace(/\.[^/.]+$/, ""), // убираем расширение
      fileName: name,
      tableName: tableName,
      uploadDate: new Date().toISOString(),
      rowCount: rows,
      columns: columns
    };
    
    databases.set(databaseId, dbInfo);
    currentDatabaseId = databaseId;
    
    console.log(`✅ CSV импорт завершен: ${rows} строк в таблице ${tableName}`);
    
    // Уведомляем основной поток
    self.postMessage({ 
      imported: true, 
      rows, 
      type: 'CSV',
      databaseId: databaseId,
      databaseInfo: dbInfo
    });
    
    // Отмечаем, что данные изменились
    isDirty = true;
  } catch (error) {
    console.error('Ошибка при импорте CSV:', error);
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
}

async function importParquet(name: string, buf: Uint8Array) {
  console.log(`Начинаем импорт Parquet: ${name}, размер: ${buf.length} байт`);
  
  try {
    await db.registerFileBuffer(name, buf);
    console.log('Parquet файл зарегистрирован в DuckDB');
    
    // Создаем уникальное имя таблицы
    const tableName = generateTableName(name);
    const databaseId = `db_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const conn = await db.connect();
    console.log('Подключение к БД создано');
    
    await conn.query(`
        CREATE TABLE "${tableName}" AS
        SELECT * FROM '${name}'
    `);
    console.log(`Таблица ${tableName} создана из Parquet`);
    
    const rowsRes = await conn.query(`SELECT COUNT(*) AS cnt FROM "${tableName}"`);
    const rows = rowsRes.getChild(0)?.get(0) ?? 0;
    console.log(`Количество строк в Parquet: ${rows}`);
    
    // Получаем информацию о колонках
    const columnsRes = await conn.query(`DESCRIBE "${tableName}"`);
    const columnsData = columnsRes.toArray();
    const columns = columnsData.map((col: any) => col.column_name);
    
    await conn.close();
    
    // Создаем запись в реестре баз данных
    const dbInfo: DatabaseInfo = {
      id: databaseId,
      name: name.replace(/\.[^/.]+$/, ""), // убираем расширение
      fileName: name,
      tableName: tableName,
      uploadDate: new Date().toISOString(),
      rowCount: rows,
      columns: columns
    };
    
    databases.set(databaseId, dbInfo);
    currentDatabaseId = databaseId;
    
    console.log(`✅ Parquet импорт завершен: ${rows} строк в таблице ${tableName}`);
    
    // Уведомляем основной поток
    self.postMessage({ 
      imported: true, 
      rows, 
      type: 'Parquet',
      databaseId: databaseId,
      databaseInfo: dbInfo
    });

    // Отмечаем, что данные изменились
    isDirty = true;
  } catch (error) {
    console.error('Ошибка при импорте Parquet:', error);
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
}

async function importJson(name: string, buf: Uint8Array) {
  console.log(`Начинаем импорт JSON: ${name}, размер: ${buf.length} байт`);
  
  try {
    await db.registerFileBuffer(name, buf);
    console.log('JSON файл зарегистрирован в DuckDB');
    
    const conn = await db.connect();
    console.log('Подключение к БД создано');
    
    // Пробуем импортировать как JSON Lines (NDJSON) или как массив JSON
    try {
      await conn.query(`
        CREATE OR REPLACE TABLE t AS
        SELECT * FROM read_json_auto('${name}')
      `);
      console.log('Таблица создана из JSON через read_json_auto');
    } catch (autoError) {
      console.log('read_json_auto не сработал, пробуем как обычный JSON массив:', autoError);
      
      // Fallback: читаем как текст и парсим вручную
      const decoder = new TextDecoder();
      const jsonText = decoder.decode(buf);
      
      let jsonData;
      try {
        jsonData = JSON.parse(jsonText);
      } catch (parseError) {
        throw new Error(`Не удалось распарсить JSON файл: ${parseError}`);
      }
      
      // Если это не массив, оборачиваем в массив
      if (!Array.isArray(jsonData)) {
        jsonData = [jsonData];
      }
      
      if (jsonData.length === 0) {
        throw new Error('JSON файл не содержит данных');
      }
      
      // Получаем колонки из первого объекта
      const firstRow = jsonData[0];
      if (typeof firstRow !== 'object' || firstRow === null) {
        throw new Error('JSON должен содержать массив объектов');
      }
      
      const columns = Object.keys(firstRow);
      console.log('Колонки из JSON:', columns);
      
      // Создаем таблицу с VARCHAR колонками
      const columnDefs = columns.map(col => `"${col}" VARCHAR`).join(', ');
      await conn.query(`CREATE OR REPLACE TABLE t (${columnDefs})`);
      
      // Вставляем данные батчами
      const batchSize = 1000;
      for (let i = 0; i < jsonData.length; i += batchSize) {
        const batch = jsonData.slice(i, i + batchSize);
        
        const valueStrings = batch.map(row => {
          const values = columns.map(col => {
            const value = row[col];
            if (value === undefined || value === null) {
              return 'NULL';
            }
            if (typeof value === 'object') {
              return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
            }
            return `'${String(value).replace(/'/g, "''")}'`;
          });
          return `(${values.join(', ')})`;
        });
        
        if (valueStrings.length > 0) {
          const sql = `INSERT INTO t VALUES ${valueStrings.join(', ')}`;
          await conn.query(sql);
        }
      }
      
      console.log('JSON данные вставлены через fallback метод');
    }
    
    const rowsRes = await conn.query('SELECT COUNT(*) AS cnt FROM t');
    console.log('Подсчет строк выполнен:', rowsRes);
    
    const rows = rowsRes.getChild(0)?.get(0) ?? 0;
    console.log('Количество строк в JSON:', rows);
    
    // Отмечаем, что данные изменились
    isDirty = true;
  } catch (error) {
    console.error('Ошибка при импорте JSON:', error);
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
}

// Функция для создания уникальных заголовков колонок
function makeUniqueHeaders(rawHeaders: any[]): string[] {
  const headers: string[] = [];
  const headerCounts = new Map<string, number>();
  
  for (let i = 0; i < rawHeaders.length; i++) {
    // Очищаем заголовок - сохраняем латиницу, кириллицу, цифры и подчеркивания
    let cleanHeader = String(rawHeaders[i] || `column_${i + 1}`)
      .replace(/[^a-zA-Z0-9_а-яё]/gi, '_') || `column_${i + 1}`;
    
    // Убираем множественные подчеркивания и подчеркивания в начале/конце
    cleanHeader = cleanHeader
      .replace(/_+/g, '_')  // множественные _ → одиночный _
      .replace(/^_+|_+$/g, '') || `column_${i + 1}`; // убираем _ в начале/конце
    
    // Проверяем на дублирование
    if (headerCounts.has(cleanHeader)) {
      const count = headerCounts.get(cleanHeader)! + 1;
      headerCounts.set(cleanHeader, count);
      cleanHeader = `${cleanHeader}_${count}`;
    } else {
      headerCounts.set(cleanHeader, 1);
    }
    
    headers.push(cleanHeader);
  }
  
  return headers;
}

async function importExcel(name: string, buf: Uint8Array) {
  console.log(`Начинаем импорт Excel через SheetJS: ${name}, размер: ${buf.length} байт`);
  
  try {
    // Шаг 1: Читаем Excel файл через SheetJS
    console.log('1. Парсинг Excel файла через SheetJS...');
    const workbook = XLSX.read(buf, { type: 'array', cellText: false, cellDates: true });
    console.log('Excel файл успешно прочитан. Листы:', workbook.SheetNames);
    
    if (workbook.SheetNames.length === 0) {
      throw new Error('Excel файл не содержит листов');
    }
    
    // Создаем уникальное имя таблицы и ID базы данных
    const tableName = generateTableName(name);
    const databaseId = `db_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const conn = await db.connect();
    let totalRows = 0;
    let processedSheets = 0;
    let columns: string[] = [];
    
    // Шаг 2: Обрабатываем каждый лист
    for (const sheetName of workbook.SheetNames) {
      console.log(`2. Обрабатываем лист: "${sheetName}"`);
      
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;
      
      // Конвертируем лист в JSON с заголовками
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1,  // Получаем массив массивов
        raw: false, // Все значения как строки для безопасности
        defval: ''  // Пустые ячейки как пустые строки
      });
      
      if (jsonData.length === 0) {
        console.log(`Лист "${sheetName}" пуст, пропускаем`);
        continue;
      }
      
      // Первая строка - заголовки
      const rawHeaders = jsonData[0] as any[];
      const headers = makeUniqueHeaders(rawHeaders);
      const dataRows = jsonData.slice(1) as any[][];
      
      if (dataRows.length === 0) {
        console.log(`Лист "${sheetName}" содержит только заголовки, пропускаем`);
        continue;
      }
      
      console.log(`Лист "${sheetName}": ${headers.length} колонок, ${dataRows.length} строк данных`);
      
      // Шаг 3: Создаем таблицу (используем уникальное имя для первого листа)
      const currentTableName = processedSheets === 0 ? tableName : `sheet_${sheetName.replace(/[^a-zA-Z0-9]/g, '_')}`;
      
      // Создаем таблицу с VARCHAR колонками
      const columnDefs = headers.map(h => `"${h}" VARCHAR`).join(', ');
      await conn.query(`CREATE OR REPLACE TABLE "${currentTableName}" (${columnDefs})`);
      
      // Вставляем данные батчами по 1000 строк
      const batchSize = 1000;
      for (let i = 0; i < dataRows.length; i += batchSize) {
        const batch = dataRows.slice(i, i + batchSize);
        
        // Формируем VALUES для INSERT
        const valueStrings = batch.map(row => {
          const values = headers.map((_, idx) => {
            const value = row[idx];
            if (value === undefined || value === null || value === '') {
              return 'NULL';
            }
            return `'${String(value).replace(/'/g, "''")}'`;
          });
          return `(${values.join(', ')})`;
        });
        
        if (valueStrings.length > 0) {
          const sql = `INSERT INTO "${currentTableName}" VALUES ${valueStrings.join(', ')}`;
          await conn.query(sql);
        }
      }
      
      if (processedSheets === 0) {
        totalRows = dataRows.length;
        columns = headers; // Сохраняем колонки первого листа
      }
      
      console.log(`Вставлено ${dataRows.length} строк в таблицу ${currentTableName}`);
      processedSheets++;
    }
    
    await conn.close();
    
    if (totalRows === 0) {
      throw new Error('Excel файл не содержит данных для импорта');
    }
    
    // Создаем запись в реестре баз данных
    const dbInfo: DatabaseInfo = {
      id: databaseId,
      name: name.replace(/\.[^/.]+$/, ""), // убираем расширение
      fileName: name,
      tableName: tableName,
      uploadDate: new Date().toISOString(),
      rowCount: totalRows,
      columns: columns
    };
    
    databases.set(databaseId, dbInfo);
    currentDatabaseId = databaseId;
    
    console.log(`✅ Excel импорт завершен: ${totalRows} строк в таблице ${tableName}`);
    
    // Отмечаем, что данные изменились
    isDirty = true;
    
    const message = processedSheets === 1 
      ? `Excel файл успешно загружен. Обнаружено ${totalRows} строк данных.`
      : `Excel файл загружен: ${processedSheets} листов, ${totalRows} строк в основной таблице '${tableName}'. Используйте SHOW TABLES для просмотра всех таблиц.`;
    
    self.postMessage({ 
      imported: true, 
      rows: totalRows, 
      type: `Excel (.xlsx) - ${processedSheets} листов`,
      message: message,
      databaseId: databaseId,
      databaseInfo: dbInfo
    });
    
  } catch (error) {
    console.error('Ошибка при импорте Excel через SheetJS:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    self.postMessage({ 
      error: `Ошибка при обработке Excel файла: ${errorMessage}` 
    });
  }
}

// Функция для обработки SQL запроса - замена 't' на реальное имя таблицы
function processSQL(sql: string): string {
  if (!currentDatabaseId || !databases.has(currentDatabaseId)) {
    throw new Error('Нет активной базы данных. Загрузите файл данных.');
  }
  
  const currentDb = databases.get(currentDatabaseId)!;
  let processedSQL = sql.trim().replace(/;+$/, '');
  
  // Простая замена таблицы 't' на текущую таблицу
  // Используем регулярное выражение для замены 't' как отдельного слова
  processedSQL = processedSQL.replace(/\bt\b/g, `"${currentDb.tableName}"`);
  
  return processedSQL;
}

async function runSQL(sql: string) {
  console.log('Выполняем SQL запрос:', sql);
  
  try {
    // Проверяем, есть ли текущая база данных
    if (!currentDatabaseId || !databases.has(currentDatabaseId)) {
      throw new Error('Нет активной базы данных. Загрузите файл данных.');
    }
    
    const currentDb = databases.get(currentDatabaseId)!;
    console.log(`Выполняем запрос для базы данных: ${currentDb.name} (таблица: ${currentDb.tableName})`);
    
    const conn = await db.connect();
    console.log('Подключение для SQL создано');
    
    // Используем общую функцию для обработки SQL
    const processedSQL = processSQL(sql);
    
    console.log('Обработанный SQL:', processedSQL);
    
    const res = await conn.query(processedSQL);
    console.log('SQL выполнен, результат:', res);
    
    await conn.close();
    
    // Отмечаем данные как измененные для SQL команд модификации
    const modifyingCommands = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP'];
    if (modifyingCommands.some(cmd => processedSQL.toUpperCase().trim().startsWith(cmd))) {
      isDirty = true;
      console.log('📝 Данные помечены как измененные после SQL команды');
    }
    
    // Проверяем, что результат не пустой
    if (res.numRows === 0) {
      console.log('Запрос выполнен успешно, но результат пустой');
      self.postMessage({ 
        result: tableToIPC(res), 
        rowCount: 0,
        message: 'Запрос выполнен успешно, но результат пустой'
      }, { transfer: [tableToIPC(res).buffer] });
      return;
    }
    
    const ipc = tableToIPC(res);
    console.log('Результат сериализован в IPC, размер:', ipc.length, 'строк:', res.numRows);
    
    self.postMessage({ 
      result: ipc, 
      rowCount: res.numRows,
      message: `Запрос выполнен успешно. Получено ${res.numRows} строк.`
    }, { transfer: [ipc.buffer] });
    console.log('Результат отправлен в main thread');
  } catch (error) {
    console.error('Ошибка при выполнении SQL:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log('Отправляем ошибку:', errorMessage);
    self.postMessage({ 
      error: errorMessage,
      sql: sql 
    });
  }
}

// Функция экспорта в Parquet через DuckDB
async function exportToParquet(sql: string, fileName: string) {
  console.log(`Начинаем экспорт в Parquet: ${fileName}, SQL: ${sql}`);
  
  try {
    const conn = await db.connect();
    console.log('Подключение для экспорта в Parquet создано');
    
    const parquetFileName = `${fileName}.parquet`;
    
    // Обрабатываем SQL запрос (заменяем 't' на реальное имя таблицы)
    const cleanSQL = processSQL(sql);
    console.log('Обработанный SQL:', cleanSQL);
    
    // Проверяем количество строк напрямую из исходного запроса
    const testRes = await conn.query(cleanSQL);
    const rowCount = testRes.numRows;
    console.log(`Количество строк для экспорта: ${rowCount}`);
    
    if (rowCount === 0) {
      await conn.close();
      
      self.postMessage({ 
        parquetExportError: 'Нет данных для экспорта',
        fileName: fileName
      });
      return;
    }
    
    // Экспортируем в Parquet напрямую из SQL запроса (как Excel)
    console.log('Выполняем COPY в Parquet формат...');
    await conn.query(`COPY (${cleanSQL}) TO '${parquetFileName}' (FORMAT parquet)`);
      console.log('Parquet файл создан через DuckDB COPY');
      
    // Читаем созданный файл
        const parquetBuffer = await db.copyFileToBuffer(parquetFileName);
    console.log(`Parquet файл прочитан: ${parquetBuffer.length} байт`);
        
    // Удаляем временные файлы
        db.dropFile(parquetFileName);
        await conn.close();
        
    // Отправляем Parquet файл обратно
        self.postMessage({ 
          parquetExported: true,
          fileName: fileName,
          data: parquetBuffer,
      message: `Parquet файл создан успешно (${parquetBuffer.length} байт, ${rowCount} строк)`
        }, { transfer: [parquetBuffer.buffer] });
        
  } catch (error) {
    console.error('Ошибка экспорта в Parquet:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Если встроенный экспорт не работает, используем fallback
    console.log('Встроенный Parquet экспорт не поддерживается, используем fallback через JSON');
    
    // Fallback: получаем данные через SQL и создаем JSON
    try {
      const conn = await db.connect();
      const cleanSQL = processSQL(sql);
      const res = await conn.query(cleanSQL);
      await conn.close();
      
      const data = res.toArray();
      
      if (data.length === 0) {
        self.postMessage({ 
          parquetExportError: 'Нет данных для экспорта',
          fileName: fileName
        });
        return;
      }
      
      const headers = Object.keys(data[0]);
    const parquetStructure = {
      metadata: {
        version: '1.0',
        createdBy: 'instant-analytics-duckdb',
        numRows: data.length,
        format: 'parquet-json-fallback',
        note: 'This is a JSON representation of Parquet data. DuckDB Parquet export failed.',
        schema: headers.map(header => {
          const sampleValue = data.find(row => row[header] != null)?.[header];
          let type = 'string';
          
          if (typeof sampleValue === 'number') {
            type = Number.isInteger(sampleValue) ? 'int64' : 'double';
          } else if (typeof sampleValue === 'boolean') {
            type = 'boolean';
          } else if (sampleValue instanceof Date) {
            type = 'timestamp';
          }
          
          return { name: header, type };
        })
      },
      data: data
    };
    
    const jsonContent = JSON.stringify(parquetStructure, null, 2);
    const jsonBuffer = new TextEncoder().encode(jsonContent);
    
    console.log(`JSON fallback файл создан: ${jsonBuffer.length} байт`);
    
    // Отправляем JSON файл как fallback
    self.postMessage({ 
      parquetExported: true,
      fileName: fileName,
      data: jsonBuffer,
      message: `Parquet экспорт через JSON fallback (${jsonBuffer.length} байт)`
    }, { transfer: [jsonBuffer.buffer] });
      
    } catch (fallbackError) {
      console.error('Ошибка fallback экспорта в Parquet:', fallbackError);
      self.postMessage({ 
        parquetExportError: errorMessage,
        fileName: fileName
      });
    }
  }
}

// Функция экспорта в CSV через DuckDB
async function exportToCsv(sql: string, fileName: string) {
  console.log(`Начинаем экспорт в CSV: ${fileName}, SQL: ${sql}`);
  
  try {
    const conn = await db.connect();
    console.log('Подключение для экспорта в CSV создано');
    
    const csvFileName = `${fileName}.csv`;
    
    // Обрабатываем SQL запрос (заменяем 't' на реальное имя таблицы)
    const cleanSQL = processSQL(sql);
    console.log('Обработанный SQL:', cleanSQL);
    
    // Проверяем количество строк напрямую из исходного запроса
    const testRes = await conn.query(cleanSQL);
    const rowCount = testRes.numRows;
    console.log(`Количество строк для экспорта: ${rowCount}`);
    
    if (rowCount === 0) {
      await conn.close();
      
      self.postMessage({ 
        csvExportError: 'Нет данных для экспорта',
        fileName: fileName
      });
      return;
    }
    
    // Экспортируем в CSV напрямую из SQL запроса
    console.log('Выполняем COPY в CSV формат...');
    await conn.query(`COPY (${cleanSQL}) TO '${csvFileName}' (HEADER, DELIMITER ',')`);
    console.log('CSV файл создан через DuckDB COPY');
    
    // Читаем созданный файл
    const csvBuffer = await db.copyFileToBuffer(csvFileName);
    console.log(`CSV файл прочитан: ${csvBuffer.length} байт`);
    
    // Удаляем временные файлы
    db.dropFile(csvFileName);
    await conn.close();
    
    // Отправляем CSV файл обратно
    self.postMessage({ 
      csvExported: true,
      fileName: fileName,
      data: csvBuffer,
      message: `CSV файл создан успешно (${csvBuffer.length} байт, ${rowCount} строк)`
    }, { transfer: [csvBuffer.buffer] });
    
  } catch (error) {
    console.error('Ошибка экспорта в CSV:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    self.postMessage({ 
      csvExportError: errorMessage,
      fileName: fileName
    });
  }
}

// Функция экспорта в JSON через DuckDB
async function exportToJson(sql: string, fileName: string) {
  console.log(`Начинаем экспорт в JSON: ${fileName}, SQL: ${sql}`);
  
  try {
    const conn = await db.connect();
    console.log('Подключение для экспорта в JSON создано');
    
    const jsonFileName = `${fileName}.json`;
    
    // Обрабатываем SQL запрос (заменяем 't' на реальное имя таблицы)
    const cleanSQL = processSQL(sql);
    console.log('Обработанный SQL:', cleanSQL);
    
    // Проверяем количество строк напрямую из исходного запроса
    const testRes = await conn.query(cleanSQL);
    const rowCount = testRes.numRows;
    console.log(`Количество строк для экспорта: ${rowCount}`);
    
    if (rowCount === 0) {
      await conn.close();
      
      self.postMessage({ 
        jsonExportError: 'Нет данных для экспорта',
        fileName: fileName
      });
      return;
    }
    
    // Экспортируем в JSON напрямую из SQL запроса
    console.log('Выполняем COPY в JSON формат...');
    await conn.query(`COPY (${cleanSQL}) TO '${jsonFileName}' (ARRAY)`);
    console.log('JSON файл создан через DuckDB COPY');
    
    // Читаем созданный файл
    const jsonBuffer = await db.copyFileToBuffer(jsonFileName);
    console.log(`JSON файл прочитан: ${jsonBuffer.length} байт`);
    
    // Удаляем временные файлы
    db.dropFile(jsonFileName);
    await conn.close();
    
    // Отправляем JSON файл обратно
    self.postMessage({ 
      jsonExported: true,
      fileName: fileName,
      data: jsonBuffer,
      message: `JSON файл создан успешно (${jsonBuffer.length} байт, ${rowCount} строк)`
    }, { transfer: [jsonBuffer.buffer] });
    
  } catch (error) {
    console.error('Ошибка экспорта в JSON:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Fallback: получаем данные через SQL и создаем JSON
    console.log('Встроенный JSON экспорт не поддерживается, используем fallback');
    
    try {
      const conn = await db.connect();
      const cleanSQL = processSQL(sql);
      const res = await conn.query(cleanSQL);
      await conn.close();
      
      const data = res.toArray();
      
      if (data.length === 0) {
        self.postMessage({ 
          jsonExportError: 'Нет данных для экспорта',
          fileName: fileName
        });
        return;
      }
      
      const jsonContent = JSON.stringify(data, null, 2);
      const jsonBuffer = new TextEncoder().encode(jsonContent);
      
      console.log(`JSON fallback файл создан: ${jsonBuffer.length} байт`);
      
      // Отправляем JSON файл как fallback
      self.postMessage({ 
        jsonExported: true,
        fileName: fileName,
        data: jsonBuffer,
        message: `JSON файл создан через fallback (${jsonBuffer.length} байт)`
      }, { transfer: [jsonBuffer.buffer] });
      
    } catch (fallbackError) {
      console.error('Ошибка fallback экспорта в JSON:', fallbackError);
      self.postMessage({ 
        jsonExportError: errorMessage,
        fileName: fileName
      });
    }
  }
}

async function exportToExcel(sql: string, fileName: string) {
  console.log(`Начинаем экспорт в Excel: ${fileName}, SQL: ${sql}`);
  
  try {
    const conn = await db.connect();
    console.log('Подключение для экспорта в Excel создано');
    
    const excelFileName = `${fileName}.xlsx`;
    
    // Обрабатываем SQL запрос (заменяем 't' на реальное имя таблицы)
    const cleanSQL = processSQL(sql);
    console.log('Обработанный SQL:', cleanSQL);
    
    // Проверяем количество строк напрямую из исходного запроса
    const testRes = await conn.query(cleanSQL);
    const rowCount = testRes.numRows;
    console.log(`Количество строк для экспорта: ${rowCount}`);
    
    if (rowCount === 0) {
      await conn.close();
      
      self.postMessage({ 
        excelExportError: 'Нет данных для экспорта',
        fileName: fileName
      });
      return;
    }
    
    // Экспортируем в Excel напрямую из SQL запроса (без временной таблицы)
    console.log('Выполняем COPY в Excel формат...');
    await conn.query(`COPY (${cleanSQL}) TO '${excelFileName}' WITH (FORMAT xlsx, HEADER true)`);
    console.log('Excel файл создан через DuckDB COPY');
    
    // Читаем созданный файл
    const excelBuffer = await db.copyFileToBuffer(excelFileName);
    console.log(`Excel файл прочитан: ${excelBuffer.length} байт`);
    
    // Удаляем временные файлы
    db.dropFile(excelFileName);
    await conn.close();
    
    // Отправляем Excel файл обратно
    self.postMessage({ 
      excelExported: true,
      fileName: fileName,
      data: excelBuffer,
      message: `Excel файл создан успешно (${excelBuffer.length} байт, ${rowCount} строк)`
    }, { transfer: [excelBuffer.buffer] });
    
  } catch (error) {
    console.error('Ошибка экспорта в Excel:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Если встроенный экспорт не работает, используем fallback через SheetJS
    if (errorMessage.includes('xlsx') || errorMessage.includes('FORMAT')) {
      console.log('Встроенный Excel экспорт не поддерживается, используем fallback через SheetJS');
      await exportToExcelFallback(sql, fileName);
    } else {
      self.postMessage({ 
        excelExportError: errorMessage,
        fileName: fileName
      });
    }
  }
}

async function exportToExcelFallback(sql: string, fileName: string) {
  console.log(`Fallback экспорт в Excel через SheetJS: ${fileName}`);
  
  try {
    const conn = await db.connect();
    
    // Обрабатываем SQL запрос (заменяем 't' на реальное имя таблицы)
    const cleanSQL = processSQL(sql);
    const res = await conn.query(cleanSQL);
    await conn.close();
    
    if (res.numRows === 0) {
      self.postMessage({ 
        excelExportError: 'Нет данных для экспорта',
        fileName: fileName
      });
      return;
    }
    
    // Конвертируем Arrow результат в массив объектов
    const data = res.toArray();
    console.log(`Данные для экспорта: ${data.length} строк`);
    
    // Создаем Excel workbook через SheetJS
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    
    // Генерируем Excel файл
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    console.log(`Excel файл создан через SheetJS: ${excelBuffer.length} байт`);
    
    // Отправляем Excel файл обратно
    self.postMessage({ 
      excelExported: true,
      fileName: fileName,
      data: new Uint8Array(excelBuffer),
      message: `Excel файл создан через SheetJS (${excelBuffer.length} байт, ${data.length} строк)`
    }, { transfer: [new Uint8Array(excelBuffer).buffer] });
    
  } catch (error) {
    console.error('Ошибка fallback экспорта в Excel:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    self.postMessage({ 
      excelExportError: errorMessage,
      fileName: fileName
    });
  }
}

// 16. Переключение текущей базы данных
async function switchToDatabase(databaseId: string): Promise<boolean> {
  if (!databases.has(databaseId)) {
    console.log(`⚠️ База данных ${databaseId} не найдена`);
    return false;
  }
  
  currentDatabaseId = databaseId;
  const dbInfo = databases.get(databaseId)!;
  console.log(`🔄 Переключение на базу данных: ${dbInfo.name} (таблица: ${dbInfo.tableName})`);
  
  // Уведомляем основной поток о смене базы данных
  self.postMessage({
    databaseSwitched: true,
    currentDatabaseId: databaseId,
    databaseInfo: dbInfo
  });
  
  return true;
}

// 17. Создание уникального имени таблицы
function generateTableName(fileName: string): string {
  const timestamp = Date.now();
  const baseName = fileName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  return `table_${baseName}_${timestamp}`;
}

// 18. Автосохранение всех баз данных
async function persistAllDatabases() {
  console.log('💾 Начинаем сохранение всех баз данных...');
  
  let savedCount = 0;
  for (const databaseId of databases.keys()) {
    const saved = await saveDatabaseToIndexedDB(databaseId);
    if (saved) {
      savedCount++;
    }
  }
  
  if (savedCount > 0) {
    isDirty = false;
    console.log(`✅ Сохранено баз данных: ${savedCount}/${databases.size}`);
    
    // Уведомляем основной поток о сохранении
    self.postMessage({ 
      saved: true, 
      message: `Сохранено ${savedCount} баз данных в локальное хранилище`
    });
  } else {
    console.error('❌ Не удалось сохранить ни одной базы данных');
  }
}

// 19. Восстановление баз данных из localStorage
async function restoreDatabasesFromLocalStorage(restoredDatabases: DatabaseInfo[], restoredCurrentDatabaseId: string | null) {
  console.log('Восстанавливаем базы данных из localStorage:', restoredDatabases.length);
  
  // НЕ очищаем текущий реестр - сохраняем данные из IndexedDB
  // databases.clear(); // УДАЛЕНО!
  
  // Добавляем только те базы данных из localStorage, которых нет в IndexedDB
  for (const dbInfo of restoredDatabases) {
    // Проверяем, есть ли уже эта база данных в IndexedDB
    if (databases.has(dbInfo.id)) {
      const existingDb = databases.get(dbInfo.id)!;
      console.log(`📂 База данных ${dbInfo.name} уже загружена из IndexedDB с tableName: ${existingDb.tableName}`);
      
      // Если в IndexedDB есть правильный tableName, а в localStorage пустой - обновляем localStorage
      if (existingDb.tableName && !dbInfo.tableName) {
        console.log(`🔄 Обновляем tableName в localStorage для ${dbInfo.name}: ${existingDb.tableName}`);
        // Уведомляем основной поток об обновлении
        self.postMessage({
          updateLocalStorage: true,
          databaseId: dbInfo.id,
          tableName: existingDb.tableName
        });
      }
      continue; // Пропускаем, используем данные из IndexedDB
    }
    
    // Если tableName пустой, генерируем новый
    if (!dbInfo.tableName) {
      dbInfo.tableName = generateTableName(dbInfo.fileName);
      console.log(`🔧 Сгенерирован новый tableName для ${dbInfo.name}: ${dbInfo.tableName}`);
    }
    
    databases.set(dbInfo.id, dbInfo);
    console.log(`📂 Восстановлена база данных из localStorage: ${dbInfo.name} (${dbInfo.rowCount} строк)`);
    
    // Создаем фиктивную таблицу с правильной структурой
    try {
      const conn = await db.connect();
      
      // Создаем таблицу с колонками из метаданных
      const columnDefs = dbInfo.columns.length > 0 
        ? dbInfo.columns.map(col => `"${col}" VARCHAR`).join(', ')
        : '"column_1" VARCHAR'; // fallback если нет колонок
      
      await conn.query(`CREATE TABLE IF NOT EXISTS "${dbInfo.tableName}" (${columnDefs})`);
      console.log(`📂 Создана фиктивная таблица ${dbInfo.tableName} с колонками: ${dbInfo.columns.join(', ')}`);
      
      await conn.close();
    } catch (error) {
      console.error(`❌ Ошибка создания фиктивной таблицы для ${dbInfo.name}:`, error);
    }
  }
  
  // Устанавливаем текущую базу данных
  if (restoredCurrentDatabaseId && databases.has(restoredCurrentDatabaseId)) {
    currentDatabaseId = restoredCurrentDatabaseId;
    console.log(`📂 Установлена текущая база данных: ${databases.get(currentDatabaseId)!.name}`);
  } else if (databases.size > 0) {
    currentDatabaseId = Array.from(databases.keys())[0];
    console.log(`📂 Установлена первая база данных как текущая: ${databases.get(currentDatabaseId)!.name}`);
  }
  
  // Уведомляем основной поток о восстановленных базах данных
  if (databases.size > 0) {
    self.postMessage({
      restored: true,
      databases: Array.from(databases.values()),
      currentDatabaseId: currentDatabaseId
    });
  }
}