# api/v1/insights_pro.py — pricing, the Grow comparison, and Pro enquiries.
"""
Public endpoints behind the /pro page.

    GET  /pricing        the rates, so the page never hardcodes a price
    POST /pricing-quote  record one run of the calculator
    POST /enquiry        record + email somebody asking for Pro

THE SERVER OWNS THE PRICES. The page fetches them rather than carrying its own
copy, and `/pricing-quote` recomputes every total from the visitor's inputs
instead of storing what the client posted. Two reasons, and the second is the
important one:

  1. A price that lives in two places drifts, and of all the values in this
     product a price is the worst one to have two versions of.
  2. `insights_pricing_quote` is meant to answer "what are people quoting
     themselves, at what scale". If the client can post the totals, the answer
     is "whatever a stranger typed", and the table is decoration.

NO SELF-SERVE PURCHASE EXISTS. Decided 2026-08-20: access is arranged by
enquiry and invoiced through Xero, matching Grow. Nothing here takes a payment,
and nothing here should ever grow a card field.
"""
from __future__ import annotations

import logging
import os
import re
import threading
import time
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.insights_pro import InsightsPricingQuote, InsightsProEnquiry
from db.models.public_user import PublicUser
from core.public_security import get_optional_public_user
from services.email_service import email_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["insights-pro"])


# =============================================================================
# PRICES
# =============================================================================
# Quoted EXCLUSIVE of GST, which is how they were given and how they are shown.
# The inclusive figure is derived here rather than in the browser so that the
# page cannot round it differently from the record in the database.
#
# GROW IS THE 12-MONTH COMMITTED RATE. Grow has two rates — a rolling monthly
# and a committed annual — and they are a COMMITMENT TERM, not a billing
# cadence. Calling this "yearly billing" conflates the discounted rate with the
# invoice schedule, which Xero owns and this product does not model. The label
# below says "committed" for that reason; do not shorten it to "annual".
PRO_ANNUAL_PER_SITE_EX_GST = Decimal('600.00')
GROW_ANNUAL_PER_HA_EX_GST = Decimal('85.00')

# Grow only. Insights Pro has NO setup fee, confirmed 2026-08-20, and that is
# a selling point rather than an omission — the /pro page says so.
#
# It is charged once, in year one, and it moves the crossover a long way:
# ongoing breakeven is 7.06 ha (600/85) but first-year breakeven is 4.12 ha
# ((600-250)/85). Between those, Pro is cheaper in year one and Grow is cheaper
# thereafter, so both comparisons are computed and both are recorded.
GROW_SETUP_ONE_OFF_EX_GST = Decimal('250.00')
GST_RATE = Decimal('0.15')          # New Zealand
CURRENCY = 'NZD'

# Guard rails on what a visitor may enter. Not validation theatre: without an
# upper bound a bored visitor stores a quote for four million hectares and the
# usage data has to be filtered forever afterwards.
MAX_HECTARES = Decimal('100000')
MAX_SITES = 500


def _money(value: Decimal) -> Decimal:
    """Two decimal places, half-up. Money is never a float here."""
    return value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _with_gst(ex: Decimal) -> Decimal:
    return _money(ex * (Decimal('1') + GST_RATE))


# =============================================================================
# RATE LIMITING
# =============================================================================
# Same shape as insights_feedback.py: per-IP sliding window, in-process and
# deliberately simple. Under multiple gunicorn workers the ceiling is per
# worker, so this deters casual abuse rather than a determined attacker.
#
# The IP is used for the length of the request and never stored — see the
# migration. Two different limits because the two endpoints are abused
# differently: the calculator is cheap and legitimately repeated, an enquiry
# sends mail.
_QUOTE_LIMIT, _QUOTE_WINDOW = 60, 3600
_ENQUIRY_LIMIT, _ENQUIRY_WINDOW = 5, 3600

_hits: dict[str, list[float]] = {}
_hits_lock = threading.Lock()


def _client_ip(request: Request) -> str:
    fwd = request.headers.get('x-forwarded-for')
    if fwd:
        return fwd.split(',')[0].strip()
    return request.client.host if request.client else 'unknown'


def _allow(bucket: str, ip: str, limit: int, window: int) -> bool:
    key = f'{bucket}:{ip}'
    now = time.time()
    with _hits_lock:
        recent = [t for t in _hits.get(key, []) if now - t < window]
        if len(recent) >= limit:
            _hits[key] = recent
            return False
        recent.append(now)
        _hits[key] = recent
        return True


EMAIL_RE = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')


def _clean(value: Optional[str], limit: int) -> Optional[str]:
    """Trim, collapse to None when empty, and cut to the column width."""
    if value is None:
        return None
    trimmed = ' '.join(str(value).split())
    return trimmed[:limit] or None


# =============================================================================
# GET /pricing
# =============================================================================
class RateOut(BaseModel):
    ex_gst: Decimal
    inc_gst: Decimal
    unit: str
    label: str
    # One-off charges, separate from the recurring rate. None for Insights Pro.
    setup_ex_gst: Optional[Decimal] = None
    setup_inc_gst: Optional[Decimal] = None


