# core/email.py - Email service for verification and password reset
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Optional
import logging
from core.config import settings
from core.branding import Brand, GROW

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        self.smtp_server = getattr(settings, 'SMTP_SERVER', 'smtp.gmail.com')
        self.smtp_port = getattr(settings, 'SMTP_PORT', 587)
        self.smtp_username = getattr(settings, 'SMTP_USERNAME', None)
        self.smtp_password = getattr(settings, 'SMTP_PASSWORD', None)
        self.from_email = getattr(settings, 'FROM_EMAIL', self.smtp_username)
        # Falls back to "Auxein" so the From: header is brand-neutral when callers
        # don't pass a brand. Brand-aware sends override per-message via from_name.
        self.from_name = getattr(settings, 'FROM_NAME', 'Auxein')
        self.frontend_url = getattr(settings, 'FRONTEND_URL', None)
    def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
        brand: Optional[Brand] = None,
    ) -> bool:
        """Send an email. If brand is provided, the From: header uses the brand's
        from_name; otherwise falls back to the EmailService default (env FROM_NAME)."""

        if not self.smtp_username or not self.smtp_password:
            logger.warning("SMTP credentials not configured, skipping email send")
            return False

        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            from_display = brand.from_name if brand else self.from_name
            msg['From'] = f"{from_display} <{self.from_email}>"
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

def get_base_email_styles():
    """Get base CSS styles for all emails"""
    return """
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; 
            line-height: 1.6; 
            color: #2F2F2F; 
            background-color: #FDF6E3;
            margin: 0; 
            padding: 0;
        }
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(47, 47, 47, 0.1);
        }
        .header { 
            background-color: #5B6830; 
            color: #FDF6E3; 
            padding: 40px 30px; 
            text-align: center; 
            position: relative;
        }
        .header::before {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, #D1583B, #5B6830);
        }
        .logo {
            margin-bottom: 15px;
        }
        .content { 
            padding: 40px 30px; 
            background-color: #ffffff; 
        }
        .button { 
            display: inline-block; 
            padding: 16px 32px; 
            background: linear-gradient(135deg, #5B6830, #6B7840); 
            color: #FDF6E3; 
            text-decoration: none; 
            border-radius: 8px; 
            margin: 25px 0; 
            font-weight: 600;
            font-size: 16px;
            transition: all 0.3s ease;
            box-shadow: 0 2px 4px rgba(91, 104, 48, 0.3);
        }
        .button:hover {
            background: linear-gradient(135deg, #6B7840, #5B6830);
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(91, 104, 48, 0.4);
        }
        .accent-button {
            background: linear-gradient(135deg, #D1583B, #E16844);
        }
        .accent-button:hover {
            background: linear-gradient(135deg, #E16844, #D1583B);
        }
        .footer { 
            padding: 30px; 
            text-align: center; 
            background-color: rgba(253, 246, 227, 0.5);
            color: rgba(47, 47, 47, 0.6); 
            font-size: 14px; 
            border-top: 1px solid rgba(91, 104, 48, 0.1);
        }
        .highlight-box {
            background: linear-gradient(135deg, rgba(253, 246, 227, 0.8), rgba(253, 246, 227, 0.4));
            border-left: 4px solid #5B6830;
            padding: 20px;
            margin: 25px 0;
            border-radius: 0 8px 8px 0;
        }
        .warning-box {
            background: linear-gradient(135deg, rgba(209, 88, 59, 0.1), rgba(209, 88, 59, 0.05));
            border-left: 4px solid #D1583B;
            padding: 20px;
            margin: 25px 0;
            border-radius: 0 8px 8px 0;
        }
        .credentials-box {
            background: rgba(253, 246, 227, 0.6);
            border: 2px solid #5B6830;
            padding: 25px;
            border-radius: 8px;
            margin: 25px 0;
            text-align: center;
        }
        .step-card {
            background-color: #ffffff;
            border: 1px solid rgba(91, 104, 48, 0.2);
            border-radius: 8px;
            padding: 20px;
            margin: 15px 0;
            box-shadow: 0 2px 4px rgba(91, 104, 48, 0.1);
        }
        .step-number {
            background: linear-gradient(135deg, #5B6830, #6B7840);
            color: #FDF6E3;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            margin-right: 15px;
            font-size: 14px;
        }
        .contractor-badge {
            background: linear-gradient(135deg, rgba(91, 104, 48, 0.15), rgba(91, 104, 48, 0.1));
            color: #5B6830;
            padding: 10px 20px;
            border-radius: 25px;
            font-size: 14px;
            font-weight: bold;
            display: inline-block;
            margin: 15px 0;
            border: 1px solid rgba(91, 104, 48, 0.3);
        }
        .brand-accent { color: #D1583B; }
        .brand-primary { color: #5B6830; }
        .text-muted { color: rgba(47, 47, 47, 0.6); }
        h1 { color: #FDF6E3; margin: 0; font-size: 28px; font-weight: 600; }
        h2 { color: #5B6830; margin-top: 0; font-size: 24px; font-weight: 600; }
        h3 { color: #5B6830; font-size: 20px; font-weight: 600; }
        h4 { color: #2F2F2F; font-size: 16px; font-weight: 600; }
        a { color: #5B6830; text-decoration: none; }
        a:hover { color: #D1583B; text-decoration: underline; }
        code {
            background: rgba(253, 246, 227, 0.8);
            padding: 6px 10px;
            border-radius: 4px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 14px;
            color: #2F2F2F;
            border: 1px solid rgba(91, 104, 48, 0.2);
        }
        .link-box {
            background: rgba(253, 246, 227, 0.3);
            padding: 15px;
            border-radius: 6px;
            word-break: break-all;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 13px;
            color: #5B6830;
            border: 1px solid rgba(91, 104, 48, 0.2);
            margin: 15px 0;
        }
    </style>
    """



