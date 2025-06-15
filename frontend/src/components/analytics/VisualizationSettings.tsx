import React from 'react';
import type { VizSettings } from '../../types/analytics';

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
    <div className="card">
      <h3>⚙️ Настройки визуализации</h3>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr 1fr', 
        gap: '16px', 
        marginBottom: '16px' 
      }}>
        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '4px', 
            fontWeight: '500' 
          }}>
            Ось X (горизонтальная):
          </label>
          <select 
            value={settings.xField} 
            onChange={(e) => onSettingsChange({ xField: e.target.value })}
            style={{ 
              width: '100%', 
              padding: '8px', 
              border: '1px solid #dee2e6', 
              borderRadius: '6px',
              fontSize: '14px'
            }}
          >
            {availableFields.map(field => (
              <option key={field} value={field}>{field}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '4px', 
            fontWeight: '500' 
          }}>
            Ось Y (вертикальная):
          </label>
          <select 
            value={settings.yField} 
            onChange={(e) => onSettingsChange({ yField: e.target.value })}
            style={{ 
              width: '100%', 
              padding: '8px', 
              border: '1px solid #dee2e6', 
              borderRadius: '6px',
              fontSize: '14px'
            }}
          >
            {availableFields.map(field => (
              <option key={field} value={field}>{field}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '4px', 
            fontWeight: '500' 
          }}>
            Тип графика:
          </label>
          <select 
            value={settings.chartType} 
            onChange={(e) => onSettingsChange({ 
              chartType: e.target.value as VizSettings['chartType'] 
            })}
            style={{ 
              width: '100%', 
              padding: '8px', 
              border: '1px solid #dee2e6', 
              borderRadius: '6px',
              fontSize: '14px'
            }}
          >
            <option value="auto">🤖 Авто</option>
            <option value="bar">📊 Столбцы</option>
            <option value="line">📈 Линия</option>
            <option value="point">⚫ Точки</option>
            <option value="area">🏔️ Область</option>
          </select>
        </div>
      </div>
      
      <div style={{ fontSize: '12px', color: '#6c757d' }}>
        💡 Совет: Для числовых данных лучше подходят линии и точки, для категориальных - столбцы
      </div>
    </div>
  );
};

export default VisualizationSettings; 