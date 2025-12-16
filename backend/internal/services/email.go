package services

import (
	"bytes"
	"fmt"
	"html/template"
	"net/smtp"
	"os"
)

// EmailConfig holds email configuration
type EmailConfig struct {
	SMTPHost    string
	SMTPPort    string
	Username    string
	Password    string
	FromAddress string
	FromName    string
}

// EmailService handles sending emails
type EmailService struct {
	config EmailConfig
}

// NewEmailService creates a new email service
func NewEmailService() *EmailService {
	return &EmailService{
		config: EmailConfig{
			SMTPHost:    getEnvOrDefault("SMTP_HOST", "smtp.gmail.com"),
			SMTPPort:    getEnvOrDefault("SMTP_PORT", "587"),
			Username:    os.Getenv("SMTP_USERNAME"),
			Password:    os.Getenv("SMTP_PASSWORD"),
			FromAddress: getEnvOrDefault("SMTP_FROM_ADDRESS", "noreply@crowdfunding.com"),
			FromName:    getEnvOrDefault("SMTP_FROM_NAME", "Crowdfunding Platform"),
		},
	}
}

func getEnvOrDefault(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

// IsConfigured checks if email service is properly configured
func (s *EmailService) IsConfigured() bool {
	return s.config.Username != "" && s.config.Password != ""
}

// SendEmail sends an email
func (s *EmailService) SendEmail(to, subject, body string) error {
	if !s.IsConfigured() {
		return fmt.Errorf("email service not configured")
	}

	auth := smtp.PlainAuth("", s.config.Username, s.config.Password, s.config.SMTPHost)

	msg := []byte(fmt.Sprintf(
		"From: %s <%s>\r\n"+
			"To: %s\r\n"+
			"Subject: %s\r\n"+
			"MIME-Version: 1.0\r\n"+
			"Content-Type: text/html; charset=\"UTF-8\"\r\n"+
			"\r\n"+
			"%s",
		s.config.FromName,
		s.config.FromAddress,
		to,
		subject,
		body,
	))

	addr := fmt.Sprintf("%s:%s", s.config.SMTPHost, s.config.SMTPPort)
	return smtp.SendMail(addr, auth, s.config.FromAddress, []string{to}, msg)
}

// Email Templates
const campaignApprovedTemplate = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Campaign Approved!</h1>
        </div>
        <div class="content">
            <p>Hello {{.FounderName}},</p>
            <p>Great news! Your campaign <strong>"{{.CampaignTitle}}"</strong> has been approved and is now live on the platform.</p>
            <p>Your campaign is now visible to all users and can start receiving contributions.</p>
            <a href="{{.CampaignURL}}" class="button">View Your Campaign</a>
            <p style="margin-top: 20px;">Best of luck with your fundraising!</p>
            <p>- The Crowdfunding Team</p>
        </div>
    </div>
</body>
</html>
`

const contributionReceivedTemplate = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 10px 10px; }
        .amount { font-size: 24px; color: #667eea; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>💰 New Contribution Received!</h1>
        </div>
        <div class="content">
            <p>Hello {{.FounderName}},</p>
            <p>Your campaign <strong>"{{.CampaignTitle}}"</strong> just received a contribution!</p>
            <p class="amount">{{.Amount}} POL</p>
            <p>From: {{.ContributorAddress}}</p>
            <p>Transaction: <a href="{{.TransactionURL}}">View on PolygonScan</a></p>
            <p style="margin-top: 20px;">Keep up the great work!</p>
            <p>- The Crowdfunding Team</p>
        </div>
    </div>
</body>
</html>
`

// SendCampaignApproved sends campaign approval notification
func (s *EmailService) SendCampaignApproved(to, founderName, campaignTitle, campaignURL string) error {
	tmpl, err := template.New("approved").Parse(campaignApprovedTemplate)
	if err != nil {
		return err
	}

	var body bytes.Buffer
	err = tmpl.Execute(&body, map[string]string{
		"FounderName":   founderName,
		"CampaignTitle": campaignTitle,
		"CampaignURL":   campaignURL,
	})
	if err != nil {
		return err
	}

	return s.SendEmail(to, "Your Campaign Has Been Approved! 🎉", body.String())
}

// SendContributionReceived sends contribution notification
func (s *EmailService) SendContributionReceived(to, founderName, campaignTitle, amount, contributorAddr, txURL string) error {
	tmpl, err := template.New("contribution").Parse(contributionReceivedTemplate)
	if err != nil {
		return err
	}

	var body bytes.Buffer
	err = tmpl.Execute(&body, map[string]string{
		"FounderName":        founderName,
		"CampaignTitle":      campaignTitle,
		"Amount":             amount,
		"ContributorAddress": contributorAddr,
		"TransactionURL":     txURL,
	})
	if err != nil {
		return err
	}

	return s.SendEmail(to, "New Contribution Received! 💰", body.String())
}
