// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Campaign.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CampaignFactory
 * @notice Factory contract to create and manage Campaign instances
 * @dev Deploys new Campaign contracts and maintains registry
 */
contract CampaignFactory is Ownable, ReentrancyGuard {
    
    // Moderation status enum
    enum ModerationStatus {
        Pending,      // Waiting for admin review
        Approved,     // Admin approved, visible to public
        Rejected,     // Admin rejected, hidden
        Flagged,      // Community flagged, under review
        Suspended     // Temporarily suspended (founder can appeal)
    }
    
    // Campaign metadata for moderation
    struct CampaignMetadata {
        address campaignAddress;
        address founder;
        ModerationStatus status;
        uint256 createdAt;
        uint256 reviewedAt;
        address reviewedBy;
        string rejectionReason;
        uint256 flagCount;
        bool founderVerified;
    }
    
    // Platform wallet for fees
    address public platformWallet;
    
    // Campaign registry
    address[] public campaigns;
    address[] public approvedCampaigns;  // Only approved campaigns (for public listing)
    mapping(address => address[]) public founderCampaigns;  // Founder => campaigns
    mapping(address => bool) public isCampaign;             // Campaign => exists
    
    // Moderation mappings
    mapping(address => CampaignMetadata) public campaignMetadata;
    mapping(address => bool) public blacklistedFounders;    // Banned founders
    mapping(address => bool) public moderators;              // Addresses that can moderate
    mapping(address => mapping(address => bool)) public hasReported; // User => Campaign => reported
    
    // Statistics
    uint256 public totalCampaignsCreated;
    uint256 public totalFundsRaised;
    uint256 public pendingReviewCount;
    uint256 public approvedCount;
    uint256 public rejectedCount;
    
    // Events
    event CampaignCreated(
        address indexed campaignAddress,
        address indexed founder,
        string title,
        uint256 goalAmount,
        uint256 deadline,
        uint256 timestamp
    );
    
    event CampaignApproved(
        address indexed campaignAddress,
        address indexed moderator,
        uint256 timestamp
    );
    
    event CampaignRejected(
        address indexed campaignAddress,
        address indexed moderator,
        string reason,
        uint256 timestamp
    );
    
    event CampaignFlagged(
        address indexed campaignAddress,
        address indexed reporter,
        uint256 flagCount,
        uint256 timestamp
    );
    
    event FounderBlacklisted(
        address indexed founder,
        address indexed moderator,
        string reason,
        uint256 timestamp
    );
    
    event ModeratorAdded(
        address indexed moderator,
        address indexed addedBy,
        uint256 timestamp
    );
    
    event ModeratorRemoved(
        address indexed moderator,
        address indexed removedBy,
        uint256 timestamp
    );
    
    event PlatformWalletUpdated(
        address indexed oldWallet,
        address indexed newWallet,
        uint256 timestamp
    );
    
    /**
     * @notice Initialize factory with platform wallet
     * @param _platformWallet Address to receive platform fees
     */
    constructor(address _platformWallet) Ownable(msg.sender) {
        require(_platformWallet != address(0), "Invalid platform wallet");
        platformWallet = _platformWallet;
        moderators[msg.sender] = true; // Owner is default moderator
    }
    
    /**
     * @notice Modifier to restrict function to moderators only
     */
    modifier onlyModerator() {
        require(moderators[msg.sender] || msg.sender == owner(), "Not a moderator");
        _;
    }
    
    /**
     * @notice Modifier to check if founder is not blacklisted
     */
    modifier notBlacklisted() {
        require(!blacklistedFounders[msg.sender], "Founder is blacklisted");
        _;
    }
    
    /**
     * @notice Create a new campaign
     * @param _goalAmount Funding goal in wei
     * @param _durationDays Campaign duration in days
     * @param _title Campaign title
     * @param _description Campaign description
     * @param _imageURI IPFS URI for campaign image
     * @return Address of newly created campaign
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
        require(_goalAmount <= 1000 ether, "Goal too high (max 1000 ETH)"); // Prevent unrealistic goals
        require(_durationDays >= 7 && _durationDays <= 90, "Duration must be 7-90 days");
        require(bytes(_title).length >= 10 && bytes(_title).length <= 200, "Title must be 10-200 chars");
        require(bytes(_description).length >= 50, "Description must be at least 50 chars");
        require(bytes(_imageURI).length > 0, "Image URI required");
        
        // Check founder doesn't have too many pending campaigns
        uint256 pendingCampaigns = 0;
        address[] memory founderCamps = founderCampaigns[msg.sender];
        for (uint256 i = 0; i < founderCamps.length; i++) {
            if (campaignMetadata[founderCamps[i]].status == ModerationStatus.Pending) {
                pendingCampaigns++;
            }
        }
        require(pendingCampaigns < 3, "Too many pending campaigns (max 3)");
        
        // Calculate deadline
        uint256 deadline = block.timestamp + (_durationDays * 1 days);
        
        // Deploy new campaign
        Campaign newCampaign = new Campaign(
            msg.sender,          // founder
            _goalAmount,
            deadline,
            _title,
            _description,
            _imageURI,
            platformWallet
        );
        
        address campaignAddress = address(newCampaign);
        
        // Update registry
        campaigns.push(campaignAddress);
        founderCampaigns[msg.sender].push(campaignAddress);
        isCampaign[campaignAddress] = true;
        totalCampaignsCreated++;
        pendingReviewCount++;
        
        // Create metadata for moderation
        campaignMetadata[campaignAddress] = CampaignMetadata({
            campaignAddress: campaignAddress,
            founder: msg.sender,
            status: ModerationStatus.Pending,  // Requires approval
            createdAt: block.timestamp,
            reviewedAt: 0,
            reviewedBy: address(0),
            rejectionReason: "",
            flagCount: 0,
            founderVerified: false
        });
        
        // Pause campaign until approved (prevents contributions)
        Campaign(campaignAddress).pause();
        
        emit CampaignCreated(
            campaignAddress,
            msg.sender,
            _title,
            _goalAmount,
            deadline,
            block.timestamp
        );
        
        return campaignAddress;
    }
    
    // ============================================
    // MODERATION FUNCTIONS
    // ============================================
    
    /**
     * @notice Approve a campaign (moderator only)
     * @param _campaignAddress Address of campaign to approve
     */
    function approveCampaign(address _campaignAddress) external onlyModerator {
        require(isCampaign[_campaignAddress], "Invalid campaign");
        CampaignMetadata storage metadata = campaignMetadata[_campaignAddress];
        require(metadata.status == ModerationStatus.Pending, "Campaign not pending review");
        
        // Update status
        metadata.status = ModerationStatus.Approved;
        metadata.reviewedAt = block.timestamp;
        metadata.reviewedBy = msg.sender;
        
        // Add to approved list
        approvedCampaigns.push(_campaignAddress);
        
        // Unpause campaign (allow contributions)
        Campaign(_campaignAddress).unpause();
        
        // Update counters
        pendingReviewCount--;
        approvedCount++;
        
        emit CampaignApproved(_campaignAddress, msg.sender, block.timestamp);
    }
    
    /**
     * @notice Reject a campaign (moderator only)
     * @param _campaignAddress Address of campaign to reject
     * @param _reason Reason for rejection
     */
    function rejectCampaign(address _campaignAddress, string memory _reason) external onlyModerator {
        require(isCampaign[_campaignAddress], "Invalid campaign");
        CampaignMetadata storage metadata = campaignMetadata[_campaignAddress];
        require(metadata.status == ModerationStatus.Pending || metadata.status == ModerationStatus.Flagged, 
                "Campaign not pending review");
        require(bytes(_reason).length > 0, "Rejection reason required");
        
        // Check no contributions yet (safety check)
        Campaign campaign = Campaign(_campaignAddress);
        require(campaign.totalRaised() == 0, "Cannot reject campaign with contributions");
        
        // Update status
        metadata.status = ModerationStatus.Rejected;
        metadata.reviewedAt = block.timestamp;
        metadata.reviewedBy = msg.sender;
        metadata.rejectionReason = _reason;
        
        // Keep campaign paused
        // Founder can see rejection reason but campaign stays inactive
        
        // Update counters
        pendingReviewCount--;
        rejectedCount++;
        
        emit CampaignRejected(_campaignAddress, msg.sender, _reason, block.timestamp);
    }
    
    /**
     * @notice Community members can flag suspicious campaigns
     * @param _campaignAddress Address of campaign to flag
     */
    function flagCampaign(address _campaignAddress) external {
        require(isCampaign[_campaignAddress], "Invalid campaign");
        require(!hasReported[msg.sender][_campaignAddress], "Already reported");
        
        CampaignMetadata storage metadata = campaignMetadata[_campaignAddress];
        require(metadata.status == ModerationStatus.Approved, "Campaign not approved");
        
        // Mark as reported by this user
        hasReported[msg.sender][_campaignAddress] = true;
        metadata.flagCount++;
        
        // Auto-suspend if too many flags (threshold: 10)
        if (metadata.flagCount >= 10 && metadata.status != ModerationStatus.Suspended) {
            metadata.status = ModerationStatus.Suspended;
            Campaign(_campaignAddress).pause(); // Stop contributions
        }
        
        emit CampaignFlagged(_campaignAddress, msg.sender, metadata.flagCount, block.timestamp);
    }
    
    /**
     * @notice Blacklist a founder (moderator only)
     * @param _founder Address of founder to blacklist
     * @param _reason Reason for blacklisting
     */
    function blacklistFounder(address _founder, string memory _reason) external onlyModerator {
        require(_founder != address(0), "Invalid founder address");
        require(!blacklistedFounders[_founder], "Already blacklisted");
        require(bytes(_reason).length > 0, "Reason required");
        
        blacklistedFounders[_founder] = true;
        
        // Pause all their active campaigns
        address[] memory founderCamps = founderCampaigns[_founder];
        for (uint256 i = 0; i < founderCamps.length; i++) {
            CampaignMetadata storage metadata = campaignMetadata[founderCamps[i]];
            if (metadata.status == ModerationStatus.Approved) {
                metadata.status = ModerationStatus.Suspended;
                Campaign(founderCamps[i]).pause();
            }
        }
        
        emit FounderBlacklisted(_founder, msg.sender, _reason, block.timestamp);
    }
    
    /**
     * @notice Remove founder from blacklist (owner only)
     * @param _founder Address of founder to unban
     */
    function unblacklistFounder(address _founder) external onlyOwner {
        require(blacklistedFounders[_founder], "Founder not blacklisted");
        blacklistedFounders[_founder] = false;
    }
    
    /**
     * @notice Add a moderator (owner only)
     * @param _moderator Address to add as moderator
     */
    function addModerator(address _moderator) external onlyOwner {
        require(_moderator != address(0), "Invalid moderator address");
        require(!moderators[_moderator], "Already a moderator");
        
        moderators[_moderator] = true;
        emit ModeratorAdded(_moderator, msg.sender, block.timestamp);
    }
    
    /**
     * @notice Remove a moderator (owner only)
     * @param _moderator Address to remove from moderators
     */
    function removeModerator(address _moderator) external onlyOwner {
        require(moderators[_moderator], "Not a moderator");
        require(_moderator != owner(), "Cannot remove owner");
        
        moderators[_moderator] = false;
        emit ModeratorRemoved(_moderator, msg.sender, block.timestamp);
    }
    
    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Get approved campaigns only (for public listing)
     * @param _offset Starting index
     * @param _limit Number of campaigns to return
     * @return Array of approved campaign addresses
     */
    function getApprovedCampaigns(uint256 _offset, uint256 _limit) 
        external 
        view 
        returns (address[] memory) 
    {
        require(_offset < approvedCampaigns.length, "Offset out of bounds");
        
        uint256 end = _offset + _limit;
        if (end > approvedCampaigns.length) {
            end = approvedCampaigns.length;
        }
        uint256 size = end - _offset;
        
        address[] memory result = new address[](size);
        for (uint256 i = 0; i < size; i++) {
            result[i] = approvedCampaigns[_offset + i];
        }
        
        return result;
    }
    
    /**
     * @notice Get campaigns pending moderation
     * @return Array of pending campaign addresses
     */
    function getPendingCampaigns() external view returns (address[] memory) {
        // Count pending campaigns
        uint256 pendingCount = 0;
        for (uint256 i = 0; i < campaigns.length; i++) {
            if (campaignMetadata[campaigns[i]].status == ModerationStatus.Pending) {
                pendingCount++;
            }
        }
        
        // Build result array
        address[] memory result = new address[](pendingCount);
        uint256 index = 0;
        for (uint256 i = 0; i < campaigns.length; i++) {
            if (campaignMetadata[campaigns[i]].status == ModerationStatus.Pending) {
                result[index] = campaigns[i];
                index++;
            }
        }
        
        return result;
    }
    
    /**
     * @notice Get campaign moderation status
     * @param _campaignAddress Campaign to check
     * @return Metadata struct with all moderation info
     */
    function getCampaignStatus(address _campaignAddress) 
        external 
        view 
        returns (CampaignMetadata memory) 
    {
        require(isCampaign[_campaignAddress], "Invalid campaign");
        return campaignMetadata[_campaignAddress];
    }
    
    /**
     * @notice Check if founder is blacklisted
     * @param _founder Founder address to check
     * @return True if blacklisted
     */
    function isFounderBlacklisted(address _founder) external view returns (bool) {
        return blacklistedFounders[_founder];
    }
    
    /**
     * @notice Check if address is a moderator
     * @param _address Address to check
     * @return True if moderator
     */
    function isModerator(address _address) external view returns (bool) {
        return moderators[_address] || _address == owner();
    }
    
    /**
     * @notice Update platform wallet address
     * @param _newWallet New platform wallet address
     */
    function updatePlatformWallet(address _newWallet) external onlyOwner {
        require(_newWallet != address(0), "Invalid wallet address");
        address oldWallet = platformWallet;
        platformWallet = _newWallet;
        
        emit PlatformWalletUpdated(oldWallet, _newWallet, block.timestamp);
    }
    
    /**
     * @notice Get total number of campaigns
     * @return Number of campaigns created
     */
    function getCampaignCount() external view returns (uint256) {
        return campaigns.length;
    }
    
    /**
     * @notice Get campaigns by founder
     * @param _founder Founder address
     * @return Array of campaign addresses
     */
    function getCampaignsByFounder(address _founder) 
        external 
        view 
        returns (address[] memory) 
    {
        return founderCampaigns[_founder];
    }
    
    /**
     * @notice Get all campaigns (paginated)
     * @param _offset Starting index
     * @param _limit Number of campaigns to return
     * @return Array of campaign addresses
     */
    function getCampaigns(uint256 _offset, uint256 _limit) 
        external 
        view 
        returns (address[] memory) 
    {
        require(_offset < campaigns.length, "Offset out of bounds");
        
        uint256 end = _offset + _limit;
        if (end > campaigns.length) {
            end = campaigns.length;
        }
        
        uint256 size = end - _offset;
        address[] memory result = new address[](size);
        
        for (uint256 i = 0; i < size; i++) {
            result[i] = campaigns[_offset + i];
        }
        
        return result;
    }
    
    /**
     * @notice Get campaign details by index
     * @param _index Campaign index
     * @return campaignAddress Campaign contract address
     * @return founder Founder address
     * @return title Campaign title
     * @return goalAmount Funding goal
     * @return deadline Campaign deadline
     * @return totalRaised Total amount raised
     * @return state Campaign state
     */
    function getCampaignAtIndex(uint256 _index) 
        external 
        view 
        returns (
            address campaignAddress,
            address founder,
            string memory title,
            uint256 goalAmount,
            uint256 deadline,
            uint256 totalRaised,
            Campaign.CampaignState state
        ) 
    {
        require(_index < campaigns.length, "Index out of bounds");
        
        Campaign campaign = Campaign(campaigns[_index]);
        
        (
            founder,
            title,
            ,  // description (skip)
            ,  // imageURI (skip)
            goalAmount,
            deadline,
            totalRaised,
            ,  // contributorCount (skip)
            state
        ) = campaign.getCampaignDetails();
        
        return (
            campaigns[_index],
            founder,
            title,
            goalAmount,
            deadline,
            totalRaised,
            state
        );
    }
    
    /**
     * @notice Get platform statistics
     * @return totalCampaigns Total number of campaigns
     * @return activeCampaigns Number of active campaigns
     * @return successfulCampaigns Number of successful campaigns
     * @return totalRaised Total funds raised across all campaigns
     */
    function getPlatformStats() 
        external 
        view 
        returns (
            uint256 totalCampaigns,
            uint256 activeCampaigns,
            uint256 successfulCampaigns,
            uint256 totalRaised
        ) 
    {
        totalCampaigns = campaigns.length;
        activeCampaigns = 0;
        successfulCampaigns = 0;
        totalRaised = 0;
        
        for (uint256 i = 0; i < campaigns.length; i++) {
            Campaign campaign = Campaign(campaigns[i]);
            
            Campaign.CampaignState state = campaign.state();
            if (state == Campaign.CampaignState.Active) {
                activeCampaigns++;
            } else if (state == Campaign.CampaignState.Successful) {
                successfulCampaigns++;
            }
            
            totalRaised += campaign.totalRaised();
        }
        
        return (totalCampaigns, activeCampaigns, successfulCampaigns, totalRaised);
    }
    
    /**
     * @notice Check if address is a campaign created by this factory
     * @param _campaign Address to check
     * @return True if campaign exists
     */
    function isValidCampaign(address _campaign) external view returns (bool) {
        return isCampaign[_campaign];
    }
    
    /**
     * @notice Get recent campaigns
     * @param _count Number of recent campaigns to return
     * @return Array of campaign addresses (most recent first)
     */
    function getRecentCampaigns(uint256 _count) 
        external 
        view 
        returns (address[] memory) 
    {
        uint256 length = campaigns.length;
        if (_count > length) {
            _count = length;
        }
        
        address[] memory result = new address[](_count);
        
        for (uint256 i = 0; i < _count; i++) {
            result[i] = campaigns[length - 1 - i];
        }
        
        return result;
    }
}
