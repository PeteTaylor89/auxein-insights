// src/components/climate/RegionalClimateHistory.jsx
/**
 * Climate History, chosen rather than scrolled.
 *
 * This was an accordion of zones, each opening onto a regional explorer with the
 * company's properties nested under it, and the first zone open on arrival. Two
 * problems with that: it decided for the reader which region they came for, and
 * with the property records added underneath (2026-09-23) a single open zone ran
 * to several screens.
 *
 * So: a pill per region and a pill per property, ALL visible at once, and one
 * of them open at a time. (Until 2026-09-24 the property pills only appeared
 * under a chosen region; Pete wanted them flat.) NOTHING IS OPEN ON ARRIVAL,
 * so no history loads that nobody asked for.
 *
 * Every property gets a pill, zoned or not: its own record comes from its
 * climate site, not its zone. The note about properties with no zone stays,
 * because without one there is no regional comparison.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Layers, AlertTriangle } from 'lucide-react';
import { getZones } from '../../services/publicClimateService';
import SeasonExplorer from './SeasonExplorer';
import PropertyClimateHistory from './PropertyClimateHistory';
import './SeasonExplorer.css';
import './RegionalClimateHistory.css';

const RegionalClimateHistory = ({ properties = [] }) => {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  // Nothing selected on arrival — see the note above. One choice across both
  // rows: `{ kind: 'zone' | 'property', id }`.
  const [choice, setChoice] = useState(null);

  useEffect(() => {
    let live = true;
    getZones()
      .then((data) => { if (live) setZones(data?.zones || data || []); })
      .catch(() => { if (live) setZones([]); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const { zoneGroups, unassigned } = useMemo(() => {
    const byZone = new Map();
    const none = [];
    for (const p of properties) {
      if (!p.climate_zone_id) { none.push(p); continue; }
      if (!byZone.has(p.climate_zone_id)) byZone.set(p.climate_zone_id, []);
      byZone.get(p.climate_zone_id).push(p);
    }
    const groups = [];
    for (const [id, props] of byZone) {
      const zone = zones.find((z) => z.id === id);
      if (zone) groups.push({ zone, properties: props });
    }
    groups.sort((a, b) => a.zone.name.localeCompare(b.zone.name));
    return { zoneGroups: groups, unassigned: none };
  }, [properties, zones]);

  const sortedProperties = useMemo(
    () => [...properties].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [properties],
  );

  const isChosen = (kind, id) => choice?.kind === kind && choice.id === id;
  const choose = (kind, id) => setChoice(isChosen(kind, id) ? null : { kind, id });

  const activeZone = choice?.kind === 'zone'
    ? zoneGroups.find((g) => g.zone.id === choice.id)?.zone || null
    : null;
  const activeProperty = choice?.kind === 'property'
    ? properties.find((p) => p.id === choice.id) || null
    : null;

  if (loading) return <p className="rch-loading">Loading climate zones…</p>;

  if (zoneGroups.length === 0 && unassigned.length === 0) {
    return <p className="rch-loading">No properties to show climate history for.</p>;
  }

  return (
    <div className="rch">
      {zoneGroups.length > 0 && (
        <div className="rch-row">
          <span className="rch-row-label">Regions</span>
          <div className="rch-pills" role="group" aria-label="Region">
            {zoneGroups.map(({ zone }) => (
              <button
                key={zone.id}
                type="button"
                className={`rch-pill${isChosen('zone', zone.id) ? ' is-active' : ''}`}
                onClick={() => choose('zone', zone.id)}
              >
                <Layers size={14} aria-hidden="true" />
                {zone.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {sortedProperties.length > 0 && (
        <div className="rch-row">
          <span className="rch-row-label">Properties</span>
          <div className="rch-pills" role="group" aria-label="Property">
            {sortedProperties.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`rch-pill${isChosen('property', p.id) ? ' is-active' : ''}`}
                onClick={() => choose('property', p.id)}
              >
                <MapPin size={14} aria-hidden="true" />
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {!choice && (
        <p className="rch-prompt">
          Choose a region for its climate history, or a property for its own
          1986&ndash;2023 record.
        </p>
      )}

      {activeZone && (
        <SeasonExplorer
          key={activeZone.id}
          zone={{
            slug: activeZone.slug,
            name: activeZone.name,
            region_name: activeZone.region_name,
          }}
        />
      )}

      {activeProperty && (
        <PropertyClimateHistory
          key={activeProperty.id}
          property={activeProperty}
          embedded
        />
      )}

      {unassigned.length > 0 && (
        <div className="rch-unassigned">
          <p className="rch-unassigned-note">
            <AlertTriangle size={15} aria-hidden="true" />
            {unassigned.length === 1 ? 'One property has' : `${unassigned.length} properties have`}
            {' '}no climate zone set, so there is no regional history to show for
            {unassigned.length === 1 ? ' it' : ' them'}. Assign one in Manage &rarr; Weather.
            <span className="rch-unassigned-names">
              {unassigned.map((p) => p.name).join(', ')}
            </span>
          </p>
        </div>
      )}
    </div>
  );
};

export default RegionalClimateHistory;
