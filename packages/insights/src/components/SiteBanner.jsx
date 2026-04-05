// packages/insights/src/components/SiteBanner.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Megaphone, Rocket, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { getActiveBanners } from '../services/bannerService';
import './SiteBanner.css';

const HIDDEN_KEY = 'hidden_banners';
const ROTATE_INTERVAL = 12000;
const PAUSE_AFTER_INTERACT = 30000;
const SWIPE_THRESHOLD = 50;

const SiteBanner = () => {
  const [banners, setBanners] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [slideClass, setSlideClass] = useState('banner-slide-active');
  const [expandedBanner, setExpandedBanner] = useState(null);
  const [hidden, setHidden] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]');
    } catch {
      return [];
    }
  });

  // Pause auto-rotate on user interaction
  const pausedUntil = useRef(0);

  // Touch swipe state
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getActiveBanners();
        setBanners(data.banners || []);
      } catch (err) {
        console.error('Failed to load banners:', err);
      }
    };
    load();
  }, []);

  const visibleBanners = banners.filter(b => !hidden.includes(b.id));

  const goToSlide = useCallback((index) => {
    setSlideClass('banner-slide-exit');
    setTimeout(() => {
      setActiveIndex(index);
      setSlideClass('banner-slide-enter');
      setTimeout(() => setSlideClass('banner-slide-active'), 50);
    }, 300);
  }, []);

  const pauseAutoRotate = useCallback(() => {
    pausedUntil.current = Date.now() + PAUSE_AFTER_INTERACT;
  }, []);

  const goNext = useCallback(() => {
    if (visibleBanners.length <= 1) return;
    pauseAutoRotate();
    goToSlide((activeIndex + 1) % visibleBanners.length);
  }, [activeIndex, visibleBanners.length, goToSlide, pauseAutoRotate]);

  const goPrev = useCallback(() => {
    if (visibleBanners.length <= 1) return;
    pauseAutoRotate();
    goToSlide((activeIndex - 1 + visibleBanners.length) % visibleBanners.length);
  }, [activeIndex, visibleBanners.length, goToSlide, pauseAutoRotate]);

  // Auto-rotate (respects pause)
  useEffect(() => {
    if (visibleBanners.length <= 1) return;

    const timer = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      goToSlide((activeIndex + 1) % visibleBanners.length);
    }, ROTATE_INTERVAL);

    return () => clearInterval(timer);
  }, [activeIndex, visibleBanners.length, goToSlide]);

  // Reset index if banners change
  useEffect(() => {
    if (activeIndex >= visibleBanners.length) {
      setActiveIndex(0);
    }
  }, [visibleBanners.length, activeIndex]);

  const handleHide = (id) => {
    const updated = [...hidden, id];
    setHidden(updated);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(updated));
    setActiveIndex(0);
    setSlideClass('banner-slide-active');
  };

  // Touch swipe handlers for mobile
  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (touchStartX.current === null || visibleBanners.length <= 1) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD) {
      pauseAutoRotate();
      if (deltaX < 0) {
        goToSlide((activeIndex + 1) % visibleBanners.length);
      } else {
        goToSlide((activeIndex - 1 + visibleBanners.length) % visibleBanners.length);
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }, [activeIndex, visibleBanners.length, goToSlide, pauseAutoRotate]);

  // Expand banner detail
  const handleBannerClick = useCallback((banner) => {
    pauseAutoRotate();
    setExpandedBanner(banner);
  }, [pauseAutoRotate]);

  const closeExpanded = useCallback(() => {
    setExpandedBanner(null);
  }, []);

  if (visibleBanners.length === 0) return null;

  const currentBanner = visibleBanners[activeIndex];
  if (!currentBanner) return null;

  const hasMultiple = visibleBanners.length > 1;
  const BannerIcon = currentBanner.banner_type === 'update' ? Megaphone : Rocket;

  return (
    <>
      <div
        className="site-banners"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="banner-carousel">
          {/* Prev arrow — desktop only */}
          {hasMultiple && (
            <button className="banner-arrow banner-arrow-prev" onClick={goPrev} aria-label="Previous banner">
              <ChevronLeft size={16} />
            </button>
          )}

          <div
            key={currentBanner.id}
            className={`site-banner site-banner-${currentBanner.banner_type} ${slideClass}`}
            onClick={() => handleBannerClick(currentBanner)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleBannerClick(currentBanner)}
          >
            <div className="banner-icon">
              <BannerIcon size={16} />
            </div>
            <div className="banner-content">
              <strong className="banner-title">{currentBanner.title}</strong>
              <span className="banner-text">{currentBanner.content}</span>
            </div>
          </div>

          {/* Next arrow — desktop only */}
          {hasMultiple && (
            <button className="banner-arrow banner-arrow-next" onClick={goNext} aria-label="Next banner">
              <ChevronRight size={16} />
            </button>
          )}
        </div>

        {/* Dots — desktop only (hidden on mobile via CSS) */}
        {hasMultiple && (
          <div className="banner-dots">
            {visibleBanners.map((_, i) => (
              <button
                key={i}
                className={`banner-dot ${i === activeIndex ? 'active' : ''}`}
                onClick={() => { pauseAutoRotate(); goToSlide(i); }}
                aria-label={`Banner ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Expanded banner modal */}
      {expandedBanner && (
        <div className="banner-modal-overlay" onClick={closeExpanded}>
          <div className="banner-modal" onClick={(e) => e.stopPropagation()}>
            <button className="banner-modal-close" onClick={closeExpanded} aria-label="Close">
              <X size={20} />
            </button>
            <div className={`banner-modal-icon banner-modal-icon-${expandedBanner.banner_type}`}>
              {expandedBanner.banner_type === 'update' ? <Megaphone size={24} /> : <Rocket size={24} />}
            </div>
            <h3 className={`banner-modal-title banner-modal-title-${expandedBanner.banner_type}`}>
              {expandedBanner.title}
            </h3>
            <p className="banner-modal-content">{expandedBanner.content}</p>
          </div>
        </div>
      )}
    </>
  );
};

export default SiteBanner;
