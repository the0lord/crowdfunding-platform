package blockchain

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/the0lord/crowdfunding-platform/backend/internal/models"
	"gorm.io/gorm"
)

// EventListener listens for blockchain events and syncs to database
type EventListener struct {
	client *Client
	db     *gorm.DB
}

// NewEventListener creates a new event listener
func NewEventListener(client *Client, db *gorm.DB) *EventListener {
	return &EventListener{
		client: client,
		db:     db,
	}
}

// ListenForCampaignCreated listens for CampaignCreated events from factory
func (el *EventListener) ListenForCampaignCreated(ctx context.Context) error {
	query := ethereum.FilterQuery{
		Addresses: []common.Address{el.client.FactoryAddress},
	}

	logs := make(chan types.Log)
	sub, err := el.client.EthClient.SubscribeFilterLogs(ctx, query, logs)
	if err != nil {
		return fmt.Errorf("failed to subscribe to logs: %w", err)
	}

	log.Println("Listening for CampaignCreated events...")

	for {
		select {
		case err := <-sub.Err():
			return fmt.Errorf("subscription error: %w", err)
		case vLog := <-logs:
			el.handleCampaignCreated(vLog)
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

func (el *EventListener) handleCampaignCreated(vLog types.Log) {
	// Parse event data (simplified - in production, use proper ABI parsing)
	campaignAddress := common.BytesToAddress(vLog.Topics[1].Bytes())
	founderAddress := common.BytesToAddress(vLog.Topics[2].Bytes())

	log.Printf("Campaign created: %s by founder: %s", campaignAddress.Hex(), founderAddress.Hex())

	// Check if campaign already exists in database
	var existing models.Campaign
	if err := el.db.Where("contract_address = ?", campaignAddress.Hex()).First(&existing).Error; err == nil {
		log.Printf("Campaign %s already exists in database", campaignAddress.Hex())
		return
	}

	// Note: In production, you would fetch campaign details from the blockchain
	// For now, we just log the event
	log.Printf("New campaign detected: %s - Add details via API", campaignAddress.Hex())
}

// SyncCampaignData syncs campaign data from blockchain
func (el *EventListener) SyncCampaignData(campaignAddress string) error {
	// This would call the campaign contract to get current state
	// For now, it's a placeholder
	log.Printf("Syncing campaign data for: %s", campaignAddress)

	// TODO: Implement actual blockchain data fetching
	// - Call campaign.state()
	// - Call campaign.totalRaised()
	// - Call campaign.contributorCount()
	// - Update database

	return nil
}

// SyncContributions syncs contributions for a campaign
func (el *EventListener) SyncContributions(campaignAddress string, fromBlock uint64) error {
	log.Printf("Syncing contributions for campaign: %s from block: %d", campaignAddress, fromBlock)

	// TODO: Implement
	// - Query ContributionMade events
	// - Parse and save to database

	return nil
}

// StartEventListeners starts all event listeners
func StartEventListeners(ctx context.Context, client *Client, db *gorm.DB) {
	listener := NewEventListener(client, db)

	go func() {
		for {
			if err := listener.ListenForCampaignCreated(ctx); err != nil {
				log.Printf("Event listener error: %v, restarting in 10s...", err)
				time.Sleep(10 * time.Second)
			}
		}
	}()

	log.Println("Event listeners started")
}
