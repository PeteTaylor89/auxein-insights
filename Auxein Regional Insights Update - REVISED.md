# Auxein Regional Insights - Upgrade Plan (Revised)

## Document Purpose

This document defines the complete upgrade plan for the Auxein Regional Insights platform. It is a **revised version** of the original plan, updated to reflect the actual state of the existing codebase, correct architectural assumptions, and sequence work based on what infrastructure already exists.

### Key Revisions from Original

| Area | Original Assumption | Actual State | Resolution |
|------|---------------------|-------------|------------|
| User PKs | UUID, `users(id)` | Integer, `public_users(id)` | All content FKs use Integer FK to `public_users(id)` |
| Rendering | SSR/Next.js required | Vite SPA (React + react-router-dom) | FastAPI catch-all injects dynamic `<head>` for content pages |
| Admin auth | `is_admin` on user model | Email domain check (`@auxein.co.nz`) | Add `is_admin` boolean to `PublicUser` |
| Image storage | S3/CDN | Local disk (`settings.UPLOAD_DIR`) | Local first with WebP processing; cloud migration later |
| Email templates | MJML | Inline Python HTML strings | Extend existing `UnifiedEmailService` |
| Migrations | Alembic assumed | No Alembic directory exists | Set up Alembic as pre-work |
| Email preferences | Separate table | Fields already on `PublicUser` | Extend `PublicUser` with additional preference fields |
| Analytics | Custom events table | Umami analytics already integrated | Umami for general analytics; lightweight custom table for structured engagement data |

---

## 1. Project Overview

### 1.1 Current State

Regional Insights is a free, sign-in-required climate intelligence platform for NZ wine regions. It provides:
- 5 climate data views: Current Season, Phenology, Disease Pressure, Climate History, Climate Projections
- Interactive Regional Explorer map (Mapbox GL) with vineyard blocks, GIs, and region data
- Public user authentication (JWT, bcrypt, email verification, password reset)
- Admin dashboard (user management, weather station status, banner management)
- Umami analytics integration for event tracking
- Basic SEO infrastructure (static meta tags, OG tags, robots.txt, static sitemap)
- Marketing preference capture (newsletter, marketing, research opt-ins)
- User segmentation (user_type, company_name, job_title, region_of_interest)

**Tech stack:**
- Frontend: React 18 + Vite + react-router-dom v7 (SPA, port 5174)
- Backend: FastAPI + SQLAlchemy + PostgreSQL + PostGIS (port 8000)
- Auth: JWT via python-jose, bcrypt via passlib
- Maps: Mapbox GL
- Charts: Chart.js + react-chartjs-2
- Analytics: Umami (cloud-hosted)
- Email: SMTP via Gmail (inline HTML templates)
- File storage: Local disk (`settings.UPLOAD_DIR`)
- Icons: lucide-react

### 1.2 Target State

Transform Regional Insights into a full climate intelligence platform with five new capabilities:

1. **Articles Engine** - SEO-optimised blog/newsletter articles with rich content, embedded live data widgets, and community engagement
2. **Research Portal** - Structured, section-based research reports with interactive data, downloads, and citation support
3. **Email Newsletter System** - Template-based email generation with user preference segmentation and live preview
4. **User Data Enrichment** - Behavioural tracking and progressive profiling for user segmentation and Pro conversion
5. **Pro Access Tier** - Content gating system enabling free-to-paid conversion (activated 3-4 months after initial launch)

### 1.3 Architecture Principles

- **Single platform, multiple content types.** Articles, research reports, and data pages share authentication, SEO infrastructure, commenting, engagement tracking, and the access tier system.
- **Content tier from day one.** Every piece of content gets a `free`/`preview`/`pro` tier tag at creation. Everything defaults to `free` initially. When Pro launches, gating is a tagging decision, not a rebuild.
- **SEO is structural, not cosmetic.** Built into the data model, the editor, the rendering pipeline, and the sitemap from the start.
- **Data is the differentiator.** Articles and research that embed live Regional Insights data widgets are genuinely unique content.
- **Privacy-first enrichment.** All user data collection is first-party, compliant with NZ Privacy Act 2020.
- **SPA-compatible SEO.** Use FastAPI server-side injection of meta tags for content pages rather than migrating to SSR/Next.js.

---

## 2. Pre-Work: Infrastructure Setup

Before starting Phase 1, establish the following infrastructure:

### 2.1 Alembic Migration Setup

No Alembic directory currently exists. Set up:

```bash
cd backend
pip install alembic
alembic init alembic
```

Configure `alembic/env.py` to use the existing `db.base_class.Base` metadata and `db.session` engine. Generate initial migration from existing models to establish baseline.

### 2.2 PublicUser Model Additions

Add to the existing `PublicUser` model (`backend/db/models/public_user.py`):

```python
# Admin flag (replaces email-domain check for content management)
is_admin = Column(Boolean, default=False, nullable=False)

# Pro subscription fields
subscription_tier = Column(String(10), default='free', nullable=False)  # 'free' or 'pro'
pro_started_at = Column(DateTime(timezone=True), nullable=True)
pro_expires_at = Column(DateTime(timezone=True), nullable=True)

# Extended preferences (supplements existing newsletter_opt_in, marketing_opt_in, research_opt_in)
frequency_preference = Column(String(20), default='weekly', nullable=False)  # weekly, fortnightly, monthly
preferred_regions = Column(ARRAY(String), nullable=True)  # regions they want content about

# Progressive profiling fields
role_description = Column(String(50), nullable=True)  # grower, winemaker, vineyard_manager, consultant, student, other
key_concerns = Column(ARRAY(String), nullable=True)  # frost, drought, disease, harvest_timing, site_selection
vineyard_size = Column(String(50), nullable=True)
profiling_completed_at = Column(DateTime(timezone=True), nullable=True)
```

### 2.3 SEO Meta Injection Route

Modify the existing FastAPI catch-all route (`backend/main.py:390`) to intercept content page URLs and inject dynamic `<head>` tags. This serves the same `index.html` but with per-page meta/OG/JSON-LD for crawlers:

```python
@app.get("/insights/{slug}")
@app.get("/research/{slug}")
async def serve_content_page(slug: str, request: Request, db: Session = Depends(get_db)):
    """Serve index.html with injected SEO meta tags for content pages"""
    # Look up content by slug, inject meta tags into index.html template
    # Falls back to default meta if content not found
    ...
```

This gives us proper SEO without migrating away from Vite SPA.

---

## 3. Data Model Changes

All new tables in the existing PostgreSQL database. Standard `created_at`/`updated_at` timestamps. **Use Integer auto-increment PKs** consistent with the existing `public_users` table (not UUIDs).

### 3.1 Articles Table

```sql
CREATE TABLE articles (
    id                  SERIAL PRIMARY KEY,
    title               VARCHAR(255) NOT NULL,
    slug                VARCHAR(255) UNIQUE NOT NULL,
    body                JSONB NOT NULL,                    -- Tiptap JSON
    excerpt             TEXT,                               -- manual or auto-generated
    featured_image_url  TEXT,
    featured_image_alt  VARCHAR(255),
    author_id           INTEGER REFERENCES public_users(id),
    status              VARCHAR(20) DEFAULT 'draft',        -- draft, published, archived
    published_at        TIMESTAMP WITH TIME ZONE,
    tags                TEXT[],                              -- e.g. ['marlborough', 'frost', 'gdd']
    region_tags         TEXT[],                              -- specific region references

    -- SEO fields
    seo_title           VARCHAR(70),
    meta_description    VARCHAR(160),
    canonical_url       TEXT,
    focus_keywords      TEXT[],
    og_image_url        TEXT,
    structured_data     JSONB,                               -- cached JSON-LD

    -- Access control
    content_access_tier VARCHAR(10) DEFAULT 'free',          -- free, preview, pro

    -- Engagement counters (denormalised)
    like_count          INTEGER DEFAULT 0,
    comment_count       INTEGER DEFAULT 0,
    view_count          INTEGER DEFAULT 0,

    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_articles_slug ON articles(slug);
CREATE INDEX idx_articles_status_published ON articles(status, published_at DESC);
CREATE INDEX idx_articles_tags ON articles USING GIN(tags);
CREATE INDEX idx_articles_region_tags ON articles USING GIN(region_tags);
```

### 3.2 Article Comments Table

```sql
CREATE TABLE article_comments (
    id                  SERIAL PRIMARY KEY,
    article_id          INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    user_id             INTEGER NOT NULL REFERENCES public_users(id),
    body                TEXT NOT NULL,
    parent_id           INTEGER REFERENCES article_comments(id) ON DELETE CASCADE,
    is_deleted          BOOLEAN DEFAULT FALSE,

    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_comments_article ON article_comments(article_id, created_at);
```

### 3.3 Article Likes Table

```sql
CREATE TABLE article_likes (
    id                  SERIAL PRIMARY KEY,
    article_id          INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    user_id             INTEGER NOT NULL REFERENCES public_users(id),

    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(article_id, user_id)
);
```

### 3.4 Research Reports Table

```sql
CREATE TABLE research_reports (
    id                      SERIAL PRIMARY KEY,
    title                   VARCHAR(255) NOT NULL,
    slug                    VARCHAR(255) UNIQUE NOT NULL,
    abstract                TEXT NOT NULL,
    authors                 TEXT[] NOT NULL,
    status                  VARCHAR(20) DEFAULT 'draft',
    published_at            TIMESTAMP WITH TIME ZONE,
    version                 VARCHAR(20) DEFAULT '1.0',
    regions                 TEXT[],
    tags                    TEXT[],
    funding_acknowledgement TEXT,
    citation_text           TEXT,

    -- SEO fields
    seo_title               VARCHAR(70),
    meta_description        VARCHAR(160),
    canonical_url           TEXT,
    focus_keywords          TEXT[],
    og_image_url            TEXT,
    structured_data         JSONB,

    -- Access control
    content_access_tier     VARCHAR(10) DEFAULT 'free',

    -- Engagement
    like_count              INTEGER DEFAULT 0,
    comment_count           INTEGER DEFAULT 0,
    view_count              INTEGER DEFAULT 0,

    created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_research_slug ON research_reports(slug);
CREATE INDEX idx_research_status ON research_reports(status, published_at DESC);
CREATE INDEX idx_research_regions ON research_reports USING GIN(regions);
```

### 3.5 Research Sections Table

```sql
CREATE TABLE research_sections (
    id                  SERIAL PRIMARY KEY,
    report_id           INTEGER NOT NULL REFERENCES research_reports(id) ON DELETE CASCADE,
    sort_order          INTEGER NOT NULL,
    title               VARCHAR(255) NOT NULL,
    section_type        VARCHAR(20) NOT NULL,                -- text, chart, table, map, image, file
    content             JSONB NOT NULL,
    caption             TEXT,
    content_access_tier VARCHAR(10),                          -- NULL inherits from report

    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sections_report ON research_sections(report_id, sort_order);
```

Content JSONB structure by `section_type`:
- `text`: `{ "body": "<Tiptap JSON>" }`
- `chart`: `{ "chart_type": "line|bar|scatter", "data_source": "regional_insights_api_endpoint", "config": { ... } }`
- `table`: `{ "columns": [...], "data_source": "...", "downloadable": true }`
- `map`: `{ "layers": [...], "center": [lat, lng], "zoom": 10 }`
- `image`: `{ "url": "...", "alt": "...", "width": 800 }`
- `file`: `{ "file_url": "...", "file_type": "pdf|csv|xlsx", "file_name": "...", "description": "..." }`

### 3.6 Research Files Table

```sql
CREATE TABLE research_files (
    id                  SERIAL PRIMARY KEY,
    report_id           INTEGER NOT NULL REFERENCES research_reports(id) ON DELETE CASCADE,
    section_id          INTEGER REFERENCES research_sections(id) ON DELETE SET NULL,
    file_url            TEXT NOT NULL,
    file_type           VARCHAR(20) NOT NULL,
    file_name           VARCHAR(255) NOT NULL,
    description         TEXT,

    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 3.7 Research Comments & Likes Tables

Same pattern as articles but referencing `research_reports(id)`:

```sql
CREATE TABLE research_comments (
    id          SERIAL PRIMARY KEY,
    report_id   INTEGER NOT NULL REFERENCES research_reports(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES public_users(id),
    body        TEXT NOT NULL,
    parent_id   INTEGER REFERENCES research_comments(id) ON DELETE CASCADE,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE research_likes (
    id          SERIAL PRIMARY KEY,
    report_id   INTEGER NOT NULL REFERENCES research_reports(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES public_users(id),
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(report_id, user_id)
);
```

### 3.8 Email Newsletter Tables

```sql
CREATE TABLE email_templates (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(100) NOT NULL,
    template_type       VARCHAR(30) NOT NULL,            -- spotlight, roundup, data_alert
    subject_template    TEXT NOT NULL,
    body_template       TEXT NOT NULL,                   -- HTML template with variable slots
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE email_campaigns (
    id                  SERIAL PRIMARY KEY,
    template_id         INTEGER NOT NULL REFERENCES email_templates(id),
    subject             VARCHAR(255) NOT NULL,
    body_html           TEXT NOT NULL,
    body_preview_text   VARCHAR(200),
    intro_text          TEXT,
    outro_text          TEXT,
    article_ids         INTEGER[],
    research_ids        INTEGER[],
    target_regions      TEXT[],
    target_tiers        TEXT[],
    status              VARCHAR(20) DEFAULT 'draft',     -- draft, scheduled, sending, sent
    scheduled_at        TIMESTAMP WITH TIME ZONE,
    sent_at             TIMESTAMP WITH TIME ZONE,
    recipients_count    INTEGER DEFAULT 0,
    opens_count         INTEGER DEFAULT 0,
    clicks_count        INTEGER DEFAULT 0,
    unsubscribes_count  INTEGER DEFAULT 0,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE email_sends (
    id                  SERIAL PRIMARY KEY,
    campaign_id         INTEGER NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
    user_id             INTEGER NOT NULL REFERENCES public_users(id),
    email_address       VARCHAR(255) NOT NULL,
    status              VARCHAR(20) DEFAULT 'queued',
    sent_at             TIMESTAMP WITH TIME ZONE,
    opened_at           TIMESTAMP WITH TIME ZONE,
    clicked_at          TIMESTAMP WITH TIME ZONE,
    unsubscribed_at     TIMESTAMP WITH TIME ZONE,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sends_campaign ON email_sends(campaign_id);
CREATE INDEX idx_sends_user ON email_sends(user_id);
```

### 3.9 User Enrichment Tables

```sql
CREATE TABLE user_events (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES public_users(id),
    event_type          VARCHAR(50) NOT NULL,
    event_data          JSONB,
    session_id          VARCHAR(100),
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_events_user ON user_events(user_id, created_at DESC);
CREATE INDEX idx_events_type ON user_events(event_type, created_at DESC);

CREATE TABLE user_profiles (
    user_id                     INTEGER PRIMARY KEY REFERENCES public_users(id) ON DELETE CASCADE,
    total_sessions              INTEGER DEFAULT 0,
    total_article_reads         INTEGER DEFAULT 0,
    total_research_views        INTEGER DEFAULT 0,
    total_comments              INTEGER DEFAULT 0,
    total_likes                 INTEGER DEFAULT 0,
    avg_session_duration_sec    INTEGER DEFAULT 0,
    last_active_at              TIMESTAMP WITH TIME ZONE,
    most_viewed_regions         TEXT[],
    most_used_metrics           TEXT[],
    content_preferences         TEXT[],
    engagement_score            DECIMAL DEFAULT 0,
    segment                     VARCHAR(50),
    updated_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

Note: Umami continues to handle page views, basic event tracking, and visitor analytics. The `user_events` table captures **structured engagement data** that Umami cannot provide (scroll depth, read time, chart interactions, download tracking) and links it to authenticated user IDs for segmentation.

---

## 4. API Endpoints

All endpoints follow existing FastAPI patterns. Public content endpoints use `get_optional_public_user` (already exists in `core/public_security.py`). Admin endpoints check `is_admin` on the `PublicUser` model. All routes registered in `backend/main.py`.

### 4.1 Articles API

New file: `backend/api/v1/articles.py`

```
GET    /api/v1/public/articles                     -- list published articles (paginated, filterable)
GET    /api/v1/public/articles/{slug}              -- get single article by slug (respects access tier)
POST   /api/v1/admin/articles                      -- create article (admin only)
PUT    /api/v1/admin/articles/{id}                 -- update article (admin only)
DELETE /api/v1/admin/articles/{id}                 -- archive article (admin only)
POST   /api/v1/public/articles/{id}/like           -- toggle like (authenticated)
DELETE /api/v1/public/articles/{id}/like           -- remove like (authenticated)
GET    /api/v1/public/articles/{id}/comments       -- list comments
POST   /api/v1/public/articles/{id}/comments       -- add comment (authenticated)
DELETE /api/v1/public/articles/comments/{id}       -- delete own comment or admin moderate
```

### 4.2 Research API

New file: `backend/api/v1/research.py`

```
GET    /api/v1/public/research                     -- list published reports (paginated, filterable)
GET    /api/v1/public/research/{slug}              -- get report with sections (respects tier)
POST   /api/v1/admin/research                      -- create report (admin only)
PUT    /api/v1/admin/research/{id}                 -- update report metadata (admin only)
DELETE /api/v1/admin/research/{id}                 -- archive report (admin only)
POST   /api/v1/admin/research/{id}/sections        -- add section (admin only)
PUT    /api/v1/admin/research/sections/{id}        -- update section (admin only)
DELETE /api/v1/admin/research/sections/{id}        -- delete section (admin only)
PUT    /api/v1/admin/research/{id}/sections/order  -- reorder sections (admin only)
POST   /api/v1/public/research/{id}/like           -- toggle like (authenticated)
GET    /api/v1/public/research/{id}/comments       -- list comments
POST   /api/v1/public/research/{id}/comments       -- add comment (authenticated)
GET    /api/v1/public/research/{id}/files          -- list downloadable files (respects tier)
GET    /api/v1/public/research/files/{id}/download -- download file (respects tier)
GET    /api/v1/public/research/{slug}/citation     -- formatted citation (APA, BibTeX)
```

### 4.3 Email Newsletter API

New file: `backend/api/v1/email_campaigns.py`

```
GET    /api/v1/admin/email/templates               -- list active templates (admin)
GET    /api/v1/admin/email/templates/{id}          -- get template (admin)
POST   /api/v1/admin/email/campaigns               -- create campaign (admin)
PUT    /api/v1/admin/email/campaigns/{id}          -- update campaign (admin)
POST   /api/v1/admin/email/campaigns/{id}/preview  -- render live preview (admin)
POST   /api/v1/admin/email/campaigns/{id}/send     -- send or schedule (admin)
GET    /api/v1/admin/email/campaigns               -- list campaigns with metrics (admin)
GET    /api/v1/admin/email/campaigns/{id}/stats    -- detailed campaign stats (admin)
GET    /api/v1/public/email/preferences            -- get current user's email preferences
PUT    /api/v1/public/email/preferences            -- update email preferences
POST   /api/v1/public/email/unsubscribe/{token}    -- one-click unsubscribe (no auth)
```

### 4.4 Enrichment API

New file: `backend/api/v1/enrichment.py`

```
POST   /api/v1/public/events                       -- record user event (authenticated)
GET    /api/v1/admin/users/segments                 -- user segments with counts (admin)
GET    /api/v1/admin/users/profiles                 -- user profiles with engagement data (admin)
GET    /api/v1/admin/users/{id}/profile             -- detailed user profile (admin)
GET    /api/v1/admin/content/performance            -- content performance by segment (admin)
```

### 4.5 SEO Endpoints

New file: `backend/api/v1/seo.py`

```
GET    /sitemap.xml                                 -- auto-generated XML sitemap
GET    /rss.xml                                     -- RSS feed of published articles
GET    /api/v1/admin/seo/validate/{content_type}/{id}  -- SEO checks (admin, used by editor)
```

Note: `/sitemap.xml` and `/rss.xml` must be registered as direct FastAPI routes (not under `/api`) and must be registered **before** the catch-all static file handler in `main.py`.

---

## 5. Frontend Components

### 5.1 Articles System

**Article Landing Page (`/insights/`)**
- Grid layout of published articles
- Each card: featured image, title, excerpt, read time, published date, tags
- Filter controls: by tag, by region, search
- Pagination (infinite scroll or page-based)
- Responsive layout (follow existing mobile patterns from `climate-mobile-responsive.css`)

**Article Detail Page (`/insights/{slug}`)**
- Hero: featured image, title, author, published date, read time
- Body: rendered rich text with embedded Regional Insights widgets
- Sidebar or inline: related articles (tag-based matching)
- Engagement: like button with count, comment section below
- Social share: LinkedIn (primary), X/Twitter, email, copy link
- SEO: meta tags injected server-side by FastAPI catch-all (see section 2.3)

**Article Editor (admin only, `/admin/articles/new` and `/admin/articles/{id}/edit`)**
- Rich text editor (Tiptap) with:
  - Standard formatting (H2-H4, bold, italic, links, block quotes)
  - Image upload with mandatory alt text
  - **Regional Insights widget embedder** (highest-priority editor feature): select chart type, region, metric, date range, insert live data widget
  - Code blocks
- Metadata panel (sidebar):
  - Title, slug (auto-generated, editable)
  - Excerpt (auto-generated from body, editable)
  - Featured image upload
  - Tags and region tags (multi-select)
  - Content access tier dropdown (free/preview/pro)
  - Status (draft/published) with publish date picker
- SEO panel (sidebar tab):
  - SEO title (char count, max 70)
  - Meta description (char count, max 160)
  - Focus keywords
  - Real-time SEO score (traffic light indicators)
  - Open Graph preview
- Preview mode
- Save draft / Publish controls

### 5.2 Research Portal

**Research Landing Page (`/research/`)**
- Card grid of published reports
- Each card: title, abstract excerpt, regions, publication date, author(s)
- Filter: by region, tag, year
- Pagination

**Research Detail Page (`/research/{slug}`)**
- Header: title, authors, date, version, funding
- Key findings callout box
- Sticky table of contents sidebar with scroll-linked highlighting
- Section renderer (all section types: text, chart, table, map, image, file)
  - Chart sections reuse existing `PublicClimateContainer` components
  - Table sections: sortable, filterable with CSV download
  - Map sections reuse existing `RegionalMap` component
- Section-level access gating (preview/pro)
- Citation button (APA, BibTeX)
- Download options: PDF export, individual file downloads
- Engagement: like button, comment section (shared with articles)

**Research Editor (admin, `/admin/research/new` and `/admin/research/{id}/edit`)**
- Report metadata form
- SEO panel (ScholarlyArticle schema)
- Section manager: drag-and-drop reordering, add section by type
- Per-section content editors, caption, access tier

### 5.3 Email Newsletter System

**Campaign Composer (admin, `/admin/email/campaigns/new`)**
- Template selector
- Content selector: search and pick articles/research
- Custom fields: intro, outro, subject line
- Segmentation: target regions, target tier
- Estimated recipient count
- Live preview panel (desktop/mobile toggle)
- Send now / schedule

**Campaign List (`/admin/email/campaigns`)**
- Table: subject, template type, status, sent date, open rate, click rate

**User Email Preferences (user-facing, within account settings)**
- Extends existing `UserPreferencesModal` component
- Newsletter opt-in/out toggle (already exists)
- Frequency preference (weekly, fortnightly, monthly) - new
- Region preferences (multi-select) - new

### 5.4 User Enrichment

**Event Tracking (frontend, automatic)**
- Lightweight event emitter integrated into React app
- Extends existing Umami analytics (`src/utils/analytics.js`)
- Fires structured events to `/api/v1/public/events`: page view, article read (scroll depth, time), research section view, chart interaction, download, search
- Batches events (every 30s or on page unload)
- Respects user consent preferences

**Progressive Profiling (user-facing, contextual prompts)**
- Triggered after engagement milestones (3rd visit, 1st article read, 5th session)
- Lightweight modal asking 2-3 questions: role, regions of interest, key concerns
- Skip option always available, saves incrementally
- Uses the new fields on `PublicUser` (section 2.2)

**Admin Enrichment Dashboard (`/admin/enrichment`)**
- User segments overview
- Content performance by segment
- Email campaign performance by segment
- High-value prospect list (highest engagement free-tier users)
- Export capabilities

---

## 6. SEO Implementation

### 6.1 Dynamic Meta Tag Injection

The existing FastAPI catch-all route (`main.py:390`) will be modified to intercept content page URLs and inject meta tags into the HTML response. This is the critical architectural decision that avoids a Next.js migration:

```python
# Pseudocode for the meta injection approach:
# 1. Read the built index.html template once at startup
# 2. For /insights/{slug} and /research/{slug}, look up content from DB
# 3. Replace the <title>, <meta>, and <script type="application/ld+json"> blocks
# 4. Serve the modified HTML
# 5. React app hydrates and takes over client-side routing
```

Per-page tags rendered:
```html
<title>{seo_title || title} | Auxein Regional Insights</title>
<meta name="description" content="{meta_description}" />
<link rel="canonical" href="{canonical_url}" />
<meta property="og:type" content="article" />
<meta property="og:title" content="{seo_title || title}" />
<meta property="og:description" content="{meta_description}" />
<meta property="og:image" content="{og_image_url || featured_image_url}" />
<meta property="og:url" content="{canonical_url}" />
<meta property="og:site_name" content="Auxein Regional Insights" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{seo_title || title}" />
<meta name="twitter:description" content="{meta_description}" />
<meta name="twitter:image" content="{og_image_url || featured_image_url}" />
```

### 6.2 Structured Data (JSON-LD)

For articles:
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "{title}",
  "description": "{meta_description}",
  "author": {
    "@type": "Person",
    "name": "{author_name}",
    "jobTitle": "Director, Auxein Limited"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Auxein",
    "logo": { "@type": "ImageObject", "url": "{logo_url}" }
  },
  "datePublished": "{published_at ISO}",
  "dateModified": "{updated_at ISO}",
  "image": "{featured_image_url}",
  "mainEntityOfPage": "{canonical_url}"
}
```

For research reports:
```json
{
  "@context": "https://schema.org",
  "@type": "ScholarlyArticle",
  "headline": "{title}",
  "abstract": "{abstract}",
  "author": [{ "@type": "Person", "name": "{author}" }],
  "publisher": { "@type": "Organization", "name": "Auxein" },
  "datePublished": "{published_at ISO}",
  "version": "{version}",
  "funder": "{funding_acknowledgement}",
  "mainEntityOfPage": "{canonical_url}"
}
```

Breadcrumb structured data on all content pages.

### 6.3 URL Structure

```
/insights/                    -> articles landing page
/insights/{slug}              -> article detail
/research/                    -> research landing page
/research/{slug}              -> research report detail
```

Rules:
- No dates in URLs
- No IDs or query parameters in public-facing URLs
- Slugs are lowercase, hyphenated, keyword-rich
- Auto-generated from title, editable by admin

### 6.4 XML Sitemap

Auto-generated at `/sitemap.xml`, updated on every publish/unpublish. Replaces the existing static sitemap. Includes:
- All published article URLs with `<lastmod>`
- All published research report URLs with `<lastmod>`
- Data pages (hardcoded list of existing climate page URLs)
- Landing pages (`/`, `/insights/`, `/research/`)

Priority values: Research 0.9, pillar articles 0.8, regular articles 0.7, data pages 0.8, landing pages 0.6.

### 6.5 RSS Feed

Auto-generated at `/rss.xml`: last 20 published articles, reverse chronological.

### 6.6 Image Optimisation

- Server-side processing on upload: convert to WebP, generate responsive sizes (400w, 800w, 1200w)
- Use Pillow (Python Imaging Library) for processing - lightweight, no external dependencies
- Store processed images in `settings.UPLOAD_DIR/content-images/` (local first, cloud migration later)
- Frontend: `<img>` tags with `srcset`, `loading="lazy"`, mandatory alt text, width/height for CLS

### 6.7 Performance Targets

- LCP < 2.5s, CLS < 0.1, FID < 100ms
- Preload hero/featured images on article pages
- Lazy-load images below the fold

### 6.8 Internal Linking

- Auto-suggest: when article body mentions a region name, suggest internal link
- Related articles block: 3-4 related articles at bottom of each article (shared tags)
- Regional Insights data pages: add "Latest Insights" section linking to tagged articles

---

## 7. Email Sending Infrastructure

### 7.1 Setup

- Extend existing `UnifiedEmailService` (`backend/services/email_service.py`) with newsletter template methods
- For MVP: continue using SMTP (Gmail). When volume grows, switch to Resend or AWS SES
- Configure SPF, DKIM, DMARC for production domain
- Use `mail.auxein.co.nz` subdomain for campaign emails

### 7.2 Template Rendering

- Extend existing inline HTML template pattern with new methods:
  - `send_article_spotlight(user, article)` - single article feature
  - `send_regional_roundup(user, articles)` - multi-article digest
  - `send_data_alert(user, alert_data)` - climate data trigger
- Support variable interpolation: `{user_name}`, `{region}`, `{article_title}`
- All templates brand-consistent with existing Auxein email styling (green gradient header, D1583B CTA buttons)

### 7.3 Compliance

- Every email includes unsubscribe link (one-click, token-based, no login required)
- Physical mailing address in footer (NZ Unsolicited Electronic Messages Act 2007)
- Respect `newsletter_opt_in` on `PublicUser` - never send to opted-out users
- Respect `frequency_preference` - don't exceed selected frequency
- Bounce handling: mark bounced emails, stop after repeated bounces

---

## 8. Privacy & Compliance

### 8.1 Data Collection Principles

- All data is first-party
- No third-party data brokers or external enrichment
- Behavioural tracking is aggregated and pseudonymised where possible
- Progressive profiling is always optional with skip

### 8.2 User Rights (NZ Privacy Act 2020)

- View all collected data (via account settings)
- Request deletion
- Export data
- Update/correct profile information
- Opt out of behavioural tracking

### 8.3 Disclosure

- Update existing privacy policy (already at `/legal?section=privacy`) to cover: behavioural tracking, progressive profiling, email analytics, user segmentation
- Cookie consent banner if not already implemented
- Clear explanation at each collection point

---

## 9. Implementation Phases

### Phase 0: Infrastructure (Week 0-1)

**Deliverables:**
- Alembic migration setup + baseline migration
- `is_admin` field on `PublicUser`
- Subscription tier fields on `PublicUser`
- Extended preference fields on `PublicUser`
- Progressive profiling fields on `PublicUser`
- FastAPI meta tag injection route (skeleton)
- Update `AdminRoute.jsx` and `useAdminAuth.js` to use `is_admin` field instead of email domain check

**Dependencies:** None.

### Phase 1: Content Engine & SEO Foundation (Weeks 1-6)

**Deliverables:**
- Articles SQLAlchemy model + Alembic migration
- Articles API endpoints (CRUD, like, comment)
- Article landing page (`/insights/`) with grid layout, filtering, pagination
- Article detail page (`/insights/{slug}`) with full SEO (meta injection, JSON-LD, OG)
- Admin article editor with Tiptap, image upload, Regional Insights widget embedding
- SEO guidance panel in editor
- Dynamic XML sitemap generation (replaces static)
- RSS feed
- Image upload + WebP processing pipeline (Pillow)
- Internal linking: related articles block, auto-suggest links to data pages
- Content access tier field on all content (defaulting to free)

**Dependencies:** Phase 0 complete.

### Phase 2: Research Portal (Weeks 5-8, overlaps Phase 1)

**Deliverables:**
- Research reports + sections models + migrations
- Research API endpoints
- Research landing page with card grid, filtering
- Research detail page with sticky TOC, section renderer (all types)
- Section-level access tier gating
- Admin research editor with section manager, drag-and-drop, per-type editors
- ScholarlyArticle JSON-LD markup
- Citation generator
- PDF export of reports
- File upload and download for research attachments

**Dependencies:** Shares Tiptap editor and SEO infrastructure from Phase 1.

### Phase 3: Engagement Layer (Weeks 7-10)

**Deliverables:**
- Comments system (shared between articles and research)
- Threaded replies (one level)
- Admin moderation controls
- Likes system
- Denormalised like/comment counts
- Social sharing buttons (LinkedIn, X/Twitter, email, copy link)

**Dependencies:** Articles (Phase 1) and Research (Phase 2).

### Phase 4: Email Newsletter System (Weeks 9-13)

**Deliverables:**
- Email templates model + pre-built templates (spotlight, roundup, data_alert)
- Email campaigns model + API endpoints
- Campaign composer: template selection, content picker, segmentation
- Live preview panel
- Extend `UnifiedEmailService` with campaign sending methods
- Domain warmup process
- Send and schedule functionality
- Tracking: opens, clicks, unsubscribes
- Extended user email preferences (frequency, regions) in `UserPreferencesModal`
- Token-based one-click unsubscribe handler
- Campaign metrics dashboard (admin)

**Dependencies:** Articles content must exist. User preferences for segmentation.

### Phase 5: User Data Enrichment (Weeks 12-16)

**Deliverables:**
- `user_events` table + API endpoint
- Frontend event emitter (extends existing Umami analytics)
- Event batching and submission
- `user_profiles` aggregation table + background job
- Progressive profiling: contextual prompts (role, region, concerns)
- Admin enrichment dashboard: segments, engagement scores, content performance, prospect list
- Privacy controls: user data view, deletion, export, tracking opt-out

**Dependencies:** All content types and engagement features.

### Phase 6: Pro Access Gate Activation (Weeks 16-18)

**Deliverables:**
- Activate subscription tier gating in access control
- Pro gate UI: preview rendering with upgrade prompt, blurred/hidden pro content
- Payment integration (Stripe)
- Founding member pricing
- Pro upgrade flow: pricing page, checkout, account upgrade, immediate access
- Admin controls to change content tier on existing articles/sections
- Targeted email campaign to high-engagement free users

**Dependencies:** All previous phases. Enrichment data needed for targeted offers.

---

## 10. Key Technical Decisions

### 10.1 Rich Text Editor

**Recommendation: Tiptap**
- Stores content as JSON (structured, queryable, portable)
- Extensible - custom nodes for Regional Insights widget embedding
- Good React integration
- The custom widget node for embedding Regional Insights data is the **highest-priority editor extension**

### 10.2 Email Templates

**Approach: Extend existing `UnifiedEmailService`**
- Current service already has HTML templates with consistent branding
- Add new template methods for article spotlight, roundup, data alert
- Keep inline HTML approach for now; evaluate MJML if template complexity grows
- All templates follow existing green gradient header + D1583B CTA button pattern

### 10.3 Server-Side SEO (SPA-Compatible)

**Approach: FastAPI meta tag injection**
- The existing catch-all route in `main.py` serves `index.html` for all non-API routes
- Modify to intercept `/insights/{slug}` and `/research/{slug}` paths
- Read the built `index.html`, replace `<head>` meta tags with content-specific values
- Serve modified HTML; React app hydrates normally
- Avoids Next.js migration while achieving proper SEO for search engines

### 10.4 Image Storage and Processing

- Phase 1: Local storage in `settings.UPLOAD_DIR/content-images/`
- Use Pillow for WebP conversion and responsive size generation
- Serve via FastAPI static file mount (add `/content-images` mount in `main.py`)
- Phase 2+: Migrate to S3 + CloudFront CDN when ready

### 10.5 Background Jobs

Required for:
- User profile aggregation (hourly)
- Email campaign sending (queue-based)
- Sitemap regeneration (on publish/unpublish)
- Image processing (on upload)
- Engagement counter sync (periodic)

**Recommendation:** Start with FastAPI `BackgroundTasks` (already used in `public_auth.py` for email sending). Move to Celery + Redis when volume requires it.

### 10.6 Admin Authentication

- Add `is_admin` boolean to `PublicUser` model
- Update `AdminRoute.jsx` to check `user.is_admin` instead of email domain
- Keep email domain check as a secondary/fallback for safety
- All admin API endpoints check `current_user.is_admin`

---

## 11. Content Strategy Parallel Track

Content production should begin as soon as the articles system is live in Phase 1.

**Weeks 3-8 (Foundation layer):** One pillar article per major NZ wine region. Target 8-10 pillar articles: Marlborough, Central Otago, Hawke's Bay, Wairarapa, Canterbury/Waipara, Nelson, Gisborne, North Canterbury.

**Weeks 6-12 (Depth layer):** Cross-cutting pieces on specific metrics. Target 10-15 articles: "Understanding GDD in NZ Wine Regions", "Frost Risk: A Regional Comparison", "Rainfall Trends and Vintage Quality".

**Weeks 10+ (Timeliness layer):** Vintage updates, seasonal commentary, data-driven insights. Target 2-4 per month ongoing.

**Research reports:** First report by weeks 8-10 as a link magnet and authority signal.

**Target at Pro launch (weeks 16-18):** 40-50 published articles + 2-3 research reports.
