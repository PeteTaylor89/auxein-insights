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
import { Satellite, Radio, Eye, Info, MapPin, Check, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
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

// One variety, as a LINE rather than a grid.
//
// The grid this replaces rendered every stage as a column against all three
// sources: twelve cells per variety, most of them a dash for most of the
// season, and a "Harvest 22.0" column printed in September in the same font as
// a budburst date that had already happened.
//
// The server now sends an ordered timeline with a ROLE per stage, from the same
// `phenology_basis` rules the Insights endpoints use: what is behind us, the ONE
// stage being headed for, and what is waiting on something earlier. Only the
// next stage carries a projected date — that is the model declining to claim it
// can see a picking window before the vines have broken bud, and it is a rule
// this component must not route around.
function VarietyCard({ variety, siteReason, regionalReason }) {
  const [showLater, setShowLater] = useState(false);
  const { timeline, observed, site, regional } = variety;

  const scope = variety.timeline_scope;
  // The caption is whichever source the line was built from, because that is
  // what the dates below belong to.
  const head = scope === "site" ? site : regional;
  const reason = scope === "site" ? siteReason : regionalReason;

  const shown = (timeline || []).filter((t) => t.role === "passed" || t.role === "next");
  const later = (timeline || []).filter((t) => t.role === "awaiting" || t.role === "unavailable");

  return (
    <div className="phen-card">
      <div className="phen-card-head">
        <div>
          <h3 className="phen-card-title">{variety.variety_name}</h3>
          <div className="phen-card-sub">
            <span className="phen-chip">{variety.variety_code}</span>
            <span className="phen-card-meta">
              {variety.block_count} block{variety.block_count === 1 ? "" : "s"}
            </span>
            {/* Coverage stated up front. Without it a Pinot gris card looks
                like a broken flowering model rather than a variety the GDD
                table has never held. */}
            {!variety.has_gdd && <span className="phen-warn">no stage model</span>}
            {!variety.has_budburst && <span className="phen-warn">no budburst model</span>}
          </div>
        </div>

        {head && (
          <div className="phen-card-now">
            {head.current_stage && <strong>{fmtStage(head.current_stage)}</strong>}
            {head.gdd !== null && head.gdd !== undefined && (
              <span className="phen-caption-tail">{Math.round(head.gdd)} GDD</span>
            )}
            {vsBaseline(head.days_vs_baseline) && (
              <span className="phen-caption-tail">{vsBaseline(head.days_vs_baseline)}</span>
            )}
            <span className="phen-scope-tag">
              {scope === "site" ? "This property" : "Region"}
            </span>
          </div>
        )}
      </div>

      {!timeline && (
        <p className="phen-cell-reason">
          {reason || "No growth-stage model has run for this variety yet."}
        </p>
      )}

      {timeline && (
        <ol className="phen-line">
          {shown.map((t) => (
            <li key={t.key} className={`phen-step is-${t.role}`}>
              <span className="phen-step-mark" aria-hidden="true">
                {t.role === "passed" ? <Check size={13} /> : <ArrowRight size={13} />}
              </span>
              <span className="phen-step-label">{t.label}</span>
              <span className="phen-step-date">{fmtDate(t.date)}</span>
              <span className="phen-step-basis">
                {/* A date in the future is a PREDICTION; the same date once it
                    is behind us is what the model says happened, which is not
                    the same claim. */}
                {t.role === "next" && t.days_away !== null
                  ? (t.days_away === 0
                    ? "today"
                    : `in ${t.days_away} day${t.days_away === 1 ? "" : "s"}`)
                  : t.basis}
              </span>
              {t.regional_date && scope === "site" && (
                <span className="phen-step-region">region {fmtDate(t.regional_date)}</span>
              )}
            </li>
          ))}

          {shown.length === 0 && (
            <li className="phen-step is-unavailable">
              <span className="phen-step-label">
                Nothing to show yet — the season has not accumulated enough to
                project from.
              </span>
            </li>
          )}
        </ol>
      )}

      {later.length > 0 && (
        <>
          <button
            type="button"
            className="phen-later-toggle"
            onClick={() => setShowLater((v) => !v)}
            aria-expanded={showLater}
          >
            {showLater ? "Hide later stages" : "Show later stages"}
            {showLater ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {showLater && (
            <ol className="phen-line phen-line--later">
              {later.map((t) => (
                <li key={t.key} className={`phen-step is-${t.role}`}>
                  <span className="phen-step-mark" aria-hidden="true" />
                  <span className="phen-step-label">{t.label}</span>
                  <span className="phen-step-basis">
                    {t.role === "awaiting"
                      ? `after ${t.after}`
                      : notModelledFor(variety, t.key) || "no date yet"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {/* Observed sits apart: it is a present-tense reading of what somebody
          saw, not a projected date, so it is never a step on the line. */}
      <div className="phen-observed-row">
        <Eye size={13} style={{ color: SOURCES.observed.color }} aria-hidden="true" />
        {observed ? (
          <span>
            Observed <strong>{observed.most_advanced_stage}</strong>{" "}
            {observed.most_advanced_stage_name}
            {!observed.is_uniform && <> · range {observed.stage_range}</>}
            {" "}· {observed.readable_spots} spot{observed.readable_spots === 1 ? "" : "s"}
            {observed.observed_on ? ` · ${fmtDate(observed.observed_on)}` : ""}
          </span>
        ) : (
          <span className="phen-cell-reason">
            Nothing recorded in the field for this variety yet — a phenology
            observation is what grounds the model above.
          </span>
        )}
      </div>
    </div>
  );
}

/** Why a stage has no date at all, in this variety's terms. */
function notModelledFor(variety, key) {
  if (key === "budburst" && !variety.has_budburst) {
    return `not modelled for ${variety.variety_name}`;
  }
  if (key !== "budburst" && !variety.has_gdd) {
    return `not modelled for ${variety.variety_name}`;
  }
  return null;
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
