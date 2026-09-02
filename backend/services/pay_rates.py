# services/pay_rates.py — resolving what someone was paid, and when.
#
# The whole point of this module is that it resolves by the DATE OF THE WORK,
# never by today. A pay rise in September must not change what June's pruning
# cost. Every function here takes an explicit date for that reason; there is no
# "current rate" helper, because a caller that wants one is almost always about
# to reprice history by accident.
import logging
from datetime import date
from decimal import Decimal
from typing import Optional, List, Tuple

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from db.models.costing import UserPayRate, CompanyCostSettings

logger = logging.getLogger(__name__)


class RateResolution:
    """The rate that applied, and where it came from.

    `source` is carried so a figure can be explained a year later:
      pay_rate      an effective-dated row for that person
      company_default  the company fallback, because they have no rate on file
      none          nothing to cost with — the caller must report incomplete,
                    NOT substitute zero
    """

    __slots__ = ("hourly_rate", "source", "pay_rate_id", "currency")

    def __init__(self, hourly_rate=None, source="none", pay_rate_id=None, currency="NZD"):
        self.hourly_rate = hourly_rate
        self.source = source
        self.pay_rate_id = pay_rate_id
        self.currency = currency

    @property
    def is_resolved(self) -> bool:
        return self.hourly_rate is not None

    def __repr__(self):
        return f"<RateResolution {self.hourly_rate} {self.currency} via {self.source}>"


def get_cost_settings(db: Session, company_id: int) -> Optional[CompanyCostSettings]:
    """The company's cost settings, or None when nothing is configured.

    None is a real answer, not an error. A company that has never opened the
    costing screen has no row, and everything downstream must cope with that
    rather than assume defaults into existence.
    """
    return (
        db.query(CompanyCostSettings)
        .filter(CompanyCostSettings.company_id == company_id)
        .first()
    )


def resolve_pay_rate(db: Session, user_id: int, on_date: date,
                     company_id: int = None, settings: CompanyCostSettings = None
                     ) -> RateResolution:
    """What this person's hourly rate was on `on_date`.

    Falls back to the company default only when the person has no rate covering
    that date. When there is no default either, returns an unresolved result —
    the caller reports the task as incompletely costed rather than pretending
    the labour was free.

    `settings` may be passed in to avoid a query per user when costing a task
    with several people on it.
    """
    row = (
        db.query(UserPayRate)
        .filter(
            UserPayRate.user_id == user_id,
            UserPayRate.effective_from <= on_date,
            or_(UserPayRate.effective_to.is_(None), UserPayRate.effective_to >= on_date),
        )
        # Newest applicable first. Overlapping ranges should not exist — the
        # write path closes the previous row — but if one ever does, the more
        # recent decision is the right one to honour rather than an arbitrary one.
        .order_by(UserPayRate.effective_from.desc(), UserPayRate.id.desc())
        .first()
    )

    if row is not None:
        return RateResolution(
            hourly_rate=Decimal(str(row.hourly_rate)),
            source="pay_rate",
            pay_rate_id=row.id,
            currency=row.currency or "NZD",
        )

    if settings is None and company_id is not None:
        settings = get_cost_settings(db, company_id)

    if settings is not None and settings.default_hourly_rate is not None:
        return RateResolution(
            hourly_rate=Decimal(str(settings.default_hourly_rate)),
            source="company_default",
            currency=settings.currency or "NZD",
        )

    return RateResolution()


def on_cost_multiplier(settings: Optional[CompanyCostSettings]) -> Tuple[Decimal, bool]:
    """Returns (multiplier, is_configured).

    1.0 when unset, with the flag saying so. A bare hourly rate understates true
    employment cost by roughly 15-20% once holiday pay, ACC and KiwiSaver are
    counted, so an unconfigured multiplier is not a neutral default — it is a
    known understatement, and the flag is what lets a report admit that instead
    of showing a figure that looks complete.
    """
    if settings is not None and settings.on_cost_multiplier is not None:
        return Decimal(str(settings.on_cost_multiplier)), True
    return Decimal("1.0"), False


def list_rates(db: Session, company_id: int, user_id: int = None) -> List[UserPayRate]:
    """Rate history, newest first. Scoped to the company, always."""
    q = db.query(UserPayRate).filter(UserPayRate.company_id == company_id)
    if user_id is not None:
        q = q.filter(UserPayRate.user_id == user_id)
    return q.order_by(UserPayRate.user_id, UserPayRate.effective_from.desc()).all()


def add_rate(db: Session, company_id: int, user_id: int, hourly_rate: Decimal,
             effective_from: date, created_by: int, currency: str = "NZD",
             notes: str = None) -> UserPayRate:
    """Record a new rate, closing whatever it supersedes.

    Two things happen here that a plain insert would not do, and both exist to
    keep resolution unambiguous:

      * The previous open-ended row is CLOSED at the day before this one starts.
        Without that, two rows would cover every date from here on and the
        resolver would be choosing between them.
      * A row that starts on the same day is REPLACED rather than added beside.
        Correcting a rate you entered this morning should not leave two rows
        covering the same day.

    Backdating is allowed on purpose — a rise agreed in August and applied from
    July is normal — but it re-values every task snapshot taken since, which is
    why a recompute is an explicit action rather than automatic.
    """
    same_day = (
        db.query(UserPayRate)
        .filter(
            UserPayRate.user_id == user_id,
            UserPayRate.effective_from == effective_from,
        )
        .all()
    )
    for row in same_day:
        db.delete(row)

    open_ended = (
        db.query(UserPayRate)
        .filter(
            UserPayRate.user_id == user_id,
            UserPayRate.effective_from < effective_from,
            or_(UserPayRate.effective_to.is_(None), UserPayRate.effective_to >= effective_from),
        )
        .all()
    )
    day_before = effective_from - __import__("datetime").timedelta(days=1)
    for row in open_ended:
        row.effective_to = day_before

    rate = UserPayRate(
        company_id=company_id,
        user_id=user_id,
        hourly_rate=hourly_rate,
        currency=currency or "NZD",
        effective_from=effective_from,
        notes=notes,
        created_by=created_by,
    )
    db.add(rate)
    db.flush()

    logger.info(
        f"Pay rate {hourly_rate} {currency} recorded for user {user_id} "
        f"from {effective_from} by user {created_by}"
    )
    return rate
