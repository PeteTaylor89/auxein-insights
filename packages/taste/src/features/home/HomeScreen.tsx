import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { repo } from '@/db';
import type { Note, Wine } from '@/db';
import { noteWineLabel } from '../wines/wineLabel';

// Home = the launcher. Big action tiles to start tasting, plus a recent feed.
export function HomeScreen() {
  const navigate = useNavigate();
  const [recent, setRecent] = useState<{ note: Note; wine?: Wine }[]>([]);

  useEffect(() => {
    void (async () => {
      const notes = await repo.notes.list();
      notes.sort((a, b) => (b.tasted_at ?? b.created_at).localeCompare(a.tasted_at ?? a.created_at));
      const top = notes.slice(0, 5);
      const wines = Object.fromEntries((await repo.wines.list()).map((w) => [w.id, w]));
      setRecent(top.map((note) => ({ note, wine: wines[note.wine_id] })));
    })();
  }, []);

  const fmt = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString() : '');

  return (
    <section className="screen">
      <div className="home-tiles">
        <button className="home-tile home-tile--primary" onClick={() => navigate('/capture', { state: { mode: 'quick' } })}>
          <span className="home-tile-title">Quick taste</span>
          <span className="home-tile-sub">One wine, straight to the grid</span>
        </button>
        <button className="home-tile" onClick={() => navigate('/capture', { state: { mode: 'flight' } })}>
          <span className="home-tile-title">Start a flight</span>
          <span className="home-tile-sub">Taste several, one after another</span>
        </button>
        <button className="home-tile" onClick={() => navigate('/events', { state: { create: true } })}>
          <span className="home-tile-title">New event</span>
          <span className="home-tile-sub">A tasting occasion + defaults</span>
        </button>
        <button className="home-tile" onClick={() => navigate('/wines')}>
          <span className="home-tile-title">My wines</span>
          <span className="home-tile-sub">Review what you've tasted</span>
        </button>
        <button className="home-tile" onClick={() => navigate('/stats')}>
          <span className="home-tile-title">Insights</span>
          <span className="home-tile-sub">Totals, scores, blind accuracy</span>
        </button>
      </div>

      <div className="home-links">
        <button className="home-link" onClick={() => navigate('/events')}>Events</button>
        <span className="home-link-dot">·</span>
        <button className="home-link" onClick={() => navigate('/templates')}>Grids</button>
        <span className="home-link-dot">·</span>
        <button className="home-link" onClick={() => navigate('/settings')}>Settings</button>
      </div>

      <h2 className="screen-subtitle">Recent</h2>
      {recent.length === 0 ? (
        <p className="screen-blurb">Nothing tasted yet. Start with a quick taste.</p>
      ) : (
        <div className="template-list">
          {recent.map(({ note, wine }) => (
            <button key={note.id} className="template-card as-button" onClick={() => navigate('/wines')}>
              <div className="template-card-main">
                <div className="template-card-title">{noteWineLabel(note, wine)}</div>
                <div className="template-card-meta">
                  {[fmt(note.tasted_at), note.score != null ? `Score ${note.score}` : ''].filter(Boolean).join(' · ')}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
