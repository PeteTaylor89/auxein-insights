import { useCallback, useEffect, useMemo, useState } from 'react';
import { db, repo } from '@/db';
import type { Note, Photo, Wine } from '@/db';
import { WineForm } from './WineForm';
import { wineLabel, wineOrigin } from './wineLabel';

// Wines = the review archive: wines you've tasted, newest first, each opening a
// read-only review of its note(s). Wines are created during tasting (Capture),
// not here — so there's no "+ New". Edit exists only to correct identity.
export function WinesScreen() {
  const [wines, setWines] = useState<Wine[]>([]);
  const [notesByWine, setNotesByWine] = useState<Record<string, Note[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Wine | null>(null);

  const load = useCallback(async () => {
    const [allWines, allNotes] = [await repo.wines.list(), await repo.notes.list()];
    const byWine: Record<string, Note[]> = {};
    for (const n of allNotes) (byWine[n.wine_id] ??= []).push(n);
    for (const list of Object.values(byWine)) list.sort((a, b) => (b.tasted_at ?? b.created_at).localeCompare(a.tasted_at ?? a.created_at));
    setNotesByWine(byWine);
    // Only surface wines that have been tasted (have a note); newest tasting first.
    const tasted = allWines.filter((w) => byWine[w.id]?.length);
    tasted.sort((a, b) => {
      const da = byWine[a.id][0].tasted_at ?? byWine[a.id][0].created_at;
      const dbb = byWine[b.id][0].tasted_at ?? byWine[b.id][0].created_at;
      return dbb.localeCompare(da);
    });
    setWines(tasted);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (editing) {
    return (
      <WineForm
        draft={editing}
        onSave={async (w) => {
          await repo.wines.save(w);
          setEditing(null);
          await load();
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  if (openId) {
    const wine = wines.find((w) => w.id === openId);
    if (!wine) {
      setOpenId(null);
      return null;
    }
    return (
      <WineReview
        wine={wine}
        notes={notesByWine[wine.id] ?? []}
        onBack={() => setOpenId(null)}
        onEdit={() => setEditing(structuredClone(wine))}
      />
    );
  }

  const fmt = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString() : '');

  return (
    <section className="screen">
      <h1 className="screen-title">Wines</h1>
      {wines.length === 0 && <p className="screen-blurb">Nothing tasted yet. Start a quick taste or a flight from Home.</p>}

      <div className="template-list">
        {wines.map((w) => {
          const notes = notesByWine[w.id] ?? [];
          const latest = notes[0];
          const meta = [fmt(latest?.tasted_at ?? null), wineOrigin(w), notes.length > 1 ? `${notes.length} notes` : ''].filter(Boolean).join(' · ');
          return (
            <button key={w.id} className="template-card as-button" onClick={() => setOpenId(w.id)}>
              <div className="template-card-main">
                <div className="template-card-title">{wineLabel(w)}</div>
                <div className="template-card-meta">{meta || 'Tasted'}</div>
              </div>
              {latest?.score != null && <span className="score-pill">{latest.score}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

const renderValue = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
};

function WineReview({ wine, notes, onBack, onEdit }: { wine: Wine; notes: Note[]; onBack: () => void; onEdit: () => void }) {
  const fmt = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString() : '');
  return (
    <section className="screen">
      <div className="builder-head">
        <button className="btn btn--ghost" onClick={onBack}>‹ Wines</button>
        <button className="btn btn--ghost" onClick={onEdit}>Edit wine</button>
      </div>

      <h1 className="screen-title">{wineLabel(wine)}</h1>
      <p className="screen-blurb">{[wine.variety.join(', '), wineOrigin(wine)].filter(Boolean).join(' · ')}</p>

      {notes.map((note) => (
        <NoteReview key={note.id} note={note} fmt={fmt} />
      ))}
    </section>
  );
}

function NoteReview({ note, fmt }: { note: Note; fmt: (d: string | null) => string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  useEffect(() => {
    if (note.photos.length === 0) return;
    void Promise.all(note.photos.map((id) => db.photos.get(id))).then((rows) =>
      setPhotos(rows.filter((p): p is Photo => !!p)),
    );
  }, [note.photos]);

  // Only show answered fields, in the pinned snapshot's order.
  const rows = useMemo(
    () =>
      note.template_snapshot.sections.flatMap((s) =>
        s.fields
          .map((f) => ({ label: f.label, value: renderValue(note.values[f.key]) }))
          .filter((r) => r.value)
          .map((r) => ({ ...r, section: s.label })),
      ),
    [note],
  );

  return (
    <div className="grid-section">
      <div className="review-head">
        <span className="grid-section-label" style={{ margin: 0 }}>{fmt(note.tasted_at) || 'Tasting'}</span>
        <span className="review-head-meta">
          {note.blind && <span className="badge">blind</span>}
          {note.score != null && <span className="score-pill">{note.score}</span>}
        </span>
      </div>

      {rows.length === 0 && !note.general_notes && <p className="screen-blurb">No detail recorded.</p>}

      <dl className="review-list">
        {rows.map((r, i) => (
          <div className="review-row" key={i}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>

      {note.general_notes && <p className="review-notes">{note.general_notes}</p>}

      {photos.length > 0 && (
        <div className="photo-strip">
          {photos.map((p) => (
            <ReviewThumb key={p.id} photo={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewThumb({ photo }: { photo: Photo }) {
  const url = useMemo(() => (photo.blob ? URL.createObjectURL(photo.blob) : ''), [photo.blob]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return <div className="photo-thumb" style={{ backgroundImage: `url(${url})` }} />;
}
