"""Shared HTTP helper with a HARD total-time cap.

Why this exists: `requests.get(timeout=N)` does NOT cap total request time. The
`timeout` is an inactivity timeout between socket reads, so a server that dribbles
the response body one byte at a time (or a Hilltop/Cloudflare endpoint that accepts
the connection then never really responds) keeps the read alive indefinitely. That
is exactly what wedged the incremental cron: one HBRC/MDC request hung and the whole
single-process run sat dead until GitHub's 6-hour cap killed it.

`get_with_hard_timeout` runs the request on a daemon thread and joins with a
wall-clock deadline. If the deadline passes it raises requests.exceptions.Timeout
(so existing retry/except logic handles it) and abandons the stuck thread — which,
being a daemon, dies with the process. A per-call thread (not a bounded pool) is
deliberate: a bounded pool would deadlock once enough requests hung.
"""
import threading

import requests


def get_with_hard_timeout(url, total_timeout=90, **kwargs):
    """requests.get(url, **kwargs) but guaranteed to return/raise within
    total_timeout seconds. Also sets an inner requests timeout as a first line of
    defence. On the hard deadline raises requests.exceptions.Timeout."""
    # inner per-read timeout too (connect, read); never longer than the hard cap
    kwargs.setdefault("timeout", (15, min(60, total_timeout)))

    box = {}

    def _do():
        try:
            box["resp"] = requests.get(url, **kwargs)
        except Exception as e:  # noqa: BLE001 - surfaced to caller below
            box["err"] = e

    t = threading.Thread(target=_do, daemon=True)
    t.start()
    t.join(total_timeout)
    if t.is_alive():
        raise requests.exceptions.Timeout(
            f"hard timeout after {total_timeout}s: {url[:140]}"
        )
    if "err" in box:
        raise box["err"]
    return box["resp"]
