import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ethers } from 'ethers';
import { useAuth } from '../contexts/AuthContext';
import { userAPI, contributionAPI } from '../services/api';
import './Dashboard.css';

export default function Dashboard() {
  const { user, isConnected, connect } = useAuth();
  const [activeTab, setActiveTab] = useState('campaigns');
  const [myCampaigns, setMyCampaigns] = useState([]);
  const [myContributions, setMyContributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalCampaigns: 0,
    totalContributed: '0',
    totalRaised: '0',
    contributionsCount: 0
  });

  useEffect(() => {
    if (isConnected && user?.address) {
      loadDashboardData();
    }
  }, [isConnected, user?.address]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load user's campaigns and contributions
      const [userData, contribs] = await Promise.all([
        userAPI.getByAddress(user.address),
        contributionAPI.getByUser(user.address)
      ]);

      setMyCampaigns(userData.campaigns_created || []);
      setMyContributions(contribs.contributions || contribs || []);

      // Calculate stats
      const totalContributed = contribs.contributions?.reduce((sum, c) => {
        try {
          return sum + BigInt(c.amount || '0');
        } catch { return sum; }
      }, BigInt(0)) || BigInt(0);

      const totalRaised = userData.campaigns_created?.reduce((sum, c) => {
        try {
          return sum + BigInt(c.total_raised || '0');
        } catch { return sum; }
      }, BigInt(0)) || BigInt(0);

      setStats({
        totalCampaigns: userData.campaigns_created?.length || 0,
        totalContributed: ethers.formatEther(totalContributed.toString()),
        totalRaised: ethers.formatEther(totalRaised.toString()),
        contributionsCount: contribs.contributions?.length || 0
      });
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (wei) => {
    if (!wei || wei === '0') return '0';
    try {
      return parseFloat(ethers.formatEther(wei)).toFixed(4);
    } catch {
      return '0';
    }
  };

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString();
  };

  const calculateProgress = (raised, goal) => {
    if (!raised || !goal || goal === '0') return 0;
    try {
      const r = BigInt(raised);
      const g = BigInt(goal);
      return Math.min(Number((r * BigInt(100)) / g), 100);
    } catch {
      return 0;
    }
  };

  if (!isConnected) {
    return (
      <div className="dashboard">
        <div className="container">
          <div className="connect-prompt">
            <div className="prompt-icon">👤</div>
            <h2>Your Dashboard</h2>
            <p>Connect your wallet to view your campaigns and contributions</p>
            <button className="btn btn-primary btn-lg" onClick={connect}>
              Connect Wallet
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="container">
        {/* Header */}
        <div className="dashboard-header">
          <div className="user-profile">
            <div className="avatar">
              {user?.address?.slice(2, 4).toUpperCase()}
            </div>
            <div className="user-details">
              <h1>My Dashboard</h1>
              <p className="address">{user?.address}</p>
            </div>
          </div>
          <Link to="/create" className="btn btn-primary">
            Create Campaign
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">📊</div>
            <div className="stat-content">
              <div className="stat-value">{stats.totalCampaigns}</div>
              <div className="stat-label">My Campaigns</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">💰</div>
            <div className="stat-content">
              <div className="stat-value">{parseFloat(stats.totalRaised).toFixed(2)}</div>
              <div className="stat-label">POL Raised</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🎁</div>
            <div className="stat-content">
              <div className="stat-value">{stats.contributionsCount}</div>
              <div className="stat-label">Contributions Made</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">💎</div>
            <div className="stat-content">
              <div className="stat-value">{parseFloat(stats.totalContributed).toFixed(2)}</div>
              <div className="stat-label">POL Contributed</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'campaigns' ? 'active' : ''}`}
            onClick={() => setActiveTab('campaigns')}
          >
            My Campaigns ({myCampaigns.length})
          </button>
          <button
            className={`tab ${activeTab === 'contributions' ? 'active' : ''}`}
            onClick={() => setActiveTab('contributions')}
          >
            My Contributions ({myContributions.length})
          </button>
        </div>

        {/* Tab Content */}
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading...</p>
          </div>
        ) : (
          <div className="tab-content">
            {activeTab === 'campaigns' && (
              <div className="campaigns-section">
                {myCampaigns.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">🚀</div>
                    <h3>No campaigns yet</h3>
                    <p>Create your first campaign and start raising funds!</p>
                    <Link to="/create" className="btn btn-primary">
                      Create Campaign
                    </Link>
                  </div>
                ) : (
                  <div className="campaigns-list">
                    {myCampaigns.map(campaign => (
                      <div key={campaign.id} className="campaign-item">
                        <div className="campaign-image">
                          {campaign.image_url ? (
                            <img src={campaign.image_url} alt={campaign.title} />
                          ) : (
                            <div className="campaign-placeholder">🎯</div>
                          )}
                        </div>
                        <div className="campaign-info">
                          <div className="campaign-header">
                            <h3>{campaign.title}</h3>
                            <span className={`status-badge status-${campaign.moderation_status?.toLowerCase()}`}>
                              {campaign.moderation_status || 'Pending'}
                            </span>
                          </div>
                          <div className="campaign-progress">
                            <div className="progress-bar">
                              <div 
                                className="progress-fill"
                                style={{ width: `${calculateProgress(campaign.total_raised, campaign.goal_amount)}%` }}
                              />
                            </div>
                            <div className="progress-stats">
                              <span>{formatAmount(campaign.total_raised)} / {formatAmount(campaign.goal_amount)} POL</span>
                              <span>{calculateProgress(campaign.total_raised, campaign.goal_amount)}%</span>
                            </div>
                          </div>
                          <div className="campaign-meta">
                            <span>Created: {formatDate(campaign.created_at)}</span>
                            <span>{campaign.contributor_count || 0} backers</span>
                          </div>
                        </div>
                        <div className="campaign-actions">
                          <Link 
                            to={`/campaign/${campaign.id}`} 
                            className="btn btn-sm btn-outline"
                          >
                            View
                          </Link>
                          {campaign.contract_address && (
                            <a
                              href={`https://amoy.polygonscan.com/address/${campaign.contract_address}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-sm btn-outline"
                            >
                              Contract
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'contributions' && (
              <div className="contributions-section">
                {myContributions.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">💝</div>
                    <h3>No contributions yet</h3>
                    <p>Support campaigns you believe in!</p>
                    <Link to="/campaigns" className="btn btn-primary">
                      Explore Campaigns
                    </Link>
                  </div>
                ) : (
                  <div className="contributions-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Campaign</th>
                          <th>Amount</th>
                          <th>Date</th>
                          <th>Transaction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myContributions.map((contrib, index) => (
                          <tr key={index}>
                            <td>
                              <Link to={`/campaign/${contrib.campaign_id}`}>
                                {contrib.campaign_title || `Campaign #${contrib.campaign_id}`}
                              </Link>
                            </td>
                            <td className="amount">{formatAmount(contrib.amount)} POL</td>
                            <td>{formatDate(contrib.created_at)}</td>
                            <td>
                              {contrib.transaction_hash && (
                                <a
                                  href={`https://amoy.polygonscan.com/tx/${contrib.transaction_hash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="tx-link"
                                >
                                  {formatAddress(contrib.transaction_hash)}
                                </a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
