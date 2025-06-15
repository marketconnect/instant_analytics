export const queryKeys = {
  analyticsData: 'analytics-data',
  sqlQuery: 'sql-query',
  importedFile: 'imported-file',
} as const;

export type QueryKey = typeof queryKeys[keyof typeof queryKeys]; 