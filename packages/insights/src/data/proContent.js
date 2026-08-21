// src/data/proContent.js — what Auxein Insights Pro actually is.
//
// EVERY CLAIM HERE IS SOMETHING THAT SHIPS. The feature list is taken from
// `backend/services/insights_dashboard.py` (TILES and LIVE_METRICS) and from
// the placement rules in `backend/api/v1/insights_sites.py`, not from a wish
// list. Pro has never had a paying customer, so the first thing anyone buys
// must be the thing they were shown.
//
// Two things are deliberately NOT claimed:
//   - The AI assistant. It is a later phase, and the AccessGate copy was
//     already corrected once for promising it.
//   - `r99p` (extreme wet-day tail). It is omitted per site on purpose and
//     declared in the API's `meta.omitted`, because computing it differently
//     from the zone figure would compare methods dressed up as places.
//
// PRICING IS NOT IN THIS FILE, and that is not an oversight. No price for
// Insights Pro exists anywhere in the product, and inventing one to fill a
// layout would put a number on a public page that nobody has agreed to honour.
// Access is arranged by enquiry and invoiced through Xero, the same way Grow
// is billed — see PRO_ACCESS below.

// The address for public Insights enquiries. NOT grow@ — the two inboxes are
// deliberately separate and conflating them has bitten before.
export const PRO_ENQUIRY_EMAIL = 'insights@auxein.co.nz';

export const PRO_ENQUIRY_SUBJECT = 'Auxein Insights Pro — access enquiry';

export const PRO_ENQUIRY_BODY = [
  'Hello,',
  '',
  'I would like to know more about Auxein Insights Pro.',
  '',
  'Vineyard / business:',
  'Region:',
  'Number of sites I would want to monitor:',
  '',
  'Thanks,',
].join('\n');

/** A mailto that arrives with the questions already asked. */
export function proEnquiryHref() {
  return `mailto:${PRO_ENQUIRY_EMAIL}`
    + `?subject=${encodeURIComponent(PRO_ENQUIRY_SUBJECT)}`
    + `&body=${encodeURIComponent(PRO_ENQUIRY_BODY)}`;
}

// --- What you get ---------------------------------------------------------

// Mirrors `TILES` in insights_dashboard.py. The last-spring-frost entry is the
// one worth reading twice: a zone CANNOT carry it, because averaging "no
// frost" against "the 28th" is not a date. A single cell can.
export const PRO_FEATURES = [
  {
    key: 'point',
    icon: 'MapPin',
    title: 'Your own point, not a region',
    body: 'Place a marker on your vineyard or farm and Pro resolves the climate surface to that point - sampled where you actually grow, instead of an average across a whole region.',
  },
  {
    key: 'record',
    icon: 'History',
    title: 'Its whole record, back to 1986',
    body: 'Every season your site has had, with its own normal derived from its own history. Growing degree days, mean temperature, growing-season rain, frost nights and days over 25 °C, season by season.',
  },
  {
    key: 'band',
    icon: 'BarChart3',
    title: 'How you sit against everyone around you',
    body: 'Your season drawn over the band that 90% of the vineyards in your region fall inside. Being outside that band is the thing worth knowing, and only the spread can tell you.',
  },
  {
    key: 'anomaly',
    icon: 'TrendingUp',
    title: 'Month-by-month anomalies',
    body: 'Every month against your site’s own normal, computed on the server against one baseline so the numbers on the chart and the numbers on the tiles cannot drift apart.',
  },
  {
    key: 'live',
    icon: 'Radio',
    title: 'The season in progress',
    body: 'The current season measured against your site’s archive, each live metric computed with the same definition as the historical row it is compared to.',
  },
];

// --- Free vs Pro ----------------------------------------------------------

// Honest on both sides. The free tier is genuinely good and saying so is not a
// weakness — it is why anyone trusts the paid claim.
//
// A ROW MAY CARRY A `note`, AND ONE OF THEM HAS TO.
//
// Coverage is not uniform across regions, and the row that says "current
// season, phenology and disease pressure" was making one unqualified claim
// about three things that are not equally available. Measured 2026-08-21
// against 23 mapped zones:
//
//     regional climate history      23 of 23
//     projections                   23 of 23
//     current season                14 of 23   (needs a live station network)
//     phenology                     13 of 23
//     disease pressure              12 of 23
//
// Ten zones carry both models, eight carry neither, and five carry exactly one.
// The eight with neither include Martinborough, Waiheke, Auckland and Upper
// Wairau and Southern Valleys — which is to say core Marlborough and several of
// the regions most likely to be reading this page. Someone subscribing BECAUSE
// of that row would be entitled to feel misled.
//
// The note deliberately carries no count. Coverage moves as the station network
// grows, and a number here would rot silently while reading as a commitment.
export const PRO_COMPARISON = [
  { feature: 'Regional climate history and projections', free: true, pro: true },
  {
    feature: 'Current season, phenology and disease pressure by region',
    free: true,
    pro: true,
    note: 'These run on live weather stations, so they are only available in regions where the network supports them — not everywhere yet. Your region’s page shows what it currently carries.',
  },
  { feature: 'The national climate Atlas', free: true, pro: true },
  { feature: 'A point you choose, resolved from the climate surface', free: false, pro: true },
  { feature: 'That point’s own record and its own normal', free: false, pro: true },
  { feature: 'Last spring frost as a date', free: false, pro: true },
  { feature: 'Your site against the regional spread', free: false, pro: true },
];

// --- How access works -----------------------------------------------------

// Deliberately explicit about there being no checkout. A page that implies
// instant self-serve and then hands over a mailto is worse than one that says
// what actually happens.
export const PRO_ACCESS = [
  {
    step: '1',
    title: 'Tell us about your site',
    body: 'Get in touch with your region and how many sites you would want to monitor. There is no card form — access is arranged directly.',
  },
  {
    step: '2',
    title: 'We confirm and invoice',
    body: 'We agree the arrangement and invoice through Xero, the same way every other Auxein subscription is billed.',
  },
  {
    step: '3',
    title: 'Place your point',
    body: 'Your account is enabled, you drop a marker on your vineyard, and the extraction runs. It usually takes a few minutes.',
  },
];

// --- Grow relationship ----------------------------------------------------

// Confirmed 2026-08-20: Pro is included with Grow, and priced only for direct
// subscribers. This is already how the code behaves — `entitlements.is_pro`
// treats tier 'grow' as Pro with no expiry, following the relationship rather
// than a purchase — so the page is describing the system, not promising a
// change to it.
export const GROW_INCLUDED_NOTE =
  'Auxein Grow customers already have Insights Pro. It comes with your Grow subscription at no additional cost, and follows it for as long as it runs.';
