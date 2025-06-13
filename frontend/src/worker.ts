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

// === СИСТЕМА ПЕРСИСТЕНТНОСТИ ===
let idbConnection: IDBPDatabase | null = null;
let isDirty = false;
let autoSaveInterval: NodeJS.Timeout | null = null;

// 1. Инициализация IndexedDB
async function initPersistence() {
  console.log('Инициализация системы персистентности...');
  
  try {
    idbConnection = await openDB('ia-db', 1, {
      upgrade(db) {
        console.log('Создание object store для персистентности');
        db.createObjectStore('files');
      }
    });
    console.log('✅ IndexedDB инициализирован');
    
    // Пытаемся загрузить существующую базу
    await loadPersistedDatabase();
    
    // Запускаем автосохранение каждые 30 секунд
    startAutoSave();
    
  } catch (error) {
    console.error('❌ Ошибка инициализации персистентности:', error);
  }
}

// 2. Оценка размера и квоты
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

// 3. Экспорт базы в Uint8Array
async function exportDatabase(): Promise<Uint8Array | null> {
  try {
    console.log('🔄 Экспорт базы данных как SQL дамп...');
    const conn = await db.connect();
    
    // Получаем все таблицы
    const tablesRes = await conn.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    const tables = tablesRes.toArray() as any[];
    
    if (tables.length === 0) {
      console.log('📊 Нет таблиц для экспорта');
      await conn.close();
      return null;
    }
    
    let sqlDump = '-- DuckDB Database Export\n';
    sqlDump += '-- Created: ' + new Date().toISOString() + '\n\n';
    
    for (const table of tables) {
      const tableName = table.name;
      console.log(`📋 Экспорт таблицы: ${tableName}`);
      
      // Получаем схему таблицы
      const schemaRes = await conn.query(`SELECT sql FROM sqlite_master WHERE name='${tableName}'`);
      const schema = schemaRes.toArray()[0] as any;
      sqlDump += `-- Table: ${tableName}\n`;
      sqlDump += schema.sql + ';\n\n';
      
      // Получаем данные
      const dataRes = await conn.query(`SELECT * FROM "${tableName}" LIMIT 100000`); // Лимит для безопасности
      const rows = dataRes.toArray();
      
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
        console.log(`✅ Экспортировано ${rows.length} строк из ${tableName}`);
      }
    }
    
    await conn.close();
    
    // Конвертируем SQL в Uint8Array
    const encoder = new TextEncoder();
    const dbFile = encoder.encode(sqlDump);
    
    console.log(`✅ SQL дамп создан: ${(dbFile.length / 1024 / 1024).toFixed(2)} MB`);
    return dbFile;
    
  } catch (error) {
    console.error('❌ Ошибка экспорта базы:', error);
    return null;
  }
}

// 4. Сохранение в IndexedDB
async function saveToIndexedDB(dbFile: Uint8Array): Promise<boolean> {
  if (!idbConnection) return false;
  
  try {
    console.log('💾 Сохранение в IndexedDB...');
    await idbConnection.put('files', dbFile, 'duckdb.bin');
    console.log('✅ База сохранена в IndexedDB');
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.warn('⚠️ Превышена квота IndexedDB, переходим на OPFS');
      return false;
    }
    console.error('❌ Ошибка сохранения в IndexedDB:', error);
    return false;
  }
}

// 5. Сохранение в OPFS (fallback)
async function saveToOPFS(dbFile: Uint8Array): Promise<boolean> {
  try {
    console.log('💾 Сохранение в OPFS...');
    
    if (!navigator.storage?.getDirectory) {
      console.warn('⚠️ OPFS не поддерживается в этом браузере');
      return false;
    }
    
    const dir = await navigator.storage.getDirectory();
    const file = await dir.getFileHandle('duckdb.bin', { create: true });
    const writable = await file.createWritable();
    await writable.write(dbFile);
    await writable.close();
    
    console.log('✅ База сохранена в OPFS');
    return true;
  } catch (error) {
    console.error('❌ Ошибка сохранения в OPFS:', error);
    return false;
  }
}