class PricingOut(BaseModel):
    currency: str
    gst_rate: Decimal
    pro: RateOut
    grow: RateOut
    # True while Pro is included with a Grow subscription. The /pro page states
    # this and `entitlements.is_pro` already implements it, so it travels with
    # the prices rather than being asserted separately in the copy.
    grow_includes_pro: bool


@router.get('/pricing', response_model=PricingOut)
def get_pricing():
    """The current rates. Cached hard — these change about never."""
    return PricingOut(
        currency=CURRENCY,
        gst_rate=GST_RATE,
        pro=RateOut(
            ex_gst=_money(PRO_ANNUAL_PER_SITE_EX_GST),
            inc_gst=_with_gst(PRO_ANNUAL_PER_SITE_EX_GST),
            unit='site / year',
            label='Insights Pro',
        ),
        grow=RateOut(
            ex_gst=_money(GROW_ANNUAL_PER_HA_EX_GST),
            inc_gst=_with_gst(GROW_ANNUAL_PER_HA_EX_GST),
            unit='hectare / year',
            label='Auxein Grow, 12-month committed rate',
            setup_ex_gst=_money(GROW_SETUP_ONE_OFF_EX_GST),
            setup_inc_gst=_with_gst(GROW_SETUP_ONE_OFF_EX_GST),
        ),
        grow_includes_pro=True,
    )


# =============================================================================
# POST /pricing-quote
# =============================================================================
class QuoteIn(BaseModel):
    """Inputs only. There is deliberately no field for a total."""
    hectares: Decimal = Field(..., ge=0)
    sites: int = Field(..., ge=0)
    session_key: Optional[str] = Field(None, max_length=64)


class QuoteOut(BaseModel):
    hectares: Decimal
    sites: int
    pro_annual_ex_gst: Decimal
    pro_annual_inc_gst: Decimal
    # Grow's recurring annual cost, setup excluded.
    grow_annual_ex_gst: Decimal
    grow_annual_inc_gst: Decimal
    grow_setup_ex_gst: Decimal
    grow_first_year_ex_gst: Decimal
    grow_first_year_inc_gst: Decimal
    # Ongoing verdict.
    cheaper: str
    difference_ex_gst: Decimal
    difference_inc_gst: Decimal
    # Year-one verdict. Differs from the above between 4.12 and 7.06 ha.
    cheaper_first_year: str
    difference_first_year_ex_gst: Decimal


def _verdict(pro: Decimal, grow: Decimal) -> str:
    if pro == grow:
        return 'equal'
    return 'grow' if grow < pro else 'pro'


def _compute(hectares: Decimal, sites: int) -> dict:
    """Both comparisons. Pro has no setup fee, so its two are the same figure."""
    pro_ex = _money(PRO_ANNUAL_PER_SITE_EX_GST * Decimal(sites))
    grow_ex = _money(GROW_ANNUAL_PER_HA_EX_GST * hectares)
    grow_first_ex = _money(grow_ex + GROW_SETUP_ONE_OFF_EX_GST)

    return {
        'pro_ex': pro_ex,
        'grow_ex': grow_ex,
        'grow_setup_ex': _money(GROW_SETUP_ONE_OFF_EX_GST),
        'grow_first_ex': grow_first_ex,
        'cheaper': _verdict(pro_ex, grow_ex),
        'difference_ex': _money(abs(pro_ex - grow_ex)),
        'cheaper_first': _verdict(pro_ex, grow_first_ex),
        'difference_first_ex': _money(abs(pro_ex - grow_first_ex)),
    }


@router.post('/pricing-quote', response_model=QuoteOut)
def record_pricing_quote(
    payload: QuoteIn,
    request: Request,
    db: Session = Depends(get_db),
    user: Optional[PublicUser] = Depends(get_optional_public_user),
):
    """
    Compute a comparison and record that it happened.

    Open to anonymous visitors on purpose — most people who price this up will
    never have an account, and a funnel measured only past the login wall
    measures the wrong thing.

    A failure to WRITE must not fail the response. The visitor asked for a
    number; analytics is our problem, not theirs.
    """
    if payload.hectares > MAX_HECTARES or payload.sites > MAX_SITES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='Those figures are outside the range this calculator covers.',
        )

    if not _allow('quote', _client_ip(request), _QUOTE_LIMIT, _QUOTE_WINDOW):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail='Too many calculations just now. Try again shortly.',
        )

    hectares = Decimal(payload.hectares).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    result = _compute(hectares, payload.sites)

    try:
        db.add(InsightsPricingQuote(
            public_user_id=user.id if user else None,
            hectares=hectares,
            sites=payload.sites,
            pro_annual_ex_gst=result['pro_ex'],
            grow_annual_ex_gst=result['grow_ex'],
            grow_setup_ex_gst=result['grow_setup_ex'],
            grow_first_year_ex_gst=result['grow_first_ex'],
            cheaper=result['cheaper'],
            difference_ex_gst=result['difference_ex'],
            cheaper_first_year=result['cheaper_first'],
            difference_first_year_ex_gst=result['difference_first_ex'],
            pro_rate_ex_gst=PRO_ANNUAL_PER_SITE_EX_GST,
            grow_rate_ex_gst=GROW_ANNUAL_PER_HA_EX_GST,
            session_key=_clean(payload.session_key, 64),
        ))
        db.commit()
    except Exception:
        db.rollback()
        logger.exception('pricing quote not recorded (answer still returned)')

    return QuoteOut(
        hectares=hectares,
        sites=payload.sites,
        pro_annual_ex_gst=result['pro_ex'],
        pro_annual_inc_gst=_with_gst(result['pro_ex']),
        grow_annual_ex_gst=result['grow_ex'],
        grow_annual_inc_gst=_with_gst(result['grow_ex']),
        grow_setup_ex_gst=result['grow_setup_ex'],
        grow_first_year_ex_gst=result['grow_first_ex'],
        grow_first_year_inc_gst=_with_gst(result['grow_first_ex']),
        cheaper=result['cheaper'],
        difference_ex_gst=result['difference_ex'],
        difference_inc_gst=_with_gst(result['difference_ex']),
        cheaper_first_year=result['cheaper_first'],
        difference_first_year_ex_gst=result['difference_first_ex'],
    )


# =============================================================================
# POST /enquiry
# =============================================================================
class EnquiryIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: str = Field(..., min_length=3, max_length=254)
    phone: Optional[str] = Field(None, max_length=40)
    business: Optional[str] = Field(None, max_length=160)
    region: Optional[str] = Field(None, max_length=120)
    hectares: Optional[Decimal] = Field(None, ge=0)
    sites: Optional[int] = Field(None, ge=0)
    message: Optional[str] = Field(None, max_length=4000)
    # Honeypot. A real form never fills this in because it is hidden; a bot
    # fills every field it finds. Cheaper and less hostile than a CAPTCHA.
    company_website: Optional[str] = Field(None, max_length=200)


@router.post('/enquiry', status_code=status.HTTP_201_CREATED)
def create_enquiry(
    payload: EnquiryIn,
    request: Request,
    db: Session = Depends(get_db),
    user: Optional[PublicUser] = Depends(get_optional_public_user),
):
    """
    Record an Insights Pro enquiry and email the inbox.

    The row is the point. Email can fail, inboxes get cleared, and a lead that
    exists only as a message is a lead that gets lost — so the DB write is what
    determines success and the email is best-effort on top of it.
    """
    # Honeypot: accept and discard. Telling a bot it failed teaches it to try
    # again with the field left blank.
    if payload.company_website:
        logger.info('pro enquiry rejected by honeypot')
        return {'ok': True, 'id': None}

    if not _allow('enquiry', _client_ip(request), _ENQUIRY_LIMIT, _ENQUIRY_WINDOW):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail='Too many enquiries from here just now. Try again shortly.',
        )

    name = _clean(payload.name, 120)
    email = _clean(payload.email, 254)
    if not name or not email or not EMAIL_RE.match(email):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='A name and a valid email address are needed.',
        )

    hectares = (Decimal(payload.hectares).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                if payload.hectares is not None else None)
    if hectares is not None and hectares > MAX_HECTARES:
        hectares = None
    sites = payload.sites if (payload.sites is not None and payload.sites <= MAX_SITES) else None

    enquiry = InsightsProEnquiry(
        public_user_id=user.id if user else None,
        name=name,
        email=email,
        phone=_clean(payload.phone, 40),
        business=_clean(payload.business, 160),
        region=_clean(payload.region, 120),
        hectares=hectares,
        sites=sites,
        message=(payload.message or '').strip()[:4000] or None,
        source='pro_page',
    )

    try:
        db.add(enquiry)
        db.commit()
        db.refresh(enquiry)
    except Exception:
        db.rollback()
        logger.exception('pro enquiry could not be saved')
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Couldn't record that just now. Please try again shortly.",
        )

    # Best-effort notification. A failure here is logged loudly — the enquiry
    # is safe in the table, but nobody is watching the table, so a silent email
    # failure means a real customer waits for a reply that is not coming.
    dash = '—'
    sections = [
        ('Who', [
            ('Name', name),
            ('Email', email),
            ('Phone', enquiry.phone or dash),
            ('Business', enquiry.business or dash),
            ('Account', user.email if user else 'Not signed in'),
        ]),
        ('What they want', [
            ('Region', enquiry.region or dash),
            ('Hectares', str(hectares) if hectares is not None else dash),
            ('Sites', str(sites) if sites is not None else dash),
            ('Message', enquiry.message or dash),
        ]),
    ]
    try:
        sent = email_service.send_insights_feedback(
            sections=sections,
            subject_regions=enquiry.region or '',
            reply_to=email,
            subject=f'Insights Pro enquiry — {name}',
            lead='A new Auxein Insights Pro enquiry was submitted.',
        )
        if not sent:
            logger.error('pro enquiry %s saved but notification email failed', enquiry.id)
    except Exception:
        logger.exception('pro enquiry %s saved but notification raised', enquiry.id)

    return {'ok': True, 'id': enquiry.id}
