# utils/seo_prerender.py — Pre-render SEO HTML to S3 for crawler visibility
#
# The Insights SPA lives on S3/CloudFront, so the FastAPI meta-injection
# middleware never sees crawler requests.  Instead, when an article or
# research report is published we:
#   1. Download the current index.html from the S3 webapp bucket
#   2. Replace default meta / OG / JSON-LD with content-specific tags
#   3. Upload the result as  articles/{slug}  (or research/{slug})
#
# CloudFront finds the key and serves it directly (200).  The React
# script tags are still present so the SPA hydrates for real users.

import json
import logging
import re
from html import escape as html_escape

import boto3

from core.config import settings

logger = logging.getLogger(__name__)

_INSIGHTS_BUCKET = "auxein-insights-webapp"
# Use FRONTEND_URL if it's a real domain; fall back to production URL
_frontend = (settings.FRONTEND_URL or "").rstrip("/")
_SITE_URL = _frontend if _frontend.startswith("https://") else "https://insights.auxein.co.nz"


# ── S3 helpers ──────────────────────────────────────────────────────

def _s3():
    return boto3.client("s3", region_name=settings.AWS_REGION)


def _fetch_index_html() -> str:
    """Download the live index.html from the webapp S3 bucket."""
    resp = _s3().get_object(Bucket=_INSIGHTS_BUCKET, Key="index.html")
    return resp["Body"].read().decode("utf-8")


# ── JSON-LD builders ───────────────────────────────────────────────

def _article_json_ld(meta: dict) -> str:
    content_type = meta.get("content_type", "articles")
    schema_type = "ScholarlyArticle" if content_type == "research" else "Article"
    ld = {
        "@context": "https://schema.org",
        "@type": schema_type,
        "headline": meta["title"],
        "description": meta.get("description", ""),
        "datePublished": meta.get("published_at", ""),
        "author": {"@type": "Organization", "name": "Auxein Limited", "url": "https://auxein.co.nz"},
        "publisher": {"@type": "Organization", "name": "Auxein Limited", "url": "https://auxein.co.nz"},
        "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": f"{_SITE_URL}/{content_type}/{meta.get('slug', '')}",
        },
    }
    if meta.get("image"):
        ld["image"] = meta["image"]
    if meta.get("tags"):
        ld["keywords"] = ", ".join(meta["tags"])
    return json.dumps(ld)


def _breadcrumb_ld(meta: dict) -> str:
    content_type = meta.get("content_type", "articles")
    section_name = "Articles" if content_type == "articles" else "Research"
    return json.dumps({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": _SITE_URL},
            {"@type": "ListItem", "position": 2, "name": section_name, "item": f"{_SITE_URL}/{content_type}"},
            {"@type": "ListItem", "position": 3, "name": meta["title"]},
        ],
    })


# ── HTML injection ─────────────────────────────────────────────────

def _inject_seo(html: str, meta: dict) -> str:
    """Replace the default homepage SEO tags with content-specific ones."""
    safe_title = html_escape(meta["title"], quote=True)
    safe_desc = html_escape(meta.get("description", ""), quote=True)
    page_url = f"{_SITE_URL}/{meta.get('content_type', 'articles')}/{meta.get('slug', '')}"

    # Strip existing tags that we'll replace
    html = re.sub(r"<title>[^<]*</title>",
                  f"<title>{safe_title} | Auxein Regional Insights</title>", html, count=1)
    html = re.sub(r'<meta\s+name="description"[^>]*/>\s*\n?', "", html)
    html = re.sub(r'<meta\s+name="keywords"[^>]*/>\s*\n?', "", html)
    html = re.sub(r'<meta\s+property="og:[^"]*"[^>]*/>\s*\n?', "", html)
    html = re.sub(r'<meta\s+name="twitter:[^"]*"[^>]*/>\s*\n?', "", html)
    html = re.sub(r'<script\s+type="application/ld\+json">[\s\S]*?</script>\s*\n?', "", html)
    html = re.sub(r'<link\s+rel="canonical"[^>]*/>\s*\n?', "", html)

    # Build replacement block
    tags = (
        f'    <!-- SEO (pre-rendered) -->\n'
        f'    <meta name="description" content="{safe_desc}" />\n'
        f'    <link rel="canonical" href="{page_url}" />\n'
        f'    <meta property="og:type" content="article" />\n'
        f'    <meta property="og:url" content="{page_url}" />\n'
        f'    <meta property="og:title" content="{safe_title}" />\n'
        f'    <meta property="og:description" content="{safe_desc}" />\n'
        f'    <meta property="og:site_name" content="Auxein Regional Insights" />\n'
        f'    <meta property="og:locale" content="en_NZ" />\n'
    )
    if meta.get("image"):
        safe_img = html_escape(meta["image"], quote=True)
        tags += f'    <meta property="og:image" content="{safe_img}" />\n'

    tags += (
        f'    <meta name="twitter:card" content="summary_large_image" />\n'
        f'    <meta name="twitter:title" content="{safe_title}" />\n'
        f'    <meta name="twitter:description" content="{safe_desc}" />\n'
    )
    if meta.get("image"):
        tags += f'    <meta name="twitter:image" content="{safe_img}" />\n'

    tags += f'    <script type="application/ld+json">{_article_json_ld(meta)}</script>\n'
    tags += f'    <script type="application/ld+json">{_breadcrumb_ld(meta)}</script>\n'

    html = html.replace("</head>", tags + "  </head>")
    return html


# ── Public API ─────────────────────────────────────────────────────

def prerender_article(article):
    """Pre-render a published article to S3, or delete if not published."""
    if article.status != "published":
        _delete("articles", article.slug)
        return
    _upload("articles", article.slug, {
        "title": article.seo_title or article.title,
        "description": article.meta_description or article.excerpt or "",
        "image": article.og_image_url or article.featured_image_url or "",
        "tags": article.tags or [],
        "published_at": article.published_at.isoformat() if article.published_at else "",
        "slug": article.slug,
        "content_type": "articles",
        "structured_data": article.structured_data,
    })


def prerender_research(report):
    """Pre-render a published research report to S3, or delete if not published."""
    if report.status != "published":
        _delete("research", report.slug)
        return
    _upload("research", report.slug, {
        "title": report.seo_title or report.title,
        "description": report.meta_description or report.abstract or "",
        "image": report.og_image_url or "",
        "tags": report.tags or [],
        "published_at": report.published_at.isoformat() if report.published_at else "",
        "slug": report.slug,
        "content_type": "research",
        "structured_data": report.structured_data,
    })


def delete_prerendered(content_type: str, slug: str):
    """Remove pre-rendered page (e.g. on archive)."""
    _delete(content_type, slug)


def regenerate_sitemap():
    """Query all published content and upload a fresh sitemap.xml to S3."""
    from db.session import SessionLocal
    from db.models.article import Article
    from db.models.research import ResearchReport
    from sqlalchemy import desc

    db = SessionLocal()
    try:
        urls = [
            f'<url><loc>{_SITE_URL}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>',
            f'<url><loc>{_SITE_URL}/articles</loc><changefreq>daily</changefreq><priority>0.9</priority></url>',
            f'<url><loc>{_SITE_URL}/research</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>',
        ]

        articles = db.query(Article.slug, Article.updated_at).filter(
            Article.status == "published"
        ).order_by(desc(Article.published_at)).all()
        for slug, updated in articles:
            lastmod = f"<lastmod>{updated.strftime('%Y-%m-%d')}</lastmod>" if updated else ""
            urls.append(
                f'<url><loc>{_SITE_URL}/articles/{slug}</loc>{lastmod}'
                f'<changefreq>weekly</changefreq><priority>0.7</priority></url>'
            )

        reports = db.query(ResearchReport.slug, ResearchReport.updated_at).filter(
            ResearchReport.status == "published"
        ).order_by(desc(ResearchReport.published_at)).all()
        for slug, updated in reports:
            lastmod = f"<lastmod>{updated.strftime('%Y-%m-%d')}</lastmod>" if updated else ""
            urls.append(
                f'<url><loc>{_SITE_URL}/research/{slug}</loc>{lastmod}'
                f'<changefreq>monthly</changefreq><priority>0.7</priority></url>'
            )

        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + "\n".join(urls)
            + "\n</urlset>"
        )

        _s3().put_object(
            Bucket=_INSIGHTS_BUCKET,
            Key="sitemap.xml",
            Body=xml.encode("utf-8"),
            ContentType="application/xml",
            CacheControl="public, max-age=3600",
        )
        logger.info("Sitemap uploaded to s3://%s/sitemap.xml (%d URLs)", _INSIGHTS_BUCKET, len(urls))
    except Exception as e:
        logger.error("Failed to regenerate sitemap: %s", e)
    finally:
        db.close()


# ── Internal ───────────────────────────────────────────────────────

def _upload(content_type: str, slug: str, meta: dict):
    try:
        html = _fetch_index_html()
    except Exception as e:
        logger.error("Failed to fetch index.html from S3: %s", e)
        return

    rendered = _inject_seo(html, meta)
    s3_key = f"{content_type}/{slug}"

    try:
        _s3().put_object(
            Bucket=_INSIGHTS_BUCKET,
            Key=s3_key,
            Body=rendered.encode("utf-8"),
            ContentType="text/html; charset=utf-8",
            CacheControl="public, max-age=300",
        )
        logger.info("Pre-rendered SEO page uploaded: s3://%s/%s", _INSIGHTS_BUCKET, s3_key)
    except Exception as e:
        logger.error("Failed to upload pre-rendered page: %s", e)


def _delete(content_type: str, slug: str):
    s3_key = f"{content_type}/{slug}"
    try:
        _s3().delete_object(Bucket=_INSIGHTS_BUCKET, Key=s3_key)
        logger.info("Deleted pre-rendered page: s3://%s/%s", _INSIGHTS_BUCKET, s3_key)
    except Exception as e:
        logger.error("Failed to delete pre-rendered page: %s", e)
