import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ethers } from 'ethers';
import { useTranslation } from 'react-i18next';
import { campaignAPI } from '../services/api';
import './CampaignList.css';

const CATEGORY_VALUES = ['', 'technology', 'creative', 'community', 'education', 'environment', 'health', 'other'];

function normalizeCampaignState(state) {
  const normalized = String(state || 'Active').toLowerCase();

  if (normalized === 'successful' || normalized === 'funded') {
    return 'successful';
  }

  if (normalized === 'failed') {
    return 'failed';
  }

  if (normalized === 'cancelled' || normalized === 'canceled') {
    return 'cancelled';
  }

  return 'active';
}

export default function CampaignList() {
  const { t, i18n } = useTranslation();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('approved');
  const [campaignState, setCampaignState] = useState('');
  const [category, setCategory] = useState('');

  const locale = i18n.language?.startsWith('ru') ? 'ru-RU' : 'en-US';
  const categoryOptions = CATEGORY_VALUES.map((value) => ({
    value,
    label: value ? t(`categories.${value}`) : t('categories.all'),
  }));

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
      return Number.parseFloat(ethers.formatEther(wei)).toLocaleString(locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
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

  const formatCategory = (value) => {
    if (!value) return '';
    return t(`categories.${String(value).toLowerCase()}`);
  };

  const getStateLabel = (state) => {
    return t(`campaignStates.${normalizeCampaignState(state)}`);
  };

  return (
    <div className="campaign-list-page">
      <div className="container">
        <section className="campaign-list-hero campaign-list-surface">
          <div className="campaign-list-hero-copy">
            <span className="campaign-list-kicker">{t('campaignList.kicker')}</span>
            <h1>{t('campaignList.title')}</h1>
            <p>{t('campaignList.description')}</p>
          </div>
          <div className="campaign-list-hero-meta">
            <div>
              <span className="meta-label">{t('campaignList.visibleLabel')}</span>
              <strong>{campaigns.length}</strong>
            </div>
            <div>
              <span className="meta-label">{t('campaignList.pageLabel')}</span>
              <strong>{page}</strong>
            </div>
            <div>
              <span className="meta-label">{t('campaignList.totalPagesLabel')}</span>
              <strong>{totalPages}</strong>
            </div>
          </div>
        </section>

        <section className="campaign-list-toolbar campaign-list-surface">
          <form className="search-form" onSubmit={handleSearch}>
            <input
              type="text"
              placeholder={t('campaignList.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
            <button type="submit" className="btn btn-primary search-btn">
              {t('common.search')}
            </button>
          </form>

          <div className="filter-group">
            <select
              value={campaignState}
              onChange={(e) => { setCampaignState(e.target.value); setPage(1); }}
              className="filter-select"
            >
              <option value="">{t('campaignList.allStates')}</option>
              <option value="Active">{t('campaignStates.active')}</option>
              <option value="Successful">{t('campaignList.funded')}</option>
              <option value="Failed">{t('campaignStates.failed')}</option>
            </select>

            <select
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(1); }}
              className="filter-select"
            >
              {categoryOptions.map((categoryOption) => (
                <option key={categoryOption.value} value={categoryOption.value}>{categoryOption.label}</option>
              ))}
            </select>
          </div>
        </section>

        {loading ? (
          <div className="campaign-list-feedback campaign-list-surface">
            <div className="spinner"></div>
            <p>{t('campaignList.loading')}</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="campaign-list-feedback campaign-list-surface">
            <h3>{t('campaignList.noResultsTitle')}</h3>
            <p>{t('campaignList.noResultsBody')}</p>
          </div>
        ) : (
          <>
            <div className="campaign-list-grid">
              {campaigns.map((campaign) => (
                <Link
                  to={`/campaign/${campaign.id}`}
                  key={campaign.id}
                  className="campaign-list-card"
                >
                  <div className="campaign-card-media">
                    {campaign.image_url ? (
                      <img src={campaign.image_url} alt={campaign.title} />
                    ) : (
                      <div className="campaign-placeholder">
                        <span>🎯</span>
                      </div>
                    )}
                    <span className={`campaign-card-state state-${normalizeCampaignState(campaign.state)}`}>
                      {getStateLabel(campaign.state)}
                    </span>
                    {campaign.category && (
                      <span className="campaign-card-category">{formatCategory(campaign.category)}</span>
                    )}
                  </div>
                  <div className="campaign-card-body">
                    <div className="campaign-card-topline">
                      <span className="campaign-card-creator">{formatAddress(campaign.founder_address)}</span>
                      <span>{t('campaignList.backersCount', { count: campaign.contributor_count || 0 })}</span>
                    </div>

                    <h3 className="campaign-card-title">{campaign.title}</h3>
                    <p className="campaign-card-description">
                      {campaign.description?.substring(0, 140)}
                      {campaign.description?.length > 140 ? '...' : ''}
                    </p>

                    <div className="campaign-card-progress">
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{ width: `${calculateProgress(campaign.total_raised, campaign.goal_amount)}%` }}
                        />
                      </div>
                      <div className="campaign-card-progress-meta">
                        <span>{calculateProgress(campaign.total_raised, campaign.goal_amount)}%</span>
                        <span>{t('campaignList.raisedSummary', { amount: formatAmount(campaign.total_raised) })}</span>
                      </div>
                    </div>

                    <div className="campaign-card-footer">
                      <div>
                        <span className="meta-label">{t('campaignList.raisedLabel')}</span>
                        <strong>{formatAmount(campaign.total_raised)} KGST</strong>
                      </div>
                      <div>
                        <span className="meta-label">{t('common.goal')}</span>
                        <strong>{formatAmount(campaign.goal_amount)} KGST</strong>
                      </div>
                    </div>
                  </div>
                </Link>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="campaign-list-pagination campaign-list-surface">
                  <button
                    className="btn btn-outline"
                    disabled={page === 1}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    {t('common.previous')}
                  </button>
                  <span className="page-info">{t('common.pageOf', { page, total: totalPages })}</span>
                  <button
                    className="btn btn-outline"
                    disabled={page === totalPages}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    {t('common.next')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
  );
}
