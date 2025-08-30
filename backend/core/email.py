# core/email.py - Email service for verification and password reset
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Optional
import logging
from core.config import settings

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        self.smtp_server = getattr(settings, 'SMTP_SERVER', 'smtp.gmail.com')
        self.smtp_port = getattr(settings, 'SMTP_PORT', 587)
        self.smtp_username = getattr(settings, 'SMTP_USERNAME', None)
        self.smtp_password = getattr(settings, 'SMTP_PASSWORD', None)
        self.from_email = getattr(settings, 'FROM_EMAIL', self.smtp_username)
        self.from_name = getattr(settings, 'FROM_NAME', 'Auxein Insights')
        self.frontend_url = getattr(settings, 'FRONTEND_URL', None)
    def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """Send an email"""
        
        if not self.smtp_username or not self.smtp_password:
            logger.warning("SMTP credentials not configured, skipping email send")
            return False
        
        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email
            
            # Add text and HTML content
            if text_content:
                text_part = MIMEText(text_content, 'plain')
                msg.attach(text_part)
            
            html_part = MIMEText(html_content, 'html')
            msg.attach(html_part)
            
            # Send email
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.send_message(msg)
            
            logger.info(f"Email sent successfully to {to_email}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False

# Initialize email service
email_service = EmailService()

def get_verification_email_template(username: str, verification_link: str) -> tuple[str, str]:
    """Get verification email template"""
    
    html_template = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Verify Your Email - Auxein Insights</title>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #2563eb; color: white; padding: 20px; text-align: center; }}
            .content {{ padding: 30px; background-color: #f9fafb; }}
            .button {{ 
                display: inline-block; 
                padding: 12px 24px; 
                background-color: #2563eb; 
                color: white; 
                text-decoration: none; 
                border-radius: 6px; 
                margin: 20px 0; 
            }}
            .footer {{ padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Welcome to Auxein Insights!</h1>
            </div>
            <div class="content">
                <h2>Hi {username},</h2>
                <p>Thank you for creating an account with Auxein Insights. To complete your registration, please verify your email address by clicking the button below:</p>
                
                <div style="text-align: center;">
                    <a href="{verification_link}" class="button">Verify Email Address</a>
                </div>
                
                <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #2563eb;">{verification_link}</p>
                
                <p>This verification link will expire in 24 hours for security reasons.</p>
                
                <p>If you didn't create an account with us, please ignore this email.</p>
                
                <p>Best regards,<br>The Auxein Insights Team</p>
            </div>
            <div class="footer">
                <p>© 2025 Auxein Insights. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    text_template = f"""
    Welcome to Auxein Insights!
    
    Hi {username},
    
    Thank you for creating an account with Auxein Insights. To complete your registration, please verify your email address by visiting this link:
    
    {verification_link}
    
    This verification link will expire in 24 hours for security reasons.
    
    If you didn't create an account with us, please ignore this email.
    
    Best regards,
    The Auxein Insights Team
    """
    
    return html_template, text_template

def get_password_reset_email_template(username: str, reset_link: str) -> tuple[str, str]:
    """Get password reset email template"""
    
    html_template = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Reset Your Password - Auxein Insights</title>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #dc2626; color: white; padding: 20px; text-align: center; }}
            .content {{ padding: 30px; background-color: #f9fafb; }}
            .button {{ 
                display: inline-block; 
                padding: 12px 24px; 
                background-color: #dc2626; 
                color: white; 
                text-decoration: none; 
                border-radius: 6px; 
                margin: 20px 0; 
            }}
            .footer {{ padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }}
            .warning {{ background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Password Reset Request</h1>
            </div>
            <div class="content">
                <h2>Hi {username},</h2>
                <p>We received a request to reset your password for your Auxein Insights account.</p>
                
                <div style="text-align: center;">
                    <a href="{reset_link}" class="button">Reset Password</a>
                </div>
                
                <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #dc2626;">{reset_link}</p>
                
                <div class="warning">
                    <strong>Important:</strong> This password reset link will expire in 24 hours for security reasons.
                </div>
                
                <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
                
                <p>For security reasons, we recommend:</p>
                <ul>
                    <li>Using a strong, unique password</li>
                    <li>Not sharing your password with anyone</li>
                    <li>Enabling two-factor authentication if available</li>
                </ul>
                
                <p>Best regards,<br>The Auxein Insights Team</p>
            </div>
            <div class="footer">
                <p>© 2025 Auxein Insights. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    text_template = f"""
    Password Reset Request - Auxein Insights
    
    Hi {username},
    
    We received a request to reset your password for your Auxein Insights account.
    
    To reset your password, please visit this link:
    {reset_link}
    
    This password reset link will expire in 24 hours for security reasons.
    
    If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
    
    For security reasons, we recommend using a strong, unique password and not sharing it with anyone.
    
    Best regards,
    The Auxein Insights Team
    """
    
    return html_template, text_template

def send_verification_email(email: str, username: str, verification_token: str) -> bool:
    """Send email verification email"""
    
    # Create verification link (you'll need to update this with your frontend URL)
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    verification_link = f"{frontend_url}/verify-email?token={verification_token}"
    
    html_content, text_content = get_verification_email_template(username, verification_link)
    
    return email_service.send_email(
        to_email=email,
        subject="Verify Your Email - Auxein Insights",
        html_content=html_content,
        text_content=text_content
    )

def send_password_reset_email(email: str, username: str, reset_token: str) -> bool:
    """Send password reset email"""
    
    # Create reset link (you'll need to update this with your frontend URL)
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    reset_link = f"{frontend_url}/reset-password?token={reset_token}"
    html_content, text_content = get_password_reset_email_template(username, reset_link)
    
    return email_service.send_email(
        to_email=email,
        subject="Reset Your Password - Auxein Insights",
        html_content=html_content,
        text_content=text_content
    )

def send_welcome_email(email: str, username: str, company_name: str) -> bool:
    """Send welcome email to new users"""
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Welcome to Auxein Insights</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #16a34a; color: white; padding: 20px; text-align: center;">
                <h1>Welcome to Auxein Insights!</h1>
            </div>
            <div style="padding: 30px; background-color: #f9fafb;">
                <h2>Hi {username},</h2>
                <p>Welcome to {company_name} on Auxein Insights! Your account has been successfully created and verified.</p>
                
                <p>You can now access all the features available with your subscription:</p>
                <ul>
                    <li>Manage vineyard blocks</li>
                    <li>Create and track observations</li>
                    <li>Assign and manage tasks</li>
                    <li>Generate reports and analytics</li>
                </ul>
                
                <p>If you need any help getting started, don't hesitate to reach out to our support team.</p>
                
                <p>Best regards,<br>The Auxein Insights Team</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return email_service.send_email(
        to_email=email,
        subject=f"Welcome to {company_name} - Auxein Insights",
        html_content=html_content
    )

# Update your existing core/email.py - Add this function

def send_admin_welcome_email(
    email: str, 
    username: str, 
    company_name: str, 
    password: str = None
) -> bool:
    """Send welcome email to new company admin with login credentials"""
    
    # Create login link
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    login_link = f"{frontend_url}/login"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Welcome to Auxein Insights - Admin Account Created</title>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #16a34a; color: white; padding: 20px; text-align: center; }}
            .content {{ padding: 30px; background-color: #f9fafb; }}
            .credentials {{ 
                background-color: #f3f4f6; 
                border: 2px solid #16a34a;
                padding: 20px; 
                border-radius: 8px; 
                margin: 20px 0;
                text-align: center;
            }}
            .button {{ 
                display: inline-block; 
                padding: 12px 24px; 
                background-color: #16a34a; 
                color: white; 
                text-decoration: none; 
                border-radius: 6px; 
                margin: 20px 0; 
                font-weight: bold;
            }}
            .security-note {{ 
                background-color: #fef2f2; 
                border-left: 4px solid #dc2626; 
                padding: 15px; 
                margin: 20px 0; 
            }}
            .footer {{ padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Welcome to Auxein Insights!</h1>
                <p>Your {company_name} admin account is ready</p>
            </div>
            <div class="content">
                <h2>Hi {username},</h2>
                
                <p>Congratulations! Your company <strong>{company_name}</strong> has been set up on Auxein Insights, and you've been designated as the company administrator.</p>
                
                <div class="credentials">
                    <h3>🔑 Your Login Credentials</h3>
                    <p><strong>Email:</strong> {email}</p>
                    <p><strong>Username:</strong> {username}</p>
                    {f'<p><strong>Password:</strong> <code style="background: #e5e7eb; padding: 4px 8px; border-radius: 4px; font-family: monospace;">{password}</code></p>' if password else '<p><strong>Password:</strong> As provided separately</p>'}
                </div>
                
                {f'''<div class="security-note">
                    <strong>🔒 Important:</strong> Please change your password after your first login for security.
                </div>''' if password else ''}
                
                <div style="text-align: center;">
                    <a href="{login_link}" class="button">Login to Your Account</a>
                </div>

                <p>Need help? Contact our support team at support@auxein.co.nz</p>
                
                <p>Welcome to the Auxein Insights community!</p>
                
                <p>Best regards,<br><strong>The Auxein Insights Team</strong></p>
            </div>
            <div class="footer">
                <p>© 2025 Auxein Insights. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    text_content = f"""
    Welcome to Auxein Insights - Admin Account Created
    
    Hi {username},
    
    Congratulations! Your company {company_name} has been set up on Auxein Insights, and you've been designated as the company administrator.
    
    Your Login Credentials:
    - Email: {email}
    - Username: {username}
    - Password: {password if password else 'As provided separately'}
    
    {'IMPORTANT: Please change your password after your first login for security.' if password else ''}
    
    Login here: {login_link}
    
    As an Administrator, you can:
    - Invite Team Members
    - Manage Vineyard Blocks
    - Track Observations
    - Assign Tasks
    - Generate Reports
    
    Need help? Contact support@auxein.co.nz
    
    Welcome to the Auxein Insights community!
    
    Best regards,
    The Auxein Insights Team
    """

    subject = f"Welcome to Auxein Insights - {company_name} Admin Account Ready!"
    
    return email_service.send_email(
        to_email=email,
        subject=subject,
        html_content=html_content,
        text_content=text_content
    )


def send_invitation_email(
    email: str,
    inviter_name: str,
    company_name: str,
    role: str,
    invitation_token: str,
    message: str = None,
    suggested_username: str = None,
    temporary_password: str = None  # Add this parameter
) -> bool:
    """Send invitation email with account setup instructions"""
    
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    invitation_link = f"{frontend_url}/accept-invitation?token={invitation_token}"
    login_link = f"{frontend_url}/login"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>You're Invited to Join {company_name} - Auxein Insights</title>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #3b82f6; color: white; padding: 20px; text-align: center; }}
            .content {{ padding: 30px; background-color: #f9fafb; }}
            .credentials {{ 
                background-color: #f3f4f6; 
                border: 2px solid #3b82f6;
                padding: 20px; 
                border-radius: 8px; 
                margin: 20px 0;
                text-align: center;
            }}
            .button {{ 
                display: inline-block; 
                padding: 12px 24px; 
                background-color: #3b82f6; 
                color: white; 
                text-decoration: none; 
                border-radius: 6px; 
                margin: 10px 5px; 
                font-weight: bold;
            }}
            .message-box {{ 
                background-color: #e0f2fe; 
                padding: 15px; 
                border-radius: 6px; 
                margin: 15px 0; 
                border-left: 4px solid #3b82f6;
            }}
            .security-note {{ 
                background-color: #fef2f2; 
                border-left: 4px solid #dc2626; 
                padding: 15px; 
                margin: 20px 0; 
                font-size: 14px;
            }}
            .footer {{ padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎉 You're Invited!</h1>
                <p>Join {company_name} on Auxein Insights</p>
            </div>
            <div class="content">
                <h2>Welcome to {company_name}!</h2>
                <p><strong>{inviter_name}</strong> has invited you to join <strong>{company_name}</strong> as a <strong>{role.title()}</strong>.</p>
                
                {f'<div class="message-box"><strong>Personal message from {inviter_name}:</strong><br>{message}</div>' if message else ''}
                
                <div class="credentials">
                    <h3>🔑 Your Account Details</h3>
                    <p><strong>Email:</strong> {email}</p>
                    {f'<p><strong>Suggested Username:</strong> {suggested_username}</p>' if suggested_username else ''}
                    {f'<p><strong>Temporary Password:</strong> <code style="background: #e5e7eb; padding: 4px 8px; border-radius: 4px; font-family: monospace;">{temporary_password}</code></p>' if temporary_password else ''}
                </div>
                
                <div style="text-align: center;">
                    <h3>Choose how to get started:</h3>
                    <a href="{invitation_link}" class="button">🚀 Complete Account Setup</a>
                    {f'<a href="{login_link}" class="button">🔑 Login Directly</a>' if temporary_password else ''}
                </div>
                
                {f'''<div class="security-note">
                    <strong>🔒 Security Reminder:</strong> Please change your password after your first login. You can customize your username and other profile settings during account setup.
                </div>''' if temporary_password else ''}
                
                <div style="margin: 20px 0; padding: 15px; background-color: #f0f9ff; border-radius: 6px;">
                    <h4>📋 Next Steps:</h4>
                    <ol style="margin: 0; padding-left: 20px;">
                        <li><strong>Complete Setup:</strong> Click "Complete Account Setup" to customize your profile</li>
                        {f'<li><strong>Or Login:</strong> Use the temporary credentials above to login directly</li>' if temporary_password else ''}
                        <li><strong>Explore:</strong> Access vineyard data, observations, and team tools</li>
                        <li><strong>Get Help:</strong> Contact support@auxein.co.nz if you need assistance</li>
                    </ol>
                </div>
                
                <p style="font-size: 14px; color: #6b7280;">This invitation will expire in 7 days. If you need a new invitation, please contact {inviter_name} or your system administrator.</p>
                
                <p>Welcome to the team!</p>
                
                <p>Best regards,<br><strong>The Auxein Insights Team</strong></p>
            </div>
            <div class="footer">
                <p>© 2025 Auxein Insights. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    text_content = f"""
    You're Invited to Join {company_name} - Auxein Insights
    
    Hi there!
    
    {inviter_name} has invited you to join {company_name} as a {role.title()}.
    
    {f'Personal message: {message}' if message else ''}
    
    Your Account Details:
    - Email: {email}
    {f'- Suggested Username: {suggested_username}' if suggested_username else ''}
    {f'- Temporary Password: {temporary_password}' if temporary_password else ''}
    
    Complete Account Setup: {invitation_link}
    {f'Or Login Directly: {login_link}' if temporary_password else ''}
    
    {f'SECURITY: Please change your password after first login.' if temporary_password else ''}
    
    This invitation expires in 7 days.
    
    Welcome to the team!
    
    Best regards,
    The Auxein Insights Team
    """

    subject = f"Welcome to {company_name} - Your Auxein Insights Invitation"
    
    return email_service.send_email(
        to_email=email,
        subject=subject,
        html_content=html_content,
        text_content=text_content
    )

def get_contractor_verification_email_template(contractor_name: str, verification_link: str) -> tuple[str, str]:
    """Get contractor verification email template"""
    
    html_template = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Verify Your Contractor Account - Auxein Insights</title>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #059669; color: white; padding: 20px; text-align: center; }}
            .content {{ padding: 30px; background-color: #f9fafb; }}
            .button {{ 
                display: inline-block; 
                padding: 12px 24px; 
                background-color: #059669; 
                color: white; 
                text-decoration: none; 
                border-radius: 6px; 
                margin: 20px 0; 
                font-weight: bold;
            }}
            .footer {{ padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }}
            .contractor-badge {{ 
                background-color: #d1fae5; 
                color: #065f46; 
                padding: 8px 16px; 
                border-radius: 20px; 
                font-size: 14px; 
                font-weight: bold;
                display: inline-block;
                margin: 15px 0;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🚀 Welcome to Auxein Insights!</h1>
                <div class="contractor-badge">Contractor Portal</div>
            </div>
            <div class="content">
                <h2>Hi {contractor_name},</h2>
                
                <p>Thank you for registering as a contractor with Auxein Insights! You're now part of New Zealand's leading vineyard management network.</p>
                
                <p>To complete your registration and start connecting with vineyard companies, please verify your email address by clicking the button below:</p>
                
                <div style="text-align: center;">
                    <a href="{verification_link}" class="button">Verify Email Address</a>
                </div>
                
                <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #059669; font-family: monospace; background: #f3f4f6; padding: 10px; border-radius: 4px;">{verification_link}</p>
                
                <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                    <strong>⏰ Important:</strong> This verification link will expire in 24 hours for security reasons.
                </div>
                
                <h3>🎯 What happens after verification?</h3>
                <ol>
                    <li><strong>Complete your profile</strong> - Add your specializations and equipment</li>
                    <li><strong>Upload documents</strong> - Share insurance certificates and certifications</li>
                    <li><strong>Connect with companies</strong> - Browse and request to work with vineyard companies</li>
                    <li><strong>Start earning</strong> - Accept assignments and build your reputation</li>
                </ol>
                
                <div style="background-color: #f0f9ff; padding: 20px; border-radius: 6px; margin: 20px 0;">
                    <h4>📱 Mobile App Coming Soon!</h4>
                    <p>The Auxein Insights mobile app will be your go-to tool for managing assignments, checking in at properties, and tracking your work on the go.</p>
                </div>
                
                <p>If you didn't create this contractor account, please ignore this email.</p>
                
                <p>Questions? Contact our contractor support team at contractors@auxein.co.nz</p>
                
                <p>Welcome to the network!</p>
                
                <p>Best regards,<br>
                <strong>The Auxein Insights Contractor Team</strong></p>
            </div>
            <div class="footer">
                <p>© 2025 Auxein Insights. All rights reserved.</p>
                <p>Contractor Support: contractors@auxein.co.nz</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    text_template = f"""
    Welcome to Auxein Insights - Contractor Portal
    
    Hi {contractor_name},
    
    Thank you for registering as a contractor with Auxein Insights! You're now part of New Zealand's leading vineyard management network.
    
    To complete your registration and start connecting with vineyard companies, please verify your email address by visiting this link:
    
    {verification_link}
    
    This verification link will expire in 24 hours for security reasons.
    
    What happens after verification?
    1. Complete your profile - Add your specializations and equipment
    2. Upload documents - Share insurance certificates and certifications
    3. Connect with companies - Browse and request to work with vineyard companies
    4. Start earning - Accept assignments and build your reputation
    
    Mobile App Coming Soon!
    The Auxein Insights mobile app will be your go-to tool for managing assignments, checking in at properties, and tracking your work on the go.
    
    If you didn't create this contractor account, please ignore this email.
    
    Questions? Contact our contractor support team at contractors@auxein.co.nz
    
    Welcome to the network!
    
    Best regards,
    The Auxein Insights Contractor Team
    
    ---
    © 2025 Auxein Insights. All rights reserved.
    Contractor Support: contractors@auxein.co.nz
    """
    
    return html_template, text_template

def get_contractor_welcome_email_template(contractor_name: str, business_name: str) -> tuple[str, str]:
    """Get contractor welcome email template (sent after email verification)"""
    
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    
    html_template = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Account Verified - Welcome to Auxein Insights</title>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #16a34a; color: white; padding: 20px; text-align: center; }}
            .content {{ padding: 30px; background-color: #f9fafb; }}
            .step-card {{ 
                background-color: white; 
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 20px; 
                margin: 15px 0;
            }}
            .step-number {{ 
                background-color: #16a34a; 
                color: white; 
                width: 30px; 
                height: 30px; 
                border-radius: 50%; 
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                margin-right: 15px;
            }}
            .footer {{ padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>✅ Email Verified Successfully!</h1>
                <p>Welcome to the Auxein Insights contractor network</p>
            </div>
            <div class="content">
                <h2>Congratulations {contractor_name}!</h2>
                
                <p>Your email has been verified and your contractor account for <strong>{business_name}</strong> is now active on Auxein Insights.</p>
                
                <h3>🚀 Next Steps to Get Started:</h3>
                
                <div class="step-card">
                    <div style="display: flex; align-items: flex-start;">
                        <div class="step-number">1</div>
                        <div>
                            <h4>Complete Your Profile</h4>
                            <p>Add your specializations, equipment, and service areas to help companies find you for the right jobs.</p>
                        </div>
                    </div>
                </div>
                
                <div class="step-card">
                    <div style="display: flex; align-items: flex-start;">
                        <div class="step-number">2</div>
                        <div>
                            <h4>Upload Verification Documents</h4>
                            <p>Upload your insurance certificates, certifications, and licenses to increase trust with potential clients.</p>
                        </div>
                    </div>
                </div>
                
                <div class="step-card">
                    <div style="display: flex; align-items: flex-start;">
                        <div class="step-number">3</div>
                        <div>
                            <h4>Connect with Companies</h4>
                            <p>Browse vineyard companies and send connection requests to start building your client network.</p>
                        </div>
                    </div>
                </div>
                
                <div class="step-card">
                    <div style="display: flex; align-items: flex-start;">
                        <div class="step-number">4</div>
                        <div>
                            <h4>Start Accepting Work</h4>
                            <p>Once connected, you'll receive work assignments and can start building your reputation on the platform.</p>
                        </div>
                    </div>
                </div>
                
                <div style="background-color: #f0f9ff; padding: 20px; border-radius: 6px; margin: 20px 0;">
                    <h4>💡 Pro Tips for Success:</h4>
                    <ul>
                        <li><strong>Complete profile</strong> - Contractors with complete profiles get 3x more work requests</li>
                        <li><strong>Upload quality photos</strong> - Show your equipment and previous work</li>
                        <li><strong>Maintain insurance</strong> - Keep your certificates current for continuous work eligibility</li>
                        <li><strong>Professional communication</strong> - Quick responses and clear updates build trust</li>
                    </ul>
                </div>
                
                <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
                    <strong>📱 Important:</strong> The mobile app is currently in development. For now, you can access everything through our web platform. You'll be notified when the mobile app is available!
                </div>
                
                <h3>🎯 What Makes Auxein Insights Different?</h3>
                <ul>
                    <li><strong>Fair Payment Terms</strong> - Transparent rates and timely payments</li>
                    <li><strong>Reputation System</strong> - Build your profile with verified reviews</li>
                    <li><strong>Biosecurity Compliance</strong> - Tools to maintain and track compliance</li>
                    <li><strong>Professional Network</strong> - Connect with quality vineyard operations</li>
                </ul>
                
                <h3>📞 Need Help?</h3>
                <p>Our contractor support team is here to help you succeed:</p>
                <ul>
                    <li><strong>Email:</strong> contractors@auxein.co.nz</li>
                    <li><strong>Phone:</strong> Available during business hours</li>
                    <li><strong>Help Center:</strong> Comprehensive guides and FAQs</li>
                </ul>
                
                <p>We're excited to have {business_name} as part of our contractor network!</p>
                
                <p>Best regards,<br>
                <strong>The Auxein Insights Contractor Team</strong></p>
            </div>
            <div class="footer">
                <p>© 2025 Auxein Insights. All rights reserved.</p>
                <p>Contractor Support: contractors@auxein.co.nz</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    text_template = f"""
    Email Verified Successfully - Welcome to Auxein Insights
    
    Congratulations {contractor_name}!
    
    Your email has been verified and your contractor account for {business_name} is now active on Auxein Insights.
    
    Next Steps to Get Started:
    
    1. Complete Your Profile
       Add your specializations, equipment, and service areas to help companies find you for the right jobs.
    
    2. Upload Verification Documents
       Upload your insurance certificates, certifications, and licenses to increase trust with potential clients.
    
    3. Connect with Companies
       Browse vineyard companies and send connection requests to start building your client network.
    
    4. Start Accepting Work
       Once connected, you'll receive work assignments and can start building your reputation on the platform.
    
    Pro Tips for Success:
    - Complete profile - Contractors with complete profiles get 3x more work requests
    - Upload quality photos - Show your equipment and previous work
    - Maintain insurance - Keep your certificates current for continuous work eligibility
    - Professional communication - Quick responses and clear updates build trust
    
    IMPORTANT: The mobile app is currently in development. For now, you can access everything through our web platform. You'll be notified when the mobile app is available!
    
    What Makes Auxein Insights Different?
    - Fair Payment Terms - Transparent rates and timely payments
    - Reputation System - Build your profile with verified reviews
    - Biosecurity Compliance - Tools to maintain and track compliance
    - Professional Network - Connect with quality vineyard operations
    
    Need Help?
    Our contractor support team is here to help you succeed:
    - Email: contractors@auxein.co.nz
    - Phone: Available during business hours
    - Help Center: Comprehensive guides and FAQs
    
    We're excited to have {business_name} as part of our contractor network!
    
    Best regards,
    The Auxein Insights Contractor Team
    
    ---
    © 2025 Auxein Insights. All rights reserved.
    Contractor Support: contractors@auxein.co.nz
    """
    
    return html_template, text_template

def send_contractor_verification_email(email: str, contractor_name: str, verification_token: str) -> bool:
    """Send contractor email verification email"""
    
    # Create verification link
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    verification_link = f"{frontend_url}/contractor/verify-email?token={verification_token}"
    
    html_content, text_content = get_contractor_verification_email_template(contractor_name, verification_link)
    
    return email_service.send_email(
        to_email=email,
        subject="Verify Your Contractor Account - Auxein Insights",
        html_content=html_content,
        text_content=text_content
    )

def send_contractor_welcome_email(email: str, contractor_name: str, business_name: str) -> bool:
    """Send welcome email to verified contractor"""
    
    html_content, text_content = get_contractor_welcome_email_template(contractor_name, business_name)
    
    return email_service.send_email(
        to_email=email,
        subject="Welcome to Auxein Insights - Your contractor account is ready!",
        html_content=html_content,
        text_content=text_content
    )