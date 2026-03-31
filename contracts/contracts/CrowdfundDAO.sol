// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title CrowdfundDAO
 * @notice DAO governance for the KGST Crowdfunding Platform
 * @dev OpenZeppelin Governor with:
 *   - GovernorSettings: Configurable voting delay, period, and proposal threshold
 *   - GovernorCountingSimple: For/Against/Abstain counting
 *   - GovernorVotes: Uses GOV token (soulbound) for voting power
 *   - GovernorVotesQuorumFraction: 4% quorum requirement
 *   - GovernorTimelockControl: 2-day execution delay via TimelockController
 *
 * Proposal Types:
 *   - PARAMETER_CHANGE:  Adjust platform fees, limits, etc.
 *   - TREASURY_SPEND:    Allocate funds from DAO treasury
 *   - CONTRACT_UPGRADE:  Upgrade smart contracts
 *   - EMERGENCY:         Emergency actions (shorter timelock)
 *   - CAMPAIGN_APPEAL:   Appeal a rejected campaign decision
 */
contract CrowdfundDAO is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    uint256 public immutable quorumPercent;

    // ──────────────────────────────── Enums ──────────────────────────────────────

    enum ProposalType {
        PARAMETER_CHANGE,
        TREASURY_SPEND,
        CONTRACT_UPGRADE,
        EMERGENCY,
        CAMPAIGN_APPEAL
    }

    // ──────────────────────────────── Structs ────────────────────────────────────

    struct ProposalMetadata {
        ProposalType proposalType;
        string       title;
        string       description;
        address      proposer;
        uint256      createdAt;
    }

    // ──────────────────────────────── State ──────────────────────────────────────

    /// @notice Proposal ID → metadata
    mapping(uint256 => ProposalMetadata) public proposalMetadata;

    /// @notice Total proposals ever created
    uint256 public totalProposals;

    /// @notice Proposals by type count
    mapping(ProposalType => uint256) public proposalsByType;

    // ──────────────────────────────── Events ─────────────────────────────────────

    event ProposalCreatedWithMetadata(
        uint256 indexed proposalId,
        ProposalType proposalType,
        string title,
        address indexed proposer
    );

    event GovernanceSignalExecuted(uint256 timestamp, uint256 blockNumber);

    // ──────────────────────────────── Constructor ────────────────────────────────

    /**
     * @param _token               GOV token (IVotes) for voting power
     * @param _timelock            TimelockController for execution delay
     * @param _votingDelayBlocks   Voting delay in blocks before voting opens
     * @param _votingPeriodBlocks  Voting period in blocks
     * @param _proposalThreshold   Minimum proposer voting power in GOV wei
     * @param _quorumPercent       Quorum percentage of total supply
     */
    constructor(
        IVotes _token,
        TimelockController _timelock,
        uint48 _votingDelayBlocks,
        uint32 _votingPeriodBlocks,
        uint256 _proposalThreshold,
        uint256 _quorumPercent
    )
        Governor("CrowdfundDAO")
        GovernorSettings(
            _votingDelayBlocks,
            _votingPeriodBlocks,
            _proposalThreshold
        )
        GovernorVotes(_token)
        GovernorVotesQuorumFraction(_quorumPercent)
        GovernorTimelockControl(_timelock)
    {
        require(_quorumPercent > 0 && _quorumPercent <= 100, "Invalid quorum percent");
        quorumPercent = _quorumPercent;
    }

    // ──────────────────────────────── Propose ────────────────────────────────────

    /**
     * @notice Create a proposal with metadata
     * @param targets       Target contract addresses
     * @param values        ETH values for each call
     * @param calldatas     Encoded function calls
     * @param _title        Human-readable title
     * @param _description  Full description (IPFS hash or text)
     * @param _type         Proposal type enum
     */
    function proposeWithMetadata(
        address[] memory targets,
        uint256[] memory values,
        bytes[]   memory calldatas,
        string    memory _title,
        string    memory _description,
        ProposalType     _type
    ) external returns (uint256) {
        uint256 proposalId = propose(targets, values, calldatas, _description);

        proposalMetadata[proposalId] = ProposalMetadata({
            proposalType: _type,
            title: _title,
            description: _description,
            proposer: msg.sender,
            createdAt: block.timestamp
        });

        totalProposals++;
        proposalsByType[_type]++;

        emit ProposalCreatedWithMetadata(proposalId, _type, _title, msg.sender);

        return proposalId;
    }

    // ──────────────────────────────── View ───────────────────────────────────────

    /// @notice Get proposal metadata
    function getProposalMetadata(uint256 proposalId) external view returns (ProposalMetadata memory) {
        return proposalMetadata[proposalId];
    }

    /**
     * @notice A minimal executable action for on-chain signal proposals.
     * @dev Executable only through governance/timelock.
     */
    function governanceSignal() external onlyGovernance {
        emit GovernanceSignalExecuted(block.timestamp, block.number);
    }

    // ──────────────────────────────── Required Overrides ─────────────────────────

    function votingDelay()
        public view override(Governor, GovernorSettings) returns (uint256)
    {
        return super.votingDelay();
    }

    function votingPeriod()
        public view override(Governor, GovernorSettings) returns (uint256)
    {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber)
        public view override(Governor, GovernorVotesQuorumFraction) returns (uint256)
    {
        return super.quorum(blockNumber);
    }

    function state(uint256 proposalId)
        public view override(Governor, GovernorTimelockControl) returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function proposalNeedsQueuing(uint256 proposalId)
        public view override(Governor, GovernorTimelockControl) returns (bool)
    {
        return super.proposalNeedsQueuing(proposalId);
    }

    function proposalThreshold()
        public view override(Governor, GovernorSettings) returns (uint256)
    {
        return super.proposalThreshold();
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint48) {
        return super._queueOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._executeOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal view override(Governor, GovernorTimelockControl) returns (address)
    {
        return super._executor();
    }
}
