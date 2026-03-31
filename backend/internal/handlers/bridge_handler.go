package handlers

import (
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/the0lord/crowdfunding-platform/backend/internal/services"
)

// BridgeHandler handles bridge API endpoints
type BridgeHandler struct {
	bridgeService *services.BridgeService
}

// NewBridgeHandler creates a new BridgeHandler
func NewBridgeHandler(bridgeService *services.BridgeService) *BridgeHandler {
	return &BridgeHandler{bridgeService: bridgeService}
}

// RequestDeposit handles POST /api/v1/bridge/deposit/request
func (h *BridgeHandler) RequestDeposit() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req services.DepositRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		resp, err := h.bridgeService.RequestDeposit(req)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"deposit": resp,
		})
	}
}

// GetDepositStatus handles GET /api/v1/bridge/deposit/:id/status
func (h *BridgeHandler) GetDepositStatus() gin.HandlerFunc {
	return func(c *gin.Context) {
		txID := c.Param("id")
		tx, err := h.bridgeService.GetTransactionStatus(txID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"transaction": tx})
	}
}

// DepositWebhook handles POST /api/v1/bridge/deposit/webhook
func (h *BridgeHandler) DepositWebhook() gin.HandlerFunc {
	return func(c *gin.Context) {
		var payload struct {
			TxID       string `json:"tx_id" binding:"required"`
			PaymentRef string `json:"payment_ref" binding:"required"`
			Status     string `json:"status" binding:"required"`
		}
		if err := c.ShouldBindJSON(&payload); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if payload.Status == "confirmed" {
			if err := h.bridgeService.ConfirmDeposit(payload.TxID, payload.PaymentRef); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
		}

		c.JSON(http.StatusOK, gin.H{"status": "processed"})
	}
}

// RequestWithdraw handles POST /api/v1/bridge/withdraw/request
func (h *BridgeHandler) RequestWithdraw() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req services.WithdrawRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		resp, err := h.bridgeService.RequestWithdraw(req)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"withdrawal": resp,
		})
	}
}

// GetWithdrawStatus handles GET /api/v1/bridge/withdraw/:id/status
func (h *BridgeHandler) GetWithdrawStatus() gin.HandlerFunc {
	return func(c *gin.Context) {
		txID := c.Param("id")
		tx, err := h.bridgeService.GetTransactionStatus(txID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"transaction": tx})
	}
}

// GetRates handles GET /api/v1/bridge/rates
func (h *BridgeHandler) GetRates() gin.HandlerFunc {
	return func(c *gin.Context) {
		rates := h.bridgeService.GetRates()
		c.JSON(http.StatusOK, gin.H{"rates": rates})
	}
}

// GetUserTransactions handles GET /api/v1/bridge/transactions
func (h *BridgeHandler) GetUserTransactions() gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet := c.Query("wallet")
		if wallet == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "wallet address required"})
			return
		}

		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))

		txs, total, err := h.bridgeService.GetUserTransactions(wallet, page, pageSize)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"transactions": txs,
			"total":        total,
			"page":         page,
			"page_size":    pageSize,
		})
	}
}

// GetBridgeStats handles GET /api/v1/bridge/stats (admin)
func (h *BridgeHandler) GetBridgeStats() gin.HandlerFunc {
	return func(c *gin.Context) {
		stats, err := h.bridgeService.GetBridgeStats()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"stats": stats})
	}
}

// GetBridgeMode handles GET /api/v1/bridge/mode - returns whether bridge is in demo mode
func (h *BridgeHandler) GetBridgeMode() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"demo_mode": h.bridgeService.IsDemoMode(),
			"message":   "Bridge is operating in demo mode. Transactions are simulated.",
		})
	}
}

// DemoConfirmDeposit handles POST /api/v1/bridge/demo/confirm-deposit
func (h *BridgeHandler) DemoConfirmDeposit() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			TxID string `json:"tx_id" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		tx, err := h.bridgeService.DemoConfirmDeposit(req.TxID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"transaction": tx,
			"message":     "Demo deposit confirmed. In production, this would be triggered by bank payment webhook.",
		})
	}
}

// DemoConfirmWithdraw handles POST /api/v1/bridge/demo/confirm-withdraw
func (h *BridgeHandler) DemoConfirmWithdraw() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			TxID string `json:"tx_id" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		tx, err := h.bridgeService.DemoConfirmWithdraw(req.TxID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"transaction": tx,
			"message":     "Demo withdrawal confirmed. In production, this would trigger a bank wire transfer.",
		})
	}
}

