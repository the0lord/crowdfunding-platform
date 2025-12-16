package main

import (
	"context"
	"log"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/the0lord/crowdfunding-platform/backend/internal/auth"
	"github.com/the0lord/crowdfunding-platform/backend/internal/config"
	"github.com/the0lord/crowdfunding-platform/backend/internal/handlers"
	"github.com/the0lord/crowdfunding-platform/backend/internal/middleware"
	"github.com/the0lord/crowdfunding-platform/backend/internal/services"
	"github.com/the0lord/crowdfunding-platform/backend/pkg/blockchain"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	// Load configuration
	cfg := config.Load()

	// Initialize database
	db, err := config.InitDB(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Initialize blockchain client (optional - only if PRIVATE_KEY is set)
	var bcClient *blockchain.Client
	if cfg.PrivateKey != "" {
		chainID := int64(80002) // Polygon Amoy
		bcClient, err = blockchain.NewClient(cfg.RPCUrl, cfg.FactoryAddress, strings.TrimPrefix(cfg.PrivateKey, "0x"), chainID)
		if err != nil {
			log.Printf("Warning: Failed to initialize blockchain client: %v", err)
		} else {
			log.Println("Blockchain client initialized")

			// Start event listeners in background
			ctx := context.Background()
			go blockchain.StartEventListeners(ctx, bcClient, db)
		}
	}

	// Initialize JWT service
	jwtService := auth.NewJWTService(cfg.JWTSecret, 24) // 24 hour tokens

	// Initialize image service
	imageService, err := services.NewImageService()
	if err != nil {
		log.Printf("Warning: Failed to initialize image service: %v", err)
	}

	// Initialize auth handler
	adminAddresses := strings.Split(os.Getenv("ADMIN_ADDRESSES"), ",")
	authHandler := handlers.NewAuthHandler(db, jwtService, adminAddresses)
	imageHandler := handlers.NewImageHandler(imageService)
	adminHandler := handlers.NewAdminHandler(db)

	// Initialize router
	// Set Gin mode based on environment
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode) // Use release mode by default
	}
	router := gin.Default()

	// Apply middleware
	router.Use(middleware.CORS())
	router.Use(middleware.Logger())

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "healthy",
			"version": "1.0.0",
			"service": "crowdfunding-api",
		})
	})

	// API v1 routes
	v1 := router.Group("/api/v1")
	{
		// Auth routes (public)
		authRoutes := v1.Group("/auth")
		{
			authRoutes.GET("/nonce", authHandler.GetNonce())
			authRoutes.POST("/login", authHandler.Login())
			authRoutes.POST("/refresh", authHandler.RefreshToken())
		}

		// Campaign routes
		campaigns := v1.Group("/campaigns")
		{
			campaigns.GET("", handlers.GetCampaigns(db))
			campaigns.GET("/:id", handlers.GetCampaign(db))
			campaigns.POST("", auth.AuthMiddleware(jwtService), handlers.CreateCampaign(db))
			campaigns.PATCH("/:id/status", auth.AuthMiddleware(jwtService), auth.AdminMiddleware(), handlers.UpdateCampaignStatus(db))
		}

		// User routes
		users := v1.Group("/users")
		{
			users.GET("/:address", handlers.GetUser(db))
			users.POST("", auth.AuthMiddleware(jwtService), handlers.CreateOrUpdateUser(db))
			users.GET("/me", auth.AuthMiddleware(jwtService), authHandler.GetMe())
		}

		// Contribution routes
		contributions := v1.Group("/contributions")
		{
			contributions.GET("", handlers.GetContributions(db))
			contributions.POST("", auth.AuthMiddleware(jwtService), handlers.CreateContribution(db))
		}

		// Upload routes
		uploads := v1.Group("/uploads")
		uploads.Use(auth.AuthMiddleware(jwtService))
		{
			uploads.POST("/campaign-image", imageHandler.UploadCampaignImage())
			uploads.POST("/avatar", imageHandler.UploadUserAvatar())
		}

		// Admin routes (requires admin role)
		admin := v1.Group("/admin")
		admin.Use(auth.AuthMiddleware(jwtService), auth.AdminMiddleware())
		{
			admin.GET("/stats", adminHandler.GetDashboardStats())
			admin.GET("/pending", adminHandler.GetPendingCampaigns())
			admin.GET("/logs", adminHandler.GetModerationLogs())
			admin.POST("/campaigns/:id/approve", adminHandler.ApproveCampaign())
			admin.POST("/campaigns/:id/reject", adminHandler.RejectCampaign())
			admin.POST("/campaigns/:id/flag", adminHandler.FlagCampaign())
			admin.GET("/blacklist", adminHandler.GetBlacklistedAddresses())
			admin.POST("/blacklist", adminHandler.BlacklistAddress())
			admin.DELETE("/blacklist/:id", adminHandler.RemoveFromBlacklist())
			admin.GET("/users", adminHandler.GetAllUsers())
		}
	}

	// Serve static uploads
	router.Static("/uploads", "./uploads")

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s...", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
