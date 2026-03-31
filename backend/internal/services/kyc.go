package services

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/the0lord/crowdfunding-platform/backend/internal/models"
	"gorm.io/gorm"
)

// KYCConfig holds configuration for the KYC service
type KYCConfig struct {
	Provider      string // "sumsub" or "demo"
	AppToken      string
	SecretKey     string
	BaseURL       string
	WebhookSecret string
	DemoMode      bool // When true, all KYC levels auto-approve without Sumsub
}

// KYCService handles KYC verification via Sumsub (or demo self-verification)
type KYCService struct {
	db     *gorm.DB
	config KYCConfig
}

// NewKYCService creates a new KYCService
func NewKYCService(db *gorm.DB, appToken, secretKey string, demoMode bool) *KYCService {
	provider := "sumsub"
	if demoMode {
		provider = "demo"
	}
	return &KYCService{
		db: db,
		config: KYCConfig{
			Provider:  provider,
			AppToken:  appToken,
			SecretKey: secretKey,
			BaseURL:   "https://api.sumsub.com",
			DemoMode:  demoMode,
		},
	}
}

// IsDemoMode returns whether KYC is in demo mode
func (s *KYCService) IsDemoMode() bool {
	return s.config.DemoMode
}

// KYCStartRequest is the request to start KYC verification
type KYCStartRequest struct {
	WalletAddress string `json:"wallet_address" binding:"required"`
	Level         int    `json:"level" binding:"required"` // 1, 2, or 3
	Email         string `json:"email"`
	Phone         string `json:"phone"`
	// Demo mode fields (self-verification)
	FullName      string `json:"full_name,omitempty"`
	DocumentType  string `json:"document_type,omitempty"` // "passport", "id_card", "drivers_license"
	DocumentID    string `json:"document_id,omitempty"`
	DateOfBirth   string `json:"date_of_birth,omitempty"`
	Address       string `json:"address,omitempty"`
	SelfieConfirm bool   `json:"selfie_confirm,omitempty"` // User confirms they are who they say
}

// KYCStartResponse contains the verification URL and applicant ID
type KYCStartResponse struct {
	ApplicantID     string `json:"applicant_id"`
	VerificationURL string `json:"verification_url"`
	Level           int    `json:"level"`
	Status          string `json:"status"`
}

// KYCStatusResponse contains the current KYC status for a user
type KYCStatusResponse struct {
	WalletAddress string     `json:"wallet_address"`
	KYCLevel      int        `json:"kyc_level"`
	Status        string     `json:"status"` // "none", "pending", "verified", "rejected"
	VerifiedAt    *time.Time `json:"verified_at"`
	ApplicantID   string     `json:"applicant_id,omitempty"`
}

// KYCWebhookPayload represents the Sumsub webhook payload
type KYCWebhookPayload struct {
	ApplicantID    string `json:"applicantId"`
	ExternalUserID string `json:"externalUserId"` // wallet address
	Type           string `json:"type"`           // "applicantReviewed", "applicantPending", etc.
	ReviewResult   struct {
		ReviewAnswer string   `json:"reviewAnswer"` // "GREEN", "RED"
		RejectLabels []string `json:"rejectLabels,omitempty"`
		Comment      string   `json:"comment,omitempty"`
	} `json:"reviewResult"`
	ReviewStatus string `json:"reviewStatus"` // "completed", "pending"
	CreatedAt    string `json:"createdAt"`
}

// ─────────────────────── Core Operations ──────────────────────────────────

// StartVerification initiates KYC verification for a user
func (s *KYCService) StartVerification(req KYCStartRequest) (*KYCStartResponse, error) {
	if req.Level < 1 || req.Level > 3 {
		return nil, errors.New("invalid KYC level (must be 1-3)")
	}

	// Find user wallet
	var wallet models.UserWallet
	if err := s.db.Where("wallet_address = ?", req.WalletAddress).First(&wallet).Error; err != nil {
		if s.config.DemoMode {
			// Auto-create wallet in demo mode
			wallet = models.UserWallet{
				WalletAddress: req.WalletAddress,
				WalletTier:    models.WalletTierEmbedded,
				WalletType:    "demo",
				KYCLevel:      models.KYCNone,
				MonthlyLimit:  "50000",
				MonthlyVolume: "0",
				IsActive:      true,
				GasSponsored:  true,
				GasSubsidyPct: 100,
			}
			s.db.Create(&wallet)
		} else {
			return nil, errors.New("wallet not registered")
		}
	}

	// Check if already verified at this level or higher
	if int(wallet.KYCLevel) >= req.Level {
		return nil, fmt.Errorf("already verified at level %d", wallet.KYCLevel)
	}

	// Level 1: Basic (email + phone) - auto-approve in both modes
	if req.Level == 1 {
		return s.handleBasicKYC(req, &wallet)
	}

	// Demo mode: self-verification for Level 2 & 3
	if s.config.DemoMode {
		return s.handleDemoKYC(req, &wallet)
	}

	// Production: Level 2 & 3 require Sumsub verification
	return s.initiateSumsubVerification(req, &wallet)
}

// handleDemoKYC handles demo self-verification for Level 2 and 3
func (s *KYCService) handleDemoKYC(req KYCStartRequest, wallet *models.UserWallet) (*KYCStartResponse, error) {
	if req.Level == 2 {
		// Level 2 demo: requires full name + document type + document ID
		if req.FullName == "" {
			return nil, errors.New("full name is required for Level 2 verification")
		}
		if req.DocumentType == "" {
			return nil, errors.New("document type is required (passport, id_card, or drivers_license)")
		}
		if req.DocumentID == "" {
			return nil, errors.New("document ID number is required for Level 2 verification")
		}

		validDocs := map[string]bool{"passport": true, "id_card": true, "drivers_license": true}
		if !validDocs[req.DocumentType] {
			return nil, errors.New("invalid document type (passport, id_card, or drivers_license)")
		}

		now := time.Now()
		wallet.KYCLevel = models.KYCEnhanced
		wallet.KYCProvider = "demo"
		wallet.KYCVerifiedAt = &now
		wallet.KYCHash = s.generateKYCHash(req.WalletAddress, req.FullName, req.DocumentID)
		wallet.KYCApplicantID = fmt.Sprintf("demo_l2_%s_%d", req.WalletAddress[:10], now.Unix())

		// Upgrade tier to 2
		wallet.WalletTier = models.WalletTierMPC
		wallet.MonthlyLimit = "500000"
		wallet.GasSubsidyPct = 50

		if err := s.db.Save(wallet).Error; err != nil {
			return nil, fmt.Errorf("failed to update KYC status: %w", err)
		}

		return &KYCStartResponse{
			ApplicantID:     wallet.KYCApplicantID,
			VerificationURL: "", // No external URL in demo mode
			Level:           2,
			Status:          "verified",
		}, nil
	}

	// Level 3 demo: requires everything from L2 + date of birth + address + selfie confirm
	if req.FullName == "" || req.DocumentID == "" || req.DocumentType == "" {
		return nil, errors.New("full name, document type, and document ID are required for Level 3")
	}
	if req.DateOfBirth == "" {
		return nil, errors.New("date of birth is required for Level 3 verification")
	}
	if req.Address == "" {
		return nil, errors.New("residential address is required for Level 3 verification")
	}
	if !req.SelfieConfirm {
		return nil, errors.New("selfie confirmation is required for Level 3 verification")
	}

	now := time.Now()
	wallet.KYCLevel = models.KYCFull
	wallet.KYCProvider = "demo"
	wallet.KYCVerifiedAt = &now
	wallet.KYCHash = s.generateKYCHash(req.WalletAddress, req.FullName, req.DocumentID, req.DateOfBirth)
	wallet.KYCApplicantID = fmt.Sprintf("demo_l3_%s_%d", req.WalletAddress[:10], now.Unix())

	// Upgrade tier to 3
	wallet.WalletTier = models.WalletTierSelfCustody
	wallet.MonthlyLimit = "unlimited"
	wallet.GasSponsored = false
	wallet.GasSubsidyPct = 0

	if err := s.db.Save(wallet).Error; err != nil {
		return nil, fmt.Errorf("failed to update KYC status: %w", err)
	}

	return &KYCStartResponse{
		ApplicantID:     wallet.KYCApplicantID,
		VerificationURL: "",
		Level:           3,
		Status:          "verified",
	}, nil
}

// handleBasicKYC handles Level 1 verification (email + phone OTP)
func (s *KYCService) handleBasicKYC(req KYCStartRequest, wallet *models.UserWallet) (*KYCStartResponse, error) {
	if req.Email == "" || req.Phone == "" {
		return nil, errors.New("email and phone required for basic KYC")
	}

	// Auto-approve Level 1 (email + phone verification handled by Web3Auth)
	now := time.Now()
	wallet.KYCLevel = models.KYCBasic
	wallet.KYCProvider = "internal"
	wallet.KYCVerifiedAt = &now
	wallet.KYCHash = s.generateKYCHash(req.WalletAddress, req.Email, req.Phone)

	if err := s.db.Save(wallet).Error; err != nil {
		return nil, fmt.Errorf("failed to update KYC status: %w", err)
	}

	return &KYCStartResponse{
		ApplicantID:     "",
		VerificationURL: "",
		Level:           1,
		Status:          "verified",
	}, nil
}

