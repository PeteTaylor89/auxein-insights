// src/components/PlanDrawer.jsx — the right-hand detail panel.
//
// Used by both the task detail and the project detail. A drawer rather than a
// modal because the calendar behind it stays useful: you can see which day you
// are editing, and closing is one Escape away.
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import './plan-drawer.css';

export default function PlanDrawer({ open, title, onClose, children, footer }) {
  const panelRef = useRef(null);
  const lastFocused = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    // Remember what had focus so it can be given back on close. Without this,
    // closing the drawer drops focus to <body> and a keyboard user restarts
    // from the top of the page.
    lastFocused.current = document.activeElement;

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      // Contain Tab within the panel. Not a full focus-trap library — just
      // enough that tabbing does not walk into the calendar behind, which is
      // inert to the eye but not to the keyboard.
      const focusables = panelRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (lastFocused.current instanceof HTMLElement) lastFocused.current.focus();
    };
  }, [open, onClose]);

  // Focus the panel when it opens, so the first Tab starts inside it.
  useEffect(() => {
    if (open && panelRef.current) panelRef.current.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="pdrawer-scrim" onMouseDown={(e) => {
      // Only a click that both starts AND ends on the scrim closes. A drag
      // that began inside the panel — selecting text, say — must not dismiss.
      if (e.target === e.currentTarget) onClose();
    }}>
      <aside
        ref={panelRef}
        className="pdrawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className="pdrawer-head">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="pdrawer-body">{children}</div>

        {footer && <footer className="pdrawer-foot">{footer}</footer>}
      </aside>
    </div>
  );
}
