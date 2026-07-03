# backend_taste/api/rest.py
# Assembles the v1 REST surface: a CRUD router per entity + regions. Mounted under
# /taste/v1 in main.py. This is the conventional, server-authoritative API the app
# talks to (replacing the offline-first sync relay).
from fastapi import APIRouter

import schemas as s
from api import regions, vocab
from api.crud import make_crud_router
from db.models import Event, Flight, Note, Photo, Template, Wine

api_router = APIRouter()

# (path, model, Out, Create, Update, owner_optional)
_ENTITIES = [
    ("templates", Template, s.TemplateOut, s.TemplateCreate, s.TemplateUpdate, True),
    ("events", Event, s.EventOut, s.EventCreate, s.EventUpdate, False),
    ("wines", Wine, s.WineOut, s.WineCreate, s.WineUpdate, False),
    ("notes", Note, s.NoteOut, s.NoteCreate, s.NoteUpdate, False),
    ("flights", Flight, s.FlightOut, s.FlightCreate, s.FlightUpdate, False),
    ("photos", Photo, s.PhotoOut, s.PhotoCreate, s.PhotoUpdate, False),
]

for path, model, out, create, update, owner_optional in _ENTITIES:
    api_router.include_router(
        make_crud_router(
            model=model, out_schema=out, create_schema=create,
            update_schema=update, owner_optional=owner_optional,
        ),
        prefix=f"/{path}",
        tags=[path],
    )

api_router.include_router(regions.router, tags=["regions"])
api_router.include_router(vocab.router, tags=["vocab"])
