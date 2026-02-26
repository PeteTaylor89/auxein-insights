"""Add content platform tables for Regional Insights v1.1

Creates: articles, article_comments, article_likes, research_reports,
research_sections, research_files, research_comments, research_likes,
email_templates, email_campaigns, email_sends, user_events, user_profiles

Alters: public_users (adds admin, subscription, preferences, profiling fields)

Revision ID: add_content_platform
Revises: add_site_banners
Create Date: 2026-02-26

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = 'add_content_platform'
down_revision: str = 'add_site_banners'
branch_labels = None
depends_on = None


def upgrade():
    # ============================================
    # ALTER public_users - add new fields
    # ============================================
    op.add_column('public_users', sa.Column('is_admin', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('public_users', sa.Column('subscription_tier', sa.String(10), nullable=False, server_default='free'))
    op.add_column('public_users', sa.Column('pro_started_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('public_users', sa.Column('pro_expires_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('public_users', sa.Column('frequency_preference', sa.String(20), nullable=False, server_default='weekly'))
    op.add_column('public_users', sa.Column('preferred_regions', sa.ARRAY(sa.String()), nullable=True))
    op.add_column('public_users', sa.Column('role_description', sa.String(50), nullable=True))
    op.add_column('public_users', sa.Column('key_concerns', sa.ARRAY(sa.String()), nullable=True))
    op.add_column('public_users', sa.Column('vineyard_size', sa.String(50), nullable=True))
    op.add_column('public_users', sa.Column('profiling_completed_at', sa.DateTime(timezone=True), nullable=True))

    # ============================================
    # CREATE articles
    # ============================================
    op.create_table(
        'articles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(255), nullable=False),
        sa.Column('body', JSONB, nullable=False),
        sa.Column('excerpt', sa.Text(), nullable=True),
        sa.Column('featured_image_url', sa.Text(), nullable=True),
        sa.Column('featured_image_alt', sa.String(255), nullable=True),
        sa.Column('author_id', sa.Integer(), sa.ForeignKey('public_users.id'), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('tags', sa.ARRAY(sa.String()), nullable=True),
        sa.Column('region_tags', sa.ARRAY(sa.String()), nullable=True),
        sa.Column('seo_title', sa.String(70), nullable=True),
        sa.Column('meta_description', sa.String(160), nullable=True),
        sa.Column('canonical_url', sa.Text(), nullable=True),
        sa.Column('focus_keywords', sa.ARRAY(sa.String()), nullable=True),
        sa.Column('og_image_url', sa.Text(), nullable=True),
        sa.Column('structured_data', JSONB, nullable=True),
        sa.Column('content_access_tier', sa.String(10), nullable=False, server_default='free'),
        sa.Column('like_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('comment_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('view_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_articles_slug', 'articles', ['slug'], unique=True)
    op.create_index('idx_articles_status_published', 'articles', ['status', sa.text('published_at DESC')])
    op.create_index('idx_articles_tags', 'articles', ['tags'], postgresql_using='gin')
    op.create_index('idx_articles_region_tags', 'articles', ['region_tags'], postgresql_using='gin')

    # ============================================
    # CREATE article_comments
    # ============================================
    op.create_table(
        'article_comments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('article_id', sa.Integer(), sa.ForeignKey('articles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('public_users.id'), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('parent_id', sa.Integer(), sa.ForeignKey('article_comments.id', ondelete='CASCADE'), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_article_comments_article', 'article_comments', ['article_id', sa.text('created_at')])

    # ============================================
    # CREATE article_likes
    # ============================================
    op.create_table(
        'article_likes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('article_id', sa.Integer(), sa.ForeignKey('articles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('public_users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('article_id', 'user_id', name='uq_article_likes_article_user'),
    )

    # ============================================
    # CREATE research_reports
    # ============================================
    op.create_table(
        'research_reports',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(255), nullable=False),
        sa.Column('abstract', sa.Text(), nullable=False),
        sa.Column('authors', sa.ARRAY(sa.String()), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('version', sa.String(20), nullable=False, server_default='1.0'),
        sa.Column('regions', sa.ARRAY(sa.String()), nullable=True),
        sa.Column('tags', sa.ARRAY(sa.String()), nullable=True),
        sa.Column('funding_acknowledgement', sa.Text(), nullable=True),
        sa.Column('citation_text', sa.Text(), nullable=True),
        sa.Column('seo_title', sa.String(70), nullable=True),
        sa.Column('meta_description', sa.String(160), nullable=True),
        sa.Column('canonical_url', sa.Text(), nullable=True),
        sa.Column('focus_keywords', sa.ARRAY(sa.String()), nullable=True),
        sa.Column('og_image_url', sa.Text(), nullable=True),
        sa.Column('structured_data', JSONB, nullable=True),
        sa.Column('content_access_tier', sa.String(10), nullable=False, server_default='free'),
        sa.Column('like_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('comment_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('view_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_research_slug', 'research_reports', ['slug'], unique=True)
    op.create_index('idx_research_status', 'research_reports', ['status', sa.text('published_at DESC')])
    op.create_index('idx_research_regions', 'research_reports', ['regions'], postgresql_using='gin')

    # ============================================
    # CREATE research_sections
    # ============================================
    op.create_table(
        'research_sections',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('report_id', sa.Integer(), sa.ForeignKey('research_reports.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('section_type', sa.String(20), nullable=False),
        sa.Column('content', JSONB, nullable=False),
        sa.Column('caption', sa.Text(), nullable=True),
        sa.Column('content_access_tier', sa.String(10), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_sections_report', 'research_sections', ['report_id', 'sort_order'])

    # ============================================
    # CREATE research_files
    # ============================================
    op.create_table(
        'research_files',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('report_id', sa.Integer(), sa.ForeignKey('research_reports.id', ondelete='CASCADE'), nullable=False),
        sa.Column('section_id', sa.Integer(), sa.ForeignKey('research_sections.id', ondelete='SET NULL'), nullable=True),
        sa.Column('file_url', sa.Text(), nullable=False),
        sa.Column('file_type', sa.String(20), nullable=False),
        sa.Column('file_name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )

    # ============================================
    # CREATE research_comments
    # ============================================
    op.create_table(
        'research_comments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('report_id', sa.Integer(), sa.ForeignKey('research_reports.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('public_users.id'), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('parent_id', sa.Integer(), sa.ForeignKey('research_comments.id', ondelete='CASCADE'), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    # ============================================
    # CREATE research_likes
    # ============================================
    op.create_table(
        'research_likes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('report_id', sa.Integer(), sa.ForeignKey('research_reports.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('public_users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('report_id', 'user_id', name='uq_research_likes_report_user'),
    )

    # ============================================
    # CREATE email_templates
    # ============================================
    op.create_table(
        'email_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('template_type', sa.String(30), nullable=False),
        sa.Column('subject_template', sa.Text(), nullable=False),
        sa.Column('body_template', sa.Text(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    # ============================================
    # CREATE email_campaigns
    # ============================================
    op.create_table(
        'email_campaigns',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('template_id', sa.Integer(), sa.ForeignKey('email_templates.id'), nullable=False),
        sa.Column('subject', sa.String(255), nullable=False),
        sa.Column('body_html', sa.Text(), nullable=False),
        sa.Column('body_preview_text', sa.String(200), nullable=True),
        sa.Column('intro_text', sa.Text(), nullable=True),
        sa.Column('outro_text', sa.Text(), nullable=True),
        sa.Column('article_ids', sa.ARRAY(sa.Integer()), nullable=True),
        sa.Column('research_ids', sa.ARRAY(sa.Integer()), nullable=True),
        sa.Column('target_regions', sa.ARRAY(sa.String()), nullable=True),
        sa.Column('target_tiers', sa.ARRAY(sa.String()), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('recipients_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('opens_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('clicks_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('unsubscribes_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    # ============================================
    # CREATE email_sends
    # ============================================
    op.create_table(
        'email_sends',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('campaign_id', sa.Integer(), sa.ForeignKey('email_campaigns.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('public_users.id'), nullable=False),
        sa.Column('email_address', sa.String(255), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='queued'),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('opened_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('clicked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('unsubscribed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_sends_campaign', 'email_sends', ['campaign_id'])
    op.create_index('idx_sends_user', 'email_sends', ['user_id'])

    # ============================================
    # CREATE user_events
    # ============================================
    op.create_table(
        'user_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('public_users.id'), nullable=False),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('event_data', JSONB, nullable=True),
        sa.Column('session_id', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_events_user', 'user_events', ['user_id', sa.text('created_at DESC')])
    op.create_index('idx_events_type', 'user_events', ['event_type', sa.text('created_at DESC')])

    # ============================================
    # CREATE user_profiles
    # ============================================
    op.create_table(
        'user_profiles',
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('public_users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('total_sessions', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_article_reads', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_research_views', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_comments', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_likes', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('avg_session_duration_sec', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_active_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('most_viewed_regions', sa.ARRAY(sa.String()), nullable=True),
        sa.Column('most_used_metrics', sa.ARRAY(sa.String()), nullable=True),
        sa.Column('content_preferences', sa.ARRAY(sa.String()), nullable=True),
        sa.Column('engagement_score', sa.Numeric(), nullable=False, server_default='0'),
        sa.Column('segment', sa.String(50), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('user_id'),
    )


def downgrade():
    # Drop tables in reverse dependency order
    op.drop_table('user_profiles')
    op.drop_table('user_events')
    op.drop_table('email_sends')
    op.drop_table('email_campaigns')
    op.drop_table('email_templates')
    op.drop_table('research_likes')
    op.drop_table('research_comments')
    op.drop_table('research_files')
    op.drop_table('research_sections')
    op.drop_table('research_reports')
    op.drop_table('article_likes')
    op.drop_table('article_comments')
    op.drop_table('articles')

    # Remove public_users columns
    op.drop_column('public_users', 'profiling_completed_at')
    op.drop_column('public_users', 'vineyard_size')
    op.drop_column('public_users', 'key_concerns')
    op.drop_column('public_users', 'role_description')
    op.drop_column('public_users', 'preferred_regions')
    op.drop_column('public_users', 'frequency_preference')
    op.drop_column('public_users', 'pro_expires_at')
    op.drop_column('public_users', 'pro_started_at')
    op.drop_column('public_users', 'subscription_tier')
    op.drop_column('public_users', 'is_admin')
