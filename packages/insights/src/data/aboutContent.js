// src/data/aboutContent.js — the repetitive parts of the methodology page.
//
// Model thresholds, scenario definitions and citations are tabular data that
// happens to be rendered as prose. Holding them here keeps About.jsx readable
// and, more usefully, makes it obvious when a threshold changes: it is a diff
// on one line rather than a diff buried in markup.
//
// Everything here came from the in-app methodology modal
// (components/climate/ClimateAbout.jsx) when the About page absorbed it on
// 2026-08-20. Two numbers were CORRECTED against the database on the way; see
// the notes on HISTORICAL_FACTS below.

// --- Current season -------------------------------------------------------

export const SEASON_STATES = [
  {
    key: 'ahead',
    title: 'Ahead of baseline',
    body: 'GDD accumulation is higher than the 1986-2005 average for this point in the season. May indicate earlier phenology and harvest dates.',
  },
  {
    key: 'behind',
    title: 'Behind baseline',
    body: 'GDD accumulation is lower than average. May indicate later phenological development and extended hang time.',
  },
  {
    key: 'normal',
    title: 'Normal',
    body: 'Within ±5% of baseline accumulation. The season is tracking close to historical averages.',
  },
];

// --- Historical record ----------------------------------------------------

// The modal claimed "1986 - 2024". The database says otherwise, checked
// 2026-08-20: climate_history_monthly runs 1986-2023 (10,488 rows) and
// climate_zone_season_stats holds vintages 1987-2023 (777 rows) — vintage 1987
// being the 1986/87 season, so the two agree. The retired About page said
// "1987-2023", which was the season range quoted as if it were the monthly
// range. Stating both removes the ambiguity that produced three different
// answers.
export const HISTORICAL_FACTS = [
  { term: 'Monthly climate record', value: '1986 to Present' },
  { term: 'Complete growing seasons', value: '1986/87 through Current Season' },
  { term: 'Grid resolution', value: '1.5km Precipitation, 500m Temperature' },
];

export const HISTORICAL_VARIABLES = [
  {
    key: 'gdd10',
    title: 'Growing degree days (base 10 °C)',
    body: 'Accumulated heat above a 10 °C base across the growing season. This is the conventional viticultural measure and the one used for historical season comparison.',
    formula: 'GDD₁₀ = Σ max(0, T̅mean − 10)',
  },
  {
    key: 'rainfall',
    title: 'Rainfall',
    body: 'Total precipitation in millimetres. Growing season totals are the figure that matters most for vineyard management.',
    formula: null,
  },
];

// --- Phenology ------------------------------------------------------------

export const PHENOLOGY_NOTES = [
  {
    lead: 'Predictions are estimates.',
    body: 'Actual dates depend on site-specific conditions, vine age, crop load and management practices.',
  },
  {
    lead: 'Véraison is modelled on colour change, not on sugar.',
    body: 'The estimate is the point at which about half the berries have changed colour. It is not a soluble-solids measurement, so it is not directly comparable to a Brix or g/L reading taken in the vineyard. The thresholds behind it carry a northern hemisphere bias, which means it can report véraison later than it is actually recorded here.',
  },
  {
    lead: 'Harvest windows assume typical ripening.',
    body: 'Actual timing depends on winemaking style and on the weather between now and then.',
  },
];

export const PHENOLOGY_CITATIONS = [
  {
    authors: 'Parker, A. et al. (2011)',
    title: 'General phenological model to characterise the timing of flowering and veraison of Vitis vinifera L.',
    url: null,
  },
  {
    authors: 'Parker, A. et al. (2020)',
    title: 'Temperature-based grapevine sugar ripeness modelling for a wide range of Vitis vinifera L. cultivars.',
    url: null,
  },
];

// --- Disease pressure -----------------------------------------------------

export const DISEASE_MODELS = [
  {
    key: 'powdery',
    name: 'Powdery mildew',
    model: 'UC Davis Risk Index (Gubler et al., 1999)',
    body: 'Accumulates risk from hours spent in the favourable temperature range of 21-30 °C, decays during unfavourable conditions, and resets after a lethal heat event (≥35 °C for six hours or more).',
    bands: [
      { label: 'Low', range: '< 30' },
      { label: 'Moderate', range: '30-50' },
      { label: 'High', range: '50-60' },
      { label: 'Extreme', range: '> 60' },
    ],
  },
  {
    key: 'botrytis',
    name: 'Botrytis (grey mould)',
    model: 'González-Domínguez model (2015)',
    body: 'Calculates infection severity from wetness duration, temperature and sporulation conditions.',
    bands: [
      { label: 'Low', range: '< 25' },
      { label: 'Moderate', range: '25-50' },
      { label: 'High', range: '50-75' },
      { label: 'Extreme', range: '> 75' },
    ],
  },
  {
    key: 'downy',
    name: 'Downy mildew',
    model: '3-10 rule plus Goidanich index',
    body: 'Primary infection requires shoots ≥10 mm, 24-hour rainfall ≥10 mm and temperature ≥10 °C. Secondary spread is tracked through the Goidanich sporulation index from humidity and temperature.',
    bands: [
      { label: 'Low', range: '< 25' },
      { label: 'Moderate', range: '25-50' },
      { label: 'High', range: '50-75' },
      { label: 'Extreme', range: '> 75' },
    ],
  },
];

export const LEAF_WETNESS_RULES = [
  'Rainfall occurring - 100% wet probability',
  'Relative humidity ≥ 95% - 95% wet probability',
  'Dewpoint depression ≤ 1 °C - 90% wet probability',
  'Post-rain period of six hours or less - declining probability',
];

export const DISEASE_LIMITS = [
  {
    lead: 'Models indicate environmental risk, not actual infection.',
    body: 'Field scouting remains essential for confirming disease presence.',
  },
  {
    lead: 'Zone-level data may not reflect your microclimate.',
    body: 'Conditions at a specific site can differ substantially from the regional average.',
  },
  {
    lead: 'Spray decisions require professional judgement.',
    body: 'These indicators support a viticulturist’s judgement; they do not replace it.',
  },
  {
    lead: 'Fungicide history is not considered.',
    body: 'Actual risk depends on your spray programme and on product efficacy, neither of which these models can see.',
  },
];

export const DISEASE_CITATIONS = [
  {
    authors: 'Gubler, W.D. et al. (1999)',
    title: 'Control of Powdery Mildew Using the UC Davis Powdery Mildew Risk Index',
    url: 'https://www.apsnet.org/edcenter/apsnetfeatures/Pages/UCDavisRisk.aspx',
  },
  {
    authors: 'González-Domínguez, E. et al. (2015)',
    title: 'A Mechanistic Model of Botrytis cinerea on Grapevines That Includes Weather, Vine Growth Stage, and the Main Infection Pathways',
    url: 'https://www.researchgate.net/publication/282811797_A_Mechanistic_Model_of_Botrytis_cinerea_on_Grapevines_That_Includes_Weather_Vine_Growth_Stage_and_the_Main_Infection_Pathways',
  },
  {
    authors: 'Rossi, V. et al. (2008)',
    title: 'A mechanistic model simulating primary infections of downy mildew in grapevine',
    url: 'https://www.sciencedirect.com/science/article/abs/pii/S0304380007005881',
  },
];

// --- Projections ----------------------------------------------------------

// Verified against `climate_projections` 2026-08-20: ssp holds exactly
// SSP126 / SSP245 / SSP370, and period holds exactly the three below.
export const SSP_SCENARIOS = [
  {
    key: 'ssp126',
    badge: 'SSP1-2.6',
    name: 'Sustainability pathway',
    body: 'Strong emissions reductions, limiting warming to roughly 1.8 °C by 2100.',
  },
  {
    key: 'ssp245',
    badge: 'SSP2-4.5',
    name: 'Middle of the road',
    body: 'Intermediate emissions, with warming of roughly 2.7 °C by 2100.',
  },
  {
    key: 'ssp370',
    badge: 'SSP3-7.0',
    name: 'Regional rivalry',
    body: 'Limited mitigation, with warming of roughly 3.6 °C by 2100.',
  },
];

export const PROJECTION_PERIODS = [
  {
    key: 'near',
    label: 'Near-term',
    years: '2021-2040',
    body: 'Changes already locked in, largely regardless of emissions pathway.',
  },
  {
    key: 'mid',
    label: 'Mid-century',
    years: '2041-2060',
    body: 'Scenarios begin to diverge according to emissions.',
  },
  {
    key: 'end',
    label: 'End of century',
    years: '2080-2099',
    body: 'Large differences between low and high emissions scenarios.',
  },
];

export const PROJECTION_NOTES = [
  {
    lead: 'Projections show trends, not predictions.',
    body: 'Individual years will vary around the projected averages, sometimes widely.',
  },
  {
    lead: 'Uncertainty increases with time.',
    body: 'Near-term projections are more reliable than end-of-century ones.',
  },
  {
    lead: 'Zone averages smooth local variation.',
    body: 'Conditions at a specific vineyard site may differ from a zone-level summary.',
  },
  {
    lead: 'Climate is only one factor.',
    body: 'Vineyard success also depends on soils, management and variety selection.',
  },
];

export const PROJECTION_CITATIONS = [
  {
    authors: 'IPCC',
    title: 'AR6 Working Group I - climate projections',
    url: 'https://www.ipcc.ch/report/ar6/wg1/',
  },
  {
    authors: 'Ministry for the Environment',
    title: 'Climate Change Projections for New Zealand',
    url: 'https://environment.govt.nz/publications/climate-change-projections-for-new-zealand/',
  },
];

// --- Acknowledgement ------------------------------------------------------

export const USE_TERMS = [
  {
    lead: 'Source data is used under each publisher’s terms.',
    body: 'Council observations are accessed through their public environmental data services. Where a publisher requires written permission for commercial reuse, that permission has been obtained.',
  },
  {
    lead: 'Derived values are Auxein’s, not the publishers’.',
    body: 'Quality control, gap filling, spatial interpolation, zone aggregation and every derived metric on this site are produced by Auxein. Errors in those outputs are ours, not the observing agencies’.',
  },
  {
    lead: 'No endorsement is implied.',
    body: 'Acknowledging an organisation does not mean it has reviewed, approved or endorsed these insights.',
  },
  {
    lead: 'Going to the source.',
    body: 'For the raw observations, including full quality codes and station metadata, please approach the publishing agency directly.',
  },
];

// --- Page navigation ------------------------------------------------------

// The page is long enough now that arriving from the footer's "Data sources"
// link without a map would be unhelpful.
export const ABOUT_SECTIONS = [
  { id: 'current-season', label: 'Current season' },
  { id: 'historical', label: 'Historical record' },
  { id: 'phenology', label: 'Phenology' },
  { id: 'disease', label: 'Disease pressure' },
  { id: 'projections', label: 'Projections' },
  { id: 'acknowledgement', label: 'Acknowledgements' },
];
