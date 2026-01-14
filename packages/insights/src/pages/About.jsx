// pages/About.jsx - About Auxein and the platform
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

function About() {
  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <Link 
        to="/" 
        style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '0.5rem',
          color: 'var(--primary)',
          textDecoration: 'none',
          marginBottom: '1.5rem'
        }}
      >
        <ArrowLeft size={20} />
        Back to regions
      </Link>

      <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>
        About Auxein Regional Intelligence
      </h1>

      <div style={{ lineHeight: '1.8', color: 'var(--text-secondary)' }}>
        <p style={{ marginBottom: '1rem' }}>
          Auxein Regional Intelligence provides climate insights for New Zealand's wine regions, 
          helping viticulturists and wine industry professionals make informed decisions based 
          on comprehensive climate data and analysis.
        </p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>
          About Auxein
        </h2>
        
        <p style={{ marginBottom: '1rem' }}>
          Auxein Limited is a New Zealand climate technology company focused on the wine industry, 
          providing climate risk assessment, vineyard management tools, and educational resources 
          for sustainable viticulture.
        </p>

        <div style={{ 
          marginTop: '2rem', 
          padding: '1.5rem',
          backgroundColor: 'var(--surface)',
          borderRadius: '8px',
          border: '1px solid var(--border)'
        }}>
          <h3 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
            Want more detailed insights?
          </h3>
          <p style={{ marginBottom: '1rem' }}>
            Explore our premium platform for vineyard-specific climate analysis, 
            risk management tools, and comprehensive vineyard management features.
          </p>
          <a 
            href="https://auxein.co.nz" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              backgroundColor: 'var(--primary)',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '4px',
              fontWeight: '500'
            }}
          >
            Learn More
          </a>
        </div>
      </div>
    </div>
  );
}

export default About;
