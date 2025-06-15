import React from 'react';

interface SQLQueryEditorProps {
  query: string;
  onQueryChange: (query: string) => void;
  onExecuteQuery: (query: string) => Promise<void>;
  onQuickQuery: (query: string) => Promise<void>;
  isLoading: boolean;
  hasData: boolean;
}

const QUICK_QUERIES = [
  'SELECT * FROM t LIMIT 10',
  'SELECT COUNT(*) as total FROM t',
  'SELECT * FROM t ORDER BY 1 DESC LIMIT 5'
];

const ANALYSIS_QUERIES = [
  'DESCRIBE t',
  'SELECT DISTINCT * FROM t LIMIT 5',
  'SHOW TABLES'
];

const SQLQueryEditor: React.FC<SQLQueryEditorProps> = ({
  query,
  onQueryChange,
  onExecuteQuery,
  onQuickQuery,
  isLoading,
  hasData
}) => {
  const handleExecuteClick = async () => {
    try {
      await onExecuteQuery(query);
    } catch (error) {
      console.error('Query execution error:', error);
    }
  };

  const handleQuickQueryClick = async (quickQuery: string) => {
    try {
      await onQuickQuery(quickQuery);
    } catch (error) {
      console.error('Quick query error:', error);
    }
  };

  return (
    <div className="card">
      <h3>🔍 SQL Запросы</h3>
      <div style={{ marginBottom: '10px' }}>
        <textarea
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Введите SQL запрос..."
          disabled={isLoading}
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
        onClick={handleExecuteClick}
        disabled={isLoading}
        className="btn btn-primary"
      >
        {isLoading ? '⏳ Выполнение...' : '▶️ Выполнить запрос'}
      </button>
      
      {/* Быстрые запросы */}
      <div style={{ marginTop: '10px' }}>
        <small>Быстрые запросы: </small>
        {QUICK_QUERIES.map((quickQuery, idx) => (
          <button
            key={idx}
            onClick={() => handleQuickQueryClick(quickQuery)}
            disabled={isLoading}
            className="btn btn-sm"
          >
            {quickQuery}
          </button>
        ))}
        
        {/* Дополнительные запросы для структурированных данных */}
        {hasData && (
          <>
            <br/>
            <small style={{ color: '#666' }}>Анализ данных: </small>
            {ANALYSIS_QUERIES.map((analysisQuery, idx) => (
              <button
                key={`analysis-${idx}`}
                onClick={() => handleQuickQueryClick(analysisQuery)}
                disabled={isLoading}
                className="btn btn-sm btn-info"
              >
                {analysisQuery}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default SQLQueryEditor; 