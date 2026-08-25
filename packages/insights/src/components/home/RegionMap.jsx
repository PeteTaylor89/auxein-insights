// components/home/RegionMap.jsx — pick a region by clicking the country.
//
// Phase 4b of docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md. Replaces
// `RegionLauncher` in the home hero.
//
// WHY THIS REPLACED A DROPDOWN, and it is not decoration. `RegionLauncher`
// navigated with `navigate()`, so the landing page contained NO crawlable link
// to any region — the site's strongest organic-search URLs were invisible from
// its highest-traffic page. Every region here is a real `<a href>`, so the map
// is simultaneously the cleaner control and the fix.
//
// It is also why the links are NOT hidden or shrunk to nothing. Links sized or
// coloured so people cannot see them but crawlers can are named in Google's
// spam policies as hidden links, and the risk lands on the whole domain. A map
// gives the same crawl paths in something a visitor actually wants.
//
// COUNTRY-AGNOSTIC BY CONSTRUCTION. Every coordinate, the viewBox and the
// aspect ratio come from the server, which projects whichever country it is
// asked for. There is no NZ in this file. Australia needs a row in
// `country_outline`, not a change here.
//
// SVG `<a>` rather than react-router's `<Link>`: a real `href` is what a
// crawler follows and what a middle-click opens, and the onClick keeps the SPA
// navigation for everyone else.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPinned, Minus, Plus, RotateCcw } from 'lucide-react';
import { getRegionMap } from '../../services/mapService';
import { scopePath } from '../../contexts/CountryIndustryContext';
import './RegionMap.css';

// Zoom is deliberately SHALLOW. The geometry is simplified to ~2 km, so past
// about 3x the coastline visibly polygonises and the map starts advertising its
// own approximation. 1 is the whole country and nothing zooms out past it.
const MAX_SCALE = 3;
const MIN_SCALE = 1;
const STEP = 1.5;

// Pixels of pointer movement that turn a click into a drag. Below this a wobble
// during a tap still navigates; above it, panning never does.
const DRAG_SLOP = 4;

function RegionMap({ country, industry, level = 'region', title }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState(null);
  const navigate = useNavigate();
  const svgRef = useRef(null);

  // The view is a scale plus a centre expressed as fractions of the map, not a
  // raw viewBox. Deriving the box from those two keeps the clamping in one
  // place and makes "zoom about the middle of what you are looking at" fall out
  // for free.
  const [view, setView] = useState({ scale: 1, cx: 0.5, cy: 0.5 });
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    // A new country at the previous zoom and centre would frame open sea.
    setView({ scale: 1, cx: 0.5, cy: 0.5 });
    getRegionMap({ country, industry, level })
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [country, industry, level]);

  const href = (slug) => scopePath(country, industry, slug);

  const go = (e, slug) => {
    // Let the browser handle anything that is not a plain left click, so
    // middle-click and cmd-click still open a new tab.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    // A pan that happens to end on a region must not navigate. `moved` is set
    // once the pointer travels past DRAG_SLOP and survives until the next
    // pointerdown, which is exactly long enough for this click to see it.
    //
    // `e.detail` guards the keyboard: a click synthesised by Enter on a focused
    // region reports detail 0, and it must not be swallowed by the `moved` of
    // whatever pan happened before it.
    if (e.detail > 0 && drag.current && drag.current.moved) return;
    navigate(href(slug));
  };

  // --- zoom and pan -------------------------------------------------------

  const clamp = useCallback((next) => {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    // At scale 1 the box IS the country, so the centre cannot move at all. As
    // it zooms in the centre may travel just far enough that an edge of the
    // country meets an edge of the box and no further, so the country can never
    // be dragged off screen and left blank.
    const half = 1 / (2 * scale);
    return {
      scale,
      cx: Math.min(1 - half, Math.max(half, next.cx)),
      cy: Math.min(1 - half, Math.max(half, next.cy)),
    };
  }, []);

  const viewBox = useMemo(() => {
    if (!data || !data.width) return '0 0 1 1';
    const w = data.width / view.scale;
    const h = data.height / view.scale;
    const x = data.width * view.cx - w / 2;
    const y = data.height * view.cy - h / 2;
    return x + ' ' + y + ' ' + w + ' ' + h;
  }, [data, view]);

  const zoomBy = (factor) =>
    setView((v) => clamp({ ...v, scale: v.scale * factor }));

  const resetView = () => setView({ scale: 1, cx: 0.5, cy: 0.5 });

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (!svgRef.current || !data?.width) return;
    // Deliberately NOT `setPointerCapture`. Capture would guarantee the
    // pointerup, but it also retargets the compatibility `click` that follows
    // to the capturing element — the <svg> — so the <a> around each region
    // would never see it and nothing would navigate at all. The window
    // listener below buys the same guarantee without touching click targeting.

    // THE PAN RATE IS FIXED AT THE START OF THE GESTURE, and it has to account
    // for LETTERBOXING. An SVG with the default `preserveAspectRatio` of
    // `xMidYMid meet` fits its viewBox INSIDE the element, so the drawn scale
    // is the SMALLER of the two axis ratios and the other axis is padded with
    // empty space.
    //
    // That padding is not small here. The viewBox is the country's own shape —
    // New Zealand is roughly four times taller than it is wide — while the
    // element is a short, wide hero column, so most of `rect.width` is blank
    // margin. Dividing by it made horizontal panning about 3.4x too slow while
    // vertical, the fitting axis, was exactly right. The result was a drag that
    // tracked the cursor going up and down and lagged badly going sideways,
    // which is only visible once zoomed in because at scale 1 the clamp forbids
    // panning at all.
    //
    // `k` is the real px-per-user-unit; from it, the fraction of the WHOLE map
    // that one pixel of pointer travel represents, per axis. Both are captured
    // now rather than recomputed per move: scale cannot change mid-drag, and
    // reading `view` inside the move handler is what made this depend on render
    // timing in the first place.
    const rect = svgRef.current.getBoundingClientRect();
    const k = Math.min(rect.width / (data.width / view.scale),
                       rect.height / (data.height / view.scale));
    drag.current = {
      x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy,
      scale: view.scale,
      perPxX: k > 0 ? 1 / (k * data.width) : 0,
      perPxY: k > 0 ? 1 / (k * data.height) : 0,
      moved: false, active: true,
    };
    setDragging(true);
  };

  // Stable, because everything it needs is on `drag.current`. That is what lets
  // it be bound to the WINDOW for the life of the gesture — see the effect
  // below — rather than only to the <svg>, which stopped receiving moves the
  // moment the pointer crossed the element's edge and left the pan stalled
  // mid-drag until the cursor wandered back in.
  const onPointerMove = useCallback((e) => {
    const d = drag.current;
    // `active`, not merely `d`. The record has to OUTLIVE the gesture so the
    // click that follows can read `moved`, but it must stop driving the pan the
    // instant the button comes up — otherwise the map keeps following the bare
    // cursor for ever and no region can be clicked again.
    if (!d || !d.active) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    d.moved = true;
    setView(clamp({
      scale: d.scale,
      cx: d.cx - dx * d.perPxX,
      cy: d.cy - dy * d.perPxY,
    }));
  }, [clamp]);

  const endDrag = useCallback(() => {
    // `active` false rather than dropping the record. `moved` still has to be
    // readable by the click that arrives immediately after this pointerup —
    // that is what stops a pan from navigating — but it must stop driving the
    // pan right now.
    if (drag.current) drag.current.active = false;
    setDragging(false);
  }, []);

  // The release can happen anywhere: over the header, over the zoom buttons,
  // past the edge of the window. Only the window hears all of those, and if
  // nothing hears it the drag stays live and the map follows the bare cursor
  // for ever — which is precisely the bug this replaced. Bound only while a
  // drag is actually in progress, so there is no idle listener on the page.
  useEffect(() => {
    if (!dragging) return undefined;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [dragging, onPointerMove, endDrag]);

  // Ctrl/Cmd + wheel to zoom.
  //
  // This CANNOT be a React `onWheel` prop. React attaches wheel at the root
  // container as a PASSIVE listener, so `preventDefault()` inside it is a
  // no-op — the handler runs, the map zooms, and the page scrolls at the same
  // time. It has to be a direct listener registered with `{ passive: false }`.
  //
  // The modifier is required on purpose: capturing a bare wheel over a tall
  // hero element traps the page scroll, which is the most annoying thing an
  // embedded map can do.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const handler = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setView((v) => clamp({ ...v, scale: v.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15) }));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
    // `data` is in the deps because the <svg> is not mounted until it exists —
    // without it the ref is null on the first run and nothing is ever bound.
  }, [clamp, data]);

  // Labels are dense at hero width. They are rendered for the largest regions
  // only and hidden entirely below a breakpoint in CSS — the shapes and the
  // accessible names carry the meaning, the labels are an aid.
  const labelled = useMemo(
    () => (data?.regions || []).filter((r) => r.label),
    [data],
  );

  if (loading) {
    return <div className="regionmap regionmap--skeleton" aria-hidden="true" />;
  }

  // A scope with no outline (Australia today) or a failed request. Both end in
  // something that still says what belongs here rather than a hole.
  if (error || !data?.available) {
    return (
      <div className="regionmap regionmap--absent">
        <MapPinned size={22} aria-hidden="true" />
        <p>{data?.reason || 'The region map could not be loaded.'}</p>
      </div>
    );
  }

  return (
    <div className="regionmap">
      {title && <h2 className="regionmap__title">{title}</h2>}

      <svg
        ref={svgRef}
        className={`regionmap__svg${dragging ? ' regionmap__svg--dragging' : ''}${
          view.scale > MIN_SCALE ? ' regionmap__svg--zoomed' : ''}`}
        viewBox={viewBox}
        role="group"
        aria-label={`${data.country_name} ${data.industry_name.toLowerCase()} regions`}
        onPointerDown={onPointerDown}
        onPointerUp={endDrag}
      >
        {/* The land first and never interactive — it is the shape people
            recognise, and making it clickable would swallow clicks aimed at the
            small regions sitting on top of it. */}
        <path className="regionmap__land" d={data.land} />

        {data.regions.map((r) => (
          <a
            key={r.slug}
            href={href(r.slug)}
            onClick={(e) => go(e, r.slug)}
            onMouseEnter={() => setHovered(r.slug)}
            onMouseLeave={() => setHovered((s) => (s === r.slug ? null : s))}
            onFocus={() => setHovered(r.slug)}
            onBlur={() => setHovered((s) => (s === r.slug ? null : s))}
            className={`regionmap__a${
              r.has_live_data ? '' : ' regionmap__a--quiet'}`}
          >
            {/* The accessible name. Without it every region reads as "link". */}
            <title>
              {r.name}
              {r.has_live_data ? '' : ' — history and projections only'}
            </title>
            <path
              className={`regionmap__region${
                hovered === r.slug ? ' regionmap__region--on' : ''}`}
              d={r.d}
            />
          </a>
        ))}

        {labelled.map((r) => (
          <text
            key={`l-${r.slug}`}
            className={`regionmap__label${
              hovered === r.slug ? ' regionmap__label--on' : ''}`}
            x={r.label.x}
            y={r.label.y}
            // Font size is in USER units, so without dividing by the scale a
            // 3x view renders 3x lettering. `non-scaling-stroke` does the same
            // job for the halo but has no equivalent for glyph size.
            style={{ fontSize: `${26 / view.scale}px`,
                     strokeWidth: `${5 / view.scale}px` }}
            // Purely decorative: the name is already on the link above, and a
            // screen reader announcing it twice is worse than not at all.
            aria-hidden="true"
          >
            {r.name}
          </text>
        ))}
      </svg>

      {/* The hovered region, named in text below the map. Several regions are
          only a few pixels across at this size, and a shape that highlights
          without saying what it is is a guessing game. */}
      {/* Buttons, not only gestures. Zoom has to be reachable without a wheel
          or a trackpad, and on touch the buttons are the only affordance that
          does not compete with scrolling the page. */}
      <div className="regionmap__zoom">
        <button type="button" onClick={() => zoomBy(STEP)}
                disabled={view.scale >= MAX_SCALE} aria-label="Zoom in">
          <Plus size={15} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => zoomBy(1 / STEP)}
                disabled={view.scale <= MIN_SCALE} aria-label="Zoom out">
          <Minus size={15} aria-hidden="true" />
        </button>
        <button type="button" onClick={resetView}
                disabled={view.scale === 1} aria-label="Reset the view">
          <RotateCcw size={14} aria-hidden="true" />
        </button>
      </div>

      <p className="regionmap__readout" aria-live="polite">
        {hovered
          ? (data.regions.find((r) => r.slug === hovered)?.name || '')
          : `${data.regions.length} regions — choose one`}
      </p>
    </div>
  );
}

export default RegionMap;
