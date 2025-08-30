// src/components/IconButton.jsx
function IconButton({ icon, onClick, label, className = '' }) {
    return (
      <button 
        className={`icon-button ${className}`} 
        onClick={onClick}
        aria-label={label}
      >
        {icon}
      </button>
    );
  }
  
  export default IconButton;