// src/components/widgets/ObservationsWidget.jsx
import { Link } from 'react-router-dom';

function ObservationsWidget() {
  // Dummy data
  const observations = [
    { 
      id: 1, 
      type: 'disease', 
      description: 'Signs of powdery mildew on Block B vines', 
      date: '2025-05-15' 
    }
  ];
  
  return (
    <div className="widget observations-widget">
      <div className="widget-header">
        <h3>Latest Observations</h3>
        <Link to="/observations" className="widget-action">View All</Link>
      </div>
      
      <div className="observations-list">
        {observations.map(obs => (
          <div key={obs.id} className={`observation-item type-${obs.type}`}>
            <div className="observation-icon">📝</div>
            <div className="observation-content">
              <div className="observation-description">{obs.description}</div>
              <div className="observation-date">{obs.date}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ObservationsWidget;