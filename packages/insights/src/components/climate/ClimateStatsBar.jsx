// src/components/climate/ClimateStatsBar.jsx
import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const ClimateStatsBar = ({ summaries, comparisonMode }) => {
  if (!summaries || Object.keys(summaries).length === 0) {
    return null;
  }

  const getTrendIcon = (current, previous) => {
    if (!current || !previous || current === previous) {
      return <Minus size={16} className="trend-icon neutral" />;
    }
    return current > previous ? 
      <TrendingUp size={16} className="trend-icon positive" /> :
      <TrendingDown size={16} className="trend-icon negative" />;
  };

  const getTrendColor = (current, previous, isHigherBetter = true) => {
    if (!current || !previous || current === previous) return 'neutral';
    
    const isHigher = current > previous;
    if (isHigherBetter) {
      return isHigher ? 'positive' : 'negative';
    } else {
      return isHigher ? 'negative' : 'positive';
    }
  };

  const formatValue = (value, type) => {
    if (value === null || value === undefined) return 'N/A';
    
    switch (type) {
      case 'gdd':
        return `${Math.round(value)} °C·days`;
      case 'huglin':
        return Math.round(value).toLocaleString();
      case 'rainfall':
        return `${Math.round(value)} mm`;
      case 'temperature':
        return `${value.toFixed(1)}°C`;
      case 'days':
        return `${Math.round(value)} days`;
      default:
        return Math.round(value);
    }
  };

  const calculateDifference = (current, previous, type) => {
    if (!current || !previous) return null;
    
    const diff = current - previous;
    const sign = diff >= 0 ? '+' : '';
    
    switch (type) {
      case 'gdd':
        return `${sign}${Math.round(diff)} °C·days`;
      case 'huglin':
        return `${sign}${Math.round(diff)}`;
      case 'rainfall':
        return `${sign}${Math.round(diff)} mm`;
      case 'temperature':
        return `${sign}${diff.toFixed(1)}°C`;
      case 'days':
        return `${sign}${Math.round(diff)} days`;
      default:
        return `${sign}${Math.round(diff)}`;
    }
  };

  const StatCard = ({ title, value, type, comparison, isHigherBetter = true }) => (
    <div className="stat-card">
      <div className="stat-title">{title}</div>
      <div className="stat-value">{formatValue(value, type)}</div>
      {comparison && (
        <div className={`stat-comparison ${getTrendColor(value, comparison, isHigherBetter)}`}>
          {getTrendIcon(value, comparison)}
          <span>{calculateDifference(value, comparison, type)}</span>
        </div>
      )}
    </div>
  );

  if (comparisonMode === 'single') {
    // Single season display
    const seasonKey = Object.keys(summaries)[0];
    const summary = summaries[seasonKey];
    
    return (
      <div className="climate-stats-bar">
        <div className="stats-header">
          <h3>Season Summary: {summary.season}</h3>
        </div>
        <div className="stats-grid single">
          <StatCard
            title="Total GDD"
            value={summary.total_gdd}
            type="gdd"
          />
          <StatCard
            title="Huglin Index"
            value={summary.huglin_index}
            type="huglin"
          />
          <StatCard
            title="Total Rainfall"
            value={summary.total_rainfall}
            type="rainfall"
          />
          <StatCard
            title="Avg Temperature"
            value={summary.average_temperature}
            type="temperature"
          />
          <StatCard
            title="Frost Days"
            value={summary.frost_days}
            type="days"
            isHigherBetter={false}
          />
          <StatCard
            title="Hot Days (>30°C)"
            value={summary.hot_days}
            type="days"
          />
        </div>
      </div>
    );
  }

  // Comparison mode display
  const summaryKeys = Object.keys(summaries).filter(key => key !== 'LTA');
  const ltaSummary = summaries['LTA'];
  
  if (comparisonMode === 'season-comparison' && summaryKeys.length === 2) {
    // Season vs Season comparison
    const [season1Key, season2Key] = summaryKeys;
    const season1 = summaries[season1Key];
    const season2 = summaries[season2Key];
    
    return (
      <div className="climate-stats-bar">
        <div className="stats-header">
          <h3>Season Comparison: {season1.season} vs {season2.season}</h3>
        </div>
        <div className="comparison-stats">
          <div className="season-column">
            <h4>{season1.season}</h4>
            <div className="stats-grid">
              <StatCard title="GDD" value={season1.total_gdd} type="gdd" />
              <StatCard title="Huglin" value={season1.huglin_index} type="huglin" />
              <StatCard title="Rainfall" value={season1.total_rainfall} type="rainfall" />
              <StatCard title="Avg Temp" value={season1.average_temperature} type="temperature" />
            </div>
          </div>
          
          <div className="season-column">
            <h4>{season2.season}</h4>
            <div className="stats-grid">
              <StatCard 
                title="GDD" 
                value={season2.total_gdd} 
                type="gdd"
                comparison={season1.total_gdd}
              />
              <StatCard 
                title="Huglin" 
                value={season2.huglin_index} 
                type="huglin"
                comparison={season1.huglin_index}
              />
              <StatCard 
                title="Rainfall" 
                value={season2.total_rainfall} 
                type="rainfall"
                comparison={season1.total_rainfall}
              />
              <StatCard 
                title="Avg Temp" 
                value={season2.average_temperature} 
                type="temperature"
                comparison={season1.average_temperature}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (comparisonMode === 'lta-comparison' && summaryKeys.length === 1 && ltaSummary) {
    // Season vs LTA comparison
    const seasonKey = summaryKeys[0];
    const seasonSummary = summaries[seasonKey];
    
    return (
      <div className="climate-stats-bar">
        <div className="stats-header">
          <h3>Comparison: {seasonSummary.season} vs Long-term Average (1986-2005)</h3>
        </div>
        <div className="comparison-stats">
          <div className="season-column">
            <h4>{seasonSummary.season}</h4>
            <div className="stats-grid">
              <StatCard 
                title="GDD" 
                value={seasonSummary.total_gdd} 
                type="gdd"
                comparison={ltaSummary.total_gdd}
              />
              <StatCard 
                title="Huglin" 
                value={seasonSummary.huglin_index} 
                type="huglin"
                comparison={ltaSummary.huglin_index}
              />
              <StatCard 
                title="Rainfall" 
                value={seasonSummary.total_rainfall} 
                type="rainfall"
                comparison={ltaSummary.total_rainfall}
              />
              <StatCard 
                title="Avg Temp" 
                value={seasonSummary.average_temperature} 
                type="temperature"
                comparison={ltaSummary.average_temperature}
              />
            </div>
          </div>
          
          <div className="season-column lta">
            <h4>LTA (1986-2005)</h4>
            <div className="stats-grid">
              <StatCard title="GDD" value={ltaSummary.total_gdd} type="gdd" />
              <StatCard title="Huglin" value={ltaSummary.huglin_index} type="huglin" />
              <StatCard title="Rainfall" value={ltaSummary.total_rainfall} type="rainfall" />
              <StatCard title="Avg Temp" value={ltaSummary.average_temperature} type="temperature" />
            </div>
            <div className="lta-note">
              <small>Based on {ltaSummary.seasons_included} seasons (1986-2005)</small>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default ClimateStatsBar;