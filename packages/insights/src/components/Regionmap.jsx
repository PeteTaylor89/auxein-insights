// components/RegionMap.jsx - Interactive map placeholder for wine regions
import { MapPin } from 'lucide-react';

function RegionMap({ regions }) {
  return (
    <div style={{
      width: '100%',
      minHeight: '500px',
      background: 'linear-gradient(135deg, #f0f4f8 0%, #e8eef3 100%)',
      borderRadius: '12px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px',
      textAlign: 'center'
    }}>
      <MapPin size={64} style={{ color: '#5B6830', marginBottom: '20px' }} />
      <h3 style={{ 
        fontSize: '18pt', 
        fontWeight: '600', 
        color: '#2F2F2F', 
        marginBottom: '12px' 
      }}>
        Interactive Map Coming Soon
      </h3>
      <p style={{ 
        fontSize: '13pt', 
        color: '#505050',
        maxWidth: '600px',
        lineHeight: '1.6'
      }}>
        This will display an interactive MapBox map showing all New Zealand wine regions 
        with climate data overlays. You can integrate your existing MapBox implementation 
        from the Auxein Insights web app here.
      </p>
      
      {/* Placeholder region markers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '16px',
        marginTop: '32px',
        width: '100%',
        maxWidth: '800px'
      }}>
        {regions.map(region => (
          <div key={region.id} style={{
            padding: '12px',
            background: 'white',
            borderRadius: '8px',
            border: '1px solid #e0e0e0',
            fontSize: '12pt',
            fontWeight: '500',
            color: '#2F2F2F'
          }}>
            <MapPin size={16} style={{ 
              display: 'inline-block', 
              verticalAlign: 'middle', 
              marginRight: '8px',
              color: '#5B6830'
            }} />
            {region.name}
          </div>
        ))}
      </div>
    </div>
  );
}

export default RegionMap;