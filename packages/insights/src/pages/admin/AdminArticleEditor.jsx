// src/pages/admin/AdminArticleEditor.jsx - Admin article create/edit
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Eye, RefreshCw } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import TiptapEditor from '../../components/TiptapEditor';
import ImageUpload from '../../components/ImageUpload';
import articleService from '../../services/articleService';

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

  const handleSave = async (publishNow = false) => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
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
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

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
        {['content', 'metadata', 'seo'].map((tab) => (
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
