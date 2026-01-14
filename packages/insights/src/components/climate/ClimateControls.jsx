// src/components/climate/ClimateControls.jsx
import React from 'react';
import { Download } from 'lucide-react';

const ClimateControls = ({
  blocks = [],
  selectedBlock,
  onBlockChange,
  availableSeasons = [], // Default to empty array
  selectedSeasons = [],  // Default to empty array
  onSeasonChange,
  comparisonMode,
  onComparisonModeChange,
  chartType,
  onChartTypeChange,
  loading
}) => {

  const handleSeasonSelectionChange = (season, isChecked) => {
    if (comparisonMode === 'single') {
      onSeasonChange([season]);
    } else {
      // For comparison modes, allow up to 2 seasons
      if (isChecked) {
        if (selectedSeasons.length < 2) {
          onSeasonChange([...selectedSeasons, season]);
        }
      } else {
        onSeasonChange(selectedSeasons.filter(s => s !== season));
      }
    }
  };

  const exportChart = async () => {
    const canvas = document.querySelector('.climate-chart canvas');
    if (canvas) {
      const link = document.createElement('a');
      link.download = `climate-chart-${chartType}-${selectedBlock}-${Date.now()}.png`;
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  // Ensure availableSeasons is an array before using .map
  const seasonsToShow = Array.isArray(availableSeasons) ? availableSeasons : [];

  return (
    <div className="climate-controls">
      {/* Block Selection */}
      <div className="control-group">
        <label htmlFor="block-select">Vineyard Block:</label>
        <select
          id="block-select"
          value={selectedBlock || ''}
          onChange={(e) => onBlockChange(parseInt(e.target.value))}
          disabled={loading}
          className="climate-select"
        >
          <option value="">Select a block</option>
          {blocks.map((block) => (
            <option key={block.id} value={block.id}>
              {block.block_name || `Block ${block.id}`} 
              {block.variety && ` (${block.variety})`}
            </option>
          ))}
        </select>
      </div>

      {/* Comparison Mode Selection */}
      <div className="control-group">
        <label>Analysis Mode:</label>
        <div className="mode-selector">
          <button
            className={`mode-btn ${comparisonMode === 'single' ? 'active' : ''}`}
            onClick={() => onComparisonModeChange('single')}
            disabled={loading}
          >
            Single Season
          </button>
          <button
            className={`mode-btn ${comparisonMode === 'season-comparison' ? 'active' : ''}`}
            onClick={() => onComparisonModeChange('season-comparison')}
            disabled={loading}
          >
            Season vs Season
          </button>
          <button
            className={`mode-btn ${comparisonMode === 'lta-comparison' ? 'active' : ''}`}
            onClick={() => onComparisonModeChange('lta-comparison')}
            disabled={loading}
          >
            Season vs LTA
          </button>
        </div>
      </div>

      {/* Season Selection */}
      <div className="control-group">
        <label>
          {comparisonMode === 'single' ? 'Season:' : 
           comparisonMode === 'season-comparison' ? 'Seasons (max 2):' :
           'Season to compare:'}
        </label>
        
        {/* Show loading state or no data message */}
        {loading && (
          <div className="season-loading">Loading seasons...</div>
        )}
        
        {!loading && seasonsToShow.length === 0 && (
          <div className="no-seasons">No climate data available for this block</div>
        )}
        
        {!loading && seasonsToShow.length > 0 && (
          <div className="season-selector">
            {comparisonMode === 'single' ? (
              <select
                value={selectedSeasons[0] || ''}
                onChange={(e) => onSeasonChange([e.target.value])}
                disabled={loading}
                className="climate-select"
              >
                <option value="">Select season</option>
                {seasonsToShow.map((season) => (
                  <option key={season} value={season}>
                    {season}
                  </option>
                ))}
              </select>
            ) : (
              <div className="season-checkboxes">
                {seasonsToShow.slice(0, 40).map((season) => (
                  <label key={season} className="season-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedSeasons.includes(season)}
                      onChange={(e) => handleSeasonSelectionChange(season, e.target.checked)}
                      disabled={loading || (!selectedSeasons.includes(season) && selectedSeasons.length >= 2)}
                    />
                    <span>{season}</span>
                  </label>
                ))}
                {seasonsToShow.length > 40 && (
                  <span className="more-seasons">
                    +{seasonsToShow.length - 40} more seasons available
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chart Type Selection */}
      <div className="control-group">
        <label>Chart Type:</label>
        <div className="chart-type-selector">
          <button
            className={`chart-type-btn ${chartType === 'gdd' ? 'active' : ''}`}
            onClick={() => onChartTypeChange('gdd')}
            disabled={loading}
          >
            Growing Degree Days
          </button>
          <button
            className={`chart-type-btn ${chartType === 'huglin' ? 'active' : ''}`}
            onClick={() => onChartTypeChange('huglin')}
            disabled={loading}
          >
            Huglin Index
          </button>
          <button
            className={`chart-type-btn ${chartType === 'temperature' ? 'active' : ''}`}
            onClick={() => onChartTypeChange('temperature')}
            disabled={loading}
          >
            Temperature
          </button>
          <button
            className={`chart-type-btn ${chartType === 'rainfall' ? 'active' : ''}`}
            onClick={() => onChartTypeChange('rainfall')}
            disabled={loading}
          >
            Rainfall
          </button>
        </div>
      </div>

      {/* Export Button */}
      <div className="control-group export-group">
        <button
          className="export-btn"
          onClick={exportChart}
          disabled={loading}
        >
          <Download size={16} />
          Export Chart
        </button>
      </div>
    </div>
  );
};

export default ClimateControls;

