# backend/api/v1/email_campaigns.py - Email Newsletter API endpoints
import os
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy import desc
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.email_campaign import EmailTemplate, EmailCampaign, EmailSend
from db.models.public_user import PublicUser
from db.models.article import Article
from core.public_security import get_current_public_user
from core.admin_security import require_admin
from services.email_service import email_service
from schemas.email_campaign import (
    EmailTemplateResponse, CampaignCreate, CampaignUpdate,
    CampaignResponse, CampaignListResponse, CampaignStatsResponse,
    CampaignSendRequest, CampaignTestSendRequest,
    EmailPreferencesUpdate, EmailPreferencesResponse,
    EstimateRecipientsRequest,
)

router = APIRouter()


# ========== ADMIN: Templates ==========

@router.get("/admin/email/templates", response_model=List[EmailTemplateResponse])
async def list_templates(db: Session = Depends(get_db),
                         admin: PublicUser = Depends(require_admin)):
    """List all active email templates (admin only)."""
    templates = db.query(EmailTemplate).filter(
        EmailTemplate.is_active == True
    ).order_by(EmailTemplate.name).all()
    return [EmailTemplateResponse.model_validate(t) for t in templates]


@router.get("/admin/email/templates/{template_id}", response_model=EmailTemplateResponse)
async def get_template(template_id: int, db: Session = Depends(get_db),
                       admin: PublicUser = Depends(require_admin)):
    """Get a single email template by ID (admin only)."""
    template = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return EmailTemplateResponse.model_validate(template)


# ========== ADMIN: Campaigns ==========

@router.get("/admin/email/campaigns", response_model=CampaignListResponse)
async def list_campaigns(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=50),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db), admin: PublicUser = Depends(require_admin),
):
    """List all campaigns with optional status filter (admin only)."""
    query = db.query(EmailCampaign)
    if status_filter:
        query = query.filter(EmailCampaign.status == status_filter)
    total = query.count()
    campaigns = query.order_by(desc(EmailCampaign.created_at)).offset(
        (page - 1) * page_size).limit(page_size).all()
    return CampaignListResponse(
        items=[CampaignResponse.model_validate(c) for c in campaigns],
        total=total, page=page, page_size=page_size,
    )


@router.get("/admin/email/campaigns/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(campaign_id: int, db: Session = Depends(get_db),
                       admin: PublicUser = Depends(require_admin)):
    """Get a single campaign by ID (admin only)."""
    campaign = db.query(EmailCampaign).filter(EmailCampaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return CampaignResponse.model_validate(campaign)


@router.post("/admin/email/campaigns/estimate-recipients")
async def estimate_recipients(
    data: EstimateRecipientsRequest,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Estimate number of recipients based on targeting criteria."""
    query = db.query(PublicUser).filter(
        PublicUser.is_active == True,
        PublicUser.is_verified == True,
        PublicUser.newsletter_opt_in == True,
    )
    if data.target_regions:
        query = query.filter(PublicUser.region_of_interest.in_(data.target_regions))
    if data.target_tiers:
        query = query.filter(PublicUser.subscription_tier.in_(data.target_tiers))
    total = query.count()
    preview = query.order_by(PublicUser.last_name, PublicUser.first_name).limit(50).all()
    return {
        "count": total,
        "preview": [
            {
                "email": u.email,
                "first_name": u.first_name or "",
                "last_name": u.last_name or "",
                "region": u.region_of_interest or "",
            }
            for u in preview
        ],
    }


@router.post("/admin/email/campaigns", response_model=CampaignResponse, status_code=201)
async def create_campaign(data: CampaignCreate, db: Session = Depends(get_db),
                          admin: PublicUser = Depends(require_admin)):
    """Create a new email campaign (admin only)."""
    template = db.query(EmailTemplate).filter(EmailTemplate.id == data.template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    campaign = EmailCampaign(
        template_id=data.template_id, subject=data.subject,
        body_html=data.body_html, body_preview_text=data.body_preview_text,
        intro_text=data.intro_text, outro_text=data.outro_text,
        article_ids=data.article_ids, research_ids=data.research_ids,
        target_regions=data.target_regions, target_tiers=data.target_tiers,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return CampaignResponse.model_validate(campaign)


@router.put("/admin/email/campaigns/{campaign_id}", response_model=CampaignResponse)
async def update_campaign(campaign_id: int, data: CampaignUpdate,
                          db: Session = Depends(get_db),
                          admin: PublicUser = Depends(require_admin)):
    """Update a draft or scheduled campaign (admin only)."""
    campaign = db.query(EmailCampaign).filter(EmailCampaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status not in ("draft", "scheduled"):
        raise HTTPException(status_code=400, detail="Cannot edit a sent campaign")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(campaign, key, value)
    db.commit()
    db.refresh(campaign)
    return CampaignResponse.model_validate(campaign)


@router.post("/admin/email/campaigns/{campaign_id}/preview")
async def preview_campaign(campaign_id: int, db: Session = Depends(get_db),
                           admin: PublicUser = Depends(require_admin)):
    """Render a live preview of a campaign using template rendering (admin only)."""
    campaign = db.query(EmailCampaign).filter(EmailCampaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    template = db.query(EmailTemplate).filter(
        EmailTemplate.id == campaign.template_id
    ).first()

    rendered_html = campaign.body_html or ""

    # Render using the appropriate template method
    if template and campaign.article_ids:
        article = db.query(Article).filter(Article.id == campaign.article_ids[0]).first()
        if article:
            article_dict = {
                "title": article.title,
                "excerpt": article.excerpt or "",
                "slug": article.slug,
                "featured_image_url": article.featured_image_url,
            }
            if template.template_type == "spotlight":
                rendered_html = email_service.render_article_spotlight(campaign, article_dict, admin)
            elif template.template_type == "roundup":
                rendered_html = email_service.render_weekly_roundup(campaign, article_dict, admin)

    if template and template.template_type == "data_alert":
        sample_alert = {
            "alert_type": "Disease Pressure",
            "region": (campaign.target_regions or ["Marlborough"])[0],
            "metric_name": "Botrytis Risk Index",
            "current_value": "High",
            "threshold_value": "Moderate",
            "description": "Disease pressure has exceeded the alert threshold for this region.",
        }
        rendered_html = email_service.render_data_alert(campaign, sample_alert, admin)

    return {
        "subject": campaign.subject,
        "body_html": rendered_html,
        "preview_text": campaign.body_preview_text,
    }


@router.post("/admin/email/campaigns/{campaign_id}/test-send")
async def test_send_campaign(
    campaign_id: int, data: CampaignTestSendRequest,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Send a single test email for a campaign to a specific address (admin only)."""
    campaign = db.query(EmailCampaign).filter(EmailCampaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    template = db.query(EmailTemplate).filter(
        EmailTemplate.id == campaign.template_id
    ).first()

    # Use a dummy user object for rendering so test emails don't expose real tokens
    class _TestUser:
        unsubscribe_token = "test-preview"
        first_name = "Test"
        last_name = "Recipient"
        email = data.email

    test_user = _TestUser()

    rendered_html = campaign.body_html or ""

    if template and campaign.article_ids:
        article = db.query(Article).filter(Article.id == campaign.article_ids[0]).first()
        if article:
            article_dict = {
                "title": article.title,
                "excerpt": article.excerpt or "",
                "slug": article.slug,
                "featured_image_url": article.featured_image_url,
            }
            if template.template_type == "spotlight":
                rendered_html = email_service.render_article_spotlight(campaign, article_dict, test_user)
            elif template.template_type == "roundup":
                rendered_html = email_service.render_weekly_roundup(campaign, article_dict, test_user)

    if template and template.template_type == "data_alert":
        sample_alert = {
            "alert_type": "Disease Pressure",
            "region": (campaign.target_regions or ["Marlborough"])[0],
            "metric_name": "Botrytis Risk Index",
            "current_value": "High",
            "threshold_value": "Moderate",
            "description": "Disease pressure has exceeded the alert threshold for this region.",
        }
        rendered_html = email_service.render_data_alert(campaign, sample_alert, test_user)

    email_service._send_email(
        to_email=data.email,
        subject=f"[TEST] {campaign.subject}",
        html_content=rendered_html,
    )

    return {"detail": f"Test email sent to {data.email}"}


@router.post("/admin/email/campaigns/{campaign_id}/send")
async def send_campaign(
    campaign_id: int, data: CampaignSendRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Send or schedule a campaign (admin only)."""
    campaign = db.query(EmailCampaign).filter(EmailCampaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status not in ("draft", "scheduled"):
        raise HTTPException(status_code=400, detail="Campaign already sent or sending")

    if data.scheduled_at:
        campaign.status = "scheduled"
        campaign.scheduled_at = data.scheduled_at
        db.commit()
        return {"detail": "Campaign scheduled", "scheduled_at": str(data.scheduled_at)}

    # Build recipient list based on targeting
    query = db.query(PublicUser).filter(
        PublicUser.is_active == True,
        PublicUser.is_verified == True,
        PublicUser.newsletter_opt_in == True,
    )
    if campaign.target_regions:
        query = query.filter(PublicUser.region_of_interest.in_(campaign.target_regions))
    if campaign.target_tiers:
        query = query.filter(PublicUser.subscription_tier.in_(campaign.target_tiers))

    recipients = query.all()
    if not recipients:
        raise HTTPException(status_code=400, detail="No matching recipients")

    # Create send records
    for user in recipients:
        send = EmailSend(
            campaign_id=campaign.id,
            user_id=user.id,
            email_address=user.email,
        )
        db.add(send)

    campaign.status = "sending"
    campaign.recipients_count = len(recipients)
    db.commit()

    # Queue actual sending in background
    background_tasks.add_task(_send_campaign_emails, campaign.id)

    return {
        "detail": "Campaign sending started",
        "recipients_count": len(recipients),
    }


@router.get("/admin/email/campaigns/{campaign_id}/stats", response_model=CampaignStatsResponse)
async def campaign_stats(campaign_id: int, db: Session = Depends(get_db),
                         admin: PublicUser = Depends(require_admin)):
    """Get detailed campaign stats (admin only)."""
    campaign = db.query(EmailCampaign).filter(EmailCampaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    open_rate = (campaign.opens_count / campaign.recipients_count * 100) if campaign.recipients_count else 0
    click_rate = (campaign.clicks_count / campaign.recipients_count * 100) if campaign.recipients_count else 0
    return CampaignStatsResponse(
        campaign_id=campaign.id, subject=campaign.subject,
        status=campaign.status, recipients_count=campaign.recipients_count,
        opens_count=campaign.opens_count, clicks_count=campaign.clicks_count,
        unsubscribes_count=campaign.unsubscribes_count,
        open_rate=round(open_rate, 1), click_rate=round(click_rate, 1),
        sent_at=campaign.sent_at,
    )


# ========== PUBLIC: Email Preferences ==========

@router.get("/public/email/preferences", response_model=EmailPreferencesResponse)
async def get_preferences(current_user: PublicUser = Depends(get_current_public_user)):
    """Get current user's email preferences."""
    return EmailPreferencesResponse(
        newsletter_opt_in=current_user.newsletter_opt_in,
        marketing_opt_in=current_user.marketing_opt_in,
        research_opt_in=current_user.research_opt_in,
        frequency_preference=current_user.frequency_preference or "weekly",
        preferred_regions=current_user.preferred_regions,
    )


@router.put("/public/email/preferences", response_model=EmailPreferencesResponse)
async def update_preferences(
    data: EmailPreferencesUpdate, db: Session = Depends(get_db),
    current_user: PublicUser = Depends(get_current_public_user),
):
    """Update current user's email preferences."""
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(current_user, key, value)
    db.commit()
    db.refresh(current_user)
    return EmailPreferencesResponse(
        newsletter_opt_in=current_user.newsletter_opt_in,
        marketing_opt_in=current_user.marketing_opt_in,
        research_opt_in=current_user.research_opt_in,
        frequency_preference=current_user.frequency_preference or "weekly",
        preferred_regions=current_user.preferred_regions,
    )


@router.get("/public/email/unsubscribe/{token}")
async def unsubscribe(token: str, db: Session = Depends(get_db)):
    """One-click unsubscribe (no auth required, uses token from email). Returns HTML page."""
    from fastapi.responses import HTMLResponse

    user = db.query(PublicUser).filter(PublicUser.unsubscribe_token == token).first()
    if not user:
        return HTMLResponse(content="""<!DOCTYPE html><html><head><title>Unsubscribe</title>
        <style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f9fafb;}
        .card{background:white;border-radius:12px;padding:3rem;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:400px;}
        h2{color:#374151;margin:0 0 0.5rem;} p{color:#6b7280;}</style></head>
        <body><div class="card"><h2>Invalid Link</h2><p>This unsubscribe link is invalid or has expired.</p></div></body></html>""",
        status_code=404)

    user.newsletter_opt_in = False
    user.marketing_opt_in = False
    db.commit()

    return HTMLResponse(content=f"""<!DOCTYPE html><html><head><title>Unsubscribed</title>
    <style>body{{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f9fafb;}}
    .card{{background:white;border-radius:12px;padding:3rem;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:400px;}}
    h2{{color:#446145;margin:0 0 0.5rem;}} p{{color:#6b7280;}} .check{{font-size:3rem;margin-bottom:1rem;}}</style></head>
    <body><div class="card"><div class="check">&#10003;</div><h2>Unsubscribed</h2>
    <p>You've been successfully unsubscribed from Auxein Insights emails.</p>
    <p style="margin-top:1.5rem;font-size:0.85rem;">Changed your mind? Log in at <a href="{os.getenv('REGIONAL_INTELLIGENCE_URL', 'http://localhost:5174')}" style="color:#446145;">Auxein Insights</a> to manage your preferences.</p>
    </div></body></html>""")


# ========== Background task ==========

def _send_campaign_emails(campaign_id: int):
    """Background task to send personalized emails for a campaign."""
    from db.session import SessionLocal
    db = SessionLocal()
    try:
        campaign = db.query(EmailCampaign).filter(EmailCampaign.id == campaign_id).first()
        if not campaign:
            return

        template = db.query(EmailTemplate).filter(
            EmailTemplate.id == campaign.template_id
        ).first()

        # Pre-load article for spotlight/roundup templates
        article_dict = None
        if campaign.article_ids:
            article = db.query(Article).filter(Article.id == campaign.article_ids[0]).first()
            if article:
                article_dict = {
                    "title": article.title,
                    "excerpt": article.excerpt or "",
                    "slug": article.slug,
                    "featured_image_url": article.featured_image_url,
                }

        sends = db.query(EmailSend).filter(
            EmailSend.campaign_id == campaign_id,
            EmailSend.status == "queued",
        ).all()

        for send in sends:
            try:
                # Render personalized HTML per user (for unsubscribe token)
                user = db.query(PublicUser).filter(PublicUser.id == send.user_id).first()
                html_content = campaign.body_html or ""

                if template and user:
                    if template.template_type in ("spotlight", "roundup") and article_dict:
                        render_fn = (email_service.render_article_spotlight
                                     if template.template_type == "spotlight"
                                     else email_service.render_weekly_roundup)
                        html_content = render_fn(campaign, article_dict, user)
                    elif template.template_type == "data_alert":
                        alert_data = {
                            "alert_type": "Climate Alert",
                            "region": (campaign.target_regions or [""])[0],
                            "metric_name": "Alert",
                            "current_value": "",
                            "description": campaign.intro_text or "",
                        }
                        html_content = email_service.render_data_alert(campaign, alert_data, user)

                email_service._send_email(
                    to_email=send.email_address,
                    subject=campaign.subject,
                    html_content=html_content,
                )
                send.status = "sent"
                send.sent_at = datetime.now(timezone.utc)
            except Exception:
                send.status = "failed"
            db.commit()

        campaign.status = "sent"
        campaign.sent_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()
