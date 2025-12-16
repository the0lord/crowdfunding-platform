import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ethers } from 'ethers';
import { useAuth } from '../contexts/AuthContext';
import { campaignAPI, contributionAPI } from '../services/api';
import toast from 'react-hot-toast';
import './CampaignDetail.css';

const CAMPAIGN_ABI = [
  "function contribute() external payable",
  "function withdraw() external",
  "function refund() external",
  "function goalAmount() external view returns (uint256)",
  "function deadline() external view returns (uint256)",
  "function totalRaised() external view returns (uint256)",
  "function state() external view returns (uint8)",
  "function founder() external view returns (address)",
  "function contributorCount() external view returns (uint256)",
  "function contributions(address) external view returns (uint256)",
  "function getCurrentState() external view returns (uint8)"
];

export default function CampaignDetail() {
  const { id } = useParams();
  const { user, isConnected, connect } = useAuth();
  const [campaign, setCampaign] = useState(null);
  const [contributions, setContributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contributing, setContributing] = useState(false);
  const [amount, setAmount] = useState('');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadCampaign();
  }, [id]);

  const loadCampaign = async () => {
    try {
      const data = await campaignAPI.getById(id);
      setCampaign(data);
      
      // Load contributions
      const contribs = await contributionAPI.getByCampaign(id);
      setContributions(contribs.contributions || []);
    } catch (error) {
      console.error('Error loading campaign:', error);
      toast.error('Failed to load campaign');
    } finally {
      setLoading(false);
    }
  };

  const handleContribute = async (e) => {
    e.preventDefault();
    if (!isConnected) {
      await connect();
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setContributing(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const contract = new ethers.Contract(
        campaign.contract_address,
        CAMPAIGN_ABI,
        signer
      );

      const tx = await contract.contribute({
        value: ethers.parseEther(amount)
      });

      toast.loading('Transaction pending...', { id: 'tx' });
      await tx.wait();
      toast.success('Contribution successful!', { id: 'tx' });

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
      toast.error(error.reason || 'Contribution failed', { id: 'tx' });
    } finally {
      setContributing(false);
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
    if (!campaign?.deadline) return 'No deadline';
    const deadline = new Date(campaign.deadline);
    const now = new Date();
    const diff = deadline - now;
    
    if (diff <= 0) return 'Ended';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days} days left`;
    if (hours > 0) return `${hours} hours left`;
    return 'Ending soon';
  };

  if (loading) {
    return (
      <div className="campaign-detail loading">
        <div className="spinner"></div>
        <p>Loading campaign...</p>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="campaign-detail not-found">
        <h2>Campaign Not Found</h2>
        <p>The campaign you're looking for doesn't exist.</p>
        <Link to="/campaigns" className="btn btn-primary">
          View All Campaigns
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
                {campaign.state || 'Active'}
              </span>
              <span className="time-badge">{getTimeRemaining()}</span>
            </div>
            <h1 className="campaign-title">{campaign.title}</h1>
            <p className="campaign-creator">
              Created by <span>{formatAddress(campaign.founder_address)}</span>
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="campaign-main">
          {/* Left Column - Description */}
          <div className="campaign-left">
            <div className="section">
              <h2>About this Campaign</h2>
              <div className="description">
                {campaign.description || 'No description provided.'}
              </div>
            </div>

            {/* Updates Section */}
            {campaign.updates && campaign.updates.length > 0 && (
              <div className="section">
                <h2>Updates</h2>
                <div className="updates-list">
                  {campaign.updates.map((update, index) => (
                    <div key={index} className="update-card">
                      <div className="update-date">
                        {new Date(update.created_at).toLocaleDateString()}
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
              <h2>Contributors ({contributions.length})</h2>
              {contributions.length > 0 ? (
                <div className="contributors-list">
                  {contributions.slice(0, 10).map((contrib, index) => (
                    <div key={index} className="contributor-row">
                      <span className="contributor-address">
                        {formatAddress(contrib.contributor_address)}
                      </span>
                      <span className="contributor-amount">
                        {formatAmount(contrib.amount)} POL
                      </span>
                    </div>
                  ))}
                  {contributions.length > 10 && (
                    <p className="more-contributors">
                      +{contributions.length - 10} more contributors
                    </p>
                  )}
                </div>
              ) : (
                <p className="no-contributors">
                  No contributions yet. Be the first!
                </p>
              )}
            </div>
          </div>

          {/* Right Column - Funding Card */}
          <div className="campaign-right">
            <div className="funding-card">
              <div className="funding-amount">
                <span className="amount">{formatAmount(campaign.total_raised)}</span>
                <span className="unit">POL</span>
                <span className="goal">of {formatAmount(campaign.goal_amount)} POL goal</span>
              </div>

              <div className="progress-section">
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${calculateProgress()}%` }}
                  />
                </div>
                <div className="progress-info">
                  <span>{calculateProgress()}% funded</span>
                  <span>{campaign.contributor_count || 0} backers</span>
                </div>
              </div>

              {campaign.state === 'Active' && (
                <button 
                  className="btn btn-contribute"
                  onClick={() => isConnected ? setShowModal(true) : connect()}
                >
                  {isConnected ? 'Contribute' : 'Connect Wallet to Contribute'}
                </button>
              )}

              {campaign.state === 'Successful' && (
                <div className="funded-message">
                  ✅ This campaign has been successfully funded!
                </div>
              )}

              {campaign.state === 'Failed' && (
                <div className="failed-message">
                  ❌ This campaign did not reach its goal.
                </div>
              )}

              <div className="funding-meta">
                <div className="meta-row">
                  <span className="label">Contract</span>
                  <a 
                    href={`https://amoy.polygonscan.com/address/${campaign.contract_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="contract-link"
                  >
                    {formatAddress(campaign.contract_address)}
                  </a>
                </div>
                <div className="meta-row">
                  <span className="label">Deadline</span>
                  <span className="value">
                    {campaign.deadline 
                      ? new Date(campaign.deadline).toLocaleDateString()
                      : 'Not set'
                    }
                  </span>
                </div>
              </div>
            </div>

            {/* Share Section */}
            <div className="share-section">
              <h3>Share this Campaign</h3>
              <div className="share-buttons">
                <button 
                  className="share-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success('Link copied!');
                  }}
                >
                  📋 Copy Link
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
            <h2>Contribute to Campaign</h2>
            <p className="modal-subtitle">Support "{campaign.title}"</p>
            
            <form onSubmit={handleContribute}>
              <div className="form-group">
                <label>Amount (POL)</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount in POL"
                  required
                />
              </div>

              <div className="quick-amounts">
                {['0.1', '0.5', '1', '5', '10'].map(val => (
                  <button
                    key={val}
                    type="button"
                    className="quick-amount-btn"
                    onClick={() => setAmount(val)}
                  >
                    {val} POL
                  </button>
                ))}
              </div>

              <button 
                type="submit" 
                className="btn btn-primary btn-full"
                disabled={contributing}
              >
                {contributing ? 'Processing...' : `Contribute ${amount || '0'} POL`}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
