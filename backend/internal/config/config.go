package config

import (
	"os"
)

type Config struct {
	// Server
	Port string

	// Database
	DatabaseURL string

	// BSC Chain (Campaigns + KGST)
	BSCRPCUrl      string
	BSCFactoryAddr string
	BSCImplAddr    string
	BSCKGSTAddr    string
	BSCChainID     string

	// Polygon Chain (Governance)
	PolygonRPCUrl   string
	PolygonGovToken string
	PolygonDAO      string
	PolygonRegistry string
	PolygonChainID  string

	// Legacy single-chain (kept for backward compat)
	RPCUrl                string
	FactoryAddress        string
	ImplementationAddress string
	ChainID               string
	PrivateKey            string

	// Redis
	RedisURL string

	// JWT
	JWTSecret string
}

func Load() *Config {
	return &Config{
		Port:        getEnv("PORT", "8080"),
		DatabaseURL: getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/crowdfunding?sslmode=disable"),

		// BSC (campaigns)
		BSCRPCUrl:      getEnv("BSC_RPC_URL", "https://data-seed-prebsc-1-s1.binance.org:8545/"),
		BSCFactoryAddr: getEnv("BSC_FACTORY_ADDRESS", "0xf867D4B0768558B58Da7e87b73BE3b341adC2053"),
		BSCImplAddr:    getEnv("BSC_IMPL_ADDRESS", "0x329689BDa0286dE58E2339f8783F8400bfe435e1"),
		BSCKGSTAddr:    getEnv("BSC_KGST_ADDRESS", "0x1523a1328E35782eBe096B1d12BBd9d302f3406C"),
		BSCChainID:     getEnv("BSC_CHAIN_ID", "97"),

		// Polygon (governance)
		PolygonRPCUrl:   getEnv("POLYGON_RPC_URL", "https://rpc-amoy.polygon.technology/"),
		PolygonGovToken: getEnv("POLYGON_GOV_TOKEN", ""),
		PolygonDAO:      getEnv("POLYGON_DAO", ""),
		PolygonRegistry: getEnv("POLYGON_REGISTRY", ""),
		PolygonChainID:  getEnv("POLYGON_CHAIN_ID", "80002"),

		// Legacy (backward compat — points to BSC now)
		RPCUrl:                getEnv("RPC_URL", getEnv("BSC_RPC_URL", "https://data-seed-prebsc-1-s1.binance.org:8545/")),
		FactoryAddress:        getEnv("FACTORY_ADDRESS", getEnv("BSC_FACTORY_ADDRESS", "0xf867D4B0768558B58Da7e87b73BE3b341adC2053")),
		ImplementationAddress: getEnv("IMPLEMENTATION_ADDRESS", getEnv("BSC_IMPL_ADDRESS", "0x329689BDa0286dE58E2339f8783F8400bfe435e1")),
		ChainID:               getEnv("CHAIN_ID", getEnv("BSC_CHAIN_ID", "97")),
		PrivateKey:            getEnv("PRIVATE_KEY", ""),
		RedisURL:              getEnv("REDIS_URL", "redis://localhost:6379"),
		JWTSecret:             getEnv("JWT_SECRET", "your-secret-key-change-in-production"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
