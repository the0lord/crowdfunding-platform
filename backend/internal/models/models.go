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
