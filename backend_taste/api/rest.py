# backend_taste/api/rest.py
# Assembles the v1 REST surface: a CRUD router per entity + regions. Mounted under
# /taste/v1 in main.py. This is the conventional, server-authoritative API the app
# talks to (replacing the offline-first sync relay).
from fastapi import APIRouter

import schemas as s
from api import auth, catalogue, moderation, public, regions, shares, vocab
from api.crud import make_crud_router
from db.models import Event, Flight, Note, Photo, Template, Wine
from services.wine_catalogue import link_or_propose

api_router = APIRouter()

# (path, model, Out, Create, Update, owner_optional, after_write)
# F3: `wines` carries a hook that links the row to the canonical catalogue, or
# queues a proposal if that identity is not in it yet. Every other entity passes
# None — the catalogue is a fact about wine identity, not about tasting rows.
_ENTITIES = [
    ("templates", Template, s.TemplateOut, s.TemplateCreate, s.TemplateUpdate, True, None),
    ("events", Event, s.EventOut, s.EventCreate, s.EventUpdate, False, None),
    ("wines", Wine, s.WineOut, s.WineCreate, s.WineUpdate, False, link_or_propose),
    ("notes", Note, s.NoteOut, s.NoteCreate, s.NoteUpdate, False, None),
    ("flights", Flight, s.FlightOut, s.FlightCreate, s.FlightUpdate, False, None),
    ("photos", Photo, s.PhotoOut, s.PhotoCreate, s.PhotoUpdate, False, None),
]

for path, model, out, create, update, owner_optional, after_write in _ENTITIES:
    api_router.include_router(
        make_crud_router(
            model=model, out_schema=out, create_schema=create,
            update_schema=update, owner_optional=owner_optional, after_write=after_write,
        ),
        prefix=f"/{path}",
        tags=[path],
    )

api_router.include_router(regions.router, tags=["regions"])
api_router.include_router(vocab.router, tags=["vocab"])
# F1 — sign-up / sign-in against Taste's own user table.
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
# F2 — grants and per-row reach. Authed; owner-only for anything that changes
# who can see a row.
api_router.include_router(shares.router, tags=["shares"])
# F3 — the canonical wine catalogue. Reads are open to any signed-in user;
# every write is moderator-only.
api_router.include_router(catalogue.router, tags=["catalogue"])
# F4 — reporting is open to any signed-in user; the queue and every action on it
# are moderator-only.
api_router.include_router(moderation.router, tags=["moderation"])
# F2 — the anonymous read surface. Mounted LAST and kept in its own module
# because it is the one router that serves callers with no token at all.
api_router.include_router(public.router, tags=["public"])
