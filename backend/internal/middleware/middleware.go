package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// CORS middleware for cross-origin requests
func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

// rateBucket tracks per-IP request counts
type rateBucket struct {
	tokens    float64
	lastCheck time.Time
}

// RateLimiter creates a token-bucket rate limiter (in-memory, per IP)
// Allows `rate` requests per second with a burst of `burst`
func RateLimiter() gin.HandlerFunc {
	const rate = 10.0  // 10 requests/sec sustained
	const burst = 30.0 // allow bursts up to 30

	var mu sync.Mutex
	visitors := make(map[string]*rateBucket)

	// Cleanup stale entries every 5 minutes
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			mu.Lock()
			for ip, b := range visitors {
				if time.Since(b.lastCheck) > 10*time.Minute {
					delete(visitors, ip)
				}
			}
			mu.Unlock()
		}
	}()

	return func(c *gin.Context) {
		ip := c.ClientIP()

		mu.Lock()
		b, exists := visitors[ip]
		if !exists {
			b = &rateBucket{tokens: burst, lastCheck: time.Now()}
			visitors[ip] = b
		}

		// Refill tokens based on elapsed time
		elapsed := time.Since(b.lastCheck).Seconds()
		b.tokens += elapsed * rate
		if b.tokens > burst {
			b.tokens = burst
		}
		b.lastCheck = time.Now()

		if b.tokens < 1 {
			mu.Unlock()
			c.Header("Retry-After", "1")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "Rate limit exceeded. Please try again shortly.",
			})
			return
		}

		b.tokens--
		mu.Unlock()

		c.Next()
	}
}

// Logger middleware for request logging
func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		raw := c.Request.URL.RawQuery

		c.Next()

		if raw != "" {
			path = path + "?" + raw
		}

		// Log request details
		duration := time.Since(start)
		c.Writer.Header().Set("X-Response-Time", duration.String())
	}
}
