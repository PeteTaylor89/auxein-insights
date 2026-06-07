import { useEffect, useMemo, useState } from 'react';
import { db, meta, newBase, nowIso, repo, uuidv4 } from '@/db';
import type { Note, Photo, Template, Wine } from '@/db';
import type { TemplateSnapshot } from '@/templates/types';
import { GridRenderer } from './GridRenderer';

const CMS_ID = 'builtin-cms-deductive';

// Template-driven note capture (spec §3/§4). Dexie is the system of record:
// the note pins a denormalised template snapshot so it renders unchanged later.
export function CaptureScreen() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [template, setTemplate] = useState<Template | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [generalNotes, setGeneralNotes] = useState('');
  const [producer, setProducer] = useState('');
  const [label, setLabel] = useState('');
  const [vintage, setVintage] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [noteId, setNoteId] = useState(() => uuidv4());
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const all = await repo.templates.list();
      all.sort((a, b) => Number(b.is_builtin) - Number(a.is_builtin) || a.name.localeCompare(b.name));
      setTemplates(all);
      const def = await meta.get<string>('default_template_id');
      const pick = def && all.some((t) => t.id === def) ? def : all.find((t) => t.id === CMS_ID)?.id ?? all[0]?.id ?? '';
      setTemplateId(pick);
      const picked = all.find((t) => t.id === pick);
      setTemplate(picked ? structuredClone(picked) : null);
    })();
  }, []);

  const setValue = (key: string, value: unknown) => setValues((v) => ({ ...v, [key]: value }));

  const changeTemplate = (id: string) => {
    setTemplateId(id);
    const picked = templates.find((t) => t.id === id);
    setTemplate(picked ? structuredClone(picked) : null);
    setValues({}); // values are keyed per-template; start clean
  };

  // "+ add" a descriptor: insert into the live template (builtin or custom) so it
  // persists for future notes, and bump the version. The note's pinned snapshot
  // then includes it too. seedBuiltins() merge-preserves these on a CMS update.
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

  // Photos: local blob first, never block the note (spec §5). Stored straight to
  // Dexie (not the outbox) — they sync later via the presign flow (P9).
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
      const photo: Photo = {
        ...newBase(),
        note_id: noteId,
        blob: file,
        s3_key: null,
        status: 'local',
        width,
        height,
        taken_at: nowIso(),
      };
      await db.photos.put(photo);
      setPhotos((p) => [...p, photo]);
    }
  };

  const removePhoto = async (id: string) => {
    await db.photos.delete(id); // local-only, never synced — hard delete is fine
    setPhotos((p) => p.filter((x) => x.id !== id));
  };

  const save = async () => {
    if (!label.trim() && !producer.trim()) {
      setError('Add a wine name first.');
      return;
    }
    if (!template) {
      setError('Pick a grid.');
      return;
    }

    const wine: Wine = {
      ...newBase(),
      producer: producer.trim(),
      label: label.trim(),
      vintage: vintage ? Number(vintage) : null,
      variety: [],
      geo_country: '',
      geo_region: '',
      geo_subregion_appellation: '',
      geo_vineyard: '',
      geo_ref_id: null,
      price: null,
      source: '',
      abv: null,
    };
    const savedWine = await repo.wines.save(wine);

    const snapshot: TemplateSnapshot = {
      template_id: template.id,
      name: template.name,
      version: template.version,
      sections: template.sections,
    };
    const scoreField = template.sections.flatMap((s) => s.fields).find((f) => f.type === 'score');
    const score = scoreField ? ((values[scoreField.key] as number) ?? null) : null;

    const note: Note = {
      ...newBase(),
      id: noteId,
      wine_id: savedWine.id,
      event_id: null,
      template_id: template.id,
      template_version: template.version,
      template_snapshot: snapshot,
      values,
      general_notes: generalNotes.trim(),
      blind: false,
      revealed: true,
      score,
      flight_id: null,
      flight_position: null,
      photos: photos.map((p) => p.id),
    };
    await repo.notes.save(note);

    // Reset for the next note.
    setValues({});
    setGeneralNotes('');
    setProducer('');
    setLabel('');
    setVintage('');
    setPhotos([]);
    setNoteId(uuidv4());
    setError('');
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  return (
    <section className="screen">
      <div className="capture-head">
        <select className="form-input form-select" value={templateId} onChange={(e) => changeTemplate(e.target.value)}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => void save()}>
          Save note
        </button>
      </div>

      <div className="grid-section">
        <h2 className="grid-section-label">Wine</h2>
        <input className="form-input" placeholder="Producer" value={producer} onChange={(e) => setProducer(e.target.value)} />
        <div className="capture-wine-row">
          <input className="form-input" placeholder="Label / cuvée" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input
            className="form-input"
            type="number"
            placeholder="Vintage"
            value={vintage}
            onChange={(e) => setVintage(e.target.value)}
          />
        </div>
        <PhotoStrip photos={photos} onAdd={addPhotos} onRemove={removePhoto} />
      </div>

      {template ? (
        <GridRenderer sections={template.sections} values={values} onChange={setValue} onAddOption={addOption} />
      ) : (
        <p className="screen-blurb">No grid available.</p>
      )}

      <div className="grid-section">
        <h2 className="grid-section-label">Notes</h2>
        <textarea
          className="form-input"
          rows={4}
          placeholder="General thoughts, winemaker notes, context…"
          value={generalNotes}
          onChange={(e) => setGeneralNotes(e.target.value)}
        />
      </div>

      {error && <p className="form-error">{error}</p>}
      {saved && <div className="toast">Note saved ✓</div>}
    </section>
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
        +
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={(e) => {
            onAdd(e.target.files);
            e.target.value = ''; // allow re-picking the same file
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
      <button className="photo-del" onClick={onRemove} aria-label="Remove photo">
        ✕
      </button>
    </div>
  );
}
