// src/data/proContent.js — what Auxein Insights Pro actually is.
//
// EVERY CLAIM HERE IS SOMETHING THAT SHIPS. The feature list is taken from
// `backend/services/insights_dashboard.py` (TILES and LIVE_METRICS) and from
// the placement rules in `backend/api/v1/insights_sites.py`, not from a wish
// list. Pro has never had a paying customer, so the first thing anyone buys
// must be the thing they were shown.
//
// Not claimed: `r99p` (extreme wet-day tail). It is omitted per site on purpose
// and declared in the API's `meta.omitted`, because computing it differently
// from the zone figure would compare methods dressed up as places.
//
// ONE STANDING EXCEPTION TO THE RULE ABOVE, added by Pete 2026-08-25: the
// comparison table now lists an AI agent. It is NOT built — it is item 7 of
// `docs/plans/INSIGHTS_PRO_ROADMAP_2026-08-24.md` — and the AccessGate copy was
// corrected once before for promising exactly this. It is a forward claim on a
// page that otherwise only describes what ships, and it should either land
// before anyone is sold on it or be qualified in the row.
//
// PRICING IS NOT HARDCODED IN THIS FILE, and that is not an oversight. Rates
// live on the server and reach the page through `GET /public/insights-pro/
// pricing`, so no price can appear that the server does not hold — see
// `PricingCalculator`. Access is still arranged by enquiry and invoiced through
// Xero, the same way Grow is billed; see PRO_ACCESS below.

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

// Mirrors `TILES` in insights_dashboard.py.
//
// FROST IS NOT CLAIMED ANYWHERE HERE, and it used to be. This block once made
// the case for last-spring-frost as a Pro feature — a zone cannot carry a frost
// DATE, because averaging "no frost" against "the 28th" is not a date, while a
// single cell can. The argument was sound and the underlying field was not:
// every frost metric was withdrawn from the product on 2026-08-24 because the
// count is thresholded off a lapse-retrended Tmin field that INVERTS on frost
// nights, loading frost onto the ridges and erasing it from the valley floors
// where the vines are.
//
// Nothing may put frost back on this page until the engine is fixed — see
// project_insights_metric_definitions. That includes a season-summary sentence
// that merely lists it among other metrics, which is how it survived here after
// the comparison table had already dropped it.
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
    body: 'Every season your site has had, with its own normal derived from its own history. Growing degree days, mean temperature, growing-season rain and days over 25 °C, season by season.',
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
  { feature: 'The national climate Atlas - Monthly', free: true, pro: true },
  { feature: 'The national climate Atlas - Daily', free: false, pro: true },
  { feature: 'A point you choose, resolved from the climate surface', free: false, pro: true },
  { feature: 'Your sites record and baseline - downloadable', free: false, pro: true },
  { feature: 'Your site against the regional spread', free: false, pro: true },
  { feature: 'Link your own weather station into your insights', free: false, pro: true },
  { feature: 'An AI agent trained on climate data to assist in decision making', free: false, pro: true },
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

// --- Data licensing -------------------------------------------------------

// FOR THE ORGANISATION THAT DOES NOT WANT A SITE, IT WANTS THE DATA.
// Added 2026-08-25. Insights Pro is one point on a map billed as a
// subscription; a research group, a large corporate or another platform asking
// for programmatic access to the whole archive is a different transaction with
// different obligations, and quoting them a per-site rate answers the wrong
// question.
//
// DELIBERATELY NO PRICE. Not an oversight and not coyness — the scope genuinely
// determines it. "The daily surfaces for one region" and "the full 1986-onward
// national archive with the projections" are not the same product, and putting
// a number on a public page for a thing whose shape is unknown would be a
// number nobody has agreed to honour. Every other figure on this page comes
// from the server precisely so that cannot happen.

export const DATA_LICENCE_SUBJECT = 'Auxein Insights — data licence enquiry';

export const DATA_LICENCE_BODY = [
  'Hello,',
  '',
  'I would like to talk about a data licence for Auxein Insights.',
  '',
  'Organisation:',
  'What we would use the data for:',
  'Which data (stations / surfaces / regional aggregates / projections):',
  'Coverage needed (regions, date range):',
  'How you would want it delivered (API, bulk export, scheduled):',
  '',
  'Thanks,',
].join('\n');

/** A mailto for the licensing conversation, with the scoping questions asked. */
export function dataLicenceHref() {
  return `mailto:${PRO_ENQUIRY_EMAIL}`
    + `?subject=${encodeURIComponent(DATA_LICENCE_SUBJECT)}`
    + `&body=${encodeURIComponent(DATA_LICENCE_BODY)}`;
}

export const DATA_LICENSING = {
  eyebrow: 'For larger organisations',
  title: 'Data licensing and API access',
  lede: 'Insights Pro is a subscription to one site. If what you need is the '
      + 'data itself - programmatically, in bulk, or across the whole country - '
      + 'that is a licence rather than a subscription, and it is priced on what '
      + 'you actually need.',
  // Only things that exist and are already served. Same rule as PRO_FEATURES:
  // the first thing anyone buys must be the thing they were shown.
  points: [
    {
      title: 'The station network',
      body: 'Observations from the wider station network at the cadence they are recorded.',
    },
    {
      title: 'The 500 m climate surfaces',
      body: 'The interpolated national field - the monthly archive from 1986, the seasonal accumulations, and the daily surfaces.',
    },
    {
      title: 'Regional and sub-regional aggregates',
      body: 'The same numbers the region pages are built from, weighted by your use case.',
    },
    {
      title: 'Climate projections',
      body: 'The MfE 2024 downscaled scenarios composed onto our own 1986-2005 normals, at 500 m. Optional for full annual and seasonal projections to 2100',
    },
    {
      title: 'Delivered how it suits you',
      body: 'A scoped API key, a scheduled bulk export, or a one-off extract. Lets discuss which one fits.',
    },
  ],
  // THIS PARAGRAPH IS NOT A DISCLAIMER, IT IS THE FIRST THING A LICENCE HAS TO
  // SETTLE. Parts of the archive are built on third-party data carrying their
  // own terms — the MfE projections are CC BY 4.0, the land and coastline
  // layers are LINZ, and the station records belong to the councils that
  // operate them. What we can sub-licence differs by layer, and finding that
  // out after signing is far worse than being told before.
  note: 'Some layers are derived from third-party data with their own licence '
      + 'terms - the climate projections, the land and coastline layers, and '
      + 'the council station records each carry their own. What can be '
      + 'sub-licensed differs between them, so that is the first thing we work '
      + 'through with you rather than the last.',
  cta: 'Talk to us about a licence',
};

// --- Grow relationship ----------------------------------------------------

// Confirmed 2026-08-20: Pro is included with Grow, and priced only for direct
// subscribers. This is already how the code behaves — `entitlements.is_pro`
// treats tier 'grow' as Pro with no expiry, following the relationship rather
// than a purchase — so the page is describing the system, not promising a
// change to it.
export const GROW_INCLUDED_NOTE =
  'Auxein Grow customers already have Insights Pro. It comes with your Grow subscription at no additional cost, and follows it for as long as it runs.';
