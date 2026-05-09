"""Brand abstraction for outgoing emails and other user-facing surfaces.

Background: prior to 2026-05-08, every outgoing email said "Auxein Insights"
in the header and copy, used a single FRONTEND_URL env var (which fell back to
localhost in prod because it was never set), and pointed at support@auxein.co.nz
regardless of context. With three apps live (Grow operator tool, Regional
Insights public app, marketing site) we need brand-aware emails so that an
invitation to the Grow web app says "Auxein Grow" and links to grow.auxein.co.nz,
not the wrong app.

Usage:
    from core.branding import Brand, GROW

    def send_invitation(email, token, brand: Brand = GROW):
        link = f"{brand.frontend_url}/accept-invitation?token={token}"
        subject = f"You're invited to {brand.display_name}"
        ...

The default for everything in core/email_utils.py is GROW because every
caller in auth.py / invitations.py / admin.py / contractor flows is operating
on the Grow web app. Insights public-user emails go through a separate path
(services/email_service.py UnifiedEmailService) and are unaffected by this
module.
"""
from dataclasses import dataclass

from core.config import settings


@dataclass(frozen=True)
class Brand:
    """A single product brand. All values are end-user-visible."""
    key: str               # short identifier, never shown to users
    display_name: str      # e.g. "Auxein Grow" — used in subject lines, headers, copy
    support_email: str     # user-facing "need help?" address
    frontend_url: str      # base URL for links inside emails (no trailing slash)
    from_name: str         # SMTP From: display name


GROW = Brand(
    key="grow",
    display_name="Auxein Grow",
    support_email=settings.GROW_SUPPORT_EMAIL,
    frontend_url=settings.GROW_FRONTEND_URL.rstrip("/"),
    from_name="Auxein Grow",
)


INSIGHTS = Brand(
    key="insights",
    display_name="Auxein Regional Insights",
    support_email=settings.INSIGHTS_SUPPORT_EMAIL,
    frontend_url=settings.INSIGHTS_FRONTEND_URL.rstrip("/"),
    from_name="Auxein Regional Insights",
)


# Default brand for anything in core/email_utils.py + core/email_templates.py
# that doesn't explicitly opt into another brand. Almost every caller of those
# modules is in a Grow context (vineyard operator flows).
DEFAULT = GROW
