'use client';

import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, ArrowRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import type { Solution } from './solutionsData';

interface SolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  solution: Solution | null;
}

export function SolutionModal({ isOpen, onClose, solution }: SolutionModalProps) {
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
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  if (!solution) return null;

  const Icon = solution.icon;
  const isExternal = solution.cta.href.startsWith('http');

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

          {/* Modal Container - handles centering */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              className="relative w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="relative h-48 md:h-56 bg-gradient-to-br from-olive to-olive-600 shrink-0">
                {/* Pattern overlay */}
                <div className="absolute inset-0 opacity-10">
                  <svg
                    className="w-full h-full"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <pattern
                        id="modal-pattern"
                        width="10"
                        height="10"
                        patternUnits="userSpaceOnUse"
                      >
                        <circle cx="5" cy="5" r="1" fill="currentColor" />
                      </pattern>
                    </defs>
                    <rect width="100" height="100" fill="url(#modal-pattern)" />
                  </svg>
                </div>

                {/* Large Icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div
                    className="w-24 h-24 rounded-3xl bg-white/10 backdrop-blur-sm flex items-center justify-center"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                  >
                    <Icon className="w-12 h-12 text-white" />
                  </motion.div>
                </div>

                {/* Close Button */}
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-white" />
                </button>

                {/* Badge */}
                {solution.badge && (
                  <div className="absolute top-4 left-4">
                    <span className="px-3 py-1.5 text-sm font-semibold bg-terracotta text-white rounded-full">
                      {solution.badge}
                    </span>
                  </div>
                )}

                {/* Title overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/40 to-transparent">
                  <motion.h2
                    className="text-2xl md:text-3xl font-bold text-white"
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.15 }}
                  >
                    {solution.title}
                  </motion.h2>
                  <motion.p
                    className="text-olive-100 mt-1"
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    {solution.tagline}
                  </motion.p>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <motion.p
                  className="text-charcoal-600 leading-relaxed mb-6"
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.25 }}
                >
                  {solution.description}
                </motion.p>

                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <h3 className="text-lg font-bold text-charcoal mb-4">
                    Key Features
                  </h3>
                  <ul className="space-y-3">
                    {solution.features.map((feature, i) => (
                      <motion.li
                        key={i}
                        className="flex items-start gap-3 text-charcoal-600"
                        initial={{ x: -10, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.35 + i * 0.05 }}
                      >
                        <span className="w-5 h-5 rounded-full bg-olive-100 flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="w-3 h-3 text-olive" />
                        </span>
                        {feature}
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>
              </div>

              {/* Footer CTA */}
              <div className="p-6 border-t border-olive/10 bg-sand/50 shrink-0">
                {isExternal ? (
                  <a
                    href={solution.cta.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-6 py-3 
                               bg-olive hover:bg-olive-600 text-white font-semibold 
                               rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    {solution.cta.label}
                    <ExternalLink className="w-4 h-4" />
                  </a>
                ) : (
                  <Link
                    href={solution.cta.href}
                    className="flex items-center justify-center gap-2 w-full px-6 py-3 
                               bg-olive hover:bg-olive-600 text-white font-semibold 
                               rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    {solution.cta.label}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}