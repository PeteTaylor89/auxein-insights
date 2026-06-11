// components/HelpTip.jsx — a small (?) icon that opens an anchored help popover.
//
// Usage:
//   <HelpTip topic="obs.tasks" />                     // pulls title+body from the registry
//   <HelpTip title="Custom" >inline JSX body</HelpTip> // or supply content inline
//
// The popover is rendered in a portal on <body> (so it can't be clipped by a
// scrolling tab panel) and positioned next to the icon, flipping above /
// clamping into the viewport when it would otherwise run off-screen. It closes
// on outside-click, Esc, scroll, and reflows on resize.
import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';
import { getHelp } from '../help/helpContent';
import './HelpTip.css';

const MAX_WIDTH = 300;
const GAP = 8;   // space between icon and popover
const MARGIN = 8; // min gap from viewport edges

export default function HelpTip({ topic, title: titleProp, children, label, size = 16, className = '' }) {
  const entry = topic ? getHelp(topic) : null;
  const title = titleProp ?? entry?.title ?? 'Help';
  const body = children ?? entry?.body ?? null;

  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null); // { top, left, width, caretLeft, placement }
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const place = useCallback(() => {
    const btn = btnRef.current;
    const pop = popRef.current;
    if (!btn || !pop) return;

    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(MAX_WIDTH, vw - MARGIN * 2);
    const ph = pop.offsetHeight;

    // Horizontal — align the popover's left edge to the icon, clamp on-screen.
    let left = r.left;
    if (left + width > vw - MARGIN) left = vw - MARGIN - width;
    if (left < MARGIN) left = MARGIN;

    // Vertical — prefer below; flip above only if below overflows and above fits.
    let placement = 'bottom';
    let top = r.bottom + GAP;
    if (top + ph > vh - MARGIN && r.top - GAP - ph > MARGIN) {
      placement = 'top';
      top = r.top - GAP - ph;
    }

    // Caret tracks the icon centre, clamped inside the card.
    const center = r.left + r.width / 2;
    const caretLeft = Math.min(Math.max(center - left, 16), width - 16);

    setCoords({ top, left, width, caretLeft, placement });
  }, []);

  // Position after the popover is in the DOM (measured), before paint.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => place();
    const onScroll = () => setOpen(false);
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true); // capture: catch scrolls in any ancestor
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, place]);

  if (!topic && !titleProp && !children) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`help-tip__btn ${className}`}
        aria-label={label || `Help: ${title}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <HelpCircle size={size} />
      </button>

      {open && createPortal(
        <div
          ref={popRef}
          className={`help-tip__pop help-tip__pop--${coords?.placement || 'bottom'}`}
          role="dialog"
          aria-label={title}
          style={{
            top: coords?.top ?? -9999,
            left: coords?.left ?? -9999,
            width: coords?.width ?? MAX_WIDTH,
            visibility: coords ? 'visible' : 'hidden', // hidden until measured → no flicker
          }}
        >
          <span className="help-tip__caret" style={{ left: coords?.caretLeft ?? 16 }} />
          <div className="help-tip__title">{title}</div>
          <div className="help-tip__body">{body}</div>
        </div>,
        document.body,
      )}
    </>
  );
}
