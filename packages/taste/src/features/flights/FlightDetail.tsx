import { useCallback, useEffect, useState } from 'react';
import { repo } from '@/db';
import type { Flight, Note, Wine } from '@/db';
import { noteWineLabel, wineLabel } from '../wines/wineLabel';

interface Props {
  flightId: string;
  onBack: () => void;
}

// Ordered notes for a flight, with the blind/reveal gate. Notes are added by
// capturing against the flight; here you reorder, reveal, and detach them.
export function FlightDetail({ flightId, onBack }: Props) {
  const [flight, setFlight] = useState<Flight | null>(null);
  const [notes, setNotes] = useState<Note[]>([]); // ordered per flight.note_ids
  const [wines, setWines] = useState<Record<string, Wine>>({});

  const load = useCallback(async () => {
    const f = await repo.flights.get(flightId);
    if (!f) {
      onBack();
      return;
    }
    setFlight(f);
    const loaded = (await Promise.all(f.note_ids.map((id) => repo.notes.get(id)))).filter(
      (n): n is Note => !!n && !n.deleted,
    );
    setNotes(loaded);
    const wineRows = await Promise.all([...new Set(loaded.map((n) => n.wine_id))].map((id) => repo.wines.get(id)));
    setWines(Object.fromEntries(wineRows.filter((w): w is Wine => !!w).map((w) => [w.id, w])));
  }, [flightId, onBack]);

  useEffect(() => {
    void load();
  }, [load]);

  // Persist a new order: flight.note_ids is the source of truth; mirror the
  // index onto each note's flight_position so exports/stats stay consistent.
  const persistOrder = async (ordered: Note[]) => {
    if (!flight) return;
    await repo.flights.save({ ...flight, note_ids: ordered.map((n) => n.id) });
    await Promise.all(
      ordered.map((n, i) => (n.flight_position === i ? null : repo.notes.save({ ...n, flight_position: i }))),
    );
    await load();
  };

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= notes.length) return;
    const next = [...notes];
    [next[index], next[j]] = [next[j], next[index]];
    void persistOrder(next);
  };

  const detach = async (note: Note) => {
    if (!flight) return;
    await repo.flights.save({ ...flight, note_ids: flight.note_ids.filter((id) => id !== note.id) });
    await repo.notes.save({ ...note, flight_id: null, flight_position: null });
    await load();
  };

  const setRevealed = async (note: Note, revealed: boolean) => {
    await repo.notes.save({ ...note, revealed });
    await load();
  };

  const revealAll = async (revealed: boolean) => {
    await Promise.all(notes.filter((n) => n.revealed !== revealed).map((n) => repo.notes.save({ ...n, revealed })));
    await load();
  };

  if (!flight) return null;

  const anyHidden = notes.some((n) => n.blind && !n.revealed);

  return (
    <section className="screen">
      <div className="builder-head">
        <div>
          <button className="btn btn--ghost" onClick={onBack}>‹ Flights</button>
        </div>
        {flight.blind && notes.length > 0 && (
          <button className="btn" onClick={() => void revealAll(anyHidden)}>
            {anyHidden ? 'Reveal all' : 'Hide all'}
          </button>
        )}
      </div>

      <h1 className="screen-title">
        {flight.name}
        {flight.blind && <span className="badge">blind</span>}
      </h1>

      {notes.length === 0 && (
        <p className="screen-blurb">No notes yet. In Capture, pick this flight as the tasting context and save notes into it.</p>
      )}

      <div className="template-list">
        {notes.map((note, i) => {
          const wine = wines[note.wine_id];
          const masked = note.blind && !note.revealed;
          return (
            <div className="template-card flight-note" key={note.id}>
              <div className="flight-note-pos">{i + 1}</div>
              <div className="template-card-main">
                <div className="template-card-title">{noteWineLabel(note, wine, i)}</div>
                <div className="template-card-meta">
                  {[note.score != null ? `Score ${note.score}` : '', masked ? 'hidden' : wine ? '' : 'wine missing']
                    .filter(Boolean)
                    .join(' · ') || (masked ? 'hidden' : 'tasted')}
                </div>
              </div>
              <div className="template-card-tools">
                <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === notes.length - 1} aria-label="Move down">↓</button>
                {note.blind && (
                  <button className="btn btn--ghost" onClick={() => void setRevealed(note, !note.revealed)}>
                    {note.revealed ? 'Hide' : 'Reveal'}
                  </button>
                )}
                <button className="icon-btn icon-btn--danger" onClick={() => void detach(note)} aria-label="Remove from flight">✕</button>
              </div>
            </div>
          );
        })}
      </div>

      {notes.some((n) => n.revealed && wines[n.wine_id]) && flight.blind && (
        <p className="screen-blurb" style={{ marginTop: 16 }}>
          Revealed: {notes.filter((n) => n.revealed).map((n) => wineLabel(wines[n.wine_id])).join(', ')}
        </p>
      )}
    </section>
  );
}