// initiateSumsubVerification starts Sumsub ID verification flow
func (s *KYCService) initiateSumsubVerification(req KYCStartRequest, wallet *models.UserWallet) (*KYCStartResponse, error) {
	// Determine level name for Sumsub
	levelName := "basic-kyc-level"
	if req.Level == 3 {
		levelName = "full-kyc-level"
	}

	// In production, this would call Sumsub API:
	// POST https://api.sumsub.com/resources/applicants
	// with externalUserId = wallet address
	// Then generate an SDK token for the frontend widget

	// For now, generate a mock applicant ID and verification URL
	applicantID := fmt.Sprintf("sumsub_%s_%d", req.WalletAddress[:10], time.Now().Unix())

	// Update wallet with pending status
	wallet.KYCApplicantID = applicantID
	wallet.KYCProvider = "sumsub"
	if err := s.db.Save(wallet).Error; err != nil {
		return nil, fmt.Errorf("failed to update wallet: %w", err)
	}

	// In production: call Sumsub API to create applicant and get SDK token
	verificationURL := fmt.Sprintf(
		"https://cockpit.sumsub.com/checkus#/%s&level=%s",
		applicantID,
		levelName,
	)

	return &KYCStartResponse{
		ApplicantID:     applicantID,
		VerificationURL: verificationURL,
		Level:           req.Level,
		Status:          "pending",
	}, nil
}

// HandleWebhook processes Sumsub webhook callbacks
func (s *KYCService) HandleWebhook(payload KYCWebhookPayload) error {
	// Find wallet by applicant ID
	var wallet models.UserWallet
	if err := s.db.Where("kyc_applicant_id = ?", payload.ApplicantID).First(&wallet).Error; err != nil {
		// Try by external user ID (wallet address)
		if err := s.db.Where("wallet_address = ?", payload.ExternalUserID).First(&wallet).Error; err != nil {
			return fmt.Errorf("wallet not found for applicant %s", payload.ApplicantID)
		}
	}

	switch payload.Type {
	case "applicantReviewed":
		if payload.ReviewResult.ReviewAnswer == "GREEN" {
			// Approved - upgrade KYC level
			now := time.Now()
			newLevel := models.KYCEnhanced // Level 2

			// Check if this was a Level 3 verification
			if wallet.KYCLevel == models.KYCEnhanced {
				newLevel = models.KYCFull // Level 3
			}

			wallet.KYCLevel = newLevel
			wallet.KYCVerifiedAt = &now
			wallet.KYCHash = s.generateKYCHash(wallet.WalletAddress, payload.ApplicantID, payload.ReviewStatus)

			if err := s.db.Save(&wallet).Error; err != nil {
				return fmt.Errorf("failed to update KYC status: %w", err)
			}
		} else {
			// Rejected - leave current level unchanged
			// Log the rejection for admin review
			fmt.Printf("KYC rejected for %s: %v - %s\n",
				wallet.WalletAddress,
				payload.ReviewResult.RejectLabels,
				payload.ReviewResult.Comment,
			)
		}

	case "applicantPending":
		// Verification in progress - no action needed
		fmt.Printf("KYC pending for %s\n", wallet.WalletAddress)

	default:
		fmt.Printf("Unknown webhook type: %s\n", payload.Type)
	}

	return nil
}

// GetStatus returns the current KYC status for a wallet
func (s *KYCService) GetStatus(walletAddress string) (*KYCStatusResponse, error) {
	var wallet models.UserWallet
	if err := s.db.Where("wallet_address = ?", walletAddress).First(&wallet).Error; err != nil {
		return nil, errors.New("wallet not registered")
	}

	status := "none"
	if wallet.KYCLevel >= 1 {
		status = "verified"
	} else if wallet.KYCApplicantID != "" {
		status = "pending"
	}

	return &KYCStatusResponse{
		WalletAddress: wallet.WalletAddress,
		KYCLevel:      int(wallet.KYCLevel),
		Status:        status,
		VerifiedAt:    wallet.KYCVerifiedAt,
		ApplicantID:   wallet.KYCApplicantID,
	}, nil
}

// ValidateWebhookSignature verifies Sumsub webhook signature
func (s *KYCService) ValidateWebhookSignature(body []byte, signature string) bool {
	if s.config.WebhookSecret == "" {
		return true // Skip validation in dev
	}
	mac := hmac.New(sha256.New, []byte(s.config.WebhookSecret))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}

// ─────────────────────── Internal Helpers ──────────────────────────────────

func (s *KYCService) generateKYCHash(parts ...string) string {
	h := sha256.New()
	for _, p := range parts {
		h.Write([]byte(p))
	}
	return hex.EncodeToString(h.Sum(nil))
}
