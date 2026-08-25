// src/pages/ResearchListing.jsx - the full research listing.
//
// NOT ROUTED as of 2026-08-13: /research serves ResearchPage, a placeholder,
// until the research programme is ready to publish. Kept intact rather than
// deleted so restoring it is a one-line route change, not an archaeology dig.
// /research/:slug still routes to ResearchDetail and must keep working — those
// URLs are RSS <guid>s.
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Calendar, Eye, Heart, Users, ChevronLeft, ChevronRight, RefreshCw, BookOpen } from 'lucide-react';
import researchService from '../services/researchService';
import './ResearchPage.css';

function ResearchListing() {
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const page = parseInt(searchParams.get('page') || '1', 10);
  const tag = searchParams.get('tag') || '';
  const region = searchParams.get('region') || '';
  const search = searchParams.get('search') || '';
  const pageSize = 12;

  useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = { page, page_size: pageSize };
        if (tag) params.tag = tag;
        if (region) params.region = region;
        if (search) params.search = search;
        const data = await researchService.list(params);
        setReports(data.items);
        setTotal(data.total);
      } catch (err) {
        setError(err.message || 'Failed to load research');
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, [page, tag, region, search]);

  const totalPages = Math.ceil(total / pageSize);

  const updateParam = (key, value) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    if (key !== 'page') params.delete('page');
    setSearchParams(params);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-NZ', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  };

  return (
    <div className="research-page">
      <header className="research-header">
        <div className="research-header-content">
          <Link to="/" className="research-back-link">
            <ChevronLeft size={16} /> Back to Auxein Insights
          </Link>
          <h1>Research Portal</h1>
          <p>In-depth research reports and data analysis for New Zealand viticulture.</p>
        </div>
      </header>

      <div className="research-filters">
        <div className="research-filters-inner">
          <div className="research-search">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search research..."
              value={search}
              onChange={(e) => updateParam('search', e.target.value)}
            />
          </div>
          {(tag || region || search) && (
            <button className="research-clear-filters" onClick={() => setSearchParams({})}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      <main className="research-content">
        {loading ? (
          <div className="research-loading">
            <RefreshCw className="spin" size={24} />
            <p>Loading research...</p>
          </div>
        ) : error ? (
          <div className="research-error"><p>{error}</p></div>
        ) : reports.length === 0 ? (
          <div className="research-empty"><p>No research reports found.</p></div>
        ) : (
          <>
            <div className="research-list">
              {reports.map((report) => (
                <Link key={report.id} to={`/research/${report.slug}`} className="research-card">
                  <div className="research-card-icon">
                    <BookOpen size={24} />
                  </div>
                  <div className="research-card-body">
                    {report.tags && report.tags.length > 0 && (
                      <div className="research-card-tags">
                        {report.tags.slice(0, 3).map((t) => (
                          <span key={t} className="research-tag">{t}</span>
                        ))}
                      </div>
                    )}
                    <h2 className="research-card-title">{report.title}</h2>
                    <p className="research-card-abstract">{report.abstract}</p>
                    <div className="research-card-meta">
                      {report.authors && report.authors.length > 0 && (
                        <span className="research-meta-item">
                          <Users size={14} /> {report.authors.join(', ')}
                        </span>
                      )}
                      <span className="research-meta-item">
                        <Calendar size={14} /> {formatDate(report.published_at)}
                      </span>
                      <span className="research-meta-item">
                        <Eye size={14} /> {report.view_count}
                      </span>
                      <span className="research-meta-item">
                        <Heart size={14} /> {report.like_count}
                      </span>
                    </div>
                    {report.content_access_tier === 'pro' && (
                      <span className="research-badge-pro">Pro</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="research-pagination">
                <button disabled={page <= 1} onClick={() => updateParam('page', String(page - 1))}>
                  <ChevronLeft size={16} /> Previous
                </button>
                <span>Page {page} of {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => updateParam('page', String(page + 1))}>
                  Next <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default ResearchListing;
