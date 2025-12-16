package services

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
)

// StorageConfig holds storage configuration
type StorageConfig struct {
	Provider     string // "s3", "local", or "ipfs"
	S3Bucket     string
	S3Region     string
	S3AccessKey  string
	S3SecretKey  string
	S3Endpoint   string // For S3-compatible services like MinIO
	LocalPath    string
	IPFSGateway  string
	MaxFileSize  int64
	AllowedTypes []string
}

// ImageService handles image uploads
type ImageService struct {
	config   StorageConfig
	s3Client *s3.Client
}

// NewImageService creates a new image service
func NewImageService() (*ImageService, error) {
	cfg := StorageConfig{
		Provider:     getEnvOrDefault("STORAGE_PROVIDER", "local"),
		S3Bucket:     os.Getenv("S3_BUCKET"),
		S3Region:     getEnvOrDefault("S3_REGION", "us-east-1"),
		S3AccessKey:  os.Getenv("S3_ACCESS_KEY"),
		S3SecretKey:  os.Getenv("S3_SECRET_KEY"),
		S3Endpoint:   os.Getenv("S3_ENDPOINT"),
		LocalPath:    getEnvOrDefault("UPLOAD_PATH", "./uploads"),
		IPFSGateway:  getEnvOrDefault("IPFS_GATEWAY", "https://ipfs.io/ipfs/"),
		MaxFileSize:  5 * 1024 * 1024, // 5MB
		AllowedTypes: []string{"image/jpeg", "image/png", "image/gif", "image/webp"},
	}

	service := &ImageService{config: cfg}

	if cfg.Provider == "s3" && cfg.S3AccessKey != "" {
		awsCfg, err := config.LoadDefaultConfig(context.Background(),
			config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
				cfg.S3AccessKey,
				cfg.S3SecretKey,
				"",
			)),
			config.WithRegion(cfg.S3Region),
		)
		if err != nil {
			return nil, fmt.Errorf("failed to load AWS config: %w", err)
		}

		opts := func(o *s3.Options) {
			if cfg.S3Endpoint != "" {
				o.BaseEndpoint = aws.String(cfg.S3Endpoint)
				o.UsePathStyle = true
			}
		}
		service.s3Client = s3.NewFromConfig(awsCfg, opts)
	}

	// Create local upload directory if using local storage
	if cfg.Provider == "local" {
		if err := os.MkdirAll(cfg.LocalPath, 0755); err != nil {
			return nil, fmt.Errorf("failed to create upload directory: %w", err)
		}
	}

	return service, nil
}

// ValidateFile validates file type and size
func (s *ImageService) ValidateFile(file *multipart.FileHeader) error {
	if file.Size > s.config.MaxFileSize {
		return fmt.Errorf("file too large: max %d bytes allowed", s.config.MaxFileSize)
	}

	contentType := file.Header.Get("Content-Type")
	allowed := false
	for _, t := range s.config.AllowedTypes {
		if contentType == t {
			allowed = true
			break
		}
	}
	if !allowed {
		return fmt.Errorf("file type not allowed: %s", contentType)
	}

	return nil
}

// Upload handles file upload and returns the URL
func (s *ImageService) Upload(file *multipart.FileHeader, folder string) (string, error) {
	if err := s.ValidateFile(file); err != nil {
		return "", err
	}

	// Generate unique filename
	ext := filepath.Ext(file.Filename)
	filename := fmt.Sprintf("%s_%s%s", folder, uuid.New().String(), ext)

	// Open the file
	src, err := file.Open()
	if err != nil {
		return "", fmt.Errorf("failed to open file: %w", err)
	}
	defer src.Close()

	switch s.config.Provider {
	case "s3":
		return s.uploadToS3(src, filename, file.Header.Get("Content-Type"))
	case "local":
		return s.uploadToLocal(src, filename)
	default:
		return s.uploadToLocal(src, filename)
	}
}

func (s *ImageService) uploadToS3(file io.Reader, filename, contentType string) (string, error) {
	if s.s3Client == nil {
		return "", fmt.Errorf("S3 client not configured")
	}

	// Read file into buffer
	buf := new(bytes.Buffer)
	if _, err := io.Copy(buf, file); err != nil {
		return "", fmt.Errorf("failed to read file: %w", err)
	}

	key := fmt.Sprintf("uploads/%s", filename)

	_, err := s.s3Client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket:      aws.String(s.config.S3Bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(buf.Bytes()),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", fmt.Errorf("failed to upload to S3: %w", err)
	}

	// Return public URL
	if s.config.S3Endpoint != "" {
		return fmt.Sprintf("%s/%s/%s", s.config.S3Endpoint, s.config.S3Bucket, key), nil
	}
	return fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", s.config.S3Bucket, s.config.S3Region, key), nil
}

func (s *ImageService) uploadToLocal(file io.Reader, filename string) (string, error) {
	// Create date-based subfolder
	dateFolder := time.Now().Format("2006/01/02")
	fullPath := filepath.Join(s.config.LocalPath, dateFolder)
	if err := os.MkdirAll(fullPath, 0755); err != nil {
		return "", fmt.Errorf("failed to create directory: %w", err)
	}

	filePath := filepath.Join(fullPath, filename)
	dst, err := os.Create(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to create file: %w", err)
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		return "", fmt.Errorf("failed to write file: %w", err)
	}

	// Return relative URL path
	return fmt.Sprintf("/uploads/%s/%s", dateFolder, filename), nil
}

// Delete removes a file
func (s *ImageService) Delete(url string) error {
	switch s.config.Provider {
	case "s3":
		// Extract key from URL
		key := strings.TrimPrefix(url, fmt.Sprintf("https://%s.s3.%s.amazonaws.com/", s.config.S3Bucket, s.config.S3Region))
		_, err := s.s3Client.DeleteObject(context.Background(), &s3.DeleteObjectInput{
			Bucket: aws.String(s.config.S3Bucket),
			Key:    aws.String(key),
		})
		return err
	case "local":
		path := filepath.Join(s.config.LocalPath, strings.TrimPrefix(url, "/uploads/"))
		return os.Remove(path)
	default:
		return nil
	}
}
