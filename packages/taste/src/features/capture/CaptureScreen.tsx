import { useEffect, useMemo, useState } from 'react';
import { Camera } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { meta, newBase, repo, vocab } from '@/db';
import type { Flight, Note, Photo, TasteEvent, Template, Wine } from '@/db';
import type { TemplateSection, TemplateSnapshot } from '@/templates/types';
import { reconcileNoteValues } from '@/templates/factory';
import { uploadPhoto } from '@/services/photoSync';
import { SectionWalk } from './SectionWalk';
import { WineFields, emptyWine } from '../wines/WineFields';
import { GlassRack } from './GlassRack';
import { usePhotoUrl } from './usePhotoUrl';
import { emptyGlass, glassHasContent, nextColor } from './glass';
import type { Glass } from './glass';

// The pre-reveal deductive guesses to freeze for Epic 5 grading: the raw answered
// values of every blind_only section field, snapshotted the moment before reveal.
function blindConclusionSnapshot(sections: TemplateSection[], values: Record<string, unknown>): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  for (const s of sections) {
    if (!s.blind_only) continue;
    for (const f of s.fields) {
      const v = values[f.key];
      if (v !== undefined && v !== '') snap[f.key] = v;
    }
  }
  return snap;
}

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

const CMS_ID = 'builtin-cms-deductive';
const today = () => new Date().toISOString().slice(0, 10);

type SessionState = { mode?: 'quick' | 'flight'; flightId?: string; noteId?: string };

// The tasting workspace. Quick taste = one glass. A flight = a rack of glasses you
// switch between freely (tap glass 4, then 6, then 1); each glass holds its own
// in-progress note and persists to Dexie the moment it has content. Blind = the
// wine identity is hidden per glass until you reveal it.
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
  const [glassesCount, setGlassesCount] = useState(1);
  const [blind, setBlind] = useState(false);
  const [tastedAt, setTastedAt] = useState(today());

  // The rack. Quick mode keeps exactly one glass and hides the rack UI.
  const [glasses, setGlasses] = useState<Glass[]>([]);
  const [activeId, setActiveId] = useState('');
  const active = glasses.find((g) => g.id === activeId) ?? null;

  const [flightNotesOpen, setFlightNotesOpen] = useState(false);
  // The note being edited (re-opened from the Wines archive). When set, capture runs
  // in single-glass quick mode against that note's id; its event/flight associations
  // are preserved on save rather than reset to the setup state.
  const [editNote, setEditNote] = useState<Note | null>(null);
  const [error, setError] = useState('');

  const pickTemplate = (all: Template[], id: string) => {
    setTemplateId(id);
    const picked = all.find((t) => t.id === id);
    setTemplate(picked ? mergeVocab(picked) : null);
  };

  useEffect(() => {
    void (async () => {
      await vocab.loadAll(); // prime user vocab so template merges read synchronously
      const all = await repo.templates.list();
      all.sort((a, b) => Number(b.is_builtin) - Number(a.is_builtin) || a.name.localeCompare(b.name));
      setTemplates(all);
      setEvents(await repo.events.list());
      const def = await meta.get<string>('default_template_id');
      const fallbackId = def && all.some((t) => t.id === def) ? def : all.find((t) => t.id === CMS_ID)?.id ?? all[0]?.id ?? '';

      // Edit an existing note: reopen it as a single glass in quick mode. Uses the
      // live template if it still exists (so any grown vocab shows), else rebuilds
      // the grid from the note's pinned snapshot so old notes always render.
      if (init.noteId) {
        const note = await repo.notes.get(init.noteId);
        if (note && !note.deleted) {
          const tpl = all.find((t) => t.id === note.template_id) ?? snapshotToTemplate(note);
          const glass = await noteToGlass(note);
          setTemplateId(tpl.id);
          setTemplate(mergeVocab(tpl));
          setEditNote(note);
          setMode('quick');
          setBlind(note.blind);
          setTastedAt(note.tasted_at ?? today());
          setEventId(note.event_id);
          setGlasses([glass]);
          setActiveId(glass.id);
          setPhase('taste');
          return;
        }
      }

      // Resume an existing flight: rebuild the rack from its notes.
      if (init.flightId) {
        const f = await repo.flights.get(init.flightId);
        if (f) {
          const notes = (await Promise.all(f.note_ids.map((id) => repo.notes.get(id)))).filter(
            (n): n is Note => !!n && !n.deleted,
          );
          const built = await Promise.all(notes.map(noteToGlass));
          const rack = built.length > 0 ? built : [emptyGlass()];
          pickTemplate(all, notes[0]?.template_id ?? fallbackId);
          setFlight(f);
          setMode('flight');
          setBlind(f.blind);
          setTastedAt(notes[0]?.tasted_at ?? today());
          setGlasses(rack);
          setActiveId(rack[0].id);
          setPhase('taste');
          return;
        }
      }

      pickTemplate(all, fallbackId);
      setPhase('setup');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeTemplate = (id: string) => pickTemplate(templates, id);

  // Sections to walk: blind keeps the deductive conclusion sections; a known
  // (non-blind) note hides them.
  const sections = useMemo(
    () => (template?.sections ?? []).filter((s) => blind || !s.blind_only),
    [template, blind],
  );

  // ---- per-glass editor mutations (always target the active glass) ---------
  const patchActive = (patch: Partial<Glass>) =>
    setGlasses((gs) => gs.map((g) => (g.id === activeId ? { ...g, ...patch } : g)));

  const setValue = (key: string, value: unknown) =>
    setGlasses((gs) => gs.map((g) => (g.id === activeId ? { ...g, values: { ...g.values, [key]: value } } : g)));

  const setWine = (w: Wine) => patchActive({ wine: w });
  const setGeneralNotes = (text: string) => patchActive({ generalNotes: text });

  // A descriptor the user typed in. Add it to this session's grid immediately, and
  // persist it to their tasting vocabulary (not the template — the builtin CMS grid
  // is global/read-only). Next tasting the merge folds it back into the picker.
  const addOption = (fieldKey: string, groupLabel: string | null, term: string) => {
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
    setTemplate(next);
    void vocab.add(fieldKey, term, groupLabel);
  };

  // Upload straight to S3 + persist the Photo row. The note id is the glass id, so
  // photos can be added before the note itself is first saved.
  const addPhotos = async (files: FileList | null) => {
    if (!files || !active) return;
    const id = active.id;
    const added: Photo[] = [];
    for (const file of Array.from(files)) {
      try {
        added.push(await uploadPhoto(file, id));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Photo upload failed');
      }
    }
    if (added.length) setGlasses((gs) => gs.map((g) => (g.id === id ? { ...g, photos: [...g.photos, ...added] } : g)));
  };

  const removePhoto = async (photoId: string) => {
    try {
      await repo.photos.remove(photoId);
    } catch {
      /* best-effort; still drop it from the glass */
    }
    setGlasses((gs) => gs.map((g) => (g.id === activeId ? { ...g, photos: g.photos.filter((p) => p.id !== photoId) } : g)));
  };

  const saveFlightNotes = async (text: string) => {
    if (!flight) return;
    const f = await repo.flights.save({ ...flight, general_notes: text });
    setFlight(f);
  };

  // Blind reveal (per glass): freeze the deductive guesses BEFORE the truth is
  // entered, then unlock identity entry for this glass.
  const reveal = () => {
    if (!active) return;
    patchActive({ revealed: true, blindConclusions: blindConclusionSnapshot(template?.sections ?? [], active.values) });
  };

  // ---- persistence ---------------------------------------------------------
  // Write a glass to Dexie as a Note (+ Wine) when it has content. The wine is
  // saved only once it has an identity; otherwise the note carries no wine_id and
  // stays out of the Wines archive.
  const persistGlass = async (glass: Glass, index: number) => {
    if (!template || !glassHasContent(glass)) return;
    const identified = glass.wine.producer.trim() || glass.wine.label.trim();
    let wineId = '';
    if (identified) {
      const savedWine = await repo.wines.save({ ...glass.wine, producer: glass.wine.producer.trim(), label: glass.wine.label.trim() });
      wineId = savedWine.id;
    }
    const snapshot: TemplateSnapshot = {
      template_id: template.id,
      name: template.name,
      version: template.version,
      sections: template.sections,
    };
    const scoreField = template.sections.flatMap((s) => s.fields).find((f) => f.type === 'score');
    const score = scoreField ? ((glass.values[scoreField.key] as number) ?? null) : null;
    const reconciledValues = reconcileNoteValues(template.sections, glass.values);

    // Editing an existing note: keep its original event/flight placement (quick-mode
    // edit shouldn't detach it from a flight or event it belonged to).
    const editing = editNote && editNote.id === glass.id ? editNote : null;

    const note: Note = {
      ...newBase(),
      id: glass.id,
      wine_id: wineId,
      event_id: editing ? editing.event_id : flight?.event_id ?? eventId,
      template_id: template.id,
      template_version: template.version,
      template_snapshot: snapshot,
      values: reconciledValues,
      general_notes: glass.generalNotes.trim(),
      tasted_at: tastedAt || today(),
      blind,
      revealed: blind ? glass.revealed : true,
      blind_conclusions: blind ? (glass.blindConclusions ?? blindConclusionSnapshot(template.sections, glass.values)) : null,
      score,
      flight_id: editing ? editing.flight_id : flight?.id ?? null,
      flight_position: editing ? editing.flight_position : flight ? index : null,
      glass_color: glass.glassColor,
      photos: glass.photos.map((p) => p.id),
    };
    await repo.notes.save(note);
  };

  // Keep flight.note_ids = the content glasses, in rack order.
  const syncFlight = async (current: Glass[]) => {
    if (!flight) return;
    const ids = current.filter(glassHasContent).map((g) => g.id);
    if (sameIds(ids, flight.note_ids)) return;
    const f = await repo.flights.save({ ...flight, note_ids: ids });
    setFlight(f);
  };

  const flushActive = async (current = glasses) => {
    const idx = current.findIndex((g) => g.id === activeId);
    if (idx >= 0) await persistGlass(current[idx], idx);
    await syncFlight(current);
  };

  // ---- rack interactions ---------------------------------------------------
  const switchTo = async (id: string) => {
    if (id === activeId) return;
    await flushActive();
    setActiveId(id);
  };

  const addGlass = async () => {
    await flushActive();
    const g = emptyGlass();
    setGlasses((gs) => [...gs, g]);
    setActiveId(g.id);
  };

  const cycleColor = async (id: string) => {
    const g = glasses.find((x) => x.id === id);
    if (!g) return;
    const updated = { ...g, glassColor: nextColor(g.glassColor) };
    setGlasses((gs) => gs.map((x) => (x.id === id ? updated : x)));
    // Persist immediately for an already-real glass that isn't the active one
    // (the active glass flushes when you leave it).
    if (id !== activeId && glassHasContent(updated)) {
      await persistGlass(updated, glasses.findIndex((x) => x.id === id));
    }
  };

  // ---- start / finish ------------------------------------------------------
  const startTasting = async () => {
    if (mode === 'flight') {
      if (!flightName.trim()) {
        setError('Name the flight to start.');
        return;
      }
      const f = await repo.flights.save({ ...newFlight(eventId, blind), name: flightName.trim() });
      setFlight(f);
      const initial = Array.from({ length: Math.max(1, glassesCount) }, () => emptyGlass());
      setGlasses(initial);
      setActiveId(initial[0].id);
    } else {
      const g = emptyGlass();
      setGlasses([g]);
      setActiveId(g.id);
    }
    setError('');
    setPhase('taste');
  };

  const finishFlight = async () => {
    await flushActive();
    navigate('/flights');
  };

  const saveQuick = async () => {
    if (!template || !active) {
      setError('No grid selected.');
      return;
    }
    if (blind && !active.revealed) {
      setError('Reveal the wine before saving.');
      return;
    }
    if (!(active.wine.producer.trim() || active.wine.label.trim())) {
      setError('Add the wine — producer or label.');
      return;
    }
    await persistGlass(active, 0);
    navigate('/wines');
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
              <label className="field-label-block">
                <span className="grid-field-help">Glasses (add more later)</span>
                <input
                  className="form-input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={24}
                  value={glassesCount}
                  onChange={(e) => setGlassesCount(Math.min(24, Math.max(1, Number(e.target.value) || 1)))}
                />
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
  const isFlight = !!flight;
  const blindLocked = blind && !(active?.revealed ?? false);
  const primaryLabel = isFlight ? 'Finish' : blindLocked ? 'Reveal first' : 'Save note';
  const onPrimary = isFlight ? finishFlight : saveQuick;

  return (
    <section className="screen">
      <div className="capture-bar">
        <div className="capture-bar-title">
          {flight ? flight.name : editNote ? 'Edit note' : 'Quick taste'}
          {blind && <span className="badge">blind</span>}
        </div>
        <div className="capture-bar-actions">
          <PhotoButton onAdd={addPhotos} />
          <button className="btn" disabled={!isFlight && blindLocked} onClick={() => void onPrimary()}>{primaryLabel}</button>
        </div>
      </div>

      {isFlight && (
        <GlassRack
          glasses={glasses}
          activeId={activeId}
          blind={blind}
          onSelect={(id) => void switchTo(id)}
          onAdd={() => void addGlass()}
          onCycleColor={(id) => void cycleColor(id)}
        />
      )}

      <div className="capture-sub">
        <input className="form-input form-input--inline" type="date" value={tastedAt} max={today()} onChange={(e) => setTastedAt(e.target.value)} />
        {flight && (
          <button className="btn btn--ghost" onClick={() => setFlightNotesOpen((o) => !o)}>
            Flight notes{flight.general_notes ? ' •' : ''}
          </button>
        )}
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
      {active && !blind && (
        <div className="grid-section">
          <h2 className="grid-section-label">Wine</h2>
          <WineFields wine={active.wine} onChange={setWine} compact />
        </div>
      )}

      <SectionWalk key={activeId} sections={sections} values={active?.values ?? {}} onChange={setValue} onAddOption={addOption} />

      <div className="grid-section">
        <h2 className="grid-section-label">Notes</h2>
        <textarea className="form-input" rows={3} placeholder="Your impression, context…" value={active?.generalNotes ?? ''} onChange={(e) => setGeneralNotes(e.target.value)} />
        <PhotoStrip photos={active?.photos ?? []} onAdd={addPhotos} onRemove={removePhoto} />
      </div>

      {active && blind && !active.revealed && (
        <button className="btn btn--block" onClick={reveal}>Reveal the wine ›</button>
      )}
      {active && blind && active.revealed && (
        <div className="grid-section reveal-block">
          <h2 className="grid-section-label">The wine</h2>
          <WineFields wine={active.wine} onChange={setWine} compact />
        </div>
      )}

      {error && <p className="form-error">{error}</p>}
    </section>
  );
}

// Rebuild a glass editor-state from a persisted note (+ its wine + photos).
async function noteToGlass(note: Note): Promise<Glass> {
  const wine = (note.wine_id ? await repo.wines.get(note.wine_id) : undefined) ?? emptyWine();
  const photos = note.photos.length ? await repo.photos.listBy({ note_id: note.id }) : [];
  const values: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(note.values)) values[k] = v?.raw;
  return {
    id: note.id,
    glassColor: note.glass_color ?? null,
    wine,
    values,
    generalNotes: note.general_notes,
    revealed: note.revealed,
    blindConclusions: note.blind_conclusions,
    photos,
  };
}

// Fold the user's saved vocabulary into a template clone so their added terms show
// in the pickers. tag_structured groups gain terms tagged with that group's label;
// flat select fields gain the group-less terms saved under their key. Local only —
// never persisted back onto the (possibly builtin, read-only) template.
function mergeVocab(tpl: Template): Template {
  const next = structuredClone(tpl);
  for (const section of next.sections) {
    for (const field of section.fields) {
      const rows = vocab.rows(field.key);
      if (rows.length === 0) continue;
      if (field.type === 'tag_structured' && field.groups) {
        for (const g of field.groups) {
          for (const r of rows) {
            if (r.group_label === g.label && !g.options.includes(r.term)) g.options.push(r.term);
          }
        }
      } else if (field.type === 'single_select' || field.type === 'multi_select') {
        field.options = field.options ?? [];
        for (const r of rows) {
          if (r.group_label == null && !field.options.includes(r.term)) field.options.push(r.term);
        }
      }
    }
  }
  return next;
}

// Rebuild a Template from a note's pinned snapshot — the fallback when editing a
// note whose live template was deleted, so the grid still renders exactly as saved.
function snapshotToTemplate(note: Note): Template {
  const snap = note.template_snapshot;
  return {
    ...newBase(),
    id: snap.template_id,
    name: snap.name,
    version: snap.version,
    kind: 'custom',
    is_builtin: false,
    sections: snap.sections,
  };
}

// emptyFlight lives in flights/FlightForm; re-declared minimally here to avoid a
// circular import (capture → flights → capture).
function newFlight(eventId: string | null, blind: boolean): Flight {
  return { ...newBase(), event_id: eventId, name: '', blind, general_notes: '', note_ids: [] };
}

function PhotoButton({ onAdd }: { onAdd: (files: FileList | null) => void }) {
  return (
    <label className="btn btn--ghost capture-photo-btn" title="Add a photo">
      <Camera size={16} aria-hidden />
      <span>Photo</span>
      <input
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onAdd(e.target.files);
          e.target.value = '';
        }}
      />
    </label>
  );
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
        <Camera size={20} aria-hidden />
        <input
          type="file"
          accept="image/*"
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
  const url = usePhotoUrl(photo);
  return (
    <div className="photo-thumb" style={url ? { backgroundImage: `url(${url})` } : undefined}>
      <button className="photo-del" onClick={onRemove} aria-label="Remove photo">✕</button>
    </div>
  );
}
