import React from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import type { ColumnDef } from '../../types/analytics';

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
    <div className="card">
      <h3>📊 Результаты запроса ({data.length} строк)</h3>
      <div className="ag-theme-alpine" style={{ height: 400, width: '100%' }}>
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