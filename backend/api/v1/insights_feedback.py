# api/v1/insights_feedback.py — Public Insights subscriber feedback form.
#
# Distinct from api/v1/feedback.py (auth-required in-app feedback to grow@).
# This endpoint is PUBLIC (no auth), accepts JSON, persists nothing, and emails
# the response to insights@auxein.co.nz via the existing mail service.
import logging
import re
import threading
import time
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from services.email_service import email_service

logger = logging.getLogger(__name__)
router = APIRouter()

EMPTY = "—"
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

# --- In-memory rate limiter -------------------------------------------------
# Per-IP sliding window. Deliberately simple and process-local — deters casual
# abuse without a datastore. Note: under multiple gunicorn workers/instances
# the limit is per-process, so the effective global ceiling is higher.
_RATE_LIMIT = 5            # submissions allowed per window
_RATE_WINDOW = 3600        # seconds (1 hour)
_rate_hits: dict[str, list[float]] = {}
_rate_lock = threading.Lock()


def _client_ip(request: Request) -> str:
    """Real client IP, honouring the load balancer's X-Forwarded-For."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(ip: str) -> bool:
    """Return True if the request is allowed; record the hit if so."""
    now = time.time()
    with _rate_lock:
        hits = [t for t in _rate_hits.get(ip, []) if now - t < _RATE_WINDOW]
        if len(hits) >= _RATE_LIMIT:
            _rate_hits[ip] = hits
            return False
        hits.append(now)
        _rate_hits[ip] = hits
        return True


# --- Payload ----------------------------------------------------------------
class FeedbackPayload(BaseModel):
    """Section 6 of the build spec. Everything optional except regions."""
    regions: List[str] = Field(..., min_length=1)
    usageFrequency: Optional[str] = None
    newMetricsUseful: List[str] = Field(default_factory=list)
    missingMetric: Optional[str] = None
    easeOfUseScore: Optional[int] = Field(default=None, ge=1, le=5)
    frictionPoint: Optional[str] = None
    device: Optional[str] = None
    painBeyondClimate: Optional[str] = None
    worthPayingFor: Optional[str] = None
    anythingElse: Optional[str] = None
    replyEmail: str = Field(..., min_length=3)


def _text(value: Optional[str]) -> str:
    v = (value or "").strip()
    return v if v else EMPTY


def _list(values: List[str]) -> str:
    items = [v.strip() for v in (values or []) if v and v.strip()]
    return ", ".join(items) if items else EMPTY


def _scale(value: Optional[int]) -> str:
    return str(value) if value is not None else EMPTY


@router.post("", status_code=status.HTTP_200_OK)
async def submit_insights_feedback(payload: FeedbackPayload, request: Request):
    """Email a public Insights feedback submission to insights@auxein.co.nz.

    No persistence, no logging of response content (PII-safe).
    """
    reply_email = (payload.replyEmail or "").strip()
    if not EMAIL_RE.match(reply_email):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A valid email address is required.",
        )

    ip = _client_ip(request)
    if not _check_rate_limit(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many submissions. Please try again later.",
        )

    # Build the ordered, sectioned body (spec section 7). Empties render as EMPTY.
    sections = [
        ("About you", [
            ("Region(s)", _list(payload.regions)),
            ("Usage frequency", _text(payload.usageFrequency)),
        ]),
        ("Metrics", [
            ("New metrics they'll use", _list(payload.newMetricsUseful)),
            ("Missing metric", _text(payload.missingMetric)),
        ]),
        ("Usability", [
            ("Ease of use (1–5)", _scale(payload.easeOfUseScore)),
            ("Friction point", _text(payload.frictionPoint)),
            ("Device", _text(payload.device)),
        ]),
        ("Beyond climate", [
            ("Biggest pain outside climate", _text(payload.painBeyondClimate)),
            ("Worth paying for", _text(payload.worthPayingFor)),
        ]),
        ("Close", [
            ("Anything else", _text(payload.anythingElse)),
            ("Reply email", reply_email),
        ]),
    ]

    subject_regions = _list(payload.regions)

    ok = email_service.send_insights_feedback(
        sections=sections,
        subject_regions=subject_regions,
        reply_to=reply_email,
    )

    if not ok:
        # Do not log payload content — PII-safe.
        logger.error("Insights feedback email failed to send")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Couldn't send feedback right now. Try again shortly.",
        )

    return {"status": "ok"}
