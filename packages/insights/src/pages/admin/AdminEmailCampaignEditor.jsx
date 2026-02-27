// src/pages/admin/AdminEmailCampaignEditor.jsx - Campaign composer
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Send, Clock, X, Users } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import emailCampaignService from '../../services/emailCampaignService';
import articleService from '../../services/articleService';

const NZ_REGIONS = [
  'Marlborough', 'Central Otago', 'Waipara', "Hawke's Bay",
  'Martinborough', 'Wairarapa', 'Nelson', 'Gisborne',
  'Auckland', 'Northland', 'Canterbury',
];

function AdminEmailCampaignEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id;

  const [form, setForm] = useState({
    template_id: '',
    subject: '',
    body_html: '',
    body_preview_text: '',
    intro_text: '',
    outro_text: '',
    article_ids: [],
    research_ids: [],
    target_regions: [],
    target_tiers: [],
  });

  const [templates, setTemplates] = useState([]);
  const [activeTab, setActiveTab] = useState('content');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [savedId, setSavedId] = useState(id ? parseInt(id) : null);

  // Article picker
  const [allArticles, setAllArticles] = useState([]);
  const [selectedArticles, setSelectedArticles] = useState([]);

  // Targeting
  const [estimatedRecipients, setEstimatedRecipients] = useState(null);
  const [recipientPreview, setRecipientPreview] = useState([]);
  const estimateTimer = useRef(null);

  // Preview
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewWidth, setPreviewWidth] = useState('600');
  const [previewLoading, setPreviewLoading] = useState(false);

  // Schedule
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');

  // Test send
  const [testEmail, setTestEmail] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testSuccess, setTestSuccess] = useState('');
  const [allUsers, setAllUsers] = useState([]);

  // Load templates + articles on mount
  useEffect(() => {
    emailCampaignService.listTemplates()
      .then(setTemplates)
      .catch((err) => console.error('Failed to load templates:', err));
    articleService.adminList({ page_size: 50 })
      .then((data) => setAllArticles(data.items || []))
      .catch(() => {});
    emailCampaignService.listUsers({ page_size: 100, sort_by: 'email', sort_order: 'asc' })
      .then((data) => setAllUsers(data.users || []))
      .catch(() => {});
  }, []);

  // Load existing campaign if editing
  useEffect(() => {
    if (!id) return;
    emailCampaignService.getCampaign(id)
      .then((data) => {
        setForm({
          template_id: data.template_id || '',
          subject: data.subject || '',
          body_html: data.body_html || '',
          body_preview_text: data.body_preview_text || '',
          intro_text: data.intro_text || '',
          outro_text: data.outro_text || '',
          article_ids: data.article_ids || [],
          research_ids: data.research_ids || [],
          target_regions: data.target_regions || [],
          target_tiers: data.target_tiers || [],
        });
        setSavedId(data.id);
        // Load selected article details
        if (data.article_ids && data.article_ids.length > 0) {
          Promise.all(data.article_ids.map((aid) =>
            articleService.adminGet(aid).catch(() => null)
          )).then((articles) => {
            setSelectedArticles(articles.filter(Boolean));
          });
        }
      })
      .catch((err) => setError(err.message));
  }, [id]);

  // Auto-fill subject from template when template changes
  useEffect(() => {
    if (!form.template_id || form.subject) return;
    const tmpl = templates.find((t) => t.id === parseInt(form.template_id));
    if (tmpl) {
      setForm((prev) => ({ ...prev, subject: tmpl.subject_template }));
    }
  }, [form.template_id, templates]);

  // Estimate recipients when targeting changes (debounced)
  useEffect(() => {
    if (estimateTimer.current) clearTimeout(estimateTimer.current);
    estimateTimer.current = setTimeout(() => {
      emailCampaignService.estimateRecipients({
        target_regions: form.target_regions.length ? form.target_regions : null,
        target_tiers: form.target_tiers.length ? form.target_tiers : null,
      })
        .then((data) => {
          setEstimatedRecipients(data.count);
          setRecipientPreview(data.preview || []);
        })
        .catch(() => {
          setEstimatedRecipients(null);
          setRecipientPreview([]);
        });
    }, 500);
    return () => clearTimeout(estimateTimer.current);
  }, [form.target_regions, form.target_tiers]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const addArticle = (articleId) => {
    const article = allArticles.find((a) => a.id === articleId);
    if (!article) return;
    setForm((prev) => ({ ...prev, article_ids: [...prev.article_ids, articleId] }));
    setSelectedArticles((prev) => [...prev, article]);
  };

  const removeArticle = (articleId) => {
    setForm((prev) => ({ ...prev, article_ids: prev.article_ids.filter((id) => id !== articleId) }));
    setSelectedArticles((prev) => prev.filter((a) => a.id !== articleId));
  };

  const toggleRegion = (region) => {
    setForm((prev) => ({
      ...prev,
      target_regions: prev.target_regions.includes(region)
        ? prev.target_regions.filter((r) => r !== region)
        : [...prev.target_regions, region],
    }));
  };

  const toggleTier = (tier) => {
    setForm((prev) => ({
      ...prev,
      target_tiers: prev.target_tiers.includes(tier)
        ? prev.target_tiers.filter((t) => t !== tier)
        : [...prev.target_tiers, tier],
    }));
  };

  // Save
  const handleSave = async () => {
    if (!form.template_id) {
      setError('Please select a template before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        template_id: parseInt(form.template_id),
        article_ids: form.article_ids.length ? form.article_ids : null,
        research_ids: form.research_ids.length ? form.research_ids : null,
        target_regions: form.target_regions.length ? form.target_regions : null,
        target_tiers: form.target_tiers.length ? form.target_tiers : null,
      };
      if (savedId) {
        await emailCampaignService.updateCampaign(savedId, payload);
      } else {
        const created = await emailCampaignService.createCampaign(payload);
        setSavedId(created.id);
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setSaving(false);
    }
  };

  // Preview
  const handlePreview = async () => {
    if (!savedId) {
      setError('Save as draft first to preview.');
      return;
    }
    setPreviewLoading(true);
    try {
      await handleSave();
      const data = await emailCampaignService.previewCampaign(savedId);
      setPreviewHtml(data.body_html);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Send
  const handleSend = async () => {
    if (!savedId) { setError('Save as draft first.'); return; }
    const msg = estimatedRecipients != null
      ? `Send to ${estimatedRecipients} recipient(s) now?`
      : 'Send campaign now?';
    if (!confirm(msg)) return;
    setSending(true);
    setError(null);
    try {
      await handleSave();
      await emailCampaignService.sendCampaign(savedId);
      navigate('/admin/email');
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setSending(false);
    }
  };

  // Schedule
  const handleSchedule = async () => {
    if (!savedId || !scheduleDate) return;
    setSending(true);
    setError(null);
    try {
      await handleSave();
      await emailCampaignService.sendCampaign(savedId, { scheduled_at: new Date(scheduleDate).toISOString() });
      navigate('/admin/email');
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setSending(false);
    }
  };

  const handleTestSend = async () => {
    if (!savedId) { setError('Save as draft first.'); return; }
    if (!testEmail) { setError('Enter an email address for the test send.'); return; }
    setTestSending(true);
    setError(null);
    setTestSuccess('');
    try {
      await handleSave();
      await emailCampaignService.testSendCampaign(savedId, testEmail);
      setTestSuccess(`Test email sent to ${testEmail}`);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setTestSending(false);
    }
  };

  const tabs = ['content', 'targeting', 'preview'];

  const inputStyle = { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' };
  const labelStyle = { display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.375rem', color: '#374151' };

  return (
    <AdminLayout
      title={isEditing ? 'Edit Campaign' : 'New Campaign'}
      backTo="/admin/email"
      backLabel="Back to Campaigns"
    >
      {error && (
        <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', marginBottom: '1rem', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}
      {testSuccess && (
        <div style={{ padding: '0.75rem 1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', color: '#16a34a', marginBottom: '1rem', fontSize: '0.875rem' }}>
          {testSuccess}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid #e5e7eb', marginBottom: '1.5rem' }}>
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.75rem 1.5rem', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '0.875rem', fontWeight: 600, color: activeTab === tab ? '#2563eb' : '#6b7280',
              borderBottom: activeTab === tab ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: '-2px', textTransform: 'capitalize',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content Tab */}
      {activeTab === 'content' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '700px' }}>
          {/* Template */}
          <div>
            <label style={labelStyle}>Template</label>
            <select
              value={form.template_id}
              onChange={(e) => updateField('template_id', e.target.value)}
              style={inputStyle}
            >
              <option value="">Select a template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.template_type})</option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label style={labelStyle}>Subject Line</label>
            <input
              type="text"
              value={form.subject}
              onChange={(e) => updateField('subject', e.target.value)}
              maxLength={255}
              style={inputStyle}
              placeholder="Email subject..."
            />
            <small style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{form.subject.length}/255</small>
          </div>

          {/* Preview Text */}
          <div>
            <label style={labelStyle}>Preview Text</label>
            <input
              type="text"
              value={form.body_preview_text}
              onChange={(e) => updateField('body_preview_text', e.target.value)}
              maxLength={200}
              style={inputStyle}
              placeholder="Short preview shown in inbox..."
            />
            <small style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{(form.body_preview_text || '').length}/200</small>
          </div>

          {/* Intro */}
          <div>
            <label style={labelStyle}>Intro Text</label>
            <textarea
              value={form.intro_text}
              onChange={(e) => updateField('intro_text', e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Introduction paragraph (optional)..."
            />
          </div>

          {/* Article Picker */}
          <div>
            <label style={labelStyle}>Content — Select Article(s)</label>
            {selectedArticles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                {selectedArticles.map((a) => (
                  <span key={a.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '4px 10px', background: '#eff6ff', border: '1px solid #bfdbfe',
                    borderRadius: '16px', fontSize: '0.8rem', color: '#1e40af'
                  }}>
                    {a.title}
                    <button onClick={() => removeArticle(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 0, display: 'flex' }}>
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <select
              value=""
              onChange={(e) => { if (e.target.value) addArticle(parseInt(e.target.value)); }}
              style={inputStyle}
            >
              <option value="">Select an article to add...</option>
              {allArticles
                .filter((a) => !form.article_ids.includes(a.id))
                .map((a) => (
                  <option key={a.id} value={a.id}>{a.title} ({a.status})</option>
                ))}
            </select>
          </div>

          {/* Outro */}
          <div>
            <label style={labelStyle}>Outro Text</label>
            <textarea
              value={form.outro_text}
              onChange={(e) => updateField('outro_text', e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Closing paragraph (optional)..."
            />
          </div>
        </div>
      )}

      {/* Targeting Tab */}
      {activeTab === 'targeting' && (
        <div style={{ maxWidth: '700px' }}>
          {/* Estimated recipients */}
          <div style={{
            padding: '1.25rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px',
            marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem'
          }}>
            <Users size={24} style={{ color: '#16a34a' }} />
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#15803d' }}>
                {estimatedRecipients != null ? estimatedRecipients : '...'}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#4ade80' }}>estimated recipients</div>
            </div>
          </div>

          {/* Regions */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>Target Regions</label>
            <small style={{ display: 'block', color: '#6b7280', marginBottom: '0.75rem', fontSize: '0.8rem' }}>
              Leave empty to send to all regions
            </small>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {NZ_REGIONS.map((region) => (
                <label key={region} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem',
                  border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem',
                  background: form.target_regions.includes(region) ? '#eff6ff' : 'white',
                  borderColor: form.target_regions.includes(region) ? '#93c5fd' : '#e5e7eb',
                }}>
                  <input
                    type="checkbox"
                    checked={form.target_regions.includes(region)}
                    onChange={() => toggleRegion(region)}
                  />
                  {region}
                </label>
              ))}
            </div>
          </div>

          {/* Tiers */}
          <div>
            <label style={labelStyle}>Target Subscription Tiers</label>
            <small style={{ display: 'block', color: '#6b7280', marginBottom: '0.75rem', fontSize: '0.8rem' }}>
              Leave empty to send to all tiers
            </small>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {['free', 'pro'].map((tier) => (
                <label key={tier} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem',
                  border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem',
                  background: form.target_tiers.includes(tier) ? '#eff6ff' : 'white',
                  borderColor: form.target_tiers.includes(tier) ? '#93c5fd' : '#e5e7eb',
                  textTransform: 'capitalize',
                }}>
                  <input
                    type="checkbox"
                    checked={form.target_tiers.includes(tier)}
                    onChange={() => toggleTier(tier)}
                  />
                  {tier}
                </label>
              ))}
            </div>
          </div>

          {/* Recipient Preview List */}
          {recipientPreview.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <label style={labelStyle}>
                Recipient Preview {estimatedRecipients > 50 && <span style={{ fontWeight: 400, color: '#6b7280' }}>(showing first 50 of {estimatedRecipients})</span>}
              </label>
              <div style={{
                background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px',
                maxHeight: '300px', overflowY: 'auto',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Name</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Email</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Region</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipientPreview.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '0.4rem 0.75rem' }}>{r.first_name} {r.last_name}</td>
                        <td style={{ padding: '0.4rem 0.75rem', color: '#6b7280' }}>{r.email}</td>
                        <td style={{ padding: '0.4rem 0.75rem', color: '#6b7280' }}>{r.region || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preview Tab */}
      {activeTab === 'preview' && (
        <div>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
            <button
              onClick={handlePreview}
              disabled={previewLoading}
              style={{
                padding: '0.5rem 1rem', background: '#2563eb', color: 'white', border: 'none',
                borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 500,
              }}
            >
              {previewLoading ? 'Rendering...' : 'Generate Preview'}
            </button>
            <div style={{ display: 'flex', gap: '0.25rem', border: '1px solid #d1d5db', borderRadius: '6px', overflow: 'hidden' }}>
              {[{ label: 'Desktop', w: '600' }, { label: 'Mobile', w: '375' }].map(({ label, w }) => (
                <button
                  key={w}
                  onClick={() => setPreviewWidth(w)}
                  style={{
                    padding: '0.4rem 0.75rem', border: 'none', fontSize: '0.8rem', cursor: 'pointer',
                    background: previewWidth === w ? '#2563eb' : 'white',
                    color: previewWidth === w ? 'white' : '#374151',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {previewHtml ? (
            <div style={{ background: '#f4f4f4', padding: '1rem', borderRadius: '8px', display: 'flex', justifyContent: 'center' }}>
              <iframe
                srcDoc={previewHtml}
                title="Campaign Preview"
                style={{
                  width: `${previewWidth}px`, height: '700px', border: '1px solid #d1d5db',
                  borderRadius: '4px', background: 'white',
                }}
              />
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
              {savedId ? 'Click "Generate Preview" to see the rendered email.' : 'Save as draft first, then preview.'}
            </div>
          )}
        </div>
      )}

      {/* Test Send */}
      <div style={{
        display: 'flex', gap: '0.5rem', marginTop: '2rem', paddingTop: '1.5rem',
        borderTop: '1px solid #e5e7eb', alignItems: 'center', flexWrap: 'wrap',
      }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Test Send:</label>
        <select
          value={testEmail}
          onChange={(e) => setTestEmail(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px',
            fontSize: '0.85rem', minWidth: '280px',
          }}
        >
          <option value="">Select a recipient...</option>
          {allUsers.map((u) => (
            <option key={u.id} value={u.email}>
              {u.full_name} ({u.email})
            </option>
          ))}
        </select>
        <button
          onClick={handleTestSend}
          disabled={testSending || !testEmail || !savedId}
          style={{
            padding: '0.5rem 1rem', background: '#f59e0b', color: 'white', border: 'none',
            borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 500,
            opacity: (!testEmail || !savedId) ? 0.5 : 1,
          }}
        >
          {testSending ? 'Sending...' : 'Send Test'}
        </button>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Save draft first, then send a test</span>
      </div>

      {/* Action Bar */}
      <div style={{
        display: 'flex', gap: '0.75rem', marginTop: '1rem', paddingTop: '1rem',
        borderTop: '1px solid #e5e7eb', flexWrap: 'wrap',
      }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0.6rem 1.25rem',
            background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db',
            borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 500,
          }}
        >
          <Save size={16} /> {saving ? 'Saving...' : 'Save Draft'}
        </button>

        <button
          onClick={handleSend}
          disabled={sending || !form.subject || !form.template_id}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0.6rem 1.25rem',
            background: '#D1583B', color: 'white', border: 'none',
            borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 600,
            opacity: (!form.subject || !form.template_id) ? 0.5 : 1,
          }}
        >
          <Send size={16} /> {sending ? 'Sending...' : 'Send Now'}
        </button>

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowSchedule(!showSchedule)}
            disabled={!form.subject || !form.template_id}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0.6rem 1.25rem',
              background: 'white', color: '#2563eb', border: '1px solid #2563eb',
              borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 500,
              opacity: (!form.subject || !form.template_id) ? 0.5 : 1,
            }}
          >
            <Clock size={16} /> Schedule
          </button>
          {showSchedule && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 0, marginBottom: '0.5rem',
              background: 'white', border: '1px solid #d1d5db', borderRadius: '8px',
              padding: '1rem', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 20,
              minWidth: '260px',
            }}>
              <label style={{ ...labelStyle, marginBottom: '0.5rem' }}>Schedule Send</label>
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                style={{ ...inputStyle, marginBottom: '0.75rem' }}
              />
              <button
                onClick={handleSchedule}
                disabled={!scheduleDate || sending}
                style={{
                  width: '100%', padding: '0.5rem', background: '#2563eb', color: 'white',
                  border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem',
                }}
              >
                Confirm Schedule
              </button>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

export default AdminEmailCampaignEditor;
