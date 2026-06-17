import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { db, meta, newBase, nowIso, repo, uuidv4 } from '@/db';
import type { Flight, Note, Photo, TasteEvent, Template, Wine } from '@/db';
import type { TemplateSnapshot } from '@/templates/types';
import { SectionWalk } from './SectionWalk';
import { WineFields, emptyWine } from '../wines/WineFields';

const CMS_ID = 'builtin-cms-deductive';
const today = () => new Date().toISOString().slice(0, 10);

type SessionState = { mode?: 'quick' | 'flight'; flightId?: string };

// The tasting workspace. Two phases: a quick SETUP (grid + blind + date, and a
// flight name/event when starting a flight) then TASTE — wines are added inline,
// one continuous forward pass each. Blind = deductive: taste → conclusions →
// Reveal → enter identity. The Wines tab is the review archive, not this.
export function CaptureScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const init = (location.state ?? {}) as SessionState;

  const [phase, setPhase] = useState<'loading' | 'setup' | 'taste'>('loading');
  const [mode, setMode] = useState<'quick' | 'flight'>(init.mode ?? 'quick');

  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [template, setTemplate] = useState<Template | null>(null);

  const [events, setEvents] = useState<TasteEvent[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [flightName, setFlightName] = useState('');
  const [blind, setBlind] = useState(false);
  const [tastedAt, setTastedAt] = useState(today());

  // Per-wine state (reset between pours).
  const [wine, setWine] = useState<Wine>(emptyWine());
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [generalNotes, setGeneralNotes] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [noteId, setNoteId] = useState(() => uuidv4());

  const [flightNotesOpen, setFlightNotesOpen] = useState(false);
  const [error, setError] = useState('');
  const [savedTick, setSavedTick] = useState(0);

  const pickTemplate = (all: Template[], id: string) => {
    setTemplateId(id);
    const picked = all.find((t) => t.id === id);
    setTemplate(picked ? structuredClone(picked) : null);
  };

  useEffect(() => {
    void (async () => {
      const all = await repo.templates.list();
      all.sort((a, b) => Number(b.is_builtin) - Number(a.is_builtin) || a.name.localeCompare(b.name));
      setTemplates(all);
      setEvents(await repo.events.list());
      const def = await meta.get<string>('default_template_id');
      const id = def && all.some((t) => t.id === def) ? def : all.find((t) => t.id === CMS_ID)?.id ?? all[0]?.id ?? '';
      pickTemplate(all, id);

      if (init.flightId) {
        const f = await repo.flights.get(init.flightId);
        if (f) {
          setFlight(f);
          setMode('flight');
          setBlind(f.blind);
          setPhase('taste');
          return;
        }
      }
      setPhase('setup');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeTemplate = (id: string) => {
    pickTemplate(templates, id);
    setValues({});
  };

  // Sections to walk: blind keeps the deductive conclusion sections; a known
  // (non-blind) note hides them.
  const sections = useMemo(
    () => (template?.sections ?? []).filter((s) => blind || !s.blind_only),
    [template, blind],
  );

  const startTasting = async () => {
    if (mode === 'flight') {
      if (!flightName.trim()) {
        setError('Name the flight to start.');
        return;
      }
      const f = await repo.flights.save({ ...newFlight(eventId, blind), name: flightName.trim() });
      setFlight(f);
    }
    setError('');
    setPhase('taste');
  };

  const setValue = (key: string, value: unknown) => setValues((v) => ({ ...v, [key]: value }));

  // Persist an added descriptor back to the live template (bumps version) so it
  // sticks for future notes; the note's pinned snapshot includes it too.
  const addOption = async (fieldKey: string, groupLabel: string | null, term: string) => {
    if (!template) return;
    const next = structuredClone(template);
    for (const section of next.sections) {
      for (const field of section.fields) {
        if (field.key !== fieldKey) continue;
        if (groupLabel == null) {
          field.options = field.options ?? [];
          if (!field.options.includes(term)) field.options.push(term);
        } else {
          const group = field.groups?.find((g) => g.label === groupLabel);
          if (group && !group.options.includes(term)) group.options.push(term);
        }
      }
    }
    const savedTpl = await repo.templates.save(next);
    setTemplate(savedTpl);
    setTemplates((ts) => ts.map((t) => (t.id === savedTpl.id ? savedTpl : t)));
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      let width: number | null = null;
      let height: number | null = null;
      try {
        const bmp = await createImageBitmap(file);
        width = bmp.width;
        height = bmp.height;
        bmp.close();
      } catch {
        /* dimensions are best-effort */
      }
      const photo: Photo = { ...newBase(), note_id: noteId, blob: file, s3_key: null, status: 'local', width, height, taken_at: nowIso() };
      await db.photos.put(photo);
      setPhotos((p) => [...p, photo]);
    }
  };

  const removePhoto = async (id: string) => {
    await db.photos.delete(id);
    setPhotos((p) => p.filter((x) => x.id !== id));
  };

  const saveFlightNotes = async (text: string) => {
    if (!flight) return;
    const f = await repo.flights.save({ ...flight, general_notes: text });
    setFlight(f);
  };

  const resetWine = () => {
    setWine(emptyWine());
    setValues({});
    setGeneralNotes('');
    setPhotos([]);
    setRevealed(false);
    setNoteId(uuidv4());
  };

  const save = async () => {
    if (!template) {
      setError('No grid selected.');
      return;
    }
    if (blind && !revealed) {
      setError('Reveal the wine before saving.');
      return;
    }
    if (!wine.producer.trim() && !wine.label.trim()) {
      setError('Add the wine — producer or label.');
      return;
    }

    const savedWine = await repo.wines.save({ ...wine, producer: wine.producer.trim(), label: wine.label.trim() });

    const snapshot: TemplateSnapshot = {
      template_id: template.id,
      name: template.name,
      version: template.version,
      sections: template.sections,
    };
    const scoreField = template.sections.flatMap((s) => s.fields).find((f) => f.type === 'score');
    const score = scoreField ? ((values[scoreField.key] as number) ?? null) : null;
    const position = flight ? flight.note_ids.length : null;

    const note: Note = {
      ...newBase(),
      id: noteId,
      wine_id: savedWine.id,
      event_id: flight?.event_id ?? eventId,
      template_id: template.id,
      template_version: template.version,
      template_snapshot: snapshot,
      values,
      general_notes: generalNotes.trim(),
      tasted_at: tastedAt || today(),
      blind,
      revealed: blind ? revealed : true,
      score,
      flight_id: flight?.id ?? null,
      flight_position: position,
      photos: photos.map((p) => p.id),
    };
    await repo.notes.save(note);

    if (flight) {
      const f = await repo.flights.save({ ...flight, note_ids: [...flight.note_ids, note.id] });
      setFlight(f);
    }

    setError('');
    setSavedTick((n) => n + 1);

    if (mode === 'flight') {
      resetWine(); // forward to the next pour, context kept
    } else {
      navigate('/wines'); // quick taste = one wine, drop into the review archive
    }
  };

  if (phase === 'loading') return <section className="screen"><p className="screen-blurb">Opening…</p></section>;

  // ---- SETUP -------------------------------------------------------------
  if (phase === 'setup') {
    return (
      <section className="screen">
        <h1 className="screen-title">{mode === 'flight' ? 'Start a flight' : 'Quick taste'}</h1>

        <div className="grid-section">
          {mode === 'flight' && (
            <>
              <label className="field-label-block">
                <span className="grid-field-help">Flight name</span>
                <input className="form-input" placeholder="e.g. Otago Pinot bracket" value={flightName} onChange={(e) => setFlightName(e.target.value)} />
              </label>
              <label className="field-label-block">
                <span className="grid-field-help">Event (optional)</span>
                <select className="form-input form-select" value={eventId ?? ''} onChange={(e) => setEventId(e.target.value || null)}>
                  <option value="">— standalone —</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="field-label-block">
            <span className="grid-field-help">Grid</span>
            <select className="form-input form-select" value={templateId} onChange={(e) => changeTemplate(e.target.value)}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>

          <label className="field-label-block">
            <span className="grid-field-help">Tasting date</span>
            <input className="form-input" type="date" value={tastedAt} max={today()} onChange={(e) => setTastedAt(e.target.value)} />
          </label>

          <label className="toggle-row" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} />
            <span>Taste blind (deductive — reveal the wine at the end)</span>
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}
        <button className="btn btn--block" onClick={() => void startTasting()}>Start tasting ›</button>
      </section>
    );
  }

  // ---- TASTE -------------------------------------------------------------
  const position = flight ? flight.note_ids.length + 1 : 0;
  const saveLabel = blind && !revealed ? 'Reveal first' : mode === 'flight' ? 'Save & next ›' : 'Save note';

  return (
    <section className="screen">
      <div className="capture-bar">
        <div className="capture-bar-title">
          {flight ? flight.name : 'Quick taste'}
          {blind && <span className="badge">blind</span>}
        </div>
        <button className="btn" disabled={blind && !revealed} onClick={() => void save()}>{saveLabel}</button>
      </div>

      <div className="capture-sub">
        {flight && <span className="capture-pos">Wine {position}</span>}
        <input className="form-input form-input--inline" type="date" value={tastedAt} max={today()} onChange={(e) => setTastedAt(e.target.value)} />
        {flight && (
          <button className="btn btn--ghost" onClick={() => setFlightNotesOpen((o) => !o)}>
            Flight notes{flight.general_notes ? ' •' : ''}
          </button>
        )}
        {flight && <button className="btn btn--ghost" onClick={() => navigate('/flights')}>Finish</button>}
      </div>

      {flight && flightNotesOpen && (
        <div className="grid-section">
          <h2 className="grid-section-label">Flight notes</h2>
          <textarea
            className="form-input"
            rows={3}
            placeholder="Shared notes for the whole flight…"
            defaultValue={flight.general_notes}
            onBlur={(e) => void saveFlightNotes(e.target.value)}
          />
        </div>
      )}

      {/* Known wine: identity up front. Blind wine: hidden until reveal. */}
      {!blind && (
        <div className="grid-section">
          <h2 className="grid-section-label">Wine</h2>
          <WineFields wine={wine} onChange={setWine} compact />
        </div>
      )}

      <SectionWalk key={noteId} sections={sections} values={values} onChange={setValue} onAddOption={addOption} />

      <div className="grid-section">
        <h2 className="grid-section-label">Notes</h2>
        <textarea className="form-input" rows={3} placeholder="Your impression, context…" value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)} />
        <PhotoStrip photos={photos} onAdd={addPhotos} onRemove={removePhoto} />
      </div>

      {blind && !revealed && (
        <button className="btn btn--block" onClick={() => setRevealed(true)}>Reveal the wine ›</button>
      )}
      {blind && revealed && (
        <div className="grid-section reveal-block">
          <h2 className="grid-section-label">The wine</h2>
          <WineFields wine={wine} onChange={setWine} compact />
        </div>
      )}

      {error && <p className="form-error">{error}</p>}
      {savedTick > 0 && <Toast tick={savedTick} label={mode === 'flight' ? 'Saved — next pour' : 'Note saved ✓'} />}
    </section>
  );
}

// emptyFlight lives in flights/FlightForm; re-declared minimally here to avoid a
// circular import (capture → flights → capture).
function newFlight(eventId: string | null, blind: boolean): Flight {
  return { ...newBase(), event_id: eventId, name: '', blind, general_notes: '', note_ids: [] };
}

function Toast({ tick, label }: { tick: number; label: string }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    setShow(true);
    const t = window.setTimeout(() => setShow(false), 2000);
    return () => window.clearTimeout(t);
  }, [tick]);
  return show ? <div className="toast">{label}</div> : null;
}

function PhotoStrip({
  photos,
  onAdd,
  onRemove,
}: {
  photos: Photo[];
  onAdd: (files: FileList | null) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="photo-strip">
      {photos.map((p) => (
        <Thumb key={p.id} photo={p} onRemove={() => onRemove(p.id)} />
      ))}
      <label className="photo-add">
        +
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={(e) => {
            onAdd(e.target.files);
            e.target.value = '';
          }}
        />
      </label>
    </div>
  );
}

function Thumb({ photo, onRemove }: { photo: Photo; onRemove: () => void }) {
  const url = useMemo(() => (photo.blob ? URL.createObjectURL(photo.blob) : ''), [photo.blob]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return (
    <div className="photo-thumb" style={{ backgroundImage: `url(${url})` }}>
      <button className="photo-del" onClick={onRemove} aria-label="Remove photo">✕</button>
    </div>
  );
}
