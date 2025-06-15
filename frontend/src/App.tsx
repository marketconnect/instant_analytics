import React, { useState } from 'react';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { DataProvider } from './contexts/DataContext';
import Layout from './components/layout/Layout';
import DashboardPage from './pages/DashboardPage';
import DuckDBAnalyticsPage from './pages/DuckDBAnalyticsPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import './App.css';

const AppContent: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<string>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const { t } = useLanguage();

  const handlePageChange = (page: string) => {
    setCurrentPage(page);
  };

  const handleSidebarToggle = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const getPageTitle = (page: string): string => {
    switch (page) {
      case 'dashboard':
        return t('dashboardTitle');
      case 'duckdb':
        return t('analyticsTitle');
      case 'reports':
        return t('reportsTitle');
      case 'settings':
        return t('settingsTitle');
      default:
        return t('dashboardTitle');
    }
  };

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage />;
      case 'duckdb':
        return <DuckDBAnalyticsPage />;
      case 'reports':
        return <ReportsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <Layout
      currentPage={currentPage}
      onPageChange={handlePageChange}
      sidebarCollapsed={sidebarCollapsed}
      onSidebarToggle={handleSidebarToggle}
      pageTitle={getPageTitle(currentPage)}
    >
      {renderCurrentPage()}
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <LanguageProvider>
      <DataProvider>
        <AppContent />
      </DataProvider>
    </LanguageProvider>
  );
};

export default App;
