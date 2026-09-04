// components/surfaces/ArticleSurfaceMap.jsx — a climate surface inside an article.
//
// The third size of surface map, and deliberately its own component rather than
// a prop on either of the other two:
//
//   MiniSurfaceMap  non-interactive teaser, one job: get the visitor to /map
//   ArticleSurfaceMap  ONE pinned step, pannable, clickable for a value
//   SurfaceMap  the Atlas: every layer, every step, zones, playback, projections
//
// What makes this one different is that it is EMBEDDED IN PROSE. Three things
// follow from that and none of them are style:
//
// 1. **The step is PINNED, not `latest`.** A paragraph says "the wet February
//    that ended the drought"; a map under it that silently advances to whatever
//    month was published last makes the paragraph wrong without touching it.
//    This is the same failure the 2026-08-23 widget audit found in 24 live
//    charts. `validAt` comes from the author and the inserter writes today's
//    latest step into it at insert time. `followLatest` opts back out, for the
//    rare evergreen article that is ABOUT the newest month.
//
// 2. **No scrollZoom.** A reader scrolls past this map far more often than they
//    interact with it, and a map that swallows the wheel traps the page. Pan and
//    the zoom buttons stay; the wheel belongs to the article.
//
// 3. **The gate is visible BEFORE the click, not after it** — and since
//    2026-09-04 there is only one gate left here. `/probe` runs `_gate_steps`
//    with `enforce_date=False`, so the CADENCE rule applies and the date rule
//    does not: any published MONTHLY step is readable by anyone who can see
//    the tile, signed out included. That change was made for this component.
//    Under the date rule a map pinned to a past month painted for everybody
//    and refused everybody's first click, which reads as broken rather than as
//    an offer.
//
//    What is left is the daily cadence — and `embed` lifts that too. Passing
//    the slug of the published page this map sits in opens the daily surface
//    for the ONE address the page embeds: the server loads the page and checks
//    (`surfaces._embed_grants`), so it is a reference it verifies, not a claim
//    it believes. A map rendered WITHOUT an embed slug — the admin preview of
//    an unsaved draft, say — keeps the Pro gate and says so in the caption
//    before the click rather than after it.
//
//    THE ATLAS IS NOT THE SAME. `/available` still enforces the date rule, so
//    an anonymous scrubber is still one step long. A reader may read a month
//    someone chose for them here; roaming 38 years of them still needs an
//    account. Do not "fix" that asymmetry — it is the design.
//
// THE COLOUR DOMAIN COMES FROM THE SERVER. `available.meta.domain` is a fixed
// per-(variable, statistic) range measured from the archive, and it is stamped
// into the tile URL so a corrected ceiling invalidates a year-long immutable
// cache. A legend derived from the data in view would disagree with the tiles
// it labels. See the header of SurfaceMap for the full reasoning.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Map as MapIcon, MousePointerClick } from 'lucide-react';
import useSurfaceAvailability from '../../hooks/useSurfaceAvailability';
import {
  tileUrlTemplate,
  getProbe,
  stampFor,
  cadenceFor,
  statisticFor,
  SURFACE_VARIABLES,
  DEFAULT_STATISTIC,
} from '../../services/surfaceService';
import {
  statLabel,
  stepLabel,
  unitFor,
  formatProbeValue,
  mapAlive,
  rampGradient,
  legendTickValues,
} from './surfaceLabels';
import AuthModal from '../auth/AuthModal';
import './ArticleSurfaceMap.css';

const NZ_BOUNDS = [[165.8, -47.6], [179.4, -33.9]];

const BASEMAPS = {
  light: 'mapbox://styles/mapbox/light-v11',
  outdoors: 'mapbox://styles/mapbox/outdoors-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
};

const DEFAULT_HEIGHT = 420;
const MIN_HEIGHT = 220;
const MAX_HEIGHT = 900;

/** '174.5,-41.3' -> [174.5, -41.3], or null. */
function parseCentre(value) {
  if (!value) return null;
  const parts = String(value).split(',').map((n) => Number(n.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return null;
  const [lon, lat] = parts;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
  return [lon, lat];
}

function ArticleSurfaceMap({
  variable = 'temp_mean',
  cadence = 'monthly',
  validAt = '',
  statistic,
  followLatest = false,
  height = DEFAULT_HEIGHT,
  centre = '',
  zoom,
  basemap = 'light',
  opacity = 0.85,
  // {article} or {research}: the slug of the PUBLISHED page this map sits in.
  // It is what opens the daily cadence for this one map — the server verifies
  // the page really embeds it, so a wrong or missing slug simply falls back to
  // the ordinary gate rather than failing loudly.
  embed = null,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  // WHERE the reader clicked, and WHAT came back — two states, not one, so the
  // popup does not jump while its value reloads.
  const [probeAt, setProbeAt] = useState(null);
  const [probe, setProbe] = useState(null);

  // A variable's own granularity wins over the author's cadence: the GDD layers
  // are seasonal accumulations with no daily or monthly form, and `cadenceFor`
  // is what stops an author's "daily" from 404-ing every tile on gdd10.
  const granularity = cadenceFor(variable, cadence);
  const displayStatistic = granularity === 'daily'
    ? null
    : (statistic || DEFAULT_STATISTIC[variable] || 'mean');
  // A daily surface HAS no statistic; sending one matches zero rows and reports
  // itself as a missing day. `statisticFor` is the single place that knows.
  const wireStatistic = statisticFor(granularity, displayStatistic);

  const {
    available, latest, unavailable, loading, isStub, access,
  } = useSurfaceAvailability(variable, granularity, wireStatistic);

  const domain = available?.meta?.domain ?? null;
  // The STATISTIC decides the unit, not the variable. `temp_min/frost_days` is
  // a count of days measured off a degree layer, and labelling that legend
  // 'C' is the exact mislabelling `unitFor` exists to stop. Same call the
  // Atlas makes, so the two legends cannot disagree.
  const legendUnit = unitFor(variable, displayStatistic);

  // The step actually drawn. `followLatest` is the opt-out; everything else is
  // the author's pin, normalised through the SAME `stampFor` the tile URL and
  // the probe use so the popup can never quote a number off a different raster.
  const stamp = useMemo(() => {
    if (followLatest) return latest ? stampFor(latest, granularity) : null;
    if (validAt) return stampFor(validAt, granularity);
    return latest ? stampFor(latest, granularity) : null;
  }, [followLatest, validAt, latest, granularity]);

  // CAN THIS READER CLICK FOR A VALUE? One gate, not two: the date rule does
  // not apply to `/probe`, so the pinned step being old is no longer a reason
  // it cannot be read. Only the daily cadence is withheld.
  //
  // Read from the SERVER, never from local auth state — `_withhold_cadence`
  // empties the step list and sets `scope: 'none'`, and it is the one that
  // decided. Null while the catalogue is loading, so a gate never flashes at a
  // Pro reader on the way in.
  const gateKind = useMemo(() => {
    // AN EMBEDDED MAP HAS NO GATE. The server grants this exact address off the
    // published page, daily included, so showing a Pro prompt beside a map the
    // reader can already click would be both wrong and insulting.
    if (isEmbedded) return null;
    if (loading || granularity !== 'daily') return null;
    return access?.scope === 'none' ? 'pro' : null;
  }, [isEmbedded, loading, granularity, access]);

  // Scalars, not the object. A parent that writes `embed={{ article: slug }}`
  // inline hands a new object identity every render, and an effect keyed on it
  // would refetch the probed cell on each one.
  const embedArticle = embed?.article || undefined;
  const embedResearch = embed?.research || undefined;
  const isEmbedded = Boolean(embedArticle || embedResearch);

  const hasToken = Boolean(import.meta.env.VITE_MAPBOX_TOKEN);
  const canRenderMap = hasToken && !unavailable && !mapFailed && Boolean(stamp);

  const tileUrl = useMemo(() => {
    if (!stamp) return null;
    return tileUrlTemplate({
      variable,
      valid_at: stamp,
      granularity,
      statistic: wireStatistic,
      // Stamps the published domain into the URL, so a corrected ceiling
      // changes the cache key by construction rather than by anyone
      // remembering to bump a version.
      domain,
    });
  }, [variable, stamp, granularity, wireStatistic, domain]);

  const startCentre = useMemo(() => parseCentre(centre), [centre]);
  const startZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : null;
  const clampedHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Number(height) || DEFAULT_HEIGHT));

  // --- the map -------------------------------------------------------------
  useEffect(() => {
    if (!canRenderMap || !containerRef.current || mapRef.current) return undefined;

    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
    let map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: BASEMAPS[basemap] || BASEMAPS.light,
        ...(startCentre
          ? { center: startCentre, zoom: startZoom ?? 7 }
          : { bounds: NZ_BOUNDS, fitBoundsOptions: { padding: 12 } }),
        attributionControl: false,
        // See the header: the wheel belongs to the article, not to the map.
        scrollZoom: false,
        // Two fingers to pan on touch, for the same reason — a one-finger drag
        // that starts on the map has to be able to scroll the page past it.
        dragRotate: false,
      });
    } catch (err) {
      console.warn('ArticleSurfaceMap: map failed to initialise', err);
      setMapFailed(true);
      return undefined;
    }

    mapRef.current = map;
    map.on('error', (e) => console.warn('ArticleSurfaceMap:', e?.error?.message || e));
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', () => setMapReady(true));

    return () => {
      setMapReady(false);
      map.remove();
      mapRef.current = null;
    };
    // `basemap`, `startCentre` and `startZoom` are read once at construction on
    // purpose: they are author settings baked into a published article, not
    // reader controls, and rebuilding the map on a change to them would throw
    // away an open popup for no gain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRenderMap]);

  // --- the surface layer ---------------------------------------------------
  // Rebuilt rather than mutated when the address changes. `setTiles` exists but
  // leaves already-loaded tiles from the previous URL on screen until they are
  // evicted, which on a one-step map means the old month can outlive the label
  // describing it.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapAlive(map) || !mapReady || !tileUrl) return undefined;

    const SOURCE = 'article-surface';
    if (map.getLayer(SOURCE)) map.removeLayer(SOURCE);
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);

    map.addSource(SOURCE, {
      type: 'raster',
      tiles: [tileUrl],
      tileSize: 256,
      bounds: [NZ_BOUNDS[0][0], NZ_BOUNDS[0][1], NZ_BOUNDS[1][0], NZ_BOUNDS[1][1]],
      maxzoom: 12,
    });
    map.addLayer({
      id: SOURCE,
      type: 'raster',
      source: SOURCE,
      paint: {
        'raster-opacity': Math.min(1, Math.max(0.2, Number(opacity) || 0.85)),
        'raster-fade-duration': 200,
      },
    });

    return () => {
      if (!mapAlive(map)) return;
      if (map.getLayer(SOURCE)) map.removeLayer(SOURCE);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    };
  }, [mapReady, tileUrl, opacity]);

  // --- probe: click a cell, read its value ---------------------------------
  // CLICK, NOT HOVER, and a server round trip rather than the pixel under the
  // cursor. Both reasons are spelled out in SurfaceMap: `raster-opacity` blends
  // the tile over the basemap, so inverting the colour ramp off the canvas
  // returns plausible numbers with no way to tell they are wrong; and a hover
  // readout would issue one COG range read per mousemove.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapAlive(map) || !mapReady) return undefined;

    // Returning `prev` unchanged makes React bail out, which matters because
    // some touch browsers fire a synthesised `click` after `touchend`.
    const pick = (lngLat) => setProbeAt((prev) => (
      prev
      && Math.abs(prev.lng - lngLat.lng) < 1e-6
      && Math.abs(prev.lat - lngLat.lat) < 1e-6
        ? prev
        : { lng: lngLat.lng, lat: lngLat.lat }));

    const onClick = (e) => pick(e.lngLat);

    // The tap bridge. A `click` handler alone is dead on touch here, so a probe
    // wired only to `click` silently would not work on a phone. The 8 px guard
    // is what stops a drag from registering as a tap wherever it ended.
    let touchStart = null;
    const onTouchStart = (e) => {
      touchStart = e.point ? { x: e.point.x, y: e.point.y } : null;
    };
    const onTouchEnd = (e) => {
      if (!touchStart || !e.point) return;
      const moved = Math.hypot(e.point.x - touchStart.x, e.point.y - touchStart.y);
      touchStart = null;
      if (moved > 8) return;
      pick(e.lngLat);
    };

    map.on('click', onClick);
    map.on('touchstart', onTouchStart);
    map.on('touchend', onTouchEnd);
    return () => {
      if (!mapAlive(map)) return;
      map.off('click', onClick);
      map.off('touchstart', onTouchStart);
      map.off('touchend', onTouchEnd);
    };
  }, [mapReady]);

  useEffect(() => {
    if (!probeAt || !stamp) { setProbe(null); return undefined; }
    let live = true;
    setProbe({ loading: true });

    getProbe({
      lon: probeAt.lng, lat: probeAt.lat,
      variable, granularity, valid_at: stamp, statistic: wireStatistic,
      article: embedArticle, research: embedResearch,
    })
      .then((data) => { if (live) setProbe({ loading: false, data }); })
      .catch((err) => {
        if (!live) return;
        // 401 and 402 are the gate, not a failure, and they arrive carrying the
        // offer sentence the catalogue would have made. Show it verbatim rather
        // than inventing a second wording for the same wall.
        setProbe({
          loading: false,
          status: err?.response?.status,
          error: err?.response?.data?.detail || 'Could not read this cell.',
        });
      });
    return () => { live = false; };
  }, [probeAt, stamp, variable, granularity, wireStatistic, embedArticle, embedResearch]);

  // The popup is a real `mapboxgl.Popup` so it tracks the map on pan, with the
  // card portalled into it rather than positioned beside it.
  const probeNode = useMemo(
    () => (typeof document === 'undefined' ? null : document.createElement('div')),
    [],
  );
  const popupRef = useRef(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapAlive(map) || !mapReady || !probeNode) return undefined;
    if (!probeAt) {
      if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; }
      return undefined;
    }
    if (!popupRef.current) {
      popupRef.current = new mapboxgl.Popup({
        closeButton: true,
        // A probe is a pin, not a tooltip: clicking elsewhere moves it rather
        // than dismissing it.
        closeOnClick: false,
        maxWidth: '260px',
        className: 'article-surface__probe-popup',
      }).setDOMContent(probeNode);
      popupRef.current.on('close', () => setProbeAt(null));
    }
    popupRef.current.setLngLat([probeAt.lng, probeAt.lat]).addTo(map);
    return undefined;
  }, [probeAt, mapReady, probeNode]);

  useEffect(() => () => {
    if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; }
  }, []);

  const openAuth = useCallback(() => setAuthOpen(true), []);

  // WHAT THE NUMBER IS, in the words the caption is already using. A monthly
  // MEAN read as a maximum is the failure this line exists to prevent, so the
  // statistic is always named even where it reads as redundant.
  const caption = useMemo(() => [
    SURFACE_VARIABLES[variable]?.label || variable,
    // The statistic is part of the caption for an aggregate and a lie for a
    // daily value: there is no "mean" of one day's surface.
    granularity === 'daily' ? 'daily' : statLabel(displayStatistic, variable),
    stepLabel(stamp, granularity),
  ].filter(Boolean).join(' · '), [variable, granularity, displayStatistic, stamp]);

  if (unavailable) {
    return (
      <figure className="article-surface article-surface--empty">
        <p>The climate surfaces are not available right now.</p>
      </figure>
    );
  }

  return (
    <figure className="article-surface">
      <div
        className="article-surface__canvas"
        style={{ height: `${clampedHeight}px` }}
      >
        {canRenderMap ? (
          <div ref={containerRef} className="article-surface__gl" />
        ) : (
          <div className="article-surface__placeholder">
            <MapIcon size={28} aria-hidden="true" />
            <span>
              {loading ? 'Loading the climate surface…'
                : !hasToken ? 'The map could not be loaded.'
                  : !stamp ? 'No surface is published for this step.'
                    : 'The map could not be loaded.'}
            </span>
            {/* A daily layer with no step and no pin is the Pro gate, not an
                outage: `_withhold_cadence` empties the step list entirely, so
                `latest` is null and there is nothing to draw. Say which it is. */}
            {!loading && !stamp && granularity === 'daily' && (
              <Link className="article-surface__gate-cta" to="/pro">
                Daily surfaces are part of Insights Pro
              </Link>
            )}
          </div>
        )}

        {domain && canRenderMap && (
          <div className="article-surface__legend" aria-hidden="true">
            <div
              className="article-surface__ramp"
              style={{ background: rampGradient(domain) }}
            />
            <div className="article-surface__ticks">
              {legendTickValues(domain).map((t) => (
                <span key={t}>{Number.isInteger(t) ? t : t.toFixed(1)}</span>
              ))}
            </div>
            <div className="article-surface__legend-unit">
              {legendUnit}
              {domain.saturates && (
                <span className="article-surface__legend-note"> · ends saturate</span>
              )}
            </div>
          </div>
        )}

        {probeNode && probeAt && createPortal(
          <div className="article-surface__probe">
            {probe?.loading && (
              <p className="article-surface__probe-loading">Reading the surface…</p>
            )}

            {probe?.error && (
              <>
                <p className="article-surface__probe-msg">{probe.error}</p>
                {/* WHICH BUTTON follows the CADENCE, not the status code.
                    A signed-out reader under a daily layer is refused with 401
                    because signing in is their next step, but what they are
                    being sold is Pro — offering them a free account would send
                    them through a sign-up that ends at the same wall. At a free
                    cadence neither code is reachable any more; the 401 button
                    stays as the honest fallback if the date rule ever returns. */}
                {(probe.status === 401 || probe.status === 402) && (
                  granularity === 'daily' || probe.status === 402 ? (
                    <Link className="article-surface__probe-cta" to="/pro">
                      See Insights Pro
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="article-surface__probe-cta"
                      onClick={openAuth}
                    >
                      Sign in free
                    </button>
                  )
                )}
              </>
            )}

            {probe?.data && (
              <>
                <p className="article-surface__probe-value">
                  {probe.data.value == null ? (
                    // NEVER 0. Off the land mask is an absence, and the server
                    // says which absence it is.
                    <span className="article-surface__probe-none">No value here</span>
                  ) : (
                    <>
                      {formatProbeValue(probe.data.value, probe.data.unit)}
                      <span className="article-surface__probe-unit"> {probe.data.unit}</span>
                    </>
                  )}
                </p>
                <p className="article-surface__probe-what">{caption}</p>
                <p className="article-surface__probe-where">
                  {probe.data.value == null && probe.data.reason
                    ? `${probe.data.reason} · `
                    : ''}
                  {probeAt.lat.toFixed(3)}°, {probeAt.lng.toFixed(3)}°
                </p>
              </>
            )}
          </div>,
          probeNode,
        )}
      </div>

      <figcaption className="article-surface__caption">
        <span className="article-surface__what">{caption}</span>
        {isStub && <span className="article-surface__demo">demo data</span>}
        {canRenderMap && !gateKind && (
          <span className="article-surface__hint">
            <MousePointerClick size={13} aria-hidden="true" />
            Click anywhere for the value
          </span>
        )}
        {/* THE GATE, BEFORE THE CLICK. `/tiles` is ungated and `/probe` still
            withholds the daily cadence, so without this line a daily map paints
            for everyone and refuses on the first click — which reads as broken
            rather than as an offer. */}
        {canRenderMap && gateKind === 'pro' && (
          <Link className="article-surface__gate-cta" to="/pro">
            Read values off the daily surface with Insights Pro
          </Link>
        )}
      </figcaption>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </figure>
  );
}

export default ArticleSurfaceMap;
