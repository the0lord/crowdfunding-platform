import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './App.css';

const FACTORY_ADDRESS = '0x94B09c15E4E8f96D23883E1b24fD872EA6e06EF0';
const RPC_URL = 'https://rpc-amoy.polygon.technology/';
const API_URL = 'http://localhost:8080/api/v1';

function App() {
  const [account, setAccount] = useState('');
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [apiStatus, setApiStatus] = useState('Checking...');

  // Check API health
  useEffect(() => {
    fetch(`${API_URL.replace('/api/v1', '')}/health`)
      .then(res => res.json())
      .then(data => setApiStatus(`✓ ${data.service} v${data.version}`))
      .catch(() => setApiStatus('✗ API Offline'));
  }, []);

  // Connect wallet
  const connectWallet = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const accounts = await window.ethereum.request({ 
          method: 'eth_requestAccounts' 
        });
        setAccount(accounts[0]);
        
        // Switch to Polygon Amoy
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x13882' }], // 80002 in hex
          });
        } catch (switchError) {
          // Chain not added, add it
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x13882',
                chainName: 'Polygon Amoy Testnet',
                nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
                rpcUrls: [RPC_URL],
                blockExplorerUrls: ['https://amoy.polygonscan.com/']
              }]
            });
          }
        }
      } catch (error) {
        console.error('Error connecting wallet:', error);
        alert('Failed to connect wallet');
      }
    } else {
      alert('Please install MetaMask!');
    }
  };

  // Load campaigns from API
  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/campaigns?status=approved&page=1&page_size=10`);
      const data = await response.json();
      setCampaigns(data.campaigns || []);
    } catch (error) {
      console.error('Error loading campaigns:', error);
    }
    setLoading(false);
  };

  // Format address
  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // Format amount (assuming wei)
  const formatAmount = (amount) => {
    if (!amount || amount === '0') return '0 POL';
    try {
      return `${ethers.formatEther(amount)} POL`;
    } catch {
      return '0 POL';
    }
  };

  return (
    <div className="App">
      {/* Header */}
      <header className="header">
        <div className="container">
          <h1>🚀 Crowdfunding Platform</h1>
          <div className="header-right">
            <span className="api-status">{apiStatus}</span>
            {account ? (
              <div className="account-info">
                <span className="account-badge">{formatAddress(account)}</span>
              </div>
            ) : (
              <button className="connect-btn" onClick={connectWallet}>
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero">
        <div className="container">
          <h2>Decentralized Crowdfunding</h2>
          <p>Fund projects you believe in. Powered by blockchain technology.</p>
          <div className="stats">
            <div className="stat-card">
              <h3>{campaigns.length}</h3>
              <p>Active Campaigns</p>
            </div>
            <div className="stat-card">
              <h3>{formatAddress(FACTORY_ADDRESS)}</h3>
              <p>Factory Contract</p>
            </div>
            <div className="stat-card">
              <h3>Polygon Amoy</h3>
              <p>Network</p>
            </div>
          </div>
          <button className="load-btn" onClick={loadCampaigns} disabled={loading}>
            {loading ? 'Loading...' : 'Load Campaigns'}
          </button>
        </div>
      </section>

      {/* Campaigns Section */}
      {campaigns.length > 0 && (
        <section className="campaigns">
          <div className="container">
            <h2>Featured Campaigns</h2>
            <div className="campaigns-grid">
              {campaigns.map((campaign, index) => (
                <div key={campaign.id || index} className="campaign-card">
                  <div className="campaign-header">
                    <h3>{campaign.title || 'Untitled Campaign'}</h3>
                    <span className={`status-badge status-${campaign.state?.toLowerCase()}`}>
                      {campaign.state || 'Active'}
                    </span>
                  </div>
                  <p className="campaign-description">
                    {campaign.description?.substring(0, 100) || 'No description'}...
                  </p>
                  <div className="campaign-stats">
                    <div>
                      <strong>Goal:</strong> {formatAmount(campaign.goal_amount)}
                    </div>
                    <div>
                      <strong>Raised:</strong> {formatAmount(campaign.total_raised)}
                    </div>
                    <div>
                      <strong>Contributors:</strong> {campaign.contributor_count || 0}
                    </div>
                  </div>
                  <div className="campaign-footer">
                    <small>By: {formatAddress(campaign.founder_address)}</small>
                    <a 
                      href={`https://amoy.polygonscan.com/address/${campaign.contract_address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="view-btn"
                    >
                      View on PolygonScan
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Features Section */}
      <section className="features">
        <div className="container">
          <h2>Platform Features</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🔒</div>
              <h3>Secure & Transparent</h3>
              <p>All transactions on blockchain with full transparency</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3>Gas Optimized</h3>
              <p>71.2% gas savings using EIP-1167 minimal proxy pattern</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">✅</div>
              <h3>Moderated</h3>
              <p>On-chain moderation ensures quality campaigns</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🌐</div>
              <h3>Polygon Network</h3>
              <p>Low fees and fast transactions on Polygon</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <p>© 2025 Crowdfunding Platform - Built with React, Go & Solidity</p>
          <p>Deployed on Polygon Amoy Testnet</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
