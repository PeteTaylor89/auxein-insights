// src/pages/admin/AdminResearchList.jsx - Admin research management
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Edit, Archive, Eye, RefreshCw, BookOpen } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import researchService from '../../services/researchService';

function AdminResearchList() {
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const pageSize = 20;

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = { page, page_size: pageSize };
      if (statusFilter) params.status = statusFilter;
      const data = await researchService.adminList(params);
      setReports(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, [page, statusFilter]);

  const handleArchive = async (id) => {
    if (!confirm('Archive this research report?')) return;
    try {
      await researchService.archive(id);
      fetchReports();
    } catch (err) {
      alert(err.message);
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

  const statusBadge = (status) => {
    const colors = { draft: '#6b7280', published: '#059669', archived: '#ef4444' };
    return (
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500,
        background: `${colors[status] || '#6b7280'}15`, color: colors[status] || '#6b7280'
      }}>
        {status}
      </span>
    );
  };

  return (
    <AdminLayout title="Research Reports" subtitle={`${total} total reports`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {['', 'draft', 'published', 'archived'].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              style={{
                padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid #d1d5db',
                background: statusFilter === s ? '#059669' : 'white',
                color: statusFilter === s ? 'white' : '#374151',
                fontSize: '0.8rem', cursor: 'pointer'
              }}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
        <Link
          to="/admin/research/new"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem',
            background: '#059669', color: 'white', borderRadius: '6px', textDecoration: 'none', fontSize: '0.875rem'
          }}
        >
          <Plus size={16} /> New Report
        </Link>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : error ? (
        <div style={{ color: '#ef4444', textAlign: 'center', padding: '2rem' }}>{error}</div>
      ) : (
        <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Title</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Authors</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Tier</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Views</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Published</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 500, maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#6b7280', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(r.authors || []).join(', ')}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>{statusBadge(r.status)}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#6b7280' }}>{r.content_access_tier}</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{r.view_count}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#6b7280' }}>{formatDate(r.published_at)}</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      {r.status === 'published' && (
                        <Link to={`/research/${r.slug}`} style={{ color: '#6b7280' }} title="View"><Eye size={16} /></Link>
                      )}
                      <Link to={`/admin/research/${r.id}/edit`} style={{ color: '#059669' }} title="Edit"><Edit size={16} /></Link>
                      {r.status !== 'archived' && (
                        <button onClick={() => handleArchive(r.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }} title="Archive"><Archive size={16} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {total > pageSize && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', padding: '1rem', borderTop: '1px solid #f3f4f6' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                style={{ padding: '0.4rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white', fontSize: '0.8rem', cursor: 'pointer' }}>Previous</button>
              <span style={{ fontSize: '0.875rem', color: '#6b7280', alignSelf: 'center' }}>Page {page} of {Math.ceil(total / pageSize)}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / pageSize)}
                style={{ padding: '0.4rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white', fontSize: '0.8rem', cursor: 'pointer' }}>Next</button>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}

export default AdminResearchList;
