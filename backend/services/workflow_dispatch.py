"""Ask GitHub Actions to start a job now, instead of waiting for its schedule.

## Why this exists

A Pro subscriber places a point, the API writes `status='populating'` and
returns 202, and the extraction runs somewhere else. "Somewhere else" is the
`Insights Pro Site Population` workflow, whose schedule is `*/5` — GitHub's
finest granularity, and best-effort at that: scheduled runs are routinely
delayed under load and can be dropped entirely. Against a UI that gives up
after ten minutes, that means a customer can watch the stalled message appear
while nothing is actually wrong.

Dispatching on placement takes the normal path from "up to five minutes plus
GitHub's queue" to "seconds", without moving the work into the request. The
extraction still runs in Actions, still takes ~90 seconds, and still cannot
take a web worker down with it.

## The load-bearing property: this is an OPTIMISATION, not the mechanism

**Every failure here is a no-op, never an error.** No token configured, GitHub
down, a 404 because the workflow file has not reached the default branch yet,
a network timeout — all of them log and return False, and the site stays
exactly where it was: `populating`, waiting for the scheduled sweep to find it.
The sweep is the guarantee; this is the accelerator.

That is why nothing here raises. A dispatch failure that 500s a placement would
turn a slow site into a lost sale, which is strictly worse than the five-minute
wait it was trying to avoid.

## Two things that will look like bugs

1. **`workflow_dispatch` only works from the DEFAULT BRANCH.** GitHub resolves
   the workflow file on `ref`, but the workflow must already exist on the
   repository's default branch or the API answers 404. So this stays a no-op
   until `.github/workflows/insights-site-population.yml` is merged to main —
   correctly, and silently, because the sweep still covers it.

2. **A dispatch returns 204 with no body and no run id.** There is no handle to
   poll and no way to tell from the response whether the job did anything. The
   status on the row is the source of truth, which is what the UI already polls.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from typing import Optional

log = logging.getLogger(__name__)

# Fine-grained PAT with `actions: write` on this repository. Absent on every dev
# machine, which is the normal case and not a warning.
TOKEN_ENV = "GITHUB_DISPATCH_TOKEN"

DEFAULT_REPO = "PeteTaylor89/auxein-insights"
DEFAULT_REF = "main"
SITE_POPULATION_WORKFLOW = "insights-site-population.yml"

# Short on purpose. This runs in a background task after the response has been
# sent, but a hung socket still ties up a worker thread, and the cost of giving
# up is only that the site waits for the sweep.
TIMEOUT_S = 8


def _repo() -> str:
    return os.getenv("GITHUB_REPO", DEFAULT_REPO)


def _ref() -> str:
    return os.getenv("GITHUB_REF_NAME") or os.getenv("GITHUB_DISPATCH_REF", DEFAULT_REF)


def dispatch(workflow: str, inputs: Optional[dict] = None) -> bool:
    """Fire a `workflow_dispatch`. True if GitHub accepted it.

    Never raises. See the module docstring: the caller's job must not depend on
    this working.
    """
    token = os.getenv(TOKEN_ENV)
    if not token:
        # Info, not warning. Local and CI environments legitimately have no
        # token, and a warning on every placement would train people to ignore
        # the log.
        log.info("no %s configured; leaving %s to its schedule",
                 TOKEN_ENV, workflow)
        return False

    url = (f"https://api.github.com/repos/{_repo()}"
           f"/actions/workflows/{workflow}/dispatches")
    # GitHub requires every input value to be a STRING, including numbers and
    # booleans. Passing an int here is a 422 that reads like a permissions
    # problem.
    payload = {"ref": _ref(),
               "inputs": {k: str(v) for k, v in (inputs or {}).items()}}

    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "auxein-insights",
        })

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            # 204 No Content is success. There is no run id to hold on to.
            ok = resp.status in (201, 204)
            log.info("dispatched %s %s -> %s", workflow, payload["inputs"],
                     resp.status)
            return ok
    except urllib.error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", "replace")[:300]
        except Exception:                                       # noqa: BLE001
            pass
        if exc.code == 404:
            # Either the workflow is not on the default branch yet or the token
            # cannot see the repo. Both mean "the sweep will handle it".
            log.warning("dispatch 404 for %s on %s — is the workflow merged to "
                        "the default branch? falling back to the schedule",
                        workflow, _repo())
        else:
            log.warning("dispatch failed %s: %s %s", workflow, exc.code, body)
        return False
    except Exception as exc:                                    # noqa: BLE001
        log.warning("dispatch failed %s: %s", workflow, exc)
        return False


def populate_site(site_id: int) -> bool:
    """Start the extraction for one site now rather than at the next sweep."""
    return dispatch(SITE_POPULATION_WORKFLOW, {"site": site_id})
