# services/email_service.py - Email Service for Public Auth
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from jinja2 import Template

class EmailService:
    """
    Email service for sending authentication emails.
    Supports both SMTP and future integrations (SendGrid, etc.)
    """
    
    def __init__(self):
        self.smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_username = os.getenv("SMTP_USERNAME")
        self.smtp_password = os.getenv("SMTP_PASSWORD")
        self.from_email = os.getenv("FROM_EMAIL", self.smtp_username)
        self.from_name = os.getenv("FROM_NAME", "Auxein Regional Intelligence")
        self.send_emails = os.getenv("SEND_EMAILS", "false").lower() == "true"
        self.frontend_url = os.getenv("http://localhost:5173", "https://insights.auxein.co.nz")
    
    def send_email(
        self, 
        to_email: str, 
        subject: str, 
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """
        Send an email via SMTP.
        
        Args:
            to_email: Recipient email address
            subject: Email subject
            html_content: HTML version of email
            text_content: Plain text version (optional, auto-generated if not provided)
        
        Returns:
            True if sent successfully, False otherwise
        """
        # If sending is disabled, just log and return
        if not self.send_emails:
            print(f"""
            ========================================
            EMAIL (Not Sent - SEND_EMAILS=false)
            ========================================
            To: {to_email}
            Subject: {subject}
            
            {text_content or 'See HTML content'}
            ========================================
            """)
            return True
        
        try:
            # Create message
            message = MIMEMultipart('alternative')
            message['Subject'] = subject
            message['From'] = f"{self.from_name} <{self.from_email}>"
            message['To'] = to_email
            
            # Add plain text version (fallback)
            if text_content:
                text_part = MIMEText(text_content, 'plain')
                message.attach(text_part)
            
            # Add HTML version
            html_part = MIMEText(html_content, 'html')
            message.attach(html_part)
            
            # Send via SMTP
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.send_message(message)
            
            print(f"✅ Email sent successfully to {to_email}")
            return True
        
        except Exception as e:
            print(f"❌ Failed to send email to {to_email}: {str(e)}")
            return False
    
    def send_verification_email(self, email: str, token: str, name: str) -> bool:
        """
        Send email verification email.
        
        Args:
            email: User's email address
            token: Verification token
            name: User's first name
        
        Returns:
            True if sent successfully
        """
        verification_link = f"{self.frontend_url}/verify?token={token}"
        
        subject = "Verify your Auxein Regional Intelligence account"
        
        # Plain text version
        text_content = f"""
Hi {name},

Welcome to Auxein Regional Intelligence!

Please verify your email address by clicking the link below:
{verification_link}

This link will expire in 24 hours.

If you didn't create this account, please ignore this email.

Best regards,
The Auxein Team

---
Auxein Regional Intelligence
Climate intelligence for New Zealand wine regions
https://auxein.co.nz
        """
        
        # HTML version
        html_content = get_verification_email_template(name, verification_link)
        
        return self.send_email(email, subject, html_content, text_content)
    
    def send_password_reset_email(self, email: str, token: str, name: str) -> bool:
        """
        Send password reset email.
        
        Args:
            email: User's email address
            token: Reset token
            name: User's first name
        
        Returns:
            True if sent successfully
        """
        reset_link = f"{self.frontend_url}/reset-password?token={token}"
        
        subject = "Reset your Auxein Regional Intelligence password"
        
        # Plain text version
        text_content = f"""
Hi {name},

We received a request to reset your password for Auxein Regional Intelligence.

Reset your password by clicking the link below:
{reset_link}

This link will expire in 1 hour.

If you didn't request this password reset, please ignore this email. Your password will remain unchanged.

Best regards,
The Auxein Team

---
Auxein Regional Intelligence
Climate intelligence for New Zealand wine regions
https://auxein.co.nz
        """
        
        # HTML version
        html_content = get_password_reset_email_template(name, reset_link)
        
        return self.send_email(email, subject, html_content, text_content)
    
    def send_welcome_email(self, email: str, name: str) -> bool:
        """
        Send welcome email after verification (optional).
        
        Args:
            email: User's email address
            name: User's first name
        
        Returns:
            True if sent successfully
        """
        subject = "Welcome to Auxein Regional Intelligence!"
        
        # Plain text version
        text_content = f"""
Hi {name},

Welcome to Auxein Regional Intelligence!

Your email has been verified and your account is now active. You can now explore:

• Interactive climate maps for New Zealand wine regions
• Historical climate data and trends
• Growing degree days and viticultural metrics
• Regional climate comparisons

Start exploring: {self.frontend_url}

Need vineyard-specific insights? Check out our premium Auxein Insights platform for 
detailed climate analysis, risk management, and comprehensive vineyard management tools.

Learn more: https://auxein.co.nz/insights

Best regards,
The Auxein Team

---
Auxein Regional Intelligence
Climate intelligence for New Zealand wine regions
https://auxein.co.nz
        """
        
        # HTML version
        html_content = get_welcome_email_template(name, self.frontend_url)
        
        return self.send_email(email, subject, html_content, text_content)


# ============================================
# EMAIL TEMPLATES (HTML)
# ============================================

def get_verification_email_template(name: str, verification_link: str) -> str:
    """Generate HTML template for verification email"""
    template = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 30px 40px; background: linear-gradient(135deg, #446145 0%, #5B6830 100%); text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Auxein Insights</h1>
                            <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px;">Climate Intelligence for New Zealand Wine Regions</p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 20px 0; color: #2F2F2F; font-size: 24px;">Hi {{ name }},</h2>
                            
                            <p style="margin: 0 0 20px 0; color: #505050; font-size: 16px; line-height: 1.6;">
                                Welcome to Auxein Insights! We're excited to have you join our community of wine professionals and enthusiasts.
                            </p>
                            
                            <p style="margin: 0 0 30px 0; color: #505050; font-size: 16px; line-height: 1.6;">
                                Please verify your email address by clicking the button below:
                            </p>
                            
                            <!-- Button -->
                            <table role="presentation" style="margin: 0 auto;">
                                <tr>
                                    <td style="border-radius: 6px; background-color: #D1583B;">
                                        <a href="{{ verification_link }}" target="_blank" style="display: inline-block; padding: 16px 40px; font-size: 16px; color: #ffffff; text-decoration: none; font-weight: bold;">
                                            Verify Email Address
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="margin: 30px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
                                Or copy and paste this link into your browser:<br>
                                <a href="{{ verification_link }}" style="color: #5B6830; word-break: break-all;">{{ verification_link }}</a>
                            </p>
                            
                            <p style="margin: 30px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
                                This link will expire in 24 hours.
                            </p>
                            
                            <p style="margin: 20px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
                                If you didn't create this account, please ignore this email.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; background-color: #f8f9fa; border-top: 1px solid #e0e0e0;">
                            <p style="margin: 0 0 10px 0; color: #888888; font-size: 14px;">
                                Best regards,<br>
                                <strong style="color: #5B6830;">The Auxein Team</strong>
                            </p>
                            <p style="margin: 20px 0 0 0; color: #888888; font-size: 12px;">
                                Auxein Limited<br>
                                <a href="https://auxein.co.nz" style="color: #5B6830; text-decoration: none;">auxein.co.nz</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    """
    
    return Template(template).render(name=name, verification_link=verification_link)


def get_password_reset_email_template(name: str, reset_link: str) -> str:
    """Generate HTML template for password reset email"""
    template = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 30px 40px; background: linear-gradient(135deg, #446145 0%, #5B6830 100%); text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Auxein Insights</h1>
                            <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px;">Climate Intelligence for New Zealand Wine Regions</p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 20px 0; color: #2F2F2F; font-size: 24px;">Hi {{ name }},</h2>
                            
                            <p style="margin: 0 0 20px 0; color: #505050; font-size: 16px; line-height: 1.6;">
                                We received a request to reset your password for Auxein Insights.
                            </p>
                            
                            <p style="margin: 0 0 30px 0; color: #505050; font-size: 16px; line-height: 1.6;">
                                Click the button below to reset your password:
                            </p>
                            
                            <!-- Button -->
                            <table role="presentation" style="margin: 0 auto;">
                                <tr>
                                    <td style="border-radius: 6px; background-color: #D1583B;">
                                        <a href="{{ reset_link }}" target="_blank" style="display: inline-block; padding: 16px 40px; font-size: 16px; color: #ffffff; text-decoration: none; font-weight: bold;">
                                            Reset Password
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="margin: 30px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
                                Or copy and paste this link into your browser:<br>
                                <a href="{{ reset_link }}" style="color: #5B6830; word-break: break-all;">{{ reset_link }}</a>
                            </p>
                            
                            <p style="margin: 30px 0 0 0; color: #D1583B; font-size: 14px; line-height: 1.6; font-weight: bold;">
                                ⚠️ This link will expire in 1 hour.
                            </p>
                            
                            <p style="margin: 20px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
                                If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; background-color: #f8f9fa; border-top: 1px solid #e0e0e0;">
                            <p style="margin: 0 0 10px 0; color: #888888; font-size: 14px;">
                                Best regards,<br>
                                <strong style="color: #5B6830;">The Auxein Team</strong>
                            </p>
                            <p style="margin: 20px 0 0 0; color: #888888; font-size: 12px;">
                                Auxein Limited<br>
                                <a href="https://auxein.co.nz" style="color: #5B6830; text-decoration: none;">auxein.co.nz</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    """
    
    return Template(template).render(name=name, reset_link=reset_link)


def get_welcome_email_template(name: str, frontend_url: str) -> str:
    """Generate HTML template for welcome email"""
    template = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Auxein</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 30px 40px; background: linear-gradient(135deg, #446145 0%, #5B6830 100%); text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Welcome to Auxein</h1>
                            <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px;">Your account is now active</p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 20px 0; color: #2F2F2F; font-size: 24px;">Hi {{ name }},</h2>
                            
                            <p style="margin: 0 0 20px 0; color: #505050; font-size: 16px; line-height: 1.6;">
                                Thank you for verifying your email. Your Auxein Insights, Viticultural Regional Intelligence account is now active.
                            </p>
                            
                            <h3 style="margin: 30px 0 15px 0; color: #5B6830; font-size: 18px;">What you can explore:</h3>
                            
                            <ul style="margin: 0 0 30px 0; padding-left: 20px; color: #505050; font-size: 16px; line-height: 1.8;">
                                <li>Interactive maps for New Zealand wine regions</li>
                                <li>Historical climate data and long-term projections</li>
                                <li>Viticultural metrics including phenology and disease risk</li>
                                <li>Regional climate comparisons and analysis</li>
                            </ul>
                            
                            <!-- Button -->
                            <table role="presentation" style="margin: 0 auto 30px auto;">
                                <tr>
                                    <td style="border-radius: 6px; background-color: #5B6830;">
                                        <a href="{{ frontend_url }}" target="_blank" style="display: inline-block; padding: 16px 40px; font-size: 16px; color: #ffffff; text-decoration: none; font-weight: bold;">
                                            Start Exploring
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- Premium CTA -->
                            <div style="margin: 30px 0 0 0; padding: 20px; background-color: #FDF6E3; border-left: 4px solid #D1583B; border-radius: 6px;">
                                <h4 style="margin: 0 0 10px 0; color: #5B6830; font-size: 16px;">Need Vineyard-Specific Insights?</h4>
                                <p style="margin: 0 0 15px 0; color: #505050; font-size: 14px; line-height: 1.6;">
                                    Our Auxein Insights management platform offers vineyard specific climate analysis, risk management, and comprehensive vineyard management tools.
                                </p>
                                <a href="https://auxein.co.nz/" style="color: #D1583B; font-weight: bold; text-decoration: none;">
                                    Learn More →
                                </a>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; background-color: #f8f9fa; border-top: 1px solid #e0e0e0;">
                            <p style="margin: 0 0 10px 0; color: #888888; font-size: 14px;">
                                Best regards,<br>
                                <strong style="color: #5B6830;">The Auxein Team</strong>
                            </p>
                            <p style="margin: 20px 0 0 0; color: #888888; font-size: 12px;">
                                Auxein Limited<br>
                                <a href="https://auxein.co.nz" style="color: #5B6830; text-decoration: none;">auxein.co.nz</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    """
    
    return Template(template).render(name=name, frontend_url=frontend_url)


# Create singleton instance
email_service = EmailService()