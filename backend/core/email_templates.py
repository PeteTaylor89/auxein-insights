# core/email_templates.py - Add these templates to your email service
from core.config import settings

def get_invitation_email_template(
    invitee_name: str,
    inviter_name: str, 
    company_name: str,
    role: str,
    invitation_link: str,
    custom_message: str = None
) -> tuple[str, str]:
    """Get invitation email template"""
    
    role_descriptions = {
        "admin": "Administrator - Full access to manage the company and users",
        "manager": "Manager - Can manage vineyard data and team tasks", 
        "user": "User - Can create observations and manage assigned tasks",
        "viewer": "Viewer - Read-only access to company data"
    }
    
    role_description = role_descriptions.get(role, "Team Member")
    
    html_template = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>You're Invited to Join {company_name} - Auxein Insights</title>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #16a34a; color: white; padding: 20px; text-align: center; }}
            .content {{ padding: 30px; background-color: #f9fafb; }}
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
            .role-badge {{ 
                background-color: #ddd6fe; 
                color: #5b21b6; 
                padding: 4px 12px; 
                border-radius: 12px; 
                font-size: 14px; 
                font-weight: bold;
                display: inline-block;
                margin: 10px 0;
            }}
            .footer {{ padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }}
            .custom-message {{ 
                background-color: #f3f4f6; 
                border-left: 4px solid #16a34a; 
                padding: 15px; 
                margin: 20px 0; 
                font-style: italic;
            }}
            .features {{ background-color: #f8fafc; padding: 20px; border-radius: 6px; margin: 20px 0; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎉 You're Invited!</h1>
                <p>Join {company_name} on Auxein Insights</p>
            </div>
            <div class="content">
                <h2>Hi{f" {invitee_name}" if invitee_name else ""},</h2>
                
                <p><strong>{inviter_name}</strong> has invited you to join <strong>{company_name}</strong> on Auxein Insights, the leading vineyard management platform.</p>
                
                <div class="role-badge">Your Role: {role_description}</div>
                
                {f'<div class="custom-message"><strong>Message from {inviter_name}:</strong><br>"{custom_message}"</div>' if custom_message else ''}
                
                <div style="text-align: center;">
                    <a href="{invitation_link}" class="button">Accept Invitation</a>
                </div>
                
                <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #16a34a;">{invitation_link}</p>
                
                <div class="features">
                    <h3>What you'll get access to:</h3>
                    <ul>
                        <li>🍇 <strong>Vineyard Block Management</strong> - Track and manage vineyard data</li>
                        <li>📊 <strong>Observations & Analytics</strong> - Record field observations and insights</li>
                        <li>✅ <strong>Task Management</strong> - Assign and track vineyard tasks</li>
                        <li>📈 <strong>Reporting & Insights</strong> - Generate detailed reports</li>
                        <li>👥 <strong>Team Collaboration</strong> - Work together with your team</li>
                    </ul>
                </div>
                
                <p><strong>Important:</strong> This invitation will expire in 7 days for security reasons.</p>
                
                <p>If you have any questions about Auxein Insights or need help getting started, don't hesitate to reach out to our support team.</p>
                
                <p>We're excited to have you join the team!</p>
                
                <p>Best regards,<br>
                {inviter_name} & The Auxein Insights Team</p>
            </div>
            <div class="footer">
                <p>© 2025 Auxein Insights. All rights reserved.</p>
                <p>This invitation was sent to you by {inviter_name} at {company_name}</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    text_template = f"""
    You're Invited to Join {company_name} - Auxein Insights
    
    Hi{f" {invitee_name}" if invitee_name else ""},
    
    {inviter_name} has invited you to join {company_name} on Auxein Insights, the leading vineyard management platform.
    
    Your Role: {role_description}
    
    {f'Message from {inviter_name}: "{custom_message}"' if custom_message else ''}
    
    To accept this invitation and create your account, please visit:
    {invitation_link}
    
    What you'll get access to:
    - Vineyard Block Management - Track and manage vineyard data
    - Observations & Analytics - Record field observations and insights  
    - Task Management - Assign and track vineyard tasks
    - Reporting & Insights - Generate detailed reports
    - Team Collaboration - Work together with your team
    
    This invitation will expire in 7 days for security reasons.
    
    If you have any questions, please contact our support team.
    
    We're excited to have you join the team!
    
    Best regards,
    {inviter_name} & The Auxein Insights Team
    
    ---
    © 2025 Auxein Insights. All rights reserved.
    This invitation was sent to you by {inviter_name} at {company_name}
    """
    
    return html_template, text_template

def send_invitation_email(
    email: str, 
    invitee_name: str,
    inviter_name: str,
    company_name: str, 
    role: str,
    invitation_token: str,
    custom_message: str = None
) -> bool:
    """Send invitation email"""
    
    from core.email_utils import email_service
    
    # Create invitation link
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    invitation_link = f"{frontend_url}/accept-invitation?token={invitation_token}"
    
    html_content, text_content = get_invitation_email_template(
        invitee_name=invitee_name,
        inviter_name=inviter_name,
        company_name=company_name,
        role=role,
        invitation_link=invitation_link,
        custom_message=custom_message
    )
    
    subject = f"You're invited to join {company_name} on Auxein Insights"
    
    return email_service.send_email(
        to_email=email,
        subject=subject,
        html_content=html_content,
        text_content=text_content
    )

def send_invitation_reminder_email(
    email: str,
    invitee_name: str, 
    inviter_name: str,
    company_name: str,
    invitation_token: str,
    days_remaining: int
) -> bool:
    """Send invitation reminder email"""
    
    from core.email_utils import email_service
    
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    invitation_link = f"{frontend_url}/accept-invitation?token={invitation_token}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Reminder: Invitation to {company_name} - Auxein Insights</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f59e0b; color: white; padding: 20px; text-align: center;">
                <h1>⏰ Invitation Reminder</h1>
            </div>
            <div style="padding: 30px; background-color: #f9fafb;">
                <h2>Hi{f" {invitee_name}" if invitee_name else ""},</h2>
                
                <p>This is a friendly reminder that <strong>{inviter_name}</strong> invited you to join <strong>{company_name}</strong> on Auxein Insights.</p>
                
                <p style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px;">
                    <strong>⚠️ Your invitation expires in {days_remaining} day{"s" if days_remaining != 1 else ""}!</strong>
                </p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{invitation_link}" style="display: inline-block; padding: 12px 24px; background-color: #16a34a; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
                        Accept Invitation Now
                    </a>
                </div>
                
                <p>Don't miss out on joining your team on the leading vineyard management platform!</p>
                
                <p>Best regards,<br>The Auxein Insights Team</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    subject = f"Reminder: Your invitation to {company_name} expires soon"
    
    return email_service.send_email(
        to_email=email,
        subject=subject,
        html_content=html_content
    )
def send_welcome_email(
    email: str, 
    username: str, 
    company_name: str, 
    password: str = None
) -> bool:
    """Send welcome email to new company admin"""
    
    from core.email_utils import email_service
    
    # Create login link
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    login_link = f"{frontend_url}/login"
    
    # Logo URL - update this to match your hosted logo location
    logo_url = f"https://static.wixstatic.com/media/518d4a_389e37adefda43c0ab5a3798c64ea734~mv2.png"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Welcome to Auxein Insights - Your Account is Ready!</title>
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
                background: linear-gradient(135deg, #5B6830, #6B7840); 
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
            .credentials {{ 
                background: rgba(253, 246, 227, 0.6);
                border: 2px solid #5B6830;
                padding: 25px; 
                border-radius: 8px; 
                margin: 25px 0;
                text-align: center;
            }}
            .button {{ 
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
            }}
            .button:hover {{
                background: linear-gradient(135deg, #6B7840, #5B6830);
                transform: translateY(-1px);
                box-shadow: 0 4px 8px rgba(91, 104, 48, 0.4);
            }}
            .features {{ 
                background: linear-gradient(135deg, rgba(253, 246, 227, 0.8), rgba(253, 246, 227, 0.4));
                border-left: 4px solid #5B6830;
                padding: 25px; 
                border-radius: 0 8px 8px 0; 
                margin: 25px 0; 
            }}
            .checklist {{
                background: rgba(209, 88, 59, 0.05);
                border-left: 4px solid #D1583B;
                padding: 25px;
                margin: 25px 0;
                border-radius: 0 8px 8px 0;
            }}
            .footer {{ 
                padding: 30px; 
                text-align: center; 
                background-color: rgba(253, 246, 227, 0.5);
                color: rgba(47, 47, 47, 0.6); 
                font-size: 14px; 
                border-top: 1px solid rgba(91, 104, 48, 0.1);
            }}
            .security-note {{ 
                background: linear-gradient(135deg, rgba(209, 88, 59, 0.1), rgba(209, 88, 59, 0.05));
                border-left: 4px solid #D1583B;
                padding: 20px; 
                margin: 25px 0; 
                border-radius: 0 8px 8px 0;
            }}
            .brand-accent {{ color: #D1583B; }}
            .brand-primary {{ color: #5B6830; }}
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
                        <div class="logo-fallback">Auxein <span style="color: #D1583B;">TO GROW</span></div>
                    </div>
                    <h1>Welcome to Auxein Insights!</h1>
                    <p style="margin: 5px 0; font-size: 16px; opacity: 0.9;">Your vineyard management platform is ready</p>
                </div>
                <div class="content">
                    <h2>Hi {username},</h2>
                    
                    <p>Congratulations! Your company <strong class="brand-primary">{company_name}</strong> has been successfully set up on Auxein Insights, and you've been designated as the company administrator.</p>
                    
                    <div class="credentials">
                        <h3 style="margin-top: 0; color: #5B6830;">Your Login Credentials</h3>
                        <div style="background: rgba(253, 246, 227, 0.4); padding: 15px; border-radius: 6px; margin: 15px 0;">
                            <p style="margin: 5px 0;"><strong>Email:</strong> <span style="color: #5B6830;">{email}</span></p>
                            <p style="margin: 5px 0;"><strong>Username:</strong> <span style="color: #5B6830;">{username}</span></p>
                            {f'<p style="margin: 5px 0;"><strong>Password:</strong> <code>{password}</code></p>' if password else '<p style="margin: 5px 0;"><strong>Password:</strong> As provided separately</p>'}
                        </div>
                    </div>
                    
                    {f'''<div class="security-note">
                        <strong>Security Notice:</strong> For your account security, please change your password after your first login. Go to Settings → Security → Change Password.
                    </div>''' if password else ''}
                    
                    <div style="text-align: center;">
                        <a href="{login_link}" class="button">Login to Your Account</a>
                    </div>
                    
                    <div class="features">
                        <h3 style="margin-top: 0;">What you can do as Administrator:</h3>
                        <ul style="margin: 15px 0; padding-left: 25px;">
                            <li><strong>Invite Team Members</strong> - Add your team and assign roles</li>
                            <li><strong>Manage Vineyard Blocks</strong> - Set up and organize your vineyard data</li>
                            <li><strong>Track Observations</strong> - Record and analyze field observations</li>
                            <li><strong>Assign Tasks</strong> - Manage vineyard operations and workflows</li>
                            <li><strong>Generate Reports</strong> - Access detailed analytics and insights</li>
                            <li><strong>Company Settings</strong> - Configure your company profile and preferences</li>
                        </ul>
                    </div>
                    
                    <div class="checklist">
                        <h3 style="margin-top: 0; color: #D1583B;">Getting Started Checklist:</h3>
                        <ol style="margin: 15px 0; padding-left: 20px;">
                            <li>Log in to your account using the credentials above</li>
                            <li>Complete your company profile (Settings → Company)</li>
                            <li>Invite your team members (Team → Invite Users)</li>
                            <li>Set up your first vineyard blocks (Vineyard → Add Block)</li>
                            <li>Start recording observations and assigning tasks</li>
                        </ol>
                    </div>
                    
                    <div style="background: rgba(253, 246, 227, 0.6); border-radius: 8px; padding: 20px; margin: 25px 0;">
                        <h3 style="margin-top: 0; color: #5B6830;">Need Help?</h3>
                        <p>Our team is here to help you get the most out of Auxein Insights:</p>
                        <ul style="margin: 15px 0; padding-left: 25px;">
                            <li><strong>Email Support:</strong> <a href="mailto:support@auxein.co.nz">support@auxein.co.nz</a></li>
                            <li><strong>Phone Support:</strong> Available during business hours</li>
                            <li><strong>Online Documentation:</strong> Comprehensive guides and tutorials</li>
                        </ul>
                    </div>
                    
                    <p>We're excited to have <strong class="brand-primary">{company_name}</strong> as part of the Auxein Insights community!</p>
                    
                    <p>Best regards,<br>
                    <strong class="brand-primary">The Auxein Insights Team</strong><br>
                    <span style="color: rgba(47, 47, 47, 0.7);">Leading vineyard management solutions</span></p>
                </div>
                <div class="footer">
                    <p>© 2025 Auxein Insights. All rights reserved.</p>
                    <p>This welcome email was sent to {email} for {company_name}</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    text_content = f"""
    Welcome to Auxein Insights - Your Account is Ready!
    
    Hi {username},
    
    Congratulations! Your company {company_name} has been successfully set up on Auxein Insights, and you've been designated as the company administrator.
    
    Your Login Credentials:
    - Email: {email}
    - Username: {username}
    - Password: {password if password else 'As provided separately'}
    
    {'IMPORTANT: For security reasons, please change your password after your first login.' if password else ''}
    
    Login to your account: {login_link}
    
    What you can do as an Administrator:
    - Invite Team Members - Add your team and assign roles
    - Manage Vineyard Blocks - Set up and organize your vineyard data
    - Track Observations - Record and analyze field observations
    - Assign Tasks - Manage vineyard operations and workflows
    - Generate Reports - Access detailed analytics and insights
    - Company Settings - Configure your company profile and preferences
    
    Getting Started Checklist:
    1. Log in to your account using the credentials above
    2. Complete your company profile (Settings → Company)
    3. Invite your team members (Team → Invite Users)
    4. Set up your first vineyard blocks (Vineyard → Add Block)
    5. Start recording observations and assigning tasks
    
    Need Help?
    - Email Support: support@auxein.co.nz
    - Phone Support: Available during business hours
    - Online Documentation: Comprehensive guides and tutorials
    
    We're excited to have {company_name} as part of the Auxein Insights community!
    
    Best regards,
    The Auxein Insights Team
    Leading vineyard management solutions
    
    ---
    © 2025 Auxein Insights. All rights reserved.
    This welcome email was sent to {email} for {company_name}
    """
    
    subject = f"Welcome to Auxein Insights - {company_name} Account Ready!"
    
    return email_service.send_email(
        to_email=email,
        subject=subject,
        html_content=html_content,
        text_content=text_content
    )