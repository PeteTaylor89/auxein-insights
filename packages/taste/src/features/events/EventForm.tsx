import { useEffect, useState } from 'react';
import { newBase, repo } from '@/db';
import type { TasteEvent, Template } from '@/db';

export function emptyEvent(): TasteEvent {
  return {
    ...newBase(),
    name: '',
    date: null,
    location_text: '',
    host: '',
    attendees: [],
    theme: '',
    general_notes: '',
    default_blind: false,
    default_template_id: null,
  };
}

interface Props {
  draft: TasteEvent;
  onSave: (event: TasteEvent) => void | Promise<void>;
  onCancel: () => void;
}

// Event = a tasting occasion. Carries occasion-level notes plus defaults
// (blind on/off, grid) that capture pre-fills when the event is selected.
export function EventForm({ draft, onSave, onCancel }: Props) {
  const [ev, setEv] = useState<TasteEvent>(draft);
  const [attendeeDraft, setAttendeeDraft] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void repo.templates.list().then((all) => {
      all.sort((a, b) => Number(b.is_builtin) - Number(a.is_builtin) || a.name.localeCompare(b.name));
      setTemplates(all);
    });
  }, []);

  const set = <K extends keyof TasteEvent>(key: K, value: TasteEvent[K]) =>
    setEv((e) => ({ ...e, [key]: value }));

  const addAttendee = () => {
    const a = attendeeDraft.trim();
    if (a && !ev.attendees.includes(a)) set('attendees', [...ev.attendees, a]);
    setAttendeeDraft('');
  };

  const submit = () => {
    if (!ev.name.trim()) {
      setError('Give the event a name.');
      return;
    }
    void onSave({ ...ev, name: ev.name.trim(), location_text: ev.location_text.trim(), host: ev.host.trim() });
  };

  return (
    <section className="screen">
      <div className="builder-head">
        <h1 className="screen-title">{draft.version > 0 ? 'Edit event' : 'New event'}</h1>
        <div className="template-card-tools">
          <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
          <button className="btn" onClick={submit}>Save</button>
        </div>
      </div>

      <div className="grid-section">
        <h2 className="grid-section-label">Event</h2>
        <input className="form-input" placeholder="Name (e.g. Otago Pinot lineup)" value={ev.name} onChange={(e) => set('name', e.target.value)} />
        <div className="capture-wine-row">
          <input className="form-input" type="date" value={ev.date ?? ''} onChange={(e) => set('date', e.target.value || null)} />
        </div>
        <input className="form-input" style={{ marginTop: 8 }} placeholder="Location" value={ev.location_text} onChange={(e) => set('location_text', e.target.value)} />
        <input className="form-input" style={{ marginTop: 8 }} placeholder="Host" value={ev.host} onChange={(e) => set('host', e.target.value)} />
        <input className="form-input" style={{ marginTop: 8 }} placeholder="Theme" value={ev.theme} onChange={(e) => set('theme', e.target.value)} />
      </div>

      <div className="grid-section">
        <h2 className="grid-section-label">Attendees</h2>
        <div className="chip-row">
          {ev.attendees.map((a) => (
            <button key={a} type="button" className="chip chip--active" onClick={() => set('attendees', ev.attendees.filter((x) => x !== a))}>
              {a} ✕
            </button>
          ))}
        </div>
        <div className="capture-wine-row">
          <input
            className="form-input"
            placeholder="Add attendee…"
            value={attendeeDraft}
            onChange={(e) => setAttendeeDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addAttendee();
              }
            }}
          />
          <button className="btn btn--ghost" onClick={addAttendee}>Add</button>
        </div>
      </div>

      <div className="grid-section">
        <h2 className="grid-section-label">Defaults</h2>
        <label className="toggle-row">
          <input type="checkbox" checked={ev.default_blind} onChange={(e) => set('default_blind', e.target.checked)} />
          <span>Taste blind by default</span>
        </label>
        <label className="field-label-block">
          <span className="grid-field-help">Default grid</span>
          <select className="form-input form-select" value={ev.default_template_id ?? ''} onChange={(e) => set('default_template_id', e.target.value || null)}>
            <option value="">— none —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid-section">
        <h2 className="grid-section-label">Notes</h2>
        <textarea
          className="form-input"
          rows={4}
          placeholder="Occasion notes — context, theme, who brought what…"
          value={ev.general_notes}
          onChange={(e) => set('general_notes', e.target.value)}
        />
      </div>

      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
