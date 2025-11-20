// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title Campaign (Clone Implementation)
 * @notice Individual crowdfunding campaign contract - designed for minimal proxy pattern
 * @dev Uses initializer instead of constructor for clone compatibility
 */
contract Campaign is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    
    // Campaign states
    enum CampaignState {
        Active,      // Campaign is accepting contributions
        Successful,  // Goal reached and deadline passed
        Failed,      // Deadline passed but goal not reached
        Cancelled    // Founder cancelled the campaign
    }
    
    // Reward tier structure
    struct RewardTier {
        uint256 minContribution;
        string description;
        uint256 maxBackers;
        uint256 currentBackers;
    }
    
    // Core campaign data
    address public founder;
    uint256 public goalAmount;
    uint256 public deadline;
    string public title;
    string public description;
    string public imageURI;
    address public platformWallet;
    
    // Campaign state
    CampaignState public state;
    uint256 public totalRaised;
    uint256 public contributorCount;
    
    // Contribution tracking
    mapping(address => uint256) public contributions;
    mapping(address => bool) public hasContributed;
    address[] public contributors;
    
    // Reward tiers
    RewardTier[] public rewardTiers;
    mapping(address => uint256[]) public contributorRewardTiers;
    
    // Constants
    uint256 public constant PLATFORM_FEE_PERCENT = 2;
    
    // Events
    event ContributionReceived(address indexed contributor, uint256 amount, uint256 newTotal, uint256 timestamp);
    event FundsWithdrawn(address indexed founder, uint256 amount, uint256 platformFee, uint256 timestamp);
    event RefundIssued(address indexed contributor, uint256 amount, uint256 timestamp);
    event CampaignCancelled(uint256 timestamp);
    event RewardTierAdded(uint256 tierId, uint256 minContribution, uint256 maxBackers);
    event RewardTierAssigned(address indexed contributor, uint256 tierId);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @notice Initialize the campaign (replaces constructor)
     * @dev Called once by factory after clone deployment
     */
    function initialize(
        address _founder,
        uint256 _goalAmount,
        uint256 _deadline,
        string memory _title,
        string memory _description,
        string memory _imageURI,
        address _platformWallet
    ) external initializer {
        require(_founder != address(0), "Invalid founder address");
        require(_goalAmount > 0, "Goal must be greater than 0");
        require(_deadline > block.timestamp, "Deadline must be in future");
        require(bytes(_title).length > 0, "Title cannot be empty");
        require(_platformWallet != address(0), "Invalid platform wallet");
        
        __Ownable_init(_founder);
        __ReentrancyGuard_init();
        __Pausable_init();
        
        founder = _founder;
        goalAmount = _goalAmount;
        deadline = _deadline;
        title = _title;
        description = _description;
        imageURI = _imageURI;
        platformWallet = _platformWallet;
        state = CampaignState.Active;
    }
    
    /**
     * @notice Add a reward tier to the campaign
     * @param _minContribution Minimum contribution for this tier
     * @param _description Reward description
     * @param _maxBackers Maximum backers (0 = unlimited)
     */
    function addRewardTier(
        uint256 _minContribution,
        string memory _description,
        uint256 _maxBackers
    ) external onlyOwner {
        require(_minContribution > 0, "Min contribution must be > 0");
        require(bytes(_description).length > 0, "Description required");
        require(state == CampaignState.Active, "Campaign not active");
        require(block.timestamp < deadline, "Campaign ended");
        
        rewardTiers.push(RewardTier({
            minContribution: _minContribution,
            description: _description,
            maxBackers: _maxBackers,
            currentBackers: 0
        }));
        
        emit RewardTierAdded(rewardTiers.length - 1, _minContribution, _maxBackers);
    }
    
    /**
     * @notice Contribute to the campaign
     */
    function contribute() external payable nonReentrant whenNotPaused {
        require(state == CampaignState.Active, "Campaign not active");
        require(block.timestamp < deadline, "Campaign has ended");
        require(msg.value > 0, "Contribution must be > 0");
        
        // Track contributor
        if (!hasContributed[msg.sender]) {
            hasContributed[msg.sender] = true;
            contributors.push(msg.sender);
            contributorCount++;
        }
        
        contributions[msg.sender] += msg.value;
        totalRaised += msg.value;
        
        _assignRewardTiers(msg.sender);
        
        emit ContributionReceived(msg.sender, msg.value, totalRaised, block.timestamp);
    }
    
    /**
     * @notice Withdraw funds if campaign is successful
     */
    function withdraw() external nonReentrant onlyOwner {
        require(state == CampaignState.Active, "Campaign not active");
        require(block.timestamp >= deadline, "Campaign still running");
        require(totalRaised >= goalAmount, "Goal not reached");
        
        state = CampaignState.Successful;
        
        uint256 amount = address(this).balance;
        require(amount > 0, "No funds to withdraw");
        
        // Calculate platform fee
        uint256 platformFee = (amount * PLATFORM_FEE_PERCENT) / 100;
        uint256 founderAmount = amount - platformFee;
        
        // Transfer platform fee
        (bool platformSuccess, ) = platformWallet.call{value: platformFee}("");
        require(platformSuccess, "Platform transfer failed");
        
        // Transfer to founder
        (bool founderSuccess, ) = founder.call{value: founderAmount}("");
        require(founderSuccess, "Founder transfer failed");
        
        emit FundsWithdrawn(founder, founderAmount, platformFee, block.timestamp);
    }
    
    /**
     * @notice Get refund if campaign failed
     */
    function refund() external nonReentrant whenNotPaused {
        require(contributions[msg.sender] > 0, "No contribution to refund");
        
        // Check if campaign failed
        bool campaignFailed = (block.timestamp >= deadline && totalRaised < goalAmount);
        bool campaignCancelled = (state == CampaignState.Cancelled);
        
        require(campaignFailed || campaignCancelled, "Refund not available");
        
        if (campaignFailed && state == CampaignState.Active) {
            state = CampaignState.Failed;
        }
        
        uint256 amount = contributions[msg.sender];
        contributions[msg.sender] = 0;
        
        // Transfer refund
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Refund transfer failed");
        
        emit RefundIssued(msg.sender, amount, block.timestamp);
    }
    
    /**
     * @notice Cancel the campaign (owner only, before deadline)
     */
    function cancel() external onlyOwner {
        require(state == CampaignState.Active, "Campaign not active");
        require(block.timestamp < deadline, "Cannot cancel after deadline");
        
        state = CampaignState.Cancelled;
        emit CampaignCancelled(block.timestamp);
    }
    
    /**
     * @notice Pause campaign (emergency only)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause campaign
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @notice Get current campaign state
     */
    function getCurrentState() external view returns (CampaignState) {
        if (state != CampaignState.Active) {
            return state;
        }
        
        if (block.timestamp < deadline) {
            return CampaignState.Active;
        }
        
        if (totalRaised >= goalAmount) {
            return CampaignState.Successful;
        }
        
        return CampaignState.Failed;
    }
    
    /**
     * @notice Get reward tier information
     */
    function getRewardTier(uint256 _tierId) external view returns (
        uint256 minContribution,
        string memory tierDescription,
        uint256 maxBackers,
        uint256 currentBackers
    ) {
        require(_tierId < rewardTiers.length, "Invalid tier ID");
        RewardTier memory tier = rewardTiers[_tierId];
        return (tier.minContribution, tier.description, tier.maxBackers, tier.currentBackers);
    }
    
    /**
     * @notice Get all reward tiers for a contributor
     */
    function getContributorRewardTiers(address _contributor) external view returns (uint256[] memory) {
        return contributorRewardTiers[_contributor];
    }
    
    /**
     * @notice Get total number of reward tiers
     */
    function getRewardTierCount() external view returns (uint256) {
        return rewardTiers.length;
    }
    
    /**
     * @notice Get list of all contributors
     */
    function getContributors() external view returns (address[] memory) {
        return contributors;
    }
    
    /**
     * @notice Internal function to assign reward tiers
     */
    function _assignRewardTiers(address _contributor) internal {
        uint256 contributionAmount = contributions[_contributor];
        
        for (uint256 i = 0; i < rewardTiers.length; i++) {
            RewardTier storage tier = rewardTiers[i];
            
            // Check if contributor qualifies and tier has space
            if (contributionAmount >= tier.minContribution) {
                if (tier.maxBackers == 0 || tier.currentBackers < tier.maxBackers) {
                    // Check if not already assigned
                    bool alreadyAssigned = false;
                    uint256[] memory assignedTiers = contributorRewardTiers[_contributor];
                    
                    for (uint256 j = 0; j < assignedTiers.length; j++) {
                        if (assignedTiers[j] == i) {
                            alreadyAssigned = true;
                            break;
                        }
                    }
                    
                    if (!alreadyAssigned) {
                        contributorRewardTiers[_contributor].push(i);
                        tier.currentBackers++;
                        emit RewardTierAssigned(_contributor, i);
                    }
                }
            }
        }
    }
}
