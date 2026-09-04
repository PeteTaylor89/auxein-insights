// src/pages/admin/AdminResearchEditor.jsx - Admin research report create/edit
import { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Eye, Plus, Trash2, GripVertical, RefreshCw, Settings2, Map as MapIcon } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import researchService from '../../services/researchService';
import SurfaceMapFields from '../../components/surfaces/SurfaceMapFields';
import {
  DEFAULT_SURFACE_CONFIG,
  normaliseConfig,
  surfaceMapProps,
  isConfigComplete,
} from '../../components/surfaces/surfaceMapConfig';

// Lazy for the same reason as everywhere else: mapbox-gl is ~800 kB and most
// reports have no map section. The preview is the REAL component, not an
// approximation of it, so what the author pins is what the reader gets.
const ArticleSurfaceMap = lazy(() => import('../../components/surfaces/ArticleSurfaceMap'));

// The content a new section starts life with. Until 2026-09-04 every section
// was created with `{ html: '' }` regardless of type and there was no way to
// edit it afterwards — `researchService.updateSection` existed and was called
// from nowhere. A map section at least now starts valid and can be configured.
//
// The other types still have no content editor. `text` sections are authored
// straight into the JSONB column by hand, and `chart`/`table` render as
// placeholders in ResearchDetail. Not fixed here; flagged so the next person
// does not read this function as evidence that they work.
function blankContentFor(sectionType) {
  return sectionType === 'map' ? { ...DEFAULT_SURFACE_CONFIG } : { html: '' };
}

function AdminResearchEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('details');

  const [form, setForm] = useState({
    title: '', slug: '', abstract: '', authors: [],
    status: 'draft', published_at: '', version: '1.0',
    regions: [], tags: [],
    funding_acknowledgement: '', citation_text: '',
    content_access_tier: 'free',
    seo_title: '', meta_description: '', canonical_url: '',
    focus_keywords: [], og_image_url: '',
  });

  const [authorsInput, setAuthorsInput] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [regionsInput, setRegionsInput] = useState('');
  const [keywordsInput, setKeywordsInput] = useState('');
  const [sections, setSections] = useState([]);
  const [newSection, setNewSection] = useState({ title: '', section_type: 'text', content: { html: '' }, caption: '' });
  // Which section's settings panel is open, and the UNSAVED draft of it. The
  // draft is separate from `sections` so closing the panel without saving
  // discards the edit rather than leaving the list showing a config the server
  // does not have.
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [sectionDraft, setSectionDraft] = useState(null);
  const [sectionSaving, setSectionSaving] = useState(false);

  useEffect(() => {
    if (!isNew) {
      const fetchReport = async () => {
        try {
          const data = await researchService.adminGet(parseInt(id));
          setForm({
            title: data.title || '', slug: data.slug || '',
            abstract: data.abstract || '', authors: data.authors || [],
            status: data.status || 'draft',
            published_at: data.published_at ? data.published_at.slice(0, 16) : '',
            version: data.version || '1.0',
            regions: data.regions || [], tags: data.tags || [],
            funding_acknowledgement: data.funding_acknowledgement || '',
            citation_text: data.citation_text || '',
            content_access_tier: data.content_access_tier || 'free',
            seo_title: data.seo_title || '',
            meta_description: data.meta_description || '',
            canonical_url: data.canonical_url || '',
            focus_keywords: data.focus_keywords || [],
            og_image_url: data.og_image_url || '',
          });
          setAuthorsInput((data.authors || []).join(', '));
          setTagsInput((data.tags || []).join(', '));
          setRegionsInput((data.regions || []).join(', '));
          setKeywordsInput((data.focus_keywords || []).join(', '));
          setSections(data.sections || []);
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };
      fetchReport();
    }
  }, [id, isNew]);

  const slugify = (t) => t.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  const handleTitleChange = (e) => {
    const title = e.target.value;
    setForm(prev => ({ ...prev, title, slug: isNew && !prev.slug ? slugify(title) : prev.slug }));
  };

  const handleSave = async (publishNow = false) => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        authors: authorsInput ? authorsInput.split(',').map(t => t.trim()).filter(Boolean) : [],
        tags: tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [],
        regions: regionsInput ? regionsInput.split(',').map(t => t.trim()).filter(Boolean) : [],
        focus_keywords: keywordsInput ? keywordsInput.split(',').map(t => t.trim()).filter(Boolean) : [],
      };

      // Remove empty string values that should be null for the API
      if (!payload.published_at) payload.published_at = null;
      if (!payload.funding_acknowledgement) delete payload.funding_acknowledgement;
      if (!payload.citation_text) delete payload.citation_text;
      if (!payload.seo_title) delete payload.seo_title;
      if (!payload.meta_description) delete payload.meta_description;
      if (!payload.canonical_url) delete payload.canonical_url;
      if (!payload.og_image_url) delete payload.og_image_url;

      if (publishNow) payload.status = 'published';

      if (isNew) {
        const created = await researchService.create(payload);
        navigate(`/admin/research/${created.id}/edit`, { replace: true });
      } else {
        await researchService.update(parseInt(id), payload);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSection = async () => {
    if (!id || !newSection.title) return;
    try {
      // Content follows the TYPE. The old code sent `{ html: '' }` for every
      // type, so a map section was created holding an article's content shape
      // and rendered as a permanent placeholder.
      const payload = { ...newSection, content: blankContentFor(newSection.section_type) };
      const created = await researchService.addSection(parseInt(id), payload);
      setSections([...sections, created]);
      setNewSection({ title: '', section_type: 'text', content: { html: '' }, caption: '' });
      // A new map opens straight into its settings — it has a default layer and
      // a pinned newest step, but the author almost certainly wants neither.
      if (created.section_type === 'map') {
        setEditingSectionId(created.id);
        setSectionDraft(normaliseConfig(created.content));
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEditSection = (section) => {
    if (editingSectionId === section.id) {
      setEditingSectionId(null);
      setSectionDraft(null);
      return;
    }
    setEditingSectionId(section.id);
    setSectionDraft(normaliseConfig(section.content));
  };

  const handleSaveSection = async (sectionId) => {
    if (!sectionDraft) return;
    setSectionSaving(true);
    try {
      // Only `content` is sent. `ResearchSectionUpdate` is all-optional, so a
      // full-object PUT would rewrite the title and the tier from whatever this
      // panel happens to be holding.
      const updated = await researchService.updateSection(sectionId, {
        content: normaliseConfig(sectionDraft),
      });
      setSections(sections.map((s) => (s.id === sectionId ? { ...s, ...updated } : s)));
      setEditingSectionId(null);
      setSectionDraft(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSectionSaving(false);
    }
  };

  const handleDeleteSection = async (sectionId) => {
    if (!confirm('Delete this section?')) return;
    try {
      await researchService.deleteSection(sectionId);
      setSections(sections.filter(s => s.id !== sectionId));
    } catch (err) {
      setError(err.message);
    }
  };

  const inputStyle = { width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' };
  const labelStyle = { display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#374151' };
  const fieldStyle = { marginBottom: '1rem' };

  if (loading) {
    return (
      <AdminLayout title="Loading..." backLink="/admin/research" backText="Research">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title={isNew ? 'New Research Report' : 'Edit Report'}
      subtitle={isNew ? 'Create a new research report' : form.title}
      backLink="/admin/research" backText="Research"
    >
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '1px solid #e5e7eb' }}>
        {['details', 'sections', 'seo'].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.75rem 1.25rem', border: 'none',
              borderBottom: activeTab === tab ? '2px solid #059669' : '2px solid transparent',
              background: 'none', fontSize: '0.875rem',
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? '#059669' : '#6b7280',
              cursor: 'pointer', textTransform: 'capitalize'
            }}
          >{tab}</button>
        ))}
      </div>

      {/* Details Tab */}
      {activeTab === 'details' && (
        <div style={{ background: 'white', borderRadius: '8px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Title</label>
            <input type="text" value={form.title} onChange={handleTitleChange} style={inputStyle} placeholder="Report title" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Slug</label>
            <input type="text" value={form.slug} onChange={(e) => setForm(prev => ({ ...prev, slug: e.target.value }))} style={inputStyle} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Abstract</label>
            <textarea value={form.abstract} onChange={(e) => setForm(prev => ({ ...prev, abstract: e.target.value }))}
              style={{ ...inputStyle, minHeight: '120px', fontFamily: 'inherit', resize: 'vertical' }} placeholder="Report abstract..." />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Authors (comma separated)</label>
            <input type="text" value={authorsInput} onChange={(e) => setAuthorsInput(e.target.value)} style={inputStyle} placeholder="Dr. Jane Smith, Prof. John Doe" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', ...fieldStyle }}>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={form.status} onChange={(e) => setForm(prev => ({ ...prev, status: e.target.value }))} style={inputStyle}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Version</label>
              <input type="text" value={form.version} onChange={(e) => setForm(prev => ({ ...prev, version: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Access Tier</label>
              <select value={form.content_access_tier} onChange={(e) => setForm(prev => ({ ...prev, content_access_tier: e.target.value }))} style={inputStyle}>
                <option value="free">Free</option>
                <option value="preview">Preview</option>
                <option value="pro">Pro</option>
              </select>
            </div>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Tags (comma separated)</label>
            <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} style={inputStyle} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Regions (comma separated)</label>
            <input type="text" value={regionsInput} onChange={(e) => setRegionsInput(e.target.value)} style={inputStyle} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Funding Acknowledgement</label>
            <textarea value={form.funding_acknowledgement} onChange={(e) => setForm(prev => ({ ...prev, funding_acknowledgement: e.target.value }))}
              style={{ ...inputStyle, minHeight: '60px', fontFamily: 'inherit', resize: 'vertical' }} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Citation Text (optional override)</label>
            <textarea value={form.citation_text} onChange={(e) => setForm(prev => ({ ...prev, citation_text: e.target.value }))}
              style={{ ...inputStyle, minHeight: '60px', fontFamily: 'inherit', resize: 'vertical' }} />
          </div>
        </div>
      )}

      {/* Sections Tab */}
      {activeTab === 'sections' && (
        <div>
          {isNew ? (
            <div style={{ background: 'white', borderRadius: '8px', padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
              Save the report first before adding sections.
            </div>
          ) : (
            <>
              {sections.map((section) => {
                const isMap = section.section_type === 'map';
                const isOpen = editingSectionId === section.id;
                const cfg = isMap ? normaliseConfig(section.content) : null;
                return (
                  <div key={section.id} style={{ background: 'white', borderRadius: '8px', marginBottom: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                    <div style={{ padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <GripVertical size={16} style={{ color: '#d1d5db', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {isMap && <MapIcon size={14} style={{ color: '#16a34a', flexShrink: 0 }} />}
                          {section.title}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {section.section_type} · Order: {section.sort_order}
                          {section.content_access_tier && ` · Tier: ${section.content_access_tier}`}
                          {/* The pinned step, in the list, because it is the one
                              setting that silently makes a report wrong: a map
                              following the newest month under a paragraph about
                              February drifts every month with no error. */}
                          {isMap && ` · ${cfg.variable} · ${cfg.followLatest ? 'newest step' : (cfg.validAt || 'no step pinned')}`}
                        </div>
                      </div>
                      {isMap && (
                        <button onClick={() => handleEditSection(section)}
                          title="Map settings"
                          style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: '1px solid #d1d5db', borderRadius: '6px', padding: '0.35rem 0.6rem', color: isOpen ? '#16a34a' : '#374151', fontSize: '0.75rem', cursor: 'pointer' }}>
                          <Settings2 size={14} /> {isOpen ? 'Close' : 'Configure'}
                        </button>
                      )}
                      <button onClick={() => handleDeleteSection(section.id)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {isMap && isOpen && sectionDraft && (
                      <div style={{ borderTop: '1px solid #f3f4f6', padding: '1.25rem 1.5rem', background: '#fafafa' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '460px' }}>
                          <SurfaceMapFields value={sectionDraft} onChange={setSectionDraft} />
                        </div>

                        {/* THE REAL COMPONENT, not a mock of it. The author has
                            to be able to see which month they pinned, and the
                            probe is the whole point of the widget. */}
                        <div style={{ marginTop: '1.25rem' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginBottom: '0.4rem' }}>
                            Preview
                          </div>
                          <Suspense fallback={<p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Loading the map...</p>}>
                            <ArticleSurfaceMap {...surfaceMapProps(sectionDraft)} />
                          </Suspense>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                          <button onClick={() => handleSaveSection(section.id)}
                            disabled={sectionSaving || !isConfigComplete(sectionDraft)}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer', opacity: (sectionSaving || !isConfigComplete(sectionDraft)) ? 0.5 : 1 }}>
                            {sectionSaving ? <RefreshCw size={16} className="spin" /> : <Save size={16} />}
                            {sectionSaving ? 'Saving...' : 'Save map settings'}
                          </button>
                          <button onClick={() => { setEditingSectionId(null); setSectionDraft(null); }}
                            style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white', fontSize: '0.875rem', cursor: 'pointer' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <div style={{ background: 'white', borderRadius: '8px', padding: '1.5rem', marginTop: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <h4 style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: '#374151' }}>Add Section</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <input type="text" placeholder="Section title" value={newSection.title}
                    onChange={(e) => setNewSection(prev => ({ ...prev, title: e.target.value }))} style={inputStyle} />
                  <select value={newSection.section_type}
                    onChange={(e) => setNewSection(prev => ({ ...prev, section_type: e.target.value }))} style={inputStyle}>
                    <option value="text">Text</option>
                    <option value="chart">Chart</option>
                    <option value="table">Table</option>
                    <option value="map">Map</option>
                    <option value="image">Image</option>
                    <option value="file">File</option>
                  </select>
                </div>
                <button onClick={handleAddSection} disabled={!newSection.title}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer', opacity: newSection.title ? 1 : 0.5 }}>
                  <Plus size={16} /> Add Section
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* SEO Tab */}
      {activeTab === 'seo' && (
        <div style={{ background: 'white', borderRadius: '8px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>SEO Title <span style={{ fontWeight: 400, color: (form.seo_title || '').length > 70 ? '#ef4444' : '#9ca3af' }}>({(form.seo_title || '').length}/70)</span></label>
            <input type="text" value={form.seo_title} onChange={(e) => setForm(prev => ({ ...prev, seo_title: e.target.value }))} style={inputStyle} maxLength={70} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Meta Description <span style={{ fontWeight: 400, color: (form.meta_description || '').length > 160 ? '#ef4444' : '#9ca3af' }}>({(form.meta_description || '').length}/160)</span></label>
            <textarea value={form.meta_description} onChange={(e) => setForm(prev => ({ ...prev, meta_description: e.target.value }))}
              style={{ ...inputStyle, minHeight: '60px', fontFamily: 'inherit', resize: 'vertical' }} maxLength={160} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Focus Keywords (comma separated)</label>
            <input type="text" value={keywordsInput} onChange={(e) => setKeywordsInput(e.target.value)} style={inputStyle} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>OG Image URL</label>
            <input type="text" value={form.og_image_url} onChange={(e) => setForm(prev => ({ ...prev, og_image_url: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Canonical URL</label>
            <input type="text" value={form.canonical_url} onChange={(e) => setForm(prev => ({ ...prev, canonical_url: e.target.value }))} style={inputStyle} />
          </div>
        </div>
      )}

      {/* Save bar */}
      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem', padding: '1rem 1.5rem', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <button onClick={() => handleSave(false)} disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white', fontSize: '0.875rem', cursor: 'pointer' }}>
          <Save size={16} /> {saving ? 'Saving...' : 'Save Draft'}
        </button>
        {form.status !== 'published' && (
          <button onClick={() => handleSave(true)} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem', border: 'none', borderRadius: '6px', background: '#059669', color: 'white', fontSize: '0.875rem', cursor: 'pointer' }}>
            <Eye size={16} /> Publish
          </button>
        )}
        {form.status === 'published' && (
          <button onClick={() => handleSave(false)} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem', border: 'none', borderRadius: '6px', background: '#059669', color: 'white', fontSize: '0.875rem', cursor: 'pointer' }}>
            <Save size={16} /> Update
          </button>
        )}
      </div>
    </AdminLayout>
  );
}

export default AdminResearchEditor;
