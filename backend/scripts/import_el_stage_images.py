# backend/scripts/import_el_stage_images_core.py
"""
Core-based importer to avoid ORM registry issues.
- Scans --src-dir for el_*.jpg|jpeg|png|webp
- Copies to UPLOAD_DIR/<company_id>/reference_item/YYYY/MM/<uuid>.<ext>
- INSERTs into files and reference_item_files (primary image)

Usage:
  python -m scripts.import_el_stage_images_core \
    --src-dir "A:/images/el scale" \
    --company-id 7 \
    --uploaded-by 11
  # add --dry-run to preview
"""
from __future__ import annotations
import os, re, uuid, shutil, argparse, mimetypes
from pathlib import Path
from datetime import date
from typing import Optional

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# --- env & settings ---
HERE = Path(__file__).resolve()
ROOT = HERE.parents[1].parent  # repo root
load_dotenv(ROOT / ".env")

# Try to read DB URL from env like the rest of your code
DB_URL = os.getenv("DATABASE_URL") or os.getenv("SQLALCHEMY_DATABASE_URL")
if not DB_URL:
    raise SystemExit("No DB URL. Set DATABASE_URL/SQLALCHEMY_DATABASE_URL in .env")

# Import only settings (safe; no ORM)
from core.config import settings  # type: ignore


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)

def detect_mime(path: Path) -> str:
    mt, _ = mimetypes.guess_type(str(path))
    return mt or "application/octet-stream"

def upload_subdir(company_id: int) -> Path:
    today = date.today()
    return Path(settings.UPLOAD_DIR) / str(company_id) / "reference_item" / f"{today.year}" / f"{today.month:02d}"

def parse_el_key(filename: str) -> Optional[str]:
    m = re.match(r"^el[_\-\s]?(\d+)\.(jpg|jpeg|png|webp)$", filename, re.IGNORECASE)
    if not m:
        return None
    return f"EL-{int(m.group(1))}"

def main():
    ap = argparse.ArgumentParser(description="Import EL stage images (Core SQL).")
    ap.add_argument("--src-dir", required=True, help="Folder with el_*.jpg/png/webp files")
    ap.add_argument("--company-id", type=int, required=True, help="Company ID to own the File rows")
    ap.add_argument("--uploaded-by", type=int, required=True, help="User ID recorded as uploader")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    src = Path(args.src_dir)
    if not src.is_dir():
        raise SystemExit(f"Source directory not found: {src}")

    engine = create_engine(DB_URL, future=True)
    out_dir = upload_subdir(args.company_id)
    ensure_dir(out_dir)

    created = linked = skipped = unset = 0

    with engine.begin() as conn:
        for p in sorted(src.iterdir()):
            if not p.is_file():
                continue

            el_key = parse_el_key(p.name)
            if not el_key:
                skipped += 1
                continue

            # find matching reference_items row
            ref = conn.execute(
                text("""
                    SELECT id, label
                    FROM reference_items
                    WHERE category = 'el_stage' AND key = :key AND is_active = TRUE
                """),
                {"key": el_key},
            ).mappings().first()

            if not ref:
                print(f"⚠️  No reference_items row for {el_key} — skipping {p.name}")
                skipped += 1
                continue

            # Copy file into uploads tree
            ext = p.suffix.lower()
            stored_filename = f"{uuid.uuid4().hex}{ext}"
            dest = out_dir / stored_filename

            if not args.dry_run:
                shutil.copy2(p, dest)

            # Insert into files
            file_id = str(uuid.uuid4())
            mime = detect_mime(p)
            size = p.stat().st_size

            if not args.dry_run:
                conn.execute(
                    text("""
                        INSERT INTO files (
                            id, company_id, entity_type, entity_id,
                            original_filename, stored_filename, file_path,
                            file_size, mime_type, file_category,
                            description, uploaded_by, upload_status,
                            is_public, is_active
                        ) VALUES (
                            :id, :company_id, :entity_type, :entity_id,
                            :original_filename, :stored_filename, :file_path,
                            :file_size, :mime_type, :file_category,
                            :description, :uploaded_by, 'uploaded',
                            TRUE, TRUE
                        )
                    """),
                    {
                        "id": file_id,
                        "company_id": args.company_id,
                        "entity_type": "reference_item",
                        "entity_id": ref["id"],
                        "original_filename": p.name,
                        "stored_filename": stored_filename,
                        "file_path": str(dest.resolve()),
                        "file_size": size,
                        "mime_type": mime,
                        "file_category": "photo",
                        "description": f"{el_key} helper image",
                        "uploaded_by": args.uploaded_by,
                    },
                )

                # Unset any existing primary for this item (partial unique idx safety)
                conn.execute(
                    text("""
                        UPDATE reference_item_files
                        SET is_primary = FALSE
                        WHERE reference_item_id = :rid AND is_primary = TRUE
                    """),
                    {"rid": ref["id"]},
                )

                # Link new image as primary
                conn.execute(
                    text("""
                        INSERT INTO reference_item_files
                        (reference_item_id, file_id, caption, sort_order, is_primary)
                        VALUES (:rid, :fid, :caption, 0, TRUE)
                    """),
                    {"rid": ref["id"], "fid": file_id, "caption": f"{el_key} · {ref['label']}"},
                )

            created += 1
            linked += 1

    print(f"Done. files_created={created} linked={linked} unset_primaries={unset} skipped={skipped} dry_run={args.dry_run}")

if __name__ == "__main__":
    main()
