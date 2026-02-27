# backend/api/v1/articles.py - Articles API endpoints
import re
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.article import Article
from db.models.article_engagement import ArticleComment, ArticleLike
from db.models.public_user import PublicUser
from core.public_security import get_current_public_user, get_optional_public_user
from core.admin_security import require_admin
from schemas.article import (
    ArticleListItem,
    ArticleDetail,
    ArticleListResponse,
    ArticleCreate,
    ArticleUpdate,
    CommentCreate,
    CommentResponse,
)

router = APIRouter()


# ---------- helpers ----------

def _slugify(text: str) -> str:
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    return re.sub(r"-+", "-", slug).strip("-")


def _article_to_list_item(article: Article) -> ArticleListItem:
    author = article.author
    return ArticleListItem(
        id=article.id,
        title=article.title,
        slug=article.slug,
        excerpt=article.excerpt,
        featured_image_url=article.featured_image_url,
        featured_image_alt=article.featured_image_alt,
        author_name=author.full_name if author else None,
        status=article.status,
        published_at=article.published_at,
        tags=article.tags,
        region_tags=article.region_tags,
        content_access_tier=article.content_access_tier,
        like_count=article.like_count,
        comment_count=article.comment_count,
        view_count=article.view_count,
        created_at=article.created_at,
    )


# ========== PUBLIC ENDPOINTS ==========

@router.get("/public/articles", response_model=ArticleListResponse)
async def list_articles(
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
    tag: Optional[str] = None,
    region: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List published articles with optional filtering and pagination."""
    query = db.query(Article).filter(Article.status == "published")

    if tag:
        query = query.filter(Article.tags.any(tag))
    if region:
        query = query.filter(Article.region_tags.any(region))
    if search:
        query = query.filter(
            Article.title.ilike(f"%{search}%")
            | Article.excerpt.ilike(f"%{search}%")
        )

    total = query.count()
    articles = (
        query.order_by(desc(Article.published_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return ArticleListResponse(
        items=[_article_to_list_item(a) for a in articles],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/public/articles/{slug}", response_model=ArticleDetail)
async def get_article(
    slug: str,
    db: Session = Depends(get_db),
    current_user: Optional[PublicUser] = Depends(get_optional_public_user),
):
    """Get a single published article by slug."""
    article = db.query(Article).filter(
        Article.slug == slug, Article.status == "published"
    ).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    author = article.author
    user_has_liked = False
    if current_user:
        user_has_liked = (
            db.query(ArticleLike)
            .filter(ArticleLike.article_id == article.id, ArticleLike.user_id == current_user.id)
            .first()
            is not None
        )

    return ArticleDetail(
        id=article.id,
        title=article.title,
        slug=article.slug,
        body=article.body,
        excerpt=article.excerpt,
        featured_image_url=article.featured_image_url,
        featured_image_alt=article.featured_image_alt,
        author_name=author.full_name if author else None,
        author_id=article.author_id,
        status=article.status,
        published_at=article.published_at,
        tags=article.tags,
        region_tags=article.region_tags,
        content_access_tier=article.content_access_tier,
        like_count=article.like_count,
        comment_count=article.comment_count,
        view_count=article.view_count,
        created_at=article.created_at,
        seo_title=article.seo_title,
        meta_description=article.meta_description,
        canonical_url=article.canonical_url,
        focus_keywords=article.focus_keywords,
        og_image_url=article.og_image_url,
        structured_data=article.structured_data,
        user_has_liked=user_has_liked,
    )


# ---------- Related ----------

@router.get("/public/articles/{slug}/related")
async def get_related_articles(
    slug: str,
    limit: int = Query(4, ge=1, le=8),
    db: Session = Depends(get_db),
):
    """Get related articles based on tag overlap."""
    article = db.query(Article).filter(
        Article.slug == slug, Article.status == "published"
    ).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    if not article.tags:
        return []

    related = (
        db.query(Article)
        .filter(
            Article.status == "published",
            Article.id != article.id,
            Article.tags.overlap(article.tags),
        )
        .order_by(desc(Article.published_at))
        .limit(limit)
        .all()
    )

    return [
        {
            "id": a.id,
            "title": a.title,
            "slug": a.slug,
            "excerpt": a.excerpt,
            "thumbnail_url": a.thumbnail_url or a.featured_image_url,
            "published_at": a.published_at,
            "tags": a.tags,
        }
        for a in related
    ]


# ---------- Views ----------

@router.post("/public/articles/{article_id}/view", status_code=204)
async def record_article_view(
    article_id: int,
    db: Session = Depends(get_db),
):
    """Increment view count for an article."""
    article = db.query(Article).filter(
        Article.id == article_id, Article.status == "published"
    ).first()
    if article:
        article.view_count += 1
        db.commit()


# ---------- Likes ----------

@router.post("/public/articles/{article_id}/like", status_code=201)
async def like_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: PublicUser = Depends(get_current_public_user),
):
    """Toggle like on an article (authenticated users only)."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    existing = (
        db.query(ArticleLike)
        .filter(ArticleLike.article_id == article_id, ArticleLike.user_id == current_user.id)
        .first()
    )
    if existing:
        return {"detail": "Already liked"}

    db.add(ArticleLike(article_id=article_id, user_id=current_user.id))
    article.like_count += 1
    db.commit()
    return {"detail": "Liked", "like_count": article.like_count}


@router.delete("/public/articles/{article_id}/like")
async def unlike_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: PublicUser = Depends(get_current_public_user),
):
    """Remove like from an article (authenticated users only)."""
    like = (
        db.query(ArticleLike)
        .filter(ArticleLike.article_id == article_id, ArticleLike.user_id == current_user.id)
        .first()
    )
    if not like:
        raise HTTPException(status_code=404, detail="Like not found")

    db.delete(like)
    article = db.query(Article).filter(Article.id == article_id).first()
    if article and article.like_count > 0:
        article.like_count -= 1
    db.commit()
    return {"detail": "Unliked", "like_count": article.like_count if article else 0}


# ---------- Comments ----------

@router.get("/public/articles/{article_id}/comments", response_model=List[CommentResponse])
async def list_comments(
    article_id: int,
    db: Session = Depends(get_db),
):
    """List top-level comments with nested replies for an article."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    comments = (
        db.query(ArticleComment)
        .filter(ArticleComment.article_id == article_id, ArticleComment.parent_id.is_(None))
        .order_by(ArticleComment.created_at)
        .all()
    )

    def build(c: ArticleComment) -> CommentResponse:
        user = db.query(PublicUser).filter(PublicUser.id == c.user_id).first()
        return CommentResponse(
            id=c.id,
            article_id=c.article_id,
            user_id=c.user_id,
            user_name=user.full_name if user else None,
            body="[deleted]" if c.is_deleted else c.body,
            parent_id=c.parent_id,
            is_deleted=c.is_deleted,
            created_at=c.created_at,
            updated_at=c.updated_at,
            replies=[build(r) for r in c.replies] if c.replies else [],
        )

    return [build(c) for c in comments]


@router.post("/public/articles/{article_id}/comments", response_model=CommentResponse, status_code=201)
async def add_comment(
    article_id: int,
    data: CommentCreate,
    db: Session = Depends(get_db),
    current_user: PublicUser = Depends(get_current_public_user),
):
    """Add a comment to an article (authenticated users only)."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    if data.parent_id:
        parent = db.query(ArticleComment).filter(
            ArticleComment.id == data.parent_id,
            ArticleComment.article_id == article_id,
        ).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent comment not found")

    comment = ArticleComment(
        article_id=article_id,
        user_id=current_user.id,
        body=data.body,
        parent_id=data.parent_id,
    )
    db.add(comment)
    article.comment_count += 1
    db.commit()
    db.refresh(comment)

    return CommentResponse(
        id=comment.id,
        article_id=comment.article_id,
        user_id=comment.user_id,
        user_name=current_user.full_name,
        body=comment.body,
        parent_id=comment.parent_id,
        is_deleted=False,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        replies=[],
    )


@router.delete("/public/articles/comments/{comment_id}")
async def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: PublicUser = Depends(get_current_public_user),
):
    """Soft-delete a comment. Users can delete their own; admins can delete any."""
    comment = db.query(ArticleComment).filter(ArticleComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    if comment.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorised")

    comment.is_deleted = True
    article = db.query(Article).filter(Article.id == comment.article_id).first()
    if article and article.comment_count > 0:
        article.comment_count -= 1
    db.commit()
    return {"detail": "Comment deleted"}


# ========== ADMIN ENDPOINTS ==========

@router.get("/admin/articles", response_model=ArticleListResponse)
async def admin_list_articles(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """List all articles for admin (includes drafts and archived)."""
    query = db.query(Article)

    if status_filter:
        query = query.filter(Article.status == status_filter)

    total = query.count()
    articles = (
        query.order_by(desc(Article.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return ArticleListResponse(
        items=[_article_to_list_item(a) for a in articles],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/admin/articles", response_model=ArticleDetail, status_code=201)
async def create_article(
    data: ArticleCreate,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Create a new article (admin only)."""
    slug = data.slug or _slugify(data.title)

    existing = db.query(Article).filter(Article.slug == slug).first()
    if existing:
        raise HTTPException(status_code=400, detail="Slug already exists")

    now = datetime.now(timezone.utc)
    article = Article(
        title=data.title,
        slug=slug,
        body=data.body,
        excerpt=data.excerpt,
        featured_image_url=data.featured_image_url,
        featured_image_alt=data.featured_image_alt,
        author_id=admin.id,
        status=data.status,
        published_at=data.published_at if data.status == "published" else None,
        tags=data.tags,
        region_tags=data.region_tags,
        content_access_tier=data.content_access_tier,
        seo_title=data.seo_title,
        meta_description=data.meta_description,
        canonical_url=data.canonical_url,
        focus_keywords=data.focus_keywords,
        og_image_url=data.og_image_url,
        structured_data=data.structured_data,
    )

    if data.status == "published" and not data.published_at:
        article.published_at = now

    db.add(article)
    db.commit()
    db.refresh(article)

    return ArticleDetail(
        **{k: v for k, v in _article_to_list_item(article).__dict__.items()},
        body=article.body,
        author_id=article.author_id,
        seo_title=article.seo_title,
        meta_description=article.meta_description,
        canonical_url=article.canonical_url,
        focus_keywords=article.focus_keywords,
        og_image_url=article.og_image_url,
        structured_data=article.structured_data,
        user_has_liked=False,
    )


@router.get("/admin/articles/{article_id}", response_model=ArticleDetail)
async def admin_get_article(
    article_id: int,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Get a single article by ID for admin editing (includes drafts)."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    return ArticleDetail(
        **{k: v for k, v in _article_to_list_item(article).__dict__.items()},
        body=article.body,
        author_id=article.author_id,
        seo_title=article.seo_title,
        meta_description=article.meta_description,
        canonical_url=article.canonical_url,
        focus_keywords=article.focus_keywords,
        og_image_url=article.og_image_url,
        structured_data=article.structured_data,
        user_has_liked=False,
    )


@router.put("/admin/articles/{article_id}", response_model=ArticleDetail)
async def update_article(
    article_id: int,
    data: ArticleUpdate,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Update an existing article (admin only)."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    update_fields = data.model_dump(exclude_unset=True)

    if "slug" in update_fields and update_fields["slug"] != article.slug:
        existing = db.query(Article).filter(
            Article.slug == update_fields["slug"], Article.id != article_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Slug already exists")

    # Auto-set published_at when transitioning to published
    if update_fields.get("status") == "published" and article.status != "published":
        if "published_at" not in update_fields or not update_fields["published_at"]:
            update_fields["published_at"] = datetime.now(timezone.utc)

    for key, value in update_fields.items():
        setattr(article, key, value)

    db.commit()
    db.refresh(article)

    return ArticleDetail(
        **{k: v for k, v in _article_to_list_item(article).__dict__.items()},
        body=article.body,
        author_id=article.author_id,
        seo_title=article.seo_title,
        meta_description=article.meta_description,
        canonical_url=article.canonical_url,
        focus_keywords=article.focus_keywords,
        og_image_url=article.og_image_url,
        structured_data=article.structured_data,
        user_has_liked=False,
    )


@router.delete("/admin/articles/{article_id}")
async def archive_article(
    article_id: int,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Archive an article (soft delete, admin only)."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    article.status = "archived"
    db.commit()
    return {"detail": "Article archived"}
