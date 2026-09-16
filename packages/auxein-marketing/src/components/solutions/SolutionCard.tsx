'use client';

import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import type { Solution } from './solutionsData';

interface SolutionCardProps {
  solution: Solution;
  onClick: () => void;
  index: number;
}

export function SolutionCard({ solution, onClick, index }: SolutionCardProps) {
  const Icon = solution.icon;

  return (
    // Reveal and hover lift are both CSS now. These cards are the page's main
    // content on / and /solutions, so they must not be server-rendered at
    // opacity:0 — see the `.reveal` note in globals.css.
    <button
      onClick={onClick}
      className="group text-left w-full bg-white rounded-xl border border-olive/10 overflow-hidden hover:shadow-lg hover:border-olive/25 hover:-translate-y-1 transition-all duration-300 reveal"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      {/* Header with image or gradient fallback */}
      <div className="relative h-40 overflow-hidden">
        {solution.image ? (
          <Image
            src={solution.image}
            alt={solution.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
          />
        ) : (
          <>
            {/* Gradient fallback */}
            <div className="absolute inset-0 bg-gradient-to-br from-olive to-olive-600" />
            {/* Pattern background */}
            <div className="absolute inset-0 opacity-10">
              <svg
                className="w-full h-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <defs>
                  <pattern
                    id={`pattern-${solution.id}`}
                    width="20"
                    height="20"
                    patternUnits="userSpaceOnUse"
                  >
                    <circle cx="10" cy="10" r="1.5" fill="currentColor" />
                  </pattern>
                </defs>
                <rect
                  width="100"
                  height="100"
                  fill={`url(#pattern-${solution.id})`}
                />
              </svg>
            </div>
          </>
        )}

        {/* Dark overlay for text/icon readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

        {/* Icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <Icon className="w-8 h-8 text-white" />
          </div>
        </div>

        {/* Badge */}
        {solution.badge && (
          <div className="absolute top-3 right-3">
            <span className="px-2.5 py-1 text-xs font-semibold bg-terracotta text-white rounded-full">
              {solution.badge}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-6">
        <h3 className="text-xl font-bold text-charcoal mb-1 group-hover:text-olive transition-colors">
          {solution.title}
        </h3>
        <p className="text-sm text-olive font-semibold mb-3">
          {solution.tagline}
        </p>
        <p className="text-charcoal-600 text-sm leading-relaxed line-clamp-3 mb-4">
          {solution.description}
        </p>

        {/* CTA */}
        <div className="flex items-center gap-2 text-olive font-semibold text-sm group-hover:text-olive-600 transition-colors">
          Learn more
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </button>
  );
}