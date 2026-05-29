// components/phenology/PhenologyPanel.jsx
// High-fidelity, NON-WIRED phenology comparison view. All data below is mock —
// no API calls. Each block compares three independent phenology estimates:
//   1. Regional  — Auxein Insights model from the block's climate zone + variety
//   2. Local     — same model driven by the company's own weather stations
//   3. Observed  — derived from the most recent in-field phenology observations
// Markers sit on a shared BBCH-style stage timeline so divergence is obvious.
import { useState } from 'react';
import { Satellite, Radio, Eye, Info } from 'lucide-react';
import './PhenologyPanel.css';

// Canonical grapevine phenology stages (simplified BBCH principal stages).
const STAGES = ['Budburst', 'Leaf Dev.', 'Flowering', 'Fruit Set', 'Veraison', 'Harvest'];
const LAST = STAGES.length - 1;

const SOURCES = {
  regional: { label: 'Regional model', short: 'Regional', color: 'var(--color-info)', Icon: Satellite,
    hint: 'Climate-zone model · zone + variety' },
  local: { label: 'Local stations', short: 'Local', color: 'var(--color-primary)', Icon: Radio,
    hint: 'Same model · company weather stations' },
  observed: { label: 'Field observations', short: 'Observed', color: 'var(--color-accent)', Icon: Eye,
    hint: 'Most recent in-field phenology obs' },
};

// ── Mock blocks ────────────────────────────────────────────────────────────
// `value` = fractional position along STAGES (e.g. 2.4 = 40% through Flowering).
const BLOCKS = [
  {
    id: 1, name: 'Home Block', variety: 'Sauvignon Blanc', zone: 'Wairau Plains', area: 12.4,
    regional: { value: 2.4, nextDate: '12 Dec', confidence: 'High' },
    local: { value: 2.2, nextDate: '14 Dec', confidence: 'High' },
    observed: { value: 2.5, obsDate: '28 Nov', sampleSize: 14 },
  },
  {
    id: 2, name: 'River Terrace', variety: 'Pinot Noir', zone: 'Southern Valleys', area: 8.1,
    regional: { value: 3.1, nextDate: '20 Dec', confidence: 'Moderate' },
    local: { value: 2.6, nextDate: '27 Dec', confidence: 'High' },
    observed: { value: 3.6, obsDate: '1 Dec', sampleSize: 9 },
  },
  {
    id: 3, name: 'Quarry Hill', variety: 'Chardonnay', zone: 'Awatere Valley', area: 5.7,
    regional: { value: 2.0, nextDate: '18 Dec', confidence: 'Moderate' },
    local: { value: 1.8, nextDate: '22 Dec', confidence: 'Low' },
    observed: null,
  },
  {
    id: 4, name: 'Stony Rise', variety: 'Pinot Gris', zone: 'Wairau Plains', area: 9.8,
    regional: { value: 3.4, nextDate: '6 Jan', confidence: 'High' },
    local: { value: 3.5, nextDate: '4 Jan', confidence: 'High' },
    observed: { value: 3.3, obsDate: '2 Dec', sampleSize: 21 },
  },
];

const pct = (v) => `${Math.max(0, Math.min(1, v / LAST)) * 100}%`;
const stageName = (v) => STAGES[Math.max(0, Math.min(LAST, Math.floor(v)))];
const nextStageName = (v) => STAGES[Math.min(LAST, Math.floor(v) + 1)];

// Spread across the available source estimates, in stage units.
function divergence(block) {
  const vals = ['regional', 'local', 'observed']
    .map((k) => block[k]?.value)
    .filter((v) => v != null);
  if (vals.length < 2) return { spread: 0, label: 'Single source', level: 'none' };
  const spread = Math.max(...vals) - Math.min(...vals);
  if (spread >= 0.75) return { spread, label: 'Diverging', level: 'high' };
  if (spread >= 0.35) return { spread, label: 'Minor variance', level: 'mid' };
  return { spread, label: 'Aligned', level: 'low' };
}

function StageAxis() {
  return (
    <div className="phen-row phen-axis-row">
      <div className="phen-row-label phen-axis-corner">Stage</div>
      <div className="phen-axis">
        {STAGES.map((s, i) => (
          <span key={s} className="phen-axis-tick" style={{ left: pct(i) }}>{s}</span>
        ))}
      </div>
    </div>
  );
}

function SourceTrack({ sourceKey, data }) {
  const meta = SOURCES[sourceKey];
  const { Icon } = meta;

  return (
    <div className="phen-row">
      <div className="phen-row-label">
        <span className="phen-dot" style={{ background: meta.color }} />
        <Icon size={15} style={{ color: meta.color }} />
        <span className="phen-source-name">{meta.short}</span>
      </div>

      <div className="phen-rail-wrap">
        <div className="phen-rail">
          {/* faint stage gridlines */}
          {STAGES.map((s, i) => (
            <span key={s} className="phen-rail-grid" style={{ left: pct(i) }} />
          ))}

          {data ? (
            <>
              <div className="phen-rail-fill" style={{ width: pct(data.value), background: meta.color }} />
              <div
                className="phen-marker"
                style={{ left: pct(data.value), borderColor: meta.color }}
                title={`${stageName(data.value)} (${meta.label})`}
              />
            </>
          ) : (
            <div className="phen-rail-empty">No recent observations</div>
          )}
        </div>

        {data ? (
          <div className="phen-caption">
            <strong>{stageName(data.value)}</strong>
            <span className="phen-caption-sep">→</span>
            <span>{nextStageName(data.value)}</span>
            {sourceKey === 'observed' ? (
              <span className="phen-caption-tail">obs {data.obsDate} · n={data.sampleSize}</span>
            ) : (
              <span className="phen-caption-tail">est. {data.nextDate} · {data.confidence} conf.</span>
            )}
          </div>
        ) : (
          <div className="phen-caption phen-caption--muted">Encourage a field observation to ground-truth the models.</div>
        )}
      </div>
    </div>
  );
}

function BlockCard({ block }) {
  const div = divergence(block);
  return (
    <div className="phen-card">
      <div className="phen-card-head">
        <div>
          <h3 className="phen-card-title">{block.name}</h3>
          <div className="phen-card-sub">
            <span className="phen-chip">{block.variety}</span>
            <span className="phen-card-meta">{block.zone}</span>
            <span className="phen-card-meta">{block.area} ha</span>
          </div>
        </div>
        <span className={`phen-status phen-status--${div.level}`}>
          {div.label}
          {div.level !== 'none' && div.level !== 'low' && (
            <span className="phen-status-spread"> · {div.spread.toFixed(1)} stage</span>
          )}
        </span>
      </div>

      <div className="phen-timeline">
        <StageAxis />
        <SourceTrack sourceKey="regional" data={block.regional} />
        <SourceTrack sourceKey="local" data={block.local} />
        <SourceTrack sourceKey="observed" data={block.observed} />
      </div>
    </div>
  );
}

function PhenologyPanel() {
  const [view] = useState('cards');

  return (
    <div className="phen">
      <div className="phen-intro">
        <Info size={16} className="phen-intro-icon" />
        <p className="phen-intro-text">
          Each block is estimated three ways — the <strong>regional</strong> climate-zone model,
          the same model run on your <strong>local weather stations</strong>, and your most recent
          <strong> field observations</strong>. Comparing them flags where the models drift from what's
          actually happening in the vineyard.
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

      <div className="phen-blocks">
        {BLOCKS.map((b) => <BlockCard key={b.id} block={b} />)}
      </div>

      <p className="phen-disclaimer">Preview with sample data — not yet connected to live models.</p>
    </div>
  );
}

export default PhenologyPanel;
