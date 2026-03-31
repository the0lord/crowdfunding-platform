package services

import (
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/google/uuid"
	"github.com/the0lord/crowdfunding-platform/backend/internal/models"
	"gorm.io/gorm"
)

// BridgeConfig holds configuration for the bridge service
type BridgeConfig struct {
	DepositFeePercent  float64 // 0.5% default
	WithdrawFeePercent float64 // 1.0% default
	MinDepositKGS      float64 // 100 KGS
	MaxDepositKGS      float64 // 1_000_000 KGS
	MinWithdrawKGS     float64 // 100 KGS
	MaxWithdrawKGS     float64 // 1_000_000 KGS
	TxExpirationMins   int     // 30 minutes
	DemoMode           bool    // When true, skips real bank integration; auto-confirms transactions
}

// BridgeService handles KGS <-> KGST bridge operations
type BridgeService struct {
	db     *gorm.DB
	config BridgeConfig
}

// NewBridgeService creates a new BridgeService
func NewBridgeService(db *gorm.DB, demoMode bool) *BridgeService {
	return &BridgeService{
		db: db,
		config: BridgeConfig{
			DepositFeePercent:  0.3,
			WithdrawFeePercent: 0.5,
			MinDepositKGS:      100,
			MaxDepositKGS:      1_000_000,
			MinWithdrawKGS:     100,
			MaxWithdrawKGS:     1_000_000,
			TxExpirationMins:   30,
			DemoMode:           demoMode,
		},
	}
}

// IsDemoMode returns whether the bridge is in demo mode
func (s *BridgeService) IsDemoMode() bool {
	return s.config.DemoMode
}

// DepositRequest represents a request to deposit KGS and receive KGST
type DepositRequest struct {
	WalletAddress string  `json:"wallet_address" binding:"required"`
	FiatAmount    float64 `json:"fiat_amount" binding:"required,gt=0"`
	PaymentMethod string  `json:"payment_method" binding:"required"` // "bank_transfer", "mbank_qr", "elsom", "odengi"
}

// DepositResponse contains payment details for the user
type DepositResponse struct {
	TxID           string         `json:"tx_id"`
	FiatAmount     string         `json:"fiat_amount"`
	TokenAmount    string         `json:"token_amount"`
	FeeAmount      string         `json:"fee_amount"`
	PaymentMethod  string         `json:"payment_method"`
	PaymentDetails PaymentDetails `json:"payment_details"`
	ExpiresAt      time.Time      `json:"expires_at"`
	Status         string         `json:"status"`
}

// PaymentDetails contains provider-specific payment info
type PaymentDetails struct {
	// Bank transfer
	BankName      string `json:"bank_name,omitempty"`
	AccountNumber string `json:"account_number,omitempty"`
	Reference     string `json:"reference,omitempty"`
	// QR payment
	QRCodeURL string `json:"qr_code_url,omitempty"`
	QRData    string `json:"qr_data,omitempty"`
}

// WithdrawRequest represents a request to burn KGST and receive KGS
type WithdrawRequest struct {
	WalletAddress     string  `json:"wallet_address" binding:"required"`
	TokenAmount       float64 `json:"token_amount" binding:"required,gt=0"`
	BankAccountNumber string  `json:"bank_account_number" binding:"required"`
	BankName          string  `json:"bank_name" binding:"required"`
}

// WithdrawResponse contains withdrawal confirmation details
type WithdrawResponse struct {
	TxID              string `json:"tx_id"`
	TokenAmount       string `json:"token_amount"`
	FiatAmount        string `json:"fiat_amount"`
	FeeAmount         string `json:"fee_amount"`
	BankAccountNumber string `json:"bank_account_number"`
	BankName          string `json:"bank_name"`
	EstimatedArrival  string `json:"estimated_arrival"`
	Status            string `json:"status"`
}

// RatesResponse contains current exchange rates and fees
type RatesResponse struct {
	Rate               string  `json:"rate"` // Always "1.0" for stablecoin
	DepositFeePercent  float64 `json:"deposit_fee_percent"`
	WithdrawFeePercent float64 `json:"withdraw_fee_percent"`
	MinDeposit         float64 `json:"min_deposit"`
	MaxDeposit         float64 `json:"max_deposit"`
	MinWithdraw        float64 `json:"min_withdraw"`
	MaxWithdraw        float64 `json:"max_withdraw"`
}