def get_app_badges_html(brand: Brand = GROW) -> str:
    """Centered App Store + Google Play download badges for branded emails.

    Returns "" when the brand has no store links configured, so callers can drop
    {get_app_badges_html(brand)} into any template unconditionally. Uses a table
    layout (not flexbox) and explicit img dimensions for email-client safety.
    Apple's badge is rendered at 40px tall; Google's at 48px so their cap-heights
    visually match (the Play badge carries more internal padding).
    """
    if not (brand.app_store_url and brand.play_store_url):
        return ""

    return f"""
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 25px auto 5px auto;">
        <tr>
            <td align="center" style="padding: 0 6px;">
                <a href="{brand.app_store_url}" target="_blank" style="text-decoration: none;">
                    <img src="{brand.app_store_badge_url}" alt="Download Auxein Grow on the App Store" height="40" width="119" style="height: 40px; width: 119px; border: 0; display: block;">
                </a>
            </td>
            <td align="center" style="padding: 0 6px;">
                <a href="{brand.play_store_url}" target="_blank" style="text-decoration: none;">
                    <img src="{brand.play_store_badge_url}" alt="Get Auxein Grow on Google Play" height="48" width="162" style="height: 48px; width: 162px; border: 0; display: block;">
                </a>
            </td>
        </tr>
    </table>
    """


def get_app_badges_text(brand: Brand = GROW) -> str:
    """Plain-text equivalent of get_app_badges_html. Returns "" if no store links."""
    if not (brand.app_store_url and brand.play_store_url):
        return ""
    return (
        f"\n    Get the {brand.display_name} mobile app:\n"
        f"    - App Store: {brand.app_store_url}\n"
        f"    - Google Play: {brand.play_store_url}\n"
    )


def get_verification_email_template(username: str, verification_link: str, brand: Brand = GROW) -> tuple[str, str]:
    """Get verification email template"""
    
    html_template = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Verify Your Email - {brand.display_name}</title>
        {get_base_email_styles()}
    </head>
    <body>
        <div style="background-color: #FDF6E3; padding: 20px;">
            <div class="container">
                <div class="header">
                    <div class="logo">
                        <h1>{brand.display_name}</h1>
                    </div>
                    <p style="margin: 0; font-size: 18px; opacity: 0.9;">Welcome to {brand.display_name}!</p>
                </div>
                <div class="content">
                    <h2>Hi {username},</h2>
                    <p>Thank you for creating an account with <strong class="brand-primary">{brand.display_name}</strong>. To complete your registration and start your vineyard management journey, please verify your email address by clicking the button below:</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{verification_link}" class="button">Verify Email Address</a>
                    </div>
                    
                    <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
                    <div class="link-box">{verification_link}</div>
                    
                    <div class="warning-box">
                        <strong>⏰ Important:</strong> This verification link will expire in 24 hours for security reasons.
                    </div>
                    
                    <div class="highlight-box">
                        <h4>🌱 What's next after verification?</h4>
                        <p>Once verified, you'll have access to comprehensive vineyard management tools including block management, observation tracking, task assignment, and detailed analytics.</p>
                    </div>
                    
                    <p>If you didn't create an account with us, please ignore this email.</p>
                    
                    <p>Best regards,<br><strong class="brand-primary">The {brand.display_name} Team</strong></p>
                </div>
                <div class="footer">
                    <p>© 2025 {brand.display_name}. All rights reserved.</p>
                    <p>Helping vineyards grow through intelligent insights</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    text_template = f"""
    Welcome to {brand.display_name}!
    
    Hi {username},
    
    Thank you for creating an account with {brand.display_name}. To complete your registration, please verify your email address by visiting this link:
    
    {verification_link}
    
    This verification link will expire in 24 hours for security reasons.
    
    If you didn't create an account with us, please ignore this email.
    
    Best regards,
    The {brand.display_name} Team
    """
    
    return html_template, text_template


def get_password_reset_email_template(username: str, reset_link: str, brand: Brand = GROW) -> tuple[str, str]:
    """Get password reset email template"""
    
    html_template = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Reset your password - {brand.display_name}</title>
        {get_base_email_styles()}
    </head>
    <body>
        <div style="background-color: #FDF6E3; padding: 20px;">
            <div class="container">
                <div class="header" style="background: linear-gradient(135deg, #5B6830, #6B7840);">
                    <div class="logo">
                        <h1>{brand.display_name}</h1>
                    </div>
                    <p style="margin: 0; font-size: 18px; opacity: 0.9;">Password reset request</p>
                </div>
                <div class="content">
                    <h2>Hi {username},</h2>
                    <p>We received a request to reset your password for your <strong class="brand-primary">{brand.display_name}</strong> account.</p>

                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{reset_link}" class="button accent-button">Reset password</a>
                    </div>

                    <p>If the button doesn't work, copy and paste this link into your browser:</p>
                    <div class="link-box">{reset_link}</div>

                    <div class="warning-box">
                        <strong>Important:</strong> This link expires in 24 hours.
                    </div>

                    <p>If you didn't request a password reset, ignore this email — your password stays as it is.</p>

                    <p>Questions? Reach us at <a href="mailto:{brand.support_email}">{brand.support_email}</a>.</p>

                    <p>Best regards,<br><strong class="brand-primary">The {brand.display_name} Team</strong></p>
                </div>
                <div class="footer">
                    <p>© 2025 {brand.display_name}. All rights reserved.</p>
                    <p>Empowering New Zealand winegrowers with intelligent vineyard management</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    text_template = f"""
    Password Reset Request - {brand.display_name}
    
    Hi {username},
    
    We received a request to reset your password for your {brand.display_name} account.
    
    To reset your password, please visit this link:
    {reset_link}
    
    This password reset link will expire in 24 hours for security reasons.
    
    If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
    
    For security reasons, we recommend using a strong, unique password and not sharing it with anyone.
    
    Best regards,
    The {brand.display_name} Team
    """
    
    return html_template, text_template


def send_verification_email(email: str, username: str, verification_token: str, brand: Brand = GROW) -> bool:
    """Send email verification email"""

    verification_link = f"{brand.frontend_url}/verify-email?token={verification_token}"

    html_content, text_content = get_verification_email_template(username, verification_link, brand)

    return email_service.send_email(
        to_email=email,
        subject=f"Verify Your Email - {brand.display_name}",
        html_content=html_content,
        text_content=text_content,
        brand=brand,
    )

def send_password_reset_email(email: str, username: str, reset_token: str, brand: Brand = GROW) -> bool:
    """Send password reset email"""

    reset_link = f"{brand.frontend_url}/reset-password?token={reset_token}"
    html_content, text_content = get_password_reset_email_template(username, reset_link, brand)

    return email_service.send_email(
        to_email=email,
        subject=f"Reset Your Password - {brand.display_name}",
        html_content=html_content,
        text_content=text_content,
        brand=brand,
    )


