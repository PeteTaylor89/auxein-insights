import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { db, repo } from '@/db';
import type { TasteEvent } from '@/db';
import { EventForm, emptyEvent } from './EventForm';

// Events: tasting occasions. List + create/edit/delete; capture and flights
// reference an event for context + defaults.
export function EventsScreen() {
  const location = useLocation();
  const [events, setEvents] = useState<TasteEvent[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<TasteEvent | null>(
    (location.state as { create?: boolean } | null)?.create ? emptyEvent() : null,
  );

  const load = useCallback(async () => {
    const all = await repo.events.list();
    all.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.updated_at.localeCompare(a.updated_at));
    setEvents(all);
    // Note counts per event (non-deleted) — a cheap rollup for the list.
    const notes = await repo.notes.list();
    const tally: Record<string, number> = {};
    for (const n of notes) if (n.event_id) tally[n.event_id] = (tally[n.event_id] ?? 0) + 1;
    setCounts(tally);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (ev: TasteEvent) => {
    await repo.events.save(ev);
    setEditing(null);
    await load();
  };

  const remove = async (ev: TasteEvent) => {
    // Detach notes/flights from a deleted event (don't orphan their FK).
    const notes = await db.notes.where('event_id').equals(ev.id).toArray();
    for (const n of notes) if (!n.deleted) await repo.notes.save({ ...n, event_id: null });
    const flights = await db.flights.where('event_id').equals(ev.id).toArray();
    for (const f of flights) if (!f.deleted) await repo.flights.save({ ...f, event_id: null });
    await repo.events.remove(ev.id);
    await load();
  };

  if (editing) {
    return <EventForm draft={editing} onSave={handleSave} onCancel={() => setEditing(null)} />;
  }

  const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString() : '');

  return (
    <section className="screen">
      <div className="builder-head">
        <h1 className="screen-title">Events</h1>
        <button className="btn" onClick={() => setEditing(emptyEvent())}>+ New event</button>
      </div>

      {events.length === 0 && <p className="screen-blurb">No events yet. Create one for a tasting occasion.</p>}

      <div className="template-list">
        {events.map((ev) => {
          const meta = [fmtDate(ev.date), ev.location_text, `${counts[ev.id] ?? 0} notes`].filter(Boolean).join(' · ');
          return (
            <div className="template-card" key={ev.id}>
              <div className="template-card-main">
                <div className="template-card-title">
                  {ev.name}
                  {ev.default_blind && <span className="badge">blind</span>}
                </div>
                <div className="template-card-meta">{meta || 'No detail yet'}</div>
              </div>
              <div className="template-card-tools">
                <button className="btn btn--ghost" onClick={() => setEditing(structuredClone(ev))}>Edit</button>
                <button className="icon-btn icon-btn--danger" onClick={() => void remove(ev)} aria-label="Delete event">✕</button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
