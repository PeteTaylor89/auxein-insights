"""Email flows end to end: verify, reset, resend, throttle, and the message itself.

Runs against a REAL local Postgres and a real SMTP conversation, so the
assertions are about what actually reaches a mail server, not a mock of one.
"""
import os, sys, socketserver, threading, time, re, email as emaillib
sys.path.insert(0, os.getcwd())

CRLF = b"\r\n"
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))


# ---- a minimal SMTP server that keeps what it is given -----------------------
# Hand-rolled rather than pulling aiosmtpd into backend/venv for one test file.
# It speaks just enough SMTP for smtplib: greeting, EHLO, MAIL, RCPT, DATA, QUIT.
class Sink:
    messages = []


class SMTPHandler(socketserver.StreamRequestHandler):
    def reply(self, text):
        self.wfile.write(text.encode("ascii") + CRLF)

    def handle(self):
        self.reply("220 test.local ESMTP")
        rcpts = []
        while True:
            line = self.rfile.readline()
            if not line:
                return
            cmd = line.decode("utf-8", "replace").strip()
            upper = cmd.upper()
            if upper.startswith(("EHLO", "HELO")):
                self.reply("250 test.local")
            elif upper.startswith("MAIL FROM"):
                self.reply("250 OK")
            elif upper.startswith("RCPT TO"):
                rcpts.append(cmd.split(":", 1)[1].strip().strip("<>"))
                self.reply("250 OK")
            elif upper == "DATA":
                self.reply("354 End data")
                chunks = []
                while True:
                    dl = self.rfile.readline()
                    if not dl or dl.strip() == b".":
                        break
                    chunks.append(dl)
                Sink.messages.append({
                    "to": list(rcpts),
                    "raw": b"".join(chunks).decode("utf-8", "replace"),
                })
                rcpts = []
                self.reply("250 OK")
            elif upper.startswith("QUIT"):
                self.reply("221 Bye")
                return
            else:
                self.reply("250 OK")


class SMTPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


server = SMTPServer(("127.0.0.1", 8025), SMTPHandler)
threading.Thread(target=server.serve_forever, daemon=True).start()
sink = Sink()

# Point the service at it BEFORE importing the app.
os.environ["SEND_EMAILS"] = "true"
os.environ["SMTP_SERVER"] = "127.0.0.1"
os.environ["SMTP_PORT"] = "8025"
os.environ["SMTP_USERNAME"] = "taste@example.com"
os.environ["SMTP_PASSWORD"] = "unused-by-the-sink"
os.environ["FROM_EMAIL"] = "taste@example.com"
os.environ["TASTE_APP_URL"] = "https://taste.auxein.co.nz"

from fastapi.testclient import TestClient  # noqa: E402
import sqlalchemy as sa  # noqa: E402
from core.config import settings  # noqa: E402
from main import app

from core.config import settings  # noqa: E402
from tests_guard import require_scratch_db  # noqa: E402

# These fixtures TRUNCATE. Refuse anything that is not obviously disposable.
require_scratch_db(settings.DATABASE_URL)
  # noqa: E402
from db.base import SessionLocal  # noqa: E402

# The sink offers neither STARTTLS nor AUTH, which the sender always attempts.
# Patch exactly those two calls and nothing else: the message construction, the
# recipients and the transport itself all stay real, so what the assertions read
# is what a mail server would have received.
import smtplib  # noqa: E402
smtplib.SMTP.starttls = lambda self, *a, **k: (220, b"ok")
smtplib.SMTP.login = lambda self, *a, **k: (235, b"ok")

db = SessionLocal()
for _t in ("shares", "refresh_tokens", "users"):
    db.execute(sa.text("TRUNCATE taste.%s RESTART IDENTITY CASCADE" % _t))
db.commit()
db.close()

c = TestClient(app)
V1 = "/taste/v1"
EMAIL = "mailflow@example.com"
PASSWORD = "first-password-1"


def wait_for(n, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if len(sink.messages) >= n:
            return True
        time.sleep(0.05)
    return False


def body_of(msg):
    parsed = emaillib.message_from_string(msg["raw"])
    parts = []
    for part in parsed.walk():
        if part.get_content_maintype() == "text":
            parts.append(part.get_payload(decode=True).decode("utf-8", "replace"))
    return parsed, "\n".join(parts)


def link_in(text, path):
    m = re.search(
        r"https://taste\.auxein\.co\.nz" + re.escape(path) + r"\?token=([A-Za-z0-9_\-%]+)", text
    )
    return m.group(1) if m else None


# ---------------------------------------------------------------- register
r = c.post(V1 + "/auth/register", json={"email": EMAIL, "password": PASSWORD, "display_name": "Mail Flow"})
check("register 201", r.status_code == 201, r.text[:160])
check("a verification email actually reached an SMTP server", wait_for(1), "no message arrived")

vtoken = None
if sink.messages:
    parsed, text = body_of(sink.messages[0])
    check("addressed to the registered address", sink.messages[0]["to"] == [EMAIL], str(sink.messages[0]["to"]))
    check("subject names the product", "Auxein Taste" in (parsed["Subject"] or ""), parsed["Subject"] or "")
    check("From uses the configured sender", "taste@example.com" in (parsed["From"] or ""), parsed["From"] or "")
    types = {p.get_content_type() for p in parsed.walk()}
    check("multipart with BOTH a plain and an html part",
          parsed.is_multipart() and types >= {"text/plain", "text/html"}, str(types))
    check("greets by display name", "Mail Flow" in text)
    vtoken = link_in(text, "/verify")
    check("contains a /verify link built from TASTE_APP_URL", bool(vtoken), text[:200])

# ---------------------------------------------------------------- verify
if vtoken:
    r = c.post(V1 + "/auth/verify", json={"token": vtoken})
    check("the emailed token verifies the account", r.status_code == 204, r.text[:160])
    r = c.post(V1 + "/auth/verify", json={"token": vtoken})
    check("the same token cannot be used twice", r.status_code == 400, r.text[:160])

login = c.post(V1 + "/auth/login", json={"email": EMAIL, "password": PASSWORD}).json()
A = {"Authorization": "Bearer %s" % login.get("access_token", "")}
me = c.get(V1 + "/auth/me", headers=A).json()
check("is_verified is now true", me.get("is_verified") is True, str(me)[:160])

r = c.post(V1 + "/auth/verify/resend", headers=A)
check("resend on an already-verified account is a no-op",
      r.status_code == 200 and r.json().get("already_verified") is True, r.text[:160])

# ---------------------------------------------------------------- reset
before = len(sink.messages)
r = c.post(V1 + "/auth/password/reset-request", json={"email": EMAIL})
check("reset-request 200", r.status_code == 200, r.text[:160])
check("a reset email was sent", wait_for(before + 1), "no message arrived")

rtoken = None
if len(sink.messages) > before:
    parsed, text = body_of(sink.messages[-1])
    check("reset subject is distinct from the verification one",
          "Reset" in (parsed["Subject"] or ""), parsed["Subject"] or "")
    rtoken = link_in(text, "/reset")
    check("contains a /reset link", bool(rtoken), text[:200])
    check("tells a non-requester their password still works", "still works" in text)

# A SECOND request supersedes the first link. Only one reset_token is stored per
# user, so asking again invalidates the previous email — which is the behaviour
# you want (a link someone else intercepted stops working the moment the real
# owner asks again) and is worth pinning down rather than discovering by
# accident.
before = len(sink.messages)
c.post(V1 + "/auth/password/reset-request", json={"email": EMAIL})
wait_for(before + 1)
_, newer_text = body_of(sink.messages[-1])
newer_token = link_in(newer_text, "/reset")
check("a second request mints a DIFFERENT token", bool(newer_token) and newer_token != rtoken)
r = c.post(V1 + "/auth/password/reset", json={"token": rtoken, "new_password": "superseded-pw-1"})
check("the SUPERSEDED link no longer works", r.status_code == 400, r.text[:160])

# ---------------------------------------------------------------- complete reset
if newer_token:
    r = c.post(V1 + "/auth/password/reset", json={"token": newer_token, "new_password": "second-password-2"})
    check("the emailed reset token sets a new password", r.status_code == 204, r.text[:160])
    check("the old password no longer works",
          c.post(V1 + "/auth/login", json={"email": EMAIL, "password": PASSWORD}).status_code == 401)
    check("the new password works",
          c.post(V1 + "/auth/login", json={"email": EMAIL, "password": "second-password-2"}).status_code == 200)
    check("sessions issued before the reset are dead", c.get(V1 + "/auth/me", headers=A).status_code == 401)
    r = c.post(V1 + "/auth/password/reset", json={"token": newer_token, "new_password": "third-password-3"})
    check("a reset token cannot be reused", r.status_code == 400, r.text[:160])

# The non-oracle: an unknown address gets the same answer and sends nothing.
before = len(sink.messages)
r = c.post(V1 + "/auth/password/reset-request", json={"email": "nobody-here@example.com"})
check("unknown address gets the SAME 200", r.status_code == 200 and r.json().get("ok") is True, r.text[:160])
time.sleep(0.4)
check("...and NO email is sent to it", len(sink.messages) == before,
      "%s new message(s)" % (len(sink.messages) - before))

# Throttle: repeated requests inside the window stop sending but keep answering 200.
# Runs LAST for EMAIL, because it burns that address's remaining budget.
before = len(sink.messages)
codes = [c.post(V1 + "/auth/password/reset-request", json={"email": EMAIL}).status_code for _ in range(4)]
time.sleep(0.6)
sent = len(sink.messages) - before
check("throttle caps the sends", sent <= 2, "%s sent" % sent)
check("...while every response stays 200 (no oracle via 429)", set(codes) == {200}, str(codes))

# ---------------------------------------------------------------- kill switch
settings.SEND_EMAILS = False
before = len(sink.messages)
c.post(V1 + "/auth/register", json={"email": "killswitch@example.com", "password": "killswitch-pw-1"})
time.sleep(0.4)
check("SEND_EMAILS off sends nothing", len(sink.messages) == before,
      "%s message(s) escaped the kill switch" % (len(sink.messages) - before))
settings.SEND_EMAILS = True

# ---------------------------------------------------------------- failure isolation
settings.SMTP_PORT = 9  # discard port: nothing listens
r = c.post(V1 + "/auth/register", json={"email": "smtpdown@example.com", "password": "smtp-down-pw-1"})
check("registration still succeeds when SMTP is unreachable", r.status_code == 201, r.text[:200])
check("...and still returns a usable session", bool(r.json().get("access_token")))

server.shutdown()

width = max(len(n) for n, _, _ in results)
fails = 0
print()
for name, ok, detail in results:
    if not ok:
        fails += 1
    print("  %-*s  %s%s" % (width, name, "PASS" if ok else "FAIL", ("   <- " + detail) if not ok and detail else ""))
print()
print("%s/%s passed" % (len(results) - fails, len(results)))
sys.exit(1 if fails else 0)
