// src/components/editor/ClimateWidgetExtension.js - Tiptap custom node for climate widgets
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import ClimateWidgetNodeView from './ClimateWidgetNodeView';

const ClimateWidgetExtension = Node.create({
  name: 'climateWidget',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      widgetType: { default: 'gdd_progress' },
      zoneSlug: { default: '' },
      zoneName: { default: '' },
      zoneSlugs: { default: '' },          // comma-separated, for multi-zone widgets
      zoneNames: { default: '' },          // comma-separated display labels
      metric: { default: '' },
      displayMode: { default: 'chart' }, // 'chart' or 'table'
      title: { default: '' },
      vintages: { default: '' },           // comma-separated vintage years, used by season_comparison
      includeBaseline: { default: true },  // include long-term baseline in season_comparison
      seasonLimit: { default: 10 },        // 10 | 20 | 37, used by historical/region trend widgets
      scenario: { default: '' },           // SSP code, used by projection_outlook
      period: { default: '' },             // projection period code, used by projection_outlook
      isStatic: { default: false },        // freeze data on publish
      snapshotData: { default: null },      // embedded API response
      snapshotDate: { default: null },      // when snapshot was taken

      // --- surface_map only ---------------------------------------------
      // A surface widget is addressed by a LAYER and a STEP, not by a zone, so
      // none of the attributes above apply to it and none of these apply to
      // anything else. They are flat rather than nested because Tiptap attrs
      // are flat: a nested object survives the editor but not every HTML
      // round-trip, and a half-parsed object would render a map of the wrong
      // month rather than failing.
      variable: { default: 'temp_mean' },
      cadence: { default: 'monthly' },      // 'monthly' | 'daily'
      // 'YYYY-MM' or 'YYYY-MM-DD'. THE PIN. Written by the inserter at insert
      // time so a published map cannot drift off the paragraph describing it.
      validAt: { default: '' },
      statistic: { default: '' },
      // The opt-out from the pin, for an article that is ABOUT the newest step.
      followLatest: { default: false },
      mapHeight: { default: 420 },
      mapCentre: { default: '' },           // 'lon,lat', empty fits all of NZ
      mapZoom: { default: null },
      basemap: { default: 'light' },        // 'light' | 'outdoors' | 'satellite'
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-climate-widget]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-climate-widget': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ClimateWidgetNodeView);
  },
});

export default ClimateWidgetExtension;
