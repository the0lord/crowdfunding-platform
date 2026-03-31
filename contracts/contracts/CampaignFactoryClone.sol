// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./CampaignClone.sol";

/**
 * @title CampaignFactoryClone
 * @notice Factory using EIP-1167 minimal proxy pattern for gas-efficient campaign deployment
 * @dev Deploys 45-byte clones pointing to a single Campaign implementation
 */
contract CampaignFactoryClone is Ownable, ReentrancyGuard {
    
    using Clones for address;
    
    // Campaign implementation address (deployed once)
    address public immutable campaignImplementation;
    
    // Platform settings
    address public platformWallet;
    address public paymentToken; // KGST token address
    
    // Campaign registry
    address[] public campaigns;
    mapping(address => bool) public isCampaign;
    mapping(address => address[]) public founderCampaigns;
    
    // Statistics
    uint256 public totalCampaignsCreated;
    uint256 public pendingReviewCount;
    
    // Moderation system
    enum ModerationStatus { Pending, Approved, Rejected, Flagged }
    
    struct CampaignMetadata {
        address campaignAddress;
        address founder;
        uint128 goalAmount;
        uint64 createdAt;
        uint64 reviewedAt;
        uint8 status;
        uint16 flagCount;
        bytes32 rejectionCode;
    }
    
    mapping(address => CampaignMetadata) public campaignMetadata;
    mapping(address => bool) public moderators;
    mapping(address => bool) public blacklistedFounders;
    mapping(address => mapping(address => bool)) public hasReported;
    
    // Events
    event CampaignCreated(
        address indexed campaign,
        address indexed founder,
        uint256 goalAmount,
        uint256 deadline,
        uint256 campaignId
    );
    
    event CampaignApproved(address indexed campaign, address indexed moderator);
    event CampaignRejected(address indexed campaign, bytes32 reason);
    event CampaignFlagged(address indexed campaign, address indexed reporter, uint256 flagCount);
    event FounderBlacklisted(address indexed founder, string reason);
    event ModeratorAdded(address indexed moderator);
    event ModeratorRemoved(address indexed moderator);
    event PlatformWalletUpdated(address indexed oldWallet, address indexed newWallet);
    event PaymentTokenUpdated(address indexed oldToken, address indexed newToken);
    
    // Rejection codes
    bytes32 public constant REJECTION_SCAM = keccak256("SCAM");
    bytes32 public constant REJECTION_SPAM = keccak256("SPAM");
    bytes32 public constant REJECTION_INAPPROPRIATE = keccak256("INAPPROPRIATE");
    bytes32 public constant REJECTION_DUPLICATE = keccak256("DUPLICATE");
    bytes32 public constant REJECTION_FRAUD = keccak256("FRAUD");
    
    // Modifiers
    modifier onlyModerator() {
        require(moderators[msg.sender] || msg.sender == owner(), "Not a moderator");
        _;
    }
    
    modifier notBlacklisted() {
        require(!blacklistedFounders[msg.sender], "Founder is blacklisted");
        _;
    }
    
    /**
     * @notice Constructor
     * @param _platformWallet Address to receive platform fees
     * @param _campaignImplementation Address of Campaign implementation contract
     */
    constructor(
        address _platformWallet,
        address _campaignImplementation,
        address _paymentToken
    ) Ownable(msg.sender) {
        require(_platformWallet != address(0), "Invalid platform wallet");
        require(_campaignImplementation != address(0), "Invalid implementation");
        require(_paymentToken != address(0), "Invalid payment token");
        
        platformWallet = _platformWallet;
        campaignImplementation = _campaignImplementation;
        paymentToken = _paymentToken;
        moderators[msg.sender] = true;
    }
    
    /**
     * @notice Create a new campaign using minimal proxy pattern
     * @dev Deploys a 45-byte clone pointing to implementation
     */
    function createCampaign(
        uint256 _goalAmount,
        uint256 _durationDays,
        string memory _title,
        string memory _description,
        string memory _imageURI
    ) external nonReentrant notBlacklisted returns (address) {
        
        // Enhanced validation
        require(_goalAmount > 0, "Goal must be > 0");
        require(_goalAmount <= 1000 ether, "Goal too high (max 1000)");
        require(_durationDays >= 7 && _durationDays <= 90, "Duration must be 7-90 days");
        require(bytes(_title).length >= 10 && bytes(_title).length <= 200, "Title must be 10-200 chars");
        require(bytes(_description).length >= 50, "Description must be at least 50 chars");
        require(bytes(_imageURI).length > 0, "Image URI required");
        
        // Check founder doesn't have too many pending campaigns
        uint256 pendingCampaigns = 0;
        address[] memory founderCamps = founderCampaigns[msg.sender];
        for (uint256 i = 0; i < founderCamps.length; i++) {
            if (campaignMetadata[founderCamps[i]].status == uint8(ModerationStatus.Pending)) {
                pendingCampaigns++;
            }
        }
        require(pendingCampaigns < 3, "Too many pending campaigns (max 3)");
        
        uint256 deadline = block.timestamp + (_durationDays * 1 days);
        
        // Deploy minimal proxy (45 bytes!)
        address clone = campaignImplementation.clone();
        
        // Initialize the clone
        Campaign(clone).initialize(
            msg.sender,
            _goalAmount,
            deadline,
            _title,
            _description,
            _imageURI,
            platformWallet,
            paymentToken
        );
        
        // Update registry
        campaigns.push(clone);
        founderCampaigns[msg.sender].push(clone);
        isCampaign[clone] = true;
        totalCampaignsCreated++;
        pendingReviewCount++;
        
        // Create metadata for moderation
        campaignMetadata[clone] = CampaignMetadata({
            campaignAddress: clone,
            founder: msg.sender,
            goalAmount: uint128(_goalAmount),
            createdAt: uint64(block.timestamp),
            reviewedAt: 0,
            status: uint8(ModerationStatus.Pending),
            flagCount: 0,
            rejectionCode: bytes32(0)
        });
        
        emit CampaignCreated(clone, msg.sender, _goalAmount, deadline, totalCampaignsCreated);
        
        return clone;
    }
    
    /**
     * @notice Approve a campaign (moderator only)
     */
    function approveCampaign(address _campaignAddress) external onlyModerator {
        require(isCampaign[_campaignAddress], "Invalid campaign");
        CampaignMetadata storage metadata = campaignMetadata[_campaignAddress];
        require(metadata.status == uint8(ModerationStatus.Pending), "Campaign not pending review");
        
        metadata.status = uint8(ModerationStatus.Approved);
        metadata.reviewedAt = uint64(block.timestamp);
        pendingReviewCount--;
        
        // Unpause if it was paused
        Campaign campaign = Campaign(_campaignAddress);
        if (campaign.paused()) {
            campaign.unpause();
        }
        
        emit CampaignApproved(_campaignAddress, msg.sender);
    }
    
    /**
     * @notice Reject a campaign (moderator only)
     */
    function rejectCampaign(address _campaignAddress, bytes32 _reasonCode) 
        external 
        onlyModerator 
    {
        require(isCampaign[_campaignAddress], "Invalid campaign");
        CampaignMetadata storage metadata = campaignMetadata[_campaignAddress];
        require(
            metadata.status == uint8(ModerationStatus.Pending) || 
            metadata.status == uint8(ModerationStatus.Flagged),
            "Cannot reject this campaign"
        );
        require(_reasonCode != bytes32(0), "Rejection reason required");
        
        metadata.status = uint8(ModerationStatus.Rejected);
        metadata.rejectionCode = _reasonCode;
        metadata.reviewedAt = uint64(block.timestamp);
        pendingReviewCount--;
        
        // Pause the campaign
        Campaign(_campaignAddress).pause();
        
        emit CampaignRejected(_campaignAddress, _reasonCode);
    }
    
    /**
     * @notice Flag a campaign for review (community)
     */
    function flagCampaign(address _campaignAddress) external {
        require(isCampaign[_campaignAddress], "Invalid campaign");
        require(!hasReported[msg.sender][_campaignAddress], "Already reported");
        
        CampaignMetadata storage metadata = campaignMetadata[_campaignAddress];
        require(metadata.status == uint8(ModerationStatus.Approved), "Campaign not approved");
        
        hasReported[msg.sender][_campaignAddress] = true;
        metadata.flagCount++;
        
        // Auto-flag after 5 reports
        if (metadata.flagCount >= 5) {
            metadata.status = uint8(ModerationStatus.Flagged);
            pendingReviewCount++;
        }
        
        emit CampaignFlagged(_campaignAddress, msg.sender, metadata.flagCount);
    }
    
    /**
     * @notice Blacklist a founder (moderator only)
     */
    function blacklistFounder(address _founder, string memory _reason) external onlyModerator {
        require(_founder != address(0), "Invalid address");
        require(!blacklistedFounders[_founder], "Already blacklisted");
        
        blacklistedFounders[_founder] = true;
        
        // Pause all their campaigns
        address[] memory founderCamps = founderCampaigns[_founder];
        for (uint256 i = 0; i < founderCamps.length; i++) {
            Campaign(founderCamps[i]).pause();
        }
        
        emit FounderBlacklisted(_founder, _reason);
    }
    
    /**
     * @notice Add a moderator (owner only)
     */
    function addModerator(address _moderator) external onlyOwner {
        require(_moderator != address(0), "Invalid address");
        require(!moderators[_moderator], "Already a moderator");
        
        moderators[_moderator] = true;
        emit ModeratorAdded(_moderator);
    }
    
    /**
     * @notice Remove a moderator (owner only)
     */
    function removeModerator(address _moderator) external onlyOwner {
        require(moderators[_moderator], "Not a moderator");
        require(_moderator != owner(), "Cannot remove owner");
        
        moderators[_moderator] = false;
        emit ModeratorRemoved(_moderator);
    }
    
    /**
     * @notice Update platform wallet (owner only)
     */
    function setPlatformWallet(address _newWallet) external onlyOwner {
        require(_newWallet != address(0), "Invalid address");
        address oldWallet = platformWallet;
        platformWallet = _newWallet;
        emit PlatformWalletUpdated(oldWallet, _newWallet);
    }
    
    /**
     * @notice Update payment token (owner only)
     * @dev Only affects NEW campaigns. Existing campaigns keep their token.
     */
    function setPaymentToken(address _newToken) external onlyOwner {
        require(_newToken != address(0), "Invalid token");
        address oldToken = paymentToken;
        paymentToken = _newToken;
        emit PaymentTokenUpdated(oldToken, _newToken);
    }
    
    /**
     * @notice Get approved campaigns
     */
    function getApprovedCampaigns(uint256 _offset, uint256 _limit) 
        external 
        view 
        returns (address[] memory) 
    {
        uint256 approvedCount = 0;
        for (uint256 i = 0; i < campaigns.length; i++) {
            if (campaignMetadata[campaigns[i]].status == uint8(ModerationStatus.Approved)) {
                approvedCount++;
            }
        }
        
        if (_offset >= approvedCount) {
            return new address[](0);
        }
        
        uint256 end = _offset + _limit;
        if (end > approvedCount) {
            end = approvedCount;
        }
        
        uint256 resultLength = end - _offset;
        address[] memory result = new address[](resultLength);
        
        uint256 currentIndex = 0;
        uint256 resultIndex = 0;
        
        for (uint256 i = 0; i < campaigns.length && resultIndex < resultLength; i++) {
            if (campaignMetadata[campaigns[i]].status == uint8(ModerationStatus.Approved)) {
                if (currentIndex >= _offset) {
                    result[resultIndex] = campaigns[i];
                    resultIndex++;
                }
                currentIndex++;
            }
        }
        
        return result;
    }
    
    /**
     * @notice Get pending campaigns
     */
    function getPendingCampaigns() external view returns (address[] memory) {
        uint256 pendingCount = 0;
        for (uint256 i = 0; i < campaigns.length; i++) {
            if (campaignMetadata[campaigns[i]].status == uint8(ModerationStatus.Pending)) {
                pendingCount++;
            }
        }
        
        address[] memory result = new address[](pendingCount);
        uint256 resultIndex = 0;
        
        for (uint256 i = 0; i < campaigns.length; i++) {
            if (campaignMetadata[campaigns[i]].status == uint8(ModerationStatus.Pending)) {
                result[resultIndex] = campaigns[i];
                resultIndex++;
            }
        }
        
        return result;
    }
    
    /**
     * @notice Get flagged campaigns
     */
    function getFlaggedCampaigns() external view returns (address[] memory) {
        uint256 flaggedCount = 0;
        for (uint256 i = 0; i < campaigns.length; i++) {
            if (campaignMetadata[campaigns[i]].status == uint8(ModerationStatus.Flagged)) {
                flaggedCount++;
            }
        }
        
        address[] memory result = new address[](flaggedCount);
        uint256 resultIndex = 0;
        
        for (uint256 i = 0; i < campaigns.length; i++) {
            if (campaignMetadata[campaigns[i]].status == uint8(ModerationStatus.Flagged)) {
                result[resultIndex] = campaigns[i];
                resultIndex++;
            }
        }
        
        return result;
    }
    
    /**
     * @notice Get campaign status
     */
    function getCampaignStatus(address _campaignAddress) 
        external 
        view 
        returns (
            ModerationStatus status,
            uint256 flagCount,
            bytes32 rejectionCode
        ) 
    {
        require(isCampaign[_campaignAddress], "Invalid campaign");
        CampaignMetadata memory metadata = campaignMetadata[_campaignAddress];
        return (
            ModerationStatus(metadata.status),
            metadata.flagCount,
            metadata.rejectionCode
        );
    }
    
    /**
     * @notice Get campaign count
     */
    function getCampaignCount() external view returns (uint256) {
        return campaigns.length;
    }
    
    /**
     * @notice Get campaigns by founder
     */
    function getCampaignsByFounder(address _founder) 
        external 
        view 
        returns (address[] memory) 
    {
        return founderCampaigns[_founder];
    }
    
    /**
     * @notice Get paginated campaigns
     */
    function getCampaigns(uint256 _offset, uint256 _limit) 
        external 
        view 
        returns (address[] memory) 
    {
        uint256 totalCount = campaigns.length;
        if (_offset >= totalCount) {
            return new address[](0);
        }
        
        uint256 end = _offset + _limit;
        if (end > totalCount) {
            end = totalCount;
        }
        
        uint256 resultLength = end - _offset;
        address[] memory result = new address[](resultLength);
        
        for (uint256 i = 0; i < resultLength; i++) {
            result[i] = campaigns[_offset + i];
        }
        
        return result;
    }
    
    /**
     * @notice Get recent campaigns
     */
    function getRecentCampaigns(uint256 _count) 
        external 
        view 
        returns (address[] memory) 
    {
        uint256 totalCount = campaigns.length;
        if (totalCount == 0 || _count == 0) {
            return new address[](0);
        }
        
        uint256 resultCount = _count > totalCount ? totalCount : _count;
        address[] memory result = new address[](resultCount);
        
        for (uint256 i = 0; i < resultCount; i++) {
            result[i] = campaigns[totalCount - 1 - i];
        }
        
        return result;
    }
}
