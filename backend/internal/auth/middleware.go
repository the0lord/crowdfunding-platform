package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// AuthMiddleware creates JWT authentication middleware
func AuthMiddleware(jwtService *JWTService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			return
		}

		// Extract token from "Bearer <token>"
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization format"})
			return
		}

		claims, err := jwtService.ValidateToken(parts[1])
		if err != nil {
			if err == ErrExpiredToken {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Token expired"})
				return
			}
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			return
		}

		// Set user info in context
		c.Set("wallet_address", claims.WalletAddress)
		c.Set("is_admin", claims.IsAdmin)
		c.Set("claims", claims)

		c.Next()
	}
}

// AdminMiddleware ensures the user is an admin
func AdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		isAdmin, exists := c.Get("is_admin")
		if !exists || !isAdmin.(bool) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Admin access required"})
			return
		}
		c.Next()
	}
}

// OptionalAuthMiddleware parses auth if present but doesn't require it
func OptionalAuthMiddleware(jwtService *JWTService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.Next()
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			c.Next()
			return
		}

		claims, err := jwtService.ValidateToken(parts[1])
		if err == nil {
			c.Set("wallet_address", claims.WalletAddress)
			c.Set("is_admin", claims.IsAdmin)
			c.Set("claims", claims)
		}

		c.Next()
	}
}

// GetWalletAddress extracts wallet address from context
func GetWalletAddress(c *gin.Context) string {
	addr, _ := c.Get("wallet_address")
	if addr == nil {
		return ""
	}
	return addr.(string)
}

// IsAdmin checks if the current user is an admin
func IsAdmin(c *gin.Context) bool {
	isAdmin, _ := c.Get("is_admin")
	if isAdmin == nil {
		return false
	}
	return isAdmin.(bool)
}
