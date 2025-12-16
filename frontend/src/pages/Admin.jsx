import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { adminAPI } from '../services/api';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import './Admin.css';

export default function Admin() {
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
      toast.error('Failed to load admin data');
    }
    setLoading(false);
  };

  const handleApprove = async (id) => {
    if (window.confirm('Approve this campaign?')) {
      try {
        await adminAPI.approveCampaign(id);
        toast.success('Campaign approved');
        loadData();
      } catch (error) {
        toast.error('Failed to approve campaign');
      }
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    try {
      await adminAPI.rejectCampaign(selectedCampaign, rejectReason);
      toast.success('Campaign rejected');
      setSelectedCampaign(null);
      setRejectReason('');
      loadData();
    } catch (error) {
      toast.error('Failed to reject campaign');
    }
  };

  const handleAddBlacklist = async (e) => {
    e.preventDefault();
    if (!newBlacklist.address || !newBlacklist.reason) {
      toast.error('Please fill in all fields');
      return;
    }
    if (!ethers.isAddress(newBlacklist.address)) {
      toast.error('Invalid Ethereum address');
      return;
    }
    try {
      await adminAPI.addToBlacklist(newBlacklist.address, newBlacklist.reason);
      toast.success('Address added to blacklist');
      setNewBlacklist({ address: '', reason: '' });
      setShowBlacklistForm(false);
      loadData();
    } catch (error) {
      toast.error('Failed to add to blacklist');
    }
  };

  const handleRemoveBlacklist = async (id) => {
    if (window.confirm('Remove this address from blacklist?')) {
      try {
        await adminAPI.removeFromBlacklist(id);
        toast.success('Address removed from blacklist');
        loadData();
      } catch (error) {
        toast.error('Failed to remove from blacklist');
      }
    }
  };

  const formatAddress = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';
  
  const formatAmount = (wei) => {
    if (!wei || wei === '0') return '0';
    try {
      return parseFloat(ethers.formatEther(wei)).toFixed(2);
    } catch {
      return '0';
    }
  };

  if (!isConnected) {
    return (
      <div className="admin-page">
        <div className="admin-denied">
          <div className="denied-icon">🔐</div>
          <h2>Connect Your Wallet</h2>
          <p>Please connect your wallet to access the admin dashboard</p>
          <button className="btn btn-primary" onClick={connect}>
            Connect Wallet
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
          <h2>Access Denied</h2>
          <p>You need admin privileges to access this page.</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-container">
        <div className="admin-header">
          <h1>🛡️ Admin Dashboard</h1>
          <p>Manage campaigns, users, and platform settings</p>
        </div>

        <div className="admin-tabs">
          <button 
            className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            📊 Overview
          </button>
          <button 
            className={`tab ${activeTab === 'moderation' ? 'active' : ''}`}
            onClick={() => setActiveTab('moderation')}
          >
            ⏳ Moderation Queue
          </button>
          <button 
            className={`tab ${activeTab === 'blacklist' ? 'active' : ''}`}
            onClick={() => setActiveTab('blacklist')}
          >
            🚫 Blacklist
          </button>
        </div>

        <div className="admin-content">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading...</p>
            </div>
          ) : (
            <>
              {/* Stats Tab */}
              {activeTab === 'stats' && stats && (
                <div className="stats-section">
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-value">{stats.total_campaigns || 0}</div>
                      <div className="stat-label">Total Campaigns</div>
                    </div>
                    <div className="stat-card pending">
                      <div className="stat-value">{stats.pending_campaigns || 0}</div>
                      <div className="stat-label">Pending Review</div>
                    </div>
                    <div className="stat-card success">
                      <div className="stat-value">{stats.approved_campaigns || 0}</div>
                      <div className="stat-label">Approved</div>
                    </div>
                    <div className="stat-card danger">
                      <div className="stat-value">{stats.rejected_campaigns || 0}</div>
                      <div className="stat-label">Rejected</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{stats.total_users || 0}</div>
                      <div className="stat-label">Total Users</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{stats.total_contributions || 0}</div>
                      <div className="stat-label">Contributions</div>
                    </div>
                    <div className="stat-card highlight">
                      <div className="stat-value">{formatAmount(stats.total_raised || '0')}</div>
                      <div className="stat-label">POL Raised</div>
                    </div>
                    <div className="stat-card danger">
                      <div className="stat-value">{stats.blacklisted_count || 0}</div>
                      <div className="stat-label">Blacklisted</div>
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
                      <h3>All Clear!</h3>
                      <p>No campaigns pending review</p>
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
                              <span>By: {formatAddress(campaign.founder_address)}</span>
                              <span>Goal: {formatAmount(campaign.goal_amount)} POL</span>
                              <span>Created: {new Date(campaign.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="moderation-actions">
                            <button 
                              className="btn btn-approve"
                              onClick={() => handleApprove(campaign.id)}
                            >
                              ✅ Approve
                            </button>
                            <button 
                              className="btn btn-reject"
                              onClick={() => setSelectedCampaign(campaign.id)}
                            >
                              ❌ Reject
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
                    <h3>Blacklisted Addresses</h3>
                    <button 
                      className="btn btn-primary"
                      onClick={() => setShowBlacklistForm(true)}
                    >
                      + Add Address
                    </button>
                  </div>

                  {blacklist.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">🎉</div>
                      <h3>No Blacklisted Addresses</h3>
                      <p>The blacklist is currently empty</p>
                    </div>
                  ) : (
                    <div className="blacklist-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Address</th>
                            <th>Reason</th>
                            <th>Date</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {blacklist.map(item => (
                            <tr key={item.id}>
                              <td className="address-cell">
                                <code>{item.address}</code>
                              </td>
                              <td>{item.reason}</td>
                              <td>{new Date(item.created_at).toLocaleDateString()}</td>
                              <td>
                                <button 
                                  className="btn btn-sm btn-danger"
                                  onClick={() => handleRemoveBlacklist(item.id)}
                                >
                                  Remove
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
            <h3>Reject Campaign</h3>
            <p>Please provide a reason for rejecting this campaign.</p>
            <textarea
              placeholder="Enter rejection reason..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={4}
            />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setSelectedCampaign(null)}>
                Cancel
              </button>
              <button className="btn btn-reject" onClick={handleReject}>
                Reject Campaign
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
            <h3>Add to Blacklist</h3>
            <form onSubmit={handleAddBlacklist}>
              <div className="form-group">
                <label>Ethereum Address</label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={newBlacklist.address}
                  onChange={e => setNewBlacklist(prev => ({ ...prev, address: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Reason</label>
                <textarea
                  placeholder="Enter reason for blacklisting..."
                  value={newBlacklist.reason}
                  onChange={e => setNewBlacklist(prev => ({ ...prev, reason: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowBlacklistForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-danger">
                  Add to Blacklist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
