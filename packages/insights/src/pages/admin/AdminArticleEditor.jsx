// src/pages/admin/AdminArticleEditor.jsx - Admin article create/edit
import { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Eye, RefreshCw, Search, AlertTriangle, CheckCircle } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import TiptapEditor from '../../components/TiptapEditor';
import ImageUpload from '../../components/ImageUpload';
import articleService from '../../services/articleService';
import {
  getGddProgress,
  getCurrentSeason,
  getDiseasePressure,
} from '../../services/realtimeClimateService';
import { compareSeasons } from '../../services/publicClimateService';

const ClimateWidgetRenderer = lazy(() => import('../../components/climate/ClimateWidgetRenderer'));

/* ── Tiptap JSON → React preview renderer ── */
function ArticlePreviewBody({ body }) {
  if (!body || !body.content) return <p style={{ color: '#9ca3af' }}>Start writing to see a preview...</p>;

  const renderNode = (node, key) => {
    if (!node) return null;
    const children = node.content ? node.content.map((child, i) => renderNode(child, `${key}-${i}`)) : null;

    switch (node.type) {
      case 'paragraph':
        return <p key={key}>{children}</p>;
      case 'heading': {
        const Tag = `h${node.attrs?.level || 2}`;
        return <Tag key={key}>{children}</Tag>;
      }
      case 'text': {
        let text = node.text;
        if (node.marks) {
          node.marks.forEach((mark) => {
            if (mark.type === 'bold') text = <strong key={`${key}-b`}>{text}</strong>;
            if (mark.type === 'italic') text = <em key={`${key}-i`}>{text}</em>;
            if (mark.type === 'link') text = <a key={`${key}-a`} href={mark.attrs.href} target="_blank" rel="noopener noreferrer">{text}</a>;
          });
        }
        return text;
      }
      case 'bulletList':
        return <ul key={key}>{children}</ul>;
      case 'orderedList':
        return <ol key={key}>{children}</ol>;
      case 'listItem':
        return <li key={key}>{children}</li>;
      case 'blockquote':
        return <blockquote key={key} style={{ borderLeft: '4px solid #d1d5db', paddingLeft: '1rem', margin: '1rem 0', color: '#6b7280' }}>{children}</blockquote>;
      case 'codeBlock':
        return <pre key={key} style={{ background: '#f3f4f6', padding: '1rem', borderRadius: '6px', overflow: 'auto', fontSize: '0.85rem' }}><code>{node.content?.[0]?.text}</code></pre>;
      case 'image': {
        const imgWidth = node.attrs?.width;
        const imgStyle = imgWidth && imgWidth !== '100'
          ? { width: `${imgWidth}%`, height: 'auto' }
          : { maxWidth: '100%', height: 'auto' };
        return <img key={key} src={node.attrs?.src} alt={node.attrs?.alt || ''} style={{ ...imgStyle, borderRadius: '8px' }} loading="lazy" />;
      }
      case 'climateWidget':
        return (
          <Suspense key={key} fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', background: '#f9fafb', borderRadius: '8px', margin: '1rem 0' }}>Loading widget...</div>}>
            <ClimateWidgetRenderer
              widgetType={node.attrs?.widgetType}
              zoneSlug={node.attrs?.zoneSlug}
              zoneName={node.attrs?.zoneName}
              metric={node.attrs?.metric}
              displayMode={node.attrs?.displayMode || 'chart'}
              title={node.attrs?.title}
              snapshotData={node.attrs?.snapshotData || null}
            />
          </Suspense>
        );
      case 'hardBreak':
        return <br key={key} />;
      default:
        return children ? <div key={key}>{children}</div> : null;
    }
  };

  return <>{body.content.map((node, i) => renderNode(node, i))}</>;
}

function AdminArticleEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    title: '',
    slug: '',
    body: { type: 'doc', content: [{ type: 'paragraph' }] },
    excerpt: '',
    featured_image_url: '',
    featured_image_alt: '',
    thumbnail_url: '',
    tags: [],
    region_tags: [],
    status: 'draft',
    published_at: '',
    content_access_tier: 'free',
    seo_title: '',
    meta_description: '',
    canonical_url: '',
    focus_keywords: [],
    og_image_url: '',
  });

  const [tagsInput, setTagsInput] = useState('');
  const [regionTagsInput, setRegionTagsInput] = useState('');
  const [keywordsInput, setKeywordsInput] = useState('');
  const [activeTab, setActiveTab] = useState('content');
  const [seoScore, setSeoScore] = useState(null);
  const [seoWarnings, setSeoWarnings] = useState([]);
  const [seoChecking, setSeoChecking] = useState(false);

  useEffect(() => {
    if (!isNew) {
      const fetchArticle = async () => {
        try {
          const data = await articleService.adminGet(parseInt(id));
          setForm({
            title: data.title || '',
            slug: data.slug || '',
            body: data.body || { type: 'doc', content: [{ type: 'paragraph' }] },
            excerpt: data.excerpt || '',
            featured_image_url: data.featured_image_url || '',
            featured_image_alt: data.featured_image_alt || '',
            thumbnail_url: data.thumbnail_url || '',
            tags: data.tags || [],
            region_tags: data.region_tags || [],
            status: data.status || 'draft',
            published_at: data.published_at ? data.published_at.slice(0, 16) : '',
            content_access_tier: data.content_access_tier || 'free',
            seo_title: data.seo_title || '',
            meta_description: data.meta_description || '',
            canonical_url: data.canonical_url || '',
            focus_keywords: data.focus_keywords || [],
            og_image_url: data.og_image_url || '',
          });
          setTagsInput((data.tags || []).join(', '));
          setRegionTagsInput((data.region_tags || []).join(', '));
          setKeywordsInput((data.focus_keywords || []).join(', '));
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };
      fetchArticle();
    }
  }, [id, isNew]);

  const slugify = (text) => {
    return text.toLowerCase().trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleTitleChange = (e) => {
    const title = e.target.value;
    setForm(prev => ({
      ...prev,
      title,
      slug: isNew && !prev.slug ? slugify(title) : prev.slug,
    }));
  };

  const handleFeaturedImageChange = (url, thumbnailUrl) => {
    setForm(prev => ({
      ...prev,
      featured_image_url: url,
      thumbnail_url: thumbnailUrl || '',
      // Auto-fill OG image if empty
      og_image_url: prev.og_image_url || url,
    }));
  };

  // Fetch climate data for a single widget config
  const fetchWidgetData = async (attrs) => {
    switch (attrs.widgetType) {
      case 'gdd_progress':
        return getGddProgress(attrs.zoneSlug);
      case 'temperature_rainfall':
      case 'current_season_summary':
      case 'recent_observations':
        return getCurrentSeason(attrs.zoneSlug);
      case 'disease_pressure':
        return getDiseasePressure(attrs.zoneSlug);
      case 'season_comparison': {
        const yr = new Date().getFullYear();
        return compareSeasons({ zone: attrs.zoneSlug, vintages: `${yr},${yr - 1}`, include_baseline: true });
      }
      default:
        return null;
    }
  };

  // Walk Tiptap JSON and snapshot any static widgets that need it
  const snapshotStaticWidgets = async (body) => {
    if (!body?.content) return body;
    let changed = false;

    const processNodes = async (nodes) => {
      const result = [];
      for (const node of nodes) {
        if (node.type === 'climateWidget' && node.attrs?.isStatic && !node.attrs?.snapshotData) {
          try {
            const data = await fetchWidgetData(node.attrs);
            result.push({
              ...node,
              attrs: { ...node.attrs, snapshotData: data, snapshotDate: new Date().toISOString() },
            });
            changed = true;
          } catch {
            result.push(node); // keep as-is if fetch fails
          }
        } else if (node.content) {
          result.push({ ...node, content: await processNodes(node.content) });
        } else {
          result.push(node);
        }
      }
      return result;
    };

    const newContent = await processNodes(body.content);
    return changed ? { ...body, content: newContent } : body;
  };

  const handleSave = async (publishNow = false) => {
    setSaving(true);
    setError(null);
    try {
      // Snapshot static widgets before saving
      const processedBody = await snapshotStaticWidgets(form.body);

      const payload = {
        ...form,
        body: processedBody,
        tags: tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [],
        region_tags: regionTagsInput ? regionTagsInput.split(',').map(t => t.trim()).filter(Boolean) : [],
        focus_keywords: keywordsInput ? keywordsInput.split(',').map(t => t.trim()).filter(Boolean) : [],
      };

      // Remove empty string values that should be null/excluded for the API
      if (!payload.published_at) delete payload.published_at;
      if (!payload.featured_image_url) delete payload.featured_image_url;
      if (!payload.featured_image_alt) delete payload.featured_image_alt;
      if (!payload.thumbnail_url) delete payload.thumbnail_url;
      if (!payload.seo_title) delete payload.seo_title;
      if (!payload.meta_description) delete payload.meta_description;
      if (!payload.canonical_url) delete payload.canonical_url;
      if (!payload.og_image_url) delete payload.og_image_url;

      if (publishNow) {
        payload.status = 'published';
      }

      if (isNew) {
        const created = await articleService.create(payload);
        navigate(`/admin/articles/${created.id}/edit`, { replace: true });
      } else {
        await articleService.update(parseInt(id), payload);
      }

      // Update local form with snapshotted body so editor reflects it
      if (processedBody !== form.body) {
        setForm(prev => ({ ...prev, body: processedBody }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCheckSeo = async () => {
    if (isNew || !id) return;
    setSeoChecking(true);
    try {
      const result = await articleService.validateSeo('articles', parseInt(id));
      setSeoScore(result.score);
      setSeoWarnings(result.warnings || []);
    } catch (err) {
      setError('SEO check failed: ' + err.message);
    } finally {
      setSeoChecking(false);
    }
  };

  const seoScoreColor = seoScore === null ? '#9ca3af' : seoScore >= 80 ? '#059669' : seoScore >= 60 ? '#d97706' : '#dc2626';
  const seoScoreBg = seoScore === null ? '#f3f4f6' : seoScore >= 80 ? '#ecfdf5' : seoScore >= 60 ? '#fffbeb' : '#fef2f2';

  if (loading) {
    return (
      <AdminLayout title="Loading..." backLink="/admin/articles" backText="Articles">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title={isNew ? 'New Article' : 'Edit Article'}
      subtitle={isNew ? 'Create a new article' : form.title}
      backLink="/admin/articles"
      backText="Articles"
    >
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '1px solid #e5e7eb' }}>
        {['content', 'preview', 'metadata', 'seo'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.75rem 1.25rem', border: 'none', borderBottom: activeTab === tab ? '2px solid #2563eb' : '2px solid transparent',
              background: 'none', fontSize: '0.875rem', fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? '#2563eb' : '#6b7280', cursor: 'pointer', textTransform: 'capitalize'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '1.5rem' }}>
        <div style={{ flex: 1 }}>
          {/* Content Tab */}
          {activeTab === 'content' && (
            <div style={{ background: 'white', borderRadius: '8px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#374151' }}>Title</label>
                <input
                  type="text" value={form.title} onChange={handleTitleChange}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem' }}
                  placeholder="Article title"
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#374151' }}>Slug</label>
                <input
                  type="text" value={form.slug} onChange={(e) => setForm(prev => ({ ...prev, slug: e.target.value }))}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem', color: '#6b7280' }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#374151' }}>Body</label>
                <TiptapEditor
                  content={form.body}
                  onChange={(json) => setForm(prev => ({ ...prev, body: json }))}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#374151' }}>Excerpt</label>
                <textarea
                  value={form.excerpt} onChange={(e) => setForm(prev => ({ ...prev, excerpt: e.target.value }))}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem', minHeight: '80px', fontFamily: 'inherit', resize: 'vertical' }}
                  placeholder="Short summary for article cards..."
                />
              </div>
            </div>
          )}

          {/* Preview Tab */}
          {activeTab === 'preview' && (
            <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              {/* Preview hero */}
              <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)', color: 'white', padding: '2rem 2.5rem' }}>
                {form.tags?.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                    {(tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : []).map((t) => (
                      <span key={t} style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem' }}>{t}</span>
                    ))}
                  </div>
                )}
                <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: '0 0 0.5rem', lineHeight: 1.3 }}>
                  {form.title || 'Untitled Article'}
                </h1>
                <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.75)' }}>
                  {new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>
              {/* Featured image */}
              {form.featured_image_url && (
                <div style={{ maxWidth: '800px', margin: '-1.5rem auto 0', padding: '0 2.5rem' }}>
                  <img src={form.featured_image_url} alt={form.featured_image_alt || ''} style={{ width: '100%', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />
                </div>
              )}
              {/* Body */}
              <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 2.5rem', lineHeight: 1.8, fontSize: '1.05rem', color: '#374151' }}>
                <ArticlePreviewBody body={form.body} />
              </div>
            </div>
          )}

          {/* Metadata Tab */}
          {activeTab === 'metadata' && (
            <div style={{ background: 'white', borderRadius: '8px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#374151' }}>Status</label>
                  <select
                    value={form.status} onChange={(e) => setForm(prev => ({ ...prev, status: e.target.value }))}
                    style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }}
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#374151' }}>Access Tier</label>
                  <select
                    value={form.content_access_tier} onChange={(e) => setForm(prev => ({ ...prev, content_access_tier: e.target.value }))}
                    style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }}
                  >
                    <option value="free">Free</option>
                    <option value="preview">Preview</option>
                    <option value="pro">Pro</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#374151' }}>Featured Image</label>
                <ImageUpload
                  value={form.featured_image_url}
                  onChange={handleFeaturedImageChange}
                  purpose="featured"
                />
              </div>
              <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#374151' }}>Featured Image Alt Text</label>
                <input
                  type="text" value={form.featured_image_alt} onChange={(e) => setForm(prev => ({ ...prev, featured_image_alt: e.target.value }))}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }}
                />
              </div>
              <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#374151' }}>Tags <span style={{ fontWeight: 400, color: '#9ca3af' }}>(comma separated)</span></label>
                <input
                  type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }}
                  placeholder="frost, gdd, marlborough"
                />
              </div>
              <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#374151' }}>Region Tags <span style={{ fontWeight: 400, color: '#9ca3af' }}>(comma separated)</span></label>
                <input
                  type="text" value={regionTagsInput} onChange={(e) => setRegionTagsInput(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }}
                  placeholder="Marlborough, Central Otago"
                />
              </div>
            </div>
          )}

          {/* SEO Tab */}
          {activeTab === 'seo' && (
            <div style={{ background: 'white', borderRadius: '8px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              {/* SEO Score Check */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', padding: '0.75rem 1rem', background: seoScoreBg, borderRadius: '8px', border: `1px solid ${seoScore === null ? '#e5e7eb' : seoScoreColor}22` }}>
                {seoScore !== null && (
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: seoScoreColor, minWidth: '48px', textAlign: 'center' }}>
                    {seoScore}
                  </span>
                )}
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
                    {seoScore === null ? 'Run an SEO check to see your score' : seoScore >= 80 ? 'Good SEO score' : seoScore >= 60 ? 'Needs improvement' : 'Poor SEO score'}
                  </span>
                </div>
                <button
                  onClick={handleCheckSeo}
                  disabled={isNew || seoChecking}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '0.4rem 0.75rem',
                    border: '1px solid #d1d5db', borderRadius: '6px', background: 'white',
                    fontSize: '0.8rem', cursor: isNew ? 'not-allowed' : 'pointer', color: '#374151',
                    opacity: isNew ? 0.5 : 1,
                  }}
                  title={isNew ? 'Save the article first' : 'Check SEO score'}
                >
                  {seoChecking ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={14} />}
                  {seoChecking ? 'Checking...' : 'Check SEO'}
                </button>
              </div>
              {/* SEO Warnings */}
              {seoWarnings.length > 0 && (
                <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a' }}>
                  {seoWarnings.map((w, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#92400e', padding: '2px 0' }}>
                      <AlertTriangle size={13} /> {w}
                    </div>
                  ))}
                </div>
              )}
              {seoScore !== null && seoWarnings.length === 0 && (
                <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#065f46' }}>
                  <CheckCircle size={14} /> All SEO checks passed
                </div>
              )}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#374151' }}>
                  SEO Title <span style={{ fontWeight: 400, color: form.seo_title.length > 70 ? '#ef4444' : '#9ca3af' }}>({form.seo_title.length}/70)</span>
                </label>
                <input
                  type="text" value={form.seo_title} onChange={(e) => setForm(prev => ({ ...prev, seo_title: e.target.value }))}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }}
                  maxLength={70}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#374151' }}>
                  Meta Description <span style={{ fontWeight: 400, color: form.meta_description.length > 160 ? '#ef4444' : '#9ca3af' }}>({form.meta_description.length}/160)</span>
                </label>
                <textarea
                  value={form.meta_description} onChange={(e) => setForm(prev => ({ ...prev, meta_description: e.target.value }))}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem', minHeight: '60px', fontFamily: 'inherit', resize: 'vertical' }}
                  maxLength={160}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#374151' }}>Focus Keywords <span style={{ fontWeight: 400, color: '#9ca3af' }}>(comma separated)</span></label>
                <input
                  type="text" value={keywordsInput} onChange={(e) => setKeywordsInput(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#374151' }}>OG Image URL</label>
                <input
                  type="text" value={form.og_image_url} onChange={(e) => setForm(prev => ({ ...prev, og_image_url: e.target.value }))}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#374151' }}>Canonical URL</label>
                <input
                  type="text" value={form.canonical_url} onChange={(e) => setForm(prev => ({ ...prev, canonical_url: e.target.value }))}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save bar */}
      <div style={{
        display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem',
        padding: '1rem 1.5rem', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
      }}>
        <button
          onClick={() => handleSave(false)} disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white', fontSize: '0.875rem', cursor: 'pointer' }}
        >
          <Save size={16} /> {saving ? 'Saving...' : 'Save Draft'}
        </button>
        {form.status !== 'published' && (
          <button
            onClick={() => handleSave(true)} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem', border: 'none', borderRadius: '6px', background: '#059669', color: 'white', fontSize: '0.875rem', cursor: 'pointer' }}
          >
            <Eye size={16} /> Publish
          </button>
        )}
        {form.status === 'published' && (
          <button
            onClick={() => handleSave(false)} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem', border: 'none', borderRadius: '6px', background: '#2563eb', color: 'white', fontSize: '0.875rem', cursor: 'pointer' }}
          >
            <Save size={16} /> Update
          </button>
        )}
      </div>
    </AdminLayout>
  );
}

export default AdminArticleEditor;
