package middleware

import (
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// CORS middleware for cross-origin requests.
// Set ALLOWED_ORIGINS env var to a comma-separated list of allowed origins in production
// (e.g. "https://your-app.vercel.app"). Leave unset to allow all origins in development.
func CORS() gin.HandlerFunc {
	originSet := map[string]bool{}
	if env := os.Getenv("ALLOWED_ORIGINS"); env != "" {
		for _, o := range strings.Split(env, ",") {
			if o = strings.TrimSpace(o); o != "" {
				originSet[o] = true
			}
		}
	}

	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")

		if len(originSet) == 0 {
			// Development: allow all origins
			c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		} else if originSet[origin] {
			// Production: echo back the matched origin and set Vary so caches don't serve wrong CORS headers
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Vary", "Origin")
		}

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
