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
