// maps-v2/components/MapFeatureTypeManager.jsx — manage the POI vocabulary.
//
// Create, rename, recolour, re-icon and retire a company's map types. The
// built-in five are shown but locked: they are shared across every company, and
// the API refuses to change them, so the UI should not pretend otherwise.
//
// RETIRING IS NOT DELETING. A retired type leaves the picker but keeps drawing
// and keeps its legend row, because features already carry its slug. The copy
// says so — "removed" would be a lie, and the person clicking it is usually
// tidying, not destroying.
import { useState } from 'react';
import { X, Plus, Loader, Check, Pencil, Trash2, Lock, RotateCcw } from 'lucide-react';

import PoiIconPicker, { PoiMarkerPreview } from './PoiIconPicker';
import { POI_COLOURS, POI_ICON_KEYS } from '../utils/mapIcons';
import './MapFeatureTypeManager.css';

const BLANK = { label: '', icon: POI_ICON_KEYS[0], colour: POI_COLOURS[0].value };

/**
 * @param {boolean} props.isOpen
 * @param {Object} props.vocabulary  the useMapFeatureTypes(...) return value
 * @param {boolean} props.canManage  manager+ — read-only view otherwise
 * @param {string|null} props.seedLabel  prefill for inline "New type…" from the form
 * @param {Function} props.onCreated  (row) => void — lets the caller select it
 * @param {Function} props.onClose
 */
export default function MapFeatureTypeManager({
  isOpen,
  vocabulary,
  canManage = false,
  seedLabel = null,
  onCreated,
  onClose,
}) {
  const { types, createType, updateType, retireType } = vocabulary;

  const [draft, setDraft] = useState({ ...BLANK, label: seedLabel || '' });
  const [creating, setCreating] = useState(!!seedLabel);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const systemTypes = types.filter((t) => t.is_system || t.company_id === null);
  const ownTypes = types.filter((t) => !(t.is_system || t.company_id === null));

  const fail = (err, fallback) => {
    console.error(fallback, err);
    setError(err?.response?.data?.detail || err.message || fallback);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!draft.label.trim()) {
      setError('Give the type a name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const row = await createType({
        label: draft.label.trim(),
        icon: draft.icon,
        colour: draft.colour,
      });
      setDraft({ ...BLANK });
      setCreating(false);
      onCreated?.(row);
    } catch (err) {
      fail(err, 'Could not create that type');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditDraft({ label: t.label, icon: t.icon, colour: t.colour });
    setError(null);
  };

  const handleSaveEdit = async (t) => {
    setBusy(true);
    setError(null);
    try {
      await updateType(t.id, {
        label: editDraft.label.trim(),
        icon: editDraft.icon,
        colour: editDraft.colour,
      });
      setEditingId(null);
    } catch (err) {
      fail(err, 'Could not save that change');
    } finally {
      setBusy(false);
    }
  };

  const handleRetire = async (t) => {
    setBusy(true);
    setError(null);
    try {
      await retireType(t.id);
    } catch (err) {
      fail(err, 'Could not retire that type');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (t) => {
    setBusy(true);
    setError(null);
    try {
      await updateType(t.id, { is_active: true });
    } catch (err) {
      fail(err, 'Could not restore that type');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="v2-form-panel mft-panel">
      <div className="v2-form-header">
        <h3 className="v2-form-title">Map types</h3>
        <button className="v2-form-close" onClick={onClose} type="button">
          <X size={18} />
        </button>
      </div>

      <div className="v2-form-body mft-body">
        {error && <div className="v2-form-error">{error}</div>}

        {!canManage && (
          <div className="v2-form-info">
            Only managers and admins can change the type list.
          </div>
        )}

        {/* --- this company's own --- */}
        <div className="mft-section">
          <div className="mft-section__head">
            <span className="mft-section__label">Your types</span>
            {canManage && !creating && (
              <button
                type="button"
                className="mft-add"
                onClick={() => { setCreating(true); setError(null); }}
              >
                <Plus size={14} /> New type
              </button>
            )}
          </div>

          {creating && canManage && (
            <form className="mft-create" onSubmit={handleCreate}>
              <input
                className="v2-form-input"
                type="text"
                value={draft.label}
                onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                placeholder="e.g. Cattle stop"
                maxLength={60}
                autoFocus
              />
              <PoiIconPicker
                icon={draft.icon}
                colour={draft.colour}
                onChange={(next) => setDraft((d) => ({ ...d, ...next }))}
                disabled={busy}
              />
              <div className="v2-form-actions mft-actions">
                <button
                  type="button"
                  className="v2-form-btn v2-form-btn--ghost"
                  onClick={() => { setCreating(false); setDraft({ ...BLANK }); setError(null); }}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button type="submit" className="v2-form-btn v2-form-btn--primary" disabled={busy}>
                  {busy ? <Loader size={14} className="v2-spin" /> : <Check size={14} />}
                  Create
                </button>
              </div>
            </form>
          )}

          {ownTypes.length === 0 && !creating && (
            <p className="mft-empty">
              None yet. The five built-in types below cover most things — add your own when
              they do not.
            </p>
          )}

          {ownTypes.map((t) => {
            const retired = t.is_active === false;
            const isEditing = editingId === t.id;
            return (
              <div key={t.id} className={`mft-row${retired ? ' is-retired' : ''}`}>
                {isEditing ? (
                  <div className="mft-edit">
                    <input
                      className="v2-form-input"
                      type="text"
                      value={editDraft.label}
                      onChange={(e) => setEditDraft((d) => ({ ...d, label: e.target.value }))}
                      maxLength={60}
                    />
                    <PoiIconPicker
                      icon={editDraft.icon}
                      colour={editDraft.colour}
                      onChange={(next) => setEditDraft((d) => ({ ...d, ...next }))}
                      disabled={busy}
                    />
                    <p className="mft-note">
                      Renaming changes the label everywhere. Features keep their type — the
                      underlying key never changes, so nothing is orphaned.
                    </p>
                    <div className="v2-form-actions mft-actions">
                      <button
                        type="button"
                        className="v2-form-btn v2-form-btn--ghost"
                        onClick={() => setEditingId(null)}
                        disabled={busy}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="v2-form-btn v2-form-btn--primary"
                        onClick={() => handleSaveEdit(t)}
                        disabled={busy}
                      >
                        {busy ? <Loader size={14} className="v2-spin" /> : <Check size={14} />}
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <PoiMarkerPreview icon={t.icon} colour={t.colour} size={28} />
                    <div className="mft-row__text">
                      <span className="mft-row__label">{t.label}</span>
                      {retired && <span className="mft-row__tag">Retired</span>}
                    </div>
                    {canManage && (
                      <div className="mft-row__actions">
                        {retired ? (
                          <button
                            type="button"
                            className="mft-icon-btn"
                            title="Put back in the picker"
                            onClick={() => handleRestore(t)}
                            disabled={busy}
                          >
                            <RotateCcw size={15} />
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="mft-icon-btn"
                              title="Edit"
                              onClick={() => startEdit(t)}
                              disabled={busy}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              className="mft-icon-btn mft-icon-btn--danger"
                              title="Retire — stops it being offered, keeps existing features"
                              onClick={() => handleRetire(t)}
                              disabled={busy}
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* --- the shared five --- */}
        <div className="mft-section">
          <span className="mft-section__label">Built in</span>
          {systemTypes.map((t) => (
            <div key={t.slug} className="mft-row is-locked">
              <PoiMarkerPreview icon={t.icon} colour={t.colour} size={28} />
              <div className="mft-row__text">
                <span className="mft-row__label">{t.label}</span>
              </div>
              <Lock size={13} className="mft-lock" />
            </div>
          ))}
        </div>

        <p className="mft-note mft-note--foot">
          Hazards are not a map type. They belong in the Risk Register, where they carry
          WorkSafe notifiability — and they already appear on the map with their own marker.
        </p>
      </div>
    </div>
  );
}
