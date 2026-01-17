// packages/insights/src/components/climate/index.js
/**
 * Public Climate Components
 * 
 * Export all climate-related components for Regional Intelligence.
 */

export { default as PublicClimateContainer } from './PublicClimateContainer';
export { default as ZoneSelector } from './ZoneSelector';
export { default as SeasonExplorer } from './SeasonExplorer';
export { default as ProjectionsExplorer } from './ProjectionsExplorer';
export { default as ClimateAbout } from './ClimateAbout';

// Re-export service utilities
export {
  getRegions,
  getZones,
  getZone,
  getZoneBaseline,
  getZoneHistory,
  getZoneSeasons,
  getZoneProjections,
  compareSeasons,
  compareZones,
  SSP_SCENARIOS,
  PROJECTION_PERIODS,
  formatMetricValue,
  formatPercentDiff,
} from '../../services/publicClimateService';