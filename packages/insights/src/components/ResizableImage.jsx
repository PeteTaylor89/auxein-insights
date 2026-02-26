// src/components/ResizableImage.jsx - Custom Tiptap image node view with size controls
import { NodeViewWrapper } from '@tiptap/react';
import { useState } from 'react';

const SIZE_OPTIONS = [
  { label: 'S', value: '25', title: 'Small (25%)' },
  { label: 'M', value: '50', title: 'Medium (50%)' },
  { label: 'L', value: '75', title: 'Large (75%)' },
  { label: 'Full', value: '100', title: 'Full width (100%)' },
];

function ResizableImage({ node, updateAttributes, selected }) {
  const { src, alt, width } = node.attrs;
  const [showControls, setShowControls] = useState(false);

  const currentWidth = width || '100';

  return (
    <NodeViewWrapper
      className={`resizable-image-wrapper ${selected ? 'selected' : ''}`}
      style={{ width: `${currentWidth}%` }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <img
        src={src}
        alt={alt || ''}
        draggable={false}
        style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '6px' }}
      />

      {(showControls || selected) && (
        <div className="resizable-image-controls">
          {SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={currentWidth === opt.value ? 'active' : ''}
              title={opt.title}
              onClick={() => updateAttributes({ width: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </NodeViewWrapper>
  );
}

export default ResizableImage;
