import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { repo } from '@/db';
import type { Note, Photo, Wine } from '@/db';
import type { ReconciledValue } from '@/reconcile';
import type { TemplateField } from '@/templates/types';
import { WineForm } from './WineForm';
import { wineLabel, wineOrigin } from './wineLabel';
import { usePhotoUrl } from '../capture/usePhotoUrl';

// Wines = the review archive: wines you've tasted, newest first, each opening a
// read-only review of its note(s). Wines are created during tasting (Capture),
// not here — so there's no "+ New". Edit exists only to correct identity.
export function WinesScreen() {
  const navigate = useNavigate();
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
        onEditNote={(noteId) => navigate('/capture', { state: { noteId } })}
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

const answered = (v: ReconciledValue | undefined): boolean => {
  const r = v?.raw;
  return r !== undefined && r !== null && r !== '' && !(Array.isArray(r) && r.length === 0);
};

// Read display: ordinal fields render as a compact filled bar (using the stored
// canonical position) so the review mirrors the capture sliders; everything else
// is text.
function ReviewValue({ field, val }: { field: TemplateField; val?: ReconciledValue }) {
  const canonical = val?.canonical as { position?: number } | undefined;
  if (field.reconciliation_type === 'ordinal' && typeof canonical?.position === 'number') {
    return (
      <div className="rslider">
        <span className="rslider-track"><span className="rslider-fill" style={{ width: `${Math.round(canonical.position * 100)}%` }} /></span>
        <span className="rslider-label">{renderValue(val?.raw)}</span>
      </div>
    );
  }
  return <>{renderValue(val?.raw)}</>;
}

function WineReview({ wine, notes, onBack, onEdit, onEditNote }: { wine: Wine; notes: Note[]; onBack: () => void; onEdit: () => void; onEditNote: (noteId: string) => void }) {
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
        <NoteReview key={note.id} note={note} fmt={fmt} onEdit={() => onEditNote(note.id)} />
      ))}
    </section>
  );
}

function NoteReview({ note, fmt, onEdit }: { note: Note; fmt: (d: string | null) => string; onEdit: () => void }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  useEffect(() => {
    if (note.photos.length === 0) return;
    void repo.photos.listBy({ note_id: note.id }).then(setPhotos).catch(() => {});
  }, [note.id, note.photos.length]);

  // Only show answered fields, in the pinned snapshot's order.
  const rows = useMemo(
    () =>
      note.template_snapshot.sections.flatMap((s) =>
        s.fields
          .map((f) => ({ field: f, val: note.values[f.key] as ReconciledValue | undefined }))
          .filter((r) => answered(r.val)),
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
          <button className="btn btn--ghost" onClick={onEdit}>Edit note</button>
        </span>
      </div>

      {rows.length === 0 && !note.general_notes && <p className="screen-blurb">No detail recorded.</p>}

      <dl className="review-list">
        {rows.map((r, i) => (
          <div className="review-row" key={i}>
            <dt>{r.field.label}</dt>
            <dd><ReviewValue field={r.field} val={r.val} /></dd>
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
  const url = usePhotoUrl(photo);
  return <div className="photo-thumb" style={url ? { backgroundImage: `url(${url})` } : undefined} />;
}
