import React, { useState, useEffect } from 'react';
import styles from './SQLQueryEditor.module.css';

interface SQLQueryEditorProps {
  query: string;
  onQueryChange: (query: string) => void;
  onExecuteQuery: (query: string) => Promise<void>;
  isLoading: boolean;
  mode?: 'sql' | 'ai';
  onModeChange?: (mode: 'sql' | 'ai') => void;
}

const SQLQueryEditor: React.FC<SQLQueryEditorProps> = ({
  query,
  onQueryChange,
  onExecuteQuery,
  isLoading,
  mode = 'sql',
  onModeChange
}) => {
  const [sqlHistory, setSqlHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Загружаем историю SQL запросов из localStorage при монтировании
  useEffect(() => {
    const savedHistory = localStorage.getItem('sqlQueryHistory');
    if (savedHistory) {
      try {
        setSqlHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Ошибка загрузки истории SQL запросов:', e);
      }
    }

    // Загружаем последний SQL запрос
    if (mode === 'sql') {
      const lastSqlQuery = localStorage.getItem('lastSqlQuery');
      if (lastSqlQuery && !query) {
        onQueryChange(lastSqlQuery);
      }
    }
  }, [mode, onQueryChange, query]);

  // Сохраняем последний SQL запрос при изменении
  useEffect(() => {
    if (mode === 'sql' && query.trim()) {
      localStorage.setItem('lastSqlQuery', query);
    }
  }, [query, mode]);

  const addToHistory = (sqlQuery: string) => {
    if (!sqlQuery.trim() || mode !== 'sql') return;
    
    const newHistory = [sqlQuery, ...sqlHistory.filter(q => q !== sqlQuery)].slice(0, 10); // Храним последние 10 запросов
    setSqlHistory(newHistory);
    localStorage.setItem('sqlQueryHistory', JSON.stringify(newHistory));
  };

  const handleExecuteClick = async () => {
    try {
      if (mode === 'ai') {
        console.log('AI промпт:', query);
        alert('AI режим пока не реализован. Будет добавлен в следующих версиях.');
        return;
      }
      
      // Добавляем в историю перед выполнением
      addToHistory(query);
      await onExecuteQuery(query);
    } catch (error) {
      console.error('Query execution error:', error);
    }
  };

  const selectFromHistory = (historicalQuery: string) => {
    onQueryChange(historicalQuery);
    setShowHistory(false);
  };

  const clearHistory = () => {
    setSqlHistory([]);
    localStorage.removeItem('sqlQueryHistory');
    setShowHistory(false);
  };

  // Иконки для режимов
  const SQLIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10,9 9,9 8,9"/>
    </svg>
  );

  const AIIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
  );

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>
        {mode === 'sql' ? 'SQL Запросы' : 'AI Запросы'}
      </h3>
      
      {/* Query Mode Selector внутри карточки */}
      <div className={styles.header}>
        <div className={styles.modeSelector}>
          <label className={`${styles.modeOption} ${mode === 'sql' ? styles.sql : styles.inactive}`}>
            <input
              type="radio"
              name="queryMode"
              value="sql"
              checked={mode === 'sql'}
              onChange={(e) => onModeChange?.(e.target.value as 'sql' | 'ai')}
              className={styles.modeOptionInput}
            />
            <SQLIcon />
            SQL Запросы
          </label>
          
          <label className={`${styles.modeOption} ${mode === 'ai' ? styles.ai : styles.inactive}`}>
            <input
              type="radio"
              name="queryMode"
              value="ai"
              checked={mode === 'ai'}
              onChange={(e) => onModeChange?.(e.target.value as 'sql' | 'ai')}
              className={styles.modeOptionInput}
            />
            <AIIcon />
            AI Запросы
          </label>
        </div>

        {/* История SQL запросов - показываем всегда если есть история */}
        {mode === 'sql' && (
          <div className={styles.historyContainer}>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={styles.historyButton}
            >
              История {sqlHistory.length > 0 && `(${sqlHistory.length})`}
            </button>

            {showHistory && (
              <div className={styles.historyDropdown}>
                <div className={styles.historyHeader}>
                  <span className={styles.historyTitle}>
                    История SQL запросов
                  </span>
                  {sqlHistory.length > 0 && (
                    <button
                      onClick={clearHistory}
                      className={styles.clearButton}
                    >
                      Очистить
                    </button>
                  )}
                </div>
                {sqlHistory.length === 0 ? (
                  <div className={styles.historyEmpty}>
                    История пуста
                  </div>
                ) : (
                  sqlHistory.map((historicalQuery, index) => (
                    <div
                      key={index}
                      onClick={() => selectFromHistory(historicalQuery)}
                      className={styles.historyItem}
                    >
                      {historicalQuery.length > 50 ? historicalQuery.substring(0, 50) + '...' : historicalQuery}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Textarea для ввода */}
      <div className={styles.textareaContainer}>
        <textarea
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={mode === 'ai' 
            ? "Опишите что вы хотите узнать о данных... Например: 'Покажи топ 10 записей по продажам' или 'Найди аномалии в данных'"
            : "Введите SQL запрос..."
          }
          disabled={isLoading}
          className={`${styles.textarea} ${mode === 'ai' ? styles.ai : styles.sql}`}
        />
      </div>
      
      <button 
        onClick={handleExecuteClick}
        disabled={isLoading || !query.trim()}
        className={`${styles.executeButton} ${isLoading || !query.trim() ? styles.disabled : styles.enabled}`}
      >
        {isLoading 
          ? (mode === 'ai' ? 'Обработка...' : 'Выполнение...') 
          : (mode === 'ai' ? 'Отправить промпт' : 'Выполнить запрос')
        }
      </button>
      
      {mode === 'ai' && (
        <div className={styles.aiHint}>
          💡 Опишите свой запрос естественным языком, и AI поможет проанализировать данные
        </div>
      )}
    </div>
  );
};

export default SQLQueryEditor; 