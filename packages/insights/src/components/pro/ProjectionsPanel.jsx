// components/pro/ProjectionsPanel.jsx — PLACEHOLDER, and honest about it.
//
// The 3x3 that will eventually fill this — three emissions scenarios against
// three time horizons — is drawn now, empty, because an absent section tells a
// subscriber nothing while an empty one that names its axes tells them what is
// coming and roughly when it will matter.
//
// WHY IT IS EMPTY. `climate_projections` is real and populated, but it was
// produced per REGION off the engine. There is no projection surface to sample,
// so this cell has no projected numbers of its own. The shortcut — applying the
// zone's monthly deltas to the site's own normal — is deliberately not taken:
// it would put a regional number on screen wearing the site's baseline, and it
// would have to be unpicked once the surfaces exist.
//
// The scenario and horizon vocabulary comes from the SERVER, not from a list in
// this file, so the shell and the eventual data cannot disagree about what the
// axes are.
import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, LineChart } from 'lucide-react';
import './ProjectionsPanel.css';

function ProjectionsPanel({ projections }) {
  if (!projections) return null;

  const { scenarios = [], periods = [] } = projections;

  return (
    <section className="projections" aria-labelledby="projections-heading">
      <header className="projections__head">
        <h3 id="projections-heading">
          <LineChart size={16} aria-hidden="true" />
          Climate projections
          <span className="projections__state">coming</span>
        </h3>
        <p className="projections__scope">
          {scenarios.length} scenarios across {periods.length} time horizons,
          against the {projections.baseline} baseline.
        </p>
      </header>

      {/* The axes, drawn but inert. Every cell is the same placeholder — there
          is no partial data here and none is implied. */}
      <div className="projections__grid" role="presentation">
        <div className="projections__corner" />
        {periods.map((p) => (
          <div key={p.key} className="projections__period">
            <span>{p.label}</span>
            <small>{p.years}</small>
          </div>
        ))}

        {scenarios.map((s) => (
          <Fragment key={s.key}>
            <div className="projections__scenario">
              <span>{s.label}</span>
              <small>{s.detail}</small>
            </div>
            {periods.map((p) => (
              <div key={`${s.key}-${p.key}`} className="projections__cell" />
            ))}
          </Fragment>
        ))}
      </div>

      <p className="projections__reason">{projections.reason}</p>

      {/* The regional projections exist TODAY and are worth reading. Sending a
          subscriber there is more useful than making them wait, and it is also
          the honest framing of what is and is not available at site scale. */}
      {projections.regional_available && projections.zone_slug && (
        <p className="projections__link">
          <Link to={`/regions/${projections.zone_slug}`}>
            See the projections for {projections.zone_name}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </p>
      )}
    </section>
  );
}

export default ProjectionsPanel;
