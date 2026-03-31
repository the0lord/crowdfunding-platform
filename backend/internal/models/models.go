package models

import (
	"time"

	"gorm.io/gorm"
)

// User represents a platform user
type User struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// Blockchain identity
	WalletAddress string `gorm:"uniqueIndex;not null" json:"wallet_address"`

	// Profile
	Username  string `gorm:"index" json:"username"`
	Email     string `gorm:"index" json:"email"`
	Bio       string `gorm:"type:text" json:"bio"`
	AvatarURL string `json:"avatar_url"`

	// KYC Status
	KYCVerified   bool       `gorm:"default:false" json:"kyc_verified"`
	KYCProvider   string     `json:"kyc_provider"`
	KYCVerifiedAt *time.Time `json:"kyc_verified_at"`

	// Reputation
	ReputationScore int `gorm:"default:0" json:"reputation_score"`

	// Relationships
	CampaignsCreated []Campaign     `gorm:"foreignKey:FounderAddress;references:WalletAddress" json:"campaigns_created,omitempty"`
	Contributions    []Contribution `gorm:"foreignKey:ContributorAddress;references:WalletAddress" json:"contributions,omitempty"`
}

// Campaign represents a crowdfunding campaign
type Campaign struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// Blockchain data
	ContractAddress string `gorm:"uniqueIndex;not null" json:"contract_address"`
	FounderAddress  string `gorm:"index;not null" json:"founder_address"`

	// Campaign details
	Title       string    `gorm:"not null" json:"title"`
	Description string    `gorm:"type:text;not null" json:"description"`
	ImageURL    string    `json:"image_url"`
	GoalAmount  string    `gorm:"not null" json:"goal_amount"` // Stored as string to handle big numbers
	Deadline    time.Time `json:"deadline"`

	// Status
	State            string `gorm:"index" json:"state"` // Active, Successful, Failed, Cancelled
	TotalRaised      string `gorm:"default:0" json:"total_raised"`
	ContributorCount int    `gorm:"default:0" json:"contributor_count"`

	// Moderation
	ModerationStatus string     `gorm:"index;default:'pending'" json:"moderation_status"` // pending, approved, rejected, flagged
	ReviewedAt       *time.Time `json:"reviewed_at"`
	ReviewedBy       string     `json:"reviewed_by"`
	RejectionReason  string     `json:"rejection_reason"`
	FlagCount        int        `gorm:"default:0" json:"flag_count"`

	// Categories
	Category string `gorm:"index" json:"category"`
	Tags     string `json:"tags"` // Comma-separated

	// Relationships
	Founder       User             `gorm:"foreignKey:FounderAddress;references:WalletAddress" json:"founder,omitempty"`
	Contributions []Contribution   `gorm:"foreignKey:CampaignID" json:"contributions,omitempty"`
	Updates       []CampaignUpdate `gorm:"foreignKey:CampaignID" json:"updates,omitempty"`
}

// Contribution represents a contribution to a campaign
type Contribution struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// Blockchain data
	TransactionHash    string `gorm:"uniqueIndex;not null" json:"transaction_hash"`
	CampaignID         uint   `gorm:"index;not null" json:"campaign_id"`
	ContributorAddress string `gorm:"index;not null" json:"contributor_address"`

	// Contribution details
	Amount    string    `gorm:"not null" json:"amount"` // Stored as string for big numbers
	Timestamp time.Time `json:"timestamp"`

	// Status
	Refunded   bool       `gorm:"default:false" json:"refunded"`
	RefundedAt *time.Time `json:"refunded_at"`

	// Relationships
	Campaign    Campaign `gorm:"foreignKey:CampaignID" json:"campaign,omitempty"`
	Contributor User     `gorm:"foreignKey:ContributorAddress;references:WalletAddress" json:"contributor,omitempty"`
}

// CampaignUpdate represents an update posted by campaign founder
type CampaignUpdate struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	CampaignID uint   `gorm:"index;not null" json:"campaign_id"`
	Title      string `gorm:"not null" json:"title"`
	Content    string `gorm:"type:text;not null" json:"content"`

	// Relationships
	Campaign Campaign `gorm:"foreignKey:CampaignID" json:"campaign,omitempty"`
}

// ModerationLog represents moderation actions
type ModerationLog struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	CreatedAt time.Time `json:"created_at"`

	CampaignID       uint   `gorm:"index;not null" json:"campaign_id"`
	ModeratorAddress string `gorm:"index;not null" json:"moderator_address"`
	Action           string `gorm:"not null" json:"action"` // approved, rejected, flagged
	Reason           string `gorm:"type:text" json:"reason"`

	// Relationships
	Campaign Campaign `gorm:"foreignKey:CampaignID" json:"campaign,omitempty"`
}

// BlacklistedAddress represents blacklisted wallet addresses
type BlacklistedAddress struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	Address       string `gorm:"uniqueIndex;not null" json:"address"`
	Reason        string `gorm:"type:text;not null" json:"reason"`
	BlacklistedBy string `gorm:"not null" json:"blacklisted_by"`
}

// ──────────────────────────── KGST Platform Models ────────────────────────────

// WalletTier represents user wallet tier levels
type WalletTier int

const (
	WalletTierEmbedded    WalletTier = 1 // Web3Auth embedded
	WalletTierMPC         WalletTier = 2 // Web3Auth tKey/MPC
	WalletTierSelfCustody WalletTier = 3 // MetaMask/Ledger
)

// KYCLevel represents KYC verification levels
type KYCLevel int

const (
	KYCNone     KYCLevel = 0
	KYCBasic    KYCLevel = 1 // Email + Phone
	KYCEnhanced KYCLevel = 2 // ID + Selfie
	KYCFull     KYCLevel = 3 // ID + Proof of Address
)

// UserWallet stores wallet and KYC info for KGST platform users
type UserWallet struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// Link to User
	UserID        uint   `gorm:"index;not null" json:"user_id"`
	WalletAddress string `gorm:"uniqueIndex;not null" json:"wallet_address"`

	// Wallet Tier
	WalletTier WalletTier `gorm:"default:1" json:"wallet_tier"`
	WalletType string     `json:"wallet_type"` // "web3auth", "web3auth_mpc", "metamask", "ledger"
	Web3AuthID string     `gorm:"index" json:"web3auth_id,omitempty"`

	// KYC
	KYCLevel       KYCLevel   `gorm:"default:0" json:"kyc_level"`
	KYCProvider    string     `json:"kyc_provider"` // "sumsub"
	KYCApplicantID string     `gorm:"index" json:"kyc_applicant_id,omitempty"`
	KYCHash        string     `json:"kyc_hash,omitempty"` // On-chain hash reference
	KYCVerifiedAt  *time.Time `json:"kyc_verified_at"`

	// Limits
	MonthlyLimit  string     `json:"monthly_limit"` // KGST limit based on tier
	MonthlyVolume string     `gorm:"default:0" json:"monthly_volume"`
	VolumeResetAt *time.Time `json:"volume_reset_at"`

	// Status
	IsActive bool `gorm:"default:true" json:"is_active"`
	IsFrozen bool `gorm:"default:false" json:"is_frozen"`

	// Gas sponsorship
	GasSponsored  bool `gorm:"default:true" json:"gas_sponsored"`
	GasSubsidyPct int  `gorm:"default:100" json:"gas_subsidy_pct"` // 100 = fully sponsored

	// Relationships
	User               User                `gorm:"foreignKey:UserID" json:"user,omitempty"`
	BridgeTransactions []BridgeTransaction `gorm:"foreignKey:WalletAddress;references:WalletAddress" json:"bridge_transactions,omitempty"`
}

// BridgeTransaction represents a KGS <-> KGST bridge operation
type BridgeTransaction struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// Transaction identifiers
	TxID          string `gorm:"uniqueIndex;not null" json:"tx_id"` // Internal bridge tx ID (UUID)
	WalletAddress string `gorm:"index;not null" json:"wallet_address"`

	// Direction
	Direction string `gorm:"not null" json:"direction"` // "deposit" (KGS→KGST) or "withdraw" (KGST→KGS)

	// Amounts
	FiatAmount    string `gorm:"not null" json:"fiat_amount"`    // KGS amount
	TokenAmount   string `gorm:"not null" json:"token_amount"`   // KGST amount (after fees)
	FeeAmount     string `gorm:"not null" json:"fee_amount"`     // Fee charged
	FeePercentage string `gorm:"not null" json:"fee_percentage"` // e.g. "0.5"

	// Payment details
	PaymentMethod   string `json:"payment_method"`   // "bank_transfer", "mbank_qr", "elsom", "odengi"
	PaymentProvider string `json:"payment_provider"` // "bakai", "mbank", "elsom", "odengi"
	PaymentRef      string `json:"payment_ref"`      // External payment reference

	// Bank details (for withdrawals)
	BankAccountNumber string `json:"bank_account_number,omitempty"`
	BankName          string `json:"bank_name,omitempty"`

	// Blockchain details
	OnChainTxHash string `gorm:"index" json:"on_chain_tx_hash,omitempty"` // Polygon tx hash (mint/burn)
	BlockNumber   uint64 `json:"block_number,omitempty"`

	// Status
	Status        string     `gorm:"index;not null;default:'pending'" json:"status"` // pending, processing, completed, failed, expired
	FailureReason string     `json:"failure_reason,omitempty"`
	CompletedAt   *time.Time `json:"completed_at"`
	ExpiresAt     *time.Time `json:"expires_at"`
}

// Proposal represents a DAO governance proposal
type Proposal struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// On-chain reference
	OnChainProposalID string `gorm:"uniqueIndex" json:"on_chain_proposal_id"` // Governor proposal ID
	ProposerAddress   string `gorm:"index;not null" json:"proposer_address"`

	// Proposal details
	Title        string `gorm:"not null" json:"title"`
	Description  string `gorm:"type:text;not null" json:"description"`
	ProposalType string `gorm:"not null" json:"proposal_type"` // PARAMETER_CHANGE, TREASURY_SPEND, etc.

	// Targets (JSON encoded)
	Targets   string `gorm:"type:text" json:"targets"`
	Values    string `gorm:"type:text" json:"values"`
	Calldatas string `gorm:"type:text" json:"calldatas"`

	// Voting
	VotesFor     string `gorm:"default:0" json:"votes_for"`
	VotesAgainst string `gorm:"default:0" json:"votes_against"`
	VotesAbstain string `gorm:"default:0" json:"votes_abstain"`

	// Status & timing
	Status         string     `gorm:"index;not null;default:'pending'" json:"status"` // pending, active, succeeded, defeated, queued, executed, cancelled
	VotingStartsAt *time.Time `json:"voting_starts_at"`
	VotingEndsAt   *time.Time `json:"voting_ends_at"`
	ExecutedAt     *time.Time `json:"executed_at"`

	// Relationships
	Votes []ProposalVote `gorm:"foreignKey:ProposalID" json:"votes,omitempty"`
}

// ProposalVote represents a vote on a proposal
type ProposalVote struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	CreatedAt time.Time `json:"created_at"`

	ProposalID      uint   `gorm:"index;not null" json:"proposal_id"`
	VoterAddress    string `gorm:"index;not null" json:"voter_address"`
	Support         int    `gorm:"not null" json:"support"`      // 0=Against, 1=For, 2=Abstain
	VotingPower     string `gorm:"not null" json:"voting_power"` // GOV tokens used
	Reason          string `gorm:"type:text" json:"reason,omitempty"`
	TransactionHash string `json:"transaction_hash,omitempty"`

	// Unique constraint: one vote per user per proposal
	// handled by composite index
}

// GOVReward records governance token rewards
type GOVReward struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	CreatedAt time.Time `json:"created_at"`

	WalletAddress   string `gorm:"index;not null" json:"wallet_address"`
	Amount          string `gorm:"not null" json:"amount"` // GOV tokens earned
	Reason          string `gorm:"not null" json:"reason"` // campaign_created, campaign_funded, etc.
	ReferenceID     string `json:"reference_id,omitempty"` // Campaign ID, proposal ID, etc.
	TransactionHash string `json:"transaction_hash,omitempty"`
}
