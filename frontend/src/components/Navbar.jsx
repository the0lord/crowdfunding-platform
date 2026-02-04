import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import './Navbar.css';

export default function Navbar() {
  const { user, isConnected, isAdmin, connect, disconnect, loading } = useAuth();
  const { t, i18n } = useTranslation();
  const location = useLocation();

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const isActive = (path) => location.pathname === path;

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('language', lng);
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-brand">
          <span className="brand-icon">🚀</span>
          <span className="brand-text">CrowdFund</span>
        </Link>

        <div className="navbar-links">
          <Link 
            to="/" 
            className={`nav-link ${isActive('/') ? 'active' : ''}`}
          >
            {t('nav.home')}
          </Link>
          <Link 
            to="/campaigns" 
            className={`nav-link ${isActive('/campaigns') ? 'active' : ''}`}
          >
            {t('nav.campaigns')}
          </Link>
          {isConnected && (
            <Link 
              to="/create" 
              className={`nav-link ${isActive('/create') ? 'active' : ''}`}
            >
              {t('nav.createCampaign')}
            </Link>
          )}
          {isConnected && (
            <Link 
              to="/dashboard" 
              className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}
            >
              {t('nav.myDashboard')}
            </Link>
          )}
          {isAdmin && (
            <Link 
              to="/admin" 
              className={`nav-link admin-link ${isActive('/admin') ? 'active' : ''}`}
            >
              🛡️ {t('nav.admin')}
            </Link>
          )}
        </div>

        <div className="navbar-actions">
          <div className="language-switcher">
            <button 
              className={`lang-btn ${i18n.language === 'en' ? 'active' : ''}`}
              onClick={() => changeLanguage('en')}
              title="English"
            >
              EN
            </button>
            <button 
              className={`lang-btn ${i18n.language === 'ru' ? 'active' : ''}`}
              onClick={() => changeLanguage('ru')}
              title="Русский"
            >
              РУ
            </button>
          </div>

          {isConnected ? (
            <div className="user-menu">
              <div className="user-info">
                {isAdmin && <span className="admin-badge">{t('nav.adminBadge')}</span>}
                <span className="user-address">{formatAddress(user?.address)}</span>
              </div>
              <button className="btn btn-outline" onClick={disconnect}>
                {t('nav.disconnect')}
              </button>
            </div>
          ) : (
            <button 
              className="btn btn-primary" 
              onClick={connect}
              disabled={loading}
            >
              {loading ? t('nav.connecting') : t('nav.connectWallet')}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
