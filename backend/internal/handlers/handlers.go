package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/the0lord/crowdfunding-platform/backend/internal/models"
	"gorm.io/gorm"
)

func GetCampaigns(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Pagination with validation
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))

		// Validate pagination parameters
		if page < 1 {
			page = 1
		}
		if pageSize < 1 || pageSize > 100 {
			pageSize = 10
		}

		offset := (page - 1) * pageSize

		// Filters
		status := c.Query("status")
		category := c.Query("category")
		founder := c.Query("founder")

		query := db.Model(&models.Campaign{}).Preload("Founder")

		if status != "" {
			query = query.Where("moderation_status = ?", status)
		}
		if category != "" {
			query = query.Where("category = ?", category)
		}
		if founder != "" {
			query = query.Where("founder_address = ?", strings.ToLower(founder))
		}

		var total int64
		query.Count(&total)

		var campaigns []models.Campaign
		if err := query.Offset(offset).Limit(pageSize).Order("created_at DESC").Find(&campaigns).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch campaigns"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"campaigns": campaigns,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		})
	}
}

func GetCampaign(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		var campaign models.Campaign
		if err := db.Preload("Founder").Preload("Contributions").Preload("Updates").First(&campaign, id).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "Campaign not found"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch campaign"})
			}
			return
		}

		c.JSON(http.StatusOK, campaign)
	}
}

func CreateCampaign(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var campaign models.Campaign
		if err := c.ShouldBindJSON(&campaign); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate required fields
		if campaign.ContractAddress == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "contract_address is required"})
			return
		}
		if campaign.FounderAddress == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "founder_address is required"})
			return
		}
		if campaign.Title == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "title is required"})
			return
		}

		// Normalize addresses
		campaign.ContractAddress = strings.ToLower(campaign.ContractAddress)
		campaign.FounderAddress = strings.ToLower(campaign.FounderAddress)

		// Set defaults
		campaign.ModerationStatus = "pending"
		campaign.State = "Active"
		campaign.TotalRaised = "0"
		campaign.ContributorCount = 0

		if err := db.Create(&campaign).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create campaign"})
			return
		}

		c.JSON(http.StatusCreated, campaign)
	}
}

func GetUser(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		address := strings.ToLower(c.Param("address"))

		var user models.User
		if err := db.Where("wallet_address = ?", address).Preload("CampaignsCreated").Preload("Contributions").First(&user).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user"})
			}
			return
		}

		c.JSON(http.StatusOK, user)
	}
}

func CreateOrUpdateUser(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var user models.User
		if err := c.ShouldBindJSON(&user); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		user.WalletAddress = strings.ToLower(user.WalletAddress)

		if err := db.Where(models.User{WalletAddress: user.WalletAddress}).Assign(user).FirstOrCreate(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save user"})
			return
		}

		c.JSON(http.StatusOK, user)
	}
}

func GetContributions(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		campaignID := c.Query("campaign_id")
		contributor := c.Query("contributor")

		query := db.Model(&models.Contribution{}).Preload("Campaign").Preload("Contributor")

		if campaignID != "" {
			query = query.Where("campaign_id = ?", campaignID)
		}
		if contributor != "" {
			query = query.Where("contributor_address = ?", strings.ToLower(contributor))
		}

		var contributions []models.Contribution
		if err := query.Order("created_at DESC").Find(&contributions).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch contributions"})
			return
		}

		c.JSON(http.StatusOK, contributions)
	}
}

func CreateContribution(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var contribution models.Contribution
		if err := c.ShouldBindJSON(&contribution); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate required fields
		if contribution.TransactionHash == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "transaction_hash is required"})
			return
		}
		if contribution.CampaignID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "campaign_id is required"})
			return
		}

		// Normalize addresses
		contribution.ContributorAddress = strings.ToLower(contribution.ContributorAddress)

		if err := db.Create(&contribution).Error; err != nil {
			// Check for duplicate transaction hash
			if strings.Contains(err.Error(), "duplicate key") {
				c.JSON(http.StatusConflict, gin.H{"error": "Contribution already recorded"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create contribution"})
			return
		}

		c.JSON(http.StatusCreated, contribution)
	}
}

func UpdateCampaignStatus(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var req struct {
			Status          string `json:"status" binding:"required"`
			ReviewedBy      string `json:"reviewed_by" binding:"required"`
			RejectionReason string `json:"rejection_reason"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var campaign models.Campaign
		if err := db.First(&campaign, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Campaign not found"})
			return
		}

		updates := map[string]interface{}{
			"moderation_status": req.Status,
			"reviewed_by":       req.ReviewedBy,
			"reviewed_at":       db.NowFunc(),
		}
		if req.RejectionReason != "" {
			updates["rejection_reason"] = req.RejectionReason
		}

		if err := db.Model(&campaign).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update campaign"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Campaign status updated"})
	}
}
