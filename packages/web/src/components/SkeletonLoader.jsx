// src/components/SkeletonLoader.jsx
function SkeletonLoader({ type = 'card', count = 1 }) {
  const renderSkeleton = () => {
    switch (type) {
      case 'card':
        return (
          <div className="skeleton-card">
            <div className="skeleton-title"></div>
            <div className="skeleton-text"></div>
            <div className="skeleton-text"></div>
          </div>
        );
      case 'list':
        return (
          <div className="skeleton-list-item">
            <div className="skeleton-text"></div>
          </div>
        );
      default:
        return <div className="skeleton-box"></div>;
    }
  };

  return (
    <div className="skeleton-container">
      {Array(count).fill().map((_, index) => (
        <div key={index}>
          {renderSkeleton()}
        </div>
      ))}
    </div>
  );
}

export default SkeletonLoader;