import React, { useMemo } from 'react';
import { VegaLite } from 'react-vega';
import type { VizSettings } from '../../types/analytics';

interface DataVisualizationProps {
  data: any[];
  settings: VizSettings;
}

const DataVisualization: React.FC<DataVisualizationProps> = ({
  data,
  settings
}) => {
  const vegaSpec = useMemo(() => {
    if (data.length === 0 || !settings.xField || !settings.yField) {
      return null;
    }
    
    const firstRow = data[0];
    const { xField, yField, chartType } = settings;
    
    // Определяем тип графика
    const mark = (() => {
      if (chartType !== 'auto') {
        return chartType;
      }
      
      // Автоматическое определение
      const numberFields = Object.keys(firstRow).filter(f => typeof firstRow[f] === 'number');
      if (numberFields.length >= 2) {
        return 'point' as const; // Scatter plot если есть два числовых поля
      } else if (typeof firstRow[xField] === 'string') {
        return 'bar' as const; // Bar chart для категориальных данных
      }
      return 'line' as const;
    })();
    
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      title: `${mark.toUpperCase()}: ${xField} vs ${yField}`,
      data: { values: data.slice(0, 500) }, // Лимит в 500 записей
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
      width: 700,
      height: 400
    };
  }, [data, settings]);

  if (!vegaSpec) {
    return null;
  }

  return (
    <div className="card">
      <h3>📈 Визуализация</h3>
      <VegaLite spec={vegaSpec} />
    </div>
  );
};

export default DataVisualization; 