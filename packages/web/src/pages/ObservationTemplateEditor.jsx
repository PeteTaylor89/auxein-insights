// pages/ObservationTemplateEditor.jsx — Build and edit observation templates.
//
// Greystone beta (Observation Templates): "the ability to create our own new
// templates would be really handy."
//
// The backend already had full CRUD for these — list, create, fetch, patch and
// a soft delete that flips is_active. Nothing server-side was missing; there was
// simply no UI, so companies were stuck with the system templates.
//
// A template is a name, a type, and an ordered list of fields. RunCapture.jsx
// and mobile's SpotCaptureScreen both render those fields generically from
// fields_json, so anything built here works in capture immediately — there is no
// per-template rendering code to add.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Plus, Trash2, ArrowUp, ArrowDown, Save, ArrowLeft, Loader2, GripVertical,
} from 'lucide-react';
import { observationService, authService } from '@vineyard/shared';
import { useToast } from '../components/ToastProvider';
import './ObservationTemplateEditor.css';

// Mirrors FieldType in backend/schemas/observations.py. Keep in step — the API
// rejects anything outside this list.
const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'integer', label: 'Whole number' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'select', label: 'Choose one' },
  { value: 'multiselect', label: 'Choose many' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'datetime', label: 'Date & time' },
];

// observation_type is required by the API but is NOT exposed in this editor.
// It exists to tell Insights which view can read a template's results, and the
// set of types is fixed by what Insights has been built to handle — letting
// someone pick one here would imply their custom template joins that view,
// which it doesn't. Custom templates are therefore always "other", and the
// editor says so plainly instead. An existing template's type is preserved on
// edit rather than being rewritten to "other".
const DEFAULT_OBSERVATION_TYPE = 'other';

const TYPES_WITH_OPTIONS = ['select', 'multiselect'];

/** Machine name from a label: "Cane count" -> "cane_count". */
const slugify = (label) => label
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 50);

const blankField = () => ({
  name: '',
  label: '',
  type: 'text',
  required: false,
  help_text: '',
  unit: '',
  options: [],
});

export default function ObservationTemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isEdit = Boolean(id);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // Not user-editable — see DEFAULT_OBSERVATION_TYPE. Held in state only so an
  // edit round-trips whatever the template already had.
  const [observationType, setObservationType] = useState(DEFAULT_OBSERVATION_TYPE);
  const [fields, setFields] = useState([blankField()]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!isEdit) return;
    try {
      setLoading(true);
      const tpl = await observationService.getTemplate(id);
      setName(tpl.name || '');
      setDescription(tpl.description || '');
      setObservationType(tpl.observation_type || DEFAULT_OBSERVATION_TYPE);
      const loaded = Array.isArray(tpl.field_schema) ? tpl.field_schema : [];
      setFields(loaded.length > 0
        ? loaded.map(f => ({ ...blankField(), ...f, options: f.options || [] }))
        : [blankField()]);
    } catch (err) {
      console.error('Failed to load template:', err);
      setError('Could not load that template');
    } finally {
      setLoading(false);
    }
  }, [id, isEdit]);

  useEffect(() => { load(); }, [load]);

  const updateField = (index, patch) => {
    setFields(prev => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const moveField = (index, delta) => {
    setFields(prev => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeField = (index) => {
    setFields(prev => (prev.length === 1 ? [blankField()] : prev.filter((_, i) => i !== index)));
  };

  const validate = () => {
    if (!name.trim()) return 'Give the template a name.';
    const usable = fields.filter(f => f.label.trim());
    if (usable.length === 0) return 'Add at least one field.';

    const names = new Set();
    for (const f of usable) {
      const machineName = f.name.trim() || slugify(f.label);
      if (!machineName) return `Field "${f.label}" needs a usable name.`;
      // Duplicate names would silently overwrite each other in the captured
      // JSON, so this has to be an error rather than a warning.
      if (names.has(machineName)) return `Two fields resolve to the same name "${machineName}". Rename one.`;
      names.add(machineName);
      if (TYPES_WITH_OPTIONS.includes(f.type) && (f.options || []).length === 0) {
        return `"${f.label}" is a choice field, so it needs at least one option.`;
      }
    }
    return null;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const problem = validate();
    if (problem) { setError(problem); return; }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        observation_type: observationType,
        field_schema: fields
          .filter(f => f.label.trim())
          .map(f => ({
            name: f.name.trim() || slugify(f.label),
            label: f.label.trim(),
            type: f.type,
            required: Boolean(f.required),
            help_text: f.help_text?.trim() || null,
            unit: f.unit?.trim() || null,
            options: TYPES_WITH_OPTIONS.includes(f.type)
              ? f.options.map(o => ({ value: o.value, label: o.label }))
              : null,
          })),
        is_active: true,
      };

      if (isEdit) {
        await observationService.updateTemplate(id, payload);
        toast.success('Template updated');
      } else {
        // company_id is required by ObservationTemplateCreate.
        await observationService.createTemplate({
          ...payload,
          company_id: authService.getCompanyId(),
        });
        toast.success('Template created');
      }
      navigate('/observations?tab=templates');
    } catch (err) {
      console.error('Failed to save template:', err);
      const detail = err?.response?.data?.detail;
      setError(Array.isArray(detail) ? (detail[0]?.msg || 'Save failed') : (detail || 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="ote-page"><div className="ote-loading"><Loader2 size={18} className="ote-spin" /> Loading template…</div></div>;
  }

  return (
    <div className="ote-page">
      <div className="ote-header">
        <button className="ote-back" onClick={() => navigate('/observations?tab=templates')}>
          <ArrowLeft size={16} /> Templates
        </button>
        <h1 className="ote-title">{isEdit ? 'Edit template' : 'New observation template'}</h1>
      </div>

      {isEdit && (
        <div className="alert alert--info ote-alert">
          Editing the fields bumps the template version. Observations already captured keep the
          shape they were recorded with — they are not rewritten.
        </div>
      )}

      {error && <div className="alert alert--danger ote-alert">{error}</div>}

      <form onSubmit={handleSave}>
        <section className="ote-card">
          <h2 className="ote-card-title">Template</h2>

          <div className="form-group">
            <label className="form-label">Name *</label>
            <input
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Powdery mildew scout"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <input
              className="form-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — what this template is for"
            />
          </div>

          <div className="alert alert--info ote-alert ote-insights-note">
            <strong>Custom templates don't feed Insights automatically.</strong>
            <span>
              Insights views are built against specific observation types, so a template you
              create here captures and stores its data but won't appear in an Insights chart
              until a view is built for it. Everything else — scheduling, capture on web and
              mobile, and the observation record — works normally.
            </span>
          </div>
        </section>

        <section className="ote-card">
          <div className="ote-card-head">
            <h2 className="ote-card-title">Fields</h2>
            <span className="ote-field-count">{fields.filter(f => f.label.trim()).length}</span>
          </div>

          {fields.map((field, index) => (
            <div key={index} className="ote-field">
              <div className="ote-field-head">
                <GripVertical size={14} className="ote-field-grip" />
                <span className="ote-field-index">Field {index + 1}</span>
                <div className="ote-field-tools">
                  <button type="button" className="ote-icon-btn" onClick={() => moveField(index, -1)} disabled={index === 0} title="Move up">
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" className="ote-icon-btn" onClick={() => moveField(index, 1)} disabled={index === fields.length - 1} title="Move down">
                    <ArrowDown size={14} />
                  </button>
                  <button type="button" className="ote-icon-btn ote-icon-btn--danger" onClick={() => removeField(index)} title="Remove field">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="ote-field-grid">
                <div className="form-group">
                  <label className="form-label">Label *</label>
                  <input
                    className="form-input"
                    value={field.label}
                    onChange={(e) => updateField(index, { label: e.target.value })}
                    placeholder="What the person in the vineyard sees"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select
                    className="form-input"
                    value={field.type}
                    onChange={(e) => updateField(index, { type: e.target.value })}
                  >
                    {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Unit</label>
                  <input
                    className="form-input"
                    value={field.unit || ''}
                    onChange={(e) => updateField(index, { unit: e.target.value })}
                    placeholder="mm, %, count…"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Help text</label>
                  <input
                    className="form-input"
                    value={field.help_text || ''}
                    onChange={(e) => updateField(index, { help_text: e.target.value })}
                    placeholder="Optional guidance"
                  />
                </div>
              </div>

              {TYPES_WITH_OPTIONS.includes(field.type) && (
                <div className="ote-options">
                  <label className="form-label">Options</label>
                  {(field.options || []).map((opt, oi) => (
                    <div key={oi} className="ote-option-row">
                      <input
                        className="form-input"
                        value={opt.label}
                        onChange={(e) => {
                          const next = [...field.options];
                          // Value tracks the label unless it's been set apart —
                          // one input is plenty for the people writing these.
                          next[oi] = { label: e.target.value, value: slugify(e.target.value) };
                          updateField(index, { options: next });
                        }}
                        placeholder={`Option ${oi + 1}`}
                      />
                      <button
                        type="button"
                        className="ote-icon-btn ote-icon-btn--danger"
                        onClick={() => updateField(index, { options: field.options.filter((_, i) => i !== oi) })}
                        title="Remove option"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="ote-btn ote-btn--ghost"
                    onClick={() => updateField(index, { options: [...(field.options || []), { label: '', value: '' }] })}
                  >
                    <Plus size={14} /> Add option
                  </button>
                </div>
              )}

              <label className="ote-checkbox">
                <input
                  type="checkbox"
                  checked={Boolean(field.required)}
                  onChange={(e) => updateField(index, { required: e.target.checked })}
                />
                Required
              </label>
            </div>
          ))}

          <button
            type="button"
            className="ote-btn ote-btn--ghost ote-add-field"
            onClick={() => setFields(prev => [...prev, blankField()])}
          >
            <Plus size={14} /> Add field
          </button>
        </section>

        <div className="ote-actions">
          <button type="button" className="ote-btn ote-btn--ghost" onClick={() => navigate('/observations?tab=templates')}>
            Cancel
          </button>
          <button type="submit" className="ote-btn ote-btn--primary" disabled={saving}>
            {saving ? <><Loader2 size={14} className="ote-spin" /> Saving…</> : <><Save size={14} /> {isEdit ? 'Save changes' : 'Create template'}</>}
          </button>
        </div>
      </form>
    </div>
  );
}
