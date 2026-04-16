/**
 * Contract interaction helpers for the KGST Crowdfunding Platform.
 *
 * Usage in components:
 *   import { getKGST, getFactory, getCampaign, ensureBSCChain } from '../contracts';
 *
 *   const signer = await getSigner(provider);     // AuthContext provider
 *   await ensureBSCChain(provider);                // switch MetaMask to BSC
 *   const kgst = getKGST(signer);
 *   await kgst.approve(campaignAddr, amount);
 */

import { ethers } from 'ethers';
import {
  CONTRACTS,
  CAMPAIGN_CHAIN,
  GOVERNANCE_CHAIN,
  GOVERNANCE_READY,
  GOVERNANCE_START_BLOCK,
} from './config';
import {
  ERC20_ABI,
  MOCK_KGST_ABI,
  CAMPAIGN_ABI,
  FACTORY_ABI,
  GOV_TOKEN_ABI,
  DAO_ABI,
} from './abis';

// Re-export for convenience
export { CONTRACTS, CAMPAIGN_CHAIN } from './config';
export {
  BSC_TESTNET,
  BSC_MAINNET,
  POLYGON_AMOY,
  GOVERNANCE_CHAIN,
  GOVERNANCE_READY,
  GOVERNANCE_START_BLOCK,
  getWeb3AuthChainConfig,
} from './config';

const GOVERNOR_STATE_KEYS = [
  'pending',
  'active',
  'canceled',
  'defeated',
  'succeeded',
  'queued',
  'expired',
  'executed',
];

const PROPOSAL_TYPE_KEYS = [
  'PARAMETER_CHANGE',
  'TREASURY_SPEND',
  'CONTRACT_UPGRADE',
  'EMERGENCY',
  'CAMPAIGN_APPEAL',
];

const CAMPAIGN_STATE_KEYS = [
  'active',
  'successful',
  'failed',
  'cancelled',
];

let governanceReadProvider;
let governanceReadProviders;
let campaignReadProvider;
let campaignReadProviders;

function createStaticRpcProvider(rpcUrl, chainId) {
  return new ethers.JsonRpcProvider(rpcUrl, chainId, {
    staticNetwork: true,
    batchMaxCount: 1,
  });
}

// ─── Provider / Signer helpers ───

/** Wrap a raw EIP-1193 provider (from Web3Auth or MetaMask) in an ethers BrowserProvider */
export function getBrowserProvider(rawProvider) {
  if (!rawProvider) throw new Error('No wallet provider available');
  return new ethers.BrowserProvider(rawProvider);
}

/** Get a signer from a raw EIP-1193 provider */
export async function getSigner(rawProvider) {
  const bp = getBrowserProvider(rawProvider);
  return bp.getSigner();
}

// ─── Chain switching ───

/** Ensure the user's wallet is on the BSC chain (for campaign interactions) */
export async function ensureBSCChain(rawProvider) {
  if (!rawProvider?.request) return; // Web3Auth auto-sets chain
  try {
    await rawProvider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CAMPAIGN_CHAIN.chainIdHex }],
    });
  } catch (switchError) {
    if (switchError.code === 4902) {
      await rawProvider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: CAMPAIGN_CHAIN.chainIdHex,
          chainName: CAMPAIGN_CHAIN.name,
          nativeCurrency: CAMPAIGN_CHAIN.currency,
          rpcUrls: [CAMPAIGN_CHAIN.rpc],
          blockExplorerUrls: [CAMPAIGN_CHAIN.explorer],
        }],
      });
    } else {
      throw switchError;
    }
  }
}

/** Ensure the user's wallet is on Polygon Amoy (for governance interactions) */
export async function ensureGovernanceChain(rawProvider) {
  if (!rawProvider?.request) return;
  try {
    await rawProvider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: GOVERNANCE_CHAIN.chainIdHex }],
    });
  } catch (switchError) {
    if (switchError.code === 4902) {
      await rawProvider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: GOVERNANCE_CHAIN.chainIdHex,
          chainName: GOVERNANCE_CHAIN.name,
          nativeCurrency: GOVERNANCE_CHAIN.currency,
          rpcUrls: [GOVERNANCE_CHAIN.rpc],
          blockExplorerUrls: [GOVERNANCE_CHAIN.explorer],
        }],
      });
    } else {
      throw switchError;
    }
  }
}