// 6. Загрузка из IndexedDB
async function loadFromIndexedDB(): Promise<Uint8Array | null> {
  if (!idbConnection) return null;
  
  try {
    console.log('📂 Загрузка из IndexedDB...');
    const dbFile = await idbConnection.get('files', 'duckdb.bin');
    if (dbFile && dbFile instanceof Uint8Array) {
      // Проверяем, что файл не пустой
      if (dbFile.length === 0) {
        console.log('⚠️ Файл в IndexedDB пустой, удаляем его');
        await idbConnection.delete('files', 'duckdb.bin');
        return null;
      }
      
      console.log(`✅ База загружена из IndexedDB: ${(dbFile.length / 1024 / 1024).toFixed(2)} MB`);
      return dbFile;
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки из IndexedDB:', error);
    // Очищаем поврежденный файл
    try {
      await idbConnection.delete('files', 'duckdb.bin');
      console.log('🧹 Поврежденный файл удален из IndexedDB');
    } catch (e) {
      console.log('Не удалось удалить поврежденный файл:', e);
    }
  }
  return null;
}

// 7. Загрузка из OPFS
async function loadFromOPFS(): Promise<Uint8Array | null> {
  try {
    console.log('📂 Загрузка из OPFS...');
    
    if (!navigator.storage?.getDirectory) {
      return null;
    }
    
    const dir = await navigator.storage.getDirectory();
    const file = await dir.getFileHandle('duckdb.bin');
    const fileData = await file.getFile();
    const buffer = await fileData.arrayBuffer();
    const dbFile = new Uint8Array(buffer);
    
    // Проверяем, что файл не пустой
    if (dbFile.length === 0) {
      console.log('⚠️ Файл в OPFS пустой, удаляем его');
      await dir.removeEntry('duckdb.bin');
      return null;
    }
    
    console.log(`✅ База загружена из OPFS: ${(dbFile.length / 1024 / 1024).toFixed(2)} MB`);
    return dbFile;
  } catch (error) {
    console.log('📂 Файл не найден в OPFS (это нормально для первого запуска)');
  }
  return null;
}

// Функция для очистки поврежденных файлов из всех хранилищ
async function clearCorruptedFiles() {
  console.log('🧹 Очистка поврежденных файлов...');
  
  // Очищаем IndexedDB
  if (idbConnection) {
    try {
      await idbConnection.delete('files', 'duckdb.bin');
      console.log('✅ Файл удален из IndexedDB');
    } catch (e) {
      console.log('IndexedDB файл не найден или уже удален');
    }
  }
  
  // Очищаем OPFS
  try {
    if (navigator.storage?.getDirectory) {
      const dir = await navigator.storage.getDirectory();
      await dir.removeEntry('duckdb.bin');
      console.log('✅ Файл удален из OPFS');
    }
  } catch (e) {
    console.log('OPFS файл не найден или уже удален');
  }
}

// 8. Загрузка персистентной базы при старте
async function loadPersistedDatabase() {
  console.log('🔍 Поиск сохраненной базы данных...');
  
  // Сначала пробуем IndexedDB
  let dbFile = await loadFromIndexedDB();
  
  // Если не нашли, пробуем OPFS
  if (!dbFile) {
    dbFile = await loadFromOPFS();
  }
  
  if (dbFile) {
    try {
      console.log('🔄 Подключение сохраненной базы...');
      
      // Проверяем, что это валидный DuckDB файл
      if (dbFile.length < 100) {
        console.log('⚠️ Файл слишком мал для валидной базы, пропускаем');
        return;
      }
      
      // Проверяем, это SQL дамп или бинарный файл DuckDB
      const decoder = new TextDecoder();
      const fileStart = decoder.decode(dbFile.slice(0, 100));
      
      if (fileStart.includes('-- DuckDB Database Export') || fileStart.includes('CREATE TABLE')) {
        console.log('📄 Обнаружен SQL дамп, выполняем восстановление...');
        
        const conn = await db.connect();
        try {
          const sqlContent = decoder.decode(dbFile);
          
          // Разбиваем SQL на отдельные команды
          const sqlCommands = sqlContent
            .split('\n')
            .filter(line => line.trim() && !line.trim().startsWith('--'))
            .join('\n')
            .split(';')
            .filter(cmd => cmd.trim());
          
          for (const command of sqlCommands) {
            const trimmedCommand = command.trim();
            if (trimmedCommand) {
              try {
                await conn.query(trimmedCommand);
              } catch (cmdError) {
                console.warn('⚠️ Ошибка выполнения SQL команды:', cmdError);
              }
            }
          }
          
          // Проверяем, есть ли таблица 't'
          const tablesRes = await conn.query("SELECT name FROM sqlite_master WHERE type='table' AND name='t'");
          const tables = tablesRes.toArray();
          
          if (tables.length > 0) {
            const rowsRes = await conn.query("SELECT COUNT(*) AS cnt FROM t");
            const rows = rowsRes.getChild(0)?.get(0) ?? 0;
            
            console.log(`✅ Восстановлена таблица 't' с ${rows} строками из SQL дампа`);
            tableReady = true;
            
            // Уведомляем основной поток о восстановлении данных
            self.postMessage({ 
              restored: true, 
              rows, 
              message: `Данные восстановлены из локального хранилища: ${rows} строк`
            });
          }
          
        } catch (sqlError) {
          console.error('❌ Ошибка выполнения SQL дампа:', sqlError);
        } finally {
          await conn.close();
        }
        
      } else {
        console.log('🔄 Обнаружен бинарный файл DuckDB, пытаемся подключить...');
        
        await db.registerFileBuffer('persist.duckdb', dbFile);
        
        const conn = await db.connect();
        
        // Пытаемся подключиться к базе с обработкой ошибок
        try {
          await conn.query("ATTACH 'persist.duckdb' AS persisted");
          console.log('✅ База успешно подключена');
          
          // Проверяем, есть ли данные в сохраненной базе
          const tablesRes = await conn.query("SELECT name FROM persisted.sqlite_master WHERE type='table'");
          const tables = tablesRes.toArray();
          
          if (tables.length > 0) {
            console.log('✅ Найдены таблицы в сохраненной базе:', tables.map((t: any) => t.name));
            
            // Если есть таблица 't', восстанавливаем ее в основную базу
            if (tables.some((t: any) => t.name === 't')) {
              await conn.query("CREATE OR REPLACE TABLE t AS SELECT * FROM persisted.t");
              const rowsRes = await conn.query("SELECT COUNT(*) AS cnt FROM t");
              const rows = rowsRes.getChild(0)?.get(0) ?? 0;
              
              console.log(`✅ Восстановлена таблица 't' с ${rows} строками`);
              tableReady = true;
              
              // Уведомляем основной поток о восстановлении данных
              self.postMessage({ 
                restored: true, 
                rows, 
                message: `Данные восстановлены из локального хранилища: ${rows} строк`
              });
            }
          }
          
        } catch (attachError) {
          console.error('❌ Ошибка подключения базы:', attachError);
          
          // Если база поврежденная, очищаем хранилища
          console.log('🧹 Очищаем поврежденные файлы из хранилищ...');
          await clearCorruptedFiles();
        } finally {
          await conn.close();
        }
      }
    } catch (error) {
      console.error('❌ Ошибка подключения сохраненной базы:', error);
    }
  } else {
    console.log('📂 Сохраненная база не найдена, начинаем с чистого листа');
  }
}

// 9. Основная функция сохранения
async function persistDatabase() {
  if (!isDirty) {
    console.log('📊 База не изменена, пропускаем сохранение');
    return;
  }
  
  console.log('💾 Начинаем сохранение базы данных...');
  
  const dbFile = await exportDatabase();
  if (!dbFile) {
    console.error('❌ Не удалось экспортировать базу');
    return;
  }
  
  const storage = await estimateStorageQuota();
  
  let saved = false;
  
  // Если база небольшая и есть место, сохраняем в IndexedDB
  if (!storage.needsOPFS) {
    saved = await saveToIndexedDB(dbFile);
  }
  
  // Если не удалось сохранить в IndexedDB, используем OPFS
  if (!saved) {
    saved = await saveToOPFS(dbFile);
  }
  
  if (saved) {
    isDirty = false;
    console.log('✅ База данных успешно сохранена');
    
    // Уведомляем основной поток о сохранении
    self.postMessage({ 
      saved: true, 
      message: 'Данные сохранены в локальное хранилище'
    });
  } else {
    console.error('❌ Не удалось сохранить базу данных');
  }
}

// 10. Автосохранение каждые 30 секунд
function startAutoSave() {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
  }
  
  autoSaveInterval = setInterval(async () => {
    if (isDirty && tableReady) {
      await persistDatabase();
    }
  }, 30000); // 30 секунд
  
  console.log('🔄 Автосохранение запущено (интервал: 30 секунд)');
}