// ─────────────────────── Core Operations ──────────────────────────────────

// RequestDeposit creates a new deposit request (KGS → KGST)
func (s *BridgeService) RequestDeposit(req DepositRequest) (*DepositResponse, error) {
	// Validate amounts
	if req.FiatAmount < s.config.MinDepositKGS {
		return nil, fmt.Errorf("minimum deposit is %.0f KGS", s.config.MinDepositKGS)
	}
	if req.FiatAmount > s.config.MaxDepositKGS {
		return nil, fmt.Errorf("maximum deposit is %.0f KGS", s.config.MaxDepositKGS)
	}

	// Validate payment method
	validMethods := map[string]bool{
		"bank_transfer": true, "mbank_qr": true, "elsom": true, "odengi": true,
	}
	if !validMethods[req.PaymentMethod] {
		return nil, errors.New("invalid payment method")
	}

	// In demo mode, auto-create wallet if it doesn't exist; skip KYC check
	if s.config.DemoMode {
		var wallet models.UserWallet
		if err := s.db.Where("wallet_address = ?", req.WalletAddress).First(&wallet).Error; err != nil {
			// Auto-create a demo wallet
			wallet = models.UserWallet{
				WalletAddress: req.WalletAddress,
				WalletTier:    models.WalletTierEmbedded,
				WalletType:    "demo",
				KYCLevel:      models.KYCBasic,
				MonthlyLimit:  "50000",
				MonthlyVolume: "0",
				IsActive:      true,
				GasSponsored:  true,
				GasSubsidyPct: 100,
			}
			s.db.Create(&wallet)
		}
	} else {
		// Production: Check user wallet exists and KYC
		var wallet models.UserWallet
		if err := s.db.Where("wallet_address = ? AND is_active = ?", req.WalletAddress, true).First(&wallet).Error; err != nil {
			return nil, errors.New("wallet not found or inactive")
		}
		if wallet.KYCLevel < 1 {
			return nil, errors.New("KYC verification required before deposit")
		}
	}

	// Calculate fees
	feeAmount := req.FiatAmount * s.config.DepositFeePercent / 100
	tokenAmount := req.FiatAmount - feeAmount

	// Create transaction
	txID := uuid.New().String()
	expiresAt := time.Now().Add(time.Duration(s.config.TxExpirationMins) * time.Minute)

	tx := models.BridgeTransaction{
		TxID:            txID,
		WalletAddress:   req.WalletAddress,
		Direction:       "deposit",
		FiatAmount:      fmt.Sprintf("%.2f", req.FiatAmount),
		TokenAmount:     fmt.Sprintf("%.2f", tokenAmount),
		FeeAmount:       fmt.Sprintf("%.2f", feeAmount),
		FeePercentage:   fmt.Sprintf("%.1f", s.config.DepositFeePercent),
		PaymentMethod:   req.PaymentMethod,
		PaymentProvider: s.getProvider(req.PaymentMethod),
		Status:          "pending",
		ExpiresAt:       &expiresAt,
	}

	if err := s.db.Create(&tx).Error; err != nil {
		return nil, fmt.Errorf("failed to create deposit transaction: %w", err)
	}

	// Generate payment details based on method
	paymentDetails := s.generatePaymentDetails(req.PaymentMethod, txID, req.FiatAmount)

	return &DepositResponse{
		TxID:           txID,
		FiatAmount:     tx.FiatAmount,
		TokenAmount:    tx.TokenAmount,
		FeeAmount:      tx.FeeAmount,
		PaymentMethod:  req.PaymentMethod,
		PaymentDetails: paymentDetails,
		ExpiresAt:      expiresAt,
		Status:         "pending",
	}, nil
}

