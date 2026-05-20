// components/FeedbackModal.jsx — In-app feedback / bug / idea form.
// Posts to /api/feedback which forwards to grow@auxein.co.nz. Supports
// up to 3 image attachments (file picker, drag-drop, or clipboard paste).
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Send, Loader2, AlertCircle, CheckCircle,
  Bug, Lightbulb, MessageSquare, HelpCircle, Paperclip, Trash2,
} from 'lucide-react';
import { feedbackService } from '@vineyard/shared';
import './FeedbackModal.css';

const CATEGORIES = [
  { value: 'bug', label: 'Bug', icon: Bug },
  { value: 'feedback', label: 'Feedback', icon: MessageSquare },
  { value: 'idea', label: 'Idea', icon: Lightbulb },
  { value: 'other', label: 'Other', icon: HelpCircle },
];

const MAX_FILES = 3;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function shortName(name, max = 22) {
  if (!name) return 'screenshot.png';
  if (name.length <= max) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > -1 ? name.slice(dot) : '';
  return `${name.slice(0, max - ext.length - 1)}…${ext}`;
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FeedbackModal({ open, onClose }) {
  const [category, setCategory] = useState('feedback');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState([]); // { file, previewUrl }
  const [status, setStatus] = useState('idle'); // idle | sending | success | error
  const [errorMessage, setErrorMessage] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Reset on open + revoke any blob URLs on unmount/close.
  useEffect(() => {
    if (!open) return;
    setCategory('feedback');
    setSubject('');
    setMessage('');
    setStatus('idle');
    setErrorMessage('');
    setFiles((prev) => {
      prev.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      return [];
    });
  }, [open]);

  useEffect(() => () => {
    files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback((incoming) => {
    setErrorMessage('');
    const accepted = [];
    const rejections = [];
    for (const file of incoming) {
      if (!file.type || !file.type.startsWith('image/')) {
        rejections.push(`${file.name || 'file'} (not an image)`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        rejections.push(`${file.name || 'file'} (over 5 MB)`);
        continue;
      }
      accepted.push(file);
    }
    setFiles((prev) => {
      const remaining = MAX_FILES - prev.length;
      const slice = accepted.slice(0, Math.max(0, remaining));
      if (accepted.length > remaining) {
        rejections.push(`only ${MAX_FILES} attachments allowed`);
      }
      const wrapped = slice.map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      if (rejections.length) {
        setErrorMessage(rejections.join('; '));
      }
      return [...prev, ...wrapped];
    });
  }, []);

  const removeFileAt = useCallback((idx) => {
    setFiles((prev) => {
      const next = [...prev];
      const [removed] = next.splice(idx, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }, []);

  // Clipboard paste — capture only when modal is open. Pasting an image from
  // Win+Shift+S / macOS screenshot tool lands here.
  useEffect(() => {
    if (!open) return;
    const onPaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items || !items.length) return;
      const imageFiles = [];
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            // Clipboard images are usually named "image.png" — give a
            // unique-ish name for the email attachment.
            const named = new File(
              [file],
              file.name && file.name !== 'image.png'
                ? file.name
                : `screenshot-${Date.now()}.png`,
              { type: file.type },
            );
            imageFiles.push(named);
          }
        }
      }
      if (imageFiles.length) {
        e.preventDefault();
        addFiles(imageFiles);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, addFiles]);

  if (!open) return null;

  const onPickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length) addFiles(picked);
    // Reset so picking the same file twice still fires onChange.
    e.target.value = '';
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer?.files || []);
    if (dropped.length) addFiles(dropped);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setStatus('sending');
    setErrorMessage('');
    try {
      await feedbackService.submit({
        category,
        subject: subject.trim(),
        message: message.trim(),
        page_url: typeof window !== 'undefined' ? window.location.href : null,
        attachments: files.map((f) => f.file),
      });
      setStatus('success');
    } catch (err) {
      setErrorMessage(err?.response?.data?.detail || err.message || 'Failed to send. Please try again.');
      setStatus('error');
    }
  };

  return (
    <div className="fbm-backdrop" onClick={onClose}>
      <div className="fbm-modal" onClick={(e) => e.stopPropagation()}>
        <button className="fbm-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        {status === 'success' ? (
          <div className="fbm-success">
            <div className="fbm-success-icon"><CheckCircle size={28} /></div>
            <h3 className="fbm-success-title">Thanks — we got it.</h3>
            <p className="fbm-success-body">Your feedback is in the Auxein inbox. We'll follow up if we have questions.</p>
            <button className="fbm-btn fbm-btn--accent" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form className="fbm-body" onSubmit={submit}>
            <h3 className="fbm-title">Submit feedback</h3>
            <p className="fbm-sub">Bugs, ideas, or anything else. Goes straight to the team.</p>

            <div className="fbm-cats">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const active = category === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    className={`fbm-cat ${active ? 'fbm-cat--active' : ''}`}
                    onClick={() => setCategory(c.value)}
                  >
                    <Icon size={14} /> {c.label}
                  </button>
                );
              })}
            </div>

            <label className="fbm-label" htmlFor="fbm-subject">Subject</label>
            <input
              id="fbm-subject"
              className="fbm-input"
              type="text"
              placeholder="One-line summary"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={140}
              required
            />

            <label className="fbm-label" htmlFor="fbm-message">Details</label>
            <textarea
              id="fbm-message"
              className="fbm-textarea"
              placeholder={
                category === 'bug'
                  ? 'What happened, what you expected, and steps to reproduce.'
                  : 'Tell us more.'
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={5000}
              rows={6}
              required
            />

            <div className="fbm-attach-row">
              <label className="fbm-label" style={{ margin: 0 }}>
                Attachments <span className="fbm-attach-hint">(optional · images · up to {MAX_FILES})</span>
              </label>
              <button
                type="button"
                className="fbm-attach-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={files.length >= MAX_FILES}
                title={files.length >= MAX_FILES ? 'Maximum attachments reached' : 'Add image'}
              >
                <Paperclip size={14} /> Add image
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={onPickFiles}
                style={{ display: 'none' }}
              />
            </div>

            <div
              className={`fbm-dropzone ${dragging ? 'fbm-dropzone--active' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              {files.length === 0 ? (
                <div className="fbm-dropzone-empty">
                  Drag images here, click <strong>Add image</strong>, or press <kbd>Ctrl</kbd>+<kbd>V</kbd> to paste a screenshot.
                </div>
              ) : (
                <ul className="fbm-thumbs">
                  {files.map((f, idx) => (
                    <li key={idx} className="fbm-thumb">
                      <img src={f.previewUrl} alt={f.file.name} />
                      <button
                        type="button"
                        className="fbm-thumb-remove"
                        onClick={() => removeFileAt(idx)}
                        title="Remove"
                        aria-label={`Remove ${f.file.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                      <div className="fbm-thumb-meta">
                        <div className="fbm-thumb-name" title={f.file.name}>{shortName(f.file.name)}</div>
                        <div className="fbm-thumb-size">{humanSize(f.file.size)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {status === 'error' && (
              <div className="fbm-error">
                <AlertCircle size={16} /> {errorMessage}
              </div>
            )}

            <div className="fbm-actions">
              <button type="button" className="fbm-btn" onClick={onClose}>Cancel</button>
              <button
                type="submit"
                className="fbm-btn fbm-btn--accent"
                disabled={status === 'sending' || !subject.trim() || !message.trim()}
              >
                {status === 'sending' ? (
                  <><Loader2 size={14} className="fbm-spin" /> Sending…</>
                ) : (
                  <><Send size={14} /> Send</>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
