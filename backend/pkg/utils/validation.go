package utils

import (
	"regexp"
	"strings"
)

// IsValidEthereumAddress checks if a string is a valid Ethereum address
func IsValidEthereumAddress(address string) bool {
	re := regexp.MustCompile("^0x[0-9a-fA-F]{40}$")
	return re.MatchString(address)
}

// NormalizeAddress converts address to lowercase checksum
func NormalizeAddress(address string) string {
	return strings.ToLower(address)
}

// IsValidTransactionHash checks if a string is a valid tx hash
func IsValidTransactionHash(hash string) bool {
	re := regexp.MustCompile("^0x[0-9a-fA-F]{64}$")
	return re.MatchString(hash)
}