// 11. Принудительное сохранение перед выгрузкой
self.addEventListener('beforeunload', async () => {
  if (isDirty) {
    console.log('🔄 Принудительное сохранение перед выгрузкой...');
    await persistDatabase();
  }
});

// Инициализируем персистентность
await initPersistence();

let tableReady = false;

self.onmessage = (e: MessageEvent<ArrayBuffer | { sql: string } | { fileData: ArrayBuffer, fileName: string } | { action: string }>) => {
  console.log('Worker получил сообщение:', e.data);
  
  if (e.data instanceof ArrayBuffer) {
    console.log('Получен файл для импорта (старый формат), размер:', e.data.byteLength);
    importFile('data', new Uint8Array(e.data));
  } else if ('fileData' in e.data) {
    console.log(`Получен файл для импорта: ${e.data.fileName}, размер: ${e.data.fileData.byteLength}`);
    const fileName = e.data.fileName;
    const baseName = fileName.replace(/\.[^/.]+$/, ""); // убираем расширение
    importFileByName(baseName, fileName, new Uint8Array(e.data.fileData));
  } else if ('action' in e.data) {
    // Обработка команд персистентности
    if (e.data.action === 'save') {
      console.log('Получена команда ручного сохранения');
      persistDatabase();
    } else if (e.data.action === 'getStorageInfo') {
      console.log('Получена команда получения информации о хранилище');
      estimateStorageQuota().then(info => {
        self.postMessage({ storageInfo: info });
      });
    }
  } else if (tableReady && 'sql' in e.data) {
    console.log('Выполняем SQL:', e.data.sql);
    runSQL(e.data.sql);
  }
};

