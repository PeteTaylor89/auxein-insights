// components/explore/PhenologyTable.jsx — where each variety is, as a table.
//
// Phase 4 of docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md.
//
// A TABLE, not the `PhenologyExplorer`. That component is a browsing tool —
// expandable varieties, a timeline, six harvest targets — and it is still one
// click away. What a regional dashboard wants is nine varieties and four dates
// readable in one glance, which is a table.
//
// WITHHELD DATES ARE NOT MISSING DATES, and conflating them is the failure this
// component exists to avoid. The server withholds a projected date when there
// is no basis for it — zero accumulated GDD to project from, or a date landing
// outside the vintage it belongs to. A 2027 harvest predicted for June 2028 is
// not a distant estimate, it is a wrong one. The row keeps its stage and its
// accumulation, which are both true and both useful; only the date goes, and it
// renders as an explained dash rather than as blank.
//
// Actual dates are marked. An observed flowering and a modelled one are
// different claims and a grower planning a spray needs to know which they have.
import { Check, Info } from 'lucide-react';
import './explore.css';

const STAGES = [
  ['flowering', 'Flowering'],
  ['veraison', 'Véraison'],
  ['harvest_210', 'Harvest 210 g/L'],
  ['harvest_220', 'Harvest 220 g/L'],
];

function fmt(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
}

function Cell({ stage }) {
  if (!stage) return <td className="ph__cell">—</td>;
  const date = fmt(stage.date);
  if (!date) {
    // `status` says WHY it is not shown. Surfacing it as a title keeps the
    // table narrow while leaving the reason recoverable.
    return (
      <td className="ph__cell ph__cell--withheld" title={`Not projected (${stage.status})`}>
        —
      </td>
    );
  }
  return (
    <td className={`ph__cell${stage.is_actual ? ' ph__cell--actual' : ''}`}>
      {date}
      {stage.is_actual && <Check size={13} aria-label="observed" />}
    </td>
  );
}

function PhenologyTable({ phenology }) {
  if (!phenology) return null;

  if (!phenology.available) {
    return (
      <p className="block__absent">
        <Info size={15} aria-hidden="true" />
        {phenology.reason}
      </p>
    );
  }

  const varieties = phenology.varieties || [];

  return (
    <>
      {/* The model's vintage and the page's disagree in May and June — on 1
          June the model still reports the season that just finished. Printing
          the model's own vintage stops the table inheriting a heading that is
          describing a different season. */}
      {phenology.vintage_differs_from_page && (
        <p className="block__note">
          Showing the {phenology.vintage_year} season, which the model is still
          reporting. The page heading names {phenology.page_vintage}.
        </p>
      )}

      <div className="block__scroll">
        <table className="ph">
          <thead>
            <tr>
              <th scope="col">Variety</th>
              <th scope="col">Stage</th>
              <th scope="col" className="ph__num">GDD</th>
              {STAGES.map(([key, label]) => (
                <th scope="col" key={key}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {varieties.map((v) => (
              <tr key={v.code}>
                <th scope="row">{v.name}</th>
                <td className="ph__stage">
                  {(v.stage || '—').replace(/_/g, ' ')}
                </td>
                <td className="ph__num">
                  {v.gdd === null || v.gdd === undefined ? '—' : Math.round(v.gdd)}
                </td>
                {STAGES.map(([key]) => (
                  <Cell key={key} stage={v.stages?.[key]} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!phenology.predictions_available && phenology.predictions_reason && (
        <p className="block__note">{phenology.predictions_reason}</p>
      )}
      <p className="block__note block__note--quiet">
        <Check size={12} aria-hidden="true" /> marks an observed date. Everything
        else is modelled.
      </p>
    </>
  );
}

export default PhenologyTable;
