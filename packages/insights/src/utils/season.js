// packages/insights/src/utils/season.js
/**
 * Growing-season awareness for the public climate explorers.
 *
 * Southern Hemisphere grape growing season runs 1 September – 30 April.
 * Outside that window (1 May – 31 August) the in-season explorers
 * (Phenology, Disease Pressure) show a winter holding page, and Current
 * Season drops GDD (we are outside the accumulation window).
 */

// Growing season spans Sept (9) through April (4), wrapping across the year end.
export const SEASON_START_MONTH = 9; // September
export const SEASON_END_MONTH = 4; // April (inclusive)

/**
 * Is the given date inside the growing season (1 Sept – 30 April)?
 * @param {Date} [date=new Date()]
 * @returns {boolean}
 */
export function isGrowingSeason(date = new Date()) {
  const month = date.getMonth() + 1; // 1–12
  return month >= SEASON_START_MONTH || month <= SEASON_END_MONTH;
}

/**
 * Date of the next 1 September on/after the given date. If already in
 * September or later, returns 1 Sept of the current calendar year.
 * @param {Date} [date=new Date()]
 * @returns {Date}
 */
export function nextSeasonStart(date = new Date()) {
  // In Sept–Dec the next opening is 1 Sept next year; in Jan–Aug it is this year.
  const month = date.getMonth() + 1;
  const startYear = month >= SEASON_START_MONTH ? date.getFullYear() + 1 : date.getFullYear();
  return new Date(startYear, SEASON_START_MONTH - 1, 1);
}

/**
 * Whole days until the next growing season opens. 0 when already in season.
 * @param {Date} [date=new Date()]
 * @returns {number}
 */
export function daysUntilSeasonStart(date = new Date()) {
  if (isGrowingSeason(date)) return 0;
  const start = nextSeasonStart(date);
  const d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(0, Math.round((start - d0) / (1000 * 60 * 60 * 24)));
}

/**
 * Human label for when a feature reopens, e.g. "1 September 2026".
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
export function reopenDateLabel(date = new Date()) {
  return nextSeasonStart(date).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
