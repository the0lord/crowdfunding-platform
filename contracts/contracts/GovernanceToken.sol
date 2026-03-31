// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Nonces.sol";

/**
 * @title GovernanceToken (GOV) - Soulbound Governance Token
 * @notice Non-transferable ERC-20 with voting power for the KGST DAO
 * @dev Earned through platform activity, cannot be bought or sold
 *
 * Earning Actions:
 *   - Create a campaign:       +100 GOV
 *   - Fund a campaign:          +1  GOV per 1000 KGST contributed
 *   - Campaign reaches goal:   +500 GOV (creator)
 *   - Refer a new user:         +50 GOV
 *   - Vote on a proposal:       +10 GOV
 *   - Complete KYC Level 2+:   +100 GOV
 *
 * Soulbound:
 *   tokens can only be minted (from == address(0)) or burned (to == address(0)).
 *   All other transfers revert.
 */
contract GovernanceToken is ERC20, ERC20Permit, ERC20Votes, AccessControl {

    // ──────────────────────────────── Roles ──────────────────────────────────────
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // ──────────────────────────────── State ──────────────────────────────────────
    /// @notice Total unique holders (addresses with balance > 0)
    uint256 public holderCount;

    /// @notice Track whether address has ever been minted to
    mapping(address => bool) private _isHolder;

    /// @notice Activity log per address
    mapping(address => uint256) public activityScore;

    // ──────────────────────────────── Events ─────────────────────────────────────
    event GOVMinted(address indexed to, uint256 amount, string reason);
    event GOVBurned(address indexed from, uint256 amount);
    event ActivityRecorded(address indexed user, string activity, uint256 govEarned);

    // ──────────────────────────────── Errors ─────────────────────────────────────
    error SoulboundNonTransferable();
    error ZeroAddress();
    error ZeroAmount();

    // ──────────────────────────────── Constructor ────────────────────────────────
    constructor(address _admin)
        ERC20("KGST Governance Token", "GOV")
        ERC20Permit("KGST Governance Token")
    {
        if (_admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    // ──────────────────────────────── Mint (Earn) ────────────────────────────────

    /**
     * @notice Mint GOV tokens to a user for a specific activity
     * @param to     Recipient address
     * @param amount Amount of GOV to mint (18 decimals)
     * @param reason Human-readable reason (e.g. "campaign_created")
     */
    function mint(address to, uint256 amount, string calldata reason) external onlyRole(MINTER_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        _mint(to, amount);

        if (!_isHolder[to]) {
            _isHolder[to] = true;
            holderCount++;
        }

        activityScore[to] += amount;

        emit GOVMinted(to, amount, reason);
        emit ActivityRecorded(to, reason, amount);
    }

    /**
     * @notice Convenience: mint for campaign creation
     */
    function rewardCampaignCreation(address creator) external onlyRole(MINTER_ROLE) {
        _mintReward(creator, 100 * 1e18, "campaign_created");
    }

    /**
     * @notice Convenience: mint for funding a campaign
     * @param funder        The contributor address
     * @param kgstAmount    Amount of KGST contributed (18 decimals)
     */
    function rewardContribution(address funder, uint256 kgstAmount) external onlyRole(MINTER_ROLE) {
        uint256 govAmount = (kgstAmount / 1000) * 1e18; // 1 GOV per 1000 KGST
        if (govAmount > 0) {
            _mintReward(funder, govAmount, "campaign_funded");
        }
    }

    /**
     * @notice Convenience: mint for successful campaign
     */
    function rewardCampaignSuccess(address creator) external onlyRole(MINTER_ROLE) {
        _mintReward(creator, 500 * 1e18, "campaign_success");
    }

    /**
     * @notice Convenience: mint for referral
     */
    function rewardReferral(address referrer) external onlyRole(MINTER_ROLE) {
        _mintReward(referrer, 50 * 1e18, "referral");
    }

    /**
     * @notice Convenience: mint for voting
     */
    function rewardVote(address voter) external onlyRole(MINTER_ROLE) {
        _mintReward(voter, 10 * 1e18, "proposal_voted");
    }

    /**
     * @notice Convenience: mint for KYC completion
     */
    function rewardKYC(address user) external onlyRole(MINTER_ROLE) {
        _mintReward(user, 100 * 1e18, "kyc_completed");
    }

    // ──────────────────────────────── Burn (Rage Quit) ───────────────────────────

    /**
     * @notice Burn your own GOV tokens (opt out of governance)
     * @param amount Amount to burn
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);

        if (balanceOf(msg.sender) == 0 && _isHolder[msg.sender]) {
            _isHolder[msg.sender] = false;
            holderCount--;
        }

        emit GOVBurned(msg.sender, amount);
    }

    // ──────────────────────────────── Soulbound Override ─────────────────────────

    /**
     * @dev Enforces soulbound property: only mint (from == 0) and burn (to == 0) allowed
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override(ERC20, ERC20Votes) {
        // Allow minting (from == 0) and burning (to == 0), block transfers
        if (from != address(0) && to != address(0)) {
            revert SoulboundNonTransferable();
        }
        super._update(from, to, value);
    }

    // ──────────────────────────────── Internal ──────────────────────────────────

    function _mintReward(address to, uint256 amount, string memory reason) internal {
        if (to == address(0)) return;
        _mint(to, amount);

        if (!_isHolder[to]) {
            _isHolder[to] = true;
            holderCount++;
        }

        activityScore[to] += amount;
        emit GOVMinted(to, amount, reason);
        emit ActivityRecorded(to, reason, amount);
    }

    // ──────────────────────────────── Required Overrides ─────────────────────────

    function nonces(address owner) public view virtual override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }

    // ──────────────────────────────── View Functions ─────────────────────────────

    /// @notice Check if an address holds any GOV tokens
    function isHolder(address account) external view returns (bool) {
        return _isHolder[account];
    }

    /// @notice Get voting power of an account (alias for balanceOf for clarity)
    function votingPower(address account) external view returns (uint256) {
        return balanceOf(account);
    }
}
