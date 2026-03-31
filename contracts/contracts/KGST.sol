// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title KGST - Kyrgyz Som Token
 * @notice 1:1 KGS-backed stablecoin for the KGST Crowdfunding Platform
 * @dev ERC-20 token with role-based access control, KYC enforcement, and tier-based limits
 *
 * Roles:
 *   - DEFAULT_ADMIN_ROLE: Can grant/revoke roles, update registry, pause/unpause
 *   - BRIDGE_ROLE: Can mint/burn tokens (assigned to bridge service wallet)
 *   - COMPLIANCE_ROLE: Can freeze/unfreeze accounts for regulatory compliance
 */
contract KGST is ERC20, ERC20Burnable, ERC20Pausable, AccessControl {

    // ──────────────────────────────────── Roles ────────────────────────────────────
    bytes32 public constant BRIDGE_ROLE     = keccak256("BRIDGE_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

    // ──────────────────────────────── State Variables ──────────────────────────────
    /// @notice Reference to the UserRegistry contract for KYC checks
    IUserRegistry public userRegistry;

    /// @notice Monthly volume spent by each address (resets each month)
    mapping(address => uint256) public monthlyVolume;

    /// @notice Timestamp of last volume reset for each address
    mapping(address => uint256) public volumeResetTimestamp;

    /// @notice Accounts frozen by compliance
    mapping(address => bool) public frozen;

    /// @notice Per-tier monthly limits in wei (18 decimals)
    mapping(uint8 => uint256) public tierLimits;

    /// @notice Total KGST ever minted (for audit trail)
    uint256 public totalMinted;

    /// @notice Total KGST ever burned (for audit trail)
    uint256 public totalBurned;

    // ──────────────────────────────────── Events ──────────────────────────────────
    event TokensMinted(address indexed to, uint256 amount, uint256 timestamp);
    event TokensBurned(address indexed from, uint256 amount, uint256 timestamp);
    event AccountFrozen(address indexed account, string reason);
    event AccountUnfrozen(address indexed account);
    event UserRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event TierLimitUpdated(uint8 tier, uint256 newLimit);

    // ──────────────────────────────────── Errors ──────────────────────────────────
    error AccountIsFrozen(address account);
    error KYCRequired(address account);
    error MonthlyLimitExceeded(address account, uint256 requested, uint256 remaining);
    error ZeroAddress();
    error ZeroAmount();
    error RegistryNotSet();

    // ──────────────────────────────────── Constructor ─────────────────────────────
    constructor(address _admin) ERC20("Kyrgyz Som Token", "KGST") {
        if (_admin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(COMPLIANCE_ROLE, _admin);

        // Default tier limits
        tierLimits[1] = 50_000   * 1e18;       // Tier 1: 50K KGST / month
        tierLimits[2] = 500_000  * 1e18;       // Tier 2: 500K KGST / month
        tierLimits[3] = type(uint256).max;      // Tier 3: Unlimited
    }

    // ──────────────────────────────── Admin Functions ─────────────────────────────

    /// @notice Set / update the UserRegistry contract address
    function setUserRegistry(address _registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_registry == address(0)) revert ZeroAddress();
        address old = address(userRegistry);
        userRegistry = IUserRegistry(_registry);
        emit UserRegistryUpdated(old, _registry);
    }

    /// @notice Update the monthly limit for a wallet tier
    function setTierLimit(uint8 _tier, uint256 _limit) external onlyRole(DEFAULT_ADMIN_ROLE) {
        tierLimits[_tier] = _limit;
        emit TierLimitUpdated(_tier, _limit);
    }

    /// @notice Pause all token transfers (emergency)
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpause token transfers
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ──────────────────────────────── Bridge Functions ────────────────────────────

    /**
     * @notice Mint KGST tokens after KGS deposit confirmed
     * @param to     Recipient address (must be KYC verified)
     * @param amount Amount of KGST to mint (18 decimals, 1 KGST = 1 KGS)
     */
    function mint(address to, uint256 amount) external onlyRole(BRIDGE_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (frozen[to]) revert AccountIsFrozen(to);

        // KYC check (if registry is set)
        if (address(userRegistry) != address(0)) {
            if (!userRegistry.isKYCVerified(to)) revert KYCRequired(to);
            _checkMonthlyLimit(to, amount);
        }

        _mint(to, amount);
        totalMinted += amount;

        emit TokensMinted(to, amount, block.timestamp);
    }

    /**
     * @notice Burn KGST tokens for KGS withdrawal
     * @param from   Address to burn from
     * @param amount Amount of KGST to burn
     */
    function bridgeBurn(address from, uint256 amount) external onlyRole(BRIDGE_ROLE) {
        if (from == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (frozen[from]) revert AccountIsFrozen(from);

        _burn(from, amount);
        totalBurned += amount;

        emit TokensBurned(from, amount, block.timestamp);
    }

    // ──────────────────────────────── Compliance ─────────────────────────────────

    /// @notice Freeze an account (regulatory or AML)
    function freezeAccount(address account, string calldata reason) external onlyRole(COMPLIANCE_ROLE) {
        frozen[account] = true;
        emit AccountFrozen(account, reason);
    }

    /// @notice Unfreeze a previously frozen account
    function unfreezeAccount(address account) external onlyRole(COMPLIANCE_ROLE) {
        frozen[account] = false;
        emit AccountUnfrozen(account);
    }

    // ──────────────────────────────── Internal ───────────────────────────────────

    /**
     * @dev Check and update monthly volume against tier limits
     */
    function _checkMonthlyLimit(address account, uint256 amount) internal {
        // Reset volume if a new month has started (30-day rolling window)
        if (block.timestamp >= volumeResetTimestamp[account] + 30 days) {
            monthlyVolume[account] = 0;
            volumeResetTimestamp[account] = block.timestamp;
        }

        uint8 tier = userRegistry.getUserTier(account);
        uint256 limit = tierLimits[tier];

        if (limit != type(uint256).max) {
            uint256 newVolume = monthlyVolume[account] + amount;
            if (newVolume > limit) {
                revert MonthlyLimitExceeded(account, amount, limit - monthlyVolume[account]);
            }
            monthlyVolume[account] = newVolume;
        }
    }

    /**
     * @dev Override to add frozen-account check on every transfer
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override(ERC20, ERC20Pausable) {
        if (frozen[from] && from != address(0)) revert AccountIsFrozen(from);
        if (frozen[to]   && to   != address(0)) revert AccountIsFrozen(to);
        super._update(from, to, value);
    }

    // ──────────────────────────────── View Functions ─────────────────────────────

    /// @notice Get remaining monthly allowance for an account
    function remainingMonthlyAllowance(address account) external view returns (uint256) {
        if (address(userRegistry) == address(0)) return type(uint256).max;

        uint8 tier = userRegistry.getUserTier(account);
        uint256 limit = tierLimits[tier];
        if (limit == type(uint256).max) return type(uint256).max;

        uint256 volume = monthlyVolume[account];
        // Check if volume should be reset
        if (block.timestamp >= volumeResetTimestamp[account] + 30 days) {
            volume = 0;
        }
        return limit > volume ? limit - volume : 0;
    }

    /// @notice Get circulating supply (minted - burned)
    function circulatingSupply() external view returns (uint256) {
        return totalMinted - totalBurned;
    }
}

// ──────────────────────────────── Interface ───────────────────────────────────

interface IUserRegistry {
    function isKYCVerified(address user) external view returns (bool);
    function getUserTier(address user) external view returns (uint8);
    function getKYCLevel(address user) external view returns (uint8);
}