// DemoGetBalance handles GET /api/v1/bridge/demo/balance
func (h *BridgeHandler) DemoGetBalance() gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet := c.Query("wallet")
		if wallet == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "wallet address required"})
			return
		}

		balance, err := h.bridgeService.DemoGetBalance(wallet)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"balance": balance})
	}
}

// ─────────────────────── KYC Handler ──────────────────────────────────────

// KYCHandler handles KYC API endpoints
type KYCHandler struct {
	kycService *services.KYCService
}

// NewKYCHandler creates a new KYCHandler
func NewKYCHandler(kycService *services.KYCService) *KYCHandler {
	return &KYCHandler{kycService: kycService}
}

// GetKYCMode handles GET /api/v1/kyc/mode - returns whether KYC is in demo mode
func (h *KYCHandler) GetKYCMode() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"demo_mode": h.kycService.IsDemoMode(),
			"message":   "KYC is operating in demo mode. Verifications are self-service.",
			"levels": gin.H{
				"1": gin.H{"requires": "email + phone", "auto_approve": true},
				"2": gin.H{"requires": "full_name + document_type + document_id", "auto_approve": true},
				"3": gin.H{"requires": "level 2 fields + date_of_birth + address + selfie_confirm", "auto_approve": true},
			},
		})
	}
}

// StartVerification handles POST /api/v1/users/kyc/start
func (h *KYCHandler) StartVerification() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req services.KYCStartRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		resp, err := h.kycService.StartVerification(req)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"verification": resp})
	}
}

// GetKYCStatus handles GET /api/v1/users/kyc/status
func (h *KYCHandler) GetKYCStatus() gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet := c.Query("wallet")
		if wallet == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "wallet address required"})
			return
		}

		resp, err := h.kycService.GetStatus(wallet)
		if err != nil {
			// Return default "none" status for unregistered wallets
			c.JSON(http.StatusOK, gin.H{"kyc": gin.H{
				"wallet_address": wallet,
				"kyc_level":      0,
				"status":         "none",
				"verified_at":    nil,
				"applicant_id":   "",
			}})
			return
		}

		c.JSON(http.StatusOK, gin.H{"kyc": resp})
	}
}

// KYCWebhook handles POST /api/v1/users/kyc/webhook
func (h *KYCHandler) KYCWebhook() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Validate webhook signature
		body, _ := io.ReadAll(c.Request.Body)
		signature := c.GetHeader("X-Payload-Digest")

		if !h.kycService.ValidateWebhookSignature(body, signature) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid signature"})
			return
		}

		var payload services.KYCWebhookPayload
		if err := c.ShouldBindJSON(&payload); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if err := h.kycService.HandleWebhook(payload); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"status": "processed"})
	}
}

// ─────────────────────── Wallet Handler ──────────────────────────────────

// WalletHandler handles wallet management API endpoints
type WalletHandler struct {
	walletService *services.WalletService
}

// NewWalletHandler creates a new WalletHandler
func NewWalletHandler(walletService *services.WalletService) *WalletHandler {
	return &WalletHandler{walletService: walletService}
}

// RegisterWallet handles POST /api/v1/wallets/register
func (h *WalletHandler) RegisterWallet() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req services.RegisterWalletRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Get user ID from auth context
		userID, exists := c.Get("user_id")
		if !exists {
			// If no auth, use 0 (will be linked later)
			userID = uint(0)
		}

		resp, err := h.walletService.RegisterWallet(userID.(uint), req)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"wallet": resp})
	}
}

// GetWalletInfo handles GET /api/v1/wallets/:address
func (h *WalletHandler) GetWalletInfo() gin.HandlerFunc {
	return func(c *gin.Context) {
		address := c.Param("address")
		resp, err := h.walletService.GetWalletInfo(address)
		if err != nil {
			// Return a default unregistered wallet instead of 404
			c.JSON(http.StatusOK, gin.H{"wallet": gin.H{
				"wallet_address": address,
				"wallet_tier":    0,
				"wallet_type":    "unregistered",
				"kyc_level":      0,
				"monthly_limit":  0,
				"monthly_volume": 0,
				"is_active":      false,
				"is_frozen":      false,
				"registered":     false,
			}})
			return
		}
		c.JSON(http.StatusOK, gin.H{"wallet": resp})
	}
}

// UpgradeTier handles PUT /api/v1/wallets/tier/upgrade
func (h *WalletHandler) UpgradeTier() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req services.UpgradeTierRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if err := h.walletService.UpgradeTier(req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "tier upgraded successfully"})
	}
}
