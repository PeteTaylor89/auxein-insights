import Image from 'next/image';
import { clsx } from 'clsx';

/**
 * Renders an unframed phone screenshot inside a CSS phone body.
 *
 * The screenshots in public/images/Pro are raw 828x1792 captures, so the bezel,
 * corner radii and notch are drawn here rather than baked into the image.
 * Radii are concentric: outer = inner + bezel.
 */
const variants = {
  /** In-page thumbnail, ~200-220px wide */
  card: {
    body: 'p-2 rounded-[1.9rem]',
    screen: 'rounded-[1.4rem] w-full',
    notch: 'h-[0.9rem] rounded-b-[0.6rem]',
  },
  /** Maximised view, sized by height so it always fits the viewport */
  lightbox: {
    body: 'p-3 rounded-[2.5rem] w-fit',
    screen: 'rounded-[1.8rem] h-[min(74vh,720px)] w-auto',
    notch: 'h-[1.15rem] rounded-b-[0.75rem]',
  },
};

interface PhoneFrameProps {
  src: string;
  alt: string;
  variant?: keyof typeof variants;
  sizes?: string;
  className?: string;
}

export function PhoneFrame({
  src,
  alt,
  variant = 'card',
  sizes = '220px',
  className,
}: PhoneFrameProps) {
  const v = variants[variant];

  return (
    <div
      className={clsx(
        'bg-charcoal-950 shadow-2xl ring-1 ring-white/10',
        v.body,
        className
      )}
    >
      <div
        className={clsx(
          'relative aspect-[828/1792] overflow-hidden bg-charcoal-800',
          v.screen
        )}
      >
        <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" />
        <div
          aria-hidden="true"
          className={clsx(
            'absolute top-0 left-1/2 w-1/2 -translate-x-1/2 bg-charcoal-950',
            v.notch
          )}
        />
      </div>
    </div>
  );
}
