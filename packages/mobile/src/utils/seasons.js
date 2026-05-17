// mobile/src/utils/seasons.js — date → season utility
// Default hemisphere is 'south' (Auxein is NZ-based).

export const SEASONS = ['summer', 'autumn', 'winter', 'spring'];

/**
 * seasonOf(date, hemisphere) -> 'summer' | 'autumn' | 'winter' | 'spring'
 *
 * Uses meteorological seasons (full-month buckets), not astronomical.
 * Southern hemisphere is offset by 6 months from northern.
 */
export function seasonOf(date = new Date(), hemisphere = 'south') {
  const m = date.getMonth(); // 0..11 (Jan..Dec)
  // Northern hemisphere reference:
  //   Dec/Jan/Feb -> winter, Mar/Apr/May -> spring, Jun/Jul/Aug -> summer, Sep/Oct/Nov -> autumn
  const north = (
    (m === 11 || m === 0 || m === 1) ? 'winter' :
    (m >= 2 && m <= 4)                ? 'spring' :
    (m >= 5 && m <= 7)                ? 'summer' :
                                        'autumn'
  );
  if (hemisphere === 'south') {
    // Flip winter<->summer, spring<->autumn
    return { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' }[north];
  }
  return north;
}
