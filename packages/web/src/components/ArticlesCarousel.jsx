// components/ArticlesCarousel.jsx — Latest public articles carousel.
// Single source of truth shared by Home and Insights. Styles live in index.css
// (.articles-section / .articles-carousel / .carousel-article-card …).
import { useEffect, useState } from 'react';
import { api } from '@vineyard/shared';

const INSIGHTS_URL = import.meta.env.VITE_INSIGHTS_URL || 'https://insights.auxein.co.nz';

/**
 * @param {string|null} title  Section heading. Pass null to omit (e.g. when the
 *                             parent panel already shows a title).
 * @param {number} pageSize    How many articles to fetch (default 6).
 */
function ArticlesCarousel({ title = 'Latest from Auxein Insights', pageSize = 6 }) {
  const [articles, setArticles] = useState([]);

  useEffect(() => {
    api.get('/v1/public/articles', { params: { page: 1, page_size: pageSize } })
      .then(res => setArticles(res.data?.items || []))
      .catch(() => {});
  }, [pageSize]);

  if (articles.length === 0) return null;

  return (
    <div className="articles-section">
      {title && (
        <div className="container-title">
          <span>{title}</span>
        </div>
      )}
      <div className="articles-carousel">
        <div className="articles-carousel-track">
          {articles.map((article) => (
            <a
              key={article.id}
              href={`${INSIGHTS_URL}/articles/${article.slug}`}
              className="carousel-article-card"
              target="_blank"
              rel="noopener noreferrer"
            >
              {(article.thumbnail_url || article.featured_image_url) && (
                <div className="carousel-card-image">
                  <img
                    src={article.thumbnail_url || article.featured_image_url}
                    alt={article.featured_image_alt || article.title}
                    loading="lazy"
                  />
                </div>
              )}
              <div className="carousel-card-body">
                {article.tags && article.tags.length > 0 && (
                  <div className="carousel-card-tags">
                    {article.tags.slice(0, 2).map((t) => (
                      <span key={t} className="carousel-tag">{t}</span>
                    ))}
                  </div>
                )}
                <h3 className="carousel-card-title">{article.title}</h3>
                {article.excerpt && (
                  <p className="carousel-card-excerpt">{article.excerpt}</p>
                )}
                <span className="carousel-card-date">
                  {article.published_at
                    ? new Date(article.published_at).toLocaleDateString('en-NZ', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      })
                    : ''}
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
      <div className="articles-carousel-footer">
        <a
          href={`${INSIGHTS_URL}/articles`}
          className="btn-ghost"
          target="_blank"
          rel="noopener noreferrer"
        >
          View all articles
        </a>
      </div>
    </div>
  );
}

export default ArticlesCarousel;
