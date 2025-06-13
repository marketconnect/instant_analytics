import React, { useState, useRef } from 'react';
import { tableFromIPC } from 'apache-arrow';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { VegaLite } from 'react-vega';

// Регистрируем AG Grid модули
ModuleRegistry.registerModules([AllCommunityModule]);

console.log('App.tsx загружен');

const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
console.log('Worker создан:', w);

export default function App() {
  const [gridData, setGridData] = useState<any[]>([]);
  const [columnDefs, setColumnDefs] = useState<any[]>([]);
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM t LIMIT 20');
  const [isLoading, setIsLoading] = useState(false);
  const [fileImported, setFileImported] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const sqlInputRef = useRef<HTMLTextAreaElement>(null);

  // Обработка сообщений от worker
  w.onmessage = (e) => {
    console.log('Получено сообщение от worker:', e.data);
    
    if (e.data.error) {
      console.error('Ошибка от worker:', e.data.error);
      alert(`Ошибка: ${e.data.error}`);
      setIsLoading(false);
      return;
    }

    if (e.data.imported) {
      const fileType = e.data.type || 'файл';
      console.log(`Импортировано строк из ${fileType}: ${e.data.rows}`);
      setImportStatus(`✅ Импортировано ${e.data.rows} строк из ${fileType}`);
      setFileImported(true);
      setIsLoading(false);
      
      // Автоматически выполняем первый запрос
      executeSQL(sqlQuery);
    }
    
    if (e.data.result) {
      console.log('Получен результат запроса, размер:', e.data.result.length);
      const tbl = tableFromIPC(new Uint8Array(e.data.result));
      console.log('Таблица создана:', tbl);
      
      const data = tbl.toArray();
      console.log('Данные для grid:', data);
      
      // Показываем сообщение о результате
      if (e.data.message) {
        setImportStatus(`🔍 ${e.data.message}`);
      }
      
      if (data.length > 0) {
        // Создаем определения колонок для ag-Grid
        const columns = Object.keys(data[0]).map(field => ({
          field: field,
          sortable: true,
          filter: true,
          resizable: true
        }));
        
        setColumnDefs(columns);
        setGridData(data);
      } else {
        setColumnDefs([]);
        setGridData([]);
      }
      
      setIsLoading(false);
    }
  };

  w.onerror = (error) => {
    console.error('Ошибка в worker:', error);
    setIsLoading(false);
  };

  // Функция выполнения SQL запроса
  const executeSQL = (query: string) => {
    if (!fileImported) {
      alert('Сначала загрузите файл данных');
      return;
    }
    
    console.log('Выполняем SQL запрос:', query);
    setIsLoading(true);
    w.postMessage({ sql: query });
  };

  // Обработчик загрузки файла
  const handleFileUpload = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    if (f) {
      // Увеличиваем лимит до 2GB (максимум для ArrayBuffer)
      const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
      if (f.size > maxSize) {
        alert(`Файл слишком большой (${Math.round(f.size / 1024 / 1024 / 1024 * 100) / 100}GB). Максимальный размер: 2GB\n\nДля файлов больше 2GB рекомендуется:\n1. Разделить файл на части\n2. Использовать серверную обработку\n3. Использовать DuckDB Desktop`);
        ev.target.value = ''; // Очищаем input
        return;
      }
      
      console.log(`Загружаем файл: ${f.name} (${f.size} байт = ${Math.round(f.size / 1024 / 1024)}MB)`);
      setIsLoading(true);
      setImportStatus('⏳ Загрузка файла...');
      
      const buf = await f.arrayBuffer();
      w.postMessage({ 
        fileData: buf, 
        fileName: f.name 
      }, { transfer: [buf] });
    }
  };

  // Базовая спецификация для Vega-Lite
  const getVegaSpec = () => {
    if (gridData.length === 0) return null;
    
    const firstRow = gridData[0];
    const fields = Object.keys(firstRow);
    
    // Анализируем типы данных
    const stringFields = fields.filter(f => typeof firstRow[f] === 'string');
    const numberFields = fields.filter(f => typeof firstRow[f] === 'number');
    
    // Выбираем лучшие поля для визуализации
    const xField = stringFields[0] || fields[0];
    const yField = numberFields[0] || fields[1] || fields[0];
    
    // Определяем тип графика на основе данных
    const mark = (() => {
      if (numberFields.length >= 2) {
        return 'point' as const; // Scatter plot если есть два числовых поля
      } else if (stringFields.length === 0) {
        return 'line' as const; // Line chart если все поля числовые
      }
      return 'bar' as const;
    })();
    
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      title: `Анализ данных: ${xField} vs ${yField}`,
      data: { values: gridData.slice(0, 200) }, // Увеличиваем лимит
      mark: mark,
      encoding: {
        x: { 
          field: xField, 
          type: typeof firstRow[xField] === 'number' ? 'quantitative' as const : 'nominal' as const,
          title: xField 
        },
        y: { 
          field: yField, 
          type: typeof firstRow[yField] === 'number' ? 'quantitative' as const : 'nominal' as const,
          title: yField,
          aggregate: typeof firstRow[yField] === 'number' && mark === 'bar' ? 'mean' as const : undefined
        },
        tooltip: [
          { field: xField, type: typeof firstRow[xField] === 'number' ? 'quantitative' as const : 'nominal' as const },
          { field: yField, type: typeof firstRow[yField] === 'number' ? 'quantitative' as const : 'nominal' as const }
        ]
      },
      width: 600,
      height: 350
    };
  };

  const vegaSpec = getVegaSpec();

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>🦆 DuckDB Analytics Dashboard</h1>
      
      {/* Секция загрузки файлов */}
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
        <h3>📁 Загрузка данных</h3>
        <input
          type="file"
          accept=".csv,.parquet,.xlsx"
          onChange={handleFileUpload}
          style={{ marginBottom: '10px' }}
        />
       
        {importStatus && (
          <div style={{ marginTop: '10px', fontWeight: 'bold' }}>
            {importStatus}
          </div>
        )}
      </div>

      {/* Секция SQL запросов */}
      {fileImported && (
        <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
          <h3>🔍 SQL Запросы</h3>
          <div style={{ marginBottom: '10px' }}>
            <textarea
              ref={sqlInputRef}
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              placeholder="Введите SQL запрос..."
              style={{ 
                width: '100%', 
                height: '80px', 
                padding: '10px',
                fontFamily: 'monospace',
                fontSize: '14px'
              }}
            />
          </div>
          <button 
            onClick={() => executeSQL(sqlQuery)}
            disabled={isLoading}
            style={{
              padding: '10px 20px',
              backgroundColor: isLoading ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: isLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {isLoading ? '⏳ Выполнение...' : '▶️ Выполнить запрос'}
          </button>
          
          {/* Быстрые запросы */}
          <div style={{ marginTop: '10px' }}>
            <small>Быстрые запросы: </small>
            {[
              'SELECT * FROM t LIMIT 10',
              'SELECT COUNT(*) as total FROM t',
              'SELECT * FROM t ORDER BY 1 DESC LIMIT 5'
            ].map((query, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setSqlQuery(query);
                  executeSQL(query);
                }}
                style={{
                  margin: '2px',
                  padding: '5px 10px',
                  fontSize: '12px',
                  backgroundColor: '#f8f9fa',
                  border: '1px solid #dee2e6',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              >
                {query}
              </button>
            ))}
            
            {/* Дополнительные запросы для структурированных данных */}
            {gridData.length > 0 && (
              <>
                <br/>
                <small style={{ color: '#666' }}>Анализ данных: </small>
                {[
                  'DESCRIBE t',
                  'SELECT DISTINCT * FROM t LIMIT 5',
                  'SHOW TABLES'
                ].map((query, idx) => (
                  <button
                    key={`analysis-${idx}`}
                    onClick={() => {
                      setSqlQuery(query);
                      executeSQL(query);
                    }}
                    style={{
                      margin: '2px',
                      padding: '5px 10px',
                      fontSize: '12px',
                      backgroundColor: '#e3f2fd',
                      border: '1px solid #90caf9',
                      borderRadius: '3px',
                      cursor: 'pointer'
                    }}
                  >
                    {query}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Результаты запроса */}
      {gridData.length > 0 && (
        <>
          {/* ag-Grid таблица */}
          <div style={{ marginBottom: '20px' }}>
            <h3>📊 Результаты запроса ({gridData.length} строк)</h3>
            <div className="ag-theme-alpine" style={{ height: 400, width: '100%' }}>
              <AgGridReact
                rowData={gridData}
                columnDefs={columnDefs}
                defaultColDef={{
                  flex: 1,
                  minWidth: 100,
                  sortable: true,
                  filter: true,
                  resizable: true
                }}
                pagination={true}
                paginationPageSize={20}
                animateRows={true}
              />
            </div>
          </div>

          {/* Vega-Lite визуализация */}
          {vegaSpec && (
            <div style={{ marginBottom: '20px' }}>
              <h3>📈 Визуализация</h3>
              <div style={{ border: '1px solid #ddd', borderRadius: '5px', padding: '15px' }}>
                <VegaLite spec={vegaSpec} />
              </div>
            </div>
          )}
        </>
      )}

      {/* Состояние загрузки */}
      {isLoading && (
        <div style={{ 
          position: 'fixed', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '20px',
          borderRadius: '5px',
          zIndex: 1000
        }}>
          ⏳ Обработка данных...
        </div>
      )}
    </div>
  );
}
