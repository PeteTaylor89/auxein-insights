// src/pages/BannerManagement.jsx
import React, { useState, useEffect } from 'react';
import {
  Megaphone, Plus, Edit2, Trash2, Save, X,
  ToggleLeft, ToggleRight, Rocket, RefreshCw
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import adminService from '../services/adminService';
import './admin.css';

const EMPTY_FORM = {
  title: '',
  content: '',
  banner_type: 'update',
  audience: 'insights',
  is_active: true,
  display_order: 0,
};

const AUDIENCE_LABEL = {
  insights: 'Insights only',
  grow: 'Grow only',
  both: 'Both products',
};

const BannerManagement = () => {
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
      const data = await adminService.banners.listBanners();
      setBanners(data.banners || []);
    } catch (err) {
      console.error('Failed to load banners:', err);
      setError('Failed to load banners');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBanners();
  }, []);

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
      audience: banner.audience || 'insights',
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
        await adminService.banners.updateBanner(editingId, formData);
      } else {
        await adminService.banners.createBanner(formData);
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
      await adminService.banners.updateBanner(banner.id, { is_active: !banner.is_active });
      fetchBanners();
    } catch (err) {
      console.error('Failed to toggle banner:', err);
    }
  };

  const handleDelete = async (banner) => {
    if (!window.confirm(`Delete banner "${banner.title}"?`)) return;
    try {
      await adminService.banners.deleteBanner(banner.id);
      fetchBanners();
    } catch (err) {
      console.error('Failed to delete banner:', err);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Banner Management" subtitle="Loading...">
        <div className="loading-container">
          <div className="loading-spinner"><RefreshCw size={32} /></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Banner Management" subtitle="Manage site announcements shown to all visitors">
      {error && (
        <div className="error-container" style={{ marginBottom: '1rem' }}>
          <p className="error-text">{error}</p>
        </div>
      )}

      {/* Actions Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <p style={{ color: '#666', fontSize: '14px' }}>
          {banners.length} banner{banners.length !== 1 ? 's' : ''} &middot; {banners.filter(b => b.is_active).length} active
        </p>
        <button className="btn btn-primary" onClick={handleCreate}>
          <Plus size={16} /> New Banner
        </button>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-body">
            <h3 style={{ margin: '0 0 1rem', fontSize: '16px' }}>
              {editingId ? 'Edit Banner' : 'New Banner'}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: '#374151' }}>
                  Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. New Disease Pressure Model"
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                    borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: '#374151' }}>
                  Content
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Describe the update or upcoming feature..."
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                    borderRadius: '6px', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: '#374151' }}>
                    Type
                  </label>
                  <select
                    value={formData.banner_type}
                    onChange={(e) => setFormData({ ...formData, banner_type: e.target.value })}
                    style={{
                      padding: '10px 12px', border: '1px solid #ddd',
                      borderRadius: '6px', fontSize: '14px', background: 'white'
                    }}
                  >
                    <option value="update">Update (What's New)</option>
                    <option value="coming_soon">Coming Soon</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: '#374151' }}>
                    Audience
                  </label>
                  <select
                    value={formData.audience}
                    onChange={(e) => setFormData({ ...formData, audience: e.target.value })}
                    style={{
                      padding: '10px 12px', border: '1px solid #ddd',
                      borderRadius: '6px', fontSize: '14px', background: 'white'
                    }}
                  >
                    <option value="insights">Insights only</option>
                    <option value="grow">Grow only</option>
                    <option value="both">Both products</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: '#374151' }}>
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                    style={{
                      width: '80px', padding: '10px 12px', border: '1px solid #ddd',
                      borderRadius: '6px', fontSize: '14px'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    />
                    Active
                  </label>
                </div>
              </div>

              {/* Preview */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: '#374151' }}>
                  Preview
                </label>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                  borderRadius: '8px', fontSize: '14px',
                  background: formData.banner_type === 'update' ? '#f0fdf4' : '#eff6ff',
                  border: `1px solid ${formData.banner_type === 'update' ? '#bbf7d0' : '#bfdbfe'}`,
                  color: formData.banner_type === 'update' ? '#166534' : '#1e40af',
                }}>
                  {formData.banner_type === 'update' ? <Megaphone size={18} /> : <Rocket size={18} />}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <strong>{formData.title || 'Title'}</strong>
                    <span style={{ opacity: 0.9 }}>{formData.content || 'Content'}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={handleCancel}>
                  <X size={16} /> Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving || !formData.title.trim() || !formData.content.trim()}
                >
                  <Save size={16} /> {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Banners List */}
      {banners.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
            <Megaphone size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
            <p>No banners yet. Create one to announce updates to your visitors.</p>
          </div>
        </div>
      ) : (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#6b7280' }}>Banner</th>
                <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#6b7280' }}>Type</th>
                <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#6b7280' }}>Audience</th>
                <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#6b7280' }}>Status</th>
                <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#6b7280', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {banners.map(banner => (
                <tr key={banner.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div>
                      <strong style={{ fontSize: '14px', color: '#1f2937' }}>{banner.title}</strong>
                      <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0', lineHeight: 1.4 }}>
                        {banner.content.length > 100 ? banner.content.substring(0, 100) + '...' : banner.content}
                      </p>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 500,
                      background: banner.banner_type === 'update' ? '#f0fdf4' : '#eff6ff',
                      color: banner.banner_type === 'update' ? '#166534' : '#1e40af',
                    }}>
                      {banner.banner_type === 'update' ? <Megaphone size={12} /> : <Rocket size={12} />}
                      {banner.banner_type === 'update' ? 'Update' : 'Coming Soon'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#6b7280' }}>
                    {AUDIENCE_LABEL[banner.audience] || banner.audience || 'Insights only'}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <button
                      onClick={() => handleToggleActive(banner)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '13px', fontWeight: 500,
                        color: banner.is_active ? '#16a34a' : '#9ca3af',
                      }}
                      title={banner.is_active ? 'Click to deactivate' : 'Click to activate'}
                    >
                      {banner.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                      {banner.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleEdit(banner)}
                        style={{ padding: '6px 12px', fontSize: '13px' }}
                      >
                        <Edit2 size={14} /> Edit
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleDelete(banner)}
                        style={{ padding: '6px 12px', fontSize: '13px', color: '#dc2626' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
};

export default BannerManagement;
