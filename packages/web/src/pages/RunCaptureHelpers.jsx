// OBS-005 — Type-aware inline helpers for Run Capture
// These helpers are lightweight, client-only calculators to improve usability.
// Usage (inside your RunCapture spot editor):
//   import { SpotHelperPanel, getDominantStage } from './RunCaptureHelpers';
//   <SpotHelperPanel templateType={template?.type} values={values} onSuggest={(next)=>setValues(v=>({...v, ...next}))} />
//
// - `templateType`: string (e.g., 'phenology', 'bud_count', 'flowering', 'yield_pre_veraison', 'yield_post_veraison', 'maturity', 'irrigation', 'frost')
// - `values`: the current editable values for the spot (object of field -> value)
// - `onSuggest(next)`: optional callback to set derived fields (e.g., minutes from start/stop)

import React, { useMemo } from 'react';

// -----------------------------
// Utility functions
// -----------------------------
const num = (v) => (v === '' || v == null || isNaN(Number(v))) ? undefined : Number(v);
const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

// Phenology helpers (E-L split)
export function getSplitTotal(stage_split = []) {
  return stage_split.reduce((s, x) => s + (num(x?.percent) || 0), 0);
}
export function getDominantStage(stage_split = []) {
  if (!Array.isArray(stage_split) || stage_split.length === 0) return undefined;
  return stage_split
    .map((x, i) => ({ i, k: x?.stage_key || x?.stage || x?.key, p: num(x?.percent) || 0 }))
    .sort((a, b) => b.p - a.p)[0]?.k;
}

// Flowering helpers
export function flowersPerShoot(values) {
  const ips = num(values?.inflorescences_per_shoot);
  const fpi = num(values?.flowers_per_inflorescence);
  if (ips == null || fpi == null) return undefined;
  return ips * fpi;
}
export function fruitSetPercent(values) {
  const fpi = num(values?.flowers_per_inflorescence);
  const bpi = num(values?.berries_per_inflorescence);
  if (fpi == null || bpi == null || fpi === 0) return undefined;
  return (bpi / fpi) * 100;
}

// Irrigation helpers
export function runtimeMinutes(values) {
  const start = values?.start_time; // expect ISO or 'HH:mm'
  const stop = values?.stop_time;
  const run = num(values?.run_minutes);
  if (run != null) return run;
  if (!start || !stop) return undefined;
  try {
    const toM = (t) => {
      if (typeof t === 'number') return t; // already minutes
      const [hh, mm] = String(t).split(':').map(Number);
      if (Number.isFinite(hh) && Number.isFinite(mm)) return hh * 60 + mm;
      const d = new Date(t);
      if (!isNaN(d)) return Math.round((d.getHours() * 60) + d.getMinutes());
      return undefined;
    };
    const a = toM(start); const b = toM(stop);
    if (a == null || b == null) return undefined;
    const diff = b - a;
    return diff >= 0 ? diff : undefined;
  } catch { return undefined; }
}
export function irrigationVolumeL(values) {
  const lpm = num(values?.flow_lpm);
  const mins = runtimeMinutes(values);
  if (lpm == null || mins == null) return undefined;
  return lpm * mins;
}
export function pressureDeltaKpa(values) {
  const a = num(values?.pressure_start_kpa);
  const b = num(values?.pressure_end_kpa);
  if (a == null || b == null) return undefined;
  return b - a;
}
export function irrigationAnomaly(values) {
  const dP = pressureDeltaKpa(values);
  if (dP == null) return undefined;
  // naive heuristic: > |50 kPa| change is noteworthy
  return Math.abs(dP) >= 50;
}

// Frost helpers
export function frostRuntime(values) {
  const on = values?.fan_on; const off = values?.fan_off;
  if (!on || !off) return undefined;
  const ms = (t) => new Date(t).getTime();
  const a = ms(on), b = ms(off);
  if (isNaN(a) || isNaN(b) || b < a) return undefined;
  return Math.round((b - a) / 60000);
}
export function frostSeverity(values) {
  const minC = num(values?.min_temp_c);
  if (minC == null) return undefined;
  if (minC <= -2) return 'high';
  if (minC <= 0) return 'medium';
  if (minC <= 2) return 'low';
  return 'none';
}

// Maturity / yield helpers
export function berryWeightFrom100(values) {
  const w100 = num(values?.berry_weight_100);
  if (w100 == null) return undefined;
  return w100 / 100; // grams per berry
}

// Simple badge
function Chip({ tone = 'neutral', children }) {
  const tones = {
    neutral: { bg: '#f3f4f6', bd: '#e5e7eb', fg: '#111827' },
    good: { bg: '#ecfdf5', bd: '#d1fae5', fg: '#065f46' },
    warn: { bg: '#fff7ed', bd: '#fed7aa', fg: '#9a3412' },
    bad: { bg: '#fef2f2', bd: '#fecaca', fg: '#991b1b' },
  };
  const c = tones[tone] || tones.neutral;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, background: c.bg, border: `1px solid ${c.bd}`, color: c.fg }}>
      {children}
    </span>
  );
}

// -----------------------------
// Main helper panel
// -----------------------------
export function SpotHelperPanel({ templateType, values, onSuggest }) {
  const type = (templateType || '').toLowerCase();

  // derived values (memoized)
  const derived = useMemo(() => {
    const d = {};
    if (type.startsWith('phenology')) {
      const total = getSplitTotal(values?.stage_split);
      const dominant = getDominantStage(values?.stage_split);
      d._phenology = { total, dominant };
    }
    if (type.includes('flower')) {
      d._flowers = {
        fps: flowersPerShoot(values),
        setPct: fruitSetPercent(values),
      };
    }
    if (type.includes('irrigation')) {
      d._irrig = {
        minutes: runtimeMinutes(values),
        volumeL: irrigationVolumeL(values),
        deltaKpa: pressureDeltaKpa(values),
        anomaly: irrigationAnomaly(values),
      };
    }
    if (type.includes('frost')) {
      d._frost = {
        runtimeMin: frostRuntime(values),
        severity: frostSeverity(values),
      };
    }
    if (type.includes('maturity')) {
      d._maturity = {
        berry_w_g: values?.berry_weight_g ?? berryWeightFrom100(values),
      };
    }
    return d;
  }, [type, values]);

  // quick suggest handlers
  const suggestMinutes = () => {
    const m = runtimeMinutes(values);
    if (m == null || !onSuggest) return;
    onSuggest({ run_minutes: m });
  };
  const suggestBerryWeight = () => {
    const g = berryWeightFrom100(values);
    if (g == null || !onSuggest) return;
    onSuggest({ berry_weight_g: g });
  };

  // nothing to show
  if (!type) return null;

  return (
    <div className="stat-card" style={{ border: '1px dashed #e5e7eb', borderRadius: 12, padding: 12, background: '#fafafa' }}>
      {/* Phenology */}
      {derived._phenology && (
        <Row label="Phenology">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>Total %:</span>
            <Chip tone={derived._phenology.total === 100 ? 'good' : (derived._phenology.total > 100 ? 'bad' : 'warn')}>
              {derived._phenology.total ?? '—'}%
            </Chip>
            <span>Dominant:</span>
            <Chip>{derived._phenology.dominant || '—'}</Chip>
          </div>
        </Row>
      )}

      {/* Flowering */}
      {derived._flowers && (
        <Row label="Flowering">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>Flowers/Shoot:</span>
            <Chip>{derived._flowers.fps != null ? derived._flowers.fps.toFixed(1) : '—'}</Chip>
            <span>Fruit set %:</span>
            <Chip>{derived._flowers.setPct != null ? derived._flowers.setPct.toFixed(1) : '—'}%</Chip>
          </div>
        </Row>
      )}

      {/* Irrigation */}
      {derived._irrig && (
        <Row label="Irrigation">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>Minutes:</span>
            <Chip>{derived._irrig.minutes ?? '—'}</Chip>
            <button className="btn" onClick={suggestMinutes} style={{ padding: '2px 8px', borderRadius: 6 }}>Use</button>
            <span>Volume (L):</span>
            <Chip>{derived._irrig.volumeL != null ? Math.round(derived._irrig.volumeL) : '—'}</Chip>
            <span>ΔkPa:</span>
            <Chip tone={derived._irrig.deltaKpa != null && Math.abs(derived._irrig.deltaKpa) >= 50 ? 'warn' : 'neutral'}>
              {derived._irrig.deltaKpa != null ? derived._irrig.deltaKpa : '—'}
            </Chip>
            {derived._irrig.anomaly && <Chip tone="warn">Anomaly?</Chip>}
          </div>
        </Row>
      )}

      {/* Frost */}
      {derived._frost && (
        <Row label="Frost">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>Fan runtime:</span>
            <Chip>{derived._frost.runtimeMin ?? '—'} min</Chip>
            <span>Severity:</span>
            <Chip tone={derived._frost.severity === 'high' ? 'bad' : derived._frost.severity === 'medium' ? 'warn' : 'neutral'}>
              {derived._frost.severity || '—'}
            </Chip>
          </div>
        </Row>
      )}

      {/* Maturity */}
      {derived._maturity && (
        <Row label="Maturity">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>Berry weight (g):</span>
            <Chip>{derived._maturity.berry_w_g != null ? derived._maturity.berry_w_g.toFixed(3) : '—'}</Chip>
            {derived._maturity.berry_w_g != null && values?.berry_weight_g == null && (
              <button className="btn" onClick={suggestBerryWeight} style={{ padding: '2px 8px', borderRadius: 6 }}>Use</button>
            )}
          </div>
        </Row>
      )}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: 12, padding: '6px 0' }}>
      <div style={{ color: '#374151', fontWeight: 600 }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}
