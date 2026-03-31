// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title Campaign
 * @notice Individual crowdfunding campaign contract
 * @dev Implements donation-based and reward-based crowdfunding with escrow
 */
contract Campaign is Ownable, ReentrancyGuard, Pausable {
    
    // Campaign states
    enum CampaignState {
        Active,      // Campaign is accepting contributions
        Successful,  // Goal reached and deadline passed
        Failed,      // Deadline passed but goal not reached
        Cancelled    // Founder cancelled the campaign
    }
    
    // Reward tier structure
    struct RewardTier {
        uint256 minContribution;  // Minimum contribution for this tier
        string description;        // Reward description
        uint256 maxBackers;       // Maximum number of backers (0 = unlimited)
        uint256 currentBackers;   // Current number of backers
        bool isActive;            // Whether tier is still available
    }
    
    // Campaign details
    address public founder;
    string public title;
    string public description;
    string public imageURI;          // IPFS URI for campaign image
    uint256 public goalAmount;       // Funding goal in wei
    uint256 public deadline;         // Unix timestamp
    uint256 public totalRaised;      // Total amount raised
    uint256 public contributorCount; // Number of unique contributors
    CampaignState public state;
    
    // Platform fee (1.5% = 150 basis points)
    uint256 public constant PLATFORM_FEE_BPS = 150;
    uint256 public constant BPS_DENOMINATOR = 10000;
    address public platformWallet;
    
    // Mappings
    mapping(address => uint256) public contributions;     // Contributor => amount
    mapping(address => bool) public hasContributed;       // Track unique contributors
    mapping(uint256 => RewardTier) public rewardTiers;    // Tier ID => Reward
    mapping(address => uint256[]) public contributorRewards; // Contributor => tier IDs
    
    uint256 public rewardTierCount;
    address[] public contributors;
    
    // Events
    event ContributionReceived(
        address indexed contributor,
        uint256 amount,
        uint256 totalRaised,
        uint256 timestamp
    );
    
    event RewardClaimed(
        address indexed contributor,
        uint256 tierId,
        uint256 timestamp
    );
    
    event FundsWithdrawn(
        address indexed founder,
        uint256 amount,
        uint256 platformFee,
        uint256 timestamp
    );
    
    event RefundIssued(
        address indexed contributor,
        uint256 amount,
        uint256 timestamp
    );
    
    event CampaignStateChanged(
        CampaignState oldState,
        CampaignState newState,
        uint256 timestamp
    );
    
    event RewardTierAdded(
        uint256 indexed tierId,
        uint256 minContribution,
        uint256 maxBackers,
        uint256 timestamp
    );
    
    /**
     * @notice Create a new campaign
     * @param _founder Address of campaign founder
     * @param _goalAmount Funding goal in wei
     * @param _deadline Campaign deadline (unix timestamp)
     * @param _title Campaign title
     * @param _description Campaign description
     * @param _imageURI IPFS URI for campaign image
     * @param _platformWallet Address to receive platform fees
     */
    constructor(
        address _founder,
        uint256 _goalAmount,
        uint256 _deadline,
        string memory _title,
        string memory _description,
        string memory _imageURI,
        address _platformWallet
    ) Ownable(_founder) {
        require(_founder != address(0), "Invalid founder address");
        require(_goalAmount > 0, "Goal must be greater than 0");
        require(_deadline > block.timestamp, "Deadline must be in future");
        require(bytes(_title).length > 0, "Title cannot be empty");
        require(_platformWallet != address(0), "Invalid platform wallet");
        
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
        require(state == CampaignState.Active, "Campaign not active");
        require(_minContribution > 0, "Min contribution must be > 0");
        require(bytes(_description).length > 0, "Description cannot be empty");
        
        rewardTiers[rewardTierCount] = RewardTier({
            minContribution: _minContribution,
            description: _description,
            maxBackers: _maxBackers,
            currentBackers: 0,
            isActive: true
        });
        
        emit RewardTierAdded(rewardTierCount, _minContribution, _maxBackers, block.timestamp);
        rewardTierCount++;
    }
    
    /**
     * @notice Contribute to the campaign
     * @dev Automatically assigns reward tiers based on contribution amount
     */
    function contribute() external payable nonReentrant whenNotPaused {
        require(state == CampaignState.Active, "Campaign not active");
        require(block.timestamp < deadline, "Campaign deadline passed");
        require(msg.value > 0, "Contribution must be > 0");
        
        // Track unique contributors
        if (!hasContributed[msg.sender]) {
            hasContributed[msg.sender] = true;
            contributors.push(msg.sender);
            contributorCount++;
        }
        
        // Update contribution
        contributions[msg.sender] += msg.value;
        totalRaised += msg.value;
        
        // Assign reward tiers
        _assignRewardTiers(msg.sender);
        
        emit ContributionReceived(msg.sender, msg.value, totalRaised, block.timestamp);
    }
    
    /**
     * @notice Assign reward tiers based on contribution amount
     * @param _contributor Address of contributor
     */
    function _assignRewardTiers(address _contributor) private {
        uint256 totalContribution = contributions[_contributor];
        
        for (uint256 i = 0; i < rewardTierCount; i++) {
            RewardTier storage tier = rewardTiers[i];
            
            if (
                tier.isActive &&
                totalContribution >= tier.minContribution &&
                (tier.maxBackers == 0 || tier.currentBackers < tier.maxBackers)
            ) {
                // Check if contributor already has this tier
                bool hasTier = false;
                uint256[] memory userRewards = contributorRewards[_contributor];
                for (uint256 j = 0; j < userRewards.length; j++) {
                    if (userRewards[j] == i) {
                        hasTier = true;
                        break;
                    }
                }
                
                if (!hasTier) {
                    contributorRewards[_contributor].push(i);
                    tier.currentBackers++;
                    emit RewardClaimed(_contributor, i, block.timestamp);
                }
            }
        }
    }
    
    /**
     * @notice Withdraw funds after successful campaign
     * @dev Can only be called by founder after goal reached and deadline passed
     */
    function withdraw() external nonReentrant onlyOwner {
        require(
            state == CampaignState.Active || state == CampaignState.Successful,
            "Invalid state for withdrawal"
        );
        require(block.timestamp >= deadline, "Campaign still active");
        require(totalRaised >= goalAmount, "Goal not reached");
        
        // Update state
        if (state != CampaignState.Successful) {
            CampaignState oldState = state;
            state = CampaignState.Successful;
            emit CampaignStateChanged(oldState, state, block.timestamp);
        }
        
        uint256 amount = address(this).balance;
        require(amount > 0, "No funds to withdraw");
        
        // Calculate platform fee (1.5%)
        uint256 platformFee = (amount * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 founderAmount = amount - platformFee;
        
        // Transfer platform fee
        (bool platformSuccess, ) = platformWallet.call{value: platformFee}("");
        require(platformSuccess, "Platform fee transfer failed");
        
        // Transfer remaining funds to founder
        (bool founderSuccess, ) = founder.call{value: founderAmount}("");
        require(founderSuccess, "Founder transfer failed");
        
        emit FundsWithdrawn(founder, founderAmount, platformFee, block.timestamp);
    }
    
    /**
     * @notice Request refund after failed campaign
     * @dev Can only be called by contributors if goal not reached after deadline
     */
    function refund() external nonReentrant {
        require(block.timestamp >= deadline, "Campaign still active");
        require(totalRaised < goalAmount, "Campaign was successful");
        require(contributions[msg.sender] > 0, "No contribution to refund");
        
        // Update state if needed
        if (state == CampaignState.Active) {
            CampaignState oldState = state;
            state = CampaignState.Failed;
            emit CampaignStateChanged(oldState, state, block.timestamp);
        }
        
        uint256 amount = contributions[msg.sender];
        contributions[msg.sender] = 0;
        
        // Transfer refund
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Refund transfer failed");
        
        emit RefundIssued(msg.sender, amount, block.timestamp);
    }
    
    /**
     * @notice Cancel campaign (founder only)
     * @dev Can only cancel if no contributions yet
     */
    function cancelCampaign() external onlyOwner {
        require(state == CampaignState.Active, "Campaign not active");
        require(totalRaised == 0, "Cannot cancel with contributions");
        
        CampaignState oldState = state;
        state = CampaignState.Cancelled;
        emit CampaignStateChanged(oldState, state, block.timestamp);
    }
    
    /**
     * @notice Emergency pause (platform admin only via factory)
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
     * @notice Update campaign state based on current conditions
     * @dev Anyone can call this to update state after deadline
     */
    function updateState() external {
        require(block.timestamp >= deadline, "Campaign still active");
        require(state == CampaignState.Active, "State already updated");
        
        CampaignState oldState = state;
        
        if (totalRaised >= goalAmount) {
            state = CampaignState.Successful;
        } else {
            state = CampaignState.Failed;
        }
        
        emit CampaignStateChanged(oldState, state, block.timestamp);
    }
    
    // View functions
    
    /**
     * @notice Get campaign progress percentage
     * @return Progress as percentage (0-100)
     */
    function getProgress() external view returns (uint256) {
        if (goalAmount == 0) return 0;
        uint256 progress = (totalRaised * 100) / goalAmount;
        return progress > 100 ? 100 : progress;
    }
    
    /**
     * @notice Get time remaining in seconds
     * @return Seconds until deadline (0 if passed)
     */
    function getTimeRemaining() external view returns (uint256) {
        if (block.timestamp >= deadline) return 0;
        return deadline - block.timestamp;
    }
    
    /**
     * @notice Check if campaign is successful
     * @return True if goal reached
     */
    function isSuccessful() external view returns (bool) {
        return totalRaised >= goalAmount;
    }
    
    /**
     * @notice Get contributor's reward tiers
     * @param _contributor Address of contributor
     * @return Array of tier IDs
     */
    function getContributorRewards(address _contributor) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return contributorRewards[_contributor];
    }
    
    /**
     * @notice Get all contributors
     * @return Array of contributor addresses
     */
    function getContributors() external view returns (address[] memory) {
        return contributors;
    }
    
    /**
     * @notice Get reward tier details
     * @param _tierId ID of reward tier
     * @return Reward tier struct
     */
    function getRewardTier(uint256 _tierId) 
        external 
        view 
        returns (RewardTier memory) 
    {
        require(_tierId < rewardTierCount, "Invalid tier ID");
        return rewardTiers[_tierId];
    }
    
    /**
     * @notice Get campaign details
     * @return _founder Campaign founder address
     * @return _title Campaign title
     * @return _description Campaign description
     * @return _imageURI Campaign image URI
     * @return _goalAmount Funding goal amount
     * @return _deadline Campaign deadline timestamp
     * @return _totalRaised Total amount raised
     * @return _contributorCount Number of contributors
     * @return _state Current campaign state
     */
    function getCampaignDetails() external view returns (
        address _founder,
        string memory _title,
        string memory _description,
        string memory _imageURI,
        uint256 _goalAmount,
        uint256 _deadline,
        uint256 _totalRaised,
        uint256 _contributorCount,
        CampaignState _state
    ) {
        return (
            founder,
            title,
            description,
            imageURI,
            goalAmount,
            deadline,
            totalRaised,
            contributorCount,
            state
        );
    }
}