// RequestWithdraw creates a new withdrawal request (KGST → KGS)
func (s *BridgeService) RequestWithdraw(req WithdrawRequest) (*WithdrawResponse, error) {
	// Validate amounts
	if req.TokenAmount < s.config.MinWithdrawKGS {
		return nil, fmt.Errorf("minimum withdrawal is %.0f KGST", s.config.MinWithdrawKGS)
	}
	if req.TokenAmount > s.config.MaxWithdrawKGS {
		return nil, fmt.Errorf("maximum withdrawal is %.0f KGST", s.config.MaxWithdrawKGS)
	}

	if !s.config.DemoMode {
		// Production: Check wallet exists and KYC
		var wallet models.UserWallet
		if err := s.db.Where("wallet_address = ? AND is_active = ?", req.WalletAddress, true).First(&wallet).Error; err != nil {
			return nil, errors.New("wallet not found or inactive")
		}
		if wallet.KYCLevel < 1 {
			return nil, errors.New("KYC verification required before withdrawal")
		}
	}

	// Calculate fees
	feeAmount := req.TokenAmount * s.config.WithdrawFeePercent / 100
	fiatAmount := req.TokenAmount - feeAmount

	// Create transaction
	txID := uuid.New().String()

	tx := models.BridgeTransaction{
		TxID:              txID,
		WalletAddress:     req.WalletAddress,
		Direction:         "withdraw",
		FiatAmount:        fmt.Sprintf("%.2f", fiatAmount),
		TokenAmount:       fmt.Sprintf("%.2f", req.TokenAmount),
		FeeAmount:         fmt.Sprintf("%.2f", feeAmount),
		FeePercentage:     fmt.Sprintf("%.1f", s.config.WithdrawFeePercent),
		PaymentMethod:     "bank_transfer",
		PaymentProvider:   "bakai",
		BankAccountNumber: req.BankAccountNumber,
		BankName:          req.BankName,
		Status:            "pending",
	}

	if err := s.db.Create(&tx).Error; err != nil {
		return nil, fmt.Errorf("failed to create withdrawal transaction: %w", err)
	}

	estimatedArrival := "1-24 hours"
	if s.config.DemoMode {
		estimatedArrival = "Instant (Demo)"
	}

	return &WithdrawResponse{
		TxID:              txID,
		TokenAmount:       tx.TokenAmount,
		FiatAmount:        tx.FiatAmount,
		FeeAmount:         tx.FeeAmount,
		BankAccountNumber: req.BankAccountNumber,
		BankName:          req.BankName,
		EstimatedArrival:  estimatedArrival,
		Status:            "pending",
	}, nil
}

// DemoConfirmDeposit instantly confirms a deposit in demo mode (simulates bank payment received)
func (s *BridgeService) DemoConfirmDeposit(txID string) (*models.BridgeTransaction, error) {
	if !s.config.DemoMode {
		return nil, errors.New("demo mode is not enabled")
	}

	var tx models.BridgeTransaction
	if err := s.db.Where("tx_id = ? AND direction = ?", txID, "deposit").First(&tx).Error; err != nil {
		return nil, errors.New("deposit transaction not found")
	}

	if tx.Status == "completed" {
		return &tx, nil // Already confirmed
	}

	now := time.Now()
	tx.Status = "completed"
	tx.PaymentRef = fmt.Sprintf("DEMO-%s", txID[:8])
	tx.OnChainTxHash = fmt.Sprintf("0xdemo_%s_%d", txID[:16], now.Unix())
	tx.CompletedAt = &now
	s.db.Save(&tx)

	return &tx, nil
}

// DemoConfirmWithdraw instantly confirms a withdrawal in demo mode
func (s *BridgeService) DemoConfirmWithdraw(txID string) (*models.BridgeTransaction, error) {
	if !s.config.DemoMode {
		return nil, errors.New("demo mode is not enabled")
	}

	var tx models.BridgeTransaction
	if err := s.db.Where("tx_id = ? AND direction = ?", txID, "withdraw").First(&tx).Error; err != nil {
		return nil, errors.New("withdrawal transaction not found")
	}

	if tx.Status == "completed" {
		return &tx, nil
	}

	now := time.Now()
	tx.Status = "completed"
	tx.OnChainTxHash = fmt.Sprintf("0xdemo_%s_%d", txID[:16], now.Unix())
	tx.CompletedAt = &now
	s.db.Save(&tx)

	return &tx, nil
}

// DemoGetBalance returns simulated KGST balance for a wallet in demo mode
func (s *BridgeService) DemoGetBalance(walletAddress string) (map[string]interface{}, error) {
	if !s.config.DemoMode {
		return nil, errors.New("demo mode is not enabled")
	}

	// Sum all completed deposits minus completed withdrawals
	var depositTotal, withdrawTotal float64
	var result struct{ Total float64 }

	s.db.Model(&models.BridgeTransaction{}).
		Select("COALESCE(SUM(CAST(token_amount AS DECIMAL)), 0) as total").
		Where("wallet_address = ? AND direction = ? AND status = ?", walletAddress, "deposit", "completed").
		Scan(&result)
	depositTotal = result.Total

	s.db.Model(&models.BridgeTransaction{}).
		Select("COALESCE(SUM(CAST(token_amount AS DECIMAL)), 0) as total").
		Where("wallet_address = ? AND direction = ? AND status = ?", walletAddress, "withdraw", "completed").
		Scan(&result)
	withdrawTotal = result.Total

	balance := depositTotal - withdrawTotal
	if balance < 0 {
		balance = 0
	}

	return map[string]interface{}{
		"wallet_address": walletAddress,
		"kgst_balance":   fmt.Sprintf("%.2f", balance),
		"kgs_equivalent": fmt.Sprintf("%.2f", balance), // 1:1 peg
		"demo_mode":      true,
	}, nil
}

// ConfirmDeposit is called by the payment webhook when KGS payment is confirmed
func (s *BridgeService) ConfirmDeposit(txID string, paymentRef string) error {
	var tx models.BridgeTransaction
	if err := s.db.Where("tx_id = ? AND direction = ? AND status = ?", txID, "deposit", "pending").First(&tx).Error; err != nil {
		return errors.New("deposit transaction not found or already processed")
	}

	// Check not expired
	if tx.ExpiresAt != nil && time.Now().After(*tx.ExpiresAt) {
		tx.Status = "expired"
		s.db.Save(&tx)
		return errors.New("deposit transaction has expired")
	}

	now := time.Now()
	tx.Status = "processing"
	tx.PaymentRef = paymentRef
	s.db.Save(&tx)

	// In production, this triggers on-chain minting via the bridge wallet
	// For now, mark as completed (mint would be handled by blockchain client)
	tx.Status = "completed"
	tx.CompletedAt = &now
	s.db.Save(&tx)

	return nil
}

// CompleteWithdraw marks a withdrawal as completed after bank transfer is sent
func (s *BridgeService) CompleteWithdraw(txID string, onChainTxHash string) error {
	var tx models.BridgeTransaction
	if err := s.db.Where("tx_id = ? AND direction = ? AND status = ?", txID, "withdraw", "pending").First(&tx).Error; err != nil {
		return errors.New("withdrawal transaction not found or already processed")
	}

	now := time.Now()
	tx.Status = "completed"
	tx.OnChainTxHash = onChainTxHash
	tx.CompletedAt = &now
	s.db.Save(&tx)

	return nil
}

// GetTransactionStatus returns the current status of a bridge transaction
func (s *BridgeService) GetTransactionStatus(txID string) (*models.BridgeTransaction, error) {
	var tx models.BridgeTransaction
	if err := s.db.Where("tx_id = ?", txID).First(&tx).Error; err != nil {
		return nil, errors.New("transaction not found")
	}
	return &tx, nil
}

// GetUserTransactions returns all bridge transactions for a wallet
func (s *BridgeService) GetUserTransactions(walletAddress string, page, pageSize int) ([]models.BridgeTransaction, int64, error) {
	var txs []models.BridgeTransaction
	var total int64

	query := s.db.Model(&models.BridgeTransaction{}).Where("wallet_address = ?", walletAddress)
	query.Count(&total)

	offset := (page - 1) * pageSize
	if err := query.Offset(offset).Limit(pageSize).Order("created_at DESC").Find(&txs).Error; err != nil {
		return nil, 0, err
	}

	return txs, total, nil
}

