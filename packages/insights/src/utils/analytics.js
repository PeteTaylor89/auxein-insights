// src/utils/analytics.js
// Umami analytics helper for tracking custom events
// Docs: https://umami.is/docs/track-events

/**
 * Track a custom event in Umami
 * @param {string} eventName - Name of the event (e.g., 'climate-tool-opened')
 * @param {object} [eventData] - Optional data to attach to the event
 */
export function trackEvent(eventName, eventData = {}) {
  try {
    if (typeof window !== 'undefined' && typeof window.umami !== 'undefined') {
      window.umami.track(eventName, eventData);
    }
  } catch (error) {
    // Silently fail - don't break the app if analytics fails
    console.debug('Analytics tracking failed:', error);
  }
}

// ============================================================================
// Pre-defined event names for consistency
// ============================================================================

export const AnalyticsEvents = {
  // Regional Map interactions
  MAP_BLOCK_CLICKED: 'map-block-clicked',
  MAP_REGION_CLICKED: 'map-region-clicked',
  MAP_GI_CLICKED: 'map-gi-clicked',
  MAP_STYLE_CHANGED: 'map-style-changed',
  MAP_LAYER_TOGGLED: 'map-layer-toggled',
  
  // Climate views (the 5 main tabs)
  CLIMATE_VIEW_OPENED: 'climate-view-opened',
  CLIMATE_VIEW_CLOSED: 'climate-view-closed',
  CLIMATE_VIEW_CHANGED: 'climate-view-changed',
  
  // Climate interactions
  CLIMATE_ZONE_SELECTED: 'climate-zone-selected',
  CLIMATE_ABOUT_OPENED: 'climate-about-opened',
  
  // Report/Feedback
  DATA_ISSUE_REPORTED: 'data-issue-reported',
};

// ============================================================================
// Climate View Tracking
// ============================================================================

// Store for tracking view open times (for duration calculation)
const viewOpenTimes = new Map();

/**
 * Track when a climate view tab is opened/switched to
 * @param {string} viewName - View identifier (currentseason, phenology, disease, seasons, projections)
 * @param {string} [previousView] - The view being switched from (if any)
 */
export function trackClimateViewOpened(viewName, previousView = null) {
  // If switching from another view, track that view's duration
  if (previousView && viewOpenTimes.has(previousView)) {
    trackClimateViewClosed(previousView);
  }
  
  // Record open time for duration tracking
  viewOpenTimes.set(viewName, Date.now());
  
  trackEvent(AnalyticsEvents.CLIMATE_VIEW_OPENED, {
    view: viewName,
    previousView: previousView || 'none',
  });
}

/**
 * Track when a climate view is closed (calculates duration)
 * @param {string} viewName - View identifier
 */
export function trackClimateViewClosed(viewName) {
  const openTime = viewOpenTimes.get(viewName);
  let durationSeconds = null;
  
  if (openTime) {
    durationSeconds = Math.round((Date.now() - openTime) / 1000);
    viewOpenTimes.delete(viewName);
  }
  
  trackEvent(AnalyticsEvents.CLIMATE_VIEW_CLOSED, {
    view: viewName,
    durationSeconds,
  });
}

/**
 * Track view tab change (convenience function combining open tracking with context)
 * @param {string} newView - The view being switched to
 * @param {string} previousView - The view being switched from
 */
export function trackClimateViewChanged(newView, previousView) {
  // Close previous view (records duration)
  if (previousView) {
    trackClimateViewClosed(previousView);
  }
  
  // Open new view
  viewOpenTimes.set(newView, Date.now());
  
  trackEvent(AnalyticsEvents.CLIMATE_VIEW_CHANGED, {
    from: previousView || 'none',
    to: newView,
  });
}

/**
 * Track when About modal is opened
 * @param {string} activeView - Which view the user was on when opening About
 */
export function trackClimateAboutOpened(activeView) {
  trackEvent(AnalyticsEvents.CLIMATE_ABOUT_OPENED, {
    context: activeView,
  });
}

/**
 * Track zone selection in climate tools
 * @param {string} zoneName - Name of the selected zone
 * @param {string} activeView - Which view the selection was made in
 */
export function trackClimateZoneSelected(zoneName, activeView) {
  trackEvent(AnalyticsEvents.CLIMATE_ZONE_SELECTED, {
    zone: zoneName,
    view: activeView,
  });
}

// ============================================================================
// Map Tracking
// ============================================================================

/**
 * Track when a vineyard block is clicked on the map
 * @param {object} block - Block data
 */
export function trackBlockClicked(block) {
  trackEvent(AnalyticsEvents.MAP_BLOCK_CLICKED, {
    region: block.region || 'unknown',
    variety: block.variety || 'unknown',
    hasWinery: !!block.winery,
  });
}

/**
 * Track when a region is clicked on the map
 * @param {string} regionName - Name of the region
 */
export function trackRegionClicked(regionName) {
  trackEvent(AnalyticsEvents.MAP_REGION_CLICKED, {
    region: regionName,
  });
}

/**
 * Track when a GI is clicked on the map
 * @param {string} giName - Name of the GI
 */
export function trackGIClicked(giName) {
  trackEvent(AnalyticsEvents.MAP_GI_CLICKED, {
    gi: giName,
  });
}

/**
 * Track data issue report submission
 * @param {string} issueType - Type of issue reported
 * @param {string} blockRegion - Region of the block
 */
export function trackDataIssueReported(issueType, blockRegion) {
  trackEvent(AnalyticsEvents.DATA_ISSUE_REPORTED, {
    issueType,
    region: blockRegion || 'unknown',
  });
}

// ============================================================================
// Cleanup helper (call on component unmount)
// ============================================================================

/**
 * Clean up any open view tracking (call when climate container unmounts)
 * @param {string} currentView - The view that was active when unmounting
 */
export function cleanupClimateTracking(currentView) {
  if (currentView) {
    trackClimateViewClosed(currentView);
  }
  viewOpenTimes.clear();
}