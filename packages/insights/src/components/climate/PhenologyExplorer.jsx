// packages/insights/src/components/climate/PhenologyExplorer.jsx
/**
 * PhenologyExplorer Component
 * 
 * Displays phenology estimates for grape varieties including:
 * - Current phenological stage
 * - GDD accumulation and progress
 * - Predicted dates for flowering, véraison, harvest
 * - Timeline visualization
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Grape,
  Calendar,
  Sun,
  Clock,
  Target,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Circle,
  Leaf
} from 'lucide-react';
import {
  getPhenology,
  getVarieties,
  formatGdd,
  formatDate,
  formatShortDate,
  daysUntil,
  PHENOLOGY_STAGES,
  VARIETY_NAMES,
} from '../../services/realtimeClimateService';

// Progress bar colors
const PROGRESS_COLORS = {
  dormant: '#94A3B8',
  early: '#22C55E',
  mid: '#EAB308',
  late: '#8B5CF6',
  ready: '#EF4444',
};

const PhenologyExplorer = ({ zone }) => {
  const [phenologyData, setPhenologyData] = useState(null);
  const [varietiesList, setVarietiesList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedVariety, setExpandedVariety] = useState(null);
  const [selectedVarieties, setSelectedVarieties] = useState(['PN', 'CH', 'SB']); // Default varieties

  // Load varieties list on mount
  useEffect(() => {
    const loadVarieties = async () => {
      try {
        const data = await getVarieties();
        setVarietiesList(data.varieties || []);
      } catch (err) {
        console.error('Error loading varieties:', err);
      }
    };
    loadVarieties();
  }, []);

  // Load phenology data when zone changes
  useEffect(() => {
    if (!zone?.slug) {
      setPhenologyData(null);
      return;
    }

    const loadPhenology = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await getPhenology(zone.slug, {
          varieties: selectedVarieties.join(','),
        });

        setPhenologyData(data);
        
        // Auto-expand first variety
        if (data.varieties?.length > 0) {
          setExpandedVariety(data.varieties[0].variety_code);
        }
      } catch (err) {
        console.error('Error loading phenology:', err);
        setError('Failed to load phenology data');
      } finally {
        setLoading(false);
      }
    };

    loadPhenology();
  }, [zone?.slug, selectedVarieties]);

  // Get stage info
  const getStageInfo = (stageName) => {
    return PHENOLOGY_STAGES[stageName] || PHENOLOGY_STAGES.unknown;
  };

  // Get progress color based on percentage
  const getProgressColor = (pct) => {
    if (pct < 30) return PROGRESS_COLORS.early;
    if (pct < 60) return PROGRESS_COLORS.mid;
    if (pct < 90) return PROGRESS_COLORS.late;
    return PROGRESS_COLORS.ready;
  };

  // Toggle variety expansion
  const toggleVariety = (code) => {
    setExpandedVariety(expandedVariety === code ? null : code);
  };

  // Toggle variety selection
  const toggleVarietySelection = (code) => {
    if (selectedVarieties.includes(code)) {
      if (selectedVarieties.length > 1) {
        setSelectedVarieties(selectedVarieties.filter(v => v !== code));
      }
    } else {
      setSelectedVarieties([...selectedVarieties, code]);
    }
  };

  // No zone selected
  if (!zone) {
    return (
      <div className="phenology-explorer">
        <div className="no-zone-message">
          <Grape size={48} />
          <h3>Select a Climate Zone</h3>
          <p>Choose a wine region above to view phenology estimates</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="phenology-explorer">
        <div className="loading-state">
          <RefreshCw size={32} className="spinning" />
          <p>Loading phenology data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="phenology-explorer">
        <div className="error-state">
          <AlertCircle size={32} />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // No data
  if (!phenologyData || !phenologyData.varieties?.length) {
    return (
      <div className="phenology-explorer">
        <div className="no-data-message">
          <Leaf size={48} />
          <h3>No Phenology Data</h3>
          <p>Phenology estimates for {zone.name} are not yet available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="phenology-explorer">
      {/* Header */}
      <div className="phenology-header">
        <div className="header-title">
          <h3>{zone.name}</h3>
          <span className="vintage-label">
            {phenologyData.vintage_year - 1}/{String(phenologyData.vintage_year).slice(2)} Season
          </span>
        </div>
        <div className="header-meta">
          <span className="estimate-date">
            <Clock size={14} />
            Estimated {formatDate(phenologyData.estimate_date)}
          </span>
        </div>
      </div>

      {/* Variety Filter */}
      {varietiesList.length > 0 && (
        <div className="variety-filter">
          <span className="filter-label">Varieties:</span>
          <div className="variety-chips">
            {varietiesList.slice(0, 8).map(v => (
              <button
                key={v.variety_code}
                className={`variety-chip ${selectedVarieties.includes(v.variety_code) ? 'selected' : ''}`}
                onClick={() => toggleVarietySelection(v.variety_code)}
              >
                {v.variety_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Variety Cards */}
      <div className="variety-cards">
        {phenologyData.varieties.map(variety => {
          const stageInfo = getStageInfo(variety.current_stage);
          const isExpanded = expandedVariety === variety.variety_code;
          const progress = Number(variety.season_progress_pct) || 0;
          
          // Find key stages
          const flowering = variety.stages?.find(s => s.stage_name === 'Flowering');
          const veraison = variety.stages?.find(s => s.stage_name === 'Véraison');
          const harvest200 = variety.stages?.find(s => s.stage_name.includes('200g/L'));

          return (
            <div 
              key={variety.variety_code} 
              className={`variety-card ${isExpanded ? 'expanded' : ''}`}
            >
              {/* Card Header */}
              <div 
                className="variety-card-header"
                onClick={() => toggleVariety(variety.variety_code)}
              >
                <div className="variety-info">
                  <span className="variety-name">{variety.variety_name}</span>
                  <span className="variety-code">{variety.variety_code}</span>
                </div>

                <div className="variety-gdd">
                  <Sun size={16} />
                  <span>{formatGdd(variety.gdd_accumulated)}</span>
                </div>

                <div className="expand-icon">
                  {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="progress-bar-container">
                <div 
                  className="progress-bar"
                  style={{ 
                    width: `${Math.min(100, progress)}%`,
                    backgroundColor: getProgressColor(progress),
                  }}
                />
                <span className="progress-label">{progress.toFixed(0)}% to harvest</span>
              </div>

              {/* Key Dates Summary */}
              <div className="key-dates-summary">
                {flowering && (
                  <div className={`date-chip ${flowering.is_actual ? 'actual' : ''}`}>
                    <span className="date-label">Flowering</span>
                    <span className="date-value">
                      {flowering.is_actual ? '✓ ' : ''}{formatShortDate(flowering.predicted_date)}
                    </span>
                  </div>
                )}
                {harvest200 && (
                  <div className="date-chip harvest">
                    <span className="date-label">Harvest</span>
                    <span className="date-value">{formatShortDate(harvest200.predicted_date)}</span>
                    {harvest200.days_from_now && harvest200.days_from_now > 0 && (
                      <span className="days-away">{harvest200.days_from_now}d</span>
                    )}
                  </div>
                )}
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="variety-card-expanded">
                  {/* Stage Timeline */}
                  <div className="stage-timeline">
                    <h4>Phenology Timeline</h4>
                    <div className="timeline">
                      {variety.stages?.map((stage, idx) => {
                        const isPast = stage.is_actual || 
                          (stage.predicted_date && new Date(stage.predicted_date) < new Date());
                        const isCurrent = stage.stage_name.toLowerCase().includes(variety.current_stage);
                        
                        return (
                          <div 
                            key={idx}
                            className={`timeline-item ${isPast ? 'past' : ''} ${isCurrent ? 'current' : ''}`}
                          >
                            <div className="timeline-marker">
                              {isPast ? (
                                <CheckCircle2 size={18} className="marker-icon completed" />
                              ) : (
                                <Circle size={18} className="marker-icon pending" />
                              )}
                            </div>
                            <div className="timeline-content">
                              <div className="timeline-header">
                                <span className="stage-name">{stage.stage_name}</span>
                                {stage.gdd_threshold && (
                                  <span className="gdd-threshold">
                                    {formatGdd(stage.gdd_threshold)}
                                  </span>
                                )}
                              </div>
                              <div className="timeline-date">
                                {stage.predicted_date ? (
                                  <>
                                    <Calendar size={14} />
                                    <span>
                                      {formatDate(stage.predicted_date)}
                                      {stage.is_actual && <em> (actual)</em>}
                                    </span>
                                    {stage.days_from_now && stage.days_from_now > 0 && (
                                      <span className="days-from-now">
                                        ({stage.days_from_now} days away)
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="no-date">Date TBD</span>
                                )}
                              </div>
                              {stage.days_vs_baseline && (
                                <div className="baseline-diff">
                                  {stage.days_vs_baseline > 0 ? '+' : ''}
                                  {stage.days_vs_baseline} days vs baseline
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Harvest Windows */}
                  <div className="harvest-windows">
                    <h4>Harvest Windows by Sugar Level</h4>
                    <div className="harvest-grid">
                      {variety.stages
                        ?.filter(s => s.stage_name.includes('Harvest'))
                        .map((stage, idx) => {
                          const days = daysUntil(stage.predicted_date);
                          return (
                            <div key={idx} className="harvest-item">
                              <span className="harvest-label">
                                {stage.stage_name.replace('Harvest ', '')}
                              </span>
                              <span className="harvest-date">
                                {formatShortDate(stage.predicted_date)}
                              </span>
                              {days !== null && days > 0 && (
                                <span className="harvest-days">{days}d</span>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="phenology-legend">
        <span className="legend-item">
          <CheckCircle2 size={14} className="completed" /> Completed/Actual
        </span>
        <span className="legend-item">
          <Circle size={14} className="pending" /> Predicted
        </span>
        <span className="legend-item">
          <Sun size={14} /> GDD = Growing Degree Days
        </span>
      </div>
    </div>
  );
};

export default PhenologyExplorer;