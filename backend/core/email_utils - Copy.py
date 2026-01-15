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



def get_verification_email_template(username: str, verification_link: str) -> tuple[str, str]:
    """Get verification email template"""
    
    html_template = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Verify Your Email - Auxein Insights</title>
        {get_base_email_styles()}
    </head>
    <body>
        <div style="background-color: #FDF6E3; padding: 20px;">
            <div class="container">
                <div class="header">
                    <div class="logo">
                        <h1>Auxein <span class="brand-accent" style="color: #D1583B;">TO GROW</span></h1>
                    </div>
                    <p style="margin: 0; font-size: 18px; opacity: 0.9;">Welcome to Auxein Insights!</p>
                </div>
                <div class="content">
                    <h2>Hi {username},</h2>
                    <p>Thank you for creating an account with <strong class="brand-primary">Auxein Insights</strong>. To complete your registration and start your vineyard management journey, please verify your email address by clicking the button below:</p>
                    
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
                    
                    <p>Best regards,<br><strong class="brand-primary">The Auxein Insights Team</strong></p>
                </div>
                <div class="footer">
                    <p>© 2025 Auxein Insights. All rights reserved.</p>
                    <p>Helping vineyards grow through intelligent insights</p>
                </div>
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
        {get_base_email_styles()}
    </head>
    <body>
        <div style="background-color: #FDF6E3; padding: 20px;">
            <div class="container">
                <div class="header" style="background-color: #D1583B;">
                    <div class="logo">
                        <h1 style="color: #FDF6E3;">Auxein <span style="color: #FDF6E3;">TO GROW</span></h1>
                    </div>
                    <p style="margin: 0; font-size: 18px; opacity: 0.9; color: #FDF6E3;">Password Reset Request</p>
                </div>
                <div class="content">
                    <h2>Hi {username},</h2>
                    <p>We received a request to reset your password for your <strong class="brand-primary">Auxein Insights</strong> account.</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{reset_link}" class="button accent-button">Reset Password</a>
                    </div>
                    
                    <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
                    <div class="link-box">{reset_link}</div>
                    
                    <div class="warning-box">
                        <strong>🔒 Important:</strong> This password reset link will expire in 24 hours for security reasons.
                    </div>
                    
                    <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
                    
                    <div class="highlight-box">
                        <h4>🛡️ Security Recommendations:</h4>
                        <ul style="margin: 10px 0; padding-left: 20px;">
                            <li>Use a strong, unique password</li>
                            <li>Don't share your password with anyone</li>
                            <li>Enable two-factor authentication if available</li>
                            <li>Regularly update your password</li>
                        </ul>
                    </div>
                    
                    <p>Best regards,<br><strong class="brand-primary">The Auxein Insights Team</strong></p>
                </div>
                <div class="footer">
                    <p>© 2025 Auxein Insights. All rights reserved.</p>
                    <p>Protecting your vineyard data with enterprise-grade security</p>
                </div>
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
        {get_base_email_styles()}
    </head>
    <body>
        <div style="background-color: #FDF6E3; padding: 20px;">
            <div class="container">
                <div class="header" style="background: linear-gradient(135deg, #5B6830, #6B7840);">
                    <div class="logo">
                        <h1>Auxein <span style="color: #D1583B;">TO GROW</span></h1>
                    </div>
                    <p style="margin: 0; font-size: 18px; opacity: 0.9;">Welcome to the vineyard management revolution!</p>
                </div>
                <div class="content">
                    <h2>Hi {username},</h2>
                    <p>Welcome to <strong class="brand-primary">{company_name}</strong> on <strong class="brand-primary">Auxein Insights</strong>! Your account has been successfully created and verified.</p>
                    
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
                    
                    <p>If you need any help getting started, don't hesitate to reach out to our support team at <a href="mailto:support@auxein.co.nz">support@auxein.co.nz</a>.</p>
                    
                    <p>Here's to a successful growing season!</p>
                    
                    <p>Best regards,<br><strong class="brand-primary">The Auxein Insights Team</strong></p>
                </div>
                <div class="footer">
                    <p>© 2025 Auxein Insights. All rights reserved.</p>
                    <p>Empowering New Zealand winegrowers with intelligent vineyard management</p>
                </div>
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
        {get_base_email_styles()}
    </head>
    <body>
        <div style="background-color: #FDF6E3; padding: 20px;">
            <div class="container">
                <div class="header" style="background: linear-gradient(135deg, #5B6830, #6B7840);">
                    <div class="logo">
                        <h1>Auxein <span style="color: #D1583B;">TO GROW</span></h1>
                    </div>
                    <p style="margin: 5px 0; font-size: 18px; opacity: 0.9;">Your <strong>{company_name}</strong> admin account is ready</p>
                </div>
                <div class="content">
                    <h2>Hi {username},</h2>
                    
                    <p>Congratulations! Your company <strong class="brand-primary">{company_name}</strong> has been set up on Auxein Insights, and you've been designated as the company administrator.</p>
                    
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

                    <p>Need help? Contact our support team at <a href="mailto:support@auxein.co.nz">support@auxein.co.nz</a></p>
                    
                    <p>Welcome to the Auxein Insights community!</p>
                    
                    <p>Best regards,<br><strong class="brand-primary">The Auxein Insights Team</strong></p>
                </div>
                <div class="footer">
                    <p>© 2025 Auxein Insights. All rights reserved.</p>
                    <p>Leading vineyard management technology for New Zealand</p>
                </div>
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
    temporary_password: str = None
) -> bool:
    """Send invitation email with account setup instructions"""
    
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    invitation_link = f"{frontend_url}/accept-invitation?token={invitation_token}"
    login_link = f"{frontend_url}/login"
    
    # Logo URL - update this to match your hosted logo location
    logo_url = f"/images/App_Logo_September 2025.jpg"  # Assumes logo is in public/images/
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>You're Invited to Join {company_name} - Auxein Insights</title>
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
                        <img src="{logo_url}" alt="Auxein TO GROW" style="height: 45px; width: auto; max-width: 250px;">
                        <!-- Fallback text for when images don't load -->
                        <div class="logo-fallback">Auxein <span style="color: #D1583B;">TO GROW</span></div>
                    </div>
                    <p style="margin: 10px 0 5px 0; font-size: 18px; opacity: 0.9;">You're invited to join</p>
                    <p style="margin: 0; font-size: 20px; font-weight: 600;">{company_name}</p>
                </div>
                <div class="content">
                    <h2>Welcome to the team!</h2>
                    <p><strong class="brand-primary">{inviter_name}</strong> has invited you to join <strong class="brand-primary">{company_name}</strong> as a <strong class="brand-accent">{role.title()}</strong> on the Auxein Insights vineyard management platform.</p>
                    
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
                        {f'<a href="{login_link}" class="button accent-button">Login Directly</a>' if temporary_password else ''}
                    </div>
                    
                    {f'''<div class="warning-box">
                        <strong>Security Reminder:</strong> Please change your password after your first login for security. You can customize your username and other profile settings during account setup.
                    </div>''' if temporary_password else ''}
                    
                    <div class="highlight-box">
                        <h4>Next Steps:</h4>
                        <ol style="margin: 15px 0; padding-left: 20px;">
                            <li><strong>Complete Setup:</strong> Click "Complete Account Setup" to customize your profile</li>
                            {f'<li><strong>Or Login:</strong> Use the temporary credentials above to login directly</li>' if temporary_password else ''}
                            <li><strong>Explore:</strong> Access vineyard data, observations, and team tools</li>
                            <li><strong>Get Help:</strong> Contact support@auxein.co.nz if you need assistance</li>
                        </ol>
                    </div>
                    
                    <p class="text-muted" style="font-size: 14px;">This invitation will expire in 7 days. If you need a new invitation, please contact {inviter_name} or your system administrator.</p>
                    
                    <p>Welcome to the team!</p>
                    
                    <p>Best regards,<br><strong class="brand-primary">The Auxein Insights Team</strong></p>
                </div>
                <div class="footer">
                    <p>© 2025 Auxein Insights. All rights reserved.</p>
                    <p>Collaborative vineyard management for better results</p>
                </div>
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

#####################################
#   Depreciated email templates     #
#####################################

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