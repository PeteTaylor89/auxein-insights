// packages/web/src/components/admin/BannerManagement.jsx
// Auxein Grow — admin CRUD for site banners. Auxein-admin gated by parent route.
import { useState, useEffect } from 'react';
import {
  Megaphone, Plus, Edit2, Trash2, Save, X,
  ToggleLeft, ToggleRight, Rocket, RefreshCw,
} from 'lucide-react';
import { bannerService } from '@vineyard/shared';

const EMPTY_FORM = {
  title: '',
  content: '',
  banner_type: 'update',
  audience: 'grow',
  is_active: true,
  display_order: 0,
};

const AUDIENCE_LABEL = {
  insights: 'Insights only',
  grow: 'Grow only',
  both: 'Both products',
};

function BannerManagement() {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchBanners = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await bannerService.admin.listBanners();
      setBanners(data.banners || []);
    } catch (err) {
      console.error('Failed to load banners:', err);
      setError('Failed to load banners');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBanners(); }, []);

  const handleCreate = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setShowForm(true);
  };

  const handleEdit = (banner) => {
    setEditingId(banner.id);
    setFormData({
      title: banner.title,
      content: banner.content,
      banner_type: banner.banner_type,
      audience: banner.audience,
      is_active: banner.is_active,
      display_order: banner.display_order,
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.content.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await bannerService.admin.updateBanner(editingId, formData);
      } else {
        await bannerService.admin.createBanner(formData);
      }
      handleCancel();
      fetchBanners();
    } catch (err) {
      console.error('Failed to save banner:', err);
      setError('Failed to save banner');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (banner) => {
    try {
      await bannerService.admin.updateBanner(banner.id, { is_active: !banner.is_active });
      fetchBanners();
    } catch (err) {
      console.error('Failed to toggle banner:', err);
    }
  };

  const handleDelete = async (banner) => {
    if (!window.confirm(`Delete banner "${banner.title}"?`)) return;
    try {
      await bannerService.admin.deleteBanner(banner.id);
      fetchBanners();
    } catch (err) {
      console.error('Failed to delete banner:', err);
    }
  };

  if (loading) {
    return (
      <div className="banner-admin-empty">
        <RefreshCw size={28} className="spin" />
        <p>Loading banners…</p>
      </div>
    );
  }

  const Icon = formData.banner_type === 'update' ? Megaphone : Rocket;

  return (
    <div className="banner-admin">
      {error && <div className="error-message">{error}</div>}

      <div className="banner-admin-toolbar">
        <p className="banner-admin-count">
          {banners.length} banner{banners.length !== 1 ? 's' : ''} · {banners.filter(b => b.is_active).length} active
        </p>
        <button className="btn-accent" onClick={handleCreate}>
          <Plus size={16} /> New Banner
        </button>
      </div>

      {showForm && (
        <div className="banner-admin-form">
          <h3>{editingId ? 'Edit Banner' : 'New Banner'}</h3>

          <div className="form-group">
            <label>Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. New Calibration Workflow"
            />
          </div>

          <div className="form-group">
            <label>Content</label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Describe the update or upcoming feature…"
              rows={3}
            />
          </div>

          <div className="banner-admin-form-row">
            <div className="form-group">
              <label>Type</label>
              <select
                value={formData.banner_type}
                onChange={(e) => setFormData({ ...formData, banner_type: e.target.value })}
              >
                <option value="update">Update (What's New)</option>
                <option value="coming_soon">Coming Soon</option>
              </select>
            </div>

            <div className="form-group">
              <label>Audience</label>
              <select
                value={formData.audience}
                onChange={(e) => setFormData({ ...formData, audience: e.target.value })}
              >
                <option value="grow">Grow only</option>
                <option value="both">Both products</option>
                <option value="insights">Insights only</option>
              </select>
            </div>

            <div className="form-group">
              <label>Display order</label>
              <input
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
              />
            </div>

            <label className="banner-admin-active">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              />
              Active
            </label>
          </div>

          {/* Live preview */}
          <div className="form-group">
            <label>Preview</label>
            <div className={`banner-admin-preview banner-admin-preview-${formData.banner_type}`}>
              <Icon size={18} />
              <div>
                <strong>{formData.title || 'Title'}</strong>
                <span>{formData.content || 'Content'}</span>
              </div>
            </div>
          </div>

          <div className="banner-admin-actions">
            <button className="btn-ghost" onClick={handleCancel}>
              <X size={14} /> Cancel
            </button>
            <button
              className="btn-accent"
              onClick={handleSave}
              disabled={saving || !formData.title.trim() || !formData.content.trim()}
            >
              <Save size={14} /> {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {banners.length === 0 ? (
        <div className="banner-admin-empty">
          <Megaphone size={40} style={{ opacity: 0.35 }} />
          <p>No banners yet. Create one to announce updates.</p>
        </div>
      ) : (
        <table className="banner-admin-table">
          <thead>
            <tr>
              <th>Banner</th>
              <th>Type</th>
              <th>Audience</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {banners.map(banner => (
              <tr key={banner.id}>
                <td>
                  <strong>{banner.title}</strong>
                  <p>{banner.content.length > 100 ? banner.content.slice(0, 100) + '…' : banner.content}</p>
                </td>
                <td>
                  <span className={`banner-admin-type-pill banner-admin-type-${banner.banner_type}`}>
                    {banner.banner_type === 'update' ? <Megaphone size={12} /> : <Rocket size={12} />}
                    {banner.banner_type === 'update' ? 'Update' : 'Coming Soon'}
                  </span>
                </td>
                <td>
                  <span className="banner-admin-audience">{AUDIENCE_LABEL[banner.audience] || banner.audience}</span>
                </td>
                <td>
                  <button
                    className="banner-admin-toggle"
                    onClick={() => handleToggleActive(banner)}
                    style={{ color: banner.is_active ? 'var(--color-success)' : 'var(--color-text-muted)' }}
                    title={banner.is_active ? 'Click to deactivate' : 'Click to activate'}
                  >
                    {banner.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    {banner.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn-ghost btn-ghost--sm" onClick={() => handleEdit(banner)}>
                    <Edit2 size={14} /> Edit
                  </button>
                  <button
                    className="btn-ghost btn-ghost--sm banner-admin-delete"
                    onClick={() => handleDelete(banner)}
                    aria-label="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <style>{`
        .banner-admin {
          display: flex;
          flex-direction: column;
          gap: var(--space-base);
        }

        .banner-admin-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .banner-admin-count {
          margin: 0;
          color: var(--color-text-muted);
          font-size: var(--font-size-base);
        }

        .banner-admin-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-base);
          padding: var(--space-lg);
          background: var(--color-surface-warm);
          border: 1px solid var(--color-olive-border);
          border-radius: var(--radius-lg);
        }

        .banner-admin-form h3 {
          margin: 0;
          font-size: var(--font-size-lg);
          color: var(--color-primary);
        }

        .banner-admin-form .form-group {
          gap: 6px;
        }

        .banner-admin-form .form-group label {
          font-size: var(--font-size-sm);
          font-weight: 600;
          color: var(--color-text);
        }

        .banner-admin-form input,
        .banner-admin-form textarea,
        .banner-admin-form select {
          padding: 10px 12px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          font-family: var(--font-family);
          font-size: var(--font-size-base);
          background: var(--color-white);
        }

        .banner-admin-form input:focus,
        .banner-admin-form textarea:focus,
        .banner-admin-form select:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px var(--color-olive-light);
        }

        .banner-admin-form textarea {
          resize: vertical;
          font-family: var(--font-family);
        }

        .banner-admin-form-row {
          display: flex;
          gap: var(--space-base);
          flex-wrap: wrap;
          align-items: flex-end;
        }

        .banner-admin-active {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: var(--font-size-base);
          color: var(--color-text);
          cursor: pointer;
          padding-bottom: 10px;
        }

        .banner-admin-preview {
          display: flex;
          gap: 12px;
          align-items: center;
          padding: 12px 16px;
          border-radius: var(--radius-md);
          background: var(--color-white);
          border: 1px solid var(--color-olive-border);
        }

        .banner-admin-preview-update { color: var(--color-primary); }
        .banner-admin-preview-coming_soon { color: var(--color-accent); }

        .banner-admin-preview > div {
          display: flex;
          gap: 8px;
          align-items: baseline;
          flex-wrap: wrap;
          color: var(--color-text);
        }

        .banner-admin-preview strong {
          color: inherit;
        }

        .banner-admin-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        .banner-admin-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-md);
          padding: var(--space-2xl) var(--space-base);
          color: var(--color-text-muted);
        }

        .banner-admin-table {
          width: 100%;
          border-collapse: collapse;
          background: var(--color-white);
        }

        .banner-admin-table th {
          text-align: left;
          padding: var(--space-md);
          font-size: var(--font-size-sm);
          font-weight: 600;
          color: var(--color-text-muted);
          border-bottom: 2px solid var(--color-border);
        }

        .banner-admin-table td {
          padding: var(--space-md);
          border-bottom: 1px solid var(--color-border);
          vertical-align: top;
          font-size: var(--font-size-base);
        }

        .banner-admin-table strong {
          color: var(--color-text);
        }

        .banner-admin-table p {
          margin: 4px 0 0;
          color: var(--color-text-muted);
          font-size: var(--font-size-sm);
          line-height: 1.4;
        }

        .banner-admin-type-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 10px;
          border-radius: var(--radius-pill);
          font-size: var(--font-size-xs);
          font-weight: 600;
        }

        .banner-admin-type-update {
          background: var(--color-olive-light);
          color: var(--color-primary);
        }

        .banner-admin-type-coming_soon {
          background: rgba(209, 88, 59, 0.1);
          color: var(--color-accent);
        }

        .banner-admin-audience {
          font-size: var(--font-size-sm);
          color: var(--color-text-muted);
        }

        .banner-admin-toggle {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: none;
          border: none;
          cursor: pointer;
          font-size: var(--font-size-sm);
          font-weight: 500;
          padding: 0;
        }

        .btn-ghost--sm {
          padding: 4px 10px;
          font-size: var(--font-size-sm);
          margin-left: 6px;
        }

        .banner-admin-delete {
          color: var(--color-danger) !important;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default BannerManagement;
