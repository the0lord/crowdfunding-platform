package services

import (
	"errors"
	"fmt"
	"time"

	"github.com/the0lord/crowdfunding-platform/backend/internal/models"
	"gorm.io/gorm"
)

// WalletService handles user wallet management and tier operations
type WalletService struct {
	db *gorm.DB
}

// NewWalletService creates a new WalletService
func NewWalletService(db *gorm.DB) *WalletService {
	return &WalletService{db: db}
}

// RegisterWalletRequest is the request to register a new wallet
type RegisterWalletRequest struct {
	WalletAddress string `json:"wallet_address" binding:"required"`
	WalletType    string `json:"wallet_type" binding:"required"` // "web3auth", "web3auth_mpc", "metamask", "ledger"
	Web3AuthID    string `json:"web3auth_id,omitempty"`
	Email         string `json:"email,omitempty"`
}

// RegisterWalletResponse contains the registered wallet details
type RegisterWalletResponse struct {
	WalletAddress string `json:"wallet_address"`
	WalletTier    int    `json:"wallet_tier"`
	WalletType    string `json:"wallet_type"`
	MonthlyLimit  string `json:"monthly_limit"`
	GasSponsored  bool   `json:"gas_sponsored"`
	KYCLevel      int    `json:"kyc_level"`
}

// WalletInfoResponse contains full wallet information
type WalletInfoResponse struct {
	WalletAddress   string     `json:"wallet_address"`
	WalletTier      int        `json:"wallet_tier"`
	WalletType      string     `json:"wallet_type"`
	KYCLevel        int        `json:"kyc_level"`
	MonthlyLimit    string     `json:"monthly_limit"`
	MonthlyVolume   string     `json:"monthly_volume"`
	RemainingVolume string     `json:"remaining_volume"`
	GasSponsored    bool       `json:"gas_sponsored"`
	GasSubsidyPct   int        `json:"gas_subsidy_pct"`
	IsActive        bool       `json:"is_active"`
	IsFrozen        bool       `json:"is_frozen"`
	KYCVerifiedAt   *time.Time `json:"kyc_verified_at"`
	CreatedAt       time.Time  `json:"created_at"`
}

// UpgradeTierRequest is the request to upgrade wallet tier
type UpgradeTierRequest struct {
	WalletAddress string `json:"wallet_address" binding:"required"`
	NewTier       int    `json:"new_tier" binding:"required"`
}

// ─────────────────────── Core Operations ──────────────────────────────────

// RegisterWallet registers a new wallet with appropriate tier settings
func (s *WalletService) RegisterWallet(userID uint, req RegisterWalletRequest) (*RegisterWalletResponse, error) {
	// Check if already registered
	var existing models.UserWallet
	if err := s.db.Where("wallet_address = ?", req.WalletAddress).First(&existing).Error; err == nil {
		return nil, errors.New("wallet already registered")
	}

	// Determine tier from wallet type
	tier := s.determineTier(req.WalletType)
	limit := s.getTierLimit(tier)
	gasSponsored, gasSubsidy := s.getGasSettings(tier)

	wallet := models.UserWallet{
		UserID:        userID,
		WalletAddress: req.WalletAddress,
		WalletTier:    models.WalletTier(tier),
		WalletType:    req.WalletType,
		Web3AuthID:    req.Web3AuthID,
		KYCLevel:      models.KYCNone,
		MonthlyLimit:  limit,
		MonthlyVolume: "0",
		IsActive:      true,
		IsFrozen:      false,
		GasSponsored:  gasSponsored,
		GasSubsidyPct: gasSubsidy,
	}

	if err := s.db.Create(&wallet).Error; err != nil {
		return nil, fmt.Errorf("failed to register wallet: %w", err)
	}

	return &RegisterWalletResponse{
		WalletAddress: wallet.WalletAddress,
		WalletTier:    tier,
		WalletType:    req.WalletType,
		MonthlyLimit:  limit,
		GasSponsored:  gasSponsored,
		KYCLevel:      0,
	}, nil
}

// GetWalletInfo returns full wallet information
func (s *WalletService) GetWalletInfo(walletAddress string) (*WalletInfoResponse, error) {
	var wallet models.UserWallet
	if err := s.db.Where("wallet_address = ?", walletAddress).First(&wallet).Error; err != nil {
		return nil, errors.New("wallet not found")
	}

	return &WalletInfoResponse{
		WalletAddress:   wallet.WalletAddress,
		WalletTier:      int(wallet.WalletTier),
		WalletType:      wallet.WalletType,
		KYCLevel:        int(wallet.KYCLevel),
		MonthlyLimit:    wallet.MonthlyLimit,
		MonthlyVolume:   wallet.MonthlyVolume,
		RemainingVolume: s.calculateRemaining(wallet.MonthlyLimit, wallet.MonthlyVolume),
		GasSponsored:    wallet.GasSponsored,
		GasSubsidyPct:   wallet.GasSubsidyPct,
		IsActive:        wallet.IsActive,
		IsFrozen:        wallet.IsFrozen,
		KYCVerifiedAt:   wallet.KYCVerifiedAt,
		CreatedAt:       wallet.CreatedAt,
	}, nil
}

