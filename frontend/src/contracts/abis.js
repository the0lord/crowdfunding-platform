/**
 * Minimal ABI fragments for on-chain interaction.
 * Full ABIs are in contracts/deployments/abi/ — these are the subset the frontend needs.
 */

// ─── ERC-20 (KGST / MockKGST) ───
export const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
];

// MockKGST testnet faucet
export const MOCK_KGST_ABI = [
  ...ERC20_ABI,
  'function faucet() external',
  'function lastClaim(address) view returns (uint256)',
  'function FAUCET_AMOUNT() view returns (uint256)',
  'function FAUCET_COOLDOWN() view returns (uint256)',
];

// ─── Campaign (ERC-20 version) ───
export const CAMPAIGN_ABI = [
  'function contribute(uint256 amount) external',
  'function withdraw() external',
  'function refund() external',
  'function goalAmount() view returns (uint256)',
  'function deadline() view returns (uint256)',
  'function totalRaised() view returns (uint256)',
  'function state() view returns (uint8)',
  'function founder() view returns (address)',
  'function contributorCount() view returns (uint256)',
  'function contributions(address) view returns (uint256)',
  'function getCurrentState() view returns (uint8)',
  'function paymentToken() view returns (address)',
  'function title() view returns (string)',
  'event ContributionReceived(address indexed contributor, uint256 amount, uint256 newTotal, uint256 timestamp)',
  'event FundsWithdrawn(address indexed founder, uint256 amount, uint256 platformFee, uint256 timestamp)',
  'event RefundIssued(address indexed contributor, uint256 amount, uint256 timestamp)',
];

// ─── CampaignFactory ───
export const FACTORY_ABI = [
  'function createCampaign(uint256 _goalAmount, uint256 _durationDays, string _title, string _description, string _imageURI) external returns (address)',
  'function paymentToken() view returns (address)',
  'function platformWallet() view returns (address)',
  'function campaignImplementation() view returns (address)',
  'function getCampaignCount() view returns (uint256)',
  'function campaigns(uint256) view returns (address)',
  'function isCampaign(address) view returns (bool)',
  'function getCampaignsByFounder(address) view returns (address[])',
  'function getCampaignStatus(address) view returns (uint8 status, uint256 flagCount, bytes32 rejectionCode)',
  'event CampaignCreated(address indexed campaign, address indexed founder, uint256 goalAmount, uint256 deadline, uint256 campaignId)',
];

// ─── GovernanceToken (soulbound) ───
export const GOV_TOKEN_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function holderCount() view returns (uint256)',
  'function activityScore(address) view returns (uint256)',
  'function delegate(address delegatee) external',
  'function delegates(address account) view returns (address)',
  'function getVotes(address account) view returns (uint256)',
];

export const DAO_ABI = [
  'function name() view returns (string)',
  'function governanceSignal() external',
  'function proposalMetadata(uint256) view returns (uint8 proposalType, string title, string description, address proposer, uint256 createdAt)',
  'function proposeWithMetadata(address[] targets, uint256[] values, bytes[] calldatas, string _title, string _description, uint8 _type) returns (uint256)',
  'function state(uint256 proposalId) view returns (uint8)',
  'function proposalSnapshot(uint256 proposalId) view returns (uint256)',
  'function proposalDeadline(uint256 proposalId) view returns (uint256)',
  'function proposalNeedsQueuing(uint256 proposalId) view returns (bool)',
  'function proposalEta(uint256 proposalId) view returns (uint256)',
  'function proposalVotes(uint256 proposalId) view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)',
  'function hasVoted(uint256 proposalId, address account) view returns (bool)',
  'function proposalThreshold() view returns (uint256)',
  'function votingDelay() view returns (uint256)',
  'function votingPeriod() view returns (uint256)',
  'function quorumPercent() view returns (uint256)',
  'function totalProposals() view returns (uint256)',
  'function queue(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) returns (uint256)',
  'function execute(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) payable returns (uint256)',
  'function castVote(uint256 proposalId, uint8 support) returns (uint256)',
  'function castVoteWithReason(uint256 proposalId, uint8 support, string reason) returns (uint256)',
  'event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)',
  'event ProposalCreatedWithMetadata(uint256 indexed proposalId, uint8 proposalType, string title, address indexed proposer)',
  'event ProposalQueued(uint256 proposalId, uint256 etaSeconds)',
  'event ProposalExecuted(uint256 proposalId)',
  'event VoteCast(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason)',
  'event GovernanceSignalExecuted(uint256 timestamp, uint256 blockNumber)',
];
