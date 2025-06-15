import React from 'react';
import { useLanguage } from '../../i18n/LanguageContext';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface SidebarProps {
  currentPage: string;
  onPageChange: (page: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen?: boolean;
  isMobile?: boolean;
}

const DashboardIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="7" height="7"/>
    <rect x="14" y="3" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/>
  </svg>
);

const AnalyticsIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 3v18h18"/>
    <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
  </svg>
);

const ReportsIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14,2 14,8 20,8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10,9 9,9 8,9"/>
  </svg>
);

const SettingsIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polyline points="9,18 15,12 9,6"/>
  </svg>
);

const CollapseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polyline points="11,17 6,12 11,7"/>
    <polyline points="18,17 13,12 18,7"/>
  </svg>
);

const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onPageChange,
  collapsed,
  onToggleCollapse,
  mobileOpen = false,
  isMobile = false
}) => {
  const { t } = useLanguage();

  const menuItems: MenuItem[] = [
    { id: 'dashboard', label: t('dashboard'), icon: <DashboardIcon /> },
    { id: 'duckdb', label: t('duckdb'), icon: <AnalyticsIcon /> },
    { id: 'reports', label: t('reports'), icon: <ReportsIcon /> },
    { id: 'settings', label: t('settings'), icon: <SettingsIcon /> },
  ];

  const sidebarClasses = [
    'sidebar',
    collapsed && !isMobile ? 'collapsed' : '',
    isMobile && mobileOpen ? 'mobile-open' : ''
  ].filter(Boolean).join(' ');

  return (
    <aside className={sidebarClasses}>
      <div className="sidebar-header">
        {(!collapsed || isMobile) && (
          <h2 className="sidebar-title">ia</h2>
        )}
      </div>
      
      <nav className="sidebar-nav">
        {menuItems.map(item => (
          <button
            key={item.id}
            className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onPageChange(item.id)}
            title={collapsed && !isMobile ? item.label : ''}
          >
            <span className="nav-icon">{item.icon}</span>
            {(!collapsed || isMobile) && <span className="nav-label">{item.label}</span>}
          </button>
        ))}
      </nav>

      {!isMobile && (
        <div className="sidebar-footer">
          <button 
            className="collapse-btn"
            onClick={onToggleCollapse}
            title={collapsed ? t('expand') : t('collapse')}
          >
            {collapsed ? (
              <ChevronRightIcon />
            ) : (
              <>
                <CollapseIcon />
                <span>{t('collapse')}</span>
              </>
            )}
          </button>
        </div>
      )}
    </aside>
  );
};

export default Sidebar; 