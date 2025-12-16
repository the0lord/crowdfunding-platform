package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/the0lord/crowdfunding-platform/backend/internal/models"
	"gorm.io/gorm"
)

// AdminHandler handles admin-specific endpoints
type AdminHandler struct {
	db *gorm.DB
}

// NewAdminHandler creates a new admin handler
func NewAdminHandler(db *gorm.DB) *AdminHandler {
	return &AdminHandler{db: db}
}

// GetDashboardStats returns platform statistics
func (h *AdminHandler) GetDashboardStats() gin.HandlerFunc {
	return func(c *gin.Context) {
		var stats struct {
			TotalCampaigns     int64   `json:"total_campaigns"`
			PendingCampaigns   int64   `json:"pending_campaigns"`
			ApprovedCampaigns  int64   `json:"approved_campaigns"`
			RejectedCampaigns  int64   `json:"rejected_campaigns"`
			TotalUsers         int64   `json:"total_users"`
			TotalContributions int64   `json:"total_contributions"`
			TotalRaised        float64 `json:"total_raised"`
			BlacklistedCount   int64   `json:"blacklisted_count"`
		}

		h.db.Model(&models.Campaign{}).Count(&stats.TotalCampaigns)
		h.db.Model(&models.Campaign{}).Where("moderation_status = ?", "pending").Count(&stats.PendingCampaigns)
		h.db.Model(&models.Campaign{}).Where("moderation_status = ?", "approved").Count(&stats.ApprovedCampaigns)
		h.db.Model(&models.Campaign{}).Where("moderation_status = ?", "rejected").Count(&stats.RejectedCampaigns)
		h.db.Model(&models.User{}).Count(&stats.TotalUsers)
		h.db.Model(&models.Contribution{}).Count(&stats.TotalContributions)
		h.db.Model(&models.BlacklistedAddress{}).Count(&stats.BlacklistedCount)

		c.JSON(http.StatusOK, stats)
	}
}

// GetPendingCampaigns returns campaigns awaiting moderation
func (h *AdminHandler) GetPendingCampaigns() gin.HandlerFunc {
	return func(c *gin.Context) {
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
		offset := (page - 1) * pageSize

		var campaigns []models.Campaign
		var total int64

		h.db.Model(&models.Campaign{}).Where("moderation_status = ?", "pending").Count(&total)
		h.db.Where("moderation_status = ?", "pending").
			Preload("Founder").
			Order("created_at ASC").
			Offset(offset).Limit(pageSize).
			Find(&campaigns)

		c.JSON(http.StatusOK, gin.H{
			"campaigns": campaigns,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		})
	}
}

// GetModerationLogs returns moderation history
func (h *AdminHandler) GetModerationLogs() gin.HandlerFunc {
	return func(c *gin.Context) {
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))
		offset := (page - 1) * pageSize

		var logs []models.ModerationLog
		var total int64

		h.db.Model(&models.ModerationLog{}).Count(&total)
		h.db.Preload("Campaign").
			Order("created_at DESC").
			Offset(offset).Limit(pageSize).
			Find(&logs)

		c.JSON(http.StatusOK, gin.H{
			"logs":      logs,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		})
	}
}

// ApproveCampaign approves a campaign
func (h *AdminHandler) ApproveCampaign() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		moderatorAddr, _ := c.Get("wallet_address")

		var campaign models.Campaign
		if err := h.db.First(&campaign, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Campaign not found"})
			return
		}

		now := time.Now()
		campaign.ModerationStatus = "approved"
		campaign.ReviewedAt = &now
		campaign.ReviewedBy = moderatorAddr.(string)

		if err := h.db.Save(&campaign).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to approve campaign"})
			return
		}

		// Log the action
		h.db.Create(&models.ModerationLog{
			CampaignID:       campaign.ID,
			ModeratorAddress: moderatorAddr.(string),
			Action:           "approved",
		})

		c.JSON(http.StatusOK, gin.H{"message": "Campaign approved successfully"})
	}
}

// RejectCampaign rejects a campaign
func (h *AdminHandler) RejectCampaign() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		moderatorAddr, _ := c.Get("wallet_address")

		var req struct {
			Reason string `json:"reason" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Rejection reason is required"})
			return
		}

		var campaign models.Campaign
		if err := h.db.First(&campaign, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Campaign not found"})
			return
		}

		now := time.Now()
		campaign.ModerationStatus = "rejected"
		campaign.ReviewedAt = &now
		campaign.ReviewedBy = moderatorAddr.(string)
		campaign.RejectionReason = req.Reason

		if err := h.db.Save(&campaign).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reject campaign"})
			return
		}

		// Log the action
		h.db.Create(&models.ModerationLog{
			CampaignID:       campaign.ID,
			ModeratorAddress: moderatorAddr.(string),
			Action:           "rejected",
			Reason:           req.Reason,
		})

		c.JSON(http.StatusOK, gin.H{"message": "Campaign rejected"})
	}
}

// FlagCampaign flags a campaign for review
func (h *AdminHandler) FlagCampaign() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		moderatorAddr, _ := c.Get("wallet_address")

		var req struct {
			Reason string `json:"reason" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Flag reason is required"})
			return
		}

		var campaign models.Campaign
		if err := h.db.First(&campaign, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Campaign not found"})
			return
		}

		campaign.ModerationStatus = "flagged"
		campaign.FlagCount++

		if err := h.db.Save(&campaign).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to flag campaign"})
			return
		}

		// Log the action
		h.db.Create(&models.ModerationLog{
			CampaignID:       campaign.ID,
			ModeratorAddress: moderatorAddr.(string),
			Action:           "flagged",
			Reason:           req.Reason,
		})

		c.JSON(http.StatusOK, gin.H{"message": "Campaign flagged"})
	}
}

// GetBlacklistedAddresses returns blacklisted addresses
func (h *AdminHandler) GetBlacklistedAddresses() gin.HandlerFunc {
	return func(c *gin.Context) {
		var addresses []models.BlacklistedAddress
		h.db.Order("created_at DESC").Find(&addresses)

		c.JSON(http.StatusOK, gin.H{"addresses": addresses})
	}
}

// BlacklistAddress adds an address to blacklist
func (h *AdminHandler) BlacklistAddress() gin.HandlerFunc {
	return func(c *gin.Context) {
		adminAddr, _ := c.Get("wallet_address")

		var req struct {
			Address string `json:"address" binding:"required"`
			Reason  string `json:"reason" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		blacklist := models.BlacklistedAddress{
			Address:       req.Address,
			Reason:        req.Reason,
			BlacklistedBy: adminAddr.(string),
		}

		if err := h.db.Create(&blacklist).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to blacklist address"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"message": "Address blacklisted"})
	}
}

// RemoveFromBlacklist removes an address from blacklist
func (h *AdminHandler) RemoveFromBlacklist() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		if err := h.db.Delete(&models.BlacklistedAddress{}, id).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove from blacklist"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Address removed from blacklist"})
	}
}

// GetAllUsers returns all users with filtering
func (h *AdminHandler) GetAllUsers() gin.HandlerFunc {
	return func(c *gin.Context) {
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
		offset := (page - 1) * pageSize

		var users []models.User
		var total int64

		h.db.Model(&models.User{}).Count(&total)
		h.db.Order("created_at DESC").
			Offset(offset).Limit(pageSize).
			Find(&users)

		c.JSON(http.StatusOK, gin.H{
			"users":     users,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		})
	}
}
