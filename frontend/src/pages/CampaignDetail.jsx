import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ethers } from 'ethers';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { campaignAPI, contributionAPI } from '../services/api';
import {
  approveAndContribute,
  ensureBSCChain,
  explorerAddressUrl,
  explorerTxUrl,
  getCampaignWithdrawalStatus,
  withdrawCampaignFunds,
} from '../contracts';
import toast from 'react-hot-toast';
import './CampaignDetail.css';

function normalizeCampaignState(state) {
  const normalized = String(state || 'Active').trim().toLowerCase();

  if (normalized === 'successful' || normalized === 'funded') return 'successful';
  if (normalized === 'failed') return 'failed';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  return 'active';
}

export default function CampaignDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { user, isConnected, connect, provider } = useAuth();
  const [campaign, setCampaign] = useState(null);
  const [contributions, setContributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contributing, setContributing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [canWithdraw, setCanWithdraw] = useState(false);
  const [withdrawHint, setWithdrawHint] = useState({ key: 'campaignDetail.withdrawHints.connectFounder', params: {} });
  const [escrowBalance, setEscrowBalance] = useState('0');
  const [withdrawTxHash, setWithdrawTxHash] = useState('');
  const [amount, setAmount] = useState('');
  const [showModal, setShowModal] = useState(false);

  const locale = i18n.language?.startsWith('ru') ? 'ru-RU' : 'en-US';

  useEffect(() => {
    loadCampaign();
  }, [id]);

  useEffect(() => {
    checkWithdrawAvailability();
  }, [campaign, user?.address]);

  const loadCampaign = async () => {
    try {
      const data = await campaignAPI.getById(id);
      setCampaign(data);
      
      // Load contributions
      const contribs = await contributionAPI.getByCampaign(id);
      setContributions(contribs.contributions || []);
    } catch (error) {
      console.error('Error loading campaign:', error);
      toast.error(t('campaignDetail.toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const checkWithdrawAvailability = async () => {
    if (!campaign?.contract_address || !campaign?.founder_address || !user?.address) {
      setCanWithdraw(false);
      setEscrowBalance('0');
      setWithdrawHint({ key: 'campaignDetail.withdrawHints.connectFounder', params: {} });
      return;
    }

    const isFounder = user.address.toLowerCase() === campaign.founder_address.toLowerCase();
    if (!isFounder) {
      setCanWithdraw(false);
      setEscrowBalance('0');
      setWithdrawHint({ key: 'campaignDetail.withdrawHints.onlyFounder', params: {} });
      return;
    }

    try {
      const status = await getCampaignWithdrawalStatus(campaign.contract_address, user.address);
      setCanWithdraw(status.canWithdraw);
      setEscrowBalance(status.paymentBalance);
      setWithdrawHint({
        key: status.reasonKey || 'campaignDetail.withdrawHints.notAvailable',
        params: status.reasonParams || {},
      });
    } catch (error) {
      console.error('Failed to check campaign withdrawal status:', error);
      setCanWithdraw(false);
      setEscrowBalance('0');
      setWithdrawHint({ key: 'campaignDetail.withdrawHints.balanceUnavailable', params: {} });
    }
  };

  const handleContribute = async (e) => {
    e.preventDefault();
    if (!isConnected) {
      await connect();
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error(t('campaignDetail.toasts.invalidAmount'));
      return;
    }

    setContributing(true);
    try {
      if (!provider) {
        toast.error(t('common.walletNotConnected'));
        return;
      }

      // Ensure on BSC chain
      await ensureBSCChain(provider);

      // Approve KGST + contribute in one flow
      toast.loading(t('campaignDetail.toasts.approving'), { id: 'tx' });
      const { tx } = await approveAndContribute(provider, campaign.contract_address, amount);

      toast.loading(t('campaignDetail.toasts.transactionPending'), { id: 'tx' });
      toast.success(t('campaignDetail.toasts.contributionSuccess'), { id: 'tx' });

      // Record in backend
      await contributionAPI.create({
        campaign_id: parseInt(id),
        contributor_address: user.address,
        amount: ethers.parseEther(amount).toString(),
        transaction_hash: tx.hash
      });

      setShowModal(false);
      setAmount('');
      loadCampaign();
    } catch (error) {
      console.error('Contribution error:', error);
      toast.error(
        error.code === 'ACTION_REJECTED' || error.code === 4001
          ? t('common.transactionRejected')
          : t('campaignDetail.toasts.contributionFailed'),
        { id: 'tx' }
      );
    } finally {
      setContributing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!provider) {
      toast.error(t('common.walletNotConnected'));
      return;
    }

    setWithdrawing(true);
    try {
      toast.loading(t('campaignDetail.toasts.withdrawSubmitting'), { id: 'withdraw' });
      const { tx } = await withdrawCampaignFunds(provider, campaign.contract_address);
      setWithdrawTxHash(tx.hash);
      setCanWithdraw(false);
      setEscrowBalance('0');
      setWithdrawHint({ key: 'campaignDetail.withdrawHints.alreadyWithdrawn', params: {} });
      toast.success(t('campaignDetail.toasts.withdrawSuccess'), { id: 'withdraw' });
      await loadCampaign();
    } catch (error) {
      console.error('Withdraw error:', error);
      toast.error(
        error.code === 'ACTION_REJECTED' || error.code === 4001
          ? t('common.transactionRejected')
          : t('campaignDetail.toasts.withdrawFailed'),
        { id: 'withdraw' }
      );
    } finally {
      setWithdrawing(false);
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

  const calculateProgress = () => {
    if (!campaign?.total_raised || !campaign?.goal_amount || campaign.goal_amount === '0') return 0;
    try {
      const r = BigInt(campaign.total_raised);
      const g = BigInt(campaign.goal_amount);
      return Math.min(Number((r * BigInt(100)) / g), 100);
    } catch {
      return 0;
    }
  };

  const getTimeRemaining = () => {
    if (!campaign?.deadline) return t('common.noDeadline');
    const deadline = new Date(campaign.deadline);
    const now = new Date();
    const diff = deadline - now;
    
    if (diff <= 0) return t('common.ended');
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return t('common.daysLeft', { count: days });
    if (hours > 0) return t('common.hoursLeft', { count: hours });
    return t('common.endingSoon');
  };

  const getStateLabel = (state) => t(`campaignStates.${normalizeCampaignState(state)}`);

  const isFounder = !!user?.address && !!campaign?.founder_address && user.address.toLowerCase() === campaign.founder_address.toLowerCase();
  const withdrawHintParams = withdrawHint.key === 'campaignDetail.withdrawHints.stateBlocked'
    ? {
        ...withdrawHint.params,
        state: t(`campaignStates.${withdrawHint.params.state}`, { defaultValue: withdrawHint.params.state }),
      }
    : withdrawHint.params;

  if (loading) {
    return (
      <div className="campaign-detail loading">
        <div className="spinner"></div>
        <p>{t('campaignDetail.loading')}</p>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="campaign-detail not-found">
        <h2>{t('campaignDetail.notFoundTitle')}</h2>
        <p>{t('campaignDetail.notFoundBody')}</p>
        <Link to="/campaigns" className="btn btn-primary">
          {t('campaignDetail.viewAllCampaigns')}
        </Link>
      </div>
    );
  }

  return (
    <div className="campaign-detail">
      <div className="campaign-detail-container">
        {/* Campaign Header */}
        <div className="campaign-header">
          <div className="campaign-media">
            {campaign.image_url ? (
              <img src={campaign.image_url} alt={campaign.title} />
            ) : (
              <div className="campaign-placeholder">
                <span>🎯</span>
              </div>
            )}
          </div>
          <div className="campaign-info">
            <div className="campaign-badges">
              <span className={`state-badge state-${campaign.state?.toLowerCase()}`}>
                {getStateLabel(campaign.state)}
              </span>
              <span className="time-badge">{getTimeRemaining()}</span>
            </div>
            <h1 className="campaign-title">{campaign.title}</h1>
            <p className="campaign-creator">
              {t('campaignDetail.createdBy')} <span>{formatAddress(campaign.founder_address)}</span>
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="campaign-main">
          {/* Left Column - Description */}
          <div className="campaign-left">
            <div className="section">
              <h2>{t('campaignDetail.aboutTitle')}</h2>
              <div className="description">
                {campaign.description || t('campaignDetail.noDescription')}
              </div>
            </div>

            {/* Updates Section */}
            {campaign.updates && campaign.updates.length > 0 && (
              <div className="section">
                <h2>{t('campaignDetail.updatesTitle')}</h2>
                <div className="updates-list">
                  {campaign.updates.map((update, index) => (
                    <div key={index} className="update-card">
                      <div className="update-date">
                        {new Date(update.created_at).toLocaleDateString(locale)}
                      </div>
                      <h4>{update.title}</h4>
                      <p>{update.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contributors Section */}
            <div className="section">
              <h2>{t('campaignDetail.contributorsTitle', { count: contributions.length })}</h2>
              {contributions.length > 0 ? (
                <div className="contributors-list">
                  {contributions.slice(0, 10).map((contrib, index) => (
                    <div key={index} className="contributor-row">
                      <span className="contributor-address">
                        {formatAddress(contrib.contributor_address)}
                      </span>
                      <span className="contributor-amount">
                        {formatAmount(contrib.amount)} KGST
                      </span>
                    </div>
                  ))}
                  {contributions.length > 10 && (
                    <p className="more-contributors">
                      {t('campaignDetail.moreContributors', { count: contributions.length - 10 })}
                    </p>
                  )}
                </div>
              ) : (
                <p className="no-contributors">
                  {t('campaignDetail.noContributors')}
                </p>
              )}
            </div>
          </div>

          {/* Right Column - Funding Card */}
          <div className="campaign-right">
            <div className="funding-card">
              <div className="funding-amount">
                <span className="amount">{formatAmount(campaign.total_raised)}</span>
                <span className="unit">KGST</span>
                <span className="goal">{t('campaignDetail.goalSummary', { amount: formatAmount(campaign.goal_amount) })}</span>
              </div>

              <div className="progress-section">
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${calculateProgress()}%` }}
                  />
                </div>
                <div className="progress-info">
                  <span>{t('campaignDetail.fundedProgress', { percent: calculateProgress() })}</span>
                  <span>{t('campaignDetail.backersCount', { count: campaign.contributor_count || 0 })}</span>
                </div>
              </div>

              {campaign.state === 'Active' && (
                <button 
                  className="btn btn-contribute"
                  onClick={() => isConnected ? setShowModal(true) : connect()}
                >
                  {isConnected ? t('campaignDetail.contributeButton') : t('campaignDetail.connectToContribute')}
                </button>
              )}

              {campaign.state === 'Successful' && (
                <div className="funded-message">
                  {t('campaignDetail.successfulMessage')}
                </div>
              )}

              {campaign.state === 'Successful' && isFounder && (
                <div className="founder-actions">
                  <h3>{t('campaignDetail.founderWithdrawalTitle')}</h3>
                  <p>{t('campaignDetail.founderWithdrawalBody')}</p>
                  <div className="founder-withdraw-hint">
                    {t('campaignDetail.escrowBalance', { amount: formatAmount(escrowBalance) })}
                  </div>
                  {canWithdraw ? (
                    <button
                      className="btn btn-contribute founder-withdraw-btn"
                      onClick={handleWithdraw}
                      disabled={withdrawing}
                    >
                      {withdrawing ? t('campaignDetail.withdrawingButton') : t('campaignDetail.withdrawButton')}
                    </button>
                  ) : (
                    <div className="founder-withdraw-hint">
                      {t(withdrawHint.key, withdrawHintParams)}
                    </div>
                  )}
                  {withdrawTxHash && (
                    <a
                      href={explorerTxUrl(withdrawTxHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="withdraw-tx-link"
                    >
                      {t('campaignDetail.viewWithdrawalTx')}
                    </a>
                  )}
                </div>
              )}

              {campaign.state === 'Failed' && (
                <div className="failed-message">
                  {t('campaignDetail.failedMessage')}
                </div>
              )}

              <div className="funding-meta">
                <div className="meta-row">
                  <span className="label">{t('common.contract')}</span>
                  <a 
                    href={explorerAddressUrl(campaign.contract_address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="contract-link"
                  >
                    {formatAddress(campaign.contract_address)}
                  </a>
                </div>
                <div className="meta-row">
                  <span className="label">{t('common.deadline')}</span>
                  <span className="value">
                    {campaign.deadline 
                      ? new Date(campaign.deadline).toLocaleDateString(locale)
                      : t('common.notSet')
                    }
                  </span>
                </div>
              </div>
            </div>

            {/* Share Section */}
            <div className="share-section">
              <h3>{t('campaignDetail.shareTitle')}</h3>
              <div className="share-buttons">
                <button 
                  className="share-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success(t('campaignDetail.toasts.linkCopied'));
                  }}
                >
                  {t('campaignDetail.copyLink')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contribution Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            <h2>{t('campaignDetail.modalTitle')}</h2>
            <p className="modal-subtitle">{t('campaignDetail.modalSubtitle', { title: campaign.title })}</p>
            
            <form onSubmit={handleContribute}>
              <div className="form-group">
                <label>{t('campaignDetail.amountLabel')}</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={t('campaignDetail.amountPlaceholder')}
                  required
                />
              </div>

              <div className="quick-amounts">
                {['100', '500', '1000', '5000', '10000'].map(val => (
                  <button
                    key={val}
                    type="button"
                    className="quick-amount-btn"
                    onClick={() => setAmount(val)}
                  >
                    {val} KGST
                  </button>
                ))}
              </div>

              <button 
                type="submit" 
                className="btn btn-primary btn-full"
                disabled={contributing}
              >
                {contributing ? t('common.processing') : t('campaignDetail.modalButton', { amount: amount || '0' })}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
