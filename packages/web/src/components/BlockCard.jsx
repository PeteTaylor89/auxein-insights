// src/components/BlockCard.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';

function BlockCard({ block }) {
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const [showActions, setShowActions] = useState(false);
  
  const handleTouchStart = (e) => {
    setTouchStart(e.touches[0].clientX);
  };
  
  const handleTouchMove = (e) => {
    setTouchEnd(e.touches[0].clientX);
  };
  
  const handleTouchEnd = () => {
    if (touchStart - touchEnd > 100) {
      // Swipe left to show actions
      setShowActions(true);
    } else if (touchEnd - touchStart > 100) {
      // Swipe right to hide actions
      setShowActions(false);
    }
  };
  
  return (
    <div 
      className={`block-card ${showActions ? 'show-actions' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="block-content">
        <h3>{block.name}</h3>
        <div className="block-details">
          <p>Area: {block.area} hectares</p>
          <p>Variety: {block.variety}</p>
        </div>
        <Link to={`/blocks/${block.id}`} className="view-button">
          View Details
        </Link>
      </div>
      <div className="block-actions">
        <button className="action-button edit">Edit</button>
        <button className="action-button delete">Delete</button>
      </div>
    </div>
  );
}

export default BlockCard;