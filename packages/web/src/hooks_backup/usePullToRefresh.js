// src/hooks/usePullToRefresh.js
import { useEffect } from 'react';

export default function usePullToRefresh(onRefresh) {
  useEffect(() => {
    let touchStartY = 0;
    let touchEndY = 0;
    const threshold = 150; // Minimum pull distance
    let isPulling = false;
    
    const touchStart = (e) => {
      // Only activate when at the top of the page
      if (window.scrollY === 0) {
        touchStartY = e.touches[0].clientY;
        isPulling = true;
      }
    };
    
    const touchMove = (e) => {
      if (!isPulling) return;
      
      touchEndY = e.touches[0].clientY;
      const pullDistance = touchEndY - touchStartY;
      
      if (pullDistance > 0) {
        // Prevent default only when pulling down
        e.preventDefault();
        
        // Could add visual indicator here
        document.body.style.marginTop = `${Math.min(pullDistance / 2, 80)}px`;
      }
    };
    
    const touchEnd = () => {
      if (!isPulling) return;
      
      const pullDistance = touchEndY - touchStartY;
      
      if (pullDistance > threshold) {
        onRefresh();
      }
      
      // Reset
      document.body.style.marginTop = '0px';
      isPulling = false;
    };
    
    document.addEventListener('touchstart', touchStart, { passive: false });
    document.addEventListener('touchmove', touchMove, { passive: false });
    document.addEventListener('touchend', touchEnd);
    
    return () => {
      document.removeEventListener('touchstart', touchStart);
      document.removeEventListener('touchmove', touchMove);
      document.removeEventListener('touchend', touchEnd);
    };
  }, [onRefresh]);
}