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

Requests go through a shared keep-alive Session (connection reuse). The dominant
cost of ingestion is the TCP+TLS handshake per request when the runner is far from
the NZ council servers (US GitHub runners: ~180ms RTT × 3-4 handshake round-trips
per request × hundreds of requests). A pooled Session reuses the connection to each
host, so only the first request to a host pays the handshake — the rest are one
round-trip. This roughly halves run time on a distant runner and helps everywhere.
Calls are sequential (one at a time), so the shared Session + urllib3 thread-safe
pool are safe across the per-call daemon threads; a hung/abandoned thread just leaks
one pooled connection (the pool makes a fresh one on the next call).
"""
import threading

import requests
from requests.adapters import HTTPAdapter

_SESSION = requests.Session()
_adapter = HTTPAdapter(pool_connections=16, pool_maxsize=32)
_SESSION.mount("http://", _adapter)
_SESSION.mount("https://", _adapter)


def get_with_hard_timeout(url, total_timeout=90, **kwargs):
    """Session.get(url, **kwargs) but guaranteed to return/raise within
    total_timeout seconds. Also sets an inner requests timeout as a first line of
    defence. On the hard deadline raises requests.exceptions.Timeout."""
    # inner per-read timeout too (connect, read); never longer than the hard cap
    kwargs.setdefault("timeout", (15, min(60, total_timeout)))

    box = {}

    def _do():
        try:
            resp = _SESSION.get(url, **kwargs)
            # Read the body inside the timed thread: this releases the pooled
            # connection back for keep-alive reuse (and a trickle-hang mid-body is
            # still caught by the wall-clock join below). .text stays cached for
            # the caller.
            _ = resp.content
            box["resp"] = resp
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
