# backend/services/email_service.py - Unified Email Service for All Apps
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from jinja2 import Template
import logging

logger = logging.getLogger(__name__)

class UnifiedEmailService:
    """
    Unified email service that handles emails for:
    - Regional Intelligence (Public app - port 5174)
    - Insights Pro (Main app - port 5173)
    - Contractor Portal (if needed)
    """
    
    def __init__(self):
        # SMTP Configuration (shared across all apps)
        self.smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_username = os.getenv("SMTP_USERNAME")
        self.smtp_password = os.getenv("SMTP_PASSWORD")
        self.from_email = os.getenv("FROM_EMAIL", self.smtp_username)
        self.from_name = os.getenv("FROM_NAME", "Auxein")
        self.send_emails = os.getenv("SEND_EMAILS", "false").lower() == "true"
        
        # App-specific URLs
        self.regional_intelligence_url = os.getenv(
            "EMAIL_VERIFICATION_BASE_URL",
            os.getenv("REGIONAL_INTELLIGENCE_URL", "http://localhost:5174")
        )
        self.insights_pro_url = os.getenv("INSIGHTS_PRO_URL", "http://localhost:5173")
        
        logger.info(f"Email Service initialized:")
        logger.info(f"  - Regional Intelligence: {self.regional_intelligence_url}")
        logger.info(f"  - Insights Pro: {self.insights_pro_url}")
        logger.info(f"  - Send emails: {self.send_emails}")
    
    def _send_email(
        self, 
        to_email: str, 
        subject: str, 
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """Internal method to send email"""
        
        if not self.send_emails:
            # Development mode - just log
            logger.info(f"\n{'='*60}")
            logger.info(f"[DEV MODE] Email would be sent to: {to_email}")
            logger.info(f"Subject: {subject}")
            logger.info(f"From: {self.from_name} <{self.from_email}>")
            logger.info(f"{'='*60}\n")
            print(f"\n📧 [DEV] Email to {to_email}: {subject}")
            return True
        
        try:
            # Create message
            message = MIMEMultipart('alternative')
            message['Subject'] = subject
            message['From'] = f"{self.from_name} <{self.from_email}>"
            message['To'] = to_email
            
            # Add text and HTML parts
            if text_content:
                part1 = MIMEText(text_content, 'plain')
                message.attach(part1)
            
            part2 = MIMEText(html_content, 'html')
            message.attach(part2)
            
            # Send email
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.sendmail(self.from_email, to_email, message.as_string())
            
            logger.info(f"✅ Email sent successfully to {to_email}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to send email to {to_email}: {str(e)}")
            return False
    
    # ============================================
    # REGIONAL INTELLIGENCE (PUBLIC) EMAILS
    # ============================================
    
    def send_public_verification_email(self, email: str, token: str, name: str = "there"):
        """Send email verification for Regional Intelligence public users"""
        verification_url = f"{self.regional_intelligence_url}?token={token}"
        
        subject = "Verify Your Auxein Regional Intelligence Account"
        
        html_content = self._get_public_verification_template(name, verification_url)
        text_content = f"""
Hi {name},

Welcome to Auxein Regional Intelligence!

Please verify your email by clicking: {verification_url}

This link expires in 24 hours.

Best regards,
The Auxein Team
        """
        
        return self._send_email(email, subject, html_content, text_content)
    
    def send_public_password_reset_email(self, email: str, token: str, name: str = "there"):
        """Send password reset for Regional Intelligence"""
        reset_url = f"{self.regional_intelligence_url}/reset-password?token={token}"
        
        subject = "Reset Your Auxein Regional Intelligence Password"
        
        html_content = self._get_public_reset_template(name, reset_url)
        text_content = f"""
Hi {name},

Reset your password: {reset_url}

This link expires in 1 hour.

Best regards,
The Auxein Team
        """
        
        return self._send_email(email, subject, html_content, text_content)
    
    def send_public_welcome_email(self, email: str, name: str = "there"):
        """Send welcome email for Regional Intelligence"""
        subject = "Welcome to Auxein Regional Intelligence!"
        
        html_content = self._get_public_welcome_template(name)
        text_content = f"""
Hi {name},

Welcome to Auxein Regional Intelligence!

Start exploring: {self.regional_intelligence_url}

Best regards,
The Auxein Team
        """
        
        return self._send_email(email, subject, html_content, text_content)
    
    # ============================================
    # INSIGHTS PRO (MAIN APP) EMAILS
    # ============================================
    
    def send_pro_user_invitation(self, email: str, invite_token: str, company_name: str):
        """Send user invitation for Insights Pro"""
        invite_url = f"{self.insights_pro_url}/accept-invitation?token={invite_token}"
        
        subject = f"You've been invited to join {company_name} on Auxein Insights"
        
        html_content = self._get_pro_invitation_template(company_name, invite_url)
        text_content = f"""
You've been invited to join {company_name} on Auxein Insights Pro.

Accept invitation: {invite_url}

Best regards,
The Auxein Team
        """
        
        return self._send_email(email, subject, html_content, text_content)
    
    def send_pro_contractor_verification(self, email: str, token: str, contractor_name: str):
        """Send contractor verification for Insights Pro"""
        verification_url = f"{self.insights_pro_url}/contractor/verify-email?token={token}"
        
        subject = "Verify Your Contractor Account - Auxein Insights"
        
        html_content = self._get_contractor_verification_template(contractor_name, verification_url)
        text_content = f"""
Hi {contractor_name},

Verify your contractor account: {verification_url}

Best regards,
The Auxein Team
        """
        
        return self._send_email(email, subject, html_content, text_content)
    
    # ============================================
    # COMMON TEMPLATES
    # ============================================
    
    def _get_email_header_footer(self, content: str) -> str:
        """Wrap content in standard email structure"""
        return f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                {content}
            </td>
        </tr>
    </table>
</body>
</html>
        """
    
    def _get_public_verification_template(self, name: str, verification_url: str) -> str:
        """Template for Regional Intelligence verification"""
        content = f"""
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px;">
    <tr>
        <td style="padding: 40px; background: linear-gradient(135deg, #446145 0%, #5B6830 100%); border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 28px;">Auxein Regional Intelligence</h1>
        </td>
    </tr>
    <tr>
        <td style="padding: 40px;">
            <h2 style="margin: 0 0 20px 0; color: #2F2F2F;">Welcome, {name}!</h2>
            <p style="margin: 0 0 20px 0; color: #505050; font-size: 16px; line-height: 1.6;">
                Thank you for creating an account. Please verify your email address to get started.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                    <td align="center" style="padding: 20px 0;">
                        <a href="{verification_url}" style="display: inline-block; padding: 16px 40px; background-color: #D1583B; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">Verify Email Address</a>
                    </td>
                </tr>
            </table>
            <p style="margin: 20px 0 0 0; color: #999999; font-size: 13px;">This link expires in 24 hours.</p>
        </td>
    </tr>
    <tr>
        <td style="padding: 30px; background-color: #f8f9fa; text-align: center;">
            <p style="margin: 0; color: #999999; font-size: 12px;">© 2025 Auxein Limited</p>
        </td>
    </tr>
</table>
        """
        return self._get_email_header_footer(content)
    
    def _get_public_reset_template(self, name: str, reset_url: str) -> str:
        """Template for Regional Intelligence password reset"""
        content = f"""
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px;">
    <tr>
        <td style="padding: 40px; background: linear-gradient(135deg, #446145 0%, #5B6830 100%); border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 28px;">Password Reset</h1>
        </td>
    </tr>
    <tr>
        <td style="padding: 40px;">
            <h2 style="margin: 0 0 20px 0; color: #2F2F2F;">Hi {name},</h2>
            <p style="margin: 0 0 20px 0; color: #505050; font-size: 16px;">
                Click the button below to reset your password.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                    <td align="center" style="padding: 20px 0;">
                        <a href="{reset_url}" style="display: inline-block; padding: 16px 40px; background-color: #D1583B; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">Reset Password</a>
                    </td>
                </tr>
            </table>
            <p style="margin: 20px 0 0 0; color: #D1583B; font-size: 14px;">⚠️ This link expires in 1 hour.</p>
        </td>
    </tr>
    <tr>
        <td style="padding: 30px; background-color: #f8f9fa; text-align: center;">
            <p style="margin: 0; color: #999999; font-size: 12px;">© 2025 Auxein Limited</p>
        </td>
    </tr>
</table>
        """
        return self._get_email_header_footer(content)
    
    def _get_public_welcome_template(self, name: str) -> str:
        """Template for Regional Intelligence welcome email"""
        content = f"""
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px;">
    <tr>
        <td style="padding: 40px; background: linear-gradient(135deg, #446145 0%, #5B6830 100%); border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 28px;">Welcome to Auxein</h1>
        </td>
    </tr>
    <tr>
        <td style="padding: 40px;">
            <h2 style="margin: 0 0 20px 0; color: #2F2F2F;">Hi {name}!</h2>
            <p style="margin: 0 0 20px 0; color: #505050; font-size: 16px;">
                You're all set to explore New Zealand's wine regions, and have direct insight to historical, and projected climate with Auxein's climate intelligence.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                    <td align="center" style="padding: 20px 0;">
                        <a href="{self.regional_intelligence_url}" style="display: inline-block; padding: 16px 40px; background-color: #5B6830; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">Start Exploring</a>
                    </td>
                </tr>
            </table>
            <div style="margin: 30px 0 0 0; padding: 20px; background-color: #FDF6E3; border: 2px solid #D1583B; border-radius: 8px;">
                <h3 style="margin: 0 0 10px 0; color: #2F2F2F;">Need Vineyard-Specific Insights?</h3>
                <p style="margin: 0; color: #505050; font-size: 14px;">
                    Check out Auxein Insights Pro for vineyard management tools.
                </p>
                <a href="{self.insights_pro_url}" style="color: #D1583B; font-weight: 600;">Learn More →</a>
            </div>
        </td>
    </tr>
    <tr>
        <td style="padding: 30px; background-color: #f8f9fa; text-align: center;">
            <p style="margin: 0; color: #999999; font-size: 12px;">© 2025 Auxein Limited</p>
        </td>
    </tr>
</table>
        """
        return self._get_email_header_footer(content)
    
    def _get_pro_invitation_template(self, company_name: str, invite_url: str) -> str:
        """Template for Insights Pro user invitation"""
        # Use templates from email_utils.py for Insights Pro
        # This maintains compatibility with existing Pro app
        content = f"""
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px;">
    <tr>
        <td style="padding: 40px; background: linear-gradient(135deg, #446145 0%, #5B6830 100%); border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 28px;">Auxein Insights Pro</h1>
        </td>
    </tr>
    <tr>
        <td style="padding: 40px;">
            <h2 style="margin: 0 0 20px 0; color: #2F2F2F;">You're Invited!</h2>
            <p style="margin: 0 0 20px 0; color: #505050; font-size: 16px;">
                {company_name} has invited you to join their team on Auxein Insights Pro.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                    <td align="center" style="padding: 20px 0;">
                        <a href="{invite_url}" style="display: inline-block; padding: 16px 40px; background-color: #5B6830; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">Accept Invitation</a>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
    <tr>
        <td style="padding: 30px; background-color: #f8f9fa; text-align: center;">
            <p style="margin: 0; color: #999999; font-size: 12px;">© 2025 Auxein Limited</p>
        </td>
    </tr>
</table>
        """
        return self._get_email_header_footer(content)
    
    def _get_contractor_verification_template(self, contractor_name: str, verification_url: str) -> str:
        """Template for contractor verification"""
        content = f"""
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px;">
    <tr>
        <td style="padding: 40px; background: linear-gradient(135deg, #446145 0%, #5B6830 100%); border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 28px;">Contractor Verification</h1>
        </td>
    </tr>
    <tr>
        <td style="padding: 40px;">
            <h2 style="margin: 0 0 20px 0; color: #2F2F2F;">Hi {contractor_name},</h2>
            <p style="margin: 0 0 20px 0; color: #505050; font-size: 16px;">
                Verify your contractor account to start accepting work.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                    <td align="center" style="padding: 20px 0;">
                        <a href="{verification_url}" style="display: inline-block; padding: 16px 40px; background-color: #5B6830; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">Verify Account</a>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
    <tr>
        <td style="padding: 30px; background-color: #f8f9fa; text-align: center;">
            <p style="margin: 0; color: #999999; font-size: 12px;">© 2025 Auxein Limited</p>
        </td>
    </tr>
</table>
        """
        return self._get_email_header_footer(content)


# Create singleton instance
email_service = UnifiedEmailService()