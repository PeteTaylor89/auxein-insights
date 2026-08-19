// maps-v2/components/MapLegend.jsx — Key for the map's markers and shapes.
//
// From the Greystone beta feedback: "A simple legend for the map icons
// (observations, tasks, etc.) would help everyone read the map at a glance."
//
// WHAT is listed comes from utils/legendModel.js, which the printed legend reads
// too — one description of the map, two renderers. This file only decides HOW a
// row is drawn on screen. Add a layer in legendModel, not here.
//
// Marker swatches are drawn from MARKER_SPECS — the same list registerMapIcons
// uses to build the actual map images — so the legend can't drift out of step
// with what's on the map. Shape swatches read from layerColors for the same
// reason. Only currently-visible layers are listed; a legend that describes
// hidden layers is noise.
//
// That guarantee used to be a lie for spatial areas: useSpatialAreasLayer
// hardcoded its own mint/dashed-black paint and never imported the (olive)
// SPATIAL_AREA_* constants, which only the legend read. Both layers now import
// every value they paint with, so layerColors.js is the single source of truth.
// If you add a paint property here, add the constant there — don't inline it.
import { useState } from 'react';
import { ChevronDown, ChevronUp, List } from 'lucide-react';
import { GLYPH_FRACTION, GLYPH_STROKE, ICON_DEFS } from '../utils/mapIcons';
import { legendSections, SPEC_BY_ID } from '../utils/legendModel';
import './MapLegend.css';

/**
 * Render one lucide element (as stored in ICON_DEFS) into SVG.
 * Mirrors drawElement() in mapIcons.js, which paints the same shapes to canvas.
 */
function IconElement({ el, index }) {
  if (el.type === 'path') return <path key={index} d={el.attrs.d} />;
  if (el.type === 'rect') {
    const { x, y, width, height, rx } = el.attrs;
    return <rect key={index} x={x} y={y} width={width} height={height} rx={rx || 0} />;
  }
  if (el.type === 'circle') {
    const { cx, cy, r } = el.attrs;
    return <circle key={index} cx={cx} cy={cy} r={r} />;
  }
  return null;
}

/**
 * A circular marker swatch matching the map image of the same id.
 *
 * `icon`/`colour` win when the row supplies them. Company-defined POI types
 * have no MARKER_SPECS entry — their image is built on demand per (icon,
 * colour) pair — so a specId lookup alone returned null and every POI row in
 * the legend rendered empty.
 */
function MarkerSwatch({ specId, icon, colour }) {
  const spec = icon
    ? { bg: colour, fg: '#ffffff', def: ICON_DEFS[icon] }
    : SPEC_BY_ID[specId];
  if (!spec || !spec.def) return null;

  // The map image scales its 24x24 glyph to GLYPH_FRACTION of the circle;
  // reproduce that ratio here so the legend icon reads at the same weight as
  // the marker. Both constants come from mapIcons, so the two cannot drift.
  const SIZE = 20;
  const scale = (SIZE * GLYPH_FRACTION) / 24;
  const offset = (SIZE - 24 * scale) / 2;

  return (
    <svg className="v2-legend-swatch" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
      <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 1} fill={spec.bg} stroke="#ffffff" strokeWidth="1.5" />
      <g
        transform={`translate(${offset} ${offset}) scale(${scale})`}
        fill="none"
        stroke={spec.fg}
        // Same rule as drawMarkerSwatch: proportional, with a 2px floor. At
        // 20px the floor wins, which is why the chip looks a touch bolder than
        // the marker — below 2px a stroked glyph is a grey smudge.
        strokeWidth={Math.max(GLYPH_STROKE, 2 / scale)}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {spec.def.map((el, i) => <IconElement key={i} el={el} index={i} />)}
      </g>
    </svg>
  );
}

/**
 * Stand-in for the basemap under a translucent fill.
 *
 * Was `#4b5563`, a BLUE-grey. Vineyard satellite imagery is green and olive, so
 * a 12% bright-green block fill composited onto blue-grey came out grey-teal in
 * the legend while the map showed it green — the legend and the map genuinely
 * did not match, and the constants were identical the whole time. Solved
 * numerically against canopy-dark and dry-ground pixels: this base reproduces
 * the map's average appearance for both the block and spatial-area fills to
 * within ~2/255 per channel, where the old one was ~69 out.
 */
const IMAGERY_BASE = '#646c4c';

/**
 * A filled-polygon swatch for area layers.
 *
 * Reproduces the layer's ACTUAL paint, not just its colour. Two things made the
 * old swatch misleading:
 *
 *  - It ignored fill-opacity. Blocks paint at 0.12 and spatial areas at 0.18, so
 *    drawing the raw hex gave a solid slab of colour the map never shows.
 *  - It ignored the backdrop. The default basemap is satellite, so a 12% fill
 *    sits on dark imagery; the same fill on the legend's light card reads as a
 *    completely different colour. The swatch therefore paints its own dark base
 *    first, so the translucent fill lands on something imagery-like.
 *
 * Stroke width is halved: the map draws in screen pixels at map scale, while
 * this is a 20px box, so using the raw line-width swamps the swatch.
 */
function AreaSwatch({ fill, fillOpacity = 1, outline, outlineWidth = 2, outlineOpacity = 1, dash }) {
  return (
    <svg className="v2-legend-swatch" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" fill={IMAGERY_BASE} />
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" fill={fill} fillOpacity={fillOpacity} />
      <rect
        x="2.5" y="4.5" width="15" height="11" rx="2"
        fill="none"
        stroke={outline}
        strokeOpacity={outlineOpacity}
        strokeWidth={Math.max(1, outlineWidth / 2)}
        strokeDasharray={dash ? dash.map((d) => d * 2).join(' ') : undefined}
      />
    </svg>
  );
}

/** A stroked-line swatch for linear layers. */
function LineSwatch({ color, casing = '#ffffff' }) {
  return (
    <svg className="v2-legend-swatch" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2 14 L8 7 L13 12 L18 5" fill="none" stroke={casing} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 14 L8 7 L13 12 L18 5" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Dispatch a legendModel row to the swatch that draws it. */
function RowSwatch({ row }) {
  if (row.type === 'marker') {
    return <MarkerSwatch specId={row.specId} icon={row.icon} colour={row.colour} />;
  }
  if (row.type === 'line') return <LineSwatch color={row.color} />;
  if (row.type === 'area') {
    return (
      <AreaSwatch
        fill={row.fill}
        fillOpacity={row.fillOpacity}
        outline={row.outline}
        outlineWidth={row.outlineWidth}
        outlineOpacity={row.outlineOpacity}
        dash={row.dash}
      />
    );
  }
  return null;
}

/**
 * @param {Object} props.visible — which layers are currently switched on, keyed
 *   the same way MapsPage tracks them. Absent keys are treated as hidden.
 */
export default function MapLegend({ visible = {}, featureTypes = [] }) {
  const [open, setOpen] = useState(false);

  const sections = legendSections(visible, { featureTypes });

  return (
    <div className={`v2-legend ${open ? 'v2-legend--open' : ''}`}>
      <button
        type="button"
        className="v2-legend-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={open ? 'Hide legend' : 'Show legend'}
      >
        <List size={14} />
        <span>Legend</span>
        {open ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
      </button>

      {open && (
        <div className="v2-legend-body">
          {sections.map((section) => (
            <div key={section.title} className="v2-legend-section">
              <div className="v2-legend-section-title">{section.title}</div>
              {section.items.map((item) => (
                <div key={item.key} className="v2-legend-item">
                  <RowSwatch row={item} />
                  <span className="v2-legend-label">{item.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
