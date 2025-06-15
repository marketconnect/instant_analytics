import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onPageChange: (page: string) => void;
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
  pageTitle: string;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  currentPage,
  onPageChange,
  sidebarCollapsed,
  onSidebarToggle,
  pageTitle
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
      if (window.innerWidth > 768) {
        setMobileMenuOpen(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleMobileMenuToggle = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const handlePageChange = (page: string) => {
    onPageChange(page);
    if (isMobile) {
      setMobileMenuOpen(false);
    }
  };

  return (
    <div className="app">
      {/* Hamburger меню для мобильных */}
      {isMobile && (
        <button 
          className={`hamburger ${mobileMenuOpen ? 'active' : ''}`}
          onClick={handleMobileMenuToggle}
        >
          <div className="hamburger-icon">
            <div className="hamburger-line"></div>
            <div className="hamburger-line"></div>
            <div className="hamburger-line"></div>
          </div>
        </button>
      )}

      {/* Overlay для мобильного меню */}
      {isMobile && (
        <div 
          className={`sidebar-overlay ${mobileMenuOpen ? 'active' : ''}`}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <Sidebar
        currentPage={currentPage}
        onPageChange={handlePageChange}
        collapsed={isMobile ? false : sidebarCollapsed}
        onToggleCollapse={isMobile ? handleMobileMenuToggle : onSidebarToggle}
        mobileOpen={mobileMenuOpen}
        isMobile={isMobile}
      />
      
      <main className="main-content">
        <div className="page-header">
          <h1>{pageTitle}</h1>
        </div>
        <div className="page-container">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout; 