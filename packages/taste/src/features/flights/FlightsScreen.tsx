import { useCallback, useEffect, useState } from 'react';
import { repo } from '@/db';
import type { Flight, TasteEvent } from '@/db';
import { FlightForm, emptyFlight } from './FlightForm';
import { FlightDetail } from './FlightDetail';

// Flights: list → open a flight detail, or create/edit one. Detail handles the
// ordered notes + blind/reveal; this screen is the index.
export function FlightsScreen() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [events, setEvents] = useState<Record<string, TasteEvent>>({});
  const [editing, setEditing] = useState<Flight | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const all = await repo.flights.list();
    all.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    setFlights(all);
    const evs = await repo.events.list();
    setEvents(Object.fromEntries(evs.map((e) => [e.id, e])));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (f: Flight) => {
    const saved = await repo.flights.save(f);
    setEditing(null);
    await load();
    if (f.version === 0) setOpenId(saved.id); // jump into a freshly created flight
  };

  const remove = async (f: Flight) => {
    // Detach member notes (the notes survive; they just leave the flight).
    for (const id of f.note_ids) {
      const n = await repo.notes.get(id);
      if (n && !n.deleted) await repo.notes.save({ ...n, flight_id: null, flight_position: null });
    }
    await repo.flights.remove(f.id);
    await load();
  };

  if (openId) return <FlightDetail flightId={openId} onBack={() => { setOpenId(null); void load(); }} />;
  if (editing) return <FlightForm draft={editing} onSave={handleSave} onCancel={() => setEditing(null)} />;

  return (
    <section className="screen">
      <div className="builder-head">
        <h1 className="screen-title">Flights</h1>
        <button className="btn" onClick={() => setEditing(emptyFlight())}>+ New flight</button>
      </div>

      {flights.length === 0 && <p className="screen-blurb">No flights yet. Create one, then capture notes into it.</p>}

      <div className="template-list">
        {flights.map((f) => {
          const ev = f.event_id ? events[f.event_id] : null;
          const meta = [ev?.name, `${f.note_ids.length} wines`].filter(Boolean).join(' · ');
          return (
            <div className="template-card" key={f.id}>
              <button className="template-card-main as-button" onClick={() => setOpenId(f.id)}>
                <div className="template-card-title">
                  {f.name}
                  {f.blind && <span className="badge">blind</span>}
                </div>
                <div className="template-card-meta">{meta}</div>
              </button>
              <div className="template-card-tools">
                <button className="btn btn--ghost" onClick={() => setEditing(structuredClone(f))}>Edit</button>
                <button className="icon-btn icon-btn--danger" onClick={() => void remove(f)} aria-label="Delete flight">✕</button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
