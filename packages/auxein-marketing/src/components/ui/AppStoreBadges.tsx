import Image from 'next/image';
import { clsx } from 'clsx';
import {
  GROW_APP_STORE_URL,
  GROW_PLAY_STORE_URL,
  APP_STORE_BADGE,
  PLAY_STORE_BADGE,
} from '@/lib/links';

interface AppStoreBadgesProps {
  className?: string;
  /** Rendered badge height in px. Apple's badge art is slightly taller than
   *  Google's, so the Google badge is nudged up to match cap-heights. */
  height?: number;
}

export function AppStoreBadges({ className, height = 44 }: AppStoreBadgesProps) {
  return (
    <div className={clsx('flex flex-wrap items-center gap-3', className)}>
      <a
        href={GROW_APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Download Auxein Grow on the App Store"
        className="transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive rounded-lg"
      >
        <Image
          src={APP_STORE_BADGE}
          alt="Download on the App Store"
          width={498}
          height={167}
          style={{ height, width: 'auto' }}
        />
      </a>
      <a
        href={GROW_PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Get Auxein Grow on Google Play"
        className="transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive rounded-lg"
      >
        <Image
          src={PLAY_STORE_BADGE}
          alt="Get it on Google Play"
          width={478}
          height={142}
          style={{ height: height * 1.14, width: 'auto' }}
        />
      </a>
    </div>
  );
}
