package auth

import (
	"crypto/ecdsa"
	"errors"
	"fmt"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"
)

var (
	ErrInvalidSignature = errors.New("invalid signature")
	ErrAddressMismatch  = errors.New("recovered address does not match")
)

// SignatureVerifier handles Ethereum signature verification
type SignatureVerifier struct{}

// NewSignatureVerifier creates a new signature verifier
func NewSignatureVerifier() *SignatureVerifier {
	return &SignatureVerifier{}
}

// GenerateMessage creates the message to be signed
func (v *SignatureVerifier) GenerateMessage(walletAddress string, nonce string) string {
	return fmt.Sprintf(
		"Welcome to Crowdfunding Platform!\n\n"+
			"Please sign this message to authenticate.\n\n"+
			"Wallet: %s\n"+
			"Nonce: %s\n\n"+
			"This signature will not trigger any blockchain transaction.",
		walletAddress,
		nonce,
	)
}

// VerifySignature verifies an Ethereum signature and returns the signer address
func (v *SignatureVerifier) VerifySignature(message, signature, expectedAddress string) error {
	// Decode the signature
	sig, err := hexutil.Decode(signature)
	if err != nil {
		return fmt.Errorf("failed to decode signature: %w", err)
	}

	if len(sig) != 65 {
		return ErrInvalidSignature
	}

	// Ethereum signatures have v = 27 or 28, we need 0 or 1
	if sig[64] >= 27 {
		sig[64] -= 27
	}

	// Hash the message with Ethereum prefix
	prefixedMessage := fmt.Sprintf("\x19Ethereum Signed Message:\n%d%s", len(message), message)
	hash := crypto.Keccak256Hash([]byte(prefixedMessage))

	// Recover the public key
	pubKey, err := crypto.SigToPub(hash.Bytes(), sig)
	if err != nil {
		return fmt.Errorf("failed to recover public key: %w", err)
	}

	// Get address from public key
	recoveredAddress := crypto.PubkeyToAddress(*pubKey)
	expectedAddr := common.HexToAddress(expectedAddress)

	if !strings.EqualFold(recoveredAddress.Hex(), expectedAddr.Hex()) {
		return ErrAddressMismatch
	}

	return nil
}

// RecoverAddress recovers the address from a signature
func (v *SignatureVerifier) RecoverAddress(message, signature string) (string, error) {
	sig, err := hexutil.Decode(signature)
	if err != nil {
		return "", fmt.Errorf("failed to decode signature: %w", err)
	}

	if len(sig) != 65 {
		return "", ErrInvalidSignature
	}

	if sig[64] >= 27 {
		sig[64] -= 27
	}

	prefixedMessage := fmt.Sprintf("\x19Ethereum Signed Message:\n%d%s", len(message), message)
	hash := crypto.Keccak256Hash([]byte(prefixedMessage))

	pubKey, err := crypto.SigToPub(hash.Bytes(), sig)
	if err != nil {
		return "", err
	}

	return crypto.PubkeyToAddress(*pubKey).Hex(), nil
}

// PrivateKeyToAddress converts a private key to its address
func PrivateKeyToAddress(privateKey *ecdsa.PrivateKey) string {
	return crypto.PubkeyToAddress(privateKey.PublicKey).Hex()
}
