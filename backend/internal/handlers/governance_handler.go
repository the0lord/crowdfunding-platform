package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/the0lord/crowdfunding-platform/backend/internal/models"
	"gorm.io/gorm"
)

// GovernanceHandler handles DAO governance API endpoints
type GovernanceHandler struct {
	db *gorm.DB
}

// NewGovernanceHandler creates a new GovernanceHandler
func NewGovernanceHandler(db *gorm.DB) *GovernanceHandler {
	return &GovernanceHandler{db: db}
}

// GetProposals handles GET /api/v1/governance/proposals
func (h *GovernanceHandler) GetProposals() gin.HandlerFunc {
	return func(c *gin.Context) {
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))
		status := c.Query("status")
		proposalType := c.Query("type")

		if page < 1 {
			page = 1
		}
		if pageSize < 1 || pageSize > 50 {
			pageSize = 10
		}

		query := h.db.Model(&models.Proposal{})
		if status != "" {
			query = query.Where("status = ?", status)
		}
		if proposalType != "" {
			query = query.Where("proposal_type = ?", proposalType)
		}

		var total int64
		query.Count(&total)

		var proposals []models.Proposal
		offset := (page - 1) * pageSize
		if err := query.Offset(offset).Limit(pageSize).Order("created_at DESC").Find(&proposals).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch proposals"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"proposals": proposals,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		})
	}
}

// CreateProposal handles POST /api/v1/governance/proposals
func (h *GovernanceHandler) CreateProposal() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			ProposerAddress string `json:"proposer_address" binding:"required"`
			Title           string `json:"title" binding:"required"`
			Description     string `json:"description" binding:"required"`
			ProposalType    string `json:"proposal_type" binding:"required"`
			Targets         string `json:"targets"`
			Values          string `json:"values"`
			Calldatas       string `json:"calldatas"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate proposal type
		validTypes := map[string]bool{
			"PARAMETER_CHANGE": true,
			"TREASURY_SPEND":   true,
			"CONTRACT_UPGRADE": true,
			"EMERGENCY":        true,
			"CAMPAIGN_APPEAL":  true,
		}
		if !validTypes[req.ProposalType] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid proposal type"})
			return
		}

		proposal := models.Proposal{
			ProposerAddress: req.ProposerAddress,
			Title:           req.Title,
			Description:     req.Description,
			ProposalType:    req.ProposalType,
			Targets:         req.Targets,
			Values:          req.Values,
			Calldatas:       req.Calldatas,
			Status:          "pending",
		}

		if err := h.db.Create(&proposal).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create proposal"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"proposal": proposal})
	}
}

// GetProposal handles GET /api/v1/governance/proposals/:id
func (h *GovernanceHandler) GetProposal() gin.HandlerFunc {
	return func(c *gin.Context) {
		idStr := c.Param("id")
		id, err := strconv.ParseUint(idStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid proposal ID"})
			return
		}

		var proposal models.Proposal
		if err := h.db.Preload("Votes").First(&proposal, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "proposal not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"proposal": proposal})
	}
}

// VoteOnProposal handles POST /api/v1/governance/proposals/:id/vote
func (h *GovernanceHandler) VoteOnProposal() gin.HandlerFunc {
	return func(c *gin.Context) {
		proposalID, _ := strconv.ParseUint(c.Param("id"), 10, 64)

		var req struct {
			VoterAddress    string `json:"voter_address" binding:"required"`
			Support         int    `json:"support" binding:"oneof=0 1 2"` // 0=Against, 1=For, 2=Abstain
			VotingPower     string `json:"voting_power" binding:"required"`
			Reason          string `json:"reason"`
			TransactionHash string `json:"transaction_hash"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Check proposal exists and is active
		var proposal models.Proposal
		if err := h.db.First(&proposal, proposalID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "proposal not found"})
			return
		}
		if proposal.Status != "active" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "proposal is not active for voting"})
			return
		}

		// Check for duplicate vote
		var existingVote models.ProposalVote
		if err := h.db.Where("proposal_id = ? AND voter_address = ?", proposalID, req.VoterAddress).First(&existingVote).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"error": "already voted on this proposal"})
			return
		}

		// Create vote
		vote := models.ProposalVote{
			ProposalID:      uint(proposalID),
			VoterAddress:    req.VoterAddress,
			Support:         req.Support,
			VotingPower:     req.VotingPower,
			Reason:          req.Reason,
			TransactionHash: req.TransactionHash,
		}

		if err := h.db.Create(&vote).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record vote"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"vote": vote})
	}
}

// GetGovernanceStats handles GET /api/v1/governance/stats
func (h *GovernanceHandler) GetGovernanceStats() gin.HandlerFunc {
	return func(c *gin.Context) {
		var totalProposals, activeProposals, executedProposals int64
		var totalVotes int64

		h.db.Model(&models.Proposal{}).Count(&totalProposals)
		h.db.Model(&models.Proposal{}).Where("status = ?", "active").Count(&activeProposals)
		h.db.Model(&models.Proposal{}).Where("status = ?", "executed").Count(&executedProposals)
		h.db.Model(&models.ProposalVote{}).Count(&totalVotes)

		// Unique voters
		var uniqueVoters int64
		h.db.Model(&models.ProposalVote{}).Distinct("voter_address").Count(&uniqueVoters)

		c.JSON(http.StatusOK, gin.H{
			"stats": gin.H{
				"total_proposals":    totalProposals,
				"active_proposals":   activeProposals,
				"executed_proposals": executedProposals,
				"total_votes":        totalVotes,
				"unique_voters":      uniqueVoters,
			},
		})
	}
}
