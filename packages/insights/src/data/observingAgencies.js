// src/data/observingAgencies.js — who actually collects the observations.
//
// ONE list, imported by both the in-app methodology modal (ClimateAbout) and
// the public /about page. It used to live inside ClimateAbout only; when the
// About page was rewritten to carry the same acknowledgement, copying it would
// have created a second place to forget.
//
// Mirrors the ingestion source list in `ingestion/run_ingestion.py` — update
// both together when a source is added. This is an acknowledgement, not a
// feature list: an agency belongs here when we ingest its data, whether or not
// any particular view surfaces it yet.

export const OBSERVING_AGENCIES = [
  { name: 'Bay of Plenty Regional Council', url: 'https://www.boprc.govt.nz' },
  { name: 'Environment Canterbury (ECan)', url: 'https://www.ecan.govt.nz' },
  { name: 'Environment Southland', url: 'https://www.es.govt.nz' },
  { name: 'Gisborne District Council', url: 'https://www.gdc.govt.nz' },
  { name: "Hawke's Bay Regional Council", url: 'https://www.hbrc.govt.nz' },
  { name: 'Horizons Regional Council (Manawatū-Whanganui)', url: 'https://www.horizons.govt.nz' },
  { name: 'Marlborough District Council', url: 'https://www.marlborough.govt.nz' },
  { name: 'Northland Regional Council', url: 'https://www.nrc.govt.nz' },
  { name: 'Taranaki Regional Council', url: 'https://www.trc.govt.nz' },
  { name: 'Tasman District Council', url: 'https://www.tasman.govt.nz' },
  { name: 'West Coast Regional Council', url: 'https://www.wcrc.govt.nz' },
];

// Station operators and international observing programmes. Separate from the
// councils because the relationship is different: these are infrastructure
// providers and global data exchanges, not New Zealand public agencies
// publishing their own regional monitoring.
export const OBSERVING_PROGRAMMES = [
  {
    name: 'Growers and landowners who host weather stations and share their data with the network',
    url: null,
  },
  {
    name: 'Harvest Electronics - telemetry and station infrastructure',
    url: 'https://www.harvest.com',
  },
  {
    name: 'NOAA National Centers for Environmental Information',
    url: 'https://www.ncei.noaa.gov',
  },
  {
    name: 'World Meteorological Organization - synoptic observation exchange',
    url: 'https://wmo.int',
  },
];
