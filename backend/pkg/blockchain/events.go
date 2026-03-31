package blockchain

import (
	"context"
	"fmt"
	"log"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/the0lord/crowdfunding-platform/backend/internal/models"
	"gorm.io/gorm"
)

// ABI fragments for contract calls
const campaignABIJSON = `[
  {"inputs":[],"name":"totalRaised","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"contributorCount","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"state","outputs":[{"type":"uint8"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"goalAmount","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"deadline","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"founder","outputs":[{"type":"address"}],"stateMutability":"view","type":"function"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"contributor","type":"address"},{"indexed":false,"name":"amount","type":"uint256"},{"indexed":false,"name":"newTotal","type":"uint256"},{"indexed":false,"name":"timestamp","type":"uint256"}],"name":"ContributionReceived","type":"event"}
]`

// Event signatures
var (
	campaignCreatedSig  = crypto.Keccak256Hash([]byte("CampaignCreated(address,address,uint256,uint256,uint256)"))
	contributionRecvSig = crypto.Keccak256Hash([]byte("ContributionReceived(address,uint256,uint256,uint256)"))
)

// EventListener listens for blockchain events and syncs to database
type EventListener struct {
	client      *Client
	db          *gorm.DB
	campaignABI abi.ABI
}

// NewEventListener creates a new event listener
func NewEventListener(client *Client, db *gorm.DB) *EventListener {
	parsedABI, err := abi.JSON(strings.NewReader(campaignABIJSON))
	if err != nil {
		log.Printf("Warning: failed to parse campaign ABI: %v", err)
	}
	return &EventListener{
		client:      client,
		db:          db,
		campaignABI: parsedABI,
	}
}

// ListenForCampaignCreated listens for CampaignCreated events from factory
func (el *EventListener) ListenForCampaignCreated(ctx context.Context) error {
	query := ethereum.FilterQuery{
		Addresses: []common.Address{el.client.FactoryAddress},
		Topics:    [][]common.Hash{{campaignCreatedSig}},
	}

	logs := make(chan types.Log)
	sub, err := el.client.EthClient.SubscribeFilterLogs(ctx, query, logs)
	if err != nil {
		// BSC public RPCs often don't support websocket subscriptions
		// Fall back to polling mode
		log.Printf("WebSocket subscription not available, using polling mode: %v", err)
		return el.pollForCampaignCreated(ctx)
	}

	log.Println("Listening for CampaignCreated events (WebSocket)...")

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

// pollForCampaignCreated polls for new events every 15 seconds
func (el *EventListener) pollForCampaignCreated(ctx context.Context) error {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	// Start from current block
	currentBlock, err := el.client.EthClient.BlockNumber(ctx)
	if err != nil {
		return fmt.Errorf("failed to get block number: %w", err)
	}
	lastChecked := currentBlock

	log.Printf("Polling for CampaignCreated events from block %d...", lastChecked)

	for {
		select {
		case <-ticker.C:
			latestBlock, err := el.client.EthClient.BlockNumber(ctx)
			if err != nil {
				log.Printf("Error getting block number: %v", err)
				continue
			}
			if latestBlock <= lastChecked {
				continue
			}

			query := ethereum.FilterQuery{
				FromBlock: new(big.Int).SetUint64(lastChecked + 1),
				ToBlock:   new(big.Int).SetUint64(latestBlock),
				Addresses: []common.Address{el.client.FactoryAddress},
				Topics:    [][]common.Hash{{campaignCreatedSig}},
			}

			eventLogs, err := el.client.EthClient.FilterLogs(ctx, query)
			if err != nil {
				log.Printf("Error filtering logs: %v", err)
				continue
			}

			for _, vLog := range eventLogs {
				el.handleCampaignCreated(vLog)
			}
			lastChecked = latestBlock

		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

func (el *EventListener) handleCampaignCreated(vLog types.Log) {
	if len(vLog.Topics) < 3 {
		log.Printf("CampaignCreated event has fewer topics than expected: %d", len(vLog.Topics))
		return
	}

	campaignAddress := common.BytesToAddress(vLog.Topics[1].Bytes())
	founderAddress := common.BytesToAddress(vLog.Topics[2].Bytes())

	log.Printf("Campaign created: %s by founder: %s (block %d)", campaignAddress.Hex(), founderAddress.Hex(), vLog.BlockNumber)

	// Check if campaign already exists in database
	var existing models.Campaign
	if err := el.db.Where("contract_address = ?", campaignAddress.Hex()).First(&existing).Error; err == nil {
		// Campaign exists — sync its on-chain data
		el.SyncCampaignData(campaignAddress.Hex())
		return
	}

	log.Printf("New on-chain campaign detected: %s — will sync when registered via API", campaignAddress.Hex())
}

// SyncCampaignData syncs campaign data from blockchain to database
func (el *EventListener) SyncCampaignData(campaignAddress string) error {
	log.Printf("Syncing campaign data for: %s", campaignAddress)

	addr := common.HexToAddress(campaignAddress)

	// Call totalRaised()
	totalRaisedData, err := el.callContract(addr, "totalRaised")
	if err != nil {
		return fmt.Errorf("failed to call totalRaised: %w", err)
	}

	// Call contributorCount()
	countData, err := el.callContract(addr, "contributorCount")
	if err != nil {
		return fmt.Errorf("failed to call contributorCount: %w", err)
	}

	// Call state()
	stateData, err := el.callContract(addr, "state")
	if err != nil {
		return fmt.Errorf("failed to call state: %w", err)
	}

	// Unpack results
	totalRaisedResults, err := el.campaignABI.Unpack("totalRaised", totalRaisedData)
	if err != nil {
		return fmt.Errorf("failed to unpack totalRaised: %w", err)
	}
	countResults, err := el.campaignABI.Unpack("contributorCount", countData)
	if err != nil {
		return fmt.Errorf("failed to unpack contributorCount: %w", err)
	}
	stateResults, err := el.campaignABI.Unpack("state", stateData)
	if err != nil {
		return fmt.Errorf("failed to unpack state: %w", err)
	}

	totalRaised := totalRaisedResults[0].(*big.Int)
	contribCount := countResults[0].(*big.Int)
	campaignState := stateResults[0].(uint8)

	// Convert from wei (18 decimals) to human-readable
	totalRaisedFloat := new(big.Float).Quo(
		new(big.Float).SetInt(totalRaised),
		new(big.Float).SetFloat64(1e18),
	)
	totalRaisedF64, _ := totalRaisedFloat.Float64()

	// Map on-chain state to DB status
	statusMap := map[uint8]string{
		0: "active",     // Active
		1: "successful", // Successful
		2: "failed",     // Failed
		3: "cancelled",  // Cancelled
	}
	status, ok := statusMap[campaignState]
	if !ok {
		status = "active"
	}

	// Update database
	result := el.db.Model(&models.Campaign{}).
		Where("contract_address = ?", campaignAddress).
		Updates(map[string]interface{}{
			"total_raised":      totalRaisedF64,
			"contributor_count": contribCount.Int64(),
			"status":            status,
		})

	if result.Error != nil {
		return fmt.Errorf("failed to update campaign: %w", result.Error)
	}

	log.Printf("Synced campaign %s: raised=%.2f KGST, contributors=%d, state=%s",
		campaignAddress, totalRaisedF64, contribCount.Int64(), status)
	return nil
}

// SyncContributions syncs contribution events for a campaign
func (el *EventListener) SyncContributions(campaignAddress string, fromBlock uint64) error {
	log.Printf("Syncing contributions for campaign: %s from block: %d", campaignAddress, fromBlock)

	ctx := context.Background()
	addr := common.HexToAddress(campaignAddress)

	latestBlock, err := el.client.EthClient.BlockNumber(ctx)
	if err != nil {
		return fmt.Errorf("failed to get latest block: %w", err)
	}

	query := ethereum.FilterQuery{
		FromBlock: new(big.Int).SetUint64(fromBlock),
		ToBlock:   new(big.Int).SetUint64(latestBlock),
		Addresses: []common.Address{addr},
		Topics:    [][]common.Hash{{contributionRecvSig}},
	}

	eventLogs, err := el.client.EthClient.FilterLogs(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to filter contribution logs: %w", err)
	}

	log.Printf("Found %d contribution events for %s", len(eventLogs), campaignAddress)

	for _, vLog := range eventLogs {
		if len(vLog.Topics) < 2 {
			continue
		}

		contributor := common.BytesToAddress(vLog.Topics[1].Bytes())

		// Decode non-indexed params: amount, newTotal, timestamp
		if len(vLog.Data) < 96 {
			continue
		}

		amount := new(big.Int).SetBytes(vLog.Data[0:32])
		amountFloat := new(big.Float).Quo(
			new(big.Float).SetInt(amount),
			new(big.Float).SetFloat64(1e18),
		)
		amountF64, _ := amountFloat.Float64()

		// Check if contribution already recorded
		var existing models.Contribution
		txHash := vLog.TxHash.Hex()
		if err := el.db.Where("transaction_hash = ?", txHash).First(&existing).Error; err == nil {
			continue // already recorded
		}

		// Find campaign in DB
		var campaign models.Campaign
		if err := el.db.Where("contract_address = ?", campaignAddress).First(&campaign).Error; err != nil {
			log.Printf("Campaign %s not in DB, skipping contribution", campaignAddress)
			continue
		}

		contribution := models.Contribution{
			CampaignID:         campaign.ID,
			ContributorAddress: strings.ToLower(contributor.Hex()),
			Amount:             fmt.Sprintf("%.6f", amountF64),
			TransactionHash:    txHash,
			Timestamp:          time.Now(),
		}

		if err := el.db.Create(&contribution).Error; err != nil {
			log.Printf("Failed to save contribution: %v", err)
			continue
		}

		log.Printf("Saved contribution: %.2f KGST from %s (tx: %s)", amountF64, contributor.Hex(), txHash[:16])
	}

	// Also sync the campaign totals
	el.SyncCampaignData(campaignAddress)
	return nil
}

// callContract makes a read-only call to a contract method
func (el *EventListener) callContract(contractAddr common.Address, method string) ([]byte, error) {
	data, err := el.campaignABI.Pack(method)
	if err != nil {
		return nil, fmt.Errorf("failed to pack %s: %w", method, err)
	}

	msg := ethereum.CallMsg{
		To:   &contractAddr,
		Data: data,
	}

	result, err := el.client.EthClient.CallContract(context.Background(), msg, nil)
	if err != nil {
		return nil, fmt.Errorf("call %s failed: %w", method, err)
	}
	return result, nil
}

// StartEventListeners starts all event listeners
func StartEventListeners(ctx context.Context, client *Client, db *gorm.DB) {
	listener := NewEventListener(client, db)

	// Listen for new campaigns
	go func() {
		for {
			if err := listener.ListenForCampaignCreated(ctx); err != nil {
				log.Printf("Event listener error: %v, restarting in 30s...", err)
				time.Sleep(30 * time.Second)
			}
		}
	}()

	// Periodic sync of all active campaigns
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				var campaigns []models.Campaign
				if err := db.Where("status = ?", "active").Find(&campaigns).Error; err != nil {
					log.Printf("Error fetching active campaigns: %v", err)
					continue
				}
				for _, c := range campaigns {
					if c.ContractAddress != "" {
						listener.SyncCampaignData(c.ContractAddress)
					}
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	log.Println("Event listeners started (BSC chain)")
}
