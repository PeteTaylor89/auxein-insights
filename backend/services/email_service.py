# backend/services/email_service.py - Unified Email Service for All Apps
import smtplib
import os
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from jinja2 import Template
import logging

logger = logging.getLogger(__name__)

class UnifiedEmailService:
    """
    Unified email service that handles emails for:
    - Auxein Insights (public app - port 5174)
    - Insights Pro (main app - port 5173)
    - Contractor Portal (if needed)

    ONE PRODUCT NAME: **Auxein Insights**. It was called "Auxein Regional
    Intelligence" in every subject line and header here, "Auxein Regional
    Insights" in the web app's meta tags, and "Auxein Insights" in every piece
    of copy written recently. Someone who signed up, read the verification
    email and then looked at their browser tab was shown three products.

    THE ENV VAR IS STILL `REGIONAL_INTELLIGENCE_URL`. Only the Python attribute
    was renamed to `insights_url`; the variable is deployed configuration on
    Elastic Beanstalk and renaming it here would break the running environment
    until someone remembered to change it there too.
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
        
        # App-specific URLs. The env var names are unchanged deployed config;
        # see the class docstring.
        self.insights_url = os.getenv(
            "EMAIL_VERIFICATION_BASE_URL",
            os.getenv("REGIONAL_INTELLIGENCE_URL", "http://localhost:5174")
        )
        self.insights_pro_url = os.getenv("INSIGHTS_PRO_URL", "http://localhost:5173")

        logger.info(f"Email Service initialized:")
        logger.info(f"  - Auxein Insights: {self.insights_url}")
        logger.info(f"  - Insights Pro: {self.insights_pro_url}")
        logger.info(f"  - Send emails: {self.send_emails}")
    
    def _send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
        attachments: Optional[list] = None,
        reply_to: Optional[str] = None,
    ) -> bool:
        """Internal method to send email.

        attachments is an optional list of dicts with keys
        {filename, content (bytes), content_type}. When present the message is
        wrapped in a multipart/mixed envelope so the body still renders inline.

        reply_to, when set, adds a Reply-To header so replies route to the
        given address instead of the system sender.
        """

        if not self.send_emails:
            # Development mode - just log
            logger.info(f"\n{'='*60}")
            logger.info(f"[DEV MODE] Email would be sent to: {to_email}")
            logger.info(f"Subject: {subject}")
            logger.info(f"From: {self.from_name} <{self.from_email}>")
            if reply_to:
                logger.info(f"Reply-To: {reply_to}")
            if attachments:
                names = ", ".join(a.get("filename", "?") for a in attachments)
                logger.info(f"Attachments: {names}")
            logger.info(f"{'='*60}\n")
            print(f"\n📧 [DEV] Email to {to_email}: {subject}")
            return True

        try:
            body = MIMEMultipart('alternative')
            if text_content:
                body.attach(MIMEText(text_content, 'plain'))
            body.attach(MIMEText(html_content, 'html'))

            if attachments:
                from email.mime.base import MIMEBase
                from email import encoders
                message = MIMEMultipart('mixed')
                message.attach(body)
                for att in attachments:
                    filename = att.get("filename") or "attachment"
                    content = att.get("content") or b""
                    ctype = att.get("content_type") or "application/octet-stream"
                    maintype, _, subtype = ctype.partition('/')
                    part = MIMEBase(maintype or "application", subtype or "octet-stream")
                    part.set_payload(content)
                    encoders.encode_base64(part)
                    part.add_header(
                        "Content-Disposition",
                        f'attachment; filename="{filename}"',
                    )
                    message.attach(part)
            else:
                message = body

            message['Subject'] = subject
            message['From'] = f"{self.from_name} <{self.from_email}>"
            message['To'] = to_email
            if reply_to:
                message['Reply-To'] = reply_to

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
    # AUXEIN INSIGHTS (PUBLIC) EMAILS
    # ============================================
    
    def send_public_verification_email(self, email: str, token: str, name: str = "there"):
        """Send email verification for Auxein Insights public users"""
        verification_url = f"{self.insights_url}?token={token}"

        subject = "Verify your Auxein Insights account"

        html_content = self._get_public_verification_template(name, verification_url)
        text_content = f"""Hi {name},

Thanks for creating an Auxein Insights account.

Please confirm your email address to finish setting it up:
{verification_url}

This link expires in 24 hours. If you did not create an account, you can
ignore this email and nothing further will happen.

Auxein Insights
insights.auxein.co.nz
"""
        
        return self._send_email(email, subject, html_content, text_content)
    
    def send_public_password_reset_email(self, email: str, token: str, name: str = "there"):
        """Send password reset for Auxein Insights"""
        reset_url = f"{self.insights_url}?reset_token={token}"

        subject = "Reset your Auxein Insights password"

        html_content = self._get_public_reset_template(name, reset_url)
        text_content = f"""Hi {name},

We received a request to reset the password on your Auxein Insights account.

Set a new password here:
{reset_url}

This link expires in 1 hour. If you did not request this, you can ignore this
email - your password will not change.

Auxein Insights
insights.auxein.co.nz
"""
        
        return self._send_email(email, subject, html_content, text_content)
    
    def send_public_welcome_email(self, email: str, name: str = "there"):
        """Send welcome email for Auxein Insights"""
        subject = "Welcome to Auxein Insights"

        html_content = self._get_public_welcome_template(name)
        text_content = f"""Hi {name},

Your Auxein Insights account is ready.

You now have the full regional picture: the climate record back to 1986, how
the current season compares with it, and the national climate Atlas at 500 m.
It is free and it stays free.

Start here: {self.insights_url}

Auxein Insights
insights.auxein.co.nz
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
    # PRODUCT FEEDBACK
    # ============================================

    def send_feedback_email(
        self,
        category: str,
        subject_text: str,
        message: str,
        from_user_email: str,
        from_user_name: str,
        company_name: Optional[str] = None,
        page_url: Optional[str] = None,
        user_agent: Optional[str] = None,
        to_email: Optional[str] = None,
        attachments: Optional[list] = None,
    ) -> bool:
        """Forward in-app feedback to the product inbox.

        Defaults the recipient to grow@auxein.co.nz; overrideable via
        FEEDBACK_INBOX env var or the to_email argument.
        """
        recipient = to_email or os.getenv("FEEDBACK_INBOX", "grow@auxein.co.nz")
        cat_label = (category or "feedback").replace("_", " ").title()
        subject = f"[Grow {cat_label}] {subject_text or '(no subject)'}"

        # Escape message for HTML — keep newlines.
        def esc(s: str) -> str:
            return (
                (s or "")
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
            )

        message_html = esc(message).replace("\n", "<br/>")
        company_line = f"Company: {esc(company_name)}<br/>" if company_name else ""
        url_line = f"Page: <a href=\"{esc(page_url)}\">{esc(page_url)}</a><br/>" if page_url else ""
        ua_line = f"User agent: {esc(user_agent)}<br/>" if user_agent else ""

        html_content = f"""
<div style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #1f2937; max-width: 640px;\">
  <h2 style=\"color: #5B6830; margin: 0 0 16px 0;\">{esc(cat_label)} from Grow</h2>
  <p style=\"margin: 0 0 12px 0; font-weight: 600;\">{esc(subject_text or '(no subject)')}</p>
  <div style=\"background: #f7f7f5; border-left: 3px solid #5B6830; padding: 12px 16px; margin: 12px 0; white-space: pre-wrap;\">
    {message_html}
  </div>
  <hr style=\"border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;\"/>
  <div style=\"font-size: 13px; color: #6b7280;\">
    From: {esc(from_user_name)} &lt;{esc(from_user_email)}&gt;<br/>
    {company_line}{url_line}{ua_line}
  </div>
</div>
"""
        text_content = (
            f"{cat_label} from Grow\n"
            f"{subject_text or '(no subject)'}\n\n"
            f"{message}\n\n"
            f"---\n"
            f"From: {from_user_name} <{from_user_email}>\n"
            + (f"Company: {company_name}\n" if company_name else "")
            + (f"Page: {page_url}\n" if page_url else "")
            + (f"User agent: {user_agent}\n" if user_agent else "")
        )

        return self._send_email(
            recipient, subject, html_content, text_content, attachments=attachments
        )

    def send_insights_feedback(
        self,
        sections: list,
        subject_regions: str,
        reply_to: Optional[str] = None,
        to_email: Optional[str] = None,
        subject: Optional[str] = None,
        lead: Optional[str] = None,
    ) -> bool:
        """Email a public Insights feedback-form submission to the inbox.

        sections is an ordered list of (section_title, [(label, value), ...]).
        Values are pre-rendered by the caller; empty answers should already be
        passed as the em dash placeholder. Defaults the recipient to
        insights@auxein.co.nz; overrideable via INSIGHTS_FEEDBACK_INBOX or the
        to_email argument. reply_to routes replies to the grower when supplied.
        """
        recipient = to_email or os.getenv(
            "INSIGHTS_FEEDBACK_INBOX", "insights@auxein.co.nz"
        )
        # `subject` and `lead` let another public form reuse this renderer
        # without pretending to be feedback — the Pro enquiry form does.
        # Both default to the original wording, so the feedback caller is
        # unchanged.
        subject = subject or f"New Insights feedback — {subject_regions or '(no region given)'}"
        lead = lead or "New Auxein Insights feedback received."

        def esc(s: str) -> str:
            return (
                (s or "")
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
            )

        # Plain-text body
        text_parts = [lead + "\n"]
        for title, rows in sections:
            text_parts.append(f"— {title.upper()} —")
            for label, value in rows:
                text_parts.append(f"{label}: {value}")
            text_parts.append("")
        text_content = "\n".join(text_parts).rstrip() + "\n"

        # HTML body — section headings olive, body charcoal
        html_sections = []
        for title, rows in sections:
            row_html = "".join(
                f"<p style=\"margin: 0 0 10px 0; color: #2F2F2F;\">"
                f"<strong>{esc(label)}</strong><br/>"
                f"{esc(value).replace(chr(10), '<br/>')}</p>"
                for label, value in rows
            )
            html_sections.append(
                f"<h2 style=\"color: #5B6830; font-size: 16px; "
                f"margin: 24px 0 12px 0;\">{esc(title)}</h2>{row_html}"
            )
        html_content = f"""
<div style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #2F2F2F; max-width: 640px;\">
  <p style=\"margin: 0 0 8px 0;\">{esc(lead)}</p>
  {''.join(html_sections)}
</div>
"""
        return self._send_email(
            recipient, subject, html_content, text_content, reply_to=reply_to
        )

    # ============================================
    # CAMPAIGN EMAIL TEMPLATES
    # ============================================

    def render_article_spotlight(self, campaign, article: dict, user) -> str:
        """Render a single-article spotlight email.
        article dict: title, excerpt, slug, featured_image_url (optional)
        """
        article_url = f"{self.insights_url}/articles/{article.get('slug', '')}"
        user_name = getattr(user, 'first_name', None) or 'there'
        intro = campaign.intro_text or ''
        outro = campaign.outro_text or ''

        image_block = ''
        if article.get('featured_image_url'):
            image_block = f'''
            <tr>
                <td style="padding: 0;">
                    <img src="{article['featured_image_url']}" alt="{article.get('title', '')}" style="width: 100%; max-width: 600px; height: auto; display: block; border-radius: 0;" />
                </td>
            </tr>'''

        content = f"""
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
    <tr>
        <td style="padding: 40px; background: linear-gradient(135deg, #446145 0%, #5B6830 100%); border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Featured Article</h1>
            <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">Auxein Insights</p>
        </td>
    </tr>
    <tr>
        <td style="padding: 30px 40px 10px 40px;">
            <p style="margin: 0; color: #505050; font-size: 16px; line-height: 1.6;">Hi {user_name},</p>
            {f'<p style="margin: 12px 0 0 0; color: #505050; font-size: 16px; line-height: 1.6;">{intro}</p>' if intro else ''}
        </td>
    </tr>
    {image_block}
    <tr>
        <td style="padding: 20px 40px;">
            <h2 style="margin: 0 0 12px 0; color: #2F2F2F; font-size: 22px;">{article.get('title', '')}</h2>
            <p style="margin: 0 0 20px 0; color: #505050; font-size: 16px; line-height: 1.6;">{article.get('excerpt', '')}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                    <td align="center" style="padding: 10px 0 20px 0;">
                        <a href="{article_url}" style="display: inline-block; padding: 16px 40px; background-color: #D1583B; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">Read Article</a>
                    </td>
                </tr>
            </table>
            {f'<p style="margin: 10px 0 0 0; color: #505050; font-size: 14px; line-height: 1.5;">{outro}</p>' if outro else ''}
        </td>
    </tr>
    {self._get_unsubscribe_footer(user)}
</table>
        """
        return self._get_email_header_footer(content)

    def render_weekly_roundup(self, campaign, article: dict, user) -> str:
        """Render a weekly roundup email pointing to a roundup article.
        Uses the same layout as spotlight but with roundup branding.
        """
        article_url = f"{self.insights_url}/articles/{article.get('slug', '')}"
        user_name = getattr(user, 'first_name', None) or 'there'
        intro = campaign.intro_text or ''
        outro = campaign.outro_text or ''

        image_block = ''
        if article.get('featured_image_url'):
            image_block = f'''
            <tr>
                <td style="padding: 0;">
                    <img src="{article['featured_image_url']}" alt="{article.get('title', '')}" style="width: 100%; max-width: 600px; height: auto; display: block;" />
                </td>
            </tr>'''

        content = f"""
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
    <tr>
        <td style="padding: 40px; background: linear-gradient(135deg, #446145 0%, #5B6830 100%); border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Weekly Roundup</h1>
            <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">Auxein Insights</p>
        </td>
    </tr>
    <tr>
        <td style="padding: 30px 40px 10px 40px;">
            <p style="margin: 0; color: #505050; font-size: 16px; line-height: 1.6;">Hi {user_name},</p>
            <p style="margin: 12px 0 0 0; color: #505050; font-size: 16px; line-height: 1.6;">
                {intro if intro else "Here's your weekly roundup of the latest from Auxein Insights."}
            </p>
        </td>
    </tr>
    {image_block}
    <tr>
        <td style="padding: 20px 40px;">
            <h2 style="margin: 0 0 12px 0; color: #2F2F2F; font-size: 22px;">{article.get('title', '')}</h2>
            <p style="margin: 0 0 20px 0; color: #505050; font-size: 16px; line-height: 1.6;">{article.get('excerpt', '')}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                    <td align="center" style="padding: 10px 0 20px 0;">
                        <a href="{article_url}" style="display: inline-block; padding: 16px 40px; background-color: #D1583B; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">Read the Roundup</a>
                    </td>
                </tr>
            </table>
            {f'<p style="margin: 10px 0 0 0; color: #505050; font-size: 14px; line-height: 1.5;">{outro}</p>' if outro else ''}
        </td>
    </tr>
    {self._get_unsubscribe_footer(user)}
</table>
        """
        return self._get_email_header_footer(content)

    def render_general(self, campaign, user) -> str:
        """Render a general email - branded shell, no content object behind it.

        The other three campaign templates are each ABOUT something the database
        already holds: a spotlight is about an article, a roundup is about a
        roundup article, an alert is about a metric crossing a threshold. There
        was no way to simply write to the list - a service notice, a price
        change, a season opening - without inventing an article to hang it on.

        `body_html` is the admin's own markup and is passed through as authored.
        It is admin-only input rendered into an email, never into the site, so
        it is not sanitised here; the same is already true of `intro_text` and
        `outro_text` in every other template.

        The footer matters more here than anywhere else. Before this existed an
        unrecognised template type fell through to a raw `campaign.body_html`
        with NO unsubscribe link, which the Unsolicited Electronic Messages Act
        2007 requires on a commercial message. Going through a renderer means
        the footer cannot be forgotten.
        """
        user_name = getattr(user, 'first_name', None) or 'there'
        intro = campaign.intro_text or ''
        body = campaign.body_html or ''
        outro = campaign.outro_text or ''

        content = f"""
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
    <tr>
        <td style="padding: 40px; background: linear-gradient(135deg, #446145 0%, #5B6830 100%); border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Auxein Insights</h1>
        </td>
    </tr>
    <tr>
        <td style="padding: 30px 40px 10px 40px;">
            <p style="margin: 0; color: #505050; font-size: 16px; line-height: 1.6;">Hi {user_name},</p>
            {f'<p style="margin: 12px 0 0 0; color: #505050; font-size: 16px; line-height: 1.6;">{intro}</p>' if intro else ''}
        </td>
    </tr>
    <tr>
        <td style="padding: 10px 40px 20px 40px; color: #505050; font-size: 16px; line-height: 1.6;">
            {body}
            {f'<p style="margin: 20px 0 0 0; color: #505050; font-size: 14px; line-height: 1.5;">{outro}</p>' if outro else ''}
        </td>
    </tr>
    {self._get_unsubscribe_footer(user)}
</table>
        """
        return self._get_email_header_footer(content)

    def render_data_alert(self, campaign, alert_data: dict, user) -> str:
        """Render a climate data alert email.
        alert_data dict: alert_type, region, metric_name, current_value,
                         threshold_value, description
        """
        dashboard_url = self.insights_url
        user_name = getattr(user, 'first_name', None) or 'there'

        content = f"""
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
    <tr>
        <td style="padding: 40px; background: linear-gradient(135deg, #D1583B 0%, #B84A2E 100%); border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 24px;">{alert_data.get('alert_type', 'Climate Alert')}</h1>
            <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">{alert_data.get('region', '')}</p>
        </td>
    </tr>
    <tr>
        <td style="padding: 30px 40px;">
            <p style="margin: 0 0 20px 0; color: #505050; font-size: 16px; line-height: 1.6;">Hi {user_name},</p>
            <div style="padding: 24px; background-color: #FDF6E3; border: 2px solid #D1583B; border-radius: 8px; text-align: center; margin-bottom: 20px;">
                <p style="margin: 0 0 4px 0; color: #505050; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">{alert_data.get('metric_name', 'Metric')}</p>
                <p style="margin: 0; color: #D1583B; font-size: 36px; font-weight: 700;">{alert_data.get('current_value', '')}</p>
                {f'<p style="margin: 4px 0 0 0; color: #999; font-size: 13px;">Threshold: {alert_data["threshold_value"]}</p>' if alert_data.get('threshold_value') else ''}
            </div>
            <p style="margin: 0 0 24px 0; color: #505050; font-size: 16px; line-height: 1.6;">{alert_data.get('description', '')}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                    <td align="center" style="padding: 10px 0;">
                        <a href="{dashboard_url}" style="display: inline-block; padding: 16px 40px; background-color: #5B6830; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">View Dashboard</a>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
    {self._get_unsubscribe_footer(user)}
</table>
        """
        return self._get_email_header_footer(content)

    def _get_unsubscribe_footer(self, user) -> str:
        """Standard email footer with manage preferences link (satisfies NZ UEM Act 2007)."""
        preferences_url = self.insights_url

        return f"""
    <tr>
        <td style="padding: 30px; background-color: #f8f9fa; text-align: center; border-radius: 0 0 8px 8px;">
            <p style="margin: 0 0 8px 0; color: #999999; font-size: 12px;">
                Don't want these emails? <a href="{preferences_url}" style="color: #999999; text-decoration: underline;">Manage your email preferences</a>
            </p>
            <p style="margin: 0; color: #999999; font-size: 12px;">&copy; {__import__('datetime').datetime.now().year} Auxein Limited, New Zealand</p>
        </td>
    </tr>"""

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
            <h1 style="margin: 0; color: #ffffff; font-size: 28px;">Auxein Insights</h1>
        </td>
    </tr>
    <tr>
        <td style="padding: 40px;">
            <h2 style="margin: 0 0 20px 0; color: #2F2F2F;">Confirm your email address</h2>
            <p style="margin: 0 0 20px 0; color: #505050; font-size: 16px; line-height: 1.6;">
                Hi {name}, thanks for creating an Auxein Insights account. Confirm your email address to finish setting it up.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                    <td align="center" style="padding: 20px 0;">
                        <a href="{verification_url}" style="display: inline-block; padding: 16px 40px; background-color: #D1583B; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">Confirm email address</a>
                    </td>
                </tr>
            </table>
            <p style="margin: 20px 0 0 0; color: #999999; font-size: 13px; line-height: 1.6;">
                This link expires in 24 hours. If you did not create an account, you can ignore this email and nothing further will happen.
            </p>
        </td>
    </tr>
    <tr>
        <td style="padding: 30px; background-color: #f8f9fa; text-align: center;">
            <p style="margin: 0; color: #999999; font-size: 12px;">&copy; {datetime.now().year} Auxein Limited</p>
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
            <h1 style="margin: 0; color: #ffffff; font-size: 28px;">Auxein Insights</h1>
        </td>
    </tr>
    <tr>
        <td style="padding: 40px;">
            <h2 style="margin: 0 0 20px 0; color: #2F2F2F;">Reset your password</h2>
            <p style="margin: 0 0 20px 0; color: #505050; font-size: 16px; line-height: 1.6;">
                Hi {name}, we received a request to reset the password on your Auxein Insights account.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                    <td align="center" style="padding: 20px 0;">
                        <a href="{reset_url}" style="display: inline-block; padding: 16px 40px; background-color: #D1583B; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">Set a new password</a>
                    </td>
                </tr>
            </table>
            <p style="margin: 20px 0 0 0; color: #D1583B; font-size: 14px;">⚠️ This link expires in 1 hour.</p>
        </td>
    </tr>
    <tr>
        <td style="padding: 30px; background-color: #f8f9fa; text-align: center;">
            <p style="margin: 0; color: #999999; font-size: 12px;">&copy; {datetime.now().year} Auxein Limited</p>
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
            <h1 style="margin: 0; color: #ffffff; font-size: 28px;">Auxein Insights</h1>
        </td>
    </tr>
    <tr>
        <td style="padding: 40px;">
            <h2 style="margin: 0 0 20px 0; color: #2F2F2F;">Your account is ready</h2>
            <p style="margin: 0 0 20px 0; color: #505050; font-size: 16px; line-height: 1.6;">
                Hi {name}, you now have the full regional picture: the climate record back to 1986, how the current season compares with it, and the national climate Atlas at 500 m resolution. It is free and it stays free.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                    <td align="center" style="padding: 20px 0;">
                        <a href="{self.insights_url}" style="display: inline-block; padding: 16px 40px; background-color: #5B6830; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">Explore your region</a>
                    </td>
                </tr>
            </table>
            <div style="margin: 30px 0 0 0; padding: 20px; background-color: #FDF6E3; border: 1px solid #E4D9BC; border-radius: 8px;">
                <h3 style="margin: 0 0 10px 0; color: #2F2F2F; font-size: 16px;">Need your own site rather than the region?</h3>
                <p style="margin: 0 0 10px 0; color: #505050; font-size: 14px; line-height: 1.6;">
                    Insights Pro resolves the climate surface to a point you choose and gives you that point's own record and its own normal.
                </p>
                <a href="{self.insights_url}/pro" style="color: #D1583B; font-weight: 600; font-size: 14px;">About Insights Pro</a>
            </div>
        </td>
    </tr>
    <tr>
        <td style="padding: 30px; background-color: #f8f9fa; text-align: center;">
            <p style="margin: 0; color: #999999; font-size: 12px;">&copy; {datetime.now().year} Auxein Limited</p>
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
            <p style="margin: 0; color: #999999; font-size: 12px;">&copy; {datetime.now().year} Auxein Limited</p>
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
            <p style="margin: 0; color: #999999; font-size: 12px;">&copy; {datetime.now().year} Auxein Limited</p>
        </td>
    </tr>
</table>
        """
        return self._get_email_header_footer(content)


# Create singleton instance
email_service = UnifiedEmailService()