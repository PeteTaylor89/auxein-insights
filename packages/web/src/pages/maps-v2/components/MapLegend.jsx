// maps-v2/components/MapLegend.jsx — Key for the map's markers and shapes.
//
// From the Greystone beta feedback: "A simple legend for the map icons
// (observations, tasks, etc.) would help everyone read the map at a glance."
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
import { MARKER_SPECS } from '../utils/mapIcons';
import { MAP_FEATURE_TYPES } from './mapFeatureTypes';
import {
  BLOCK_FILL_OWN,
  BLOCK_OUTLINE,
  BLOCK_FILL_OPACITY,
  BLOCK_OUTLINE_WIDTH_OWN,
  SPATIAL_AREA_FILL,
  SPATIAL_AREA_FILL_OPACITY,
  SPATIAL_AREA_OUTLINE,
  SPATIAL_AREA_OUTLINE_WIDTH,
  SPATIAL_AREA_OUTLINE_OPACITY,
  SPATIAL_AREA_DASH,
  GPS_TRACK_COLORS,
  ASSET_LINE_DEFAULT,
} from '../utils/layerColors';
import './MapLegend.css';

const SPEC_BY_ID = Object.fromEntries(MARKER_SPECS.map((s) => [s.id, s]));

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

/** A circular marker swatch matching the map image of the same id. */
function MarkerSwatch({ specId }) {
  const spec = SPEC_BY_ID[specId];
  if (!spec) return null;

  // The map image scales its 24x24 glyph to ~55% of the circle; reproduce that
  // ratio here so the legend icon reads at the same weight as the marker.
  const SIZE = 20;
  const scale = (SIZE * 0.55) / 24;
  const offset = (SIZE - 24 * scale) / 2;

  return (
    <svg className="v2-legend-swatch" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
      <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 1} fill={spec.bg} stroke="#ffffff" strokeWidth="1.5" />
      <g
        transform={`translate(${offset} ${offset}) scale(${scale})`}
        fill="none"
        stroke={spec.fg}
        strokeWidth={2 / scale}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {spec.def.map((el, i) => <IconElement key={i} el={el} index={i} />)}
      </g>
    </svg>
  );
}

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
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" fill="#4b5563" />
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

/**
 * @param {Object} props.visible — which layers are currently switched on, keyed
 *   the same way MapsPage tracks them. Absent keys are treated as hidden.
 */
export default function MapLegend({ visible = {} }) {
  const [open, setOpen] = useState(false);

  const sections = [];

  // Blocks are always drawn — no toggle for them on the map.
  sections.push({
    title: 'Areas',
    items: [
      {
        key: 'blocks',
        swatch: (
          <AreaSwatch
            fill={BLOCK_FILL_OWN}
            fillOpacity={BLOCK_FILL_OPACITY}
            outline={BLOCK_OUTLINE}
            outlineWidth={BLOCK_OUTLINE_WIDTH_OWN}
          />
        ),
        label: 'Vineyard block',
      },
      ...(visible.spatialAreas
        ? [{
            key: 'spatial',
            swatch: (
              <AreaSwatch
                fill={SPATIAL_AREA_FILL}
                fillOpacity={SPATIAL_AREA_FILL_OPACITY}
                outline={SPATIAL_AREA_OUTLINE}
                outlineWidth={SPATIAL_AREA_OUTLINE_WIDTH}
                outlineOpacity={SPATIAL_AREA_OUTLINE_OPACITY}
                dash={SPATIAL_AREA_DASH}
              />
            ),
            label: 'Spatial area',
          }]
        : []),
    ],
  });

  const markers = [];
  if (visible.tasks) {
    markers.push({ key: 'v2-tasks-icon', swatch: <MarkerSwatch specId="v2-tasks-icon" />, label: SPEC_BY_ID['v2-tasks-icon'].label });
    markers.push({ key: 'v2-tasks-icon-inactive', swatch: <MarkerSwatch specId="v2-tasks-icon-inactive" />, label: SPEC_BY_ID['v2-tasks-icon-inactive'].label });
  }
  if (visible.observations) {
    markers.push({ key: 'v2-obs-icon', swatch: <MarkerSwatch specId="v2-obs-icon" />, label: SPEC_BY_ID['v2-obs-icon'].label });
  }
  if (visible.assets) {
    markers.push({ key: 'v2-asset-icon', swatch: <MarkerSwatch specId="v2-asset-icon" />, label: SPEC_BY_ID['v2-asset-icon'].label });
  }
  if (visible.risks) {
    for (const id of ['v2-risk-icon-low', 'v2-risk-icon-medium', 'v2-risk-icon-high', 'v2-risk-icon-critical']) {
      markers.push({ key: id, swatch: <MarkerSwatch specId={id} />, label: SPEC_BY_ID[id].label });
    }
  }
  if (visible.mapFeatures) {
    // Driven off MAP_FEATURE_TYPES rather than a second hardcoded list, so a
    // new POI type appears in the legend automatically instead of being a
    // silent omission.
    for (const t of MAP_FEATURE_TYPES) {
      markers.push({
        key: t.iconId,
        swatch: <MarkerSwatch specId={t.iconId} />,
        label: SPEC_BY_ID[t.iconId]?.label || t.label,
      });
    }
  }
  if (markers.length > 0) sections.push({ title: 'Markers', items: markers });

  const lines = [];
  if (visible.gpsTracks) {
    lines.push({ key: 'gps-active', swatch: <LineSwatch color={GPS_TRACK_COLORS.in_progress} />, label: 'GPS track — in progress' });
    lines.push({ key: 'gps-done', swatch: <LineSwatch color={GPS_TRACK_COLORS.completed} />, label: 'GPS track — completed' });
  }
  if (visible.assets) {
    lines.push({ key: 'asset-line', swatch: <LineSwatch color={ASSET_LINE_DEFAULT} />, label: 'Linear asset (fence, irrigation…)' });
  }
  if (lines.length > 0) sections.push({ title: 'Lines', items: lines });

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
                  {item.swatch}
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
