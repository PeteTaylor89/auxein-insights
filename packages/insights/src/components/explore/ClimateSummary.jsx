// components/explore/ClimateSummary.jsx — history and projections, tight.
//
// Phase 4 of docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md.
//
// Two blocks that answer one question between them — "what does this region do,
// and what is it becoming" — so they are laid out as one row of figures each
// rather than as two charts. The full history and projection explorers are one
// click away and this is deliberately not them.
//
// BOTH HALVES NOW COME FROM THE SURFACES (2026-08-24). History is the archive
// rolled up over each region's planted cells; projections are the MfE 2024
// fields composed onto the same 1986-2005 normals and sampled through the same
// mask. Before this the history stopped at 2023 and the projections came from a
// different engine entirely, so the two halves were not comparable — which is
// the whole reason they sit side by side.
//
// The span is PRINTED rather than assumed, because the previous version
// hardcoded a 2023 ceiling into its own copy and that went stale within days.
//
// A per-decade trend and no significance test, matching the Pro page. A p-value
// on a smoothed regional series would imply more precision than the estimator
// has.
import { Info, Lock, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import './explore.css';

// `direction` says which way is GOOD for a grower, and only drives colour. It
// never hides or reorders a number.
function Trend({ value, unit, direction }) {
  if (value === null || value === undefined) {
    return <span className="trend trend--none">no trend</span>;
  }
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  if (rounded === 0) {
    return (
      <span className="trend trend--flat">
        <Minus size={13} aria-hidden="true" /> steady
      </span>
    );
  }
  const rising = rounded > 0;
  const good = direction ? (rising ? direction === 'up' : direction === 'down') : null;
  const Icon = rising ? TrendingUp : TrendingDown;
  const tone = good === null ? 'neutral' : (good ? 'good' : 'bad');
  return (
    <span className={`trend trend--${tone}`}>
      <Icon size={13} aria-hidden="true" />
      {rising ? '+' : ''}{rounded.toFixed(1)} {unit}/decade
    </span>
  );
}

function num(v, digits = 1) {
  if (v === null || v === undefined) return '—';
  return Number(v).toFixed(digits);
}

/**
 * A gated block, described but not served.
 *
 * The server withholds the numbers; this says what sits behind them. A prompt
 * that cannot name what it is offering does not convert, so the span and the
 * metrics are spelled out even though the values are not.
 *
 * THE CTA FOLLOWS `block.tier`. History and projections moved from Pro to a
 * free account on 2026-08-25, and a prompt that sends someone to a pricing page
 * for something a free sign-up would open is the most expensive kind of wrong
 * copy — it reads as a paywall on the exact two blocks that make a region page
 * worth landing on. The tier comes from the server so the two cannot drift.
 */
export function Locked({ block, onSignInRequired }) {
  if (!block) return null;
  const needsAccount = block.tier === 'registration';
  return (
    <div className="locked">
      <Lock size={17} aria-hidden="true" />
      <div>
        <strong>{block.reason}</strong>
        {block.detail && <span>{block.detail}</span>}
      </div>
      {needsAccount ? (
        <button
          type="button"
          className="locked__cta"
          onClick={onSignInRequired}
          disabled={!onSignInRequired}
        >
          Sign in free
        </button>
      ) : (
        <a className="locked__cta" href="/pro">See Insights Pro</a>
      )}
    </div>
  );
}

function Absent({ children }) {
  return (
    <p className="block__absent">
      <Info size={15} aria-hidden="true" />
      {children}
    </p>
  );
}

export function HistorySummary({ history, onSignInRequired }) {
  if (!history) return null;
  if (history.locked) {
    return <Locked block={history} onSignInRequired={onSignInRequired} />;
  }
  if (!history.available) return <Absent>{history.reason}</Absent>;

  return (
    <>
      <div className="figures">
        {history.metrics.map((m) => (
          <div className="figure" key={m.key}>
            <span className="figure__label">{m.label}</span>
            <span className="figure__value">
              {num(m.normal)} <small>{m.unit}</small>
            </span>
            <span className="figure__sub">
              {history.baseline} normal
              {m.recent_10yr !== null && m.recent_10yr !== undefined && (
                <> · last 10 seasons {num(m.recent_10yr)}</>
              )}
            </span>
            <Trend value={m.trend_per_decade} unit={m.unit} direction={m.direction} />
          </div>
        ))}
      </div>
      <p className="block__note">
        {history.span.seasons} seasons, {history.span.first}–{history.span.last}.
        {' '}{history.note}
      </p>
    </>
  );
}

export function ProjectionsSummary({ projections, onSignInRequired }) {
  if (!projections) return null;
  if (projections.locked) {
    return <Locked block={projections} onSignInRequired={onSignInRequired} />;
  }
  if (!projections.available) return <Absent>{projections.reason}</Absent>;

  const { showing } = projections;
  // 'fp2041-2060' -> '2041-2060'; 'wl2' -> '2 degrees of warming'. Both are
  // storage keys, neither is a label.
  const periodLabel = String(showing.period).startsWith('wl')
    ? `${String(showing.period).slice(2)}\u00B0C of warming`
    : String(showing.period).replace('fp', '');

  return (
    <>
      <div className="figures">
        {projections.headlines.map((h) => (
          <div className="figure" key={h.key}>
            <span className="figure__label">
              {h.label}
              {/* Not every band has a growing-season arm — only gdd10 does
                  today. Saying which season a number describes is the
                  difference between "12 fewer frost nights in the growing
                  season" and "12 fewer across the whole year", which are very
                  different claims about the same region. */}
              {!h.seasonal && (
                <span className="figure__season" title="Annual figure — no growing-season arm is published for this band">
                  annual
                </span>
              )}
            </span>
            <span className="figure__value figure__value--delta">
              {h.delta === null || h.delta === undefined ? '—' : (
                <>{h.delta > 0 ? '+' : ''}{num(h.delta, h.key === 'tmean' ? 1 : 0)}
                  {' '}<small>{h.unit}</small></>
              )}
            </span>
            <span className="figure__sub">
              {h.baseline === null || h.projected === null
                ? <>change on the {projections.baseline} normal</>
                : <>{num(h.baseline, 0)} → {num(h.projected, 0)} {h.unit}</>}
            </span>
          </div>
        ))}
      </div>

      <p className="block__note">
        {showing.ssp.toUpperCase()}, {periodLabel}. {projections.note}
      </p>
      {/* CC BY 4.0 requires attribution wherever the data is shown. It travels
          with the payload rather than being hardcoded here so the licence and
          the data cannot drift apart. */}
      {projections.attribution && (
        <p className="block__note block__note--quiet">
          {projections.attribution}
        </p>
      )}
    </>
  );
}

export default { HistorySummary, ProjectionsSummary, Locked };
