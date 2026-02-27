// src/pages/admin/AdminEmailCampaignList.jsx - Admin email campaign management
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Edit, BarChart2, RefreshCw, Send } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import emailCampaignService from '../../services/emailCampaignService';

function AdminEmailCampaignList() {
  const [campaigns, setCampaigns] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const pageSize = 20;

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const params = { page, page_size: pageSize };
      if (statusFilter) params.status = statusFilter;
      const data = await emailCampaignService.listCampaigns(params);
      setCampaigns(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCampaigns(); }, [page, statusFilter]);

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

  const statusBadge = (status) => {
    const colors = { draft: '#6b7280', scheduled: '#2563eb', sending: '#f59e0b', sent: '#059669' };
    return (
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500,
        background: `${colors[status] || '#6b7280'}15`, color: colors[status] || '#6b7280'
      }}>
        {status}
      </span>
    );
  };

  const pctDisplay = (count, total) => {
    if (!total) return '-';
    return `${Math.round(count / total * 100)}%`;
  };

  return (
    <AdminLayout title="Email Campaigns" subtitle={`${total} total campaigns`}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {['', 'draft', 'scheduled', 'sending', 'sent'].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              style={{
                padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid #d1d5db',
                background: statusFilter === s ? '#2563eb' : 'white',
                color: statusFilter === s ? 'white' : '#374151',
                fontSize: '0.8rem', cursor: 'pointer'
              }}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
        <Link
          to="/admin/email/new"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem',
            background: '#2563eb', color: 'white', borderRadius: '6px', textDecoration: 'none', fontSize: '0.875rem'
          }}
        >
          <Plus size={16} /> New Campaign
        </Link>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <RefreshCw className="spin" size={24} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : error ? (
        <div style={{ color: '#ef4444', textAlign: 'center', padding: '2rem' }}>{error}</div>
      ) : campaigns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          <Send size={40} style={{ marginBottom: '1rem', opacity: 0.4 }} />
          <p>No campaigns yet. Create your first email campaign.</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Subject</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Sent</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Recipients</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Opens</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Clicks</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 500, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.subject}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>{statusBadge(c.status)}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#6b7280' }}>{formatDate(c.sent_at)}</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{c.recipients_count || '-'}</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{pctDisplay(c.opens_count, c.recipients_count)}</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{pctDisplay(c.clicks_count, c.recipients_count)}</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      {(c.status === 'draft' || c.status === 'scheduled') && (
                        <Link to={`/admin/email/${c.id}/edit`} style={{ color: '#2563eb' }} title="Edit"><Edit size={16} /></Link>
                      )}
                      {c.status === 'sent' && (
                        <Link to={`/admin/email/${c.id}/edit`} style={{ color: '#6b7280' }} title="View stats"><BarChart2 size={16} /></Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {total > pageSize && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', padding: '1rem', borderTop: '1px solid #f3f4f6' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                style={{ padding: '0.4rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white', fontSize: '0.8rem', cursor: 'pointer' }}>
                Previous
              </button>
              <span style={{ fontSize: '0.875rem', color: '#6b7280', alignSelf: 'center' }}>Page {page} of {Math.ceil(total / pageSize)}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / pageSize)}
                style={{ padding: '0.4rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white', fontSize: '0.8rem', cursor: 'pointer' }}>
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}

export default AdminEmailCampaignList;
