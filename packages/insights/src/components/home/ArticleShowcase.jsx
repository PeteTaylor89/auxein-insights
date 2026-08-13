// components/home/ArticleShowcase.jsx — the articles rail on the home page.
//
// This is the ORIGINAL landing-page carousel, extracted into a component
// unchanged. Markup, class names and CSS are deliberately identical to what
// shipped before so it feels and behaves exactly as it did — the only changes
// are the heading ("Articles" / "From our contributors") and its position on
// the page, which is where the extra prominence comes from.
//
// Do not "improve" the card mechanics here without a reason. In particular the
// image is a fixed 180px box with overflow hidden, NOT an aspect-ratio box: a
// portrait image in an aspect-ratio container escapes its bounds inside a
// column flex card, which is exactly the overflow this replaced.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './ArticleShowcase.css';

function ArticleShowcase({ articles = [] }) {
  const carouselRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateCarouselArrows = useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el || articles.length === 0) return undefined;
    updateCarouselArrows();
    el.addEventListener('scroll', updateCarouselArrows, { passive: true });
    const ro = new ResizeObserver(updateCarouselArrows);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateCarouselArrows); ro.disconnect(); };
  }, [articles, updateCarouselArrows]);

  const scrollCarousel = useCallback((dir) => {
    const el = carouselRef.current;
    if (!el) return;
    const card = el.querySelector('.carousel-article-card');
    const distance = card ? card.offsetWidth + 20 : 340;
    el.scrollBy({ left: dir * distance, behavior: 'smooth' });
  }, []);

  if (!articles.length) return null;

  return (
    <section className="latest-articles-section" aria-labelledby="article-showcase-heading">
      <div className="article-showcase__header">
        <div className="article-showcase__titles">
          <h2 id="article-showcase-heading">Articles</h2>
          <p>From our contributors</p>
        </div>
      </div>

      <div className="articles-carousel-wrapper">
        {canScrollLeft && (
          <button
            className="carousel-arrow carousel-arrow-prev"
            onClick={() => scrollCarousel(-1)}
            aria-label="Previous articles"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="articles-carousel" ref={carouselRef}>
          <div className="articles-carousel-track">
            {articles.map((article) => (
              <Link
                key={article.id}
                to={`/articles/${article.slug}`}
                className="carousel-article-card"
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
              </Link>
            ))}
          </div>
        </div>
        {canScrollRight && (
          <button
            className="carousel-arrow carousel-arrow-next"
            onClick={() => scrollCarousel(1)}
            aria-label="Next articles"
          >
            <ChevronRight size={20} />
          </button>
        )}
      </div>

      <div className="articles-carousel-footer">
        <Link to="/articles" className="view-all-articles-btn">
          View all articles
        </Link>
      </div>
    </section>
  );
}

export default ArticleShowcase;
