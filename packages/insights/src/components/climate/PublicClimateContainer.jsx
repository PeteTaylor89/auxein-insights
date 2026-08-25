// packages/insights/src/components/climate/PublicClimateContainer.jsx
/**
 * PublicClimateContainer Component (Updated with View Tabs + Analytics)
 * 
 * Main wrapper for public climate features including:
 * - Current Season: Live climate data with GDD progress
 * - Phenology: Growth stage estimates and harvest predictions  
 * - Disease Pressure: Risk indicators and recommendations
 * - Climate History: Historical season explorer
 * - Climate Projections: Future SSP projections
 * 
 * Now includes Umami analytics tracking for:
 * - View opens/closes with duration
 * - Tab switches
 * - Zone selections
 * - About modal opens
 */

import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import '../../utils/chartDefaults'; // compact Chart.js legends app-wide (side-effect)
import {
  X, Info, CloudSunRain, Grape,
  ShieldCheck, History, ChartSpline, Loader
} from 'lucide-react';
import { ClimateErrorBoundary } from './ClimateErrorCard';

// Current season, phenology and disease pressure were REMOVED from this
// container on 2026-08-24: all three now live on the regional dashboard, which
// is the default view of a region page. Leaving them lazy-imported here would
// have kept three chunks in the build that nothing routes to.
//
// The explorer components themselves are NOT deleted — `ClimateWidgetRenderer`
// still renders the same models inside articles, and the widgets are a separate
// contract from this navigator.
const SeasonExplorer = lazy(() => import('./SeasonExplorer'));
const ProjectionsExplorer = lazy(() => import('./ProjectionsExplorer'));
import { 
  trackClimateViewOpened, 
  trackClimateViewChanged,
  trackClimateZoneSelected,
  cleanupClimateTracking 
} from '../../utils/analytics';
import './PublicClimate.css';
import './RealtimeClimate.css';
import './climate-mobile-responsive.css';
// The two surviving explorers, restyled to the site's card idiom. An OVERRIDE
// over PublicClimate.css rather than a replacement for it: that file is
// injected app-wide and the article widgets have no stylesheet of their own,
// so deleting it would strip every widget inside a published article.
// Deliberately BEFORE the guardrails, which own the mobile cascade.
import './climate-explorer.css';
import './climate-mobile-guardrails.css'; // must stay LAST — wins the mobile cascade
import { getZone } from '../../services/publicClimateService';

const VIEW_CONFIG = {
  seasons: {
    label: 'Climate History',
    shortLabel: 'History',
    description: 'Historical growing season analysis',
    component: SeasonExplorer,
    allowComparison: true,
    useRealtimeSelector: false,
    icon: History,
  },
  projections: {
    label: 'Future Projections',
    shortLabel: 'Projections',
    description: 'SSP climate scenarios to 2100',
    component: ProjectionsExplorer,
    allowComparison: false,
    useRealtimeSelector: false,
    icon: ChartSpline,
  },
};

// Two views. The other three moved to the regional dashboard overview, which
// renders them tighter and without a tab strip.
const VIEW_ORDER = ['seasons', 'projections'];

const PublicClimateContainer = ({
  initialView = 'seasons',
  initialZoneSlug = null,
  onClose,
  demoMode = false,
  onAuthRequired,
}) => {
  const [selectedZone, setSelectedZone] = useState(null);
  // Regional comparison is MOTHBALLED (2026-08-24). The picker is gone and
  // nothing can populate this, so it stays as a frozen empty array: the
  // explorers still accept the prop and their comparison branches simply never
  // fire. Removing those branches outright would be a few hundred lines of
  // change to code that works — this turns the feature off at its entry point,
  // which is what "mothball" means.
  const comparisonZones = [];
  const [activeView, setActiveView] = useState(initialView);
  const tabsRef = useRef(null);
  const previousViewRef = useRef(null);

  // Track initial view open on mount
  useEffect(() => {
    trackClimateViewOpened(initialView);
    previousViewRef.current = initialView;
    
    // Cleanup: track view close when component unmounts
    return () => {
      cleanupClimateTracking(previousViewRef.current);
    };
  }, []);

  // Sync internal state when initialView prop changes (fixes the multi-click issue)
  useEffect(() => {
    if (initialView !== activeView) {
      // Track the view change from prop update
      trackClimateViewChanged(initialView, previousViewRef.current);
      previousViewRef.current = initialView;
      setActiveView(initialView);
    }
  }, [initialView]);

  // Auto-select zone from initialZoneSlug prop (e.g. /regions/:slug, or a
  // deep-link from the map).
  //
  // THIS IS AUTHORITATIVE AND IT IS A RACE IF IT IS NOT. `getZone` is async,
  // so between mount and its resolution `selectedZone` is null — and
  // `ZoneSelectorRealtime` mounts in that window and will pick the first zone
  // with data (Northland) unless it is told not to. Whoever wrote first used
  // to win, and the loser failed silently, so /regions/marlborough would
  // render Northland whenever the zones list came back first, whenever
  // `getZone` was slow, and always when it threw.
  //
  // `zoneResolving` closes the window: while a zone of ours is outstanding the
  // selector does not auto-select at all. It is released on FAILURE too — a
  // 404 on the slug must fall back to the selector's default rather than
  // leaving the page with no zone forever, which is why the selector treats
  // `autoSelect` flipping true as a fresh chance to choose rather than as a
  // one-shot decision taken at mount.
  //
  // The demo path below is the same race with a different destination: it
  // resolves 'waipara' asynchronously, and `handleZoneChange` REJECTS any
  // other zone in demo mode by opening the auth modal — so losing the race
  // there did not show the wrong region, it threw a sign-up modal at a visitor
  // who had not touched anything.
  const [zoneResolving, setZoneResolving] = useState(
    Boolean(initialZoneSlug) || Boolean(demoMode),
  );

  useEffect(() => {
    if (!initialZoneSlug) { setZoneResolving(false); return undefined; }

    let live = true;
    setZoneResolving(true);
    (async () => {
      try {
        const zone = await getZone(initialZoneSlug);
        if (!live) return;
        // Set unconditionally: the slug in the URL is the request, and a zone
        // that arrived from anywhere else in the meantime is not it.
        setSelectedZone({
          id: zone.id,
          name: zone.name,
          slug: zone.slug,
          region_name: zone.region_name,
        });
      } catch (err) {
        console.error('Failed to load initial zone:', err);
      } finally {
        if (live) setZoneResolving(false);
      }
    })();

    return () => { live = false; };
  }, [initialZoneSlug]);

  // Auto-select Waipara in demo mode (skipped when a deep-link zone is provided)
  useEffect(() => {
    if (demoMode && !selectedZone && !initialZoneSlug) {
      const loadDemoZone = async () => {
        try {
          const zone = await getZone('waipara');
          setSelectedZone({
            id: zone.id,
            name: zone.name,
            slug: zone.slug,
            region_name: zone.region_name || 'North Canterbury',
          });
        } catch (err) {
          console.error('Failed to load demo zone:', err);
          // Fallback - set minimal zone so UI isn't broken
          setSelectedZone({ name: 'Waipara', slug: 'waipara', region_name: 'North Canterbury' });
        } finally {
          // Both branches above end with a zone set, so the selector can be
          // released either way.
          setZoneResolving(false);
        }
      };
      loadDemoZone();
    }
  }, [demoMode, initialZoneSlug]);

  const currentViewConfig = VIEW_CONFIG[activeView] || VIEW_CONFIG.seasons;
  const ContentComponent = currentViewConfig.component;
  // The winter-holding branch went with the three season views on 2026-08-24.
  // `seasonGated` was only ever set on current-season, phenology and disease;
  // with those gone `showWinterHolding` could never be true again, and an
  // unreachable branch that looks live is worse than no branch.
  // `WinterHoldingPage` itself is kept — the overview will want the same idea
  // when a season has not started.

  const handleZoneChange = (zone) => {
    // In demo mode, only allow Waipara - redirect others to auth
    if (demoMode && zone?.slug !== 'waipara') {
      if (onAuthRequired) onAuthRequired();
      return;
    }

    setSelectedZone(zone);

    if (zone) {
      trackClimateZoneSelected(zone.name || zone.slug, activeView);
    }
  };


  // No-op: nothing can change the comparison set while the picker is gone.
  const handleComparisonZonesChange = () => {};

  const handleViewChange = (viewKey) => {
    if (viewKey === activeView) return; // Don't track if same view
    
    // Track the view change with duration of previous view
    trackClimateViewChanged(viewKey, activeView);
    previousViewRef.current = viewKey;
    
    setActiveView(viewKey);
    
    // Scroll tabs into view on mobile if needed
    if (tabsRef.current) {
      const activeTab = tabsRef.current.querySelector(`[data-view="${viewKey}"]`);
      if (activeTab) {
        activeTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  };

  // Render appropriate zone selector based on view type
  // THE ZONE PICKER WAS REMOVED FROM HERE on 2026-08-24.
  //
  // The region page above already carries one (`explore/RegionSelect`), so the
  // explorer was rendering a second picker for the same choice a few hundred
  // pixels below the first. The page owns the region; this component is handed
  // one and renders it.
  //
  // `ZoneSelector` and `ZoneSelectorRealtime` are no longer imported. Both
  // files remain — the realtime one has no caller left at all now that the
  // realtime views are gone.


  // Get attribution text based on view
  const getAttribution = () => {
    if (['currentseason', 'phenology', 'disease'].includes(activeView)) {
      return 'Real-time data from weather station network. Updated daily.';
    }
    return 'Climate Baseline: 1986-2005. Projections: CMIP6 models (SSP1-2.6, SSP2-4.5, SSP3-7.0).';
  };

  return (
    <div className="public-climate-container">
      {/* Header */}
      <div className="climate-header">
        <div className="header-title">
          <h2>{currentViewConfig.label}</h2>
        </div>
        {onClose && (
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <X size={24} />
          </button>
        )}
      </div>

      {/* View Tabs - Scrollable on mobile */}
      <div className="climate-view-tabs-wrapper">
        <div className="climate-view-tabs" ref={tabsRef} role="tablist" aria-label="Climate explorers">
          {VIEW_ORDER.map((viewKey) => {
            const config = VIEW_CONFIG[viewKey];
            const IconComponent = config.icon;
            const isActive = activeView === viewKey;

            return (
              <button
                key={viewKey}
                data-view={viewKey}
                role="tab"
                className={`view-tab ${isActive ? 'active' : ''}`}
                onClick={() => handleViewChange(viewKey)}
                aria-selected={isActive}
                title={config.description}
              >
                <IconComponent size={18} />
                <span className="tab-label-full">{config.label}</span>
                <span className="tab-label-short">{config.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Zone Selector */}



      {/* Demo Mode CTA */}
      {demoMode && (
        <div className="demo-cta-banner">
          <span>Viewing Waipara demo data</span>
          <button className="demo-cta-btn" onClick={onAuthRequired}>
            Sign up free to explore all regions &rarr;
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="climate-content" role="tabpanel" aria-label={currentViewConfig.label}>
        <ClimateErrorBoundary key={activeView}>
          <Suspense fallback={<div className="climate-explorer-loading"><Loader size={20} className="spin" /> Loading explorer...</div>}>
            <ContentComponent
              zone={selectedZone}
              comparisonZones={comparisonZones}
              onComparisonZonesChange={handleComparisonZonesChange}
            />
          </Suspense>
        </ClimateErrorBoundary>
      </div>

      {/* Data attribution.
          The "About" badge that used to sit beside the view title was retired
          on 2026-08-20 — its five modal views now live on /about, where they
          are one page, linkable and indexable rather than trapped behind a
          button. The link here replaces it: quieter than a badge, but a view
          that cannot reach its own methodology would be a regression. */}
      <div className="climate-attribution">
        <Info size={14} />
        <span>{getAttribution()}</span>
        <Link to="/about" className="climate-attribution__method">
          How this is calculated
        </Link>
      </div>

    </div>
  );
};

export default PublicClimateContainer;