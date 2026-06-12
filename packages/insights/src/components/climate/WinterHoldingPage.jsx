// packages/insights/src/components/climate/WinterHoldingPage.jsx
/**
 * Off-season holding page for in-season climate explorers (Phenology,
 * Disease Pressure). Shown 1 May – 31 August, when the growing season is
 * dormant and these estimates are not meaningful.
 */

import React from 'react';
import { Snowflake, CalendarClock, History, CloudSunRain } from 'lucide-react';
import { reopenDateLabel, daysUntilSeasonStart } from '../../utils/season';
import './WinterHoldingPage.css';

const WinterHoldingPage = ({ feature = 'This view', onViewChange }) => {
  const reopens = reopenDateLabel();
  const days = daysUntilSeasonStart();

  return (
    <div className="winter-holding-page">
      <div className="winter-holding-icon">
        <Snowflake size={48} />
      </div>
      <h3>{feature} is paused for winter</h3>
      <p>
        Growing-season estimates run 1 September – 30 April. The vines are
        dormant, so {feature.toLowerCase()} data resumes next season.
      </p>

      <div className="winter-reopen">
        <CalendarClock size={16} />
        <span>
          Reopens {reopens}
          {days > 0 && <em> ({days} days away)</em>}
        </span>
      </div>

      {onViewChange && (
        <div className="winter-alt-actions">
          <button type="button" onClick={() => onViewChange('seasons')}>
            <History size={16} />
            Explore Climate History
          </button>
          <button type="button" onClick={() => onViewChange('currentseason')}>
            <CloudSunRain size={16} />
            Winter weather
          </button>
        </div>
      )}
    </div>
  );
};

export default WinterHoldingPage;
