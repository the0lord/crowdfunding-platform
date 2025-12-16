import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Navbar.css';

export default function Navbar() {
  const { user, isConnected, isAdmin, connect, disconnect, loading } = useAuth();
  const location = useLocation();

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const isActive = (path) => location.pathname === path;

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
            Home
          </Link>
          <Link 
            to="/campaigns" 
            className={`nav-link ${isActive('/campaigns') ? 'active' : ''}`}
          >
            Campaigns
          </Link>
          {isConnected && (
            <Link 
              to="/create" 
              className={`nav-link ${isActive('/create') ? 'active' : ''}`}
            >
              Create Campaign
            </Link>
          )}
          {isConnected && (
            <Link 
              to="/dashboard" 
              className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}
            >
              My Dashboard
            </Link>
          )}
          {isAdmin && (
            <Link 
              to="/admin" 
              className={`nav-link admin-link ${isActive('/admin') ? 'active' : ''}`}
            >
              🛡️ Admin
            </Link>
          )}
        </div>

        <div className="navbar-actions">
          {isConnected ? (
            <div className="user-menu">
              <div className="user-info">
                {isAdmin && <span className="admin-badge">Admin</span>}
                <span className="user-address">{formatAddress(user?.address)}</span>
              </div>
              <button className="btn btn-outline" onClick={disconnect}>
                Disconnect
              </button>
            </div>
          ) : (
            <button 
              className="btn btn-primary" 
              onClick={connect}
              disabled={loading}
            >
              {loading ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
