# backend_taste/api/auth.py — Taste's own sign-up and sign-in (F1).
#
# Mounted at /taste/v1/auth. Every route here is anonymous except /me and the
# two that change a live session.
#
# EMAIL: `services/email.py` sends over SMTP using the same credentials and
# verified sender as the main API, without importing any of its code. Every send
# goes through a BackgroundTask — SMTP latency must never become registration
# latency — and no send can fail the request that triggered it.
#
# `SEND_EMAILS` (default OFF) is the kill switch: with it off the message is
# logged instead of sent, which is how you get the link in development.
# `TASTE_REQUIRE_VERIFIED_EMAIL` still defaults to false; it flips only once a
# real send has been confirmed from the deployed environment, because turning it
# on is a one-way door for anyone whose mail does not arrive.
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

import schemas as s
from core import ratelimit, security
from core.auth import get_current_user
from core.config import settings
from db.base import get_db
from db.models import RefreshToken, User
from services import email as mailer

log = logging.getLogger(__name__)
router = APIRouter()

# Deliberately identical for "no such account" and "wrong password". Telling the
# two apart turns the login form into a membership oracle for any email address.
_BAD_LOGIN = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

# F4: these were in-process dicts, which reset on deploy and gave an attacker
# one budget PER EB INSTANCE. They now count in `taste.rate_limit`, on their own
# connection, committed immediately — see core/ratelimit.py for why the separate
# connection is the part that makes it work at all.
_LOCKOUT_THRESHOLD = 8
_LOCKOUT_WINDOW = timedelta(minutes=15)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _attempt_allowed(email: str) -> bool:
    """Count one login ATTEMPT and say whether it may proceed.

    COUNTS EVERY ATTEMPT AND IS CHECKED BEFORE THE PASSWORD IS VERIFIED. An
    earlier version counted only failures and consulted the budget inside the
    failure branch, which looks equivalent and is not: wrong guesses got a 429,
    but a CORRECT guess never touched the limiter, so an online brute force
    still succeeded on the attempt that mattered. The lockout was a metric
    rather than a limit.

    Keyed on the email rather than the IP: an attacker rotates addresses far
    more easily than they discover which email to attack, and limiting by IP
    alone locks out everyone behind one office NAT the moment a colleague
    fat-fingers a password.
    """
    return ratelimit.hit(f"login:{email}", limit=_LOCKOUT_THRESHOLD, window=_LOCKOUT_WINDOW)


def _issue(db: Session, user: User, request: Optional[Request]) -> s.TokenPair:
    """Mint an access/refresh pair and record the refresh row."""
    token, digest = security.new_refresh_token()
    row = RefreshToken(
        user_id=user.id,
        token_hash=digest,
        expires_at=_now() + timedelta(days=settings.REFRESH_TOKEN_DAYS),
        user_agent=(request.headers.get("user-agent") if request else None),
        ip=(request.client.host if request and request.client else None),
    )
    db.add(row)
    user.last_login = _now()
    user.login_count = (user.login_count or 0) + 1
    db.commit()
    return s.TokenPair(
        access_token=security.create_access_token(user.id, user.token_version),
        refresh_token=token,
        expires_in=settings.ACCESS_TOKEN_MINUTES * 60,
    )


def _dev_only(token: str) -> Optional[str]:
    """Return a token to the caller only on a local machine. Never in a deployed env."""
    return token if settings.ENV == "local" else None


# Mail-triggering routes get their own, stricter budget. Without it,
# /auth/password/reset-request is an open relay pointed at anyone chosen by the
# caller: it takes an arbitrary address and sends to it, unauthenticated.
_MAIL_THRESHOLD = 3
_MAIL_WINDOW = timedelta(minutes=15)


def _mail_throttled(key: str) -> bool:
    return not ratelimit.hit(f"mail:{key}", limit=_MAIL_THRESHOLD, window=_MAIL_WINDOW)


@router.post("/register", response_model=s.TokenPair, status_code=201)
def register(
    body: s.RegisterIn, request: Request, background: BackgroundTasks, db: Session = Depends(get_db)
):
    email = body.email.strip().lower()

    problem = security.password_problem(body.password)
    if problem:
        raise HTTPException(status_code=422, detail=problem)

    handle = (body.handle or "").strip().lower() or None
    if handle:
        problem = security.handle_problem(handle)
        if problem:
            raise HTTPException(status_code=422, detail=problem)
        if db.query(User).filter(User.handle == handle).first():
            raise HTTPException(status_code=409, detail="That handle is taken")

    existing = db.query(User).filter(User.email == email).first()
    if existing is not None:
        # An account migrated from Insights that never set a Taste password is a
        # real account with a NULL digest. Registering "again" must not reset
        # it — that would be an account takeover by anyone who knows the address.
        # Send them through password reset instead.
        raise HTTPException(status_code=409, detail="An account with that email already exists")

    user = User(
        email=email,
        hashed_password=security.hash_password(body.password),
        handle=handle,
        display_name=(body.display_name or "").strip() or None,
        verification_token=security.new_opaque_token(),
        verification_sent_at=_now(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    log.info("taste user registered id=%s", user.id)

    pair = _issue(db, user, request)
    # Backgrounded: the account exists and the session is valid whether or not
    # the mail goes out. Making registration wait on SMTP would mean a slow mail
    # server is a slow sign-up, and a dead one is a failed sign-up.
    background.add_task(
        mailer.send_verification_email, email, user.verification_token, user.display_name
    )
    return pair


@router.post("/login", response_model=s.TokenPair)
def login(body: s.LoginIn, request: Request, db: Session = Depends(get_db)):
    email = body.email.strip().lower()

    # Before the password is even looked at. Counting and checking are the same
    # call, so a burst of parallel attempts cannot slip between the two.
    if not _attempt_allowed(email):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again shortly.")

    user = db.query(User).filter(User.email == email).first()
    if user is None or not security.verify_password(body.password, user.hashed_password):
        raise _BAD_LOGIN

    # Checked after the password, so a suspended account cannot be distinguished
    # from a wrong password by anyone who does not already know the password.
    if user.status != "active":
        raise HTTPException(status_code=403, detail="This account is not active")
    if settings.REQUIRE_VERIFIED_EMAIL and not user.is_verified:
        raise HTTPException(status_code=403, detail="Please verify your email address first")

    # A person who mistypes four times and then gets it right should not still
    # be half way to a lockout.
    ratelimit.clear(f"login:{email}")
    return _issue(db, user, request)


@router.post("/refresh", response_model=s.TokenPair)
def refresh(body: s.RefreshIn, request: Request, db: Session = Depends(get_db)):
    """Exchange a refresh token for a new pair, rotating the old one.

    Rotation is what makes a stolen refresh token detectable: the legitimate
    client and the thief cannot both use the same row, and the second use of an
    already-rotated token is replay. That case revokes the whole family rather
    than just refusing, because at that point one of the two holders is not the
    owner and there is no way to tell which.
    """
    digest = security.hash_refresh_token(body.refresh_token)
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == digest).first()

    if row is None:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if row.revoked_at is not None:
        log.warning("refresh token replay for user_id=%s — revoking all sessions", row.user_id)
        db.query(RefreshToken).filter(
            RefreshToken.user_id == row.user_id, RefreshToken.revoked_at.is_(None)
        ).update({"revoked_at": _now()})
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if row.expires_at <= _now():
        raise HTTPException(status_code=401, detail="Refresh token expired")

    user = db.query(User).filter(User.id == row.user_id).first()
    if user is None or user.status != "active":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    row.revoked_at = _now()
    db.flush()
    pair = _issue(db, user, request)
    # Link the chain so a replay of the old token is attributable rather than
    # merely rejected.
    newest = db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)
    ).order_by(RefreshToken.id.desc()).first()
    if newest is not None:
        row.replaced_by_id = newest.id
        db.commit()
    return pair


@router.post("/logout", status_code=204)
def logout(body: s.RefreshIn, db: Session = Depends(get_db)):
    """Revoke one session. Anonymous by design — the token is the credential."""
    digest = security.hash_refresh_token(body.refresh_token)
    db.query(RefreshToken).filter(
        RefreshToken.token_hash == digest, RefreshToken.revoked_at.is_(None)
    ).update({"revoked_at": _now()})
    db.commit()


@router.post("/logout-all", status_code=204)
def logout_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Sign out everywhere. Bumps token_version, so live ACCESS tokens die too —
    revoking only the refresh rows would leave every issued access token valid
    for the rest of its lifetime."""
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)
    ).update({"revoked_at": _now()})
    user.token_version = (user.token_version or 1) + 1
    db.commit()


@router.get("/me", response_model=s.MeOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=s.MeOut)
def update_me(body: s.MeUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)

    if "handle" in data:
        handle = (data.pop("handle") or "").strip().lower() or None
        if handle != user.handle:
            if handle is None:
                raise HTTPException(status_code=422, detail="Handle cannot be removed once set")
            problem = security.handle_problem(handle)
            if problem:
                raise HTTPException(status_code=422, detail=problem)
            if db.query(User).filter(User.handle == handle, User.id != user.id).first():
                raise HTTPException(status_code=409, detail="That handle is taken")
            user.handle = handle

    for key, value in data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/password", status_code=204)
def change_password(
    body: s.PasswordChangeIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    problem = security.password_problem(body.new_password)
    if problem:
        raise HTTPException(status_code=422, detail=problem)

    # An account with no password yet (migrated from a Grow projection) sets one
    # without proving the old one, because there is no old one to prove. An
    # account that HAS a password must always prove it — otherwise a stolen
    # access token silently becomes a permanent one.
    if user.hashed_password:
        if not body.current_password or not security.verify_password(
            body.current_password, user.hashed_password
        ):
            raise HTTPException(status_code=403, detail="Current password is incorrect")

    user.hashed_password = security.hash_password(body.new_password)
    user.token_version = (user.token_version or 1) + 1
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)
    ).update({"revoked_at": _now()})
    db.commit()


@router.post("/password/reset-request")
def request_password_reset(
    body: s.PasswordResetRequestIn, background: BackgroundTasks, db: Session = Depends(get_db)
):
    """Always returns 200, whether or not the address is registered.

    The response must not reveal which addresses have accounts. The work done
    differs; the answer does not. That includes the throttled case — a caller
    who has hit the limit gets the same 200, because a distinct 429 would tell
    them the address is worth retrying.
    """
    email = body.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    token = None

    if user is not None and not _mail_throttled("reset:" + email):
        user.reset_token = security.new_opaque_token()
        user.reset_token_expires = _now() + timedelta(hours=2)
        db.commit()
        token = user.reset_token
        background.add_task(mailer.send_password_reset_email, email, token, user.display_name)

    return {"ok": True, "reset_token": _dev_only(token) if token else None}


@router.post("/verify/resend")
def resend_verification(
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send the verification email again.

    Authed, unlike the reset flow, because the address comes from the session —
    so there is nothing to disclose and no inbox of someone else's to point at.
    Still throttled: the send is free to the caller and not to the recipient.
    """
    if user.is_verified:
        return {"ok": True, "already_verified": True}
    if _mail_throttled("verify:" + user.email):
        raise HTTPException(
            status_code=429, detail="Please wait a few minutes before requesting another email"
        )

    user.verification_token = security.new_opaque_token()
    user.verification_sent_at = _now()
    db.commit()
    background.add_task(
        mailer.send_verification_email, user.email, user.verification_token, user.display_name
    )
    return {"ok": True, "verification_token": _dev_only(user.verification_token)}


@router.post("/password/reset", status_code=204)
def reset_password(body: s.PasswordResetIn, db: Session = Depends(get_db)):
    problem = security.password_problem(body.new_password)
    if problem:
        raise HTTPException(status_code=422, detail=problem)

    user = db.query(User).filter(User.reset_token == body.token).first()
    if user is None or not user.reset_token_expires or user.reset_token_expires <= _now():
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user.hashed_password = security.hash_password(body.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    # Completing a reset proves control of the mailbox, so it also verifies the
    # address — and it ends every existing session, because a reset is what
    # someone does when they think an account is compromised.
    user.is_verified = True
    user.verified_at = user.verified_at or _now()
    user.token_version = (user.token_version or 1) + 1
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)
    ).update({"revoked_at": _now()})
    db.commit()


@router.post("/verify", status_code=204)
def verify_email(body: s.VerifyIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.verification_token == body.token).first()
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid verification token")
    user.is_verified = True
    user.verified_at = _now()
    user.verification_token = None
    db.commit()
