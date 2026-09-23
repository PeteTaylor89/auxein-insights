# backend_taste/core/wine_identity.py — when are two wines the same wine? (F3)
#
# The whole canonical table rests on this file, so it is deliberately small,
# pure, and conservative. It does NOT try to be clever: a false merge silently
# rewrites someone else's tasting history and is close to impossible to notice,
# while a missed merge leaves two rows that a moderator can join later. The
# asymmetry is total, so everything here errs towards saying "not the same".
#
# Exact-key matching is automatic. Fuzzy matching is ONLY ever surfaced as a
# suggestion to a human — nothing in this module merges on a similarity score.
import re
import unicodedata
from typing import Iterable, Optional

# Punctuation that carries no identity: "Ch. d'Yquem" and "Ch d Yquem" are the
# same producer, and an apostrophe should not create a second canonical row.
_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)
_SPACE = re.compile(r"\s+")

# Dropped from the START of a producer only. "Domaine" and "Château" are so
# common that leaving them in makes every French producer look alike to a
# similarity measure, while removing them mid-string would corrupt real names.
_LEADING_NOISE = (
    "domaine", "dom", "chateau", "ch", "clos", "bodega", "bodegas", "weingut",
    "tenuta", "azienda agricola", "cantina", "quinta", "maison", "casa",
    "the", "les", "la", "le", "el",
)

# Deliberately NOT stripped: "estate", "winery", "wines", "vineyards", "cellars".
# They routinely distinguish real producers ("Craggy Range Winery" vs "Craggy
# Range"), and collapsing them is exactly the false merge this module avoids.


def strip_accents(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c))


# Runs of two or more single letters, which is what punctuation-stripped
# initials look like: "J.M. Boillot" arrives here as "j m boillot".
_INITIALS = re.compile(r"\b(?:[a-z0-9]\s+){1,}[a-z0-9]\b")


def _join_initials(value: str) -> str:
    """Rejoin runs of single letters, so "J.M." and "JM" are one producer.

    Punctuation becomes a SPACE rather than nothing, because "Saint-Emilion" is
    two words and "saintemilion" is not a name anyone would search for. That is
    the right default, and it costs exactly one case: initials, which arrive
    split. This puts those back.

    Only runs of TWO OR MORE single characters collapse, so "d yquem" (one
    single letter followed by a word) is left alone — "d" there is part of the
    name, not an initial.
    """
    return _INITIALS.sub(lambda m: m.group(0).replace(" ", ""), value)


def normalise(value: Optional[str]) -> str:
    """Lowercase, de-accent, drop punctuation, rejoin initials, collapse space."""
    if not value:
        return ""
    out = strip_accents(str(value)).lower()
    out = _PUNCT.sub(" ", out)
    out = _SPACE.sub(" ", out).strip()
    return _join_initials(out)


def normalise_producer(value: Optional[str]) -> str:
    out = normalise(value)
    if not out:
        return ""
    # One leading token only. Stripping repeatedly would turn "Le Clos du Roi"
    # into "roi", which is a different producer.
    for noise in sorted(_LEADING_NOISE, key=len, reverse=True):
        prefix = noise + " "
        if out.startswith(prefix) and len(out) > len(prefix):
            return out[len(prefix):].strip()
    return out


def dedupe_key(
    producer: Optional[str],
    label: Optional[str],
    vintage: Optional[int],
    region_id: Optional[str] = None,
) -> str:
    """The identity of a wine, as one comparable string.

    Producer + label + vintage. REGION IS DELIBERATELY EXCLUDED: the same wine
    is routinely recorded at different depths of the geography tree — one taster
    picks "Burgundy", another "Chablis" — and including the region would mint a
    second canonical row for each of them. Region is carried on the canonical row
    as information, not as part of its identity.

    Vintage IS part of the key: two vintages of the same label are two different
    wines to taste, which is the only sense of "same" this product cares about.
    A missing vintage keys as NV rather than matching every vintage, because a
    row that matched everything would absorb them all on the first merge.
    """
    return "|".join((
        normalise_producer(producer),
        normalise(label),
        str(vintage) if vintage is not None else "nv",
    ))


def token_set(value: str) -> set:
    return {t for t in normalise(value).split(" ") if t}


def similarity(a: str, b: str) -> float:
    """Jaccard overlap of word sets, 0..1. Used for SUGGESTIONS ONLY.

    Word-set rather than edit distance on purpose: the realistic near-miss here
    is a missing or extra word ("Catena Zapata White Bones" vs "Catena White
    Bones"), not a typo, and edit distance rates long shared strings as similar
    even when the distinguishing word is the one that differs.
    """
    sa, sb = token_set(a), token_set(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


# Above this, a moderator is shown the pair as a possible duplicate. It is a
# threshold for ASKING, never for acting.
SUGGEST_THRESHOLD = 0.6


def rank_candidates(producer: str, label: Optional[str], rows: Iterable) -> list:
    """Score existing canonical rows against a proposed one, best first.

    Each row needs `.producer` and `.label`. Returns (row, score) for anything
    over the threshold. Vintage is not scored — a different vintage of the same
    label is a legitimately different wine, and the reviewer can see it.
    """
    target = f"{producer or ''} {label or ''}".strip()
    scored = []
    for row in rows:
        other = f"{row.producer or ''} {row.label or ''}".strip()
        score = similarity(target, other)
        if score >= SUGGEST_THRESHOLD:
            scored.append((row, round(score, 3)))
    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored
