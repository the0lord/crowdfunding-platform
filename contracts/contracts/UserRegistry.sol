// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title UserRegistry
 * @notice On-chain KYC status and wallet tier management
 * @dev Stores only KYC hashes on-chain for privacy. Full PII stays off-chain (Sumsub / backend DB).
 *
 * KYC Levels:
 *   0 = None
 *   1 = Basic    (email + phone OTP)
 *   2 = Enhanced (ID document + selfie via Sumsub)
 *   3 = Full     (ID + proof of address + manual review)
 *
 * Wallet Tiers:
 *   1 = Embedded  (Web3Auth)             → 50K KGS/month,  gas sponsored
 *   2 = MPC       (Web3Auth tKey)        → 500K KGS/month, 50% gas subsidy
 *   3 = Self-Custody (MetaMask/Ledger)   → Unlimited,      user pays gas
 */
contract UserRegistry is AccessControl, Pausable {

    // ──────────────────────────────── Roles ──────────────────────────────────────
    bytes32 public constant KYC_ADMIN_ROLE  = keccak256("KYC_ADMIN_ROLE");
    bytes32 public constant BACKEND_ROLE    = keccak256("BACKEND_ROLE");

    // ──────────────────────────────── Structs ────────────────────────────────────

    struct UserInfo {
        address wallet;
        uint8   kycLevel;        // 0-3
        uint8   walletTier;      // 1-3
        uint256 monthlyVolume;   // Current month spending
        uint256 monthlyLimit;    // Limit for this user's tier
        bytes32 kycHash;         // keccak256(off-chain KYC data ref)
        bool    isActive;
        uint64  createdAt;
        uint64  updatedAt;
    }

    // ──────────────────────────────── State ──────────────────────────────────────

    /// @notice Wallet address → UserInfo
    mapping(address => UserInfo) public users;

    /// @notice List of all registered wallet addresses
    address[] public userList;

    /// @notice Quick lookup to avoid duplicates
    mapping(address => bool) public isRegistered;

    /// @notice Total registered users
    uint256 public totalUsers;

    /// @notice Default limits per tier (in KGST wei)
    mapping(uint8 => uint256) public defaultTierLimits;

    // ──────────────────────────────── Events ─────────────────────────────────────
    event UserRegistered(address indexed wallet, uint8 walletTier, uint64 timestamp);
    event KYCLevelUpdated(address indexed wallet, uint8 oldLevel, uint8 newLevel, bytes32 kycHash);
    event WalletTierUpdated(address indexed wallet, uint8 oldTier, uint8 newTier);
    event UserDeactivated(address indexed wallet);
    event UserReactivated(address indexed wallet);
    event MonthlyVolumeReset(address indexed wallet);

    // ──────────────────────────────── Errors ─────────────────────────────────────
    error UserAlreadyRegistered(address wallet);
    error UserNotRegistered(address wallet);
    error InvalidKYCLevel(uint8 level);
    error InvalidWalletTier(uint8 tier);
    error UserNotActive(address wallet);
    error ZeroAddress();
    error InsufficientKYCForTier(uint8 kycLevel, uint8 requiredTier);

    // ──────────────────────────────── Constructor ────────────────────────────────
    constructor(address _admin) {
        if (_admin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(KYC_ADMIN_ROLE, _admin);

        // Set default tier limits
        defaultTierLimits[1] = 50_000   * 1e18;    // 50K KGST
        defaultTierLimits[2] = 500_000  * 1e18;    // 500K KGST
        defaultTierLimits[3] = type(uint256).max;   // Unlimited
    }

    // ──────────────────────────────── Registration ──────────────────────────────

    /**
     * @notice Register a new user (called by backend after initial signup)
     * @param wallet    User's wallet address
     * @param tier      Initial wallet tier (1=Embedded, 2=MPC, 3=Self-custody)
     */
    function registerUser(
        address wallet,
        uint8 tier
    ) external onlyRole(BACKEND_ROLE) whenNotPaused {
        if (wallet == address(0)) revert ZeroAddress();
        if (isRegistered[wallet]) revert UserAlreadyRegistered(wallet);
        if (tier < 1 || tier > 3) revert InvalidWalletTier(tier);

        users[wallet] = UserInfo({
            wallet: wallet,
            kycLevel: 0,
            walletTier: tier,
            monthlyVolume: 0,
            monthlyLimit: defaultTierLimits[tier],
            kycHash: bytes32(0),
            isActive: true,
            createdAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp)
        });

        userList.push(wallet);
        isRegistered[wallet] = true;
        totalUsers++;

        emit UserRegistered(wallet, tier, uint64(block.timestamp));
    }

    // ──────────────────────────────── KYC Management ────────────────────────────

    /**
     * @notice Update KYC level after verification (called by backend/KYC service)
     * @param wallet   User's wallet address
     * @param level    New KYC level (1-3)
     * @param _kycHash Hash of the off-chain KYC reference
     */
    function updateKYCLevel(
        address wallet,
        uint8 level,
        bytes32 _kycHash
    ) external onlyRole(KYC_ADMIN_ROLE) whenNotPaused {
        if (!isRegistered[wallet]) revert UserNotRegistered(wallet);
        if (level > 3) revert InvalidKYCLevel(level);

        UserInfo storage user = users[wallet];
        if (!user.isActive) revert UserNotActive(wallet);

        uint8 oldLevel = user.kycLevel;
        user.kycLevel = level;
        user.kycHash = _kycHash;
        user.updatedAt = uint64(block.timestamp);

        emit KYCLevelUpdated(wallet, oldLevel, level, _kycHash);
    }

    // ──────────────────────────────── Tier Management ────────────────────────────

    /**
     * @notice Upgrade a user's wallet tier
     * @param wallet  User's wallet address
     * @param newTier New wallet tier (must have sufficient KYC)
     */
    function updateWalletTier(
        address wallet,
        uint8 newTier
    ) external onlyRole(BACKEND_ROLE) whenNotPaused {
        if (!isRegistered[wallet]) revert UserNotRegistered(wallet);
        if (newTier < 1 || newTier > 3) revert InvalidWalletTier(newTier);

        UserInfo storage user = users[wallet];
        if (!user.isActive) revert UserNotActive(wallet);

        // Tier 2 requires KYC Level 2+, Tier 3 requires KYC Level 3
        if (newTier == 2 && user.kycLevel < 2) revert InsufficientKYCForTier(user.kycLevel, 2);
        if (newTier == 3 && user.kycLevel < 3) revert InsufficientKYCForTier(user.kycLevel, 3);

        uint8 oldTier = user.walletTier;
        user.walletTier = newTier;
        user.monthlyLimit = defaultTierLimits[newTier];
        user.updatedAt = uint64(block.timestamp);

        emit WalletTierUpdated(wallet, oldTier, newTier);
    }

    // ──────────────────────────────── Account Management ────────────────────────

    /// @notice Deactivate a user (compliance action)
    function deactivateUser(address wallet) external onlyRole(KYC_ADMIN_ROLE) {
        if (!isRegistered[wallet]) revert UserNotRegistered(wallet);
        users[wallet].isActive = false;
        users[wallet].updatedAt = uint64(block.timestamp);
        emit UserDeactivated(wallet);
    }

    /// @notice Reactivate a previously deactivated user
    function reactivateUser(address wallet) external onlyRole(KYC_ADMIN_ROLE) {
        if (!isRegistered[wallet]) revert UserNotRegistered(wallet);
        users[wallet].isActive = true;
        users[wallet].updatedAt = uint64(block.timestamp);
        emit UserReactivated(wallet);
    }

    /// @notice Reset monthly volume (called by backend at start of each period)
    function resetMonthlyVolume(address wallet) external onlyRole(BACKEND_ROLE) {
        if (!isRegistered[wallet]) revert UserNotRegistered(wallet);
        users[wallet].monthlyVolume = 0;
        emit MonthlyVolumeReset(wallet);
    }

    /// @notice Record volume spent (called by KGST contract or bridge)
    function addVolume(address wallet, uint256 amount) external onlyRole(BACKEND_ROLE) {
        if (!isRegistered[wallet]) revert UserNotRegistered(wallet);
        users[wallet].monthlyVolume += amount;
    }

    // ──────────────────────────────── Admin ──────────────────────────────────────

    /// @notice Update default limit for a tier
    function setDefaultTierLimit(uint8 tier, uint256 limit) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (tier < 1 || tier > 3) revert InvalidWalletTier(tier);
        defaultTierLimits[tier] = limit;
    }

    /// @notice Pause registry (emergency)
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }

    /// @notice Unpause registry
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    // ──────────────────────────────── View Functions ─────────────────────────────

    /// @notice Check if a user has completed KYC (level >= 1)
    function isKYCVerified(address wallet) external view returns (bool) {
        return isRegistered[wallet] && users[wallet].isActive && users[wallet].kycLevel >= 1;
    }

    /// @notice Get wallet tier (returns 0 if not registered)
    function getUserTier(address wallet) external view returns (uint8) {
        if (!isRegistered[wallet]) return 0;
        return users[wallet].walletTier;
    }

    /// @notice Get KYC level (returns 0 if not registered)
    function getKYCLevel(address wallet) external view returns (uint8) {
        if (!isRegistered[wallet]) return 0;
        return users[wallet].kycLevel;
    }

    /// @notice Get full user info
    function getUserInfo(address wallet) external view returns (UserInfo memory) {
        return users[wallet];
    }

    /// @notice Get remaining monthly allowance
    function getRemainingAllowance(address wallet) external view returns (uint256) {
        if (!isRegistered[wallet]) return 0;
        UserInfo storage user = users[wallet];
        if (user.monthlyLimit == type(uint256).max) return type(uint256).max;
        if (user.monthlyVolume >= user.monthlyLimit) return 0;
        return user.monthlyLimit - user.monthlyVolume;
    }

    /// @notice Get total number of registered users
    function getTotalUsers() external view returns (uint256) {
        return totalUsers;
    }

    /// @notice Paginated user list
    function getUsersPaginated(uint256 offset, uint256 limit) external view returns (address[] memory) {
        if (offset >= userList.length) {
            return new address[](0);
        }

        uint256 end = offset + limit;
        if (end > userList.length) {
            end = userList.length;
        }

        address[] memory result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = userList[i];
        }
        return result;
    }
}
