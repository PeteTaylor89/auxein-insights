// src/components/editor/IframeInserter.jsx - Modal for inserting iframe embeds
import { useState } from 'react';
import { X, Frame } from 'lucide-react';

const TOOL_PRESETS = [
  { label: 'Trend or Blip tool', src: '/tools/trend-or-blip.html', height: 1100 },
];

function IframeInserter({ editor, onClose }) {
  const [src, setSrc] = useState('');
  const [title, setTitle] = useState('');
  const [height, setHeight] = useState(600);

  const handleInsert = () => {
    if (!editor || !src.trim()) return;
    editor.chain().focus().insertContent({
      type: 'iframe',
      attrs: {
        src: src.trim(),
        title: title.trim(),
        height: Math.max(120, Number(height) || 600),
        width: '100',
      },
    }).run();
    onClose();
  };

  const applyPreset = (preset) => {
    setSrc(preset.src);
    setHeight(preset.height);
    if (!title) setTitle(preset.label);
  };

  const fieldStyle = { width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' };
  const labelStyle = { display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', color: '#374151' };

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', width: '100%', maxWidth: '480px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
            <Frame size={20} style={{ color: '#16a34a' }} /> Insert Iframe
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {TOOL_PRESETS.length > 0 && (
            <div>
              <label style={labelStyle}>Quick presets</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {TOOL_PRESETS.map((p) => (
                  <button
                    key={p.src}
                    type="button"
                    onClick={() => applyPreset(p)}
                    style={{ padding: '0.3rem 0.6rem', border: '1px solid #d1d5db', background: 'white', borderRadius: '999px', fontSize: '0.75rem', cursor: 'pointer' }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label style={labelStyle}>URL</label>
            <input
              type="url"
              value={src}
              onChange={(e) => setSrc(e.target.value)}
              placeholder="https://example.com or /tools/something.html"
              style={fieldStyle}
              autoFocus
            />
          </div>

          <div>
            <label style={labelStyle}>Title <span style={{ fontWeight: 400, color: '#9ca3af' }}>(for accessibility)</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What is this embed showing?"
              style={fieldStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Height (px)</label>
            <input
              type="number"
              min="120"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              style={fieldStyle}
            />
            <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '4px' }}>
              Iframes can't auto-size — pick a height tall enough for the content.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button onClick={onClose} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white', fontSize: '0.875rem', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={!src.trim()}
            style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: '6px', background: '#16a34a', color: 'white', fontSize: '0.875rem', cursor: 'pointer', opacity: src.trim() ? 1 : 0.5 }}
          >
            Insert Iframe
          </button>
        </div>
      </div>
    </div>
  );
}

export default IframeInserter;
