package blockchain

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

type Client struct {
	EthClient      *ethclient.Client
	FactoryAddress common.Address
	PrivateKey     *ecdsa.PrivateKey
	ChainID        *big.Int
}

// NewClient creates a new blockchain client
func NewClient(rpcURL, factoryAddress, privateKeyHex string, chainID int64) (*Client, error) {
	// Connect to Ethereum node
	ethClient, err := ethclient.Dial(rpcURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to ethereum node: %w", err)
	}

	// Parse private key if provided
	var privateKey *ecdsa.PrivateKey
	if privateKeyHex != "" {
		privateKey, err = crypto.HexToECDSA(privateKeyHex)
		if err != nil {
			return nil, fmt.Errorf("invalid private key: %w", err)
		}
	}

	return &Client{
		EthClient:      ethClient,
		FactoryAddress: common.HexToAddress(factoryAddress),
		PrivateKey:     privateKey,
		ChainID:        big.NewInt(chainID),
	}, nil
}

// GetAuth creates transaction auth from private key
func (c *Client) GetAuth(ctx context.Context) (*bind.TransactOpts, error) {
	if c.PrivateKey == nil {
		return nil, fmt.Errorf("private key not configured")
	}

	auth, err := bind.NewKeyedTransactorWithChainID(c.PrivateKey, c.ChainID)
	if err != nil {
		return nil, fmt.Errorf("failed to create transactor: %w", err)
	}

	// Get nonce
	publicKey := c.PrivateKey.Public()
	publicKeyECDSA, ok := publicKey.(*ecdsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("error casting public key to ECDSA")
	}

	fromAddress := crypto.PubkeyToAddress(*publicKeyECDSA)
	nonce, err := c.EthClient.PendingNonceAt(ctx, fromAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to get nonce: %w", err)
	}

	auth.Nonce = big.NewInt(int64(nonce))
	auth.Value = big.NewInt(0)
	auth.GasLimit = uint64(3000000)

	// Get gas price
	gasPrice, err := c.EthClient.SuggestGasPrice(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get gas price: %w", err)
	}
	auth.GasPrice = gasPrice

	return auth, nil
}

// Close closes the client connection
func (c *Client) Close() {
	c.EthClient.Close()
}
