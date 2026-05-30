// src/components/climate/RegionalClimateHistory.jsx
/**
 * RegionalClimateHistory
 *
 * Grow-side Climate History view, organised by climate zone. For each distinct
 * climate zone that the company's properties belong to, it renders a collapsible
 * block: the zone's regional climate history (wired in Phase 2) followed by the
 * properties in that zone nested underneath.
 *
 * Only zones associated with the company's properties are shown. Properties with
 * no climate zone assigned are grouped under "Unassigned" with a prompt.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronDown, ChevronUp, MapPin, MapPinned, Layers, AlertTriangle,
} from 'lucide-react';
import { getZones } from '../../services/publicClimateService';
import SeasonExplorer from './SeasonExplorer';
import './SeasonExplorer.css';
import './RegionalClimateHistory.css';

const RegionalClimateHistory = ({ properties = [] }) => {
  const [zones, setZones] = useState([]);
  const [loadingZones, setLoadingZones] = useState(true);
  const [zonesError, setZonesError] = useState(null);
  const [expandedZoneId, setExpandedZoneId] = useState(null);

  // Load all climate zones once (public endpoint) to resolve property zone ids
  useEffect(() => {
    let alive = true;
    setLoadingZones(true);
    getZones()
      .then((res) => {
        if (!alive) return;
        setZones(Array.isArray(res?.zones) ? res.zones : []);
        setZonesError(null);
      })
      .catch(() => { if (alive) setZonesError('Failed to load climate zones'); })
      .finally(() => { if (alive) setLoadingZones(false); });
    return () => { alive = false; };
  }, []);

  const zoneById = useMemo(() => {
    const m = new Map();
    zones.forEach((z) => m.set(z.id, z));
    return m;
  }, [zones]);

  // Group company properties by their climate zone
  const { zoneGroups, unassigned } = useMemo(() => {
    const groups = new Map(); // zoneId -> { zone, properties: [] }
    const orphans = [];
    properties.forEach((p) => {
      const zid = p.climate_zone_id;
      if (zid && zoneById.has(zid)) {
        if (!groups.has(zid)) groups.set(zid, { zone: zoneById.get(zid), properties: [] });
        groups.get(zid).properties.push(p);
      } else {
        orphans.push(p);
      }
    });
    const sorted = [...groups.values()].sort((a, b) => a.zone.name.localeCompare(b.zone.name));
    return { zoneGroups: sorted, unassigned: orphans };
  }, [properties, zoneById]);

  // Auto-expand the first zone once groups are known
  useEffect(() => {
    if (expandedZoneId == null && zoneGroups.length > 0) {
      setExpandedZoneId(zoneGroups[0].zone.id);
    }
  }, [zoneGroups, expandedZoneId]);

  const toggle = (zid) => setExpandedZoneId((prev) => (prev === zid ? null : zid));

  if (loadingZones) {
    return <div className="rch-state">Loading climate zones…</div>;
  }
  if (zonesError) {
    return <div className="rch-state rch-state-error">{zonesError}</div>;
  }
  if (properties.length === 0) {
    return (
      <div className="rch-state">
        No properties found for your company. Add a property and assign its climate zone
        in Manage → Weather to see regional climate history here.
      </div>
    );
  }

  return (
    <div className="regional-climate-history">
      {zoneGroups.length === 0 && (
        <div className="rch-state">
          None of your properties have a climate zone assigned yet. Set one in
          Manage → Weather to see regional climate history here.
        </div>
      )}

      {zoneGroups.map(({ zone, properties: zoneProps }) => {
        const open = expandedZoneId === zone.id;
        return (
          <div key={zone.id} className={`rch-zone ${open ? 'open' : ''}`}>
            <button
              type="button"
              className="rch-zone-header"
              onClick={() => toggle(zone.id)}
              aria-expanded={open}
            >
              <div className="rch-zone-title">
                <Layers size={18} />
                <span className="rch-zone-name">{zone.name}</span>
                {zone.region_name && <span className="rch-zone-region">{zone.region_name}</span>}
              </div>
              <div className="rch-zone-meta">
                <span className="rch-zone-count">
                  <MapPinned size={14} />
                  {zoneProps.length} {zoneProps.length === 1 ? 'property' : 'properties'}
                </span>
                {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </button>

            {open && (
              <div className="rch-zone-body">
                {/* Zone-level regional climate history */}
                <div className="rch-history">
                  <SeasonExplorer
                    zone={{ slug: zone.slug, name: zone.name, region_name: zone.region_name }}
                  />
                </div>

                {/* Nested property placeholders */}
                <div className="rch-properties">
                  <div className="rch-properties-label">Properties in this zone</div>
                  <div className="rch-property-grid">
                    {zoneProps.map((p) => (
                      <div key={p.id} className="rch-property-card">
                        <div className="rch-property-name">
                          <MapPin size={14} /> {p.name}
                        </div>
                        {p.region && <div className="rch-property-region">{p.region}</div>}
                        <div className="rch-property-note">Property-level climate coming soon</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {unassigned.length > 0 && (
        <div className="rch-zone rch-zone-unassigned open">
          <div className="rch-zone-header static">
            <div className="rch-zone-title">
              <AlertTriangle size={18} />
              <span className="rch-zone-name">Unassigned</span>
            </div>
            <span className="rch-zone-count">
              {unassigned.length} {unassigned.length === 1 ? 'property' : 'properties'}
            </span>
          </div>
          <div className="rch-zone-body">
            <p className="rch-unassigned-note">
              These properties have no climate zone set. Assign one in Manage → Weather
              to see regional climate history.
            </p>
            <div className="rch-property-grid">
              {unassigned.map((p) => (
                <div key={p.id} className="rch-property-card muted">
                  <div className="rch-property-name">
                    <MapPin size={14} /> {p.name}
                  </div>
                  {p.region && <div className="rch-property-region">{p.region}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegionalClimateHistory;
