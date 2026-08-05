// components/ToastProvider.jsx — Web toast + undo host.
//
// Built for the Greystone beta ask "an undo option would be a nice safety net":
// web had no way to show a transient message at all, so destructive actions
// either used window.confirm or gave no feedback whatsoever.
//
// Two undo shapes, because the backend forces the distinction:
//
//   onUndo   — the mutation ALREADY happened; this reverses it. Use for things
//              that are genuinely reversible server-side (a status change, a
//              reschedule: just write the old value back).
//
//   onExpire — the mutation has NOT happened yet; it fires when the undo window
//              closes untouched. Use for DESTRUCTIVE actions. DELETE /tasks/{id}
//              is a hard `db.delete(task)` with no restore endpoint, so a delete
//              that has already run cannot be undone at all. Instead the caller
//              drops the row from local state and the real request is deferred
//              until the window lapses. Undo then costs zero requests.
//
// Dismissing a toast COMMITS a deferred action — closing the message means "yes,
// get on with it", not "cancel". Only the Undo button cancels.
//
// The provider is mounted at the App root, so these timers survive page
// navigation — a deferred delete still fires after the user moves on. A full
// tab close drops it, which fails safe (the task simply survives).
//
// Mobile already has its own Toast component; this is intentionally separate
// rather than shared, because mobile cannot import from @vineyard/shared.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Undo2, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import './Toast.css';

const ToastContext = createContext(null);

// 10s, not the usual 3–5. These toasts carry an undo for destructive work, and
// a deferred delete does not commit until the window closes — so the window is
// the safety net, and it needs to be long enough to notice and react to.
const DEFAULT_DURATION = 10000;

// How often the countdown ticks. 100ms keeps the ring motion smooth without
// re-rendering the whole strip every frame.
const TICK_MS = 100;

const TONE_ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

let nextId = 1;

/**
 * One toast row. Owns its own display ticker so the countdown animates without
 * re-rendering every other toast; the authoritative expiry timer still lives in
 * the provider, and this only reads the clock.
 */
function ToastItem({ toast, onUndo, onDismiss }) {
  const { deadline, duration, tone, message, onUndo: hasUndo, onExpire, undoLabel } = toast;
  const reversible = Boolean(hasUndo || onExpire);
  const [remaining, setRemaining] = useState(
    deadline ? Math.max(0, deadline - Date.now()) : 0,
  );

  useEffect(() => {
    if (!deadline) return undefined;
    const handle = setInterval(() => {
      setRemaining(Math.max(0, deadline - Date.now()));
    }, TICK_MS);
    return () => clearInterval(handle);
  }, [deadline]);

  const Icon = TONE_ICONS[tone] || Info;
  const secondsLeft = Math.ceil(remaining / 1000);
  const fraction = duration > 0 ? remaining / duration : 0;

  return (
    <div className={`toast toast--${tone} ${reversible ? 'toast--undoable' : ''}`} role="status">
      <div className="toast-row">
        <Icon size={18} className="toast-icon" />
        <span className="toast-message">{message}</span>

        {reversible && deadline && (
          <span className="toast-countdown" aria-hidden="true">{secondsLeft}s</span>
        )}

        {reversible && (
          <button type="button" className="toast-undo" onClick={onUndo}>
            <Undo2 size={15} /> {undoLabel}
          </button>
        )}

        <button
          type="button"
          className="toast-dismiss"
          onClick={onDismiss}
          title={onExpire
            ? 'Close this message and apply the change now'
            : 'Close this message'}
        >
          <X size={14} /> Dismiss
        </button>
      </div>

      {deadline && (
        <div className="toast-progress">
          <div className="toast-progress-bar" style={{ transform: `scaleX(${fraction})` }} />
        </div>
      )}
    </div>
  );
}

function runDeferred(fn) {
  if (!fn) return;
  Promise.resolve()
    .then(fn)
    .catch((err) => console.error('Deferred toast action failed:', err));
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  // id -> timeout handle, so dismissing early cancels the pending auto-hide.
  const timers = useRef(new Map());
  // Mirror of `toasts` for lookups inside callbacks. Reading state in a setState
  // updater would be impure and double-fire deferred actions under StrictMode.
  const toastsRef = useRef([]);
  toastsRef.current = toasts;

  const drop = useCallback((id) => {
    const handle = timers.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // User closed the message — commit any deferred work.
  const dismiss = useCallback((id) => {
    const target = toastsRef.current.find((t) => t.id === id);
    drop(id);
    runDeferred(target?.onExpire);
  }, [drop]);

  const show = useCallback((message, options = {}) => {
    const {
      tone = 'info',
      duration = DEFAULT_DURATION,
      onUndo = null,
      onExpire = null,
      undoLabel = 'Undo',
    } = options;

    const id = nextId++;
    setToasts((prev) => [...prev, {
      id, message, tone, onUndo, onExpire, undoLabel,
      duration,
      // Absolute deadline so the countdown stays truthful even if a render is
      // delayed — it reads the clock rather than counting its own ticks.
      deadline: duration > 0 ? Date.now() + duration : null,
    }]);

    if (duration > 0) {
      const handle = setTimeout(() => {
        timers.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
        runDeferred(onExpire);
      }, duration);
      timers.current.set(id, handle);
    }

    return id;
  }, []);

  // Undo cancels the deferred action rather than committing it.
  const handleUndo = useCallback(async (toast) => {
    // Remove first: undo is one-shot, and leaving the button live while an
    // async reversal is in flight invites a double-undo.
    drop(toast.id);
    if (!toast.onUndo) return;
    try {
      await toast.onUndo();
    } catch (err) {
      console.error('Undo failed:', err);
      show('Could not undo that', { tone: 'error' });
    }
  }, [drop, show]);

  // Clear pending timers on unmount so a teardown mid-window can't fire setState
  // against a dead tree. Deferred actions are intentionally NOT committed here —
  // dropping a pending delete is the safe failure.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((handle) => clearTimeout(handle));
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({
    show,
    dismiss,
    success: (msg, opts) => show(msg, { ...opts, tone: 'success' }),
    error: (msg, opts) => show(msg, { ...opts, tone: 'error', duration: opts?.duration ?? 7000 }),
  }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toast-host" role="region" aria-label="Notifications">
          {toasts.map((t) => (
            <ToastItem
              key={t.id}
              toast={t}
              onUndo={() => handleUndo(t)}
              onDismiss={() => dismiss(t.id)}
            />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

/**
 * Returns { show, success, error, dismiss }.
 *
 * Safe to call outside a provider — falls back to a console-only shim so a
 * component rendered in isolation (or a test) doesn't explode.
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  return {
    show: (m) => console.log('[toast]', m),
    success: (m) => console.log('[toast:success]', m),
    error: (m) => console.warn('[toast:error]', m),
    dismiss: () => {},
  };
}

export default ToastProvider;
