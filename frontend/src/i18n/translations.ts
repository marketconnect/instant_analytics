export const translations = {
  en: {
    // Navigation
    dashboard: 'Dashboard',
    duckdb: 'DuckDB Analytics',
    reports: 'Reports',
    settings: 'Settings',
    collapse: 'Collapse',
    expand: 'Expand',
    
    // Common
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    
    // Settings page
    settingsTitle: 'Settings',
    settingsDescription: 'Application settings will be here',
    language: 'Language',
    
    // Dashboard
    dashboardTitle: 'Dashboard',
    
    // Analytics
    analyticsTitle: 'DuckDB Analytics',
    
    // Reports
    reportsTitle: 'Reports',
    
    // Database Management
    selectDatabase: 'Select Database',
    currentDatabase: 'Current Database',
    loadedDatabases: 'Loaded Databases',
    noDatabaseSelected: 'No database selected',
    uploadNewDatabase: 'Upload New Database',
    databaseInfo: 'Database Information',
    rowCount: 'Rows',
    columns: 'Columns',
    uploadDate: 'Upload Date',
    
    // Export
    export: 'Export',
    exportData: 'Export Data',
    exportToCsv: 'Export to CSV',
    exportToExcel: 'Export to Excel',
    exportToParquet: 'Export to Parquet',
    noDataToExport: 'No data to export',
    exportSuccess: 'Data exported successfully',
    parquetDescription: 'Parquet - DuckDB native export with automatic fallback to JSON if needed',
  },
  ru: {
    // Navigation
    dashboard: 'Панель управления',
    duckdb: 'DuckDB Аналитика',
    reports: 'Отчеты',
    settings: 'Настройки',
    collapse: 'Свернуть',
    expand: 'Развернуть',
    
    // Common
    loading: 'Загрузка...',
    error: 'Ошибка',
    success: 'Успешно',
    cancel: 'Отмена',
    save: 'Сохранить',
    delete: 'Удалить',
    edit: 'Редактировать',
    add: 'Добавить',
    
    // Settings page
    settingsTitle: 'Настройки',
    settingsDescription: 'Здесь будут настройки приложения',
    language: 'Язык',
    
    // Dashboard
    dashboardTitle: 'Панель управления',
    
    // Analytics
    analyticsTitle: 'DuckDB Аналитика',
    
    // Reports
    reportsTitle: 'Отчеты',
    
    // Database Management
    selectDatabase: 'Выберите базу данных',
    currentDatabase: 'Текущая база данных',
    loadedDatabases: 'Загруженные базы данных',
    noDatabaseSelected: 'База данных не выбрана',
    uploadNewDatabase: 'Загрузить новую базу данных',
    databaseInfo: 'Информация о базе данных',
    rowCount: 'Строк',
    columns: 'Столбцов',
    uploadDate: 'Дата загрузки',
    
    // Export
    export: 'Экспорт',
    exportData: 'Экспорт данных',
    exportToCsv: 'Экспорт в CSV',
    exportToExcel: 'Экспорт в Excel',
    exportToParquet: 'Экспорт в Parquet',
    noDataToExport: 'Нет данных для экспорта',
    exportSuccess: 'Данные успешно экспортированы',
    parquetDescription: 'Parquet - встроенный экспорт DuckDB с автоматическим fallback в JSON при необходимости',
  }
};

export type Language = keyof typeof translations;
export type TranslationKey = keyof typeof translations.en; 