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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Download, Loader, AlertTriangle, Search, ArrowUpDown, MapPin,
} from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import AccessGate from '../components/auth/AccessGate';
import {
  listAccounts, getAccountPortfolio, downloadAccountPortfolioCsv,
  downloadAccountTimeseriesCsv,
} from '../services/proSiteService';
import SitePopup from '../components/pro/SitePopup';
import { usePublicAuth } from '../contexts/PublicAuthContext';
import { isPro } from '../utils/entitlements';
import useDocumentMeta from '../hooks/useDocumentMeta';
import './Portfolio.css';

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
const signed = (v) => (v === null || v === undefined
  ? '—' : `${v > 0 ? '+' : ''}${Math.round(v).toLocaleString()}`);

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
    get: (s) => num(s.season.gdd10), sort: (s) => s.season.gdd10 },
  { key: 'lta', label: 'LTA GDD', numeric: true, title: 'This site’s own long-term average',
    get: (s) => num(s.lta.gdd10), sort: (s) => s.lta.gdd10 },
  { key: 'vs', label: 'vs LTA', numeric: true, tone: true,
    title: 'Season to date against this site’s own average',
    get: (s) => signed(s.vs_lta.gdd10), sort: (s) => s.vs_lta.gdd10 },
  { key: 'rain', label: 'Rain', numeric: true, title: 'Season to date, mm',
    get: (s) => num(s.season.rain_mm), sort: (s) => s.season.rain_mm },
  { key: 'stage', label: 'Stage',
    get: (s) => s.phenology.stage || '—', sort: (s) => s.phenology.stage || '' },
  { key: 'flowering', label: 'Flowering',
    get: (s) => shortDate(s.phenology.flowering),
    sort: (s) => s.phenology.flowering || '' },
  { key: 'harvest', label: 'Harvest 210',
    get: (s) => shortDate(s.phenology.harvest_210),
    sort: (s) => s.phenology.harvest_210 || '' },
  { key: 'powdery', label: 'Powdery', risk: (s) => s.disease.powdery,
    get: (s) => s.disease.powdery || '—',
    sort: (s) => RISK_ORDER[s.disease.powdery] ?? -1 },
  { key: 'botrytis', label: 'Botrytis', risk: (s) => s.disease.botrytis,
    get: (s) => s.disease.botrytis || '—',
    sort: (s) => RISK_ORDER[s.disease.botrytis] ?? -1 },
];

function Portfolio() {
  const { user } = usePublicAuth();
  const [accounts, setAccounts] = useState(null);
  const [slug, setSlug] = useState(null);
  const [data, setData] = useState(null);
  const [variety, setVariety] = useState('SB');
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
    getAccountPortfolio(slug, { variety })
      .then((d) => { if (live) { setData(d); setError(null); } })
      .catch((e) => {
        if (live) setError(e?.response?.data?.detail || 'Could not load this portfolio.');
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [slug, variety]);

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

  const toggleSort = useCallback((key) => {
    setSort((prev) => (prev.key === key
      ? { key, dir: -prev.dir }
      : { key, dir: 1 }));
  }, []);

  // TWO EXPORTS, and they are different products rather than two formats.
  // The summary is one row per site — today's state, what the table shows. The
  // daily export is one row per site per date, which is what anybody doing
  // their own analysis actually needs and is ~16,000 rows for a season.
  const runExport = useCallback(async (which) => {
    setExporting(which);
    try {
      const opts = { vintage: data?.vintage_year };
      if (which === 'summary') {
        await downloadAccountPortfolioCsv(slug, { ...opts, variety });
      } else {
        await downloadAccountTimeseriesCsv(slug, opts);
      }
    } catch {
      setError('The export failed. Nothing was downloaded.');
    } finally {
      setExporting(false);
    }
  }, [slug, data, variety]);

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
            <select value={variety} onChange={(e) => setVariety(e.target.value)}
                    aria-label="Variety">
              {(data?.varieties || ['SB']).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
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
          </div>
        </header>

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
              {shown.length} of {sites.length}
            </span>
          </div>
        )}

        {loading && (
          <p className="portfolio__loading">
            <Loader size={16} className="spin" aria-hidden="true" /> Loading…
          </p>
        )}

        {data && !loading && (
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
                          {c.label}
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
                            {c.risk && s.disease.date
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
            </p>
          </>
        )}
        {open && (
          <SitePopup site={open} vintage={data?.vintage_year}
                     onClose={() => setOpen(null)} />
        )}
      </main>
      <SiteFooter />
    </>
  );
}

export default Portfolio;