def send_welcome_email(email: str, username: str, company_name: str, brand: Brand = GROW) -> bool:
    """Send welcome email to new users"""
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Welcome to {brand.display_name}</title>
        {get_base_email_styles()}
    </head>
    <body>
        <div style="background-color: #FDF6E3; padding: 20px;">
            <div class="container">
                <div class="header" style="background: linear-gradient(135deg, #5B6830, #6B7840);">
                    <div class="logo">
                        <h1>{brand.display_name}</h1>
                    </div>
                    <p style="margin: 0; font-size: 18px; opacity: 0.9;">Welcome to the vineyard management revolution!</p>
                </div>
                <div class="content">
                    <h2>Hi {username},</h2>
                    <p>Welcome to <strong class="brand-primary">{company_name}</strong> on <strong class="brand-primary">{brand.display_name}</strong>! Your account has been successfully created and verified.</p>
                    
                    <div class="highlight-box">
                        <h3>🚀 You now have access to:</h3>
                        <ul style="margin: 15px 0; padding-left: 25px;">
                            <li><strong>Vineyard Block Management</strong> - Organize and track all your vineyard blocks</li>
                            <li><strong>Smart Observations</strong> - Create detailed field observations with photos and GPS</li>
                            <li><strong>Task Management</strong> - Assign and track work across your team</li>
                            <li><strong>Analytics & Reports</strong> - Generate insights to optimize your operations</li>
                            <li><strong>Team Collaboration</strong> - Work seamlessly with your vineyard team</li>
                        </ul>
                    </div>
                    
                    <div style="background: rgba(209, 88, 59, 0.1); padding: 20px; border-radius: 8px; margin: 25px 0; text-align: center;">
                        <h4 style="margin-top: 0;">🌱 Ready to grow?</h4>
                        <p style="margin-bottom: 0;">Start by setting up your first vineyard blocks and exploring the powerful features designed specifically for New Zealand winegrowers.</p>
                    </div>
                    
                    <p>If you need any help getting started, don't hesitate to reach out to our support team at <a href="mailto:{brand.support_email}">{brand.support_email}</a>.</p>
                    
                    <p>Here's to a successful growing season!</p>
                    
                    <p>Best regards,<br><strong class="brand-primary">The {brand.display_name} Team</strong></p>
                </div>
                <div class="footer">
                    <p>© 2025 {brand.display_name}. All rights reserved.</p>
                    <p>Empowering New Zealand winegrowers with intelligent vineyard management</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    return email_service.send_email(
        to_email=email,
        subject=f"Welcome to {company_name} - {brand.display_name}",
        html_content=html_content,
        brand=brand,
    )

def send_admin_welcome_email(
    email: str,
    username: str,
    company_name: str,
    password: str = None,
    brand: Brand = GROW,
) -> bool:
    """Send welcome email to new company admin with login credentials"""

    login_link = f"{brand.frontend_url}/login"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Welcome to {brand.display_name} - Admin Account Created</title>
        {get_base_email_styles()}
    </head>
    <body>
        <div style="background-color: #FDF6E3; padding: 20px;">
            <div class="container">
                <div class="header" style="background: linear-gradient(135deg, #5B6830, #6B7840);">
                    <div class="logo">
                        <h1>{brand.display_name}</h1>
                    </div>
                    <p style="margin: 5px 0; font-size: 18px; opacity: 0.9;">Your <strong>{company_name}</strong> admin account is ready</p>
                </div>
                <div class="content">
                    <h2>Hi {username},</h2>
                    
                    <p>Congratulations! Your company <strong class="brand-primary">{company_name}</strong> has been set up on {brand.display_name}, and you've been designated as the company administrator.</p>
                    
                    <div class="credentials-box">
                        <h3 style="margin-top: 0;">🔑 Your Login Credentials</h3>
                        <p><strong>Email:</strong> {email}</p>
                        <p><strong>Username:</strong> {username}</p>
                        {f'<p><strong>Password:</strong> <code>{password}</code></p>' if password else '<p><strong>Password:</strong> As provided separately</p>'}
                    </div>
                    
                    {f'''<div class="warning-box">
                        <strong>🔒 Important:</strong> Please change your password after your first login for security.
                    </div>''' if password else ''}
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{login_link}" class="button">Login to Your Account</a>
                    </div>

                    <div class="highlight-box">
                        <h3>👑 As Administrator, you can:</h3>
                        <ul style="margin: 15px 0; padding-left: 25px;">
                            <li><strong>Invite Team Members</strong> - Build your vineyard management team</li>
                            <li><strong>Manage Vineyard Blocks</strong> - Set up and organize your vineyard structure</li>
                            <li><strong>Track Observations</strong> - Monitor vineyard health and conditions</li>
                            <li><strong>Assign Tasks</strong> - Coordinate work across your team</li>
                            <li><strong>Generate Reports</strong> - Access powerful analytics and insights</li>
                            <li><strong>Manage Subscriptions</strong> - Control billing and feature access</li>
                        </ul>
                    </div>

                    <div style="text-align: center; margin: 30px 0 10px 0;">
                        <h3 style="margin-bottom: 5px;">Take {brand.display_name} into the vineyard</h3>
                        <p style="margin: 0 0 10px 0;">Download the mobile app for field observations, tasks and GPS coverage.</p>
                        {get_app_badges_html(brand)}
                    </div>

                    <p>Need help? Contact our support team at <a href="mailto:{brand.support_email}">{brand.support_email}</a></p>
                    
                    <p>Welcome to the {brand.display_name} community!</p>
                    
                    <p>Best regards,<br><strong class="brand-primary">The {brand.display_name} Team</strong></p>
                </div>
                <div class="footer">
                    <p>© 2025 {brand.display_name}. All rights reserved.</p>
                    <p>Leading vineyard management technology for New Zealand</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    text_content = f"""
    Welcome to {brand.display_name} - Admin Account Created
    
    Hi {username},
    
    Congratulations! Your company {company_name} has been set up on {brand.display_name}, and you've been designated as the company administrator.
    
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
    {get_app_badges_text(brand)}
    Need help? Contact {brand.support_email}

    Welcome to the {brand.display_name} community!
    
    Best regards,
    The {brand.display_name} Team
    """

    subject = f"Welcome to {brand.display_name} - {company_name} Admin Account Ready!"

    return email_service.send_email(
        to_email=email,
        subject=subject,
        html_content=html_content,
        text_content=text_content,
        brand=brand,
    )

def send_invitation_email(
    email: str,
    inviter_name: str,
    company_name: str,
    role: str,
    invitation_token: str,
    message: str = None,
    suggested_username: str = None,
    temporary_password: str = None,
    brand: Brand = GROW,
) -> bool:
    """Send invitation email with account setup instructions"""

    invitation_link = f"{brand.frontend_url}/accept-invitation?token={invitation_token}"
    login_link = f"{brand.frontend_url}/login"

    # Whether this account can use the web app at all. A `user` or `general`
    # invite becomes a mobile-only user_type and is refused at /auth/login on
    # web, so telling them to "log in" after setup sends them to a 403. They
    # still have to open the LINK in a browser to set a password — that is the
    # only step that happens on the website — and everything after that is the
    # app. Resolved from the same map the accept path uses, so the email cannot
    # promise access the API will refuse.
    from core.permissions import MOBILE_ONLY_USER_TYPES, user_type_for_role
    mobile_only = user_type_for_role(role) in MOBILE_ONLY_USER_TYPES
    
    # Hosted logo on the marketing CDN — email clients fetch images over HTTPS,
    # so this must be an absolute URL (a relative path renders as a broken image).
    logo_url = f"{settings.MARKETING_BASE_URL.rstrip('/')}/images/logo-full.png"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>You're Invited to Join {company_name} - {brand.display_name}</title>
        <style>
            body {{ 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; 
                line-height: 1.6; 
                color: #2F2F2F; 
                background-color: #FDF6E3;
                margin: 0; 
                padding: 0;
            }}
            .container {{ 
                max-width: 600px; 
                margin: 0 auto; 
                background-color: #ffffff;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(47, 47, 47, 0.1);
            }}
            .header {{ 
                background-color: #5B6830; 
                color: #FDF6E3; 
                padding: 40px 30px; 
                text-align: center; 
                position: relative;
            }}
            .header::before {{
                content: '';
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: linear-gradient(90deg, #D1583B, #5B6830);
            }}
            .logo {{
                margin-bottom: 20px;
            }}
            .logo img {{
                height: 45px;
                width: auto;
                max-width: 250px;
            }}
            .content {{ 
                padding: 40px 30px; 
                background-color: #ffffff; 
            }}
            .button {{ 
                display: inline-block; 
                padding: 16px 32px; 
                background: linear-gradient(135deg, #5B6830, #6B7840); 
                color: #FDF6E3; 
                text-decoration: none; 
                border-radius: 8px; 
                margin: 10px 5px; 
                font-weight: 600;
                font-size: 16px;
                transition: all 0.3s ease;
                box-shadow: 0 2px 4px rgba(91, 104, 48, 0.3);
            }}
            .button:hover {{
                background: linear-gradient(135deg, #6B7840, #5B6830);
                transform: translateY(-1px);
                box-shadow: 0 4px 8px rgba(91, 104, 48, 0.4);
            }}
            .accent-button {{
                background: linear-gradient(135deg, #D1583B, #E16844);
            }}
            .accent-button:hover {{
                background: linear-gradient(135deg, #E16844, #D1583B);
            }}
            .footer {{ 
                padding: 30px; 
                text-align: center; 
                background-color: rgba(253, 246, 227, 0.5);
                color: rgba(47, 47, 47, 0.6); 
                font-size: 14px; 
                border-top: 1px solid rgba(91, 104, 48, 0.1);
            }}
            .highlight-box {{
                background: linear-gradient(135deg, rgba(253, 246, 227, 0.8), rgba(253, 246, 227, 0.4));
                border-left: 4px solid #5B6830;
                padding: 20px;
                margin: 25px 0;
                border-radius: 0 8px 8px 0;
            }}
            .warning-box {{
                background: linear-gradient(135deg, rgba(209, 88, 59, 0.1), rgba(209, 88, 59, 0.05));
                border-left: 4px solid #D1583B;
                padding: 20px;
                margin: 25px 0;
                border-radius: 0 8px 8px 0;
            }}
            .credentials-box {{
                background: rgba(253, 246, 227, 0.6);
                border: 2px solid #5B6830;
                padding: 25px;
                border-radius: 8px;
                margin: 25px 0;
                text-align: center;
            }}
            .message-box {{ 
                background: linear-gradient(135deg, rgba(209, 88, 59, 0.1), rgba(209, 88, 59, 0.05)); 
                padding: 20px; 
                border-radius: 6px; 
                margin: 20px 0; 
                border-left: 4px solid #D1583B;
            }}
            .brand-accent {{ color: #D1583B; }}
            .brand-primary {{ color: #5B6830; }}
            .text-muted {{ color: rgba(47, 47, 47, 0.6); }}
            h1 {{ color: #FDF6E3; margin: 0; font-size: 28px; font-weight: 600; }}
            h2 {{ color: #5B6830; margin-top: 0; font-size: 24px; font-weight: 600; }}
            h3 {{ color: #5B6830; font-size: 20px; font-weight: 600; }}
            h4 {{ color: #2F2F2F; font-size: 16px; font-weight: 600; }}
            a {{ color: #5B6830; text-decoration: none; }}
            a:hover {{ color: #D1583B; text-decoration: underline; }}
            code {{
                background: rgba(253, 246, 227, 0.8);
                padding: 6px 10px;
                border-radius: 4px;
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                font-size: 14px;
                color: #2F2F2F;
                border: 1px solid rgba(91, 104, 48, 0.2);
            }}
            /* Fallback for email clients that don't load images */
            .logo-fallback {{
                font-size: 28px;
                font-weight: 600;
                color: #FDF6E3;
                margin: 0;
                display: none;
            }}
        </style>
    </head>
    <body>
        <div style="background-color: #FDF6E3; padding: 20px;">
            <div class="container">
                <div class="header">
                    <div class="logo">
                        <img src="{logo_url}" alt="{brand.display_name}" style="height: 45px; width: auto; max-width: 250px;">
                        <!-- Fallback text for when images don't load -->
                        <div class="logo-fallback">{brand.display_name}</div>
                    </div>
                    <p style="margin: 10px 0 5px 0; font-size: 18px; opacity: 0.9;">You're invited to join</p>
                    <p style="margin: 0; font-size: 20px; font-weight: 600;">{company_name}</p>
                </div>
                <div class="content">
                    <h2>Welcome to the team!</h2>
                    <p><strong class="brand-primary">{inviter_name}</strong> has invited you to join <strong class="brand-primary">{company_name}</strong> on the {brand.display_name} vineyard management platform.</p>
                    
                    {f'<div class="message-box"><strong>Personal message from {inviter_name}:</strong><br><em>"{message}"</em></div>' if message else ''}
                    
                    <div class="credentials-box">
                        <h3 style="margin-top: 0; color: #5B6830;">Your Account Details</h3>
                        <p><strong>Email:</strong> {email}</p>
                        {f'<p><strong>Suggested Username:</strong> {suggested_username}</p>' if suggested_username else ''}
                        {f'<p><strong>Temporary Password:</strong> <code>{temporary_password}</code></p>' if temporary_password else ''}
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <h3>Get Started</h3>
                        <a href="{invitation_link}" class="button">Complete Account Setup</a>
                    </div>
                    
                    {f'''<div class="warning-box">
                        <strong>Security Reminder:</strong> Please change your password after your first login for security. You can customize your username and other profile settings during account setup.
                    </div>''' if temporary_password else ''}
                    
                    <div class="highlight-box">
                        <h4>Next Steps:</h4>
                        <ol style="margin: 15px 0; padding-left: 20px;">
                            <li><strong>Verify your account:</strong> Open the link above in your web browser and set your password</li>
                            {'<li><strong>Then use the app:</strong> Your account works on the ' + brand.display_name + ' mobile app. The website is for managers and administrators, so sign in from your phone.</li>' if mobile_only else '<li><strong>Sign in:</strong> Use the website or the mobile app, whichever suits the job</li>'}
                            <li><strong>Get Help:</strong> Contact {brand.support_email} if you need assistance</li>
                        </ol>
                    </div>

                    <div style="text-align: center; margin: 30px 0 10px 0;">
                        <h4 style="margin-bottom: 5px;">Get the {brand.display_name} mobile app</h4>
                        <p style="margin: 0 0 10px 0;">Capture observations and tasks from the field on iOS and Android.</p>
                        {get_app_badges_html(brand)}
                    </div>

                    <p class="text-muted" style="font-size: 14px;">This invitation will expire in 7 days. If you need a new invitation, please contact {inviter_name} or your system administrator.</p>
                    
                    <p>Welcome to the team!</p>
                    
                    <p>Best regards,<br><strong class="brand-primary">The {brand.display_name} Team</strong></p>
                </div>
                <div class="footer">
                    <p>© 2025 {brand.display_name}. All rights reserved.</p>
                    <p>Collaborative vineyard management for better results</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    text_content = f"""
    You're Invited to Join {company_name} - {brand.display_name}
    
    Hi there!
    
    {inviter_name} has invited you to join {company_name} on {brand.display_name}.
    
    {f'Personal message: {message}' if message else ''}
    
    Your Account Details:
    - Email: {email}
    {f'- Suggested Username: {suggested_username}' if suggested_username else ''}
    {f'- Temporary Password: {temporary_password}' if temporary_password else ''}
    
    Complete Account Setup: {invitation_link}

    Next steps:
    1. Open the link above in your web browser and set your password.
    {'2. Then sign in on the ' + brand.display_name + ' mobile app. The website is for managers and administrators.' if mobile_only else '2. Sign in on the website or the mobile app, whichever suits the job.'}
    
    {f'SECURITY: Please change your password after first login.' if temporary_password else ''}
    {get_app_badges_text(brand)}
    This invitation expires in 7 days.
    
    Welcome to the team!
    
    Best regards,
    The {brand.display_name} Team
    """

    subject = f"Welcome to {company_name} - Your {brand.display_name} Invitation"

    return email_service.send_email(
        to_email=email,
        subject=subject,
        html_content=html_content,
        text_content=text_content,
        brand=brand,
    )

#####################################
#   Depreciated email templates     #
#####################################

def get_contractor_verification_email_template(contractor_name: str, verification_link: str, brand: Brand = GROW) -> tuple[str, str]:
    """Get contractor verification email template"""
    
    html_template = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Verify Your Contractor Account - {brand.display_name}</title>
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
                <h1>🚀 Welcome to {brand.display_name}!</h1>
                <div class="contractor-badge">Contractor Portal</div>
            </div>
            <div class="content">
                <h2>Hi {contractor_name},</h2>
                
                <p>Thank you for registering as a contractor with {brand.display_name}! You're now part of New Zealand's leading vineyard management network.</p>
                
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
                    <p>The {brand.display_name} mobile app will be your go-to tool for managing assignments, checking in at properties, and tracking your work on the go.</p>
                </div>
                
                <p>If you didn't create this contractor account, please ignore this email.</p>
                
                <p>Questions? Contact our contractor support team at contractors@auxein.co.nz</p>
                
                <p>Welcome to the network!</p>
                
                <p>Best regards,<br>
                <strong>The {brand.display_name} Contractor Team</strong></p>
            </div>
            <div class="footer">
                <p>© 2025 {brand.display_name}. All rights reserved.</p>
                <p>Contractor Support: contractors@auxein.co.nz</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    text_template = f"""
    Welcome to {brand.display_name} - Contractor Portal
    
    Hi {contractor_name},
    
    Thank you for registering as a contractor with {brand.display_name}! You're now part of New Zealand's leading vineyard management network.
    
    To complete your registration and start connecting with vineyard companies, please verify your email address by visiting this link:
    
    {verification_link}
    
    This verification link will expire in 24 hours for security reasons.
    
    What happens after verification?
    1. Complete your profile - Add your specializations and equipment
    2. Upload documents - Share insurance certificates and certifications
    3. Connect with companies - Browse and request to work with vineyard companies
    4. Start earning - Accept assignments and build your reputation
    
    Mobile App Coming Soon!
    The {brand.display_name} mobile app will be your go-to tool for managing assignments, checking in at properties, and tracking your work on the go.
    
    If you didn't create this contractor account, please ignore this email.
    
    Questions? Contact our contractor support team at contractors@auxein.co.nz
    
    Welcome to the network!
    
    Best regards,
    The {brand.display_name} Contractor Team
    
    ---
    © 2025 {brand.display_name}. All rights reserved.
    Contractor Support: contractors@auxein.co.nz
    """
    
    return html_template, text_template

def get_contractor_welcome_email_template(contractor_name: str, business_name: str, brand: Brand = GROW) -> tuple[str, str]:
    """Get contractor welcome email template (sent after email verification)"""

    frontend_url = brand.frontend_url
    
    html_template = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Account Verified - Welcome to {brand.display_name}</title>
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
                <p>Welcome to the {brand.display_name} contractor network</p>
            </div>
            <div class="content">
                <h2>Congratulations {contractor_name}!</h2>
                
                <p>Your email has been verified and your contractor account for <strong>{business_name}</strong> is now active on {brand.display_name}.</p>
                
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
                
                <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px 15px 5px 15px; margin: 20px 0; text-align: center;">
                    <strong>📱 Get the mobile app</strong>
                    <p style="margin: 5px 0 10px 0;">Check in, capture observations and log work from the field on iOS and Android.</p>
                    {get_app_badges_html(brand)}
                </div>
                
                <h3>🎯 What Makes {brand.display_name} Different?</h3>
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
                <strong>The {brand.display_name} Contractor Team</strong></p>
            </div>
            <div class="footer">
                <p>© 2025 {brand.display_name}. All rights reserved.</p>
                <p>Contractor Support: contractors@auxein.co.nz</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    text_template = f"""
    Email Verified Successfully - Welcome to {brand.display_name}
    
    Congratulations {contractor_name}!
    
    Your email has been verified and your contractor account for {business_name} is now active on {brand.display_name}.
    
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
    
    Get the mobile app - check in, capture observations and log work from the field:
    {get_app_badges_text(brand)}
    What Makes {brand.display_name} Different?
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
    The {brand.display_name} Contractor Team
    
    ---
    © 2025 {brand.display_name}. All rights reserved.
    Contractor Support: contractors@auxein.co.nz
    """
    
    return html_template, text_template

def send_contractor_verification_email(email: str, contractor_name: str, verification_token: str, brand: Brand = GROW) -> bool:
    """Send contractor email verification email"""

    verification_link = f"{brand.frontend_url}/contractor/verify-email?token={verification_token}"

    html_content, text_content = get_contractor_verification_email_template(contractor_name, verification_link, brand)

    return email_service.send_email(
        to_email=email,
        subject=f"Verify Your Contractor Account - {brand.display_name}",
        html_content=html_content,
        text_content=text_content,
        brand=brand,
    )

def send_contractor_welcome_email(email: str, contractor_name: str, business_name: str, brand: Brand = GROW) -> bool:
    """Send welcome email to verified contractor"""

    html_content, text_content = get_contractor_welcome_email_template(contractor_name, business_name, brand)

    return email_service.send_email(
        to_email=email,
        subject=f"Welcome to {brand.display_name} - Your contractor account is ready!",
        html_content=html_content,
        text_content=text_content,
        brand=brand,
    )