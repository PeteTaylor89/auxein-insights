// src/hooks/useArticleTracking.js - Track article read depth + time
import { useEffect, useRef } from 'react';
import { queueEvent } from '../utils/eventTracker';

/**
 * Track scroll depth and time spent on an article/research page.
 * Fires `article_read` when user passes 75% scroll depth.
 * Fires `article_view_end` on unmount with final stats.
 *
 * @param {number|null} contentId - Article or research report ID
 * @param {React.RefObject} contentRef - Ref to the scrollable content container
 * @param {string} contentType - 'article' or 'research'
 */
export default function useArticleTracking(contentId, contentRef, contentType = 'article') {
  const startTime = useRef(Date.now());
  const maxDepth = useRef(0);
  const readFired = useRef(false);

  useEffect(() => {
    if (!contentId || !contentRef?.current) return;

    startTime.current = Date.now();
    maxDepth.current = 0;
    readFired.current = false;

    // Fire immediate view event
    queueEvent(`${contentType}_view`, { content_id: contentId });

    const thresholds = [0.25, 0.5, 0.75, 1.0];
    const sentinels = [];
    const container = contentRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const depth = parseFloat(entry.target.dataset.depth);
          if (depth > maxDepth.current) {
            maxDepth.current = depth;
          }

          // Fire article_read at 75%
          if (depth >= 0.75 && !readFired.current) {
            readFired.current = true;
            queueEvent(`${contentType}_read`, {
              content_id: contentId,
              scroll_depth: maxDepth.current,
              time_spent_sec: Math.round((Date.now() - startTime.current) / 1000),
            });
          }
        });
      },
      { threshold: 0 }
    );

    // Create sentinel divs at each threshold
    thresholds.forEach((t) => {
      const el = document.createElement('div');
      el.dataset.depth = t;
      el.style.cssText = 'height:1px;width:100%;pointer-events:none;position:absolute;left:0;';
      el.style.top = `${t * 100}%`;
      container.style.position = 'relative';
      container.appendChild(el);
      observer.observe(el);
      sentinels.push(el);
    });

    return () => {
      observer.disconnect();
      sentinels.forEach((el) => el.remove());

      // Fire view_end on unmount
      queueEvent(`${contentType}_view_end`, {
        content_id: contentId,
        max_scroll_depth: maxDepth.current,
        time_spent_sec: Math.round((Date.now() - startTime.current) / 1000),
      });
    };
  }, [contentId, contentRef, contentType]);
}