async function importFileByName(baseName: string, fileName: string, buf: Uint8Array) {
  console.log(`Начинаем импорт файла: ${fileName}, размер: ${buf.length} байт`);
  
  try {
    const lowerName = fileName.toLowerCase();
    
    if (lowerName.endsWith('.xlsx')) {
      console.log('Определен формат по расширению: Excel (.xlsx)');
      await importExcel(fileName, buf);
    } else if (lowerName.endsWith('.parquet')) {
      console.log('Определен формат по расширению: Parquet');
      await importParquet(fileName, buf);
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
    
    const conn = await db.connect();
    console.log('Подключение к БД создано');
    
    await conn.query(`
        CREATE OR REPLACE TABLE t 
        AS SELECT * FROM read_csv_auto('${name}', header=true)
    `);
    console.log('Таблица создана из CSV');
    
    const rowsRes = await conn.query('SELECT COUNT(*) AS cnt FROM t');
    console.log('Подсчет строк выполнен:', rowsRes);
    
    const rows = rowsRes.getChild(0)?.get(0) ?? 0;
    console.log('Количество строк в CSV:', rows);

    tableReady = true;
    console.log('Отправляем результат импорта CSV');
    self.postMessage({ imported: true, rows, type: 'CSV' });
    
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
    
    const conn = await db.connect();
    console.log('Подключение к БД создано');
    
    await conn.query(`
        CREATE OR REPLACE TABLE t AS
        SELECT * FROM '${name}'
    `);
    console.log('Таблица создана из Parquet');
    
    const rowsRes = await conn.query('SELECT COUNT(*) AS cnt FROM t');
    console.log('Подсчет строк выполнен:', rowsRes);
    
    const rows = rowsRes.getChild(0)?.get(0) ?? 0;
    console.log('Количество строк в Parquet:', rows);

    tableReady = true;
    console.log('Отправляем результат импорта Parquet');
    self.postMessage({ imported: true, rows, type: 'Parquet' });
    
    // Отмечаем, что данные изменились
    isDirty = true;
  } catch (error) {
    console.error('Ошибка при импорте Parquet:', error);
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
    
    const conn = await db.connect();
    let totalRows = 0;
    let processedSheets = 0;
    
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
      
      // Шаг 3: Создаем таблицу для первого листа
      const tableName = processedSheets === 0 ? 't' : `sheet_${sheetName.replace(/[^a-zA-Z0-9]/g, '_')}`;
      
      // Создаем таблицу с VARCHAR колонками
      const columnDefs = headers.map(h => `"${h}" VARCHAR`).join(', ');
      await conn.query(`CREATE OR REPLACE TABLE ${tableName} (${columnDefs})`);
      
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
          const sql = `INSERT INTO ${tableName} VALUES ${valueStrings.join(', ')}`;
          await conn.query(sql);
        }
      }
      
      if (processedSheets === 0) {
        totalRows = dataRows.length;
      }
      
      console.log(`Вставлено ${dataRows.length} строк в таблицу ${tableName}`);
      processedSheets++;
    }
    
    await conn.close();
    
    if (totalRows === 0) {
      throw new Error('Excel файл не содержит данных для импорта');
    }
    
    tableReady = true;
    console.log(`Excel импорт завершен: ${processedSheets} листов, ${totalRows} строк в основной таблице`);
    
    const message = processedSheets === 1 
      ? `Excel файл успешно загружен. Обнаружено ${totalRows} строк данных.`
      : `Excel файл загружен: ${processedSheets} листов, ${totalRows} строк в основной таблице 't'. Используйте SHOW TABLES для просмотра всех таблиц.`;
    
    self.postMessage({ 
      imported: true, 
      rows: totalRows, 
      type: `Excel (.xlsx) - ${processedSheets} листов`,
      message: message
    });
    
    // Отмечаем, что данные изменились
    isDirty = true;
    
  } catch (error) {
    console.error('Ошибка при импорте Excel через SheetJS:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    self.postMessage({ 
      error: `Ошибка при обработке Excel файла: ${errorMessage}` 
    });
  }
}

async function runSQL(sql: string) {
  console.log('Выполняем SQL запрос:', sql);
  
  try {
    const conn = await db.connect();
    console.log('Подключение для SQL создано');
    
    // Очищаем SQL от лишних пробелов и точек с запятой
    const cleanSQL = sql.trim().replace(/;+$/, '');
    console.log('Очищенный SQL:', cleanSQL);
    
    const res = await conn.query(cleanSQL);
    console.log('SQL выполнен, результат:', res);
    
    // Отмечаем данные как измененные для SQL команд модификации
    const modifyingCommands = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP'];
    if (modifyingCommands.some(cmd => cleanSQL.toUpperCase().trim().startsWith(cmd))) {
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