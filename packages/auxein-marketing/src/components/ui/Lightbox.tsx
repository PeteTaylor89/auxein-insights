'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * Shared "click to maximise" plumbing.
 *
 * The state lives with the caller so a set of triggers can be spread across a
 * page (the product tour puts one per section) and still step between each
 * other. Escape closes, left and right arrows move, focus returns to whichever
 * trigger opened it.
 */
export interface LightboxState {
  index: number | null;
  open: (i: number) => void;
  close: () => void;
  step: (delta: number) => void;
}

export function useLightbox(count: number): LightboxState {
  const [index, setIndex] = useState<number | null>(null);
  // Whatever had focus when the lightbox opened, so closing puts it back
  // without the caller having to wire a ref to every trigger.
  const opener = useRef<HTMLElement | null>(null);

  const open = useCallback((i: number) => {
    opener.current = document.activeElement as HTMLElement | null;
    setIndex(i);
  }, []);

  const close = useCallback(() => {
    opener.current?.focus();
    setIndex(null);
  }, []);

  const step = useCallback(
    (delta: number) =>
      setIndex((current) =>
        current === null ? current : (current + delta + count) % count
      ),
    [count]
  );

  useEffect(() => {
    if (index === null) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [index, close, step]);

  return { index, open, close, step };
}

/**
 * Backdrop and chrome for a maximised item. Children are the framed content.
 * Deliberately on framer-motion: nothing renders while closed, so this sits
 * outside the SSR opacity:0 problem the .reveal classes exist to avoid.
 */
export function LightboxShell({
  state,
  count,
  label,
  caption,
  children,
}: {
  state: LightboxState;
  count: number;
  label: string;
  caption?: string;
  children: React.ReactNode;
}) {
  const { index, close, step } = state;

  return (
    <AnimatePresence>
      {index !== null && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-charcoal-950/85 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            aria-hidden="true"
          />

          <motion.div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-4 pointer-events-none"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            role="dialog"
            aria-modal="true"
            aria-label={label}
          >
            {children}
            {caption && (
              <p className="text-sm font-medium text-charcoal-200">{caption}</p>
            )}
          </motion.div>

          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="fixed top-4 right-4 z-50 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="h-5 w-5" />
          </button>

          {count > 1 && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous"
                className="fixed top-1/2 left-2 z-50 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:left-6"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next"
                className="fixed top-1/2 right-2 z-50 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:right-6"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
