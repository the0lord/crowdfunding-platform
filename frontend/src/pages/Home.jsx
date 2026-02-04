import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { campaignAPI } from '../services/api';
import { ethers } from 'ethers';
import './Home.css';

const FACTORY_ADDRESS = '0x94B09c15E4E8f96D23883E1b24fD872EA6e06EF0';

export default function Home() {
  const { isConnected, connect } = useAuth();
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState([]);
  const [stats, setStats] = useState({ total: 0, funded: 0, totalRaised: '0' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeaturedCampaigns();
  }, []);

  const loadFeaturedCampaigns = async () => {
    try {
      const data = await campaignAPI.getAll({ status: 'approved', page: 1, pageSize: 6 });
      setCampaigns(data.campaigns || []);
      
      // Calculate stats
      const total = data.total || 0;
      const funded = data.campaigns?.filter(c => c.state === 'Successful')?.length || 0;
      const totalRaised = data.campaigns?.reduce((sum, c) => {
        try {
          return sum + BigInt(c.total_raised || '0');
        } catch {
          return sum;
        }
      }, BigInt(0)) || BigInt(0);
      
      setStats({
        total,
        funded,
        totalRaised: ethers.formatEther(totalRaised.toString())
      });
    } catch (error) {
      console.error('Error loading campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount) => {
    if (!amount || amount === '0') return '0';
    try {
      return parseFloat(ethers.formatEther(amount)).toFixed(2);
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

  return (
    <div className="home">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            {t('hero.title')} <span className="gradient-text">{t('hero.titleHighlight')}</span>
          </h1>
          <p className="hero-subtitle">
            {t('hero.subtitle')}
          </p>
          <div className="hero-buttons">
            <Link to="/campaigns" className="btn btn-primary btn-lg">
              {t('hero.exploreCampaigns')}
            </Link>
            {isConnected ? (
              <Link to="/create" className="btn btn-secondary btn-lg">
                {t('hero.createCampaign')}
              </Link>
            ) : (
              <button className="btn btn-secondary btn-lg" onClick={connect}>
                {t('hero.connectToStart')}
              </button>
            )}
          </div>
        </div>
        
        <div className="hero-stats">
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">{t('stats.activeCampaigns')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.funded}</div>
            <div className="stat-label">{t('stats.successfulCampaigns')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{parseFloat(stats.totalRaised).toFixed(2)}</div>
            <div className="stat-label">{t('stats.totalRaised')}</div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features">
        <div className="container">
          <h2 className="section-title">{t('features.title')}</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🔒</div>
              <h3>{t('features.secure.title')}</h3>
              <p>{t('features.secure.description')}</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3>{t('features.decentralized.title')}</h3>
              <p>{t('features.decentralized.description')}</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🛡️</div>
              <h3>{t('features.transparent.title')}</h3>
              <p>{t('features.transparent.description')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Campaigns */}
      <section className="featured-campaigns">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">{t('campaigns.title')}</h2>
            <Link to="/campaigns" className="view-all-link">
              {t('campaigns.viewAll')} →
            </Link>
          </div>
          
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>{t('common.loading')}</p>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="empty-state">
              <p>{t('campaigns.noData')}</p>
              {isConnected && (
                <Link to="/create" className="btn btn-primary">
                  {t('hero.createCampaign')}
                </Link>
              )}
            </div>
          ) : (
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
                  </div>
                  <div className="campaign-content">
                    <h3 className="campaign-title">{campaign.title}</h3>
                    <p className="campaign-description">
                      {campaign.description?.substring(0, 100)}
                      {campaign.description?.length > 100 ? '...' : ''}
                    </p>
                    <div className="campaign-progress">
                      <div className="progress-bar">
                        <div 
                          className="progress-fill"
                          style={{ width: `${calculateProgress(campaign.total_raised, campaign.goal_amount)}%` }}
                        />
                      </div>
                      <div className="progress-stats">
                        <span>{formatAmount(campaign.total_raised)} POL {t('campaigns.raised')}</span>
                        <span>{calculateProgress(campaign.total_raised, campaign.goal_amount)}%</span>
                      </div>
                    </div>
                    <div className="campaign-meta">
                      <span className="campaign-creator">
                        {t('campaigns.by')} {formatAddress(campaign.founder_address)}
                      </span>
                      <span className="campaign-contributors">
                        {campaign.contributor_count || 0} {t('campaignDetail.backersCount')}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Contract Info */}
      <section className="contract-info">
        <div className="container">
          <h2 className="section-title">Smart Contract</h2>
          <div className="contract-card">
            <div className="contract-detail">
              <span className="label">Factory Contract</span>
              <a 
                href={`https://amoy.polygonscan.com/address/${FACTORY_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="contract-address"
              >
                {FACTORY_ADDRESS}
              </a>
            </div>
            <div className="contract-detail">
              <span className="label">Network</span>
              <span className="value">Polygon Amoy Testnet (Chain ID: 80002)</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
