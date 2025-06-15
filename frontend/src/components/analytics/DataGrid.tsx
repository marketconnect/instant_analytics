import React from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import type { ColumnDef } from '../../types/analytics';
import styles from './DataGrid.module.css';

// Регистрируем все модули AG Grid Community
ModuleRegistry.registerModules([AllCommunityModule]);

interface DataGridProps {
  data: any[];
  columnDefs: ColumnDef[];
}

const DataGrid: React.FC<DataGridProps> = ({ data, columnDefs }) => {
  if (data.length === 0) {
    return null;
  }

  return (
    <div className={styles.card}>
      <h3>📊 Результаты запроса ({data.length} строк)</h3>
      <div className={`ag-theme-alpine ${styles.gridContainer}`}>
        <AgGridReact
          rowData={data}
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
  );
};

export default DataGrid; 