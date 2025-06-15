export interface ColumnDef {
  field: string;
  sortable: boolean;
  filter: boolean;
  resizable: boolean;
}

export interface VizSettings {
  xField: string;
  yField: string;
  chartType: 'auto' | 'bar' | 'line' | 'point' | 'area';
}

export interface AnalyticsData {
  gridData: any[];
  columnDefs: ColumnDef[];
  vizSettings: VizSettings;
}

export interface ImportStatus {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
  rows?: number;
  type?: string;
}

export interface SQLQueryResult {
  data: any[];
  rowCount: number;
  message: string;
} 