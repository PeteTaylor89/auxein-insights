import { useEffect, useState } from 'react';
import { newBase, repo } from '@/db';
import type { Flight, TasteEvent } from '@/db';

export function emptyFlight(eventId: string | null = null, blind = false): Flight {
  return {
    ...newBase(),
    event_id: eventId,
    name: '',
    blind,
    general_notes: '',
    note_ids: [],
  };
}

interface Props {
  draft: Flight;
  onSave: (flight: Flight) => void | Promise<void>;
  onCancel: () => void;
}

// A flight = an ordered set of wines tasted together, often blind.
export function FlightForm({ draft, onSave, onCancel }: Props) {
  const [flight, setFlight] = useState<Flight>(draft);
  const [events, setEvents] = useState<TasteEvent[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void repo.events.list().then((all) => {
      all.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
      setEvents(all);
    });
  }, []);

  const submit = () => {
    if (!flight.name.trim()) {
      setError('Name the flight.');
      return;
    }
    void onSave({ ...flight, name: flight.name.trim() });
  };

  return (
    <section className="screen">
      <div className="builder-head">
        <h1 className="screen-title">{draft.version > 0 ? 'Edit flight' : 'New flight'}</h1>
        <div className="template-card-tools">
          <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
          <button className="btn" onClick={submit}>Save</button>
        </div>
      </div>

      <div className="grid-section">
        <h2 className="grid-section-label">Flight</h2>
        <input className="form-input" placeholder="Name (e.g. Bracket A — Syrah)" value={flight.name} onChange={(e) => setFlight((f) => ({ ...f, name: e.target.value }))} />
        <label className="field-label-block">
          <span className="grid-field-help">Event (optional)</span>
          <select className="form-input form-select" value={flight.event_id ?? ''} onChange={(e) => setFlight((f) => ({ ...f, event_id: e.target.value || null }))}>
            <option value="">— standalone —</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={flight.blind} onChange={(e) => setFlight((f) => ({ ...f, blind: e.target.checked }))} />
          <span>Blind flight (hide wine identities until revealed)</span>
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
