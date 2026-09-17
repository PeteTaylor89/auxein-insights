// components/pro/ReferenceDaily.jsx — one site's MEASURED daily record.
//
// Everything else this client is shown is modelled: the daily record comes from
// the 500 m surface, the hourly record is interpolated from neighbours. This is
// the other thing — the observed aggregates of a real station near the site,
// unadjusted, so the estimate can be read against something that was actually
// measured.
//
// ## THE STATION IS IN EVERY COLUMN HEADING, not in a line above the table
//
// Four of these columns can come from four different masts at one site, because
// councils register each sensor as its own station and because a nominated mast
// may not measure a variable at all. A table with one station named at the top
// would be four instruments presented as one weather station — which is the
// specific misreading this whole feature exists to prevent.
//
// ## A PARTIAL DAY IS MARKED, NOT HIDDEN
//
// `weather_data_daily` carries the record count behind each aggregate. A daily
// mean built from three readings and one built from 144 are not the same
// number, and nothing else on the row distinguishes them. A partial day is the
// most common way an observed series quietly disagrees with a modelled one, so
// it gets a marker rather than a footnote.
//
// ## Absent is not zero
//
// A gauge that did not report and a dry day are different facts. Every cell
// that can be absent renders a dash.
import { useEffect, useMemo, useState } from 'react';
import { X, Download, Loader, AlertTriangle } from 'lucide-react';
import {
  getAccountReferenceDaily, downloadAccountReferenceCsv,
} from '../../services/proSiteService';
import './ReferenceDaily.css';

// Below this many readings a daily aggregate is built on too little to sit
// beside a full day unmarked. Hourly sources give 24; the sub-hourly ones give
// far more, so this is deliberately low — it flags a broken day, not a coarse
// instrument.
const THIN_DAY = 12;

const num = (v, dp = 1) => (v === null || v === undefined
  ? '—' : Number(v).toFixed(dp));

const shortDate = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString('en-NZ', {
      day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC',
    });
};

/** A value with its record count, marked when the day is thin. */
function Cell({ value, dp = 1, records }) {
  const thin = records !== null && records !== undefined && records < THIN_DAY;
  if (value === null || value === undefined) return <td className="is-num">—</td>;
  return (
    <td className="is-num">
      {num(value, dp)}
      {thin && (
        <abbr className="refday__thin"
              title={`Built from ${records} reading(s) that day`}>*</abbr>
      )}
    </td>
  );
}

// Each group names the station that supplied it. `variables` comes from the
// pairing the tab already holds, so the heading and the number cannot disagree
// about where the column came from.
const GROUPS = [
  { key: 'temp', label: 'Temperature',
    cols: [
      { k: 'temp_min', h: 'Min', dp: 1 },
      { k: 'temp_max', h: 'Max', dp: 1 },
      { k: 'temp_mean', h: 'Mean', dp: 1 },
      { k: 'gdd_base10', h: 'GDD10', dp: 1 },
    ],
    records: 'temp_records' },
  { key: 'humidity', label: 'Humidity',
    cols: [
      { k: 'humidity_min', h: 'Min', dp: 0 },
      { k: 'humidity_max', h: 'Max', dp: 0 },
      { k: 'humidity_mean', h: 'Mean', dp: 0 },
    ],
    records: 'humidity_records' },
  { key: 'rainfall', label: 'Rainfall',
    cols: [{ k: 'rainfall_mm', h: 'mm', dp: 1 }],
    records: 'rainfall_records' },
  { key: 'solar', label: 'Solar',
    cols: [{ k: 'solar_radiation', h: 'Rad', dp: 0 }],
    records: null },
];

function ReferenceDaily({ slug, site, start, end, onClose }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!slug || !site) return undefined;
    let live = true;
    setLoading(true);
    getAccountReferenceDaily(slug, { siteId: site.site_id, start, end })
      .then((d) => { if (live) { setRows(d.rows || []); setError(null); } })
      .catch((e) => {
        if (live) {
          setError(e?.response?.data?.detail
            || 'Could not load this site’s measured record.');
        }
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [slug, site, start, end]);

  // A group with no pairing at this site is not rendered at all. Six empty
  // columns headed "Solar" would read as an instrument that stopped rather than
  // one that was never nominated.
  const groups = useMemo(
    () => GROUPS.filter((g) => site?.variables?.[g.key]),
    [site],
  );

  const runExport = async () => {
    setExporting(true);
    try {
      await downloadAccountReferenceCsv(slug, { start, end });
    } catch {
      setError('The export failed. Nothing was downloaded.');
    } finally {
      setExporting(false);
    }
  };

  if (!site) return null;

  return (
    <div className="sitepop__backdrop" role="dialog" aria-modal="true"
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sitepop refday">
        <header className="sitepop__head">
          <div>
            <h2>{site.label}</h2>
            <p>
              Measured daily record{site.zone_name ? ` · ${site.zone_name}` : ''}
              {' · '}{start} to {end}
              {rows ? ` · ${rows.length} days` : ''}
            </p>
          </div>
          <div className="sitepop__actions">
            {/* THE EXPORT IS THE WHOLE ACCOUNT, and the label says so. A button
                in a single-site modal that quietly returns eight sites is worse
                than one that returns too little. */}
            <button type="button" className="btn btn-secondary"
                    onClick={runExport} disabled={exporting}
                    title="Every site on the account, one row per site per day, for this date range">
              {exporting
                ? <Loader size={15} className="spin" aria-hidden="true" />
                : <Download size={15} aria-hidden="true" />}
              {' '}All sites CSV
            </button>
            <button type="button" className="sitepop__close" onClick={onClose}
                    aria-label="Close">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        {loading && (
          <p className="refday__state">
            <Loader size={16} className="spin" aria-hidden="true" /> Loading…
          </p>
        )}
        {error && (
          <p className="refday__state is-error">
            <AlertTriangle size={15} aria-hidden="true" /> {error}
          </p>
        )}

        {rows && !loading && !rows.length && (
          <p className="refday__state">
            No measured days in this range. The stations paired with this site
            reported nothing between {start} and {end}.
          </p>
        )}

        {rows && !loading && rows.length > 0 && (
          <>
            <div className="refday__scroll">
              <table className="refday__table">
                <thead>
                  <tr className="refday__grouprow">
                    <th scope="col" aria-label="Date" />
                    {groups.map((g) => {
                      const v = site.variables[g.key];
                      return (
                        <th key={g.key} scope="colgroup" colSpan={g.cols.length}>
                          <span className="refday__groupname">{g.label}</span>
                          <span className="refday__groupstation"
                                title={`${v.name || ''} · ${v.distance_km} km${
                                  v.elevation_delta_m === null ? ''
                                    : ` · ${v.elevation_delta_m > 0 ? '+' : ''}${v.elevation_delta_m} m vs site`}`}>
                            {v.code}
                            {/* A borrowed station is a different claim from the
                                nominated one and must not look identical. */}
                            {v.role === 'fill' && (
                              <em className="refday__fill" title={v.note || 'Borrowed: the nominated station does not measure this'}>
                                fill
                              </em>
                            )}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                  <tr>
                    <th scope="col">Date</th>
                    {groups.map((g) => g.cols.map((c) => (
                      <th key={`${g.key}-${c.k}`} scope="col" className="is-num">
                        {c.h}
                      </th>
                    )))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.date}>
                      <th scope="row">{shortDate(r.date)}</th>
                      {groups.map((g) => g.cols.map((c) => (
                        <Cell key={`${g.key}-${c.k}`} value={r[c.k]} dp={c.dp}
                              records={g.records ? r[g.records] : null} />
                      )))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="refday__foot">
              Observed station aggregates, <b>not adjusted toward the site</b>.
              Every other number on this account is modelled. A <b>*</b> marks a
              day built from fewer than {THIN_DAY} readings; an empty cell means
              the station did not report, never zero.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default ReferenceDaily;
