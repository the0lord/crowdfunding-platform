package main

import (
	"context"
	"log"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/the0lord/crowdfunding-platform/backend/internal/config"
	"github.com/the0lord/crowdfunding-platform/backend/internal/handlers"
	"github.com/the0lord/crowdfunding-platform/backend/internal/middleware"
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
	} // Initialize router
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
		// Campaign routes
		campaigns := v1.Group("/campaigns")
		{
			campaigns.GET("", handlers.GetCampaigns(db))
			campaigns.GET("/:id", handlers.GetCampaign(db))
			campaigns.POST("", handlers.CreateCampaign(db))
			campaigns.PATCH("/:id/status", handlers.UpdateCampaignStatus(db))
		}

		// User routes
		users := v1.Group("/users")
		{
			users.GET("/:address", handlers.GetUser(db))
			users.POST("", handlers.CreateOrUpdateUser(db))
		}

		// Contribution routes
		contributions := v1.Group("/contributions")
		{
			contributions.GET("", handlers.GetContributions(db))
			contributions.POST("", handlers.CreateContribution(db))
		}
	}

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
