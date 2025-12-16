import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ethers } from 'ethers';
import { campaignAPI } from '../services/api';
import './CampaignList.css';

export default function CampaignList() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('approved');
  const [campaignState, setCampaignState] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    loadCampaigns();
  }, [page, status, campaignState, category]);

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const params = {
        status,
        category,
        search,
        page,
        pageSize: 12
      };
      // Add state filter if set
      if (campaignState) {
        params.state = campaignState;
      }
      const data = await campaignAPI.getAll(params);
      setCampaigns(data.campaigns || []);
      setTotalPages(Math.ceil((data.total || 0) / 12));
    } catch (error) {
      console.error('Error loading campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    loadCampaigns();
  };

  const formatAmount = (wei) => {
    if (!wei || wei === '0') return '0';
    try {
      return parseFloat(ethers.formatEther(wei)).toFixed(2);
    } catch {
      return '0';
    }
  };

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
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

  const categories = [
    { value: '', label: 'All Categories' },
    { value: 'technology', label: 'Technology' },
    { value: 'creative', label: 'Creative' },
    { value: 'community', label: 'Community' },
    { value: 'education', label: 'Education' },
    { value: 'environment', label: 'Environment' },
    { value: 'health', label: 'Health' },
    { value: 'other', label: 'Other' }
  ];

  return (
    <div className="campaign-list">
      <div className="container">
        {/* Header */}
        <div className="page-header">
          <h1>Explore Campaigns</h1>
          <p>Discover and support innovative projects from around the world</p>
        </div>

        {/* Filters */}
        <div className="filters">
          <form className="search-form" onSubmit={handleSearch}>
            <input
              type="text"
              placeholder="Search campaigns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
            <button type="submit" className="search-btn">
              🔍
            </button>
          </form>

          <div className="filter-group">
            <select
              value={campaignState}
              onChange={(e) => { setCampaignState(e.target.value); setPage(1); }}
              className="filter-select"
            >
              <option value="">All States</option>
              <option value="Active">Active</option>
              <option value="Successful">Funded</option>
              <option value="Failed">Failed</option>
            </select>

            <select
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(1); }}
              className="filter-select"
            >
              {categories.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Campaign Grid */}
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading campaigns...</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <h3>No campaigns found</h3>
            <p>Try adjusting your filters or search terms</p>
          </div>
        ) : (
          <>
            <div className="campaigns-grid">
              {campaigns.map((campaign) => (
                <Link
                  to={`/campaign/${campaign.id}`}
                  key={campaign.id}
                  className="campaign-card"
                >
                  <div className="campaign-image">
                    {campaign.image_url ? (
                      <img src={campaign.image_url} alt={campaign.title} />
                    ) : (
                      <div className="campaign-placeholder">
                        <span>🎯</span>
                      </div>
                    )}
                    <span className={`campaign-state state-${campaign.state?.toLowerCase()}`}>
                      {campaign.state || 'Active'}
                    </span>
                    {campaign.category && (
                      <span className="campaign-category">{campaign.category}</span>
                    )}
                  </div>
                  <div className="campaign-content">
                    <h3 className="campaign-title">{campaign.title}</h3>
                    <p className="campaign-description">
                      {campaign.description?.substring(0, 80)}
                      {campaign.description?.length > 80 ? '...' : ''}
                    </p>
                    <div className="campaign-progress">
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${calculateProgress(campaign.total_raised, campaign.goal_amount)}%` }}
                        />
                      </div>
                      <div className="progress-stats">
                        <span className="raised">{formatAmount(campaign.total_raised)} POL</span>
                        <span className="percent">{calculateProgress(campaign.total_raised, campaign.goal_amount)}%</span>
                      </div>
                    </div>
                    <div className="campaign-meta">
                      <span>{formatAddress(campaign.founder_address)}</span>
                      <span>{campaign.contributor_count || 0} backers</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="page-btn"
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  ← Previous
                </button>
                <span className="page-info">
                  Page {page} of {totalPages}
                </span>
                <button
                  className="page-btn"
                  disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
