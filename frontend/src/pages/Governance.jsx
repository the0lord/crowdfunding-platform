import { useEffect, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import {
  CONTRACTS,
  GOVERNANCE_CHAIN,
  GOVERNANCE_READY,
  GOVERNANCE_START_BLOCK,
  castGovernanceVote,
  createGovernanceSignalProposal,
  delegateGovernance,
  executeGovernanceProposal,
  governanceAddressUrl,
  governanceTxUrl,
  getGovernanceOverview,
  listGovernanceProposals,
  listGovernanceVotes,
  queueGovernanceProposal,
} from '../contracts';
import './Governance.css';

const PROPOSAL_TYPES = [
  { value: 0, key: 'parameterChange' },
  { value: 1, key: 'treasurySpend' },
  { value: 2, key: 'contractUpgrade' },
  { value: 3, key: 'emergency' },
  { value: 4, key: 'campaignAppeal' },
];

const STATUS_FILTERS = [
  { value: '' },
  { value: 'pending' },
  { value: 'active' },
  { value: 'succeeded' },
  { value: 'queued' },
  { value: 'executed' },
  { value: 'defeated' },
];

const VOTE_OPTIONS = [
  { value: 1, key: 'for', className: 'btn-vote-for' },
  { value: 0, key: 'against', className: 'btn-vote-against' },
  { value: 2, key: 'abstain', className: 'btn-vote-abstain' },
];

function formatGov(value, locale) {
  return Number.parseFloat(ethers.formatEther(value || '0')).toLocaleString(locale, {
    maximumFractionDigits: 2,
  });
}

function formatAddress(address, fallback = 'Not set') {
  if (!address) return fallback;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getProposalType(proposalType) {
  return PROPOSAL_TYPES.find((type) => type.value === proposalType) || PROPOSAL_TYPES[0];
}

function calculateVoteWidth(currentValue, totalValue) {
  const current = BigInt(currentValue || '0');
  const total = BigInt(totalValue || '0');

  if (total <= 0n) {
    return 0;
  }

  return Number((current * 10000n) / total) / 100;
}

function getTotalVotePower(proposal) {
  return (
    BigInt(proposal.votesFor || '0') +
    BigInt(proposal.votesAgainst || '0') +
    BigInt(proposal.votesAbstain || '0')
  ).toString();
}

function formatTimestamp(timestamp, locale, fallback = 'Unknown time') {
  if (!timestamp) return fallback;
  return new Date(timestamp * 1000).toLocaleString(locale);
}

export default function Governance() {
  const { t, i18n } = useTranslation();
  const { user, isConnected, provider } = useAuth();
  const [allProposals, setAllProposals] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [selectedVotes, setSelectedVotes] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [voteReason, setVoteReason] = useState('');

  const [newProposal, setNewProposal] = useState({
    title: '',
    description: '',
    proposalType: PROPOSAL_TYPES[0].value,
  });

  const locale = i18n.language?.startsWith('ru') ? 'ru-RU' : 'en-US';
  const localizedStatusFilters = STATUS_FILTERS.map((filter) => ({
    ...filter,
    label: filter.value ? t(`governance.statuses.${filter.value}`) : t('governance.filters.all'),
  }));
  const localizedVoteOptions = VOTE_OPTIONS.map((option) => ({
    ...option,
    label: t(`governance.voteOptions.${option.key}`),
  }));

  const getProposalTypeDetails = (proposalType) => {
    const proposalTypeInfo = getProposalType(proposalType);

    return {
      ...proposalTypeInfo,
      label: t(`governance.proposalTypes.${proposalTypeInfo.key}.label`),
      desc: t(`governance.proposalTypes.${proposalTypeInfo.key}.description`),
    };
  };

  const getGovernanceStateLabel = (stateKey) => t(`governance.statuses.${stateKey}`, { defaultValue: stateKey });
  const getVoteSupportLabel = (support) => {
    if (support === 1) return t('governance.voteOptions.for');
    if (support === 0) return t('governance.voteOptions.against');
    return t('governance.voteOptions.abstain');
  };
  const formatGovAmount = (value) => formatGov(value, locale);
  const formatProposalTime = (timestamp) => formatTimestamp(timestamp, locale, t('governance.proposal.unknownTime'));
  const getActionError = (fallbackKey, error) => (
    error?.code === 'ACTION_REJECTED' || error?.code === 4001
      ? t('common.transactionRejected')
      : t(fallbackKey)
  );

  const loadGenerationRef = useRef(0);

  useEffect(() => {
    loadGovernance();
  }, [statusFilter, user?.address]);

  const loadGovernance = async (proposalIdToRefresh = null) => {
    if (!GOVERNANCE_READY) {
      setLoading(false);
      return;
    }

    const generation = ++loadGenerationRef.current;
    setLoading(true);
    try {
      const [chainProposals, nextOverview] = await Promise.all([
        listGovernanceProposals(user?.address),
        getGovernanceOverview(user?.address),
      ]);

      if (loadGenerationRef.current !== generation) return;

      const filteredProposals = statusFilter
        ? chainProposals.filter((proposal) => proposal.stateKey === statusFilter)
        : chainProposals;

      setOverview(nextOverview);
      setAllProposals(chainProposals);
      setProposals(filteredProposals);

      const selectedId = proposalIdToRefresh || selectedProposal?.id;
      if (selectedId) {
        const refreshedProposal = chainProposals.find((proposal) => proposal.id === selectedId);
        setSelectedProposal(refreshedProposal || null);

        if (refreshedProposal) {
          const votes = await listGovernanceVotes(selectedId);
          if (loadGenerationRef.current !== generation) return;
          setSelectedVotes(votes);
        } else {
          setSelectedVotes([]);
        }
      }
    } catch (error) {
      if (loadGenerationRef.current !== generation) return;
      console.error('Failed to load on-chain governance data:', error);
      toast.error(t('governance.toasts.loadFailed'));
    } finally {
      if (loadGenerationRef.current === generation) setLoading(false);
    }
  };

  const openProposal = async (proposal) => {
    setSelectedProposal(proposal);
    try {
      const votes = await listGovernanceVotes(proposal.id);
      setSelectedVotes(votes);
    } catch (error) {
      console.error('Failed to load proposal votes:', error);
      setSelectedVotes([]);
      toast.error(t('governance.toasts.loadVotesFailed'));
    }
  };

  const handleCreateProposal = async (e) => {
    e.preventDefault();
    if (!provider || !user?.address) {
      toast.error(t('governance.toasts.connectVotingPowerFirst'));
      return;
    }

    setActionLoading(true);
    try {
      toast.loading(t('governance.toasts.submittingProposal'), { id: 'gov-create' });
      const result = await createGovernanceSignalProposal(provider, {
        title: newProposal.title,
        description: newProposal.description,
        proposalType: newProposal.proposalType,
      });
      toast.success(t('governance.toasts.proposalSubmitted'), { id: 'gov-create' });
      setShowCreate(false);
      setNewProposal({ title: '', description: '', proposalType: PROPOSAL_TYPES[0].value });
      await loadGovernance(result.proposalId);
    } catch (error) {
      console.error('Failed to create proposal:', error);
      toast.error(getActionError('governance.toasts.createFailed', error), { id: 'gov-create' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleVote = async (proposalId, support) => {
    if (!provider || !user?.address) {
      toast.error(t('common.connectWalletFirst'));
      return;
    }

    setActionLoading(true);
    try {
      toast.loading(t('governance.toasts.submittingVote'), { id: 'gov-vote' });
      await castGovernanceVote(provider, proposalId, support, voteReason);
      toast.success(t('governance.toasts.voteRecorded'), { id: 'gov-vote' });
      setVoteReason('');
      await loadGovernance(proposalId);
    } catch (error) {
      console.error('Failed to cast vote:', error);
      toast.error(getActionError('governance.toasts.voteFailed', error), { id: 'gov-vote' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelegate = async () => {
    if (!provider || !user?.address) {
      toast.error(t('common.connectWalletFirst'));
      return;
    }

    setActionLoading(true);
    try {
      toast.loading(t('governance.toasts.delegating'), { id: 'gov-delegate' });
      await delegateGovernance(provider);
      toast.success(t('governance.toasts.delegationComplete'), { id: 'gov-delegate' });
      await loadGovernance(selectedProposal?.id || null);
    } catch (error) {
      console.error('Failed to delegate GOV:', error);
      toast.error(getActionError('governance.toasts.delegateFailed', error), { id: 'gov-delegate' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleQueue = async () => {
    if (!provider || !selectedProposal) {
      return;
    }

    setActionLoading(true);
    try {
      toast.loading(t('governance.toasts.queueing'), { id: 'gov-queue' });
      await queueGovernanceProposal(provider, selectedProposal);
      toast.success(t('governance.toasts.queued'), { id: 'gov-queue' });
      await loadGovernance(selectedProposal.id);
    } catch (error) {
      console.error('Failed to queue proposal:', error);
      toast.error(getActionError('governance.toasts.queueFailed', error), { id: 'gov-queue' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!provider || !selectedProposal) {
      return;
    }

    setActionLoading(true);
    try {
      toast.loading(t('governance.toasts.executing'), { id: 'gov-execute' });
      await executeGovernanceProposal(provider, selectedProposal);
      toast.success(t('governance.toasts.executed'), { id: 'gov-execute' });
      await loadGovernance(selectedProposal.id);
    } catch (error) {
      console.error('Failed to execute proposal:', error);
      toast.error(getActionError('governance.toasts.executeFailed', error), { id: 'gov-execute' });
    } finally {
      setActionLoading(false);
    }
  };

  const totalVotes = allProposals.reduce(
    (accumulator, proposal) => accumulator + BigInt(getTotalVotePower(proposal)),
    0n
  );
  const activeProposalCount = allProposals.filter((proposal) => proposal.stateKey === 'active').length;
  const actionableProposalCount = allProposals.filter(
    (proposal) => proposal.stateKey === 'queued' || proposal.stateKey === 'succeeded'
  ).length;

  const nowTimestamp = Math.floor(Date.now() / 1000);

  if (!GOVERNANCE_READY) {
    return (
      <div className="governance-page">
        <div className="gov-warning gov-surface">
          <h2>{t('governance.notConfiguredTitle')}</h2>
          <p>{t('governance.notConfiguredBody')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="governance-page">
      <section className="gov-hero gov-surface">
        <div className="gov-title">
          <span className="gov-kicker">{t('governance.heroKicker')}</span>
          <h1>{t('governance.title')}</h1>
          <p>{t('governance.heroBody', { network: GOVERNANCE_CHAIN.name })}</p>
        </div>
        <div className="gov-hero-actions">
          <span className="gov-hero-pill">{GOVERNANCE_CHAIN.name}</span>
          {isConnected && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              {t('governance.newProposal')}
            </button>
          )}
        </div>
      </section>

      <div className="gov-overview-grid">
        <section className="gov-panel gov-surface">
          <span className="gov-kicker">{t('governance.protocolKicker')}</span>
          <h3>{t('governance.protocolTitle')}</h3>
          <p className="gov-note">{t('governance.protocolBody')}</p>
          <div className="gov-config-grid">
            <div>
              <span className="gov-config-label">{t('governance.labels.deploymentBlock')}</span>
              <span className="gov-config-value">{GOVERNANCE_START_BLOCK || t('common.notSet')}</span>
            </div>
            <div>
              <span className="gov-config-label">{t('governance.labels.votingDelay')}</span>
              <span className="gov-config-value">{overview?.votingDelay ?? '...'} {t('governance.labels.blocks')}</span>
            </div>
            <div>
              <span className="gov-config-label">{t('governance.labels.votingPeriod')}</span>
              <span className="gov-config-value">{overview?.votingPeriod ?? '...'} {t('governance.labels.blocks')}</span>
            </div>
            <div>
              <span className="gov-config-label">{t('governance.labels.quorum')}</span>
              <span className="gov-config-value">{overview?.quorumPercent ?? '...'}%</span>
            </div>
          </div>
          <div className="gov-contract-links">
            <a href={governanceAddressUrl(CONTRACTS.CrowdfundDAO)} target="_blank" rel="noreferrer">
              {t('governance.labels.dao')}: {formatAddress(CONTRACTS.CrowdfundDAO, t('common.notSet'))}
            </a>
            <a href={governanceAddressUrl(CONTRACTS.GovernanceToken)} target="_blank" rel="noreferrer">
              {t('governance.labels.gov')}: {formatAddress(CONTRACTS.GovernanceToken, t('common.notSet'))}
            </a>
            <a href={governanceAddressUrl(CONTRACTS.UserRegistry)} target="_blank" rel="noreferrer">
              {t('governance.labels.registry')}: {formatAddress(CONTRACTS.UserRegistry, t('common.notSet'))}
            </a>
          </div>
          <p className="gov-note">{t('governance.protocolNote')}</p>
        </section>

        <section className="gov-panel gov-surface">
          <span className="gov-kicker">{t('governance.walletKicker')}</span>
          <h3>{t('governance.walletTitle')}</h3>
          {isConnected && overview ? (
            <div className="wallet-grid">
              <div className="wallet-stat">
                <span className="wallet-stat-label">{t('common.wallet')}</span>
                <span className="wallet-stat-value">{formatAddress(user?.address, t('common.notSet'))}</span>
              </div>
              <div className="wallet-stat">
                <span className="wallet-stat-label">{t('governance.labels.govBalance')}</span>
                <span className="wallet-stat-value">{formatGovAmount(overview.walletBalance)}</span>
              </div>
              <div className="wallet-stat">
                <span className="wallet-stat-label">{t('governance.labels.votingPower')}</span>
                <span className="wallet-stat-value">{formatGovAmount(overview.currentVotes)}</span>
              </div>
              <div className="wallet-stat">
                <span className="wallet-stat-label">{t('governance.labels.delegate')}</span>
                <span className="wallet-stat-value">{formatAddress(overview.delegatee, t('common.notSet'))}</span>
              </div>
              <div className="wallet-stat wide">
                <span className="wallet-stat-label">{t('governance.labels.proposalThreshold')}</span>
                <span className="wallet-stat-value">{formatGovAmount(overview.proposalThreshold)} GOV</span>
              </div>
              <div className="wallet-stat wide">
                <span className="wallet-stat-label">{t('governance.labels.tokenHolders')}</span>
                <span className="wallet-stat-value">{overview?.holderCount ?? 0}</span>
              </div>
            </div>
          ) : (
            <p className="gov-note">{t('governance.walletConnectBody')}</p>
          )}

          {isConnected && overview && BigInt(overview.walletBalance) > 0n && !overview.hasDelegated && (
            <button className="btn btn-secondary" onClick={handleDelegate} disabled={actionLoading}>
              {t('governance.delegateSelf')}
            </button>
          )}

          {isConnected && overview && BigInt(overview.walletBalance) <= 0n && (
            <p className="gov-note">{t('governance.walletNoGov')}</p>
          )}
        </section>
      </div>

      {loading ? (
        <div className="gov-empty gov-surface">
          <p>{t('governance.loading')}</p>
        </div>
      ) : (
        <div className="gov-metrics">
          <div className="gov-stat">
            <span className="gov-stat-value">{allProposals.length}</span>
            <span className="gov-stat-label">{t('governance.labels.totalProposals')}</span>
          </div>
          <div className="gov-stat">
            <span className="gov-stat-value">{activeProposalCount}</span>
            <span className="gov-stat-label">{t('governance.labels.active')}</span>
          </div>
          <div className="gov-stat">
            <span className="gov-stat-value">{actionableProposalCount}</span>
            <span className="gov-stat-label">{t('governance.labels.actionable')}</span>
          </div>
          <div className="gov-stat">
            <span className="gov-stat-value">{formatGovAmount(totalVotes.toString())}</span>
            <span className="gov-stat-label">{t('governance.labels.votesCast')}</span>
          </div>
        </div>
      )}

      <section className="gov-filter-bar gov-surface">
        <span className="gov-kicker">{t('governance.filterKicker')}</span>
        <div className="gov-filters">
          {localizedStatusFilters.map((filter) => (
            <button
              key={filter.value || 'all'}
              className={`filter-btn ${statusFilter === filter.value ? 'active' : ''}`}
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </section>

      <div className="proposals-list">
        {proposals.length === 0 ? (
          <div className="gov-empty gov-surface">
            <p>{t('governance.empty')}</p>
          </div>
        ) : (
          proposals.map((proposal) => (
            <div
              key={proposal.id}
              className="proposal-card"
              onClick={() => openProposal(proposal)}
            >
              <div className="proposal-card-header">
                <div className="proposal-card-tags">
                  <span className={`proposal-status status-${proposal.stateKey}`}>
                    {getGovernanceStateLabel(proposal.stateKey)}
                  </span>
                  <span className="proposal-type proposal-tag">
                    {getProposalTypeDetails(proposal.proposalType).label}
                  </span>
                  {proposal.isSignalProposal && <span className="proposal-type proposal-tag">{t('governance.signalTag')}</span>}
                </div>
                <span className="proposal-meta-time">{formatProposalTime(proposal.createdAt)}</span>
              </div>
              <h3 className="proposal-title">{proposal.title}</h3>
              <p className="proposal-desc">{proposal.description?.slice(0, 180)}{proposal.description?.length > 180 ? '...' : ''}</p>
              <div className="proposal-meta">
                <span>{t('governance.by', { address: formatAddress(proposal.proposer, t('common.notSet')) })}</span>
                <span>{t('governance.govCast', { amount: formatGovAmount(getTotalVotePower(proposal)) })}</span>
                <a href={governanceTxUrl(proposal.txHash)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                  {t('governance.viewTx')}
                </a>
              </div>
              {(proposal.votesFor !== '0' || proposal.votesAgainst !== '0' || proposal.votesAbstain !== '0') && (
                <div className="vote-bar-mini">
                  <div
                    className="vote-for"
                    style={{
                      width: `${calculateVoteWidth(proposal.votesFor, getTotalVotePower(proposal))}%`,
                    }}
                  />
                  <div
                    className="vote-against"
                    style={{
                      width: `${calculateVoteWidth(proposal.votesAgainst, getTotalVotePower(proposal))}%`,
                    }}
                  />
                  <div
                    className="vote-abstain-bar"
                    style={{
                      width: `${calculateVoteWidth(proposal.votesAbstain, getTotalVotePower(proposal))}%`,
                    }}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('governance.createTitle')}</h3>
              <button className="close-btn" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateProposal} className="proposal-form">
              <p className="proposal-helper">{t('governance.createHelper')}</p>
              <div className="form-group">
                <label>{t('governance.labels.proposalType')}</label>
                <select
                  value={newProposal.proposalType}
                  onChange={(e) => setNewProposal({ ...newProposal, proposalType: Number(e.target.value) })}
                >
                  {PROPOSAL_TYPES.map((proposalType) => {
                    const proposalTypeDetails = getProposalTypeDetails(proposalType.value);

                    return (
                      <option key={proposalType.value} value={proposalType.value}>{proposalTypeDetails.label} — {proposalTypeDetails.desc}</option>
                    );
                  })}
                </select>
              </div>
              <div className="form-group">
                <label>{t('governance.labels.title')}</label>
                <input
                  type="text"
                  value={newProposal.title}
                  onChange={(e) => setNewProposal({ ...newProposal, title: e.target.value })}
                  placeholder={t('governance.titlePlaceholder')}
                  required
                />
              </div>
              <div className="form-group">
                <label>{t('common.description')}</label>
                <textarea
                  value={newProposal.description}
                  onChange={(e) => setNewProposal({ ...newProposal, description: e.target.value })}
                  placeholder={t('governance.descriptionPlaceholder')}
                  rows={6}
                  required
                />
                <span className="field-help">{t('governance.fieldHelp')}</span>
              </div>
              <button type="submit" className="btn btn-primary btn-lg" disabled={actionLoading || !overview?.canPropose}>
                {actionLoading
                  ? t('governance.creating')
                  : overview?.canPropose
                    ? t('governance.submitProposal')
                    : t('governance.notEnoughGov')}
              </button>
            </form>
          </div>
        </div>
      )}

      {selectedProposal && (
        <div className="modal-overlay" onClick={() => setSelectedProposal(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedProposal.title}</h3>
              <button className="close-btn" onClick={() => setSelectedProposal(null)}>✕</button>
            </div>
            <div className="proposal-detail">
              <div className="proposal-detail-meta">
                <span className={`proposal-status status-${selectedProposal.stateKey}`}>
                  {getGovernanceStateLabel(selectedProposal.stateKey)}
                </span>
                <span className="proposal-type">
                  {getProposalTypeDetails(selectedProposal.proposalType).label}
                </span>
                <span>{t('governance.proposer', { address: formatAddress(selectedProposal.proposer, t('common.notSet')) })}</span>
                <span className="proposal-id">{t('governance.proposalId', { id: selectedProposal.id })}</span>
              </div>

              <div className="proposal-detail-grid">
                <div className="detail-card">
                  <span className="gov-config-label">{t('common.created')}</span>
                  <span className="gov-config-value">{selectedProposal.createdAt ? new Date(selectedProposal.createdAt * 1000).toLocaleString(locale) : t('governance.proposal.unknownTime')}</span>
                </div>
                <div className="detail-card">
                  <span className="gov-config-label">{t('governance.snapshotBlock')}</span>
                  <span className="gov-config-value">{selectedProposal.snapshot}</span>
                </div>
                <div className="detail-card">
                  <span className="gov-config-label">{t('governance.deadlineBlock')}</span>
                  <span className="gov-config-value">{selectedProposal.deadline}</span>
                </div>
                <div className="detail-card">
                  <span className="gov-config-label">{t('governance.queuedEta')}</span>
                  <span className="gov-config-value">
                    {selectedProposal.eta > 0 ? new Date(selectedProposal.eta * 1000).toLocaleString(locale) : t('governance.notQueued')}
                  </span>
                </div>
              </div>

              <div className="proposal-body">
                <p>{selectedProposal.description}</p>
              </div>

              <div className="proposal-actions">
                <a href={governanceTxUrl(selectedProposal.txHash)} target="_blank" rel="noreferrer" className="btn btn-outline">
                  {t('governance.viewCreationTx')}
                </a>
                {selectedProposal.stateKey === 'succeeded' && selectedProposal.needsQueuing && (
                  <button className="btn btn-secondary" onClick={handleQueue} disabled={actionLoading}>
                    {t('governance.queueProposal')}
                  </button>
                )}
                {selectedProposal.stateKey === 'queued' && (
                  <button
                    className="btn btn-secondary"
                    onClick={handleExecute}
                    disabled={actionLoading || (selectedProposal.eta > 0 && selectedProposal.eta > nowTimestamp)}
                  >
                    {selectedProposal.eta > nowTimestamp ? t('governance.timelockNotReady') : t('governance.executeProposal')}
                  </button>
                )}
              </div>

              <div className="vote-section">
                <h4>{t('governance.votes')}</h4>
                <div className="vote-counts">
                  <div className="vote-count for">
                    <span className="vote-label">{t('governance.voteOptions.for')}</span>
                    <span className="vote-value">{formatGovAmount(selectedProposal.votesFor)}</span>
                  </div>
                  <div className="vote-count against">
                    <span className="vote-label">{t('governance.voteOptions.against')}</span>
                    <span className="vote-value">{formatGovAmount(selectedProposal.votesAgainst)}</span>
                  </div>
                  <div className="vote-count abstain">
                    <span className="vote-label">{t('governance.voteOptions.abstain')}</span>
                    <span className="vote-value">{formatGovAmount(selectedProposal.votesAbstain)}</span>
                  </div>
                </div>

                {(selectedProposal.votesFor !== '0' || selectedProposal.votesAgainst !== '0' || selectedProposal.votesAbstain !== '0') && (
                  <div className="vote-bar">
                    <div
                      className="vote-for"
                      style={{
                        width: `${calculateVoteWidth(selectedProposal.votesFor, getTotalVotePower(selectedProposal))}%`,
                      }}
                    />
                    <div
                      className="vote-against"
                      style={{
                        width: `${calculateVoteWidth(selectedProposal.votesAgainst, getTotalVotePower(selectedProposal))}%`,
                      }}
                    />
                    <div
                      className="vote-abstain-bar"
                      style={{
                        width: `${calculateVoteWidth(selectedProposal.votesAbstain, getTotalVotePower(selectedProposal))}%`,
                      }}
                    />
                  </div>
                )}
              </div>

              {isConnected && overview && BigInt(overview.walletBalance) > 0n && !overview.hasDelegated && (
                <div className="cast-vote">
                  <h4>{t('governance.delegationRequired')}</h4>
                  <p className="gov-note">{t('governance.delegationBody')}</p>
                  <button className="btn btn-secondary" onClick={handleDelegate} disabled={actionLoading}>
                    {t('governance.delegateSelf')}
                  </button>
                </div>
              )}

              {isConnected && selectedProposal.stateKey === 'active' && overview?.hasDelegated && (
                <div className="cast-vote">
                  <h4>{t('governance.castVote')}</h4>
                  {selectedProposal.hasVoted ? (
                    <p className="gov-note">{t('governance.alreadyVoted')}</p>
                  ) : (
                    <>
                      <div className="form-group">
                        <input
                          type="text"
                          value={voteReason}
                          onChange={(e) => setVoteReason(e.target.value)}
                          placeholder={t('governance.voteReasonPlaceholder')}
                        />
                      </div>
                      <div className="vote-buttons">
                        {localizedVoteOptions.map((option) => (
                          <button
                            key={option.value}
                            className={`btn ${option.className}`}
                            onClick={() => handleVote(selectedProposal.id, option.value)}
                            disabled={actionLoading || selectedProposal.hasVoted}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {selectedVotes.length > 0 && (
                <div className="vote-history">
                  <h4>{t('governance.voteHistory')}</h4>
                  {selectedVotes.map((vote, index) => (
                    <div key={`${vote.txHash}-${index}`} className="vote-entry">
                      <span className="voter">{formatAddress(vote.voter, t('common.notSet'))}</span>
                      <span className={`vote-support support-${vote.support}`}>
                        {getVoteSupportLabel(vote.support)}
                      </span>
                      <span className="vote-power">{formatGovAmount(vote.weight)} GOV</span>
                      {vote.reason && <span className="vote-reason">"{vote.reason}"</span>}
                      <a href={governanceTxUrl(vote.txHash)} target="_blank" rel="noreferrer" className="tx-link">
                        {t('governance.viewTx')}
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
