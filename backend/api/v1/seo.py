# backend/api/v1/seo.py - SEO endpoints (sitemap, RSS, validation)
from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import desc
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.article import Article
from db.models.research import ResearchReport
from db.models.public_user import PublicUser
from db.models.climate import ClimateZone
from core.admin_security import require_admin

router = APIRouter()

SITE_URL = "https://insights.auxein.co.nz"

# Every public page on insights.auxein.co.nz that is not generated from a DB row.
# KEEP THIS IN STEP WITH THE ROUTE TABLE in packages/insights/src/App.jsx — a page
# added or removed there updates this list in the SAME change. See
# docs/plans/INSIGHTS_SITE_MAP_2026-08-13.md §0 D-D.
STATIC_PAGES = [
    ("/", "daily", "1.0"),
    ("/map", "daily", "0.9"),
    ("/regions", "daily", "0.9"),
    ("/articles", "daily", "0.9"),
    # /research is a placeholder as of 2026-08-13 and is deliberately omitted —
    # an empty "coming soon" page competing with real article content in search
    # results is worse than no page. Restore it when there is something there.
    # Published research REPORTS are still emitted below; only the index is out.
    ("/about", "monthly", "0.5"),
    ("/legal", "yearly", "0.2"),
]


@router.get("/sitemap.xml")
async def sitemap(db: Session = Depends(get_db)):
    """Auto-generated XML sitemap with all published articles and research."""
    urls = [
        f'<url><loc>{SITE_URL}{path}</loc>'
        f'<changefreq>{freq}</changefreq><priority>{priority}</priority></url>'
        for path, freq, priority in STATIC_PAGES
    ]

    # Region pages. Each active climate zone is a real page at /regions/{slug}
    # as of 2026-08-13; before that a zone was only selector state inside a
    # component and had no URL at all, so none of this was indexable. These are
    # the strongest organic-search assets the site has — "<region> climate" is
    # exactly what growers search — so they rank just under the section indexes.
    zones = db.query(ClimateZone.slug).filter(
        ClimateZone.is_active == True  # noqa: E712 — SQLAlchemy needs ==, not `is`
    ).order_by(ClimateZone.display_order).all()
    for (slug,) in zones:
        urls.append(
            f'<url><loc>{SITE_URL}/regions/{slug}</loc>'
            f'<changefreq>daily</changefreq><priority>0.8</priority></url>'
        )

    articles = db.query(Article.slug, Article.updated_at).filter(
        Article.status == "published"
    ).order_by(desc(Article.published_at)).all()
    for slug, updated in articles:
        lastmod = f"<lastmod>{updated.strftime('%Y-%m-%d')}</lastmod>" if updated else ""
        urls.append(
            f'<url><loc>{SITE_URL}/articles/{slug}</loc>{lastmod}'
            f'<changefreq>weekly</changefreq><priority>0.7</priority></url>'
        )

    reports = db.query(ResearchReport.slug, ResearchReport.updated_at).filter(
        ResearchReport.status == "published"
    ).order_by(desc(ResearchReport.published_at)).all()
    for slug, updated in reports:
        lastmod = f"<lastmod>{updated.strftime('%Y-%m-%d')}</lastmod>" if updated else ""
        urls.append(
            f'<url><loc>{SITE_URL}/research/{slug}</loc>{lastmod}'
            f'<changefreq>monthly</changefreq><priority>0.7</priority></url>'
        )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls)
        + "\n</urlset>"
    )
    return Response(content=xml, media_type="application/xml")


@router.get("/rss.xml")
async def rss_feed(db: Session = Depends(get_db)):
    """RSS feed of the 20 most recent published articles."""
    articles = (
        db.query(Article)
        .filter(Article.status == "published")
        .order_by(desc(Article.published_at))
        .limit(20)
        .all()
    )

    items = []
    for a in articles:
        pub_date = a.published_at.strftime("%a, %d %b %Y %H:%M:%S +0000") if a.published_at else ""
        desc_text = (a.meta_description or a.excerpt or "")
        # Escape XML special chars
        safe_title = a.title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        safe_desc = desc_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        items.append(
            f"<item>"
            f"<title>{safe_title}</title>"
            f"<link>{SITE_URL}/articles/{a.slug}</link>"
            f"<description>{safe_desc}</description>"
            f"<pubDate>{pub_date}</pubDate>"
            f"<guid>{SITE_URL}/articles/{a.slug}</guid>"
            f"</item>"
        )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n'
        "<channel>\n"
        "<title>Auxein Regional Insights</title>\n"
        f"<link>{SITE_URL}</link>\n"
        "<description>Climate intelligence for New Zealand wine regions</description>\n"
        "<language>en-nz</language>\n"
        f'<atom:link href="{SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />\n'
        + "\n".join(items)
        + "\n</channel>\n</rss>"
    )
    return Response(content=xml, media_type="application/rss+xml")


@router.get("/api/v1/admin/seo/validate/{content_type}/{content_id}")
async def validate_seo(
    content_type: str, content_id: int,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Check SEO completeness for an article or research report (admin only)."""
    if content_type == "articles":
        item = db.query(Article).filter(Article.id == content_id).first()
    elif content_type == "research":
        item = db.query(ResearchReport).filter(ResearchReport.id == content_id).first()
    else:
        return {"errors": ["Invalid content type"]}

    if not item:
        return {"errors": ["Content not found"]}

    warnings = []
    if not item.seo_title:
        warnings.append("Missing SEO title")
    elif len(item.seo_title) > 70:
        warnings.append(f"SEO title too long ({len(item.seo_title)}/70)")
    if not item.meta_description:
        warnings.append("Missing meta description")
    elif len(item.meta_description) > 160:
        warnings.append(f"Meta description too long ({len(item.meta_description)}/160)")
    if not item.focus_keywords:
        warnings.append("No focus keywords set")
    if not item.og_image_url:
        warnings.append("No OG image set")
    if hasattr(item, "excerpt") and not item.excerpt:
        warnings.append("No excerpt set")

    return {
        "content_type": content_type,
        "content_id": content_id,
        "score": max(0, 100 - len(warnings) * 20),
        "warnings": warnings,
    }
