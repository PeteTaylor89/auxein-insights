'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, LayoutGrid, ChevronDown } from 'lucide-react';
import { growFeatureGroups, growFeatureCount } from './Growfeaturesdata';

// ─── Trigger Link ─────────────────────────────────────────────────────────────

interface GrowFeaturesLinkProps {
  className?: string;
}

export function GrowFeaturesLink({ className }: GrowFeaturesLinkProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 text-olive font-semibold text-sm
                    underline-offset-2 hover:underline transition-colors hover:text-olive-600
                    ${className ?? ''}`}
      >
        <LayoutGrid className="w-4 h-4 shrink-0" />
        View all {growFeatureCount} features
        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>

      <GrowFeaturesModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface GrowFeaturesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GrowFeaturesModal({ isOpen, onClose }: GrowFeaturesModalProps) {
  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      // Focus search after animation settles
      setTimeout(() => searchRef.current?.focus(), 200);
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setActiveGroup(null);
    }
  }, [isOpen]);

  const query = search.toLowerCase().trim();

  const filteredGroups = growFeatureGroups
    .filter((g) => activeGroup === null || g.id === activeGroup)
    .map((g) => ({
      ...g,
      features: query
        ? g.features.filter(
            (f) =>
              f.name.toLowerCase().includes(query) ||
              f.description.toLowerCase().includes(query)
          )
        : g.features,
    }))
    .filter((g) => g.features.length > 0);

  const totalVisible = filteredGroups.reduce(
    (n, g) => n + g.features.length,
    0
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              className="relative w-full max-w-3xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* ── Header ── */}
              <div className="shrink-0 px-6 pt-6 pb-4 border-b border-olive/5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-3xl font-bold text-olive">
                      Auxein Grow - Full Feature List
                    </h2>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 -mt-1 -mr-2 rounded-full text-charcoal-400 hover:text-charcoal hover:bg-sand transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <br />
                {/* Group filter pills */}
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    onClick={() => setActiveGroup(null)}
                    className={`px-5 py-2 rounded-full text-xs font-semibold transition-all duration-150
                      ${activeGroup === null
                        ? 'bg-olive text-white'
                        : 'bg-olive/10 text-olive hover:bg-olive/20'
                      }`}
                  >
                    All
                  </button>
                  {growFeatureGroups.map((g) => {
                    const Icon = g.icon;
                    return (
                      <button
                        key={g.id}
                        onClick={() =>
                          setActiveGroup((cur) => (cur === g.id ? null : g.id))
                        }
                        className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-semibold transition-all duration-150
                          ${activeGroup === g.id
                            ? 'bg-olive text-white'
                            : 'bg-olive/10 text-olive hover:bg-olive/20'
                          }`}
                      >
                        <Icon className="w-3 h-3" />
                        {g.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Scrollable Content ── */}
              <div className="flex-1 overflow-y-auto px-8 py-4">
                {filteredGroups.length === 0 ? (
                  <div className="text-center py-18 text-charcoal-400">
                    <Search className="w-8 h-8 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">No features match &ldquo;{search}&rdquo;</p>
                    <button
                      onClick={() => { setSearch(''); setActiveGroup(null); }}
                      className="mt-2 text-sm text-olive hover:underline"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {filteredGroups.map((group, gi) => {
                      const Icon = group.icon;
                      return (
                        <motion.div
                          key={group.id}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: gi * 0.04 }}
                        >
                          {/* Group heading */}
                          <div className="flex items-center gap-2.5 mb-4">
                            <div className="w-8 h-8 rounded-lg bg-olive/10 flex items-center justify-center shrink-0">
                              <Icon className="w-4 h-4 text-olive" />
                            </div>
                            <h3 className="text-base font-bold text-charcoal">
                              {group.label}
                            </h3>
                            <span className="text-xs font-semibold text-charcoal-400 ml-auto">
                              {group.features.length}
                            </span>
                          </div>

                          {/* Feature rows */}
                          <div className="grid sm:grid-cols-2 gap-3">
                            {group.features.map((feature, fi) => (
                              <motion.div
                                key={feature.name}
                                className="p-4 rounded-xl border border-olive/10 hover:border-olive/25
                                           hover:shadow-sm bg-white transition-all duration-200"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: gi * 0.04 + fi * 0.03 }}
                              >
                                <p className="text-sm font-semibold text-charcoal mb-1">
                                  {feature.name}
                                </p>
                                <p className="text-sm text-charcoal-500 leading-relaxed">
                                  {feature.description}
                                </p>
                              </motion.div>
                            ))}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Footer ── */}
              <div className="shrink-0 px-6 py-4 border-t border-olive/10 bg-sand/50 flex items-center justify-between">
                <p className="text-xs text-charcoal-400">
                  Coming May 2026 · Mobile-first · Built for NZ viticulture
                </p>
                <a
                  href="/contact/?inquiry=insights-pro"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-olive hover:bg-olive-600
                             text-white text-sm font-semibold rounded-lg transition-all duration-200
                             shadow-sm hover:shadow-md"
                >
                  Join the Waitlist
                </a>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}