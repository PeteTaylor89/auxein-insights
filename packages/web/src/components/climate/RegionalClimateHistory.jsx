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
 * So: a pill per region, and — once a region is chosen — a pill per property in
 * it, with the region's own record as the first of those. NOTHING IS OPEN ON
 * ARRIVAL. A company with four regions gets four pills and picks one; that is
 * cheaper to read than four collapsed headers, and it never loads a region's
 * history nobody asked for.
 *
 * Properties with no climate zone are still listed, because a grower looking for
 * one needs to find out why it is not there rather than conclude the page is
 * broken.
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
  // Nothing selected on arrival — see the note above.
  const [zoneId, setZoneId] = useState(null);
  // null means "the region itself"; otherwise a property id.
  const [propertyId, setPropertyId] = useState(null);

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

  const active = zoneGroups.find((g) => g.zone.id === zoneId) || null;
  const activeProperty = active?.properties.find((p) => p.id === propertyId) || null;

  const chooseZone = (id) => {
    setZoneId((current) => (current === id ? null : id));
    // A new region starts on its own record, not on whichever property happened
    // to be selected in the last one.
    setPropertyId(null);
  };

  if (loading) return <p className="rch-loading">Loading climate zones…</p>;

  if (zoneGroups.length === 0 && unassigned.length === 0) {
    return <p className="rch-loading">No properties to show climate history for.</p>;
  }

  return (
    <div className="rch">
      {zoneGroups.length > 0 && (
        <div className="rch-pills" role="group" aria-label="Region">
          {zoneGroups.map(({ zone, properties: zoneProps }) => (
            <button
              key={zone.id}
              type="button"
              className={`rch-pill${zone.id === zoneId ? ' is-active' : ''}`}
              onClick={() => chooseZone(zone.id)}
            >
              <Layers size={14} aria-hidden="true" />
              {zone.name}
              <span className="rch-pill-count">{zoneProps.length}</span>
            </button>
          ))}
        </div>
      )}

      {/* The region's own record is the first pill of the second row rather than
          a separate control: it is one more thing you can be looking at, and
          the reader should not have to learn two ways of choosing. */}
      {active && (
        <div className="rch-pills rch-pills--sub" role="group" aria-label="Property">
          <button
            type="button"
            className={`rch-pill rch-pill--sub${propertyId === null ? ' is-active' : ''}`}
            onClick={() => setPropertyId(null)}
          >
            {active.zone.name} region
          </button>
          {active.properties.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`rch-pill rch-pill--sub${p.id === propertyId ? ' is-active' : ''}`}
              onClick={() => setPropertyId(p.id)}
            >
              <MapPin size={13} aria-hidden="true" />
              {p.name}
            </button>
          ))}
        </div>
      )}

      {!active && (
        <p className="rch-prompt">
          Choose a region to see its climate history, then a property for its own
          1986&ndash;2023 record.
        </p>
      )}

      {active && !activeProperty && (
        <SeasonExplorer
          key={active.zone.id}
          zone={{
            slug: active.zone.slug,
            name: active.zone.name,
            region_name: active.zone.region_name,
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
