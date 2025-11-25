package config

import (
	"os"
)

type Config struct {
	// Server
	Port string

	// Database
	DatabaseURL string

	// Blockchain
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
		Port:                  getEnv("PORT", "8080"),
		DatabaseURL:           getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/crowdfunding?sslmode=disable"),
		RPCUrl:                getEnv("RPC_URL", "https://rpc-amoy.polygon.technology/"),
		FactoryAddress:        getEnv("FACTORY_ADDRESS", "0x94B09c15E4E8f96D23883E1b24fD872EA6e06EF0"),
		ImplementationAddress: getEnv("IMPLEMENTATION_ADDRESS", "0x8C47384c12e563D2B19ff7bc7C205602A1c62Bf3"),
		ChainID:               getEnv("CHAIN_ID", "80002"),
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
