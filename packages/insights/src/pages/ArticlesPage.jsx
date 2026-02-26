// src/pages/ArticlesPage.jsx - Public article listing
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Calendar, Eye, Heart, MessageCircle, Tag, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { usePublicAuth } from '../contexts/PublicAuthContext';
import SiteHeader from '../components/SiteHeader';
import AuthModal from '../components/auth/AuthModal';
import articleService from '../services/articleService';
import './ArticlesPage.css';

function ArticlesPage() {
  const { isAuthenticated } = usePublicAuth();
  const [articles, setArticles] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const page = parseInt(searchParams.get('page') || '1', 10);
  const tag = searchParams.get('tag') || '';
  const region = searchParams.get('region') || '';
  const search = searchParams.get('search') || '';
  const pageSize = 12;

  useEffect(() => {
    const fetchArticles = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = { page, page_size: pageSize };
        if (tag) params.tag = tag;
        if (region) params.region = region;
        if (search) params.search = search;
        const data = await articleService.list(params);
        setArticles(data.items);
        setTotal(data.total);
      } catch (err) {
        setError(err.message || 'Failed to load articles');
      } finally {
        setLoading(false);
      }
    };
    fetchArticles();
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
    <div className="articles-page">
      {/* Shared site header */}
      <SiteHeader
        subtitle="Articles and Insights"
        onSignInClick={() => setAuthModalOpen(true)}
      />

      {/* Filters */}
      <div className="articles-filters">
        <div className="articles-filters-inner">
          <div className="articles-search">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search articles..."
              value={search}
              onChange={(e) => updateParam('search', e.target.value)}
            />
          </div>
          {(tag || region || search) && (
            <button
              className="articles-clear-filters"
              onClick={() => setSearchParams({})}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <main className="articles-content">
        {loading ? (
          <div className="articles-loading">
            <RefreshCw className="spin" size={24} />
            <p>Loading articles...</p>
          </div>
        ) : error ? (
          <div className="articles-error">
            <p>{error}</p>
          </div>
        ) : articles.length === 0 ? (
          <div className="articles-empty">
            <p>No articles found. Check back soon for new content.</p>
          </div>
        ) : (
          <>
            <div className="articles-grid">
              {articles.map((article) => (
                <Link
                  key={article.id}
                  to={`/articles/${article.slug}`}
                  className="article-card"
                >
                  {(article.thumbnail_url || article.featured_image_url) && (
                    <div className="article-card-image">
                      <img
                        src={article.thumbnail_url || article.featured_image_url}
                        alt={article.featured_image_alt || article.title}
                        loading="lazy"
                      />
                      {article.content_access_tier === 'pro' && (
                        <span className="article-card-badge pro">Pro</span>
                      )}
                    </div>
                  )}
                  <div className="article-card-body">
                    {article.tags && article.tags.length > 0 && (
                      <div className="article-card-tags">
                        {article.tags.slice(0, 3).map((t) => (
                          <span key={t} className="article-tag">{t}</span>
                        ))}
                      </div>
                    )}
                    <h2 className="article-card-title">{article.title}</h2>
                    {article.excerpt && (
                      <p className="article-card-excerpt">{article.excerpt}</p>
                    )}
                    <div className="article-card-meta">
                      <span className="article-meta-item">
                        <Calendar size={14} />
                        {formatDate(article.published_at)}
                      </span>
                      <span className="article-meta-item">
                        <Eye size={14} />
                        {article.view_count}
                      </span>
                      <span className="article-meta-item">
                        <Heart size={14} />
                        {article.like_count}
                      </span>
                      <span className="article-meta-item">
                        <MessageCircle size={14} />
                        {article.comment_count}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="articles-pagination">
                <button
                  disabled={page <= 1}
                  onClick={() => updateParam('page', String(page - 1))}
                >
                  <ChevronLeft size={16} /> Previous
                </button>
                <span className="articles-pagination-info">
                  Page {page} of {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => updateParam('page', String(page + 1))}
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Auth Modal */}
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} context="header" />
    </div>
  );
}

export default ArticlesPage;