// UpgradeTier upgrades a wallet to a higher tier
func (s *WalletService) UpgradeTier(req UpgradeTierRequest) error {
	var wallet models.UserWallet
	if err := s.db.Where("wallet_address = ?", req.WalletAddress).First(&wallet).Error; err != nil {
		return errors.New("wallet not found")
	}

	if !wallet.IsActive {
		return errors.New("wallet is not active")
	}

	currentTier := int(wallet.WalletTier)
	if req.NewTier <= currentTier {
		return fmt.Errorf("new tier (%d) must be higher than current tier (%d)", req.NewTier, currentTier)
	}
	if req.NewTier > 3 {
		return errors.New("maximum tier is 3")
	}

	// Check KYC requirements for tier upgrade
	requiredKYC := s.requiredKYCForTier(req.NewTier)
	if int(wallet.KYCLevel) < requiredKYC {
		return fmt.Errorf("KYC level %d required for tier %d (current: %d)", requiredKYC, req.NewTier, wallet.KYCLevel)
	}

	// Update tier
	gasSponsored, gasSubsidy := s.getGasSettings(req.NewTier)
	wallet.WalletTier = models.WalletTier(req.NewTier)
	wallet.MonthlyLimit = s.getTierLimit(req.NewTier)
	wallet.GasSponsored = gasSponsored
	wallet.GasSubsidyPct = gasSubsidy

	if err := s.db.Save(&wallet).Error; err != nil {
		return fmt.Errorf("failed to upgrade tier: %w", err)
	}

	return nil
}

// FreezeWallet freezes a wallet (compliance action)
func (s *WalletService) FreezeWallet(walletAddress string) error {
	return s.db.Model(&models.UserWallet{}).
		Where("wallet_address = ?", walletAddress).
		Update("is_frozen", true).Error
}

// UnfreezeWallet unfreezes a wallet
func (s *WalletService) UnfreezeWallet(walletAddress string) error {
	return s.db.Model(&models.UserWallet{}).
		Where("wallet_address = ?", walletAddress).
		Update("is_frozen", false).Error
}

// GetAllWallets returns paginated wallet list (admin)
func (s *WalletService) GetAllWallets(page, pageSize int) ([]models.UserWallet, int64, error) {
	var wallets []models.UserWallet
	var total int64

	s.db.Model(&models.UserWallet{}).Count(&total)

	offset := (page - 1) * pageSize
	if err := s.db.Offset(offset).Limit(pageSize).Order("created_at DESC").Find(&wallets).Error; err != nil {
		return nil, 0, err
	}

	return wallets, total, nil
}

// ResetMonthlyVolumes resets all wallets' monthly volume (called by cron job)
func (s *WalletService) ResetMonthlyVolumes() (int64, error) {
	now := time.Now()
	result := s.db.Model(&models.UserWallet{}).
		Where("is_active = ?", true).
		Updates(map[string]interface{}{
			"monthly_volume":  "0",
			"volume_reset_at": now,
		})
	return result.RowsAffected, result.Error
}

// ─────────────────────── Internal Helpers ──────────────────────────────────

func (s *WalletService) determineTier(walletType string) int {
	switch walletType {
	case "web3auth":
		return 1
	case "web3auth_mpc":
		return 2
	case "metamask", "ledger", "walletconnect":
		return 3
	default:
		return 1
	}
}

func (s *WalletService) getTierLimit(tier int) string {
	switch tier {
	case 1:
		return "50000" // 50K KGST
	case 2:
		return "500000" // 500K KGST
	case 3:
		return "unlimited"
	default:
		return "50000"
	}
}

func (s *WalletService) getGasSettings(tier int) (sponsored bool, subsidyPct int) {
	switch tier {
	case 1:
		return true, 100 // Fully sponsored
	case 2:
		return true, 50 // 50% subsidy
	case 3:
		return false, 0 // User pays
	default:
		return true, 100
	}
}

func (s *WalletService) requiredKYCForTier(tier int) int {
	switch tier {
	case 1:
		return 1 // Basic
	case 2:
		return 2 // Enhanced
	case 3:
		return 3 // Full
	default:
		return 1
	}
}

func (s *WalletService) calculateRemaining(limit, volume string) string {
	if limit == "unlimited" {
		return "unlimited"
	}
	// Simple string-based calculation for display
	var l, v float64
	fmt.Sscanf(limit, "%f", &l)
	fmt.Sscanf(volume, "%f", &v)
	remaining := l - v
	if remaining < 0 {
		remaining = 0
	}
	return fmt.Sprintf("%.2f", remaining)
}
