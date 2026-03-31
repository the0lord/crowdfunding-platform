import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { adminAPI } from '../services/api';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import './Admin.css';

export default function Admin() {
  const { t, i18n } = useTranslation();
  const { isAdmin, isConnected, connect } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState([]);
  const [blacklist, setBlacklist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [newBlacklist, setNewBlacklist] = useState({ address: '', reason: '' });
  const [showBlacklistForm, setShowBlacklistForm] = useState(false);

  const locale = i18n.language?.startsWith('ru') ? 'ru-RU' : 'en-US';

  useEffect(() => {
    if (!isConnected) {
      return;
    }
    if (isAdmin) {
      loadData();
    }
  }, [isConnected, isAdmin, activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      switch (activeTab) {
        case 'stats':
          const statsData = await adminAPI.getStats();
          setStats(statsData);
          break;
        case 'moderation':
          const pendingData = await adminAPI.getModerationQueue();
          setPending(pendingData.campaigns || []);
          break;
        case 'blacklist':
          const blacklistData = await adminAPI.getBlacklist();
          setBlacklist(blacklistData.addresses || []);
          break;
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error(t('admin.toasts.loadFailed'));
    }
    setLoading(false);
  };

  const handleApprove = async (id) => {
    if (window.confirm(t('admin.confirmApprove'))) {
      try {
        await adminAPI.approveCampaign(id);
        toast.success(t('admin.toasts.approveSuccess'));
        loadData();
      } catch (error) {
        toast.error(t('admin.toasts.approveFailed'));
      }
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error(t('admin.toasts.rejectReasonRequired'));
      return;
    }
    try {
      await adminAPI.rejectCampaign(selectedCampaign, rejectReason);
      toast.success(t('admin.toasts.rejectSuccess'));
      setSelectedCampaign(null);
      setRejectReason('');
      loadData();
    } catch (error) {
      toast.error(t('admin.toasts.rejectFailed'));
    }
  };

  const handleAddBlacklist = async (e) => {
    e.preventDefault();
    if (!newBlacklist.address || !newBlacklist.reason) {
      toast.error(t('admin.toasts.fillAllFields'));
      return;
    }
    if (!ethers.isAddress(newBlacklist.address)) {
      toast.error(t('admin.toasts.invalidAddress'));
      return;
    }
    try {
      await adminAPI.addToBlacklist(newBlacklist.address, newBlacklist.reason);
      toast.success(t('admin.toasts.addBlacklistSuccess'));
      setNewBlacklist({ address: '', reason: '' });
      setShowBlacklistForm(false);
      loadData();
    } catch (error) {
      toast.error(t('admin.toasts.addBlacklistFailed'));
    }
  };

  const handleRemoveBlacklist = async (id) => {
    if (window.confirm(t('admin.confirmRemoveBlacklist'))) {
      try {
        await adminAPI.removeFromBlacklist(id);
        toast.success(t('admin.toasts.removeBlacklistSuccess'));
        loadData();
      } catch (error) {
        toast.error(t('admin.toasts.removeBlacklistFailed'));
      }
    }
  };

  const formatAddress = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';
  const formatDate = (value) => new Date(value).toLocaleDateString(locale);
  
  const formatAmount = (wei) => {
    if (!wei || wei === '0') return '0';
    try {
      return Number.parseFloat(ethers.formatEther(wei)).toLocaleString(locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    } catch {
      return '0';
    }
  };

  if (!isConnected) {
    return (
      <div className="admin-page">
        <div className="admin-denied">
          <div className="denied-icon">🔐</div>
          <h2>{t('admin.connectTitle')}</h2>
          <p>{t('admin.connectBody')}</p>
          <button className="btn btn-primary" onClick={connect}>
            {t('common.connectWallet')}
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="admin-page">
        <div className="admin-denied">
          <div className="denied-icon">🚫</div>
          <h2>{t('admin.accessDeniedTitle')}</h2>
          <p>{t('admin.accessDeniedBody')}</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            {t('admin.goHome')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-container">
        <div className="admin-header">
          <h1>{t('admin.title')}</h1>
          <p>{t('admin.subtitle')}</p>
        </div>

        <div className="admin-tabs">
          <button 
            className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            {t('admin.tabs.overview')}
          </button>
          <button 
            className={`tab ${activeTab === 'moderation' ? 'active' : ''}`}
            onClick={() => setActiveTab('moderation')}
          >
            {t('admin.tabs.moderation')}
          </button>
          <button 
            className={`tab ${activeTab === 'blacklist' ? 'active' : ''}`}
            onClick={() => setActiveTab('blacklist')}
          >
            {t('admin.tabs.blacklist')}
          </button>
        </div>

        <div className="admin-content">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>{t('common.loading')}</p>
            </div>
          ) : (
            <>
              {/* Stats Tab */}
              {activeTab === 'stats' && stats && (
                <div className="stats-section">
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-value">{stats.total_campaigns || 0}</div>
                      <div className="stat-label">{t('admin.stats.totalCampaigns')}</div>
                    </div>
                    <div className="stat-card pending">
                      <div className="stat-value">{stats.pending_campaigns || 0}</div>
                      <div className="stat-label">{t('admin.stats.pendingReview')}</div>
                    </div>
                    <div className="stat-card success">
                      <div className="stat-value">{stats.approved_campaigns || 0}</div>
                      <div className="stat-label">{t('admin.stats.approved')}</div>
                    </div>
                    <div className="stat-card danger">
                      <div className="stat-value">{stats.rejected_campaigns || 0}</div>
                      <div className="stat-label">{t('admin.stats.rejected')}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{stats.total_users || 0}</div>
                      <div className="stat-label">{t('admin.stats.totalUsers')}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{stats.total_contributions || 0}</div>
                      <div className="stat-label">{t('admin.stats.contributions')}</div>
                    </div>
                    <div className="stat-card highlight">
                      <div className="stat-value">{formatAmount(stats.total_raised || '0')}</div>
                      <div className="stat-label">{t('admin.stats.kgstRaised')}</div>
                    </div>
                    <div className="stat-card danger">
                      <div className="stat-value">{stats.blacklisted_count || 0}</div>
                      <div className="stat-label">{t('admin.stats.blacklisted')}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Moderation Tab */}
              {activeTab === 'moderation' && (
                <div className="moderation-section">
                  {pending.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">✅</div>
                      <h3>{t('admin.emptyModerationTitle')}</h3>
                      <p>{t('admin.emptyModerationBody')}</p>
                    </div>
                  ) : (
                    <div className="moderation-list">
                      {pending.map(campaign => (
                        <div key={campaign.id} className="moderation-card">
                          <div className="moderation-info">
                            <h3>{campaign.title}</h3>
                            <p className="description">
                              {campaign.description?.substring(0, 200)}
                              {campaign.description?.length > 200 ? '...' : ''}
                            </p>
                            <div className="meta">
                              <span>{t('admin.by', { address: formatAddress(campaign.founder_address) })}</span>
                              <span>{t('admin.goal', { amount: formatAmount(campaign.goal_amount) })}</span>
                              <span>{t('admin.createdOn', { date: formatDate(campaign.created_at) })}</span>
                            </div>
                          </div>
                          <div className="moderation-actions">
                            <button 
                              className="btn btn-approve"
                              onClick={() => handleApprove(campaign.id)}
                            >
                              {t('admin.approveButton')}
                            </button>
                            <button 
                              className="btn btn-reject"
                              onClick={() => setSelectedCampaign(campaign.id)}
                            >
                              {t('admin.rejectButton')}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Blacklist Tab */}
              {activeTab === 'blacklist' && (
                <div className="blacklist-section">
                  <div className="blacklist-header">
                    <h3>{t('admin.blacklistTitle')}</h3>
                    <button 
                      className="btn btn-primary"
                      onClick={() => setShowBlacklistForm(true)}
                    >
                      {t('admin.addAddressButton')}
                    </button>
                  </div>

                  {blacklist.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">🎉</div>
                      <h3>{t('admin.emptyBlacklistTitle')}</h3>
                      <p>{t('admin.emptyBlacklistBody')}</p>
                    </div>
                  ) : (
                    <div className="blacklist-table">
                      <table>
                        <thead>
                          <tr>
                            <th>{t('common.address')}</th>
                            <th>{t('common.reason')}</th>
                            <th>{t('common.date')}</th>
                            <th>{t('common.action')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {blacklist.map(item => (
                            <tr key={item.id}>
                              <td className="address-cell">
                                <code>{item.address}</code>
                              </td>
                              <td>{item.reason}</td>
                              <td>{formatDate(item.created_at)}</td>
                              <td>
                                <button 
                                  className="btn btn-sm btn-danger"
                                  onClick={() => handleRemoveBlacklist(item.id)}
                                >
                                  {t('common.remove')}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {selectedCampaign && (
        <div className="modal-overlay" onClick={() => setSelectedCampaign(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedCampaign(null)}>×</button>
            <h3>{t('admin.rejectModalTitle')}</h3>
            <p>{t('admin.rejectModalBody')}</p>
            <textarea
              placeholder={t('admin.rejectPlaceholder')}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={4}
            />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setSelectedCampaign(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-reject" onClick={handleReject}>
                {t('admin.rejectCampaignButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blacklist Form Modal */}
      {showBlacklistForm && (
        <div className="modal-overlay" onClick={() => setShowBlacklistForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowBlacklistForm(false)}>×</button>
            <h3>{t('admin.blacklistModalTitle')}</h3>
            <form onSubmit={handleAddBlacklist}>
              <div className="form-group">
                <label>{t('admin.ethereumAddressLabel')}</label>
                <input
                  type="text"
                  placeholder={t('admin.ethereumAddressPlaceholder')}
                  value={newBlacklist.address}
                  onChange={e => setNewBlacklist(prev => ({ ...prev, address: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>{t('common.reason')}</label>
                <textarea
                  placeholder={t('admin.blacklistReasonPlaceholder')}
                  value={newBlacklist.reason}
                  onChange={e => setNewBlacklist(prev => ({ ...prev, reason: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowBlacklistForm(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-danger">
                  {t('admin.addToBlacklistButton')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