// GetRates returns current exchange rates and limits
func (s *BridgeService) GetRates() *RatesResponse {
	return &RatesResponse{
		Rate:               "1.0",
		DepositFeePercent:  s.config.DepositFeePercent,
		WithdrawFeePercent: s.config.WithdrawFeePercent,
		MinDeposit:         s.config.MinDepositKGS,
		MaxDeposit:         s.config.MaxDepositKGS,
		MinWithdraw:        s.config.MinWithdrawKGS,
		MaxWithdraw:        s.config.MaxWithdrawKGS,
	}
}

// ExpireOldTransactions marks expired pending transactions
func (s *BridgeService) ExpireOldTransactions() (int64, error) {
	result := s.db.Model(&models.BridgeTransaction{}).
		Where("status = ? AND expires_at < ?", "pending", time.Now()).
		Update("status", "expired")
	return result.RowsAffected, result.Error
}

// GetBridgeStats returns aggregate bridge statistics
func (s *BridgeService) GetBridgeStats() (map[string]interface{}, error) {
	var totalDeposits, totalWithdrawals int64
	var depositVolume, withdrawVolume float64

	s.db.Model(&models.BridgeTransaction{}).Where("direction = ? AND status = ?", "deposit", "completed").Count(&totalDeposits)
	s.db.Model(&models.BridgeTransaction{}).Where("direction = ? AND status = ?", "withdraw", "completed").Count(&totalWithdrawals)

	// Sum volumes
	var result struct{ Total float64 }
	s.db.Model(&models.BridgeTransaction{}).
		Select("COALESCE(SUM(CAST(fiat_amount AS DECIMAL)), 0) as total").
		Where("direction = ? AND status = ?", "deposit", "completed").
		Scan(&result)
	depositVolume = result.Total

	s.db.Model(&models.BridgeTransaction{}).
		Select("COALESCE(SUM(CAST(fiat_amount AS DECIMAL)), 0) as total").
		Where("direction = ? AND status = ?", "withdraw", "completed").
		Scan(&result)
	withdrawVolume = result.Total

	return map[string]interface{}{
		"total_deposits":    totalDeposits,
		"total_withdrawals": totalWithdrawals,
		"deposit_volume":    depositVolume,
		"withdraw_volume":   withdrawVolume,
		"net_supply":        depositVolume - withdrawVolume,
	}, nil
}

// ─────────────────────── Internal Helpers ──────────────────────────────────

func (s *BridgeService) getProvider(method string) string {
	switch method {
	case "bank_transfer":
		return "bakai"
	case "mbank_qr":
		return "mbank"
	case "elsom":
		return "elsom"
	case "odengi":
		return "odengi"
	default:
		return "unknown"
	}
}

func (s *BridgeService) generatePaymentDetails(method, txID string, amount float64) PaymentDetails {
	switch method {
	case "bank_transfer":
		return PaymentDetails{
			BankName:      "Bakai Bank",
			AccountNumber: "1280100123456789", // Platform's bank account
			Reference:     fmt.Sprintf("KGST-%s", txID[:8]),
		}
	case "mbank_qr":
		return PaymentDetails{
			QRCodeURL: fmt.Sprintf("/api/v1/bridge/qr/%s", txID),
			QRData:    fmt.Sprintf("mbank://pay?to=kgst&amount=%.2f&ref=%s", amount, txID[:8]),
		}
	case "elsom":
		return PaymentDetails{
			QRCodeURL: fmt.Sprintf("/api/v1/bridge/qr/%s", txID),
			QRData:    fmt.Sprintf("elsom://pay?to=kgst&amount=%.2f&ref=%s", amount, txID[:8]),
		}
	case "odengi":
		return PaymentDetails{
			QRCodeURL: fmt.Sprintf("/api/v1/bridge/qr/%s", txID),
			QRData:    fmt.Sprintf("odengi://pay?to=kgst&amount=%.2f&ref=%s", amount, txID[:8]),
		}
	default:
		return PaymentDetails{}
	}
}

// ConvertToWei converts a floating point KGST amount to wei (18 decimals)
func ConvertToWei(amount float64) *big.Int {
	// Convert to string first to avoid floating point issues
	amountStr := fmt.Sprintf("%.18f", amount)
	wei := new(big.Float)
	wei.SetString(amountStr)
	multiplier := new(big.Float).SetFloat64(1e18)
	wei.Mul(wei, multiplier)

	result := new(big.Int)
	wei.Int(result)
	return result
}
