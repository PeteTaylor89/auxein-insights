// src/components/climate/ClimateContainer.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '@vineyard/shared';
import {blocksService, climateService} from '@vineyard/shared';

import ClimateControls from './ClimateControls';
import ClimateChart from './ClimateChart';
import ClimateStatsBar from './ClimateStatsBar';
import './Climate.css';

const ClimateContainer = () => {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState([]);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [comparisonData, setComparisonData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Control states
  const [selectedSeasons, setSelectedSeasons] = useState([]);
  const [includeLTA, setIncludeLTA] = useState(false);
  const [chartType, setChartType] = useState('gdd');
  const [comparisonMode, setComparisonMode] = useState('single'); // single, season-comparison, lta-comparison

  // Load user's blocks on mount
  useEffect(() => {
    const loadBlocks = async () => {
      try {
        const response = await blocksService.getCompanyBlocks();
        setBlocks(response.blocks || []);
        
        // Auto-select first block if available
        if (response.blocks && response.blocks.length > 0) {
          setSelectedBlock(response.blocks[0].id);
        }
      } catch (error) {
        console.error('Error loading blocks:', error);
        setError('Failed to load vineyard blocks');
      }
    };

    if (user?.company_id) {
      loadBlocks();
    }
  }, [user]);

  // Load available seasons when block changes
  useEffect(() => {
    const loadSeasons = async () => {
      if (!selectedBlock) {
        setAvailableSeasons([]);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        const seasons = await climateService.getAvailableSeasons(selectedBlock);
        
        // Ensure seasons is an array
        const seasonsArray = Array.isArray(seasons) ? seasons : [];
        setAvailableSeasons(seasonsArray);
        
        // Auto-select most recent season if available
        if (seasonsArray.length > 0) {
          try {
            const recentSeason = await climateService.getMostRecentSeason(selectedBlock);
            if (recentSeason && seasonsArray.includes(recentSeason)) {
              setSelectedSeasons([recentSeason]);
            } else {
              // Fallback to first available season
              setSelectedSeasons([seasonsArray[0]]);
            }
          } catch (recentSeasonError) {
            console.warn('Could not get recent season, using first available:', recentSeasonError);
            setSelectedSeasons([seasonsArray[0]]);
          }
        } else {
          setSelectedSeasons([]);
          setError('No climate data available for this block');
        }
      } catch (error) {
        console.error('Error loading seasons:', error);
        setError('Failed to load season data');
        setAvailableSeasons([]);
        setSelectedSeasons([]);
      } finally {
        setLoading(false);
      }
    };

    loadSeasons();
  }, [selectedBlock]);

  // Load comparison data when selections change
  useEffect(() => {
    const loadComparisonData = async () => {
      if (!selectedBlock || selectedSeasons.length === 0) return;

      try {
        setLoading(true);
        setError(null);

        if (comparisonMode === 'single') {
          // Single season data
          const summary = await climateService.getSeasonSummary(selectedBlock, selectedSeasons[0]);
          setComparisonData({
            summaries: { [selectedSeasons[0]]: summary },
            chart_data: await getChartDataForSeason(selectedBlock, selectedSeasons[0], chartType)
          });
        } else {
          // Comparison data
          const useIncludeLTA = comparisonMode === 'lta-comparison';
          const comparison = await climateService.getSeasonComparison(
            selectedBlock,
            selectedSeasons,
            useIncludeLTA,
            chartType
          );
          setComparisonData(comparison);
        }
      } catch (error) {
        console.error('Error loading comparison data:', error);
        setError('Failed to load climate data');
      } finally {
        setLoading(false);
      }
    };

    loadComparisonData();
  }, [selectedBlock, selectedSeasons, chartType, comparisonMode]);

  const getChartDataForSeason = async (blockId, season, type) => {
    // For single season, we need to build chart data manually
    // This is a simplified version - you may want to add a dedicated endpoint
    const summary = await climateService.getSeasonSummary(blockId, season);
    
    const chartData = {
      labels: ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr"],
      datasets: [{
        label: season,
        data: summary.monthly_breakdown ? 
          summary.monthly_breakdown.map(m => {
            switch(type) {
              case 'gdd': return m.gdd || 0;
              case 'rainfall': return m.rainfall || 0;
              case 'temperature': return m.avg_temperature || 0;
              default: return 0;
            }
          }) : new Array(7).fill(0),
        borderColor: "#3B82F6",
        backgroundColor: "#3B82F620",
        fill: type === 'gdd'
      }]
    };
    
    return chartData;
  };

  const handleBlockChange = (blockId) => {
    setSelectedBlock(blockId);
    setSelectedSeasons([]);
    setComparisonData(null);
  };

  const handleSeasonChange = (seasons) => {
    setSelectedSeasons(seasons);
  };

  const handleComparisonModeChange = (mode) => {
    setComparisonMode(mode);
    
    // Reset seasons based on mode
    if (mode === 'single' && selectedSeasons.length > 1) {
      setSelectedSeasons([selectedSeasons[0]]);
    } else if (mode === 'lta-comparison' && selectedSeasons.length === 0 && availableSeasons.length > 0) {
      setSelectedSeasons([availableSeasons[0]]);
    }
  };

  const handleChartTypeChange = (type) => {
    setChartType(type);
  };

  if (!user?.company_id) {
    return (
      <div className="climate-container">
        <div className="climate-error">
          <p>No company association found. Please contact your administrator.</p>
        </div>
      </div>
    );
  }

  if (blocks.length === 0 && !loading) {
    return (
      <div className="climate-container">
        <div className="climate-error">
          <p>No vineyard blocks found for your company.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="climate-container">
      <ClimateControls
        blocks={blocks}
        selectedBlock={selectedBlock}
        onBlockChange={handleBlockChange}
        availableSeasons={availableSeasons}
        selectedSeasons={selectedSeasons}
        onSeasonChange={handleSeasonChange}
        comparisonMode={comparisonMode}
        onComparisonModeChange={handleComparisonModeChange}
        chartType={chartType}
        onChartTypeChange={handleChartTypeChange}
        loading={loading}
      />
      
      {error && (
        <div className="climate-error">
          <p>{error}</p>
        </div>
      )}
      
      {comparisonData && !loading && (
        <>
          <ClimateChart
            data={comparisonData.chart_data}
            chartType={chartType}
            comparisonMode={comparisonMode}
            loading={loading}
          />
          
          <ClimateStatsBar
            summaries={comparisonData.summaries}
            comparisonMode={comparisonMode}
          />
        </>
      )}
      
      {loading && (
        <div className="climate-loading">
          <p>Loading climate data...</p>
        </div>
      )}
    </div>
  );
};

export default ClimateContainer;