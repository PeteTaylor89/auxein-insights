# backend_taste/services/email.py — transactional email for Taste.
#
# Mirrors the main API's UnifiedEmailService in mechanism (SMTP, same env var
# names, same `SEND_EMAILS` kill switch defaulting to off) without importing a
# line of it. The isolation this service keeps is code and data, not credentials
# — two apps sending through one verified sender is the same kind of sharing as
# two apps on one RDS instance.
#
# THREE RULES, all of which are about an auth route never being held hostage by
# a mail server:
#   1. Nothing here raises. Every send returns True/False and logs.
#   2. Every send is called from a BackgroundTask, so SMTP latency is not
#      request latency.
#   3. The socket has a timeout. smtplib will otherwise wait on the OS default,
#      which is minutes.
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional
from urllib.parse import quote

from core.config import settings

log = logging.getLogger(__name__)

# Inlined, because an email client will not fetch a stylesheet. Colours are the
# Taste claret/cream, hardcoded here on purpose: this renders in Gmail and
# Outlook, which have no CSS custom properties and no dark-mode token support.
_SHELL = """\
<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f6f1e7;font-family:Calibri,Segoe UI,Arial,sans-serif;color:#2a2018;">
    <div style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid #e7decb;border-radius:12px;padding:28px 24px;">
      <div style="font-size:20px;letter-spacing:0.5px;margin-bottom:4px;">
        <strong style="color:#7b2e3c;">Auxein</strong> Taste
      </div>
      <div style="height:1px;background:#e7decb;margin:16px 0 20px;"></div>
      {body}
      <div style="height:1px;background:#e7decb;margin:24px 0 14px;"></div>
      <p style="font-size:12px;color:#786c5e;margin:0;">
        {footer}
      </p>
    </div>
  </body>
</html>"""

_BUTTON = """\
<p style="margin:22px 0;">
  <a href="{url}" style="display:inline-block;background:#7b2e3c;color:#ffffff;text-decoration:none;
     padding:12px 22px;border-radius:999px;font-size:15px;">{label}</a>
</p>
<p style="font-size:12px;color:#786c5e;margin:0;">
  If the button does not work, paste this into your browser:<br>
  <span style="word-break:break-all;">{url}</span>
</p>"""


def _send(to_email: str, subject: str, html: str, text: str) -> bool:
    """Send one message. Never raises; returns whether it went out."""
    from_email = settings.FROM_EMAIL
    from_name = settings.FROM_NAME

    if not settings.SEND_EMAILS:
        # The safe default. Logged loudly enough to be usable in development,
        # where this is how you get the link.
        log.info("[DEV MODE] email NOT sent (SEND_EMAILS is off)")
        log.info("  to      : %s", to_email)
        log.info("  subject : %s", subject)
        log.info("  body    :\n%s", text)
        return True

    if not (settings.SMTP_USERNAME and settings.SMTP_PASSWORD and from_email):
        # Misconfiguration, not a transient failure. Loud, and still not fatal
        # to whatever request triggered it.
        log.error("SEND_EMAILS is on but SMTP is not configured — cannot send to %s", to_email)
        return False

    try:
        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = f"{from_name} <{from_email}>"
        message["To"] = to_email
        # Plain part first: the last part wins in an alternative container, so
        # this order is what makes the HTML the preferred rendering.
        message.attach(MIMEText(text, "plain"))
        message.attach(MIMEText(html, "html"))

        with smtplib.SMTP(
            settings.SMTP_SERVER, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_SECONDS
        ) as server:
            server.starttls()
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.sendmail(from_email, to_email, message.as_string())
        log.info("email sent to %s (%s)", to_email, subject)
        return True
    except Exception as exc:  # noqa: BLE001 — a mail failure must not surface as a 500
        log.error("failed to send email to %s: %s", to_email, exc)
        return False


def _link(path: str, token: str) -> str:
    base = settings.APP_URL.rstrip("/")
    # quote(), because a token is URL-safe base64 and the day someone changes
    # that generator is the day unquoted links silently break.
    return f"{base}{path}?token={quote(token)}"


def send_verification_email(to_email: str, token: str, name: Optional[str] = None) -> bool:
    url = _link("/verify", token)
    greeting = f"Hello {name}," if name else "Hello,"
    body = f"""\
      <p style="margin:0 0 12px;">{greeting}</p>
      <p style="margin:0 0 12px;">Confirm this address to finish setting up your Auxein Taste account.</p>
      {_BUTTON.format(url=url, label="Confirm my email")}"""
    html = _SHELL.format(
        body=body,
        footer="If you did not create an Auxein Taste account, you can ignore this email.",
    )
    text = (
        f"{greeting}\n\n"
        "Confirm this address to finish setting up your Auxein Taste account:\n\n"
        f"{url}\n\n"
        "If you did not create an Auxein Taste account, you can ignore this email.\n"
    )
    return _send(to_email, "Confirm your Auxein Taste email", html, text)


def send_password_reset_email(to_email: str, token: str, name: Optional[str] = None) -> bool:
    url = _link("/reset", token)
    greeting = f"Hello {name}," if name else "Hello,"
    body = f"""\
      <p style="margin:0 0 12px;">{greeting}</p>
      <p style="margin:0 0 12px;">Use the link below to choose a new password. It expires in two hours.</p>
      {_BUTTON.format(url=url, label="Choose a new password")}"""
    html = _SHELL.format(
        body=body,
        # Worth saying explicitly: it tells someone who did not ask for this
        # that no action is required, which is the honest and calming answer.
        footer=(
            "If you did not ask to reset your password, you can ignore this email "
            "&mdash; your current password still works."
        ),
    )
    text = (
        f"{greeting}\n\n"
        "Use the link below to choose a new password. It expires in two hours.\n\n"
        f"{url}\n\n"
        "If you did not ask to reset your password, you can ignore this email — "
        "your current password still works.\n"
    )
    return _send(to_email, "Reset your Auxein Taste password", html, text)
