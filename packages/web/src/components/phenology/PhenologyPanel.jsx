// components/phenology/PhenologyPanel.jsx — where this property's vines are,
// answered three ways.
//
// This replaces a mock. The previous version carried "All data below is mock"
// in its own header and had rendered four invented blocks on the live Insights
// page since 2026-05-29, with no notice to the reader that the numbers were
// made up.
//
// ## WHY IT IS NOT A REWIRING OF THAT DESIGN
//
// The mock placed each source as a FRACTIONAL POSITION on a six-stage rail —
// 2.4 meaning "40% through flowering". The real models do not produce that.
// They produce DATES for named events (budburst, flowering, veraison, harvest
// at 21.0 and 22.0 Brix) and a current stage label, and a field observation
// produces an E-L code for today. Squeezing those into a fraction would mean
// inventing the fraction, which is the exact thing being removed. So the shape
// is a date comparison, which is what the data actually is.
//
// ## THE THREE TRACKS, AND WHAT EACH ONE COSTS TO HAVE
//
//   Regional   the climate-zone model. Needs only a zone on the property, so
//              nearly every company already has it.
//   This site  the same model at the property's OWN point, against its own
//              1986-2005 baseline. Needs a climate site (Manage -> Weather).
//   Observed   what somebody stood in the block and recorded. The only track
//              that can contradict the other two, and the only one that is
//              about today rather than a projection.
//
// Every track can be missing, and each missing one states its own reason from
// the payload rather than rendering an empty column. That is the whole reason
// this is honest where the mock was not: "no climate site yet" and "the model
// has nothing to project from" look identical as a blank cell.
import { useState, useEffect, useCallback } from 'react';
import { Satellite, Radio, Eye, Info, MapPin } from 'lucide-react';
import { propertyService } from '@vineyard/shared';
import './PhenologyPanel.css';

const SOURCES = {
  regional: {
    label: 'Regional model', short: 'Regional', color: 'var(--color-info)',
    Icon: Satellite, hint: "Your climate zone's model",
  },
  site: {
    label: 'This site', short: 'This site', color: 'var(--color-primary)',
    Icon: Radio, hint: "The same model at this property's own point",
  },
  observed: {
    label: 'Field observations', short: 'Observed', color: 'var(--color-accent)',
    Icon: Eye, hint: 'What was recorded in the block',
  },
};

// The events both models project, in season order. Budburst comes from the
// APSIM chilling-forcing model and the rest from GDD thresholds — two different
// models, which is why a variety can have one and not the other.
const EVENTS = [
  { key: 'budburst_date', label: 'Budburst', model: 'budburst' },
  { key: 'flowering_date', label: 'Flowering', model: 'gdd' },
  { key: 'veraison_date', label: 'Veraison', model: 'gdd' },
  { key: 'harvest_210_date', label: 'Harvest 21.0', model: 'gdd' },
];

const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtStage = (s) => (s ? String(s).replace(/_/g, ' ') : null);

/** Signed days, as a phrase a grower reads rather than a number. */
function vsBaseline(days) {
  if (days === null || days === undefined) return null;
  const n = Number(days);
  if (n === 0) return 'on the long-term average';
  return `${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'} ${n < 0 ? 'ahead of' : 'behind'} average`;
}

/**
 * One cell of the comparison grid.
 *
 * A dash is never left bare. `reason` says which kind of nothing it is — not
 * modelled for this variety, or modelled but withheld because the model has no
 * accumulation to project from yet. Those have different fixes and a blank cell
 * conflates them.
 */
function DateCell({ value, isActual, reason }) {
  if (value) {
    return (
      <td className="phen-cell">
        <span className="phen-date">{fmtDate(value)}</span>
        {isActual && <span className="phen-actual" title="Observed, not projected">actual</span>}
      </td>
    );
  }
  return (
    <td className="phen-cell phen-cell--empty">
      <span className="phen-dash" title={reason || undefined}>—</span>
      {reason && <span className="phen-cell-reason">{reason}</span>}
    </td>
  );
}

function VarietyCard({ variety, siteReason, regionalReason }) {
  const { regional, site, observed } = variety;

  // What each model can say about this variety AT ALL, before asking whether it
  // has said it yet. Pinot gris has budburst and no stages; Cabernet franc,
  // Cabernet sauvignon, Grenache and Riesling have stages and no budburst.
  const notModelled = (model) => {
    if (model === 'budburst' && !variety.has_budburst) {
      return `Budburst is not modelled for ${variety.variety_name}`;
    }
    if (model === 'gdd' && !variety.has_gdd) {
      return `Stage dates are not modelled for ${variety.variety_name}`;
    }
    return null;
  };

  const rows = [
    {
      key: 'regional',
      present: !!regional,
      absentReason: regionalReason,
      // The zone model does not run budburst — that is a per-site calculation —
      // so its budburst cell is empty for a different reason than the variety.
      get: (event) => {
        if (event.model === 'budburst') {
          return { value: null, reason: 'Budburst is modelled per site, not per region' };
        }
        const stage = regional?.stages?.[event.key.replace('_date', '')];
        return { value: stage?.date, isActual: stage?.is_actual };
      },
      caption: regional && (
        <>
          <strong>{fmtStage(regional.stage) || 'stage unknown'}</strong>
          {regional.gdd !== null && regional.gdd !== undefined && (
            <span className="phen-caption-tail">{Math.round(regional.gdd)} GDD</span>
          )}
          {vsBaseline(regional.days_vs_baseline) && (
            <span className="phen-caption-tail">{vsBaseline(regional.days_vs_baseline)}</span>
          )}
        </>
      ),
    },
    {
      key: 'site',
      present: !!site,
      absentReason: siteReason,
      get: (event) => ({ value: site?.[event.key], isActual: site?.[`${event.key.replace('_date', '')}_is_actual`] }),
      caption: site && (
        <>
          <strong>{fmtStage(site.current_stage) || 'stage unknown'}</strong>
          {site.gdd !== null && site.gdd !== undefined && (
            <span className="phen-caption-tail">{Math.round(site.gdd)} GDD</span>
          )}
          {vsBaseline(site.days_vs_baseline) && (
            <span className="phen-caption-tail">{vsBaseline(site.days_vs_baseline)}</span>
          )}
        </>
      ),
    },
  ];

  return (
    <div className="phen-card">
      <div className="phen-card-head">
        <div>
          <h3 className="phen-card-title">{variety.variety_name}</h3>
          <div className="phen-card-sub">
            <span className="phen-chip">{variety.variety_code}</span>
            <span className="phen-card-meta">
              {variety.block_count} block{variety.block_count === 1 ? '' : 's'}
            </span>
            {/* Coverage stated up front. Without it, a Pinot gris card looks
                like a broken flowering model rather than a variety the GDD
                table has never held. */}
            {!variety.has_gdd && <span className="phen-warn">no stage model</span>}
            {!variety.has_budburst && <span className="phen-warn">no budburst model</span>}
          </div>
        </div>
      </div>

      <div className="phen-grid-wrap">
        <table className="phen-grid">
          <thead>
            <tr>
              <th className="phen-grid-corner">Source</th>
              {EVENTS.map((e) => <th key={e.key}>{e.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const meta = SOURCES[row.key];
              const { Icon } = meta;
              return (
                <tr key={row.key}>
                  <th className="phen-grid-source" scope="row">
                    <span className="phen-dot" style={{ background: meta.color }} />
                    <Icon size={14} style={{ color: meta.color }} />
                    <span className="phen-source-name">{meta.short}</span>
                  </th>
                  {row.present
                    ? EVENTS.map((event) => {
                      const cell = row.get(event);
                      return (
                        <DateCell
                          key={event.key}
                          value={cell.value}
                          isActual={cell.isActual}
                          reason={cell.reason || notModelled(event.model)
                            || 'The model has nothing to project from yet'}
                        />
                      );
                    })
                    : (
                      <td className="phen-cell phen-cell--absent" colSpan={EVENTS.length}>
                        {row.absentReason || `No ${meta.label.toLowerCase()} for this variety.`}
                      </td>
                    )}
                </tr>
              );
            })}

            {/* Observed sits apart: it is a present-tense reading, not a set of
                projected dates, so it gets a single spanning cell rather than
                empty date columns that would imply it failed to predict. */}
            <tr>
              <th className="phen-grid-source" scope="row">
                <span className="phen-dot" style={{ background: SOURCES.observed.color }} />
                <Eye size={14} style={{ color: SOURCES.observed.color }} />
                <span className="phen-source-name">Observed</span>
              </th>
              <td className="phen-cell phen-observed" colSpan={EVENTS.length}>
                {observed ? (
                  <>
                    <strong>{observed.most_advanced_stage}</strong>{' '}
                    {observed.most_advanced_stage_name}
                    {!observed.is_uniform && (
                      <span className="phen-caption-tail">range {observed.stage_range}</span>
                    )}
                    <span className="phen-caption-tail">
                      {observed.readable_spots} spot{observed.readable_spots === 1 ? '' : 's'}
                      {observed.observed_on ? ` · ${fmtDate(observed.observed_on)}` : ''}
                    </span>
                    {observed.note && <span className="phen-cell-reason">{observed.note}</span>}
                  </>
                ) : (
                  <span className="phen-cell-reason">
                    Nothing recorded in the field for this variety yet — a phenology
                    observation is what grounds the two models above.
                  </span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {rows.map((row) => (row.present && row.caption ? (
        <div key={`cap-${row.key}`} className="phen-caption">
          <span className="phen-dot" style={{ background: SOURCES[row.key].color }} />
          {row.caption}
        </div>
      ) : null))}
    </div>
  );
}

export default function PhenologyPanel({ selectedPropertyId, selectedProperty }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    if (!selectedPropertyId) { setData(null); return; }
    setLoading(true);
    setFailed(false);
    propertyService.getPropertyPhenology(selectedPropertyId)
      .then(setData)
      .catch(() => { setData(null); setFailed(true); })
      .finally(() => setLoading(false));
  }, [selectedPropertyId]);

  useEffect(load, [load]);

  // Phenology is a property question — the model runs at a point and the
  // varieties come from that property's blocks. "All properties" has no answer,
  // so it asks rather than picking one.
  if (!selectedPropertyId) {
    return (
      <div className="phen">
        <div className="phen-intro">
          <MapPin size={16} className="phen-intro-icon" />
          <p className="phen-intro-text">
            Choose a property above. Growth stages are modelled at a point and reported per
            variety, so there is no company-wide answer to show.
          </p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="phen"><p className="phen-intro-text">Loading growth stages…</p></div>;
  if (failed) {
    return (
      <div className="phen">
        <p className="phen-intro-text">
          Could not load growth stages.{' '}
          <button className="btn-ghost" onClick={load}>Retry</button>
        </p>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="phen">
      <div className="phen-intro">
        <Info size={16} className="phen-intro-icon" />
        <p className="phen-intro-text">
          Each variety on <strong>{data.property_name || selectedProperty?.name}</strong> is
          estimated three ways — your <strong>climate zone&apos;s</strong> model, the same model
          at <strong>this property&apos;s own point</strong>, and your{' '}
          <strong>field observations</strong>. Where they disagree, the observation is the one
          that was actually seen.
          {data.vintage_year && <> Season <strong>{data.vintage_year}</strong>.</>}
        </p>
      </div>

      <div className="phen-legend">
        {Object.entries(SOURCES).map(([key, s]) => {
          const { Icon } = s;
          return (
            <div key={key} className="phen-legend-item">
              <span className="phen-dot" style={{ background: s.color }} />
              <Icon size={15} style={{ color: s.color }} />
              <span className="phen-legend-name">{s.label}</span>
              <span className="phen-legend-hint">{s.hint}</span>
            </div>
          );
        })}
      </div>

      {data.blocks_reason && <p className="phen-disclaimer">{data.blocks_reason}</p>}

      <div className="phen-blocks">
        {data.varieties.map((v) => (
          <VarietyCard
            key={v.variety_code}
            variety={v}
            siteReason={data.site_reason}
            regionalReason={data.regional_reason}
          />
        ))}
      </div>

      {/* Varieties planted here that neither model holds. Listed rather than
          dropped: a grower looking for their Chenin blanc block needs to find
          out why it is absent, not conclude the page is broken. */}
      {data.unmodelled.length > 0 && (
        <div className="phen-unmodelled">
          <h4 className="phen-unmodelled-title">Not modelled</h4>
          <p className="phen-intro-text">
            No growth-stage model exists for these yet, so they are not shown above.
          </p>
          <ul className="phen-unmodelled-list">
            {data.unmodelled.map((u) => (
              <li key={u.variety_text}>
                <strong>{u.variety_text}</strong>
                <span className="phen-card-meta">
                  {' '}— {u.blocks.map((b) => b.label).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.varieties.length === 0 && !data.blocks_reason && (
        <p className="phen-disclaimer">
          None of this property&apos;s blocks name a variety the models can run.
        </p>
      )}
    </div>
  );
}
