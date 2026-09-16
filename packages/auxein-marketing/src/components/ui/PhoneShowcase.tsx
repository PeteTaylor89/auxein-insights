'use client';

import { Maximize2 } from 'lucide-react';
import { PhoneFrame } from '@/components/ui/PhoneFrame';
import { LightboxShell, useLightbox } from '@/components/ui/Lightbox';

export interface PhoneShot {
  src: string;
  alt: string;
  title: string;
}

/** A row of phone screenshots, each clickable to open full size. */
export function PhoneShowcase({ shots }: { shots: PhoneShot[] }) {
  const lightbox = useLightbox(shots.length);
  const open = lightbox.index === null ? null : shots[lightbox.index];

  return (
    <>
      <div className="flex flex-wrap justify-center gap-8 lg:gap-12 mb-12">
        {shots.map((shot, i) => (
          <div
            key={shot.title}
            className="flex flex-col items-center reveal"
            style={{ animationDelay: `${i * 0.15}s` }}
          >
            <button
              type="button"
              onClick={() => lightbox.open(i)}
              aria-label={`View ${shot.title} full size`}
              className="group relative rounded-[1.9rem] transition-transform duration-200 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive-300 focus-visible:ring-offset-4 focus-visible:ring-offset-charcoal"
            >
              <PhoneFrame
                src={shot.src}
                alt={shot.alt}
                sizes="(min-width: 640px) 220px, 200px"
                className="w-[200px] sm:w-[220px]"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-[1.4rem] bg-charcoal-950/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                <Maximize2 className="h-7 w-7 text-white drop-shadow" />
              </span>
            </button>
            <p className="mt-4 text-sm font-medium text-charcoal-300">
              {shot.title}
            </p>
          </div>
        ))}
      </div>

      <LightboxShell
        state={lightbox}
        count={shots.length}
        label={open?.title ?? 'Screenshot'}
        caption={open?.title}
      >
        {open && (
          <PhoneFrame
            src={open.src}
            alt={open.alt}
            variant="lightbox"
            sizes="(min-width: 768px) 340px, 80vw"
            className="pointer-events-auto"
          />
        )}
      </LightboxShell>
    </>
  );
}
