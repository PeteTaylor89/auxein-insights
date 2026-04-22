// src/components/editor/IframeExtension.js - Tiptap custom node for iframe embeds
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import IframeNodeView from './IframeNodeView';

const IframeExtension = Node.create({
  name: 'iframe',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      title: { default: '' },
      height: { default: 600 },         // pixels — iframes don't auto-size
      width: { default: '100' },        // percent of container
      sandbox: { default: 'allow-scripts allow-same-origin allow-popups allow-forms' },
    };
  },

  parseHTML() {
    return [{ tag: 'iframe[data-article-iframe]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['iframe', mergeAttributes(HTMLAttributes, { 'data-article-iframe': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(IframeNodeView);
  },
});

export default IframeExtension;
