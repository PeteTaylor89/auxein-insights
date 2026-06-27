import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { repo } from '@/db';
import type { Wine } from '@/db';
import { computeDashboard, type DashboardStats } from '@/stats/dashboard';
import { DIMENSION_LABELS, computeBlindStats, type BlindStats } from '@/stats/blindAccuracy';

const pct = (n: number | null) => (n == null ? '—' : `${Math.round(n * 100)}%`);
const currentMonth = () => new Date().toISOString().slice(0, 7);

// EPIC 5 — client-side review dashboard over Dexie: tasting totals/breakdowns +
// blind-tasting accuracy on the five D6 dimensions.
export function StatsScreen() {
  const navigate = useNavigate();
  const [data, setData] = useState<{ dash: DashboardStats; blind: BlindStats } | null>(null);

  useEffect(() => {
    void (async () => {
      const [notes, wineList] = [await repo.notes.list(), await repo.wines.list()];
      const wines: Record<string, Wine> = Object.fromEntries(wineList.map((w) => [w.id, w]));
      const dash = computeDashboard(notes, wines, { month: currentMonth() });
      const blind = computeBlindStats(notes, wines);
      setData({ dash, blind });
    })();
  }, []);

  if (!data) return <section className="screen"><p className="screen-blurb">Crunching…</p></section>;
  const { dash, blind } = data;

  if (dash.total === 0) {
    return (
      <section className="screen">
        <h1 className="screen-title">Insights</h1>
        <p className="screen-blurb">No tastings yet. Your stats appear here once you've saved a note.</p>
        <button className="btn btn--block" onClick={() => navigate('/capture', { state: { mode: 'quick' } })}>Quick taste ›</button>
      </section>
    );
  }

  return (
    <section className="screen">
      <h1 className="screen-title">Insights</h1>

      <div className="stat-cards">
        <StatCard value={dash.total} label="Tastings" />
        <StatCard value={dash.thisMonth} label="This month" />
        <StatCard value={`${dash.blind}/${dash.known}`} label="Blind / known" />
        <StatCard value={dash.score.average == null ? '—' : Math.round(dash.score.average)} label="Avg score" sub={dash.score.count ? `${dash.score.count} scored` : 'unscored'} />
      </div>

      {blind.graded > 0 && (
        <>
          <h2 className="screen-subtitle">Blind accuracy</h2>
          <div className="stat-panel">
            <div className="accuracy-head">
              <span className="accuracy-big">{pct(blind.overallAccuracy)}</span>
              <span className="accuracy-sub">{blind.correct}/{blind.gradable} calls · {blind.graded} blind wines</span>
            </div>
            <div className="bars">
              {blind.byDimension.map((d) => (
                <Bar key={d.dimension} label={DIMENSION_LABELS[d.dimension]} ratio={d.accuracy} value={d.gradable ? pct(d.accuracy) : '—'} muted={!d.gradable} />
              ))}
            </div>
          </div>
          {blind.byVariety.some((v) => v.gradable > 0) && (
            <BreakdownPanel title="By variety" rows={blind.byVariety.filter((v) => v.gradable).slice(0, 8).map((v) => ({ key: v.key, ratio: v.accuracy, value: `${pct(v.accuracy)} · ${v.graded}` }))} />
          )}
          {blind.byRegion.some((v) => v.gradable > 0) && (
            <BreakdownPanel title="By region" rows={blind.byRegion.filter((v) => v.gradable).slice(0, 8).map((v) => ({ key: v.key, ratio: v.accuracy, value: `${pct(v.accuracy)} · ${v.graded}` }))} />
          )}
        </>
      )}

      {dash.score.count > 0 && (
        <>
          <h2 className="screen-subtitle">Score distribution</h2>
          <CountBars rows={dash.score.distribution.filter((d) => d.count > 0)} />
        </>
      )}

      <h2 className="screen-subtitle">By variety</h2>
      <CountBars rows={dash.byVariety.slice(0, 10)} empty="No varieties recorded." />

      <h2 className="screen-subtitle">By region</h2>
      <CountBars rows={dash.byRegion.slice(0, 10)} empty="No regions recorded." />

      <h2 className="screen-subtitle">By grid</h2>
      <CountBars rows={dash.byTemplate} />

      {dash.vintageSpread.length > 0 && (
        <>
          <h2 className="screen-subtitle">Vintage spread</h2>
          <CountBars rows={dash.vintageSpread.map((v) => ({ key: String(v.vintage), count: v.count }))} />
        </>
      )}

      <h2 className="screen-subtitle">Over time</h2>
      <CountBars rows={dash.overTime.map((m) => ({ key: m.key, count: m.count }))} />
    </section>
  );
}

function StatCard({ value, label, sub }: { value: string | number; label: string; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}

// A proportion bar (0..1). Used for accuracy.
function Bar({ label, ratio, value, muted }: { label: string; ratio: number | null; value: string; muted?: boolean }) {
  return (
    <div className={muted ? 'bar bar--muted' : 'bar'}>
      <span className="bar-label">{label}</span>
      <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.round((ratio ?? 0) * 100)}%` }} /></span>
      <span className="bar-value">{value}</span>
    </div>
  );
}

function BreakdownPanel({ title, rows }: { title: string; rows: { key: string; ratio: number | null; value: string }[] }) {
  return (
    <>
      <h3 className="stat-subhead">{title}</h3>
      <div className="bars">
        {rows.map((r) => (
          <Bar key={r.key} label={r.key} ratio={r.ratio} value={r.value} />
        ))}
      </div>
    </>
  );
}

// Count bars scaled to the largest count in the set.
function CountBars({ rows, empty }: { rows: { key: string; count: number }[]; empty?: string }) {
  const max = useMemo(() => Math.max(1, ...rows.map((r) => r.count)), [rows]);
  if (rows.length === 0) return <p className="screen-blurb">{empty ?? 'Nothing yet.'}</p>;
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar" key={r.key}>
          <span className="bar-label">{r.key}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.round((r.count / max) * 100)}%` }} /></span>
          <span className="bar-value">{r.count}</span>
        </div>
      ))}
    </div>
  );
}
