// components/pro/PhenologyPanel.jsx — phenology, compact, in the Pro idiom.
//
// Not the region page's `PhenologyExplorer`. That component is built to be
// browsed — expandable varieties, a timeline, six harvest targets — and on a
// site dashboard it is a wall. This is one row per variety and four dates.
//
// SIX HARVEST TARGETS BECAME TWO. The model stores 170 through 220 g/L; they
// differ by a few days each and reading six of them tells a grower nothing they
// can act on. 210 and 220 g/L are the picking decisions.
//
// Those numbers are GRAMS PER LITRE of sugar, not Brix. 210 g/L is about 19.5
// Brix. The header prints the g/L and carries the Brix as a title.
//
// DATES ARE WITHHELD WHEN THERE IS NOTHING TO PROJECT FROM, and the server does
// the withholding — see `insights_dashboard.MIN_GDD_FOR_PREDICTION`. Before the
// season starts the model accumulates zero GDD and its projections run off the
// end of the calendar: flowering in April, harvest 600 days out, all stamped
// "high confidence". The stage and the accumulation are still true, so they stay.
import { Grape, Info } from 'lucide-react';
import './PhenologyPanel.css';

// The model's own vocabulary, tidied for display. An unmapped stage falls back
// to its raw form rather than to a guess.
const STAGE_LABELS = {
  dormant: 'Dormant',
  budburst: 'Budburst',
  pre_flowering: 'Pre-flowering',
  flowering: 'Flowering',
  post_flowering: 'Post-flowering',
  veraison: 'Véraison',
  post_veraison: 'Post-véraison',
  ripening: 'Ripening',
  harvest_ready: 'Harvest ready',
};

function stageLabel(stage) {
  if (!stage) return '—';
  return STAGE_LABELS[stage] || stage.replace(/_/g, ' ');
}

function shortDate(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// Five outcomes, not two. `beyond_season` is the one that matters: a variety
// whose 220 g/L date falls past the end of the season is not missing a date, it
// is not expected to get there — which is the more useful statement.
function Cell({ stage }) {
  if (!stage) return <td className="phenology__cell">—</td>;

  if (stage.date) {
    return (
      <td className={`phenology__cell${stage.is_actual ? ' is-actual' : ''}`}>
        {shortDate(stage.date)}
        {stage.is_actual && <span className="phenology__actual" title="Observed">•</span>}
      </td>
    );
  }
  if (stage.status === 'beyond_season') {
    return <td className="phenology__cell is-muted" title="Not projected to reach this within the season">not this season</td>;
  }
  return <td className="phenology__cell is-muted">—</td>;
}

function PhenologyPanel({ phenology }) {
  if (!phenology?.available) return null;
  const varieties = phenology.varieties || [];
  if (!varieties.length) return null;

  const targets = phenology.harvest_targets || [];

  return (
    <div className="phenology">
      <table className="phenology__table">
        <thead>
          <tr>
            <th scope="col">
              <Grape size={13} aria-hidden="true" /> Variety
            </th>
            <th scope="col">Stage</th>
            <th scope="col" className="phenology__num">GDD</th>
            <th scope="col">Flowering</th>
            <th scope="col">Véraison</th>
            {targets.map((t) => (
              // GRAMS PER LITRE, not Brix. 210 g/L is about 19.5 Brix — calling
              // it "21.0 Brix" overstates ripeness by a point and a half at the
              // moment someone is deciding whether to pick. The Brix equivalent
              // comes from the server rather than being derived here, because
              // the conversion is not linear.
              <th scope="col" key={t.sugar_g_l} title={`${t.brix} Brix`}>
                {t.sugar_g_l} g/L
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {varieties.map((v) => (
            <tr key={v.code}>
              <th scope="row">{v.name}</th>
              <td className="phenology__stage">{stageLabel(v.stage)}</td>
              <td className="phenology__num">
                {v.gdd == null ? '—' : Math.round(v.gdd).toLocaleString()}
              </td>
              <Cell stage={v.stages?.flowering} />
              <Cell stage={v.stages?.veraison} />
              {targets.map((t) => (
                <Cell key={t.sugar_g_l}
                      stage={v.stages?.[`harvest_${t.sugar_g_l}`]} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Véraison is a different KIND of measurement from the columns either
          side of it, and the difference is easy to miss in a row of dates.
          Flowering and the harvest targets are sugar-driven; véraison is a
          colour-change estimate, so it is not comparable to a Brix or g/L
          reading taken in the vineyard. Its thresholds are northern-hemisphere
          derived, which biases it late here. Stated at the point of use rather
          than only on the methodology page. */}
      <p className="phenology__caveat">
        <Info size={14} aria-hidden="true" />
        Véraison is modelled as roughly half the berries changing colour, not
        measured on soluble solids. Its thresholds carry a northern hemisphere
        bias and can report later than véraison is actually recorded here.
      </p>

      {!phenology.predictions_available && (
        <p className="phenology__withheld">
          <Info size={14} aria-hidden="true" />
          {phenology.predictions_reason}
        </p>
      )}
    </div>
  );
}

export default PhenologyPanel;
