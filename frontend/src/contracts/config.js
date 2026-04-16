/**
 * Multi-chain configuration for KGST Crowdfunding Platform
 *
 * BSC  — Campaigns + KGST payments
 * Polygon — Governance (GovernanceToken, CrowdfundDAO, UserRegistry)
 *
 * Real KGST token on BSC mainnet: 0x94be0bbA8E1E303fE998c9360B57b826F1A4f828
 */

// ─── BSC Chain Config (campaigns) ───
export const BSC_TESTNET = {
  chainId: 97,
  chainIdHex: '0x61',
  name: 'BNB Smart Chain Testnet',
  rpc: import.meta.env.VITE_BSC_RPC || 'https://data-seed-prebsc-1-s1.binance.org:8545/',
  explorer: import.meta.env.VITE_BSC_EXPLORER || 'https://testnet.bscscan.com',
  currency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
};

export const BSC_MAINNET = {
  chainId: 56,
  chainIdHex: '0x38',
  name: 'BNB Smart Chain',
  rpc: 'https://bsc-dataseed.bnbchain.org/',
  explorer: 'https://bscscan.com',
  currency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
};

// ─── Polygon Chain Config (governance) ───
export const POLYGON_AMOY = {
  chainId: 80002,
  chainIdHex: '0x13882',
  name: 'Polygon Amoy Testnet',
  rpc: import.meta.env.VITE_POLYGON_RPC || 'https://polygon-amoy-bor-rpc.publicnode.com',
  explorer: import.meta.env.VITE_POLYGON_EXPLORER || 'https://amoy.polygonscan.com',
  currency: { name: 'POL', symbol: 'POL', decimals: 18 },
};

// ─── Active chains for the platform ───
// Change these when switching to mainnet
export const CAMPAIGN_CHAIN = BSC_TESTNET;
export const GOVERNANCE_CHAIN = POLYGON_AMOY;

// ─── Contract Addresses ───
export const CONTRACTS = {
  // BSC (campaigns)
  KGST: import.meta.env.VITE_KGST_ADDRESS || '',
  CampaignFactory: import.meta.env.VITE_FACTORY_ADDRESS || '',
  CampaignImpl: import.meta.env.VITE_CAMPAIGN_IMPL_ADDRESS || '',

  // Polygon (governance)
  GovernanceToken: import.meta.env.VITE_GOV_TOKEN_ADDRESS || '',
  CrowdfundDAO: import.meta.env.VITE_DAO_ADDRESS || '',
  UserRegistry: import.meta.env.VITE_USER_REGISTRY_ADDRESS || '',

  // Real KGST on BSC mainnet (reference)
  REAL_KGST: '0x94be0bbA8E1E303fE998c9360B57b826F1A4f828',
};

export const GOVERNANCE_START_BLOCK = Number(import.meta.env.VITE_DAO_DEPLOYMENT_BLOCK || 0);

export const GOVERNANCE_READY = Boolean(CONTRACTS.GovernanceToken && CONTRACTS.CrowdfundDAO);

// ─── For Web3Auth chain config ───
export function getWeb3AuthChainConfig(chain) {
  return {
    chainNamespace: 'eip155',
    chainId: chain.chainIdHex,
    rpcTarget: chain.rpc,
    displayName: chain.name,
    blockExplorerUrl: chain.explorer,
    ticker: chain.currency.symbol,
    tickerName: chain.currency.name,
    logo: chain === BSC_TESTNET || chain === BSC_MAINNET
      ? 'https://cryptologos.cc/logos/bnb-bnb-logo.svg'
      : 'https://cryptologos.cc/logos/polygon-matic-logo.svg',
  };
}
