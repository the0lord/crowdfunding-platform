package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/the0lord/crowdfunding-platform/backend/internal/auth"
	"github.com/the0lord/crowdfunding-platform/backend/internal/models"
	"gorm.io/gorm"
)

// NonceStore stores nonces for authentication
type NonceStore struct {
	nonces map[string]nonceEntry
	mu     sync.RWMutex
}

type nonceEntry struct {
	nonce     string
	createdAt time.Time
}

// NewNonceStore creates a new nonce store
func NewNonceStore() *NonceStore {
	store := &NonceStore{
		nonces: make(map[string]nonceEntry),
	}
	// Clean up expired nonces every 5 minutes
	go store.cleanup()
	return store
}

func (s *NonceStore) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		s.mu.Lock()
		for addr, entry := range s.nonces {
			if time.Since(entry.createdAt) > 10*time.Minute {
				delete(s.nonces, addr)
			}
		}
		s.mu.Unlock()
	}
}

func (s *NonceStore) GenerateNonce(address string) string {
	bytes := make([]byte, 16)
	rand.Read(bytes)
	nonce := hex.EncodeToString(bytes)

	s.mu.Lock()
	s.nonces[strings.ToLower(address)] = nonceEntry{
		nonce:     nonce,
		createdAt: time.Now(),
	}
	s.mu.Unlock()

	return nonce
}

func (s *NonceStore) GetNonce(address string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entry, exists := s.nonces[strings.ToLower(address)]
	if !exists || time.Since(entry.createdAt) > 10*time.Minute {
		return "", false
	}
	return entry.nonce, true
}

func (s *NonceStore) DeleteNonce(address string) {
	s.mu.Lock()
	delete(s.nonces, strings.ToLower(address))
	s.mu.Unlock()
}

// AuthHandler handles authentication endpoints
type AuthHandler struct {
	db         *gorm.DB
	jwtService *auth.JWTService
	verifier   *auth.SignatureVerifier
	nonceStore *NonceStore
	adminAddrs map[string]bool
}

// NewAuthHandler creates a new auth handler
func NewAuthHandler(db *gorm.DB, jwtService *auth.JWTService, adminAddresses []string) *AuthHandler {
	adminMap := make(map[string]bool)
	for _, addr := range adminAddresses {
		adminMap[strings.ToLower(addr)] = true
	}

	return &AuthHandler{
		db:         db,
		jwtService: jwtService,
		verifier:   auth.NewSignatureVerifier(),
		nonceStore: NewNonceStore(),
		adminAddrs: adminMap,
	}
}

// GetNonce returns a nonce for the wallet to sign
func (h *AuthHandler) GetNonce() gin.HandlerFunc {
	return func(c *gin.Context) {
		address := c.Query("address")
		if address == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "address is required"})
			return
		}

		nonce := h.nonceStore.GenerateNonce(address)
		message := h.verifier.GenerateMessage(address, nonce)

		c.JSON(http.StatusOK, gin.H{
			"nonce":   nonce,
			"message": message,
		})
	}
}

// Login verifies signature and returns JWT token
func (h *AuthHandler) Login() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Address   string `json:"address" binding:"required"`
			Signature string `json:"signature" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Get stored nonce
		nonce, exists := h.nonceStore.GetNonce(req.Address)
		if !exists {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Nonce expired or not found. Please request a new nonce."})
			return
		}

		// Verify signature
		message := h.verifier.GenerateMessage(req.Address, nonce)
		if err := h.verifier.VerifySignature(message, req.Signature, req.Address); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid signature"})
			return
		}

		// Delete used nonce
		h.nonceStore.DeleteNonce(req.Address)

		// Check if admin
		isAdmin := h.adminAddrs[strings.ToLower(req.Address)]

		// Create or update user
		normalizedAddr := strings.ToLower(req.Address)
		var user models.User
		h.db.Where(models.User{WalletAddress: normalizedAddr}).FirstOrCreate(&user, models.User{
			WalletAddress: normalizedAddr,
		})

		// Generate JWT
		token, err := h.jwtService.GenerateToken(normalizedAddr, isAdmin)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"token":    token,
			"user":     user,
			"is_admin": isAdmin,
		})
	}
}

// RefreshToken refreshes an existing token
func (h *AuthHandler) RefreshToken() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Token string `json:"token" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		newToken, err := h.jwtService.RefreshToken(req.Token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"token": newToken})
	}
}

// GetMe returns the current user's info
func (h *AuthHandler) GetMe() gin.HandlerFunc {
	return func(c *gin.Context) {
		address := auth.GetWalletAddress(c)
		if address == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
			return
		}

		var user models.User
		if err := h.db.Where("wallet_address = ?", address).
			Preload("CampaignsCreated").
			Preload("Contributions").
			First(&user).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"user":     user,
			"is_admin": auth.IsAdmin(c),
		})
	}
}
