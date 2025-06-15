import React from 'react';
import type { VizSettings } from '../../types/analytics';
import styles from './VisualizationSettings.module.css';

interface VisualizationSettingsProps {
  settings: VizSettings;
  onSettingsChange: (settings: Partial<VizSettings>) => void;
  availableFields: string[];
}

const VisualizationSettings: React.FC<VisualizationSettingsProps> = ({
  settings,
  onSettingsChange,
  availableFields
}) => {
  if (availableFields.length === 0) {
    return null;
  }

  return (
    <div className={styles.card}>
      <h3>⚙️ Настройки визуализации</h3>
      <div className={styles.settingsGrid}>
        <div className={styles.fieldGroup}>
          <label className={styles.label}>
            Ось X (горизонтальная):
          </label>
          <select 
            value={settings.xField} 
            onChange={(e) => onSettingsChange({ xField: e.target.value })}
            className={styles.select}
          >
            {availableFields.map(field => (
              <option key={field} value={field}>{field}</option>
            ))}
          </select>
        </div>
        
        <div className={styles.fieldGroup}>
          <label className={styles.label}>
            Ось Y (вертикальная):
          </label>
          <select 
            value={settings.yField} 
            onChange={(e) => onSettingsChange({ yField: e.target.value })}
            className={styles.select}
          >
            {availableFields.map(field => (
              <option key={field} value={field}>{field}</option>
            ))}
          </select>
        </div>
        
        <div className={styles.fieldGroup}>
          <label className={styles.label}>
            Тип графика:
          </label>
          <select 
            value={settings.chartType} 
            onChange={(e) => onSettingsChange({ 
              chartType: e.target.value as VizSettings['chartType'] 
            })}
            className={styles.select}
          >
            <option value="auto">🤖 Авто</option>
            <option value="bar">📊 Столбцы</option>
            <option value="line">📈 Линия</option>
            <option value="point">⚫ Точки</option>
            <option value="area">🏔️ Область</option>
          </select>
        </div>
      </div>
      
      <div className={styles.hint}>
        💡 Совет: Для числовых данных лучше подходят линии и точки, для категориальных - столбцы
      </div>
    </div>
  );
};

export default VisualizationSettings; 