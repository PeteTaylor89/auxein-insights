// pages/WidgetEmbed.jsx — Standalone embeddable seasonal stats card
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Thermometer, Droplets, Snowflake, Sun } from 'lucide-react';
import Logo from '../assets/App_Logo_September 20251.jpg';
import useDocumentMeta from '../hooks/useDocumentMeta';
import './WidgetEmbed.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const VAR_META = {
  gdd10: { label: 'GDD (base 10)', unit: '°C·d', icon: <Thermometer size={12} /> },
  gdd0: { label: 'GDD (base 0)', unit: '°C·d', icon: <Thermometer size={12} /> },
  avg_temp: { label: 'Avg Temp', unit: '°C', icon: <Thermometer size={12} /> },
  avg_diurnal: { label: 'Diurnal Range', unit: '°C', icon: <Sun size={12} /> },
  total_rainfall: { label: 'Rainfall', unit: 'mm', icon: <Droplets size={12} /> },
  avg_min_temp: { label: 'Avg Min', unit: '°C', icon: <Snowflake size={12} /> },
  avg_max_temp: { label: 'Avg Max', unit: '°C', icon: <Sun size={12} /> },
  frost_days: { label: 'Frost Days', unit: '', icon: <Snowflake size={12} /> },
  hot_days: { label: 'Hot Days', unit: '', icon: <Sun size={12} /> },
};

function WidgetEmbed() {
  const [searchParams] = useSearchParams();
  const zone = searchParams.get('zone');
  const variety = searchParams.get('variety');
  const harvest = searchParams.get('harvest');
  const varsParam = searchParams.get('vars');

  const displayVars = varsParam ? varsParam.split(',').filter(v => VAR_META[v]) : Object.keys(VAR_META);

  useDocumentMeta({
    title: variety ? `${variety} Seasonal Stats — ${zone || 'NZ Wine'}` : 'Seasonal Stats Widget',
    description: 'Seasonal climate statistics for New Zealand wine regions — GDD, rainfall, frost days, and more.',
    path: '/widget/seasonal',
  });

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!zone || !harvest) {
      setError('Missing zone or harvest date');
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/public/seasonal-stats/calculate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            zone_slug: zone,
            variety: variety || null,
            harvest_date: harvest,
            selected_variables: displayVars,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Error');
        }

        setData(await res.json());
      } catch (err) {
        setError(err.message || 'Could not load data');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [zone, variety, harvest]);

  const formatVal = (key, val) => {
    if (val === null || val === undefined) return 'N/A';
    const meta = VAR_META[key];
    if (key === 'gdd10' || key === 'gdd0') return `${Math.round(val)}`;
    if (key === 'frost_days' || key === 'hot_days') return `${val}`;
    return `${val}${meta?.unit ? meta.unit : ''}`;
  };

  if (loading) return <div className="widget-embed"><div className="widget-embed-loading">Loading...</div></div>;
  if (error || !data) return <div className="widget-embed"><div className="widget-embed-error">{error || 'No data'}</div></div>;

  return (
    <div className="widget-embed">
      <div className="embed-header">
        <h4>{data.zone_name}</h4>
        <span className="embed-vintage">{data.vintage_year}</span>
      </div>
      {variety && <div className="embed-variety">{variety}</div>}
      <div className="embed-period">{data.season_start} — {data.harvest_date}</div>

      <div className="embed-stats">
        {displayVars.map(key => {
          const meta = VAR_META[key];
          if (!meta) return null;
          return (
            <div key={key} className="embed-stat-row">
              {meta.icon}
              <span className="embed-stat-label">{meta.label}</span>
              <span className="embed-stat-value">{formatVal(key, data.metrics[key])}</span>
            </div>
          );
        })}
      </div>

      <div className="embed-powered">
        <img src={Logo} alt="Auxein" className="embed-powered-logo" />
        <span>Powered by <a href="https://insights.auxein.co.nz" target="_blank" rel="noopener noreferrer">Auxein Insights</a></span>
      </div>
    </div>
  );
}

export default WidgetEmbed;
