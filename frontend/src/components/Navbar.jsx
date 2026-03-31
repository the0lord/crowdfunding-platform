import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import './Navbar.css';

export default function Navbar() {
  const { user, isConnected, isAdmin, connect, connectMetaMask, disconnect, loading, walletType } = useAuth();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const desktopMenuRef = useRef(null);

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const isActive = (path) => location.pathname === path;

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('language', lng);
  };

  const walletBadge = walletType === 'web3auth' ? '🔑' : walletType === 'metamask' ? '🦊' : '';

  const primaryNavItems = useMemo(() => {
    const items = [
      { to: '/', label: t('nav.home') },
      { to: '/campaigns', label: t('nav.campaigns') },
    ];

    if (isConnected) {
      items.push({ to: '/create', label: t('nav.createCampaign'), accent: true });
    }

    return items;
  }, [isConnected, t]);

  const workspaceNavItems = useMemo(() => {
    if (!isConnected) {
      return [];
    }

    const items = [
      { to: '/bridge', label: t('nav.bridge'), icon: '⇄' },
      { to: '/wallet', label: t('nav.wallet'), icon: '◌' },
      { to: '/governance', label: t('nav.dao'), icon: '◎' },
      { to: '/dashboard', label: t('nav.myDashboard'), icon: '▣' },
    ];

    if (isAdmin) {
      items.push({ to: '/admin', label: t('nav.admin'), admin: true, icon: '🛡️' });
    }

    return items;
  }, [isAdmin, isConnected, t]);

  const navItems = useMemo(() => [...primaryNavItems, ...workspaceNavItems], [primaryNavItems, workspaceNavItems]);

  const activeWorkspaceItem = useMemo(
    () => workspaceNavItems.find((item) => location.pathname === item.to) ?? null,
    [location.pathname, workspaceNavItems]
  );

  const desktopMenuLabel = activeWorkspaceItem?.label || t('nav.tools');
  const desktopMenuIcon = activeWorkspaceItem?.icon || '⌘';

  useEffect(() => {
    setDrawerOpen(false);
    setDesktopMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = drawerOpen ? 'hidden' : previousOverflow;

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!desktopMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (desktopMenuRef.current && !desktopMenuRef.current.contains(event.target)) {
        setDesktopMenuOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setDesktopMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [desktopMenuOpen]);

  const renderNavLinks = (items, onNavigate) => items.map((item) => (
    <Link
      key={item.to}
      to={item.to}
      className={`nav-link ${item.accent ? 'nav-link-accent' : ''} ${item.admin ? 'admin-link' : ''} ${isActive(item.to) ? 'active' : ''}`}
      onClick={onNavigate}
    >
      {item.icon ? (
        <>
          <span className="nav-link-icon" aria-hidden="true">{item.icon}</span>
          <span className="nav-link-label">{item.label}</span>
        </>
      ) : (
        <span className="nav-link-label">{item.label}</span>
      )}
    </Link>
  ));

  const renderWorkspaceLinks = () => workspaceNavItems.map((item) => (
    <Link
      key={item.to}
      to={item.to}
      className={`nav-utility-link ${item.admin ? 'nav-utility-link-admin' : ''} ${isActive(item.to) ? 'active' : ''}`}
      onClick={() => setDesktopMenuOpen(false)}
    >
      <span className="nav-utility-icon" aria-hidden="true">{item.icon}</span>
      <span className="nav-utility-copy">
        <span className="nav-utility-title">{item.label}</span>
      </span>
      <span className="nav-utility-arrow" aria-hidden="true">↗</span>
    </Link>
  ));

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-brand">
          <span className="brand-icon">🇰🇬</span>
          <span className="brand-text">{t('nav.brand')}</span>
        </Link>

        <div className="navbar-links navbar-links-desktop">
          <div className="navbar-primary-links">
            {renderNavLinks(primaryNavItems)}
          </div>

          {workspaceNavItems.length > 0 && (
            <div className={`nav-utility-menu ${desktopMenuOpen ? 'open' : ''}`} ref={desktopMenuRef}>
              <button
                type="button"
                className={`nav-utility-trigger ${activeWorkspaceItem ? 'active' : ''} ${activeWorkspaceItem?.admin ? 'admin-active' : ''}`}
                aria-expanded={desktopMenuOpen}
                aria-haspopup="menu"
                aria-controls="desktop-tools-menu"
                onClick={() => setDesktopMenuOpen((current) => !current)}
              >
                <span className="nav-utility-trigger-icon" aria-hidden="true">{desktopMenuIcon}</span>
                <span className="nav-utility-trigger-label">{desktopMenuLabel}</span>
                <span className="nav-utility-trigger-chevron" aria-hidden="true">▾</span>
              </button>

              <div id="desktop-tools-menu" className="nav-utility-panel" role="menu" aria-label={t('nav.tools')}>
                <span className="nav-utility-kicker">{t('nav.tools')}</span>
                <div className="nav-utility-links">
                  {renderWorkspaceLinks()}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="navbar-actions">
          <div className="language-switcher desktop-language-switcher">
            <button
              className={`lang-btn ${i18n.language === 'en' ? 'active' : ''}`}
              onClick={() => changeLanguage('en')}
              title={t('nav.languageEnglish')}
            >
              EN
            </button>
            <button
              className={`lang-btn ${i18n.language === 'ru' ? 'active' : ''}`}
              onClick={() => changeLanguage('ru')}
              title={t('nav.languageRussian')}
            >
              РУ
            </button>
          </div>

          {isConnected ? (
            <div className="user-menu desktop-auth">
              <div className="user-info">
                {isAdmin && <span className="admin-badge">{t('nav.adminBadge')}</span>}
                <span className="wallet-type-badge" title={walletType}>{walletBadge}</span>
                <span className="user-address">{formatAddress(user?.address)}</span>
              </div>
              <button className="btn btn-outline" onClick={disconnect}>
                {t('nav.disconnect')}
              </button>
            </div>
          ) : (
            <div className="connect-buttons desktop-auth">
              <button
                className="btn btn-primary"
                onClick={connect}
                disabled={loading}
              >
                {loading ? t('nav.connecting') : `🔑 ${t('nav.signIn')}`}
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={connectMetaMask}
                disabled={loading}
                title={t('nav.connectMetaMask')}
              >
                🦊
              </button>
            </div>
          )}

          <button
            type="button"
            className="nav-menu-btn"
            aria-expanded={drawerOpen}
            aria-controls="mobile-navigation-drawer"
            aria-label={drawerOpen ? t('nav.closeMenu') : t('nav.menu')}
            onClick={() => {
              setDesktopMenuOpen(false);
              setDrawerOpen((current) => !current);
            }}
          >
            <span className="nav-menu-icon">{drawerOpen ? '✕' : '☰'}</span>
          </button>
        </div>
      </div>

      {drawerOpen && (
        <div className="nav-drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <aside
            id="mobile-navigation-drawer"
            className="nav-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="nav-drawer-header">
              <div>
                <span className="nav-drawer-kicker">{t('nav.menu')}</span>
                <h2>{t('nav.brand')}</h2>
              </div>
              <button
                type="button"
                className="nav-drawer-close"
                aria-label={t('nav.closeMenu')}
                onClick={() => setDrawerOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="language-switcher drawer-language-switcher">
              <button
                className={`lang-btn ${i18n.language === 'en' ? 'active' : ''}`}
                onClick={() => changeLanguage('en')}
                title={t('nav.languageEnglish')}
              >
                EN
              </button>
              <button
                className={`lang-btn ${i18n.language === 'ru' ? 'active' : ''}`}
                onClick={() => changeLanguage('ru')}
                title={t('nav.languageRussian')}
              >
                РУ
              </button>
            </div>

            <div className="nav-drawer-links">
              {renderNavLinks(navItems, () => setDrawerOpen(false))}
            </div>

            <div className="nav-drawer-footer">
              {isConnected ? (
                <>
                  <div className="nav-drawer-wallet">
                    <span className="wallet-type-badge" title={walletType}>{walletBadge}</span>
                    <div>
                      <span className="nav-drawer-wallet-label">{t('nav.connectWallet')}</span>
                      <strong>{formatAddress(user?.address)}</strong>
                    </div>
                  </div>
                  <button className="btn btn-outline nav-drawer-action" onClick={disconnect}>
                    {t('nav.disconnect')}
                  </button>
                </>
              ) : (
                <div className="nav-drawer-connect">
                  <button className="btn btn-primary nav-drawer-action" onClick={connect} disabled={loading}>
                    {loading ? t('nav.connecting') : `🔑 ${t('nav.signIn')}`}
                  </button>
                  <button className="btn btn-outline nav-drawer-action" onClick={connectMetaMask} disabled={loading}>
                    🦊 {t('nav.connectMetaMask')}
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </nav>
  );
}
