import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ethers } from 'ethers';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { campaignAPI } from '../services/api';
import {
  CONTRACTS,
  CAMPAIGN_CHAIN,
  GOVERNANCE_CHAIN,
  explorerAddressUrl,
  governanceAddressUrl,
} from '../contracts';
import './Home.css';

const FEATURED_LIMIT = 4;

function normalizeCampaignState(state) {
  const normalizedState = String(state || 'active').trim().toLowerCase();

  if (normalizedState === 'successful' || normalizedState === 'funded') {
    return 'successful';
  }

  if (normalizedState === 'failed') {
    return 'failed';
  }

  if (normalizedState === 'cancelled' || normalizedState === 'canceled') {
    return 'cancelled';
  }

  return 'active';
}

export default function Home() {
  const { isConnected, connect } = useAuth();
  const { t, i18n } = useTranslation();
  const [campaigns, setCampaigns] = useState([]);
  const [stats, setStats] = useState({ total: 0, funded: 0, totalRaised: '0' });
  const [loading, setLoading] = useState(true);

  const locale = i18n.language?.startsWith('ru') ? 'ru-RU' : 'en-US';

  useEffect(() => {
    loadFeaturedCampaigns();
  }, []);

  const loadFeaturedCampaigns = async () => {
    try {
      const data = await campaignAPI.getAll({ status: 'approved', page: 1, pageSize: FEATURED_LIMIT });
      const nextCampaigns = data.campaigns || [];
      setCampaigns(nextCampaigns);

      const total = data.total || 0;
      const funded = nextCampaigns.filter(
        (campaign) => normalizeCampaignState(campaign.state) === 'successful'
      ).length;
      const totalRaised = nextCampaigns.reduce((sum, campaign) => {
        try {
          return sum + BigInt(campaign.total_raised || '0');
        } catch {
          return sum;
        }
      }, 0n);

      setStats({
        total,
        funded,
        totalRaised: ethers.formatEther(totalRaised.toString()),
      });
    } catch (error) {
      console.error('Error loading campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (value, options = {}) => new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    ...options,
  }).format(value || 0);

  const formatAmount = (amount) => {
    if (!amount || amount === '0') {
      return formatNumber(0, { maximumFractionDigits: 0 });
    }

    try {
      return formatNumber(Number.parseFloat(ethers.formatEther(amount)));
    } catch {
      return formatNumber(0, { maximumFractionDigits: 0 });
    }
  };

  const formatAddress = (address) => {
    if (!address) {
      return '';
    }

    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const calculateProgress = (raised, goal) => {
    if (!raised || !goal || goal === '0') {
      return 0;
    }

    try {
      const raisedValue = BigInt(raised);
      const goalValue = BigInt(goal);
      return Math.min(Number((raisedValue * 100n) / goalValue), 100);
    } catch {
      return 0;
    }
  };

  const getStateLabel = (state) => t(`campaignStates.${normalizeCampaignState(state)}`);

  const getDaysLabel = (deadline) => {
    if (!deadline) {
      return t('homePage.noDeadline');
    }

    const deadlineTime = new Date(deadline).getTime();
    if (Number.isNaN(deadlineTime)) {
      return t('homePage.noDeadline');
    }

    const remainingMs = deadlineTime - Date.now();
    if (remainingMs <= 0) {
      return t('homePage.ended');
    }

    const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
    if (remainingDays <= 1) {
      return t('homePage.endsSoon');
    }

    return t('homePage.daysLeft', { count: remainingDays });
  };

  const totalRaisedValue = Number.parseFloat(stats.totalRaised || '0') || 0;
  const successRate = stats.total > 0 ? Math.round((stats.funded / stats.total) * 100) : 0;
  const averageRaise = stats.total > 0 ? totalRaisedValue / stats.total : 0;
  const campaignRailReady = Boolean(CONTRACTS.CampaignFactory && CONTRACTS.KGST);
  const governanceRailReady = Boolean(CONTRACTS.CrowdfundDAO && CONTRACTS.GovernanceToken && CONTRACTS.UserRegistry);

  const metricCards = [
    {
      label: t('stats.activeCampaigns'),
      value: formatNumber(stats.total, { maximumFractionDigits: 0 }),
      note: t('homePage.metricNoteCampaigns'),
      tone: 'purple',
    },
    {
      label: t('stats.successfulCampaigns'),
      value: formatNumber(stats.funded, { maximumFractionDigits: 0 }),
      note: t('homePage.metricNoteSuccess'),
      tone: 'yellow',
    },
    {
      label: t('stats.totalRaised'),
      value: `${formatNumber(totalRaisedValue)} KGST`,
      note: t('homePage.metricNoteRaised'),
      tone: 'purple',
    },
    {
      label: t('homePage.successRate'),
      value: `${formatNumber(successRate, { maximumFractionDigits: 0 })}%`,
      note: `${formatNumber(averageRaise)} KGST ${t('homePage.averageRaise')}`,
      tone: 'yellow',
    },
  ];

  const railCards = [
    {
      title: t('homePage.campaignRail'),
      network: CAMPAIGN_CHAIN.name,
      summary: t('homePage.campaignRailSummary'),
      live: campaignRailReady,
      points: [
        `${t('homePage.factoryLabel')}: ${CONTRACTS.CampaignFactory ? formatAddress(CONTRACTS.CampaignFactory) : t('homePage.notDeployed')}`,
        `${t('homePage.tokenLabel')}: ${CONTRACTS.KGST ? formatAddress(CONTRACTS.KGST) : t('homePage.notDeployed')}`,
      ],
    },
    {
      title: t('homePage.governanceRail'),
      network: GOVERNANCE_CHAIN.name,
      summary: t('homePage.governanceRailSummary'),
      live: governanceRailReady,
      points: [
        `${t('homePage.governanceLabel')}: ${CONTRACTS.CrowdfundDAO ? formatAddress(CONTRACTS.CrowdfundDAO) : t('homePage.notDeployed')}`,
        `${t('homePage.registryLabel')}: ${CONTRACTS.UserRegistry ? formatAddress(CONTRACTS.UserRegistry) : t('homePage.notDeployed')}`,
      ],
    },
  ];

  const featureCards = [
    {
      kicker: t('homePage.featureKickerSecure'),
      title: t('features.secure.title'),
      description: t('homePage.featureBodySecure'),
    },
    {
      kicker: t('homePage.featureKickerDecentralized'),
      title: t('features.decentralized.title'),
      description: t('homePage.featureBodyDecentralized'),
    },
    {
      kicker: t('homePage.featureKickerTransparent'),
      title: t('features.transparent.title'),
      description: t('homePage.featureBodyTransparent'),
    },
  ];

  const protocolCards = [
    {
      label: t('homePage.factoryLabel'),
      value: CONTRACTS.CampaignFactory || t('homePage.notDeployed'),
      href: CONTRACTS.CampaignFactory ? explorerAddressUrl(CONTRACTS.CampaignFactory) : null,
      status: CONTRACTS.CampaignFactory ? t('homePage.deployed') : t('homePage.notDeployed'),
    },
    {
      label: t('homePage.tokenLabel'),
      value: CONTRACTS.KGST || t('homePage.notDeployed'),
      href: CONTRACTS.KGST ? explorerAddressUrl(CONTRACTS.KGST) : null,
      status: CONTRACTS.KGST ? t('homePage.deployed') : t('homePage.notDeployed'),
    },
    {
      label: t('homePage.governanceLabel'),
      value: CONTRACTS.CrowdfundDAO || t('homePage.notDeployed'),
      href: CONTRACTS.CrowdfundDAO ? governanceAddressUrl(CONTRACTS.CrowdfundDAO) : null,
      status: CONTRACTS.CrowdfundDAO ? t('homePage.deployed') : t('homePage.notDeployed'),
    },
    {
      label: t('homePage.registryLabel'),
      value: CONTRACTS.UserRegistry || t('homePage.notDeployed'),
      href: CONTRACTS.UserRegistry ? governanceAddressUrl(CONTRACTS.UserRegistry) : null,
      status: CONTRACTS.UserRegistry ? t('homePage.deployed') : t('homePage.notDeployed'),
    },
    {
      label: t('homePage.campaignChainLabel'),
      value: `${CAMPAIGN_CHAIN.name} · ${CAMPAIGN_CHAIN.chainId}`,
      href: CAMPAIGN_CHAIN.explorer,
      status: t('homePage.live'),
    },
    {
      label: t('homePage.governanceChainLabel'),
      value: `${GOVERNANCE_CHAIN.name} · ${GOVERNANCE_CHAIN.chainId}`,
      href: GOVERNANCE_CHAIN.explorer,
      status: t('homePage.live'),
    },
  ];

  return (
    <div className="home">
      <section className="home-hero">
        <div className="hero-grid">
          <article className="bento-card hero-panel hero-panel-main">
            <div className="hero-topline">
              <span className="panel-badge">{t('homePage.eyebrow')}</span>
              <span className={`status-pill ${governanceRailReady ? 'is-live' : 'is-pending'}`}>
                {governanceRailReady ? t('homePage.governanceReady') : t('homePage.governancePending')}
              </span>
            </div>

            <h1 className="hero-title">
              {t('hero.title')} <span className="gradient-text">{t('hero.titleHighlight')}</span>
              <span className="hero-title-tail">{t('homePage.heroTail')}</span>
            </h1>

            <p className="hero-subtitle">{t('hero.subtitle')}</p>
            <p className="hero-support-copy">{t('homePage.heroSupport')}</p>

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
          </article>

          <article className="bento-card hero-panel hero-panel-metrics">
            <div className="section-heading-block">
              <span className="section-kicker">{t('homePage.platformPulse')}</span>
              <h2>{t('homePage.platformPulseTitle')}</h2>
              <p>{t('homePage.platformPulseBody')}</p>
            </div>

            <div className="metric-grid">
              {metricCards.map((card) => (
                <div key={card.label} className={`metric-card tone-${card.tone}`}>
                  <span className="metric-label">{card.label}</span>
                  <strong className="metric-value">{card.value}</strong>
                  <span className="metric-note">{card.note}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="bento-card hero-panel hero-panel-rails">
            <div className="section-heading-block">
              <span className="section-kicker">{t('homePage.sectionProtocolTitle')}</span>
              <h2>{t('homePage.protocolHeadline')}</h2>
              <p>{t('homePage.sectionProtocolBody')}</p>
            </div>

            <div className="rail-grid">
              {railCards.map((card) => (
                <div key={card.title} className="rail-card">
                  <div className="rail-card-header">
                    <div>
                      <span className="rail-title">{card.title}</span>
                      <p className="rail-network">{card.network}</p>
                    </div>
                    <span className={`status-pill ${card.live ? 'is-live' : 'is-pending'}`}>
                      {card.live ? t('homePage.live') : t('homePage.pending')}
                    </span>
                  </div>
                  <p className="rail-summary">{card.summary}</p>
                  <div className="rail-points">
                    {card.points.map((point) => (
                      <span key={point} className="rail-point">{point}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="home-section">
        <div className="section-header-bento">
          <div className="section-heading-block">
            <span className="section-kicker">{t('features.title')}</span>
            <h2>{t('homePage.sectionValueTitle')}</h2>
          </div>
        </div>

        <div className="capability-grid">
          {featureCards.map((card) => (
            <article key={card.title} className="bento-card capability-card">
              <span className="capability-kicker">{card.kicker}</span>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="section-header-bento">
          <div className="section-heading-block">
            <span className="section-kicker">{t('campaigns.title')}</span>
            <h2>{t('homePage.sectionFeaturedTitle')}</h2>
            <p>{t('homePage.sectionFeaturedBody')}</p>
          </div>
          <Link to="/campaigns" className="view-all-link">
            {t('campaigns.viewAll')}
          </Link>
        </div>

        {loading ? (
          <div className="bento-card home-feedback-card">
            <div className="spinner"></div>
            <p>{t('common.loading')}</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="bento-card home-feedback-card">
            <p>{t('campaigns.noData')}</p>
            {isConnected && (
              <Link to="/create" className="btn btn-primary">
                {t('hero.createCampaign')}
              </Link>
            )}
          </div>
        ) : (
          <div className="featured-grid">
            {campaigns.map((campaign) => {
              const progress = calculateProgress(campaign.total_raised, campaign.goal_amount);
              const stateKey = normalizeCampaignState(campaign.state);

              return (
                <Link to={`/campaign/${campaign.id}`} key={campaign.id} className="bento-card featured-card">
                  <div className="featured-media">
                    {campaign.image_url ? (
                      <img src={campaign.image_url} alt={campaign.title} />
                    ) : (
                      <div className="campaign-placeholder">
                        <span>{campaign.title?.slice(0, 1) || 'K'}</span>
                      </div>
                    )}
                    <span className={`campaign-state-pill state-${stateKey}`}>
                      {getStateLabel(campaign.state)}
                    </span>
                  </div>

                  <div className="featured-body">
                    <div className="featured-meta-row">
                      <span>{t('campaigns.by')} {formatAddress(campaign.founder_address)}</span>
                      <span>{getDaysLabel(campaign.deadline)}</span>
                    </div>

                    <h3 className="featured-title">{campaign.title}</h3>
                    <p className="featured-description">{campaign.description}</p>

                    <div className="featured-progress">
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="progress-stats">
                        <span>{formatAmount(campaign.total_raised)} KGST {t('campaigns.raised')}</span>
                        <span>{progress}%</span>
                      </div>
                    </div>

                    <div className="featured-footer-grid">
                      <div>
                        <span className="footer-label">{t('homePage.goalLabel')}</span>
                        <strong>{formatAmount(campaign.goal_amount)} KGST</strong>
                      </div>
                      <div>
                        <span className="footer-label">{t('homePage.backersLabel')}</span>
                        <strong>{formatNumber(campaign.contributor_count || 0, { maximumFractionDigits: 0 })}</strong>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="home-section home-section-protocol">
        <div className="section-header-bento">
          <div className="section-heading-block">
            <span className="section-kicker">{t('homePage.sectionProtocolTitle')}</span>
            <h2>{t('homePage.protocolSurfaceTitle')}</h2>
            <p>{t('homePage.sectionProtocolBody')}</p>
          </div>
        </div>

        <div className="protocol-surface-grid">
          {protocolCards.map((card) => (
            <article key={card.label} className="bento-card protocol-card">
              <div className="protocol-card-topline">
                <span className="protocol-label">{card.label}</span>
                <span className="protocol-status">{card.status}</span>
              </div>

              {card.href ? (
                <a href={card.href} target="_blank" rel="noopener noreferrer" className="protocol-value">
                  {card.value}
                </a>
              ) : (
                <span className="protocol-value is-muted">{card.value}</span>
              )}

              {card.href && (
                <span className="protocol-link-copy">{t('homePage.openInExplorer')}</span>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
