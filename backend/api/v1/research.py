# backend/api/v1/research.py - Research Portal API endpoints
import re
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.research import ResearchReport, ResearchSection
from db.models.research_engagement import ResearchFile, ResearchComment, ResearchLike
from db.models.public_user import PublicUser
from core.public_security import get_current_public_user, get_optional_public_user, get_insights_user
from core.admin_security import require_admin
from schemas.research import (
    ResearchListItem, ResearchDetail, ResearchListResponse,
    ResearchCreate, ResearchUpdate,
    ResearchSectionCreate, ResearchSectionUpdate, ResearchSectionResponse,
    SectionReorderRequest,
    ResearchFileResponse,
    ResearchCommentCreate, ResearchCommentResponse,
)

router = APIRouter()


def _slugify(text: str) -> str:
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    return re.sub(r"-+", "-", slug).strip("-")


def _report_to_list_item(report: ResearchReport) -> ResearchListItem:
    return ResearchListItem(
        id=report.id, title=report.title, slug=report.slug,
        abstract=report.abstract, authors=report.authors or [],
        status=report.status, published_at=report.published_at,
        version=report.version, regions=report.regions, tags=report.tags,
        content_access_tier=report.content_access_tier,
        like_count=report.like_count, comment_count=report.comment_count,
        view_count=report.view_count, created_at=report.created_at,
    )


# ========== PUBLIC ==========

@router.get("/public/research", response_model=ResearchListResponse)
async def list_reports(
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
    tag: Optional[str] = None,
    region: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List published research reports with optional filtering and pagination."""
    query = db.query(ResearchReport).filter(ResearchReport.status == "published")
    if tag:
        query = query.filter(ResearchReport.tags.any(tag))
    if region:
        query = query.filter(ResearchReport.regions.any(region))
    if search:
        query = query.filter(
            ResearchReport.title.ilike(f"%{search}%")
            | ResearchReport.abstract.ilike(f"%{search}%")
        )
    total = query.count()
    reports = (
        query.order_by(desc(ResearchReport.published_at))
        .offset((page - 1) * page_size).limit(page_size).all()
    )
    return ResearchListResponse(
        items=[_report_to_list_item(r) for r in reports],
        total=total, page=page, page_size=page_size,
    )


@router.get("/public/research/{slug}", response_model=ResearchDetail)
async def get_report(
    slug: str, db: Session = Depends(get_db),
    current_user: Optional[PublicUser] = Depends(get_optional_public_user),
):
    """Get a single published research report by slug with sections and files."""
    report = db.query(ResearchReport).filter(
        ResearchReport.slug == slug, ResearchReport.status == "published"
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    report.view_count += 1
    db.commit()

    user_has_liked = False
    if current_user:
        user_has_liked = db.query(ResearchLike).filter(
            ResearchLike.report_id == report.id,
            ResearchLike.user_id == current_user.id,
        ).first() is not None

    sections = [ResearchSectionResponse.model_validate(s) for s in report.sections]
    files = [ResearchFileResponse.model_validate(f) for f in report.files]

    return ResearchDetail(
        **_report_to_list_item(report).__dict__,
        funding_acknowledgement=report.funding_acknowledgement,
        citation_text=report.citation_text,
        seo_title=report.seo_title,
        meta_description=report.meta_description,
        canonical_url=report.canonical_url,
        focus_keywords=report.focus_keywords,
        og_image_url=report.og_image_url,
        structured_data=report.structured_data,
        sections=sections, files=files,
        user_has_liked=user_has_liked,
    )


@router.get("/public/research/{slug}/citation")
async def get_citation(
    slug: str, format: str = Query("apa", pattern="^(apa|bibtex)$"),
    db: Session = Depends(get_db),
):
    """Get formatted citation for a research report (APA or BibTeX)."""
    report = db.query(ResearchReport).filter(
        ResearchReport.slug == slug, ResearchReport.status == "published"
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if report.citation_text:
        return {"format": format, "citation": report.citation_text}

    authors_str = ", ".join(report.authors) if report.authors else "Auxein"
    year = report.published_at.year if report.published_at else "n.d."

    if format == "apa":
        citation = f"{authors_str} ({year}). {report.title}. Auxein Regional Insights."
    else:
        key = re.sub(r"\W+", "", (report.authors[0] if report.authors else "auxein").split()[-1].lower()) + str(year)
        citation = (
            f"@article{{{key},\n"
            f"  title = {{{report.title}}},\n"
            f"  author = {{{authors_str}}},\n"
            f"  year = {{{year}}},\n"
            f"  publisher = {{Auxein Regional Insights}}\n"
            f"}}"
        )
    return {"format": format, "citation": citation}


# ---------- Likes ----------

@router.post("/public/research/{report_id}/like", status_code=201)
async def like_report(report_id: int, db: Session = Depends(get_db),
                      current_user: PublicUser = Depends(get_insights_user)):
    """Toggle like on a research report (authenticated users only)."""
    report = db.query(ResearchReport).filter(ResearchReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    existing = db.query(ResearchLike).filter(
        ResearchLike.report_id == report_id, ResearchLike.user_id == current_user.id
    ).first()
    if existing:
        return {"detail": "Already liked"}
    db.add(ResearchLike(report_id=report_id, user_id=current_user.id))
    report.like_count += 1
    db.commit()
    return {"detail": "Liked", "like_count": report.like_count}


@router.delete("/public/research/{report_id}/like")
async def unlike_report(report_id: int, db: Session = Depends(get_db),
                        current_user: PublicUser = Depends(get_insights_user)):
    """Remove like from a research report (authenticated users only)."""
    like = db.query(ResearchLike).filter(
        ResearchLike.report_id == report_id, ResearchLike.user_id == current_user.id
    ).first()
    if not like:
        raise HTTPException(status_code=404, detail="Like not found")
    db.delete(like)
    report = db.query(ResearchReport).filter(ResearchReport.id == report_id).first()
    if report and report.like_count > 0:
        report.like_count -= 1
    db.commit()
    return {"detail": "Unliked", "like_count": report.like_count if report else 0}


# ---------- Comments ----------

@router.get("/public/research/{report_id}/comments", response_model=List[ResearchCommentResponse])
async def list_comments(report_id: int, db: Session = Depends(get_db)):
    """List top-level comments with nested replies for a research report."""
    report = db.query(ResearchReport).filter(ResearchReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    comments = db.query(ResearchComment).filter(
        ResearchComment.report_id == report_id, ResearchComment.parent_id.is_(None)
    ).order_by(ResearchComment.created_at).all()

    def build(c):
        user = db.query(PublicUser).filter(PublicUser.id == c.user_id).first()
        return ResearchCommentResponse(
            id=c.id, report_id=c.report_id, user_id=c.user_id,
            user_name=user.full_name if user else None,
            body="[deleted]" if c.is_deleted else c.body,
            parent_id=c.parent_id, is_deleted=c.is_deleted,
            created_at=c.created_at, updated_at=c.updated_at,
            replies=[build(r) for r in c.replies] if c.replies else [],
        )
    return [build(c) for c in comments]


@router.post("/public/research/{report_id}/comments", response_model=ResearchCommentResponse, status_code=201)
async def add_comment(report_id: int, data: ResearchCommentCreate,
                      db: Session = Depends(get_db),
                      current_user: PublicUser = Depends(get_insights_user)):
    """Add a comment to a research report (authenticated users only)."""
    report = db.query(ResearchReport).filter(ResearchReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if data.parent_id:
        parent = db.query(ResearchComment).filter(
            ResearchComment.id == data.parent_id, ResearchComment.report_id == report_id
        ).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent comment not found")
    comment = ResearchComment(report_id=report_id, user_id=current_user.id,
                              body=data.body, parent_id=data.parent_id)
    db.add(comment)
    report.comment_count += 1
    db.commit()
    db.refresh(comment)
    return ResearchCommentResponse(
        id=comment.id, report_id=comment.report_id, user_id=comment.user_id,
        user_name=current_user.full_name, body=comment.body,
        parent_id=comment.parent_id, is_deleted=False,
        created_at=comment.created_at, updated_at=comment.updated_at, replies=[],
    )


@router.delete("/public/research/comments/{comment_id}")
async def delete_comment(comment_id: int, db: Session = Depends(get_db),
                         current_user: PublicUser = Depends(get_insights_user)):
    """Soft-delete a comment. Users can delete their own; admins can delete any."""
    comment = db.query(ResearchComment).filter(ResearchComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorised")
    comment.is_deleted = True
    report = db.query(ResearchReport).filter(ResearchReport.id == comment.report_id).first()
    if report and report.comment_count > 0:
        report.comment_count -= 1
    db.commit()
    return {"detail": "Comment deleted"}


# ---------- Files ----------

@router.get("/public/research/{report_id}/files", response_model=List[ResearchFileResponse])
async def list_files(report_id: int, db: Session = Depends(get_db)):
    """List downloadable files for a research report."""
    report = db.query(ResearchReport).filter(ResearchReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return [ResearchFileResponse.model_validate(f) for f in report.files]


# ========== ADMIN ==========

@router.get("/admin/research", response_model=ResearchListResponse)
async def admin_list_reports(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=50),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db), admin: PublicUser = Depends(require_admin),
):
    """List all research reports for admin (includes drafts and archived)."""
    query = db.query(ResearchReport)
    if status_filter:
        query = query.filter(ResearchReport.status == status_filter)
    total = query.count()
    reports = query.order_by(desc(ResearchReport.created_at)).offset(
        (page - 1) * page_size).limit(page_size).all()
    return ResearchListResponse(
        items=[_report_to_list_item(r) for r in reports],
        total=total, page=page, page_size=page_size,
    )


@router.post("/admin/research", response_model=ResearchDetail, status_code=201)
async def create_report(data: ResearchCreate, background_tasks: BackgroundTasks,
                        db: Session = Depends(get_db),
                        admin: PublicUser = Depends(require_admin)):
    """Create a new research report (admin only)."""
    slug = data.slug or _slugify(data.title)
    if db.query(ResearchReport).filter(ResearchReport.slug == slug).first():
        raise HTTPException(status_code=400, detail="Slug already exists")

    now = datetime.now(timezone.utc)
    report = ResearchReport(
        title=data.title, slug=slug, abstract=data.abstract,
        authors=data.authors, status=data.status,
        published_at=data.published_at if data.status == "published" else None,
        version=data.version, regions=data.regions, tags=data.tags,
        funding_acknowledgement=data.funding_acknowledgement,
        citation_text=data.citation_text,
        content_access_tier=data.content_access_tier,
        seo_title=data.seo_title, meta_description=data.meta_description,
        canonical_url=data.canonical_url, focus_keywords=data.focus_keywords,
        og_image_url=data.og_image_url, structured_data=data.structured_data,
    )
    if data.status == "published" and not data.published_at:
        report.published_at = now
    db.add(report)
    db.commit()
    db.refresh(report)

    if report.status == "published":
        from utils.seo_prerender import prerender_research, regenerate_sitemap
        background_tasks.add_task(prerender_research, report)
        background_tasks.add_task(regenerate_sitemap)

    return ResearchDetail(
        **_report_to_list_item(report).__dict__,
        funding_acknowledgement=report.funding_acknowledgement,
        citation_text=report.citation_text,
        seo_title=report.seo_title, meta_description=report.meta_description,
        canonical_url=report.canonical_url, focus_keywords=report.focus_keywords,
        og_image_url=report.og_image_url, structured_data=report.structured_data,
        sections=[], files=[], user_has_liked=False,
    )


@router.get("/admin/research/{report_id}", response_model=ResearchDetail)
async def admin_get_report(report_id: int, db: Session = Depends(get_db),
                           admin: PublicUser = Depends(require_admin)):
    """Get a single research report by ID for admin editing (includes drafts)."""
    report = db.query(ResearchReport).filter(ResearchReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    sections = [ResearchSectionResponse.model_validate(s) for s in report.sections]
    files = [ResearchFileResponse.model_validate(f) for f in report.files]
    return ResearchDetail(
        **_report_to_list_item(report).__dict__,
        funding_acknowledgement=report.funding_acknowledgement,
        citation_text=report.citation_text,
        seo_title=report.seo_title, meta_description=report.meta_description,
        canonical_url=report.canonical_url, focus_keywords=report.focus_keywords,
        og_image_url=report.og_image_url, structured_data=report.structured_data,
        sections=sections, files=files, user_has_liked=False,
    )


@router.put("/admin/research/{report_id}", response_model=ResearchDetail)
async def update_report(report_id: int, data: ResearchUpdate,
                        background_tasks: BackgroundTasks,
                        db: Session = Depends(get_db),
                        admin: PublicUser = Depends(require_admin)):
    """Update an existing research report (admin only)."""
    report = db.query(ResearchReport).filter(ResearchReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    old_slug = report.slug
    update_fields = data.model_dump(exclude_unset=True)
    if "slug" in update_fields and update_fields["slug"] != report.slug:
        if db.query(ResearchReport).filter(
            ResearchReport.slug == update_fields["slug"], ResearchReport.id != report_id
        ).first():
            raise HTTPException(status_code=400, detail="Slug already exists")
    if update_fields.get("status") == "published" and report.status != "published":
        if "published_at" not in update_fields or not update_fields["published_at"]:
            update_fields["published_at"] = datetime.now(timezone.utc)
    for key, value in update_fields.items():
        setattr(report, key, value)
    db.commit()
    db.refresh(report)

    from utils.seo_prerender import prerender_research, delete_prerendered, regenerate_sitemap
    background_tasks.add_task(prerender_research, report)
    background_tasks.add_task(regenerate_sitemap)
    if old_slug != report.slug:
        background_tasks.add_task(delete_prerendered, "research", old_slug)
    sections = [ResearchSectionResponse.model_validate(s) for s in report.sections]
    files = [ResearchFileResponse.model_validate(f) for f in report.files]
    return ResearchDetail(
        **_report_to_list_item(report).__dict__,
        funding_acknowledgement=report.funding_acknowledgement,
        citation_text=report.citation_text,
        seo_title=report.seo_title, meta_description=report.meta_description,
        canonical_url=report.canonical_url, focus_keywords=report.focus_keywords,
        og_image_url=report.og_image_url, structured_data=report.structured_data,
        sections=sections, files=files, user_has_liked=False,
    )


@router.delete("/admin/research/{report_id}")
async def archive_report(report_id: int, background_tasks: BackgroundTasks,
                         db: Session = Depends(get_db),
                         admin: PublicUser = Depends(require_admin)):
    """Archive a research report (soft delete, admin only)."""
    report = db.query(ResearchReport).filter(ResearchReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    slug = report.slug
    report.status = "archived"
    db.commit()

    from utils.seo_prerender import delete_prerendered, regenerate_sitemap
    background_tasks.add_task(delete_prerendered, "research", slug)
    background_tasks.add_task(regenerate_sitemap)

    return {"detail": "Report archived"}


@router.post("/admin/research/prerender-all")
async def prerender_all_research(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Pre-render SEO pages for all published research. Run once to backfill."""
    from utils.seo_prerender import prerender_research
    reports = db.query(ResearchReport).filter(ResearchReport.status == "published").all()
    for report in reports:
        background_tasks.add_task(prerender_research, report)
    return {"detail": f"Queued {len(reports)} research reports for pre-rendering"}


# ---------- Sections ----------

@router.post("/admin/research/{report_id}/sections", response_model=ResearchSectionResponse, status_code=201)
async def add_section(report_id: int, data: ResearchSectionCreate,
                      db: Session = Depends(get_db),
                      admin: PublicUser = Depends(require_admin)):
    """Add a section to a research report (admin only)."""
    report = db.query(ResearchReport).filter(ResearchReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    max_order = db.query(func.max(ResearchSection.sort_order)).filter(
        ResearchSection.report_id == report_id).scalar() or 0
    section = ResearchSection(
        report_id=report_id, sort_order=max_order + 1,
        title=data.title, section_type=data.section_type,
        content=data.content, caption=data.caption,
        content_access_tier=data.content_access_tier,
    )
    db.add(section)
    db.commit()
    db.refresh(section)
    return ResearchSectionResponse.model_validate(section)


@router.put("/admin/research/sections/{section_id}", response_model=ResearchSectionResponse)
async def update_section(section_id: int, data: ResearchSectionUpdate,
                         db: Session = Depends(get_db),
                         admin: PublicUser = Depends(require_admin)):
    """Update a research section (admin only)."""
    section = db.query(ResearchSection).filter(ResearchSection.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(section, key, value)
    db.commit()
    db.refresh(section)
    return ResearchSectionResponse.model_validate(section)


@router.delete("/admin/research/sections/{section_id}")
async def delete_section(section_id: int, db: Session = Depends(get_db),
                         admin: PublicUser = Depends(require_admin)):
    """Delete a research section (admin only)."""
    section = db.query(ResearchSection).filter(ResearchSection.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    db.delete(section)
    db.commit()
    return {"detail": "Section deleted"}


@router.put("/admin/research/{report_id}/sections/order")
async def reorder_sections(report_id: int, data: SectionReorderRequest,
                           db: Session = Depends(get_db),
                           admin: PublicUser = Depends(require_admin)):
    """Reorder sections within a research report (admin only)."""
    report = db.query(ResearchReport).filter(ResearchReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    for item in data.sections:
        section = db.query(ResearchSection).filter(
            ResearchSection.id == item.id, ResearchSection.report_id == report_id
        ).first()
        if section:
            section.sort_order = item.sort_order
    db.commit()
    return {"detail": "Sections reordered"}
