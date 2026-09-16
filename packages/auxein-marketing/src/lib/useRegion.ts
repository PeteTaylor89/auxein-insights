'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_REGION, type Region } from '@/lib/pricing';

/**
 * Country detection for a statically exported site.
 *
 * The site is `output: 'export'` on CloudFront, so nothing server-side sees the
 * viewer's IP when the HTML is produced - the same index.html is served to
 * everyone. Detection therefore has to happen in the browser, and it MUST NOT
 * change the first render: this site renders sections blank when hydration
 * fails, so a server/client mismatch is expensive. Hence DEFAULT_REGION on the
 * first paint, with the real region applied in an effect afterwards.
 *
 * Resolution order:
 *
 *   1. The `auxein_country` cookie. This is the true IP-based signal, set at
 *      the edge from CloudFront-Viewer-Country. Not deployed yet - the hook
 *      prefers it the moment it appears, no code change needed.
 *   2. The browser's IANA time zone. Strong in practice and costs nothing:
 *      no network call, no third party, nothing to block.
 *   3. The browser's language tags, for a region subtag like en-AU.
 *
 * Everything else stays on DEFAULT_REGION.
 */
const COUNTRY_COOKIE = 'auxein_country';

const SUPPORTED: Record<string, Region> = { NZ: 'NZ', AU: 'AU' };

function fromCookie(): Region | null {
  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${COUNTRY_COOKIE}=([A-Za-z]{2})`)
    );
    return match ? SUPPORTED[match[1].toUpperCase()] ?? null : null;
  } catch {
    return null;
  }
}

function fromTimeZone(): Region | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return null;
    if (tz.startsWith('Australia/') || tz === 'Antarctica/Macquarie') return 'AU';
    if (tz === 'Pacific/Auckland' || tz === 'Pacific/Chatham') return 'NZ';
    return null;
  } catch {
    return null;
  }
}

function fromLanguage(): Region | null {
  try {
    const tags = navigator.languages?.length
      ? navigator.languages
      : [navigator.language];
    for (const tag of tags) {
      const region = tag.split('-')[1]?.toUpperCase();
      if (region && SUPPORTED[region]) return SUPPORTED[region];
    }
    return null;
  } catch {
    return null;
  }
}

export function useRegion(): Region {
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);

  useEffect(() => {
    const detected = fromCookie() ?? fromTimeZone() ?? fromLanguage();
    if (detected && detected !== DEFAULT_REGION) setRegion(detected);
  }, []);

  return region;
}
