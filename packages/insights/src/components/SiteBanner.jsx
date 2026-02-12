// packages/insights/src/components/SiteBanner.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { X, Megaphone, Rocket } from 'lucide-react';
import { getActiveBanners } from '../services/bannerService';
import './SiteBanner.css';

const HIDDEN_KEY = 'hidden_banners';
const ROTATE_INTERVAL = 20000;

const SiteBanner = () => {
  const [banners, setBanners] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [slideClass, setSlideClass] = useState('banner-slide-active');
  const [hidden, setHidden] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]');
    } catch {
      return [];
    }
  });

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

  // Auto-rotate
  useEffect(() => {
    if (visibleBanners.length <= 1) return;

    const timer = setInterval(() => {
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

  if (visibleBanners.length === 0) return null;

  const currentBanner = visibleBanners[activeIndex];
  if (!currentBanner) return null;

  return (
    <div className="site-banners">
      <div
        key={currentBanner.id}
        className={`site-banner site-banner-${currentBanner.banner_type} ${slideClass}`}
      >
        <div className="banner-icon">
          {currentBanner.banner_type === 'update' ? <Megaphone size={16} /> : <Rocket size={16} />}
        </div>
        <div className="banner-content">
          <strong>{currentBanner.title}</strong>
          <span>{currentBanner.content}</span>
        </div>

      </div>

      {visibleBanners.length > 1 && (
        <div className="banner-dots">
          {visibleBanners.map((_, i) => (
            <button
              key={i}
              className={`banner-dot ${i === activeIndex ? 'active' : ''}`}
              onClick={() => goToSlide(i)}
              aria-label={`Banner ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SiteBanner;
