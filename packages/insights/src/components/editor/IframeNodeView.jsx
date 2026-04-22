// src/components/editor/IframeNodeView.jsx - Editor preview + size controls for iframe embeds
import { NodeViewWrapper } from '@tiptap/react';
import { useState } from 'react';
import { Frame, X, Settings2 } from 'lucide-react';

const WIDTH_OPTIONS = [
  { label: 'S', value: '50' },
  { label: 'M', value: '75' },
  { label: 'L', value: '100' },
];

function IframeNodeView({ node, updateAttributes, deleteNode, selected }) {
  const { src, title, height, width, sandbox } = node.attrs;
  const [showControls, setShowControls] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftHeight, setDraftHeight] = useState(height);
  const [draftSrc, setDraftSrc] = useState(src);
  const [draftTitle, setDraftTitle] = useState(title);

  const safeHeight = Math.max(120, Number(height) || 600);

  const applyEdits = () => {
    updateAttributes({
      src: draftSrc.trim(),
      title: draftTitle.trim(),
      height: Math.max(120, Number(draftHeight) || 600),
    });
    setEditing(false);
  };

  return (
    <NodeViewWrapper
      className={`iframe-embed-wrapper ${selected ? 'selected' : ''}`}
      style={{ width: `${width || '100'}%`, margin: '1rem auto', position: 'relative' }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {!src ? (
        <div
          contentEditable={false}
          style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '20px', background: '#fef3c7', border: '2px dashed #fbbf24',
            borderRadius: '8px', color: '#92400e', fontSize: '0.875rem',
          }}
        >
          <Frame size={20} />
          <span>Iframe — no URL set. Click the gear to configure.</span>
        </div>
      ) : (
        <iframe
          src={src}
          title={title || 'Embedded content'}
          width="100%"
          height={safeHeight}
          sandbox={sandbox}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          style={{ border: '1px solid #e5e7eb', borderRadius: '8px', display: 'block' }}
        />
      )}

      {(showControls || selected) && (
        <div
          contentEditable={false}
          style={{
            position: 'absolute', top: '8px', right: '8px',
            display: 'flex', gap: '4px', padding: '4px',
            background: 'rgba(255,255,255,0.95)', borderRadius: '6px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
          }}
        >
          {WIDTH_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              title={`Width ${opt.value}%`}
              onClick={() => updateAttributes({ width: opt.value })}
              style={{
                padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer',
                border: '1px solid', borderColor: width === opt.value ? '#16a34a' : '#d1d5db',
                background: width === opt.value ? '#f0fdf4' : 'white',
                color: width === opt.value ? '#16a34a' : '#374151',
                borderRadius: '4px', fontWeight: 600,
              }}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            title="Edit URL / height"
            onClick={() => { setDraftSrc(src); setDraftTitle(title); setDraftHeight(height); setEditing(true); }}
            style={{ padding: '4px 6px', cursor: 'pointer', border: '1px solid #d1d5db', background: 'white', borderRadius: '4px' }}
          >
            <Settings2 size={14} />
          </button>
          <button
            type="button"
            title="Remove iframe"
            onClick={deleteNode}
            style={{ padding: '4px 6px', cursor: 'pointer', border: '1px solid #fecaca', background: 'white', color: '#dc2626', borderRadius: '4px' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {editing && (
        <div
          contentEditable={false}
          style={{
            position: 'absolute', top: '44px', right: '8px', zIndex: 10,
            background: 'white', border: '1px solid #d1d5db', borderRadius: '8px',
            padding: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '320px',
          }}
        >
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>URL</label>
          <input
            type="url"
            value={draftSrc}
            onChange={(e) => setDraftSrc(e.target.value)}
            placeholder="https://example.com/embed"
            style={{ padding: '6px 8px', fontSize: '0.85rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
          />
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Title (for accessibility)</label>
          <input
            type="text"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="What is this embed showing?"
            style={{ padding: '6px 8px', fontSize: '0.85rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
          />
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Height (px)</label>
          <input
            type="number"
            min="120"
            value={draftHeight}
            onChange={(e) => setDraftHeight(e.target.value)}
            style={{ padding: '6px 8px', fontSize: '0.85rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
          />
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button
              type="button"
              onClick={() => setEditing(false)}
              style={{ padding: '5px 12px', border: '1px solid #d1d5db', background: 'white', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyEdits}
              style={{ padding: '5px 12px', border: 'none', background: '#16a34a', color: 'white', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}

export default IframeNodeView;
