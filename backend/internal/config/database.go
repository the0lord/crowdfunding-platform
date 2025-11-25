package config

import (
	"fmt"
	"log"

	"github.com/the0lord/crowdfunding-platform/backend/internal/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func InitDB(cfg *Config) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})

	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	log.Println("Database connection established")

	// Auto-migrate database schema
	log.Println("Running auto-migration...")
	err = db.AutoMigrate(
		&models.User{},
		&models.Campaign{},
		&models.Contribution{},
		&models.CampaignUpdate{},
		&models.ModerationLog{},
		&models.BlacklistedAddress{},
	)
	if err != nil {
		return nil, fmt.Errorf("failed to auto-migrate: %w", err)
	}
	log.Println("Auto-migration completed successfully")

	return db, nil
}
