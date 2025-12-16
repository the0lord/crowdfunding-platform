package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/the0lord/crowdfunding-platform/backend/internal/services"
)

// ImageHandler handles image upload endpoints
type ImageHandler struct {
	imageService *services.ImageService
}

// NewImageHandler creates a new image handler
func NewImageHandler(imageService *services.ImageService) *ImageHandler {
	return &ImageHandler{
		imageService: imageService,
	}
}

// UploadCampaignImage handles campaign image uploads
func (h *ImageHandler) UploadCampaignImage() gin.HandlerFunc {
	return func(c *gin.Context) {
		file, err := c.FormFile("image")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "No image file provided"})
			return
		}

		url, err := h.imageService.Upload(file, "campaigns")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"url":     url,
			"message": "Image uploaded successfully",
		})
	}
}

// UploadUserAvatar handles user avatar uploads
func (h *ImageHandler) UploadUserAvatar() gin.HandlerFunc {
	return func(c *gin.Context) {
		file, err := c.FormFile("avatar")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "No avatar file provided"})
			return
		}

		url, err := h.imageService.Upload(file, "avatars")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"url":     url,
			"message": "Avatar uploaded successfully",
		})
	}
}
