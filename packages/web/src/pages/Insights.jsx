// src/pages/Insights.jsx - Updated with Interactive Insights
import { useEffect, useState } from 'react';
import MobileNavigation from '../components/MobileNavigation';
import { useAuth } from '@vineyard/shared';
import {companiesService} from '@vineyard/shared';
import ClimateContainer from '../components/climate/ClimateContainer';
import { Link } from 'react-router'
import { Grape, ChartArea, User, Sprout, Bug, Lightbulb, ShieldCheck, Users, LibraryBig, CloudSunRain, ChartSpline} from "lucide-react"


function Insights() {
  const {user } = useAuth();
  const [stats, setStats] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeInsight, setActiveInsight] = useState(null); // NEW STATE
 
  // Fetch company data and stats
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Get company data if not already in user object
        let companyData = user?.company;
        if (!companyData && user?.company_id) {
          const response = await companiesService.getCompanyById(user.company_id);
          companyData = response;
        } else if (!companyData) {
          try {
            const response = await companiesService.getCurrentCompany();
            companyData = response;
          } catch (err) {
            console.error('Error fetching company:', err);
          }
        }
        setCompany(companyData);
        
        // Get stats
        const statsData = await companiesService.getCurrentCompanyStats();
        setStats(statsData);
       
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchData();
    }
  }, [user]);
  
  // Handle insight card clicks
  const handleInsightClick = (insightType) => {
    // Toggle the insight - if same type clicked, close it
    setActiveInsight(activeInsight === insightType ? null : insightType);
  };

  // Render the active insight component
  const renderActiveInsight = () => {
    switch (activeInsight) {
      case 'climate':
        return (
          <div className="content-container">
            <div className="container-title">
              <span>Climate Analysis</span>
              
              <button 
                className="close-insight-btn"
                onClick={() => setActiveInsight(null)}
                aria-label="Close Climate Analysis"
              >
                ×
              </button>
            </div>
            <ClimateContainer />
          </div>
        );
      case 'phenology':
        return (
          <div className="content-container">
            <div className="container-title">
              <span>Phenology Analysis</span>
              <button 
                className="close-insight-btn"
                onClick={() => setActiveInsight(null)}
                aria-label="Close Phenology Analysis"
              >
                ×
              </button>
            </div>
            <div className="insight-placeholder">
              <p>Phenology analysis coming soon...</p>
              <p>This will show grape development stages, budbreak timing, flowering dates, and harvest predictions based on historical climate data.</p>
            </div>
          </div>
        );
      case 'climateprojection':
        return (
          <div className="content-container">
            <div className="container-title">
              <span>Climate Projections</span>
              <button 
                className="close-insight-btn"
                onClick={() => setActiveInsight(null)}
                aria-label="Close Climate Analysis"
              >
                ×
              </button>
            </div>
            <div className="insight-placeholder">
              <p>Climate Projections coming soon...</p>
              <p>This will show various climate change model projections based on historical climate data.</p>
            </div>
          </div>
        );
      case 'currentseason':
        return (
          <div className="content-container">
            <div className="container-title">
              <span>Current Season Climate</span>
              <button 
                className="close-insight-btn"
                onClick={() => setActiveInsight(null)}
                aria-label="Close Climate Analysis"
              >
                ×
              </button>
            </div>
            <div className="insight-placeholder">
              <p>Current Season Climate Analysis coming soon...</p>
              <p>This will show various climate data insights based on modelled and Harvest API data.</p>
            </div>
          </div>
        );
      case 'disease':
        return (
          <div className="content-container">
            <div className="container-title">
              <span>Disease Risk Analysis</span>
              <button 
                className="close-insight-btn"
                onClick={() => setActiveInsight(null)}
                aria-label="Close Disease Analysis"
              >
                ×
              </button>
            </div>
            <div className="insight-placeholder">
              <p>Disease risk analysis coming soon...</p>
              <p>This will show powdery mildew, downy mildew, and botrytis risk based on weather conditions and historical patterns.</p>
            </div>
          </div>
        );
      case 'biosecurity':
        return (
          <div className="content-container">
            <div className="container-title">
              <span>Biosecurity Monitoring</span>
              <button 
                className="close-insight-btn"
                onClick={() => setActiveInsight(null)}
                aria-label="Close Biosecurity Analysis"
              >
                ×
              </button>
            </div>
            <div className="insight-placeholder">
              <p>Biosecurity monitoring coming soon...</p>
              <p>This will show pest pressure monitoring, beneficial insect tracking, and integrated pest management recommendations.</p>
            </div>
          </div>
        );
        case 'blockchain':
        return (
          <div className="content-container">
            <div className="container-title">
              <span>BlockChain</span>
              <button 
                className="close-insight-btn"
                onClick={() => setActiveInsight(null)}
                aria-label="Close Biosecurity Analysis"
              >
                ×
              </button>
            </div>
            <div className="insight-placeholder">
              <p>BlockChain coming soon...</p>
              <p>This will show the audit trail for your Vineyard Blocks.</p>
            </div>
          </div>
        );
        case 'industry':
        return (
          <div className="content-container">
            <div className="container-title">
              <span>Industry Insights</span>
              <button 
                className="close-insight-btn"
                onClick={() => setActiveInsight(null)}
                aria-label="Close Biosecurity Analysis"
              >
                ×
              </button>
            </div>
            <div className="insight-placeholder">
              <p>Industry Insights coming soon...</p>
              <p>This will show current industry insights that may be relevant to you.</p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };
  useEffect(() => {
    document.body.classList.add("primary-bg");
    
    return () => {
      document.body.classList.remove("primary-bg");
    };
  }, []);
  
  return (
    <div className="home-page">

      <div className="home-content">

        {/* Updated Insights Section with Click Handlers */}
        <div className="stats-container">
          <div className="container-title">
            <span>{company?.name || 'Your Company'} - Insights</span>
          </div>
          <div className="stats-grid">
            <button 
              className={`stat-card insight-card ${activeInsight === 'climate' ? 'active' : ''}`}
              onClick={() => handleInsightClick('climate')}
            >
              <div className="icon-wrapper"><ChartArea /></div>
              <div className="actions-title">Climate History</div>
            </button>
            <button 
              className={`stat-card insight-card ${activeInsight === 'climateprojection' ? 'active' : ''}`}
              onClick={() => handleInsightClick('climateprojection')}
            >
              <div className="icon-wrapper"><ChartSpline /></div>
              <div className="actions-title">Climate Projections</div>
            </button>
            <button 
              className={`stat-card insight-card ${activeInsight === 'currentseason' ? 'active' : ''}`}
              onClick={() => handleInsightClick('currentseason')}
            >
              <div className="icon-wrapper"><CloudSunRain /></div>
              <div className="actions-title">Current Season</div>
            </button>
            <button 
              className={`stat-card insight-card ${activeInsight === 'phenology' ? 'active' : ''}`}
              onClick={() => handleInsightClick('phenology')}
            >
              <div className="icon-wrapper"><Grape /></div>
              <div className="actions-title">Phenology</div>
            </button>

          </div>
        </div>
        <div className="stats-container">
          <div className="stats-grid">

            <button 
              className={`stat-card insight-card ${activeInsight === 'disease' ? 'active' : ''}`}
              onClick={() => handleInsightClick('disease')}
            >
              <div className="icon-wrapper"><ShieldCheck /></div>
              <div className="actions-title">Disease</div>
            </button>
            <button 
              className={`stat-card insight-card ${activeInsight === 'biosecurity' ? 'active' : ''}`}
              onClick={() => handleInsightClick('biosecurity')}
            >
              <div className="icon-wrapper"><Bug /></div>
              <div className="actions-title">Biosecurity</div>
            </button>
            <button 
              className={`stat-card insight-card ${activeInsight === 'blockchain' ? 'active' : ''}`}
              onClick={() => handleInsightClick('blockchain')}
            >
              <div className="icon-wrapper"><ShieldCheck /></div>
              <div className="actions-title">BlockChain</div>
            </button>
            <button 
              className={`stat-card insight-card ${activeInsight === 'industry' ? 'active' : ''}`}
              onClick={() => handleInsightClick('industry')}
            >
              <div className="icon-wrapper"><Bug /></div>
              <div className="actions-title">Latest Industry Insight</div>
            </button>
          </div>
        </div>

        {/* Dynamic Insight Component */}
        {renderActiveInsight()}

      </div>
      <MobileNavigation />
    </div>
  );
}

export default Insights;