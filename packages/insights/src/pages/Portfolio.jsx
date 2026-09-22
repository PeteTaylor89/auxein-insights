// src/pages/Portfolio.jsx — every site on one account, one row each.
//
// A per-site dashboard answers "how is this block doing". A client with 67
// monitored sites does not have that question; they have "which of my sites
// needs looking at today", and no number of single-site pages answers it. So
// this is one row per site with each model's headline, sorted by whichever
// column the reader cares about.
//
// ## Sorting and filtering are LOCAL
//
// The whole set arrives in one request. 67 rows is a payload a browser sorts
// instantly and a server round-trips slowly, so a re-sort costs nothing — and
// it means the CSV export and the table can never disagree about what the
// current view is, because both come from the same server-side builder.
//
// ## Absent is not zero, anywhere on this page
//
// A site with no season yet, no disease score, or no long-term average shows a
// dash. Rendering 0 would be a claim: zero GDD accumulated, zero disease
// pressure, an average of nothing. Before 1 September every season column on
// this page is legitimately empty, and it has to read that way.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Download, Loader, AlertTriangle, Search, ArrowUpDown, MapPin, Info,
  Gauge,
} from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import AccessGate from '../components/auth/AccessGate';
import {
  listAccounts, getAccountPortfolio, downloadAccountPortfolioCsv,
  downloadAccountTimeseriesCsv, getAccountReference,
  downloadAccountReferenceCsv,
} from '../services/proSiteService';
import SitePopup from '../components/pro/SitePopup';
import ReferenceDaily from '../components/pro/ReferenceDaily';
import ModelsAbout from '../components/pro/ModelsAbout';
import { usePublicAuth } from '../contexts/PublicAuthContext';
import { isPro } from '../utils/entitlements';
import useDocumentMeta from '../hooks/useDocumentMeta';
import './Portfolio.css';

// The Models dialog is BUILT AND WIRED but not exposed yet — its references and
// equations are being reviewed before a client sees them. Flip this to true to
// ship it; nothing else needs to change. `ModelsAbout` stays mounted either way
// so the flag is the only thing between here and shipping it.
const SHOW_MODELS = false;

const RISK_ORDER = { low: 0, moderate: 1, medium: 1, high: 2, extreme: 3 };

const SITE_TYPE_LABEL = {
  regional: 'Regional',
  sub_regional: 'Sub-regional',
  phenology: 'Phenology',
};

const num = (v, dp = 0) => (v === null || v === undefined
  ? '—' : Number(v).toLocaleString(undefined, {
    minimumFractionDigits: dp, maximumFractionDigits: dp,
  }));

const shortDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

// Signed, and absent stays absent. A site with no season and a site running
// exactly to its average are different facts and must not share a cell.
//
// `dp` matches whatever the two operands are shown to. A "+1" sitting between a
// 3.0 and a 1.6 reads as arithmetic that does not add up.
const signed = (v, dp = 0) => (v === null || v === undefined
  ? '—' : `${v > 0 ? '+' : ''}${Number(v).toLocaleString(undefined, {
    minimumFractionDigits: dp, maximumFractionDigits: dp,
  })}`);

// A VARIETY THE MODEL WAS NEVER FITTED FOR IS NOT A MISSING MEASUREMENT, and a
// bare dash says neither. The two phenology models carry different variety sets:
// Pinot gris has a budburst calibration and no stage thresholds, so those sites
// can show a budburst date and must show nothing for flowering, véraison and
// harvest; Cabernet franc, Cabernet Sauvignon, Grenache and Riesling are the
// reverse. Without a word here a client reads both as data we failed to collect.
//
// A site that names NO variety keeps the dash. There is nothing to say about a
// model that was never asked to run.
//
// TWO REASONS FOR A BLANK, AND THEY ARE NOT THE SAME CLAIM. A variety the
// platform holds no code for cannot select EITHER model, however well
// calibrated they are — the four Pinot gris sites are exactly this, and Pinot
// gris DOES have a budburst calibration, so telling that reader "not
// calibrated" would be false. A coded variety one model was never fitted for is
// the other case, and it gets the other word.
const noModel = (s) => {
  if (!s.variety) return '—';
  const label = s.variety_modelled ? 'not calibrated' : 'variety not modelled';
  const why = s.variety_modelled
    ? `This model is not calibrated for ${s.variety}`
    : `${s.variety} is not one of the varieties this platform models`;
  return <span className="portfolio__uncal" title={why}>{label}</span>;
};

// --- the Reference tab -------------------------------------------------------
//
// THE MEASURED EQUIVALENT OF EACH SITE, which is a different claim from every
// other number this client is shown.
//
// The Sites tab is modelled throughout: the daily record comes from the 500 m
// surface and the disease models run on an hourly series interpolated from
// neighbouring stations. BSI asked for the other thing — the observed record of
// one real station as close as possible to each Regional site, to read the
// estimate against. So nothing on this tab is adjusted toward the site, and the
// note above the table says so in the API's own words rather than the
// component's.
//
// ## ONE STATION PER VARIABLE, NOT ONE PER SITE
//
// "One to one" holds at the MAST and never at the row. Councils register each
// sensor as its own station — CODC Cromwell is four station ids on one mast at
// 212 m — and a nominated mast may not measure a variable at all: Greystone
// Base has no thermometer, so Waipara West's temperature is borrowed from a
// block 67 m below the site and marked `fill`. Both facts are unrepresentable
// if a site has a single station, which is why the pairing is keyed per
// variable in the database and rendered per variable here.
//
// ## Distance and elevation travel with every cell
//
// The whole claim is "equivalent", and those two numbers are what bound it. At
// the engine's own 0.6 degC/100 m a 67 m difference is ~0.4 degC before
// anything else is considered, and a signed delta is the only form that says
// which way the bias runs.

// Below this a pairing has stopped being a description of the site. Not a
// refusal — the client chose these stations and Martinborough's best option is
// genuinely 14.7 km away — but it is worth marking rather than leaving the
// reader to compare eight numbers by eye.
const REFERENCE_FAR_KM = 10;

const VARIABLE_ORDER = ['temp', 'humidity', 'rainfall', 'solar'];
const VARIABLE_LABEL = {
  temp: 'Temperature', humidity: 'Humidity',
  rainfall: 'Rainfall', solar: 'Solar',
};

/** One variable of one site: which station supplies it, and how well. */
function VariableCell({ v }) {
  // NOT A DASH. A variable nobody paired is a decision, not a missing reading,
  // and the two must not share a cell.
  if (!v) return <span className="portfolio__nopair">not paired</span>;
  const far = v.distance_km != null && v.distance_km > REFERENCE_FAR_KM;
  return (
    <div className="portfolio__pair">
      <span className="portfolio__paircode"
            title={`${v.name || ''}${v.source ? ` · ${v.source}` : ''}${
              v.record_first ? ` · record ${v.record_first} to ${v.record_last}` : ''}`}>
        {v.code}
        {/* A borrowed station is a different claim from the nominated one.
            The note carries which station and why. */}
        {v.role === 'fill' && (
          <em className="portfolio__fill"
              title={v.note || 'Borrowed: the nominated station does not measure this'}>
            fill
          </em>
        )}
      </span>
      <span className="portfolio__pairgeo">
        <span className={far ? 'is-far' : ''}>{num(v.distance_km, 2)} km</span>
        {v.elevation_delta_m !== null && v.elevation_delta_m !== undefined && (
          // SIGNED. A thermometer below the site reads warm and one above reads
          // cool; an absolute difference cannot say which.
          <span title={`Station is ${Math.abs(v.elevation_delta_m)} m ${
            v.elevation_delta_m > 0 ? 'above' : 'below'} the site — about ${
            (Math.abs(v.elevation_delta_m) * 0.006).toFixed(1)} °C of lapse`}>
            {v.elevation_delta_m > 0 ? '+' : ''}{v.elevation_delta_m} m
          </span>
        )}
      </span>
    </div>
  );
}

const variableColumn = (key) => ({
  key,
  label: VARIABLE_LABEL[key],
  sub: 'station · dist · elev',
  get: (s) => <VariableCell v={s.variables[key]} />,
  sort: (s) => (s.variables[key] ? s.variables[key].distance_km : null),
});

const REFERENCE_COLUMNS = [
  { key: 'label', label: 'Site', sticky: true,
    get: (s) => s.label, sort: (s) => (s.label || '').toLowerCase() },
  { key: 'region', label: 'Region',
    get: (s) => s.zone_name || '—', sort: (s) => s.zone_name || '' },
  { key: 'type', label: 'Type',
    get: (s) => SITE_TYPE_LABEL[s.site_type] || s.site_type || '—',
    sort: (s) => s.site_type || '' },
  ...VARIABLE_ORDER.map(variableColumn),
];

// Every column declares how to READ it and how to SORT it separately. A date
// sorts as a string, a risk sorts by severity rather than alphabetically —
// "high" before "low" is the whole point, and an alphabetical sort would put
// extreme first and high last and look almost right.
const COLUMNS = [
  { key: 'label', label: 'Site', sticky: true,
    get: (s) => s.label, sort: (s) => (s.label || '').toLowerCase() },
  { key: 'region', label: 'Region',
    get: (s) => s.zone_name || '—', sort: (s) => s.zone_name || '' },
  { key: 'type', label: 'Type',
    get: (s) => SITE_TYPE_LABEL[s.site_type] || s.site_type || '—',
    sort: (s) => s.site_type || '' },
  { key: 'gdd', label: 'GDD', numeric: true, title: 'Growing degree days, base 10, season to date',
    get: (s) => num(s.season.gdd10, 1), sort: (s) => s.season.gdd10 },
  // TWO long-term averages, and the order matters: the one the comparison is
  // made against sits next to the comparison. `vs LTA` used to subtract a
  // WHOLE-SEASON average from a season-to-date total, which on 2 September read
  // −1,183 at every site on the account — a fact about the calendar, not about
  // any vineyard. It is measured to the same day now.
  { key: 'lta_td', label: 'LTA to date', numeric: true,
    title: 'This site’s own 1986-2005 average accumulated to the same day',
    get: (s) => num(s.lta_to_date?.gdd10, 1), sort: (s) => s.lta_to_date?.gdd10 },
  { key: 'vs', label: 'vs LTA', numeric: true, tone: true,
    title: 'Season to date against this site’s own average to the same day',
    get: (s) => signed(s.vs_lta.gdd10, 1), sort: (s) => s.vs_lta.gdd10 },
  { key: 'lta', label: 'LTA season', numeric: true,
    title: 'What this site averages over a whole season, 1986-2005',
    get: (s) => num(s.lta.gdd10, 1), sort: (s) => s.lta.gdd10 },
  { key: 'rain', label: 'Rain', numeric: true, title: 'Season to date, mm',
    get: (s) => num(s.season.rain_mm, 1), sort: (s) => s.season.rain_mm },
  // BUDBURST IS THE OTHER MODEL ON THIS TABLE, and the sub-label says so.
  // Everything to its left accumulates GDD from 1 September; this one starts at
  // a photoperiod trigger in late February, accumulates chilling to a
  // requirement, and only then accumulates degree-days above a per-cultivar
  // base. Same column, different origin, different units — labelling it
  // "Budburst" alone would invite the reading that it is one more GDD
  // threshold.
  //
  // Judged against `season.through`, the last day of the record, not the
  // browser's clock: whether the model has SEEN budburst happen is a question
  // about the data, and a laptop in another timezone should not change the
  // word.
  { key: 'budburst', label: 'Budburst', sub: 'chilling–forcing',
    title: 'Modelled budburst: chilling from the photoperiod trigger, then forcing to the cultivar requirement',
    get: (s) => {
      const b = s.phenology.budburst;
      if (!b || !b.date) {
        // Three different blanks, and only two of them mean the same thing.
        // No phenology row at all: the site names no variety, or names one
        // neither model carries. A row with no forcing target: this cultivar
        // has no budburst calibration. A row WITH a target and no date: the
        // model ran and could not answer — a truncated chilling window, most
        // often — and that is a genuine absence, so it keeps the dash.
        return (!s.phenology.variety || !b?.forcing_target)
          ? noModel(s) : '—';
      }
      const seen = s.season.through && b.date <= s.season.through;
      const pct = b.forcing_pct;
      return (
        <span className="portfolio__stagecell">
          <span className="portfolio__stagedate">{shortDate(b.date)}</span>
          {/* THE BAR IS WHERE THE DATE COMES FROM. A projected budburst is a
              forcing shortfall divided by a trailing rate, so the same column
              can hold a date extrapolated forty days from 45% of the
              requirement and one twenty days from 74%, in identical type.
              Gibbston and Seaview Awatere were exactly that pair on 7 Sep 2026.
              The fill says which kind of claim the reader is looking at before
              they read the date. */}
          {pct != null && !seen ? (
            <span
              className="portfolio__forcing"
              title={`${b.forcing_units} of ${b.forcing_target} °C-days`
                     + (b.endodormancy ? `, forcing since ${b.endodormancy}` : '')}
            >
              <span
                className="portfolio__forcingfill"
                style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
              />
            </span>
          ) : null}
          <sub className="portfolio__stagebasis">
            {seen ? 'modelled' : `predicted · ${pct == null ? '—' : `${pct}%`} forced`}
          </sub>
        </span>
      );
    },
    sort: (s) => s.phenology.budburst?.date || '' },
  { key: 'stage', label: 'Stage',
    // Pinot gris lands here: it carries a budburst date in the column to the
    // left and has no stage thresholds at all, so this cell says so rather than
    // leaving the reader to conclude the season has not started.
    get: (s) => s.phenology.stage || noModel(s),
    sort: (s) => s.phenology.stage || '' },
  // ONE stage, not three. Flowering, véraison and 210 g/L used to sit side by
  // side in identical type; in early September that put a picking date
  // extrapolated eight months forward beside one three weeks out, with nothing
  // to tell them apart. The server picks which stage is next
  // (`phenology_basis.stage_progress`) so this table, the site page and the
  // region page cannot disagree about how far the model can see.
  { key: 'next_stage', label: 'Next stage',
    title: 'The next phenological stage the model projects, and whether it is still ahead',
    get: (s) => {
      const n = s.phenology.next;
      if (!n || !n.date) return '—';
      return (
        <span className="portfolio__stagecell">
          <span className="portfolio__stagename">{n.label}</span>
          <span className="portfolio__stagedate">{shortDate(n.date)}</span>
          {/* `predicted` while it is ahead of us, `modelled` once it is behind:
              a date in the past is not a prediction any more, and nobody walked
              the block either. */}
          <sub className="portfolio__stagebasis">{n.basis}</sub>
        </span>
      );
    },
    sort: (s) => s.phenology.next?.date || '' },
  // POWDERY IS GUBLER, and the label can say so honestly: `UCDavisPMIndex` is
  // the Gubler-Thomas index, which is the model the client's list ticks.
  { key: 'powdery', label: 'Powdery', sub: 'Gubler',
    risk: (s) => s.disease.powdery,
    get: (s) => s.disease.powdery || '—',
    sort: (s) => RISK_ORDER[s.disease.powdery] ?? -1 },

  // TWO BOTRYTIS COLUMNS, BOTH NAMED, because they are two models and they
  // disagree. This column used to be headed "Botrytis" and captioned "Bacchus"
  // on the chart while computing González-Domínguez — one word over another
  // model's numbers, which is the substitution this pair of columns exists to
  // end. A reader can now see which model is talking.
  { key: 'botrytis', label: 'Botrytis', sub: 'González-Domínguez',
    risk: (s) => s.disease.botrytis,
    get: (s) => s.disease.botrytis || '—',
    sort: (s) => RISK_ORDER[s.disease.botrytis] ?? -1 },

  // BACCHUS IS NOT A RISK WORD. It is an index against a threshold of exactly
  // 1.0, so it renders as the number and its threshold rather than being forced
  // into low/moderate/high — bands the model does not define. `is-fired` is the
  // only state it has: the infection period completed, or it did not.
  //
  // NO PER-ROW "DID THEY ASK FOR THIS" MARKER. There was one, and against the
  // real data it fell on 44 of the 67 rows — a footnote on two thirds of a
  // column is noise, and the tick is administrative metadata about the client's
  // previous platform rather than anything about the vineyard. `requested`
  // stays in the payload and in the CSV, where reconciling against their site
  // list is the actual use for it, and the count moves to the footer.
  { key: 'bacchus', label: 'Botrytis', sub: 'Bacchus', numeric: true,
    get: (s) => {
      const b = s.bacchus;
      if (!b || b.index == null) return '—';
      return (
        <span className={`portfolio__bacchus${b.infection ? ' is-fired' : ''}`}>
          {b.index.toFixed(2)}
          <sub className="portfolio__bacchusthreshold">
            /{b.threshold.toFixed(1)}
          </sub>
        </span>
      );
    },
    sort: (s) => (s.bacchus?.index ?? -1) },
];

function Portfolio() {
  const { user } = usePublicAuth();
  const [accounts, setAccounts] = useState(null);
  const [slug, setSlug] = useState(null);
  const [data, setData] = useState(null);
  // NO VARIETY STATE. Every phenology figure on this table now comes from the
  // site's OWN variety — the server matches `p.variety_code = s.variety_code`
  // with no fallback — so a picker here would change nothing on screen while
  // looking as though it did. A site that names no grape shows no phenology at
  // all, which is the honest answer: running all five calibrated cultivars at
  // such a site moves budburst by 5 to 20 days, against a model RMSE of 4.9.
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  // Which site's chart is open. The popup exists so somebody can read six sites
  // in turn without leaving the table they picked them from.
  const [open, setOpen] = useState(null);

  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState({ key: 'label', dir: 1 });
  const [showModels, setShowModels] = useState(false);
  // 'sites' | 'reference'. Two questions about one account — what the models
  // say, and what a real instrument nearby measured — so the filters are shared
  // and only the columns change.
  const [tab, setTab] = useState('sites');
  const [reference, setReference] = useState(null);
  const [refLoading, setRefLoading] = useState(false);
  const [refError, setRefError] = useState(null);
  // Bumped by "Try again". A counter rather than a boolean, so a second failure
  // can still be retried a third time.
  const [refRetry, setRefRetry] = useState(0);
  // The slug already fetched, or being fetched. See the effect below for why
  // this is a ref and not state.
  const refFetched = useRef(null);
  // The site whose measured days are open in the modal.
  const [openRef, setOpenRef] = useState(null);

  useDocumentMeta({ title: 'Portfolio · Auxein Insights' });

  useEffect(() => {
    if (!isPro(user)) { setLoading(false); return undefined; }
    let live = true;
    listAccounts()
      .then((list) => {
        if (!live) return;
        setAccounts(list);
        if (list.length) setSlug(list[0].slug);
        else setLoading(false);
      })
      .catch(() => { if (live) { setError('Could not load your accounts.'); setLoading(false); } });
    return () => { live = false; };
  }, [user]);

  useEffect(() => {
    if (!slug) return undefined;
    let live = true;
    setLoading(true);
    // A new account invalidates the pairings as well as the table, and leaving
    // the old ones mounted would show one client's stations under another
    // client's name for as long as the second request takes.
    setReference(null);
    setRefError(null);
    setRefLoading(false);
    setOpenRef(null);
    getAccountPortfolio(slug)
      .then((d) => { if (live) { setData(d); setError(null); } })
      .catch((e) => {
        if (live) setError(e?.response?.data?.detail || 'Could not load this portfolio.');
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [slug]);

  // FETCHED ON FIRST OPEN, not with the portfolio. Most visits never leave the
  // first tab, and folding this in would make everybody wait for a tab they did
  // not ask for.
  //
  // THE IN-FLIGHT MARKER IS A REF, AND THE EFFECT DEPENDS ON NOTHING IT SETS.
  // This was written with the data/loading/error state in the dependency array
  // and a `live` flag cleared on teardown, and it hung on the spinner every
  // time: `setRefLoading(true)` changed a dependency of its own effect, so React
  // tore the effect down — running `live = false` — before the request came
  // back, and every callback on it became a no-op. A ref survives that
  // teardown, which is the whole reason it is one.
  //
  // It also does the job the dependencies were there for: it holds the slug
  // already fetched, so toggling tabs does not refetch, switching accounts
  // does, and clearing it on failure is what lets "Try again" through without
  // opening a retry loop.
  useEffect(() => {
    if (tab !== 'reference' || !slug) return;
    if (refFetched.current === slug) return;
    refFetched.current = slug;
    setRefLoading(true);
    getAccountReference(slug)
      .then((d) => {
        // Not "is this component still mounted" but "is this still the account
        // on screen" — the only staleness that can produce a wrong answer.
        if (refFetched.current !== slug) return;
        setReference(d);
        setRefError(null);
      })
      .catch((e) => {
        if (refFetched.current !== slug) return;
        refFetched.current = null;
        setRefError(e?.response?.data?.detail
          || 'Could not load the reference stations for this account.');
      })
      .finally(() => {
        // Left alone when another account's request has taken over, so its
        // spinner is not cleared by this one finishing late.
        if (refFetched.current === slug || refFetched.current === null) {
          setRefLoading(false);
        }
      });
  }, [tab, slug, refRetry]);

  const sites = data?.sites || [];

  const regions = useMemo(
    () => [...new Set(sites.map((s) => s.zone_name).filter(Boolean))].sort(),
    [sites],
  );
  const types = useMemo(
    () => [...new Set(sites.map((s) => s.site_type).filter(Boolean))].sort(),
    [sites],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const col = COLUMNS.find((c) => c.key === sort.key) || COLUMNS[0];
    return sites
      .filter((s) => (!region || s.zone_name === region))
      .filter((s) => (!type || s.site_type === type))
      .filter((s) => !q || (s.label || '').toLowerCase().includes(q)
        || (s.zone_name || '').toLowerCase().includes(q))
      .slice()
      .sort((a, b) => {
        const av = col.sort(a);
        const bv = col.sort(b);
        // Absent always sorts LAST, whichever direction the reader picked.
        // Flipping a column should not promote every empty row to the top —
        // the rows with no data are never what somebody is sorting to find.
        if (av === null || av === undefined || av === '') return 1;
        if (bv === null || bv === undefined || bv === '') return -1;
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * sort.dir;
      });
  }, [sites, query, region, type, sort]);

  // THE SAME SEASON THE SITES TAB IS SHOWING, so a measured day and a modelled
  // one sit on the same calendar. Derived from the portfolio's own
  // `vintage_year` rather than from today's date: the two tabs would otherwise
  // drift apart on 1 May, when the season ends but the portfolio keeps showing
  // it. Clamped to today because a station cannot have reported tomorrow.
  const refWindow = useMemo(() => {
    const v = data?.vintage_year || new Date().getFullYear();
    const iso = (d) => d.toISOString().slice(0, 10);
    const today = new Date();
    const close = new Date(Date.UTC(v, 3, 30));
    return {
      start: `${v - 1}-09-01`,
      end: iso(close < today ? close : today),
    };
  }, [data]);

  // The same filters, applied to the pairing rows. Sorting and filtering stay
  // LOCAL here for the same reason they are on the other tab — one payload,
  // instant re-sort, and an export that cannot disagree with the screen.
  const shownReference = useMemo(() => {
    const rows = reference?.sites || [];
    const q = query.trim().toLowerCase();
    const col = REFERENCE_COLUMNS.find((c) => c.key === sort.key)
      || REFERENCE_COLUMNS[0];
    return rows
      .filter((s) => (!region || s.zone_name === region))
      .filter((s) => (!type || s.site_type === type))
      // THE SEARCH REACHES THE STATION CODES TOO. "Which of my sites does this
      // mast stand in for" is the second question this tab generates, and
      // without this it is unanswerable except by eye.
      .filter((s) => !q || (s.label || '').toLowerCase().includes(q)
        || (s.zone_name || '').toLowerCase().includes(q)
        || Object.values(s.variables).some(
          (v) => `${v.code || ''} ${v.name || ''}`.toLowerCase().includes(q),
        ))
      .slice()
      .sort((a, b) => {
        const av = col.sort(a);
        const bv = col.sort(b);
        if (av === null || av === undefined || av === '') return 1;
        if (bv === null || bv === undefined || bv === '') return -1;
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * sort.dir;
      });
  }, [reference, query, region, type, sort]);

  const toggleSort = useCallback((key) => {
    setSort((prev) => (prev.key === key
      ? { key, dir: -prev.dir }
      : { key, dir: 1 }));
  }, []);

  // TWO EXPORTS, and they are different products rather than two formats.
  // The summary is one row per site — today's state, what the table shows. The
  // daily export is one row per site per date, which is what anybody doing
  // their own analysis actually needs and is ~16,000 rows for a season.
  //
  // The reference export is a third product again, and the one that is not
  // model output at all: one row per site per day of OBSERVED station
  // aggregates, with the station that supplied each variable named on every
  // row. It shares the season window with the other two, so the three files
  // cover the same days and can be read side by side.
  const runExport = useCallback(async (which) => {
    setExporting(which);
    try {
      const opts = { vintage: data?.vintage_year };
      if (which === 'summary') {
        await downloadAccountPortfolioCsv(slug, opts);
      } else if (which === 'reference') {
        await downloadAccountReferenceCsv(slug);
      } else {
        await downloadAccountTimeseriesCsv(slug, opts);
      }
    } catch {
      setError('The export failed. Nothing was downloaded.');
    } finally {
      setExporting(false);
    }
  }, [slug, data]);

  if (!isPro(user)) {
    return (
      <>
        <SiteHeader />
        <main className="portfolio">
          <AccessGate
            title="Portfolio is part of Insights Pro"
            body="A portfolio brings every monitored site onto one page."
          />
        </main>
        <SiteFooter />
      </>
    );
  }

  if (accounts && accounts.length === 0) {
    return (
      <>
        <SiteHeader />
        <main className="portfolio">
          <section className="portfolio__empty">
            <h1>No portfolio yet</h1>
            {/* Not an error. An account is an enterprise arrangement, and most
                subscribers correctly have none. */}
            <p>
              A portfolio shows every site on a company account on one page.
              Your subscription covers your own site — <Link to="/my-site">open it</Link>.
            </p>
          </section>
        </main>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main className="portfolio">
        <header className="portfolio__head">
          <div>
            <h1>{data?.account?.name || 'Portfolio'}</h1>
            <p className="portfolio__scope">
              {data ? (
                <>
                  {data.summary.sites} sites · {data.vintage_year} season ·
                  {' '}long-term average over {data.baseline_period}
                </>
              ) : 'Loading…'}
            </p>
          </div>
          <div className="portfolio__actions">
            {accounts && accounts.length > 1 && (
              <select value={slug || ''} onChange={(e) => setSlug(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.slug} value={a.slug}>{a.name}</option>
                ))}
              </select>
            )}
            {/* Not a help link. Every column on this table is the output of a
                named, published model with its own units, its own reference and
                its own limits, and a client reading a botrytis band or a
                budburst date has no way to tell which model produced it from
                the table alone. Gated on SHOW_MODELS while the content is
                reviewed. */}
            {SHOW_MODELS && (
              <button type="button" className="btn btn-secondary"
                      onClick={() => setShowModels(true)}
                      title="Equations, parameters, references and limits for every model on this table">
                <Info size={15} aria-hidden="true" /> Models
              </button>
            )}
            {/* THE EXPORT FOLLOWS THE TAB. Offering all three at once invites
                somebody on the Measured tab to click "Summary CSV" and get a
                file with no station in it. */}
            {tab === 'sites' ? (
              <>
                <button type="button" className="btn btn-secondary"
                        onClick={() => runExport('summary')}
                        disabled={!data || !!exporting}
                        title="One row per site: what this table shows">
                  {exporting === 'summary'
                    ? <Loader size={15} className="spin" aria-hidden="true" />
                    : <Download size={15} aria-hidden="true" />}
                  {' '}Summary CSV
                </button>
                <button type="button" className="btn btn-secondary"
                        onClick={() => runExport('daily')}
                        disabled={!data || !!exporting}
                        title="One row per site per day for the whole season">
                  {exporting === 'daily'
                    ? <Loader size={15} className="spin" aria-hidden="true" />
                    : <Download size={15} aria-hidden="true" />}
                  {' '}Daily CSV
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-secondary"
                      onClick={() => runExport('reference')}
                      disabled={!reference || !!exporting}
                      title="One row per site per day of measured station data, with the station that supplied each variable named on every row">
                {exporting === 'reference'
                  ? <Loader size={15} className="spin" aria-hidden="true" />
                  : <Download size={15} aria-hidden="true" />}
                {' '}Measured CSV
              </button>
            )}
          </div>
        </header>

        {data && (
          <div className="portfolio__tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'sites'}
                    className={tab === 'sites' ? 'is-active' : ''}
                    onClick={() => setTab('sites')}>
              Sites
            </button>
            {/* "Measured" rather than "Stations": the distinction the tab
                exists to draw is observed against modelled, and naming it after
                the instrument buries that under a piece of infrastructure. */}
            <button type="button" role="tab" aria-selected={tab === 'reference'}
                    className={tab === 'reference' ? 'is-active' : ''}
                    onClick={() => setTab('reference')}>
              <Gauge size={14} aria-hidden="true" /> Measured
            </button>
          </div>
        )}

        {error && (
          <p className="portfolio__error">
            <AlertTriangle size={15} aria-hidden="true" /> {error}
          </p>
        )}

        {data && (
          <div className="portfolio__filters">
            <label className="portfolio__search">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                value={query}
                placeholder="Find a site or region"
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select value={region} onChange={(e) => setRegion(e.target.value)}
                    aria-label="Region">
              <option value="">All regions</option>
              {regions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={type} onChange={(e) => setType(e.target.value)}
                    aria-label="Site type">
              <option value="">All types</option>
              {types.map((t) => (
                <option key={t} value={t}>{SITE_TYPE_LABEL[t] || t}</option>
              ))}
            </select>
            <span className="portfolio__count">
              {tab === 'sites'
                ? `${shown.length} of ${sites.length}`
                : `${shownReference.length} of ${reference?.sites?.length ?? 0}`}
            </span>
          </div>
        )}

        {loading && (
          <p className="portfolio__loading">
            <Loader size={16} className="spin" aria-hidden="true" /> Loading…
          </p>
        )}

        {data && !loading && tab === 'sites' && (
          <>
            <div className="portfolio__scroll">
              <table className="portfolio__table">
                <thead>
                  <tr>
                    {COLUMNS.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        title={c.title}
                        className={[
                          c.numeric ? 'is-num' : '',
                          c.sticky ? 'is-sticky' : '',
                          sort.key === c.key ? 'is-sorted' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <button type="button" onClick={() => toggleSort(c.key)}>
                          <span className="portfolio__colname">{c.label}</span>
                          {/* THE MODEL, UNDER THE HEADING. Two columns now
                              read "Botrytis" and only this line separates
                              them. */}
                          {c.sub && (
                            <span className="portfolio__colmodel">{c.sub}</span>
                          )}
                          <ArrowUpDown size={11} aria-hidden="true" />
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => (
                    <tr key={s.site_id}>
                      {COLUMNS.map((c) => {
                        const risk = c.risk ? c.risk(s) : null;
                        const value = c.get(s);
                        const tone = c.tone && s.vs_lta.gdd10 != null
                          ? (s.vs_lta.gdd10 > 0 ? 'up' : 'down') : null;
                        return c.sticky ? (
                          <th key={c.key} scope="row" className="is-sticky">
                            {/* Opens the chart rather than navigating. The full
                                site page is one click further, inside the
                                popup — leaving the table to answer "what
                                happened here" is what makes reading six sites
                                in a row tedious. */}
                            <button type="button" className="portfolio__open"
                                    onClick={() => setOpen(s)}>
                              {value}
                            </button>
                          </th>
                        ) : (
                          <td
                            key={c.key}
                            className={[
                              c.numeric ? 'is-num' : '',
                              risk ? `risk-${risk}` : '',
                              tone ? `tone-${tone}` : '',
                            ].filter(Boolean).join(' ')}
                          >
                            {value}
                            {/* A disease score computed without humidity is a
                                weaker claim, not the same claim. Marked rather
                                than left to look identical. */}
                            {(c.risk || c.key === 'bacchus') && s.disease.date
                              && !s.disease.humidity_available && (
                              <abbr className="portfolio__nohum"
                                    title="No humidity within range; this score used temperature only">
                                *
                              </abbr>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="portfolio__foot">
              <MapPin size={13} aria-hidden="true" />
              GDD is base 10, accumulated from 1 September. LTA is each site's
              own {data.baseline_period} average at its own cell, never its
              region's. An empty cell means no value, never zero.
              {' '}{data.summary.with_disease} of {data.summary.sites} sites
              carry a disease score; a <b>*</b> marks one modelled without
              humidity in range.
              {' '}The two botrytis columns are two different models and will
              disagree: Gonz&aacute;lez-Dom&iacute;nguez scales by growth stage,
              Bacchus does not. Bacchus is an index against its own threshold
              &mdash; at 1.0 an infection period has completed &mdash; not a
              0-100 score, and {data.summary.bacchus_requested} of{' '}
              {data.summary.sites} sites requested it by name. Every site is
              scored for both.
            </p>
          </>
        )}

        {tab === 'reference' && refLoading && (
          <p className="portfolio__loading">
            <Loader size={16} className="spin" aria-hidden="true" />
            {' '}Loading the measured stations…
          </p>
        )}

        {tab === 'reference' && refError && (
          <p className="portfolio__error">
            <AlertTriangle size={15} aria-hidden="true" /> {refError}
            {' '}
            <button type="button" className="portfolio__retry"
                    onClick={() => {
                      setRefError(null);
                      setRefRetry((n) => n + 1);
                    }}>
              Try again
            </button>
          </p>
        )}

        {/* NOT AN ERROR. The pairing is a curated decision seeded per client,
            so an account with none is the normal case rather than a failure,
            and telling the reader it broke would send them chasing a bug. */}
        {tab === 'reference' && reference && !refLoading
          && !reference.sites.length && (
          <p className="portfolio__loading">
            No measured stations are paired with this account yet.
          </p>
        )}

        {tab === 'reference' && reference && !refLoading
          && reference.sites.length > 0 && (
          <>
            {/* THE FIRST THING ON THIS TAB. Without it these readings are taken
                for the site's own, and the whole point is that they are a
                different instrument in a different place. The wording arrives
                from the API so the endpoint and the screen cannot end up making
                different claims. */}
            <p className="portfolio__paths">
              <Info size={14} aria-hidden="true" />
              <span><b>Measured, not modelled.</b> {reference.basis}</span>
            </p>

            <div className="portfolio__scroll">
              <table className="portfolio__table portfolio__table--reference">
                <thead>
                  <tr>
                    {REFERENCE_COLUMNS.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        title={c.title}
                        className={[
                          c.sticky ? 'is-sticky' : '',
                          sort.key === c.key ? 'is-sorted' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <button type="button" onClick={() => toggleSort(c.key)}>
                          <span className="portfolio__colname">{c.label}</span>
                          {c.sub && (
                            <span className="portfolio__colmodel">{c.sub}</span>
                          )}
                          <ArrowUpDown size={11} aria-hidden="true" />
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownReference.map((s) => (
                    <tr key={s.site_id}>
                      {REFERENCE_COLUMNS.map((c) => (c.sticky ? (
                        <th key={c.key} scope="row" className="is-sticky">
                          {/* Opens the measured days rather than navigating.
                              The pairing answers "where does this come from";
                              the modal answers "what did it record", which is
                              the next question every time. */}
                          <button type="button" className="portfolio__open"
                                  onClick={() => setOpenRef(s)}>
                            {c.get(s)}
                          </button>
                        </th>
                      ) : (
                        <td key={c.key}>{c.get(s)}</td>
                      )))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="portfolio__foot">
              <Gauge size={13} aria-hidden="true" />
              {reference.summary.stations} station(s) stand in for{' '}
              {reference.summary.sites} site(s). Each cell names the station,
              its distance and its height against the site.
              {' '}A station <b>below</b> the site reads warm and one above
              reads cool, at roughly 0.6 &deg;C per 100 m.
              {reference.summary.filled > 0 && (
                <>
                  {' '}<b>{reference.summary.filled}</b> variable(s) are marked
                  {' '}<b>fill</b>: the nominated station does not measure them
                  at all, so the nearest one that does was used instead &mdash;
                  hover the badge for which and why.
                </>
              )}
              {' '}Click a site for its day-by-day record. These are the
              station's own observations and are not adjusted toward the site.
            </p>
          </>
        )}
        {open && (
          <SitePopup site={open} vintage={data?.vintage_year}
                     onClose={() => setOpen(null)} />
        )}
        {openRef && (
          <ReferenceDaily slug={slug} site={openRef}
                          start={refWindow.start} end={refWindow.end}
                          onClose={() => setOpenRef(null)} />
        )}
        <ModelsAbout isOpen={showModels} onClose={() => setShowModels(false)} />
      </main>
      <SiteFooter />
    </>
  );
}

export default Portfolio;
