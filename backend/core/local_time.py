# core/local_time.py — the calendar date a New Zealand worker is standing in.
#
# The API runs UTC on Elastic Beanstalk; every vineyard using it is in New
# Zealand, twelve hours ahead in winter and thirteen in summer. So for the whole
# NZ morning — midnight through noon — `date.today()` on the server is still
# YESTERDAY. Anything that stamps a calendar date from server time silently
# files half the working day against the wrong date.
#
# It went unseen for a long time because a developer's machine is on NZ time, so
# `date.today()` is correct in dev and wrong only in production. That is the
# worst shape a bug can have.
#
# Where an ACTUAL INSTANT is wanted, keep using timezone-aware UTC — this module
# is only for the question "what day is it where the work happened", which is a
# local-calendar question and has no UTC answer.
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

# Not read from a company record: Auxein is a New Zealand product and every
# property, station and vintage in the schema assumes it. A per-company timezone
# would need the whole climate side to agree, which it does not today. If that
# changes this is the one place to widen.
NZ = ZoneInfo("Pacific/Auckland")


def local_now() -> datetime:
    """Timezone-aware 'now' in New Zealand."""
    return datetime.now(NZ)


def local_today() -> date:
    """Today's date in New Zealand, whatever the server's clock is set to."""
    return local_now().date()


def to_local_date(moment: datetime) -> date:
    """The NZ calendar date an instant falls on.

    A naive datetime is assumed to be UTC, because that is what the server
    produces and what is stored.
    """
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(NZ).date()