// ─── Contract instances ───

/** Get the KGST / MockKGST ERC-20 contract */
export function getKGST(signerOrProvider) {
  if (!CONTRACTS.KGST) throw new Error('KGST address not configured — set VITE_KGST_ADDRESS in .env');
  return new ethers.Contract(CONTRACTS.KGST, MOCK_KGST_ABI, signerOrProvider);
}

/** Get the CampaignFactory contract */
export function getFactory(signerOrProvider) {
  if (!CONTRACTS.CampaignFactory) throw new Error('Factory address not configured — set VITE_FACTORY_ADDRESS in .env');
  return new ethers.Contract(CONTRACTS.CampaignFactory, FACTORY_ABI, signerOrProvider);
}

/** Get a Campaign contract by address */
export function getCampaign(address, signerOrProvider) {
  return new ethers.Contract(address, CAMPAIGN_ABI, signerOrProvider);
}

/** Get the GovernanceToken contract (Polygon) */
export function getGovToken(signerOrProvider) {
  if (!CONTRACTS.GovernanceToken) throw new Error('GovernanceToken address not configured');
  return new ethers.Contract(CONTRACTS.GovernanceToken, GOV_TOKEN_ABI, signerOrProvider);
}

export function getDAO(signerOrProvider) {
  if (!CONTRACTS.CrowdfundDAO) throw new Error('CrowdfundDAO address not configured');
  return new ethers.Contract(CONTRACTS.CrowdfundDAO, DAO_ABI, signerOrProvider);
}

/** Get a generic ERC-20 contract */
export function getERC20(address, signerOrProvider) {
  return new ethers.Contract(address, ERC20_ABI, signerOrProvider);
}

export function getGovernanceReadProvider() {
  if (!governanceReadProvider) {
    governanceReadProvider = getGovernanceReadProviders()[0];
  }
  return governanceReadProvider;
}

export function getGovernanceReadProviders() {
  if (!governanceReadProviders) {
    const rpcUrls = GOVERNANCE_CHAIN.chainId === 80002
      ? [
          'https://polygon-amoy-bor-rpc.publicnode.com',
          GOVERNANCE_CHAIN.rpc,
          'https://rpc-amoy.polygon.technology/',
          'https://polygon-amoy.gateway.tenderly.co',
        ]
      : [GOVERNANCE_CHAIN.rpc];

    governanceReadProviders = [...new Set(rpcUrls.filter(Boolean))]
      .map((rpcUrl) => createStaticRpcProvider(rpcUrl, GOVERNANCE_CHAIN.chainId));
  }

  return governanceReadProviders;
}

export function getCampaignReadProvider() {
  if (!campaignReadProvider) {
    campaignReadProvider = getCampaignReadProviders()[0];
  }
  return campaignReadProvider;
}

export function getCampaignReadProviders() {
  if (!campaignReadProviders) {
    const rpcUrls = [
      CAMPAIGN_CHAIN.rpc,
      'https://bsc-testnet-rpc.publicnode.com',
      'https://data-seed-prebsc-1-s1.binance.org:8545/',
      'https://data-seed-prebsc-2-s1.binance.org:8545/',
    ];
    campaignReadProviders = [...new Set(rpcUrls.filter(Boolean))]
      .map((rpcUrl) => createStaticRpcProvider(rpcUrl, CAMPAIGN_CHAIN.chainId));
  }
  return campaignReadProviders;
}

export function formatGovernanceState(stateValue) {
  const stateKey = GOVERNOR_STATE_KEYS[stateValue] || 'unknown';
  return {
    stateKey,
    stateLabel: stateKey.charAt(0).toUpperCase() + stateKey.slice(1),
  };
}

export function formatCampaignState(stateValue) {
  const stateKey = CAMPAIGN_STATE_KEYS[stateValue] || 'unknown';
  return {
    stateKey,
    stateLabel: stateKey.charAt(0).toUpperCase() + stateKey.slice(1),
  };
}

export function getProposalTypeKey(typeValue) {
  return PROPOSAL_TYPE_KEYS[typeValue] || 'UNKNOWN';
}

function getContractProvider(contract) {
  const runner = contract.runner;
  const provider = runner?.provider || runner;

  if (!provider?.getBlockNumber) {
    throw new Error('No provider available for contract log query');
  }

  return provider;
}

function getErrorText(error) {
  return [
    error?.shortMessage,
    error?.message,
    error?.error?.message,
    error?.info?.error?.message,
  ]
    .filter(Boolean)
    .join(' | ')
    .toLowerCase();
}

function isLogRangeLimitError(error) {
  const message = getErrorText(error);
  return (
    message.includes('block range exceeds configured limit') ||
    message.includes('exceed maximum block range') ||
    message.includes('maximum block range') ||
    message.includes('query returned more than') ||
    message.includes('response size exceeded') ||
    message.includes('too many results') ||
    message.includes('range is too wide')
  );
}

async function queryFilterRange(contract, filter, fromBlock, toBlock) {
  if (fromBlock > toBlock) {
    return [];
  }

  try {
    return await contract.queryFilter(filter, fromBlock, toBlock);
  } catch (error) {
    if (!isLogRangeLimitError(error) || fromBlock === toBlock) {
      throw error;
    }

    const midpoint = Math.floor((fromBlock + toBlock) / 2);
    const left = await queryFilterRange(contract, filter, fromBlock, midpoint);
    const right = await queryFilterRange(contract, filter, midpoint + 1, toBlock);
    return [...left, ...right];
  }
}

async function queryFilterAdaptive(contract, filter, fromBlock, toBlock = 'latest') {
  const provider = getContractProvider(contract);
  const resolvedFromBlock = Math.max(Number(fromBlock || 0), 0);
  const resolvedToBlock = toBlock === 'latest' || toBlock == null
    ? await provider.getBlockNumber()
    : Number(toBlock);

  return queryFilterRange(contract, filter, resolvedFromBlock, resolvedToBlock);
}

function withProviderTimeout(promise, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`RPC provider timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

async function withGovernanceReadProvider(callback) {
  let lastError;

  for (const provider of getGovernanceReadProviders()) {
    try {
      return await withProviderTimeout(callback(provider));
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No governance RPC provider available');
}

async function withCampaignReadProvider(callback) {
  let lastError;

  for (const provider of getCampaignReadProviders()) {
    try {
      return await withProviderTimeout(callback(provider));
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No campaign RPC provider available');
}

function getSignalAction(dao) {
  const daoAddress = dao.target;
  return {
    targets: [daoAddress],
    values: ['0'],
    calldatas: [dao.interface.encodeFunctionData('governanceSignal')],
  };
}

function isSignalProposal(dao, proposalActions) {
  const signal = getSignalAction(dao);

  return (
    proposalActions.targets.length === 1 &&
    proposalActions.targets[0]?.toLowerCase() === signal.targets[0]?.toLowerCase() &&
    BigInt(proposalActions.values[0] || '0') === 0n &&
    proposalActions.calldatas[0]?.toLowerCase() === signal.calldatas[0]?.toLowerCase()
  );
}

export async function getGovernanceOverview(account) {
  if (!GOVERNANCE_READY) {
    throw new Error('Governance contracts are not configured');
  }

  return withGovernanceReadProvider(async (provider) => {
    const dao = getDAO(provider);
    const govToken = getGovToken(provider);

    const [proposalThreshold, votingDelay, votingPeriod, quorumPercent, totalSupply, holderCount] = await Promise.all([
      dao.proposalThreshold(),
      dao.votingDelay(),
      dao.votingPeriod(),
      dao.quorumPercent(),
      govToken.totalSupply(),
      govToken.holderCount(),
    ]);

    let walletBalance = 0n;
    let currentVotes = 0n;
    let delegatee = ethers.ZeroAddress;

    if (account) {
      [walletBalance, currentVotes, delegatee] = await Promise.all([
        govToken.balanceOf(account),
        govToken.getVotes(account),
        govToken.delegates(account),
      ]);
    }

    return {
      proposalThreshold: proposalThreshold.toString(),
      votingDelay: Number(votingDelay),
      votingPeriod: Number(votingPeriod),
      quorumPercent: Number(quorumPercent),
      totalSupply: totalSupply.toString(),
      holderCount: Number(holderCount),
      walletBalance: walletBalance.toString(),
      currentVotes: currentVotes.toString(),
      delegatee,
      canPropose: currentVotes >= proposalThreshold,
      hasDelegated: delegatee !== ethers.ZeroAddress,
    };
  });
}

export async function listGovernanceProposals(account) {
  if (!GOVERNANCE_READY) {
    throw new Error('Governance contracts are not configured');
  }

  const fromBlock = GOVERNANCE_START_BLOCK || 0;

  return withGovernanceReadProvider(async (provider) => {
    const dao = getDAO(provider);

    const [createdEvents, metadataEvents] = await Promise.all([
      queryFilterAdaptive(dao, dao.filters.ProposalCreated(), fromBlock),
      queryFilterAdaptive(dao, dao.filters.ProposalCreatedWithMetadata(), fromBlock),
    ]);

    const createdById = new Map(
      createdEvents.map((event) => [
        event.args?.proposalId?.toString(),
        {
          targets: [...(event.args?.targets || [])],
          values: [...(event.args?.[3] || [])].map((value) => value.toString()),
          calldatas: [...(event.args?.calldatas || [])],
          description: event.args?.description || '',
          voteStart: Number(event.args?.voteStart || 0),
          voteEnd: Number(event.args?.voteEnd || 0),
          blockNumber: event.blockNumber,
          txHash: event.transactionHash,
        },
      ])
    );

    const proposals = await Promise.all(
      metadataEvents.map(async (event) => {
        const proposalId = event.args?.proposalId;
        const proposalIdText = proposalId.toString();
        const created = createdById.get(proposalIdText);
        const [metadata, stateValue, snapshot, deadline, votes, eta, needsQueuing, hasVoted] = await Promise.all([
          dao.proposalMetadata(proposalId),
          dao.state(proposalId),
          dao.proposalSnapshot(proposalId),
          dao.proposalDeadline(proposalId),
          dao.proposalVotes(proposalId),
          dao.proposalEta(proposalId),
          dao.proposalNeedsQueuing(proposalId),
          account ? dao.hasVoted(proposalId, account) : Promise.resolve(false),
        ]);

        const proposalActions = created || {
          ...getSignalAction(dao),
          description: metadata.description,
          voteStart: Number(snapshot),
          voteEnd: Number(deadline),
          blockNumber: event.blockNumber,
          txHash: event.transactionHash,
        };

        const { stateKey, stateLabel } = formatGovernanceState(Number(stateValue));

        return {
          id: proposalIdText,
          proposalType: Number(metadata.proposalType),
          proposalTypeKey: getProposalTypeKey(Number(metadata.proposalType)),
          title: metadata.title,
          description: metadata.description,
          proposer: metadata.proposer,
          createdAt: Number(metadata.createdAt),
          state: Number(stateValue),
          stateKey,
          stateLabel,
          snapshot: Number(snapshot),
          deadline: Number(deadline),
          eta: Number(eta),
          needsQueuing,
          hasVoted,
          votesFor: votes.forVotes.toString(),
          votesAgainst: votes.againstVotes.toString(),
          votesAbstain: votes.abstainVotes.toString(),
          targets: proposalActions.targets,
          values: proposalActions.values,
          calldatas: proposalActions.calldatas,
          descriptionText: proposalActions.description,
          txHash: proposalActions.txHash,
          blockNumber: proposalActions.blockNumber,
          isSignalProposal: isSignalProposal(dao, proposalActions),
        };
      })
    );

    return proposals.sort((left, right) => {
      if (right.createdAt !== left.createdAt) {
        return right.createdAt - left.createdAt;
      }

      return right.blockNumber - left.blockNumber;
    });
  });
}

export async function listGovernanceVotes(proposalId) {
  if (!GOVERNANCE_READY) {
    throw new Error('Governance contracts are not configured');
  }

  return withGovernanceReadProvider(async (provider) => {
    const dao = getDAO(provider);
    const events = await queryFilterAdaptive(dao, dao.filters.VoteCast(), GOVERNANCE_START_BLOCK || 0);

    return events
      .filter((event) => event.args?.proposalId?.toString() === proposalId.toString())
      .map((event) => ({
        voter: event.args?.voter,
        support: Number(event.args?.support),
        weight: event.args?.weight?.toString() || '0',
        reason: event.args?.reason || '',
        txHash: event.transactionHash,
        blockNumber: event.blockNumber,
      }))
      .reverse();
  });
}

export async function delegateGovernance(rawProvider) {
  await ensureGovernanceChain(rawProvider);

  const signer = await getSigner(rawProvider);
  const signerAddress = await signer.getAddress();
  const govToken = getGovToken(signer);
  const tx = await govToken.delegate(signerAddress);
  const receipt = await tx.wait();

  return { tx, receipt };
}

export async function createGovernanceSignalProposal(rawProvider, proposalInput) {
  await ensureGovernanceChain(rawProvider);

  const signer = await getSigner(rawProvider);
  const dao = getDAO(signer);
  const signalAction = getSignalAction(dao);
  const tx = await dao.proposeWithMetadata(
    signalAction.targets,
    signalAction.values.map((value) => BigInt(value)),
    signalAction.calldatas,
    proposalInput.title,
    proposalInput.description,
    proposalInput.proposalType
  );
  const receipt = await tx.wait();

  let proposalId;
  for (const log of receipt.logs) {
    try {
      const parsed = dao.interface.parseLog(log);
      if (parsed?.name === 'ProposalCreatedWithMetadata') {
        proposalId = parsed.args?.proposalId?.toString();
        break;
      }
    } catch {
      // Ignore unrelated logs.
    }
  }

  return { tx, receipt, proposalId };
}

export async function castGovernanceVote(rawProvider, proposalId, support, reason = '') {
  await ensureGovernanceChain(rawProvider);

  const signer = await getSigner(rawProvider);
  const dao = getDAO(signer);
  const tx = reason
    ? await dao.castVoteWithReason(proposalId, support, reason)
    : await dao.castVote(proposalId, support);
  const receipt = await tx.wait();

  return { tx, receipt };
}

export async function queueGovernanceProposal(rawProvider, proposal) {
  await ensureGovernanceChain(rawProvider);

  const signer = await getSigner(rawProvider);
  const dao = getDAO(signer);
  const descriptionHash = ethers.id(proposal.descriptionText || proposal.description || '');
  const tx = await dao.queue(
    proposal.targets,
    proposal.values.map((value) => BigInt(value)),
    proposal.calldatas,
    descriptionHash
  );
  const receipt = await tx.wait();

  return { tx, receipt };
}

export async function executeGovernanceProposal(rawProvider, proposal) {
  await ensureGovernanceChain(rawProvider);

  const signer = await getSigner(rawProvider);
  const dao = getDAO(signer);
  const descriptionHash = ethers.id(proposal.descriptionText || proposal.description || '');
  const tx = await dao.execute(
    proposal.targets,
    proposal.values.map((value) => BigInt(value)),
    proposal.calldatas,
    descriptionHash
  );
  const receipt = await tx.wait();

  return { tx, receipt };
}

// ─── Common operations ───

/** Approve KGST spending then contribute to a campaign in one flow */
export async function approveAndContribute(rawProvider, campaignAddress, amount) {
  const signer = await getSigner(rawProvider);
  const kgst = getKGST(signer);
  const campaign = getCampaign(campaignAddress, signer);

  const amountWei = ethers.parseEther(amount.toString());

  // Check existing allowance
  const signerAddress = await signer.getAddress();
  const currentAllowance = await kgst.allowance(signerAddress, campaignAddress);

  if (currentAllowance < amountWei) {
    // Infinite approve – user only signs once, all future contributions are 1-tx
    const approveTx = await kgst.approve(campaignAddress, ethers.MaxUint256);
    await approveTx.wait();
  }

  // Contribute
  const tx = await campaign.contribute(amountWei);
  const receipt = await tx.wait();
  return { tx, receipt };
}

export async function withdrawCampaignFunds(rawProvider, campaignAddress) {
  await ensureBSCChain(rawProvider);

  const signer = await getSigner(rawProvider);
  const campaign = getCampaign(campaignAddress, signer);
  const tx = await campaign.withdraw();
  const receipt = await tx.wait();

  return { tx, receipt };
}

export async function getCampaignPaymentBalance(campaignAddress) {
  const provider = getCampaignReadProvider();
  const campaign = getCampaign(campaignAddress, provider);
  const paymentTokenAddress = await campaign.paymentToken();
  const token = getERC20(paymentTokenAddress, provider);
  const balance = await token.balanceOf(campaignAddress);

  return balance.toString();
}

export async function getCampaignWithdrawalStatus(campaignAddress, account) {
  return withCampaignReadProvider(async (provider) => {
    const campaign = getCampaign(campaignAddress, provider);

    const [goalAmount, deadline, totalRaised, storedStateValue, currentStateValue, founder, paymentTokenAddress] = await Promise.all([
      campaign.goalAmount(),
      campaign.deadline(),
      campaign.totalRaised(),
      campaign.state(),
      campaign.getCurrentState(),
      campaign.founder(),
      campaign.paymentToken(),
    ]);

    const token = getERC20(paymentTokenAddress, provider);
    const paymentBalance = await token.balanceOf(campaignAddress);
    const storedState = Number(storedStateValue);
    const currentState = Number(currentStateValue);
    const normalizedAccount = account?.toLowerCase() || '';
    const normalizedFounder = founder.toLowerCase();
    const isFounder = normalizedAccount !== '' && normalizedAccount === normalizedFounder;
    const deadlinePassed = Number(deadline) <= Math.floor(Date.now() / 1000);
    const goalReached = totalRaised >= goalAmount;

    let reasonKey = 'campaignDetail.withdrawHints.notAvailable';
    let reasonParams = {};
    if (!isFounder) {
      reasonKey = 'campaignDetail.withdrawHints.onlyFounder';
    } else if (!goalReached) {
      reasonKey = 'campaignDetail.withdrawHints.goalNotReached';
    } else if (!deadlinePassed) {
      reasonKey = 'campaignDetail.withdrawHints.afterDeadline';
    } else if (storedState === 1 && paymentBalance === 0n) {
      reasonKey = 'campaignDetail.withdrawHints.alreadyWithdrawn';
    } else if (storedState !== 0 && storedState !== 1) {
      reasonKey = 'campaignDetail.withdrawHints.stateBlocked';
      reasonParams = { state: formatCampaignState(storedState).stateKey };
    } else if (paymentBalance === 0n) {
      reasonKey = 'campaignDetail.withdrawHints.zeroBalance';
    } else {
      reasonKey = 'campaignDetail.withdrawHints.ready';
    }

    return {
      goalAmount: goalAmount.toString(),
      deadline: Number(deadline),
      totalRaised: totalRaised.toString(),
      storedState,
      currentState,
      founder,
      paymentBalance: paymentBalance.toString(),
      isFounder,
      goalReached,
      deadlinePassed,
      canWithdraw: isFounder && storedState === 0 && currentState === 1 && paymentBalance > 0n,
      reasonKey,
      reasonParams,
    };
  });
}

/** Get KGST balance for an address */
export async function getKGSTBalance(rawProvider, address) {
  const bp = getBrowserProvider(rawProvider);
  const kgst = getKGST(bp);
  const balance = await kgst.balanceOf(address);
  return ethers.formatEther(balance);
}

/** Claim MockKGST from faucet (testnet only) */
export async function claimFaucet(rawProvider) {
  const signer = await getSigner(rawProvider);
  const kgst = getKGST(signer);
  const tx = await kgst.faucet();
  await tx.wait();
  return tx;
}

/** Get campaign on-chain data */
export async function getCampaignOnChain(rawProvider, campaignAddress) {
  const bp = getBrowserProvider(rawProvider);
  const campaign = getCampaign(campaignAddress, bp);

  const [goalAmount, deadline, totalRaised, state, founder, contributorCount] = await Promise.all([
    campaign.goalAmount(),
    campaign.deadline(),
    campaign.totalRaised(),
    campaign.getCurrentState(),
    campaign.founder(),
    campaign.contributorCount(),
  ]);

  return {
    goalAmount: ethers.formatEther(goalAmount),
    deadline: Number(deadline),
    totalRaised: ethers.formatEther(totalRaised),
    state: Number(state), // 0=Active, 1=Successful, 2=Failed, 3=Cancelled
    founder,
    contributorCount: Number(contributorCount),
  };
}

// ─── Explorer links ───

export function explorerTxUrl(txHash) {
  return `${CAMPAIGN_CHAIN.explorer}/tx/${txHash}`;
}

export function explorerAddressUrl(address) {
  return `${CAMPAIGN_CHAIN.explorer}/address/${address}`;
}

export function governanceTxUrl(txHash) {
  return `${GOVERNANCE_CHAIN.explorer}/tx/${txHash}`;
}

export function governanceAddressUrl(address) {
  return `${GOVERNANCE_CHAIN.explorer}/address/${address}`;
}
