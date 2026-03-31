import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ethers } from 'ethers';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { userAPI, contributionAPI } from '../services/api';
import { explorerAddressUrl, explorerTxUrl } from '../contracts';
import './Dashboard.css';

function normalizeModerationStatus(status) {
  const normalized = String(status || 'pending').trim().toLowerCase();

  if (normalized === 'approved') return 'approved';
  if (normalized === 'rejected') return 'rejected';
  return 'pending';
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
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

  const locale = i18n.language?.startsWith('ru') ? 'ru-RU' : 'en-US';

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
      return Number.parseFloat(ethers.formatEther(wei)).toLocaleString(locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      });
    } catch {
      return '0';
    }
  };

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return t('common.notSet');
    return new Date(dateStr).toLocaleDateString(locale);
  };

  const formatSummaryAmount = (value, maximumFractionDigits = 2) => {
    return (Number.parseFloat(value || '0') || 0).toLocaleString(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits,
    });
  };

  const getModerationStatusLabel = (status) => t(`moderationStatuses.${normalizeModerationStatus(status)}`);

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
      <div className="dashboard-page">
        <div className="container">
          <div className="dashboard-empty dashboard-surface">
            <h2>{t('dashboard.connectTitle')}</h2>
            <p>{t('dashboard.connectBody')}</p>
            <button className="btn btn-primary btn-lg" onClick={connect}>
              {t('common.connectWallet')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="container">
        <section className="dashboard-hero dashboard-surface">
          <div className="dashboard-hero-copy">
            <span className="dashboard-kicker">{t('dashboard.heroKicker')}</span>
            <h1>{t('dashboard.title')}</h1>
            <p>{t('dashboard.heroBody')}</p>
          </div>

          <div className="dashboard-identity">
            <div className="dashboard-avatar">
              {user?.address?.slice(2, 4).toUpperCase()}
            </div>
            <div>
              <span className="dashboard-kicker">{t('common.wallet')}</span>
              <strong>{formatAddress(user?.address)}</strong>
            </div>
          </div>

          <Link to="/create" className="btn btn-primary">
            {t('nav.createCampaign')}
          </Link>
        </section>

        <section className="dashboard-metrics">
          <div className="dashboard-metric dashboard-surface">
            <span className="dashboard-kicker">{t('dashboard.metrics.launchedLabel')}</span>
            <strong>{stats.totalCampaigns}</strong>
            <p>{t('dashboard.metrics.launchedNote')}</p>
          </div>
          <div className="dashboard-metric dashboard-surface">
            <span className="dashboard-kicker">{t('dashboard.metrics.raisedLabel')}</span>
            <strong>{formatSummaryAmount(stats.totalRaised)} KGST</strong>
            <p>{t('dashboard.metrics.raisedNote')}</p>
          </div>
          <div className="dashboard-metric dashboard-surface">
            <span className="dashboard-kicker">{t('dashboard.metrics.backedLabel')}</span>
            <strong>{formatSummaryAmount(stats.totalContributed)} KGST</strong>
            <p>{t('dashboard.metrics.backedNote', { count: stats.contributionsCount })}</p>
          </div>
        </section>

        <div className="dashboard-tabs dashboard-surface">
          <button
            className={`dashboard-tab ${activeTab === 'campaigns' ? 'active' : ''}`}
            onClick={() => setActiveTab('campaigns')}
          >
            {t('dashboard.tabs.campaigns', { count: myCampaigns.length })}
          </button>
          <button
            className={`dashboard-tab ${activeTab === 'contributions' ? 'active' : ''}`}
            onClick={() => setActiveTab('contributions')}
          >
            {t('dashboard.tabs.contributions', { count: myContributions.length })}
          </button>
        </div>

        {loading ? (
          <div className="dashboard-empty dashboard-surface">
            <div className="spinner"></div>
            <p>{t('common.loading')}</p>
          </div>
        ) : (
          <div className="dashboard-content">
            {activeTab === 'campaigns' && (
              <div className="dashboard-card-grid">
                {myCampaigns.length === 0 ? (
                  <div className="dashboard-empty dashboard-surface">
                    <h3>{t('dashboard.emptyCampaignsTitle')}</h3>
                    <p>{t('dashboard.emptyCampaignsBody')}</p>
                    <Link to="/create" className="btn btn-primary">
                      {t('nav.createCampaign')}
                    </Link>
                  </div>
                ) : (
                  myCampaigns.map((campaign) => {
                    const progress = calculateProgress(campaign.total_raised, campaign.goal_amount);

                    return (
                      <article key={campaign.id} className="dashboard-item-card dashboard-campaign-card dashboard-surface">
                        <div className="dashboard-card-topbar">
                          <span className="dashboard-kicker">{t('dashboard.campaignKicker')}</span>
                          <span className={`dashboard-status status-${normalizeModerationStatus(campaign.moderation_status)}`}>
                            {getModerationStatusLabel(campaign.moderation_status)}
                          </span>
                        </div>

                        <h3 className="dashboard-card-title">{campaign.title}</h3>

                        <div className="dashboard-item-media">
                          <div className="campaign-image">
                            {campaign.image_url ? (
                              <img src={campaign.image_url} alt={campaign.title} />
                            ) : (
                              <div className="campaign-placeholder">🎯</div>
                            )}
                          </div>
                        </div>

                        <div className="dashboard-progress-block">
                          <div className="dashboard-progress-head">
                            <span className="dashboard-field-label">{t('dashboard.fields.progress')}</span>
                            <strong className="dashboard-progress-value">{progress}%</strong>
                          </div>
                          <div className="progress-track">
                            <div
                              className="progress-fill"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <div className="dashboard-progress-meta">
                            <span>{formatAmount(campaign.total_raised)} / {formatAmount(campaign.goal_amount)} KGST</span>
                            <span>{t('dashboard.fields.raised')}</span>
                          </div>
                        </div>

                        <div className="dashboard-item-stat-grid">
                          <div className="dashboard-item-stat">
                            <span className="dashboard-field-label">{t('dashboard.fields.raised')}</span>
                            <strong>{formatAmount(campaign.total_raised)} KGST</strong>
                          </div>
                          <div className="dashboard-item-stat">
                            <span className="dashboard-field-label">{t('dashboard.fields.goal')}</span>
                            <strong>{formatAmount(campaign.goal_amount)} KGST</strong>
                          </div>
                          <div className="dashboard-item-stat">
                            <span className="dashboard-field-label">{t('dashboard.fields.created')}</span>
                            <strong>{formatDate(campaign.created_at)}</strong>
                          </div>
                          <div className="dashboard-item-stat">
                            <span className="dashboard-field-label">{t('dashboard.fields.backers')}</span>
                            <strong>{Number(campaign.contributor_count || 0).toLocaleString(locale)}</strong>
                          </div>
                        </div>

                        <div className="dashboard-item-actions">
                          <Link to={`/campaign/${campaign.id}`} className="btn btn-outline btn-sm">
                            {t('common.view')}
                          </Link>
                          {campaign.contract_address && (
                            <a
                              href={explorerAddressUrl(campaign.contract_address)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-outline btn-sm"
                            >
                              {t('common.contract')}
                            </a>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'contributions' && (
              <div className="dashboard-card-grid">
                {myContributions.length === 0 ? (
                  <div className="dashboard-empty dashboard-surface">
                    <h3>{t('dashboard.emptyContributionsTitle')}</h3>
                    <p>{t('dashboard.emptyContributionsBody')}</p>
                    <Link to="/campaigns" className="btn btn-primary">
                      {t('hero.exploreCampaigns')}
                    </Link>
                  </div>
                ) : (
                  myContributions.map((contrib, index) => (
                    <article key={`${contrib.transaction_hash || contrib.campaign_id}-${index}`} className="dashboard-item-card dashboard-contribution-card dashboard-surface">
                      <div className="dashboard-item-header">
                        <div>
                          <span className="dashboard-kicker">{t('dashboard.contributionKicker')}</span>
                          <h3>{contrib.campaign_title || t('dashboard.campaignFallback', { id: contrib.campaign_id })}</h3>
                        </div>
                        <strong className="dashboard-amount">{formatAmount(contrib.amount)} KGST</strong>
                      </div>

                      <div className="dashboard-contribution-meta">
                        <span>{formatDate(contrib.created_at)}</span>
                        {contrib.transaction_hash && (
                          <a
                            href={explorerTxUrl(contrib.transaction_hash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="dashboard-transaction-link"
                          >
                            {formatAddress(contrib.transaction_hash)}
                          </a>
                        )}
                      </div>

                      <div className="dashboard-item-actions">
                        <Link to={`/campaign/${contrib.campaign_id}`} className="btn btn-outline btn-sm">
                          {t('dashboard.viewCampaign')}
                        </Link>
                      </div>
                    </article>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
