// components/tasks/TaskAssetsPanel.jsx — what a task uses, on the task page.
//
// This is the surface that did not exist. Equipment appeared only in the
// pre-start check, consumables only in the completion dialog, and once a task
// was done nothing anywhere rendered what was actually used — the figure had
// always been recorded and had never been shown.
//
// It is also the only place outside the creation wizard where an asset can be
// attached to a task, which matters more than it sounds: a task created on
// mobile, from a template or by quick-create had no way to gain consumables at
// all, so its completion screen offered nothing to record and its cost was
// structurally zero.
//
// Two rules the panel keeps:
//   * Planned and actual are shown side by side, and a variance is only drawn
//     once there IS an actual. Before completion "planned 20 L" is a plan, not
//     a shortfall.
//   * Cost is rendered only when the API says the caller may see it
//     (`shows_costs`). A missing price shows as "not costed", never $0.00.
import { useCallback, useEffect, useState } from 'react';
import {
  Package, Wrench, Plus, Trash2, AlertTriangle, X, Loader2, ChevronDown, ChevronRight,
} from 'lucide-react';
import { tasksService, assetService } from '@vineyard/shared';
import './TaskAssetsPanel.css';

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

const qty = (v, unit) => {
  const n = num(v);
  if (n === null) return null;
  const s = Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4)));
  return unit ? `${s} ${unit}` : s;
};

const money = (v) => {
  const n = num(v);
  return n === null ? null : `$${n.toFixed(2)}`;
};

export default function TaskAssetsPanel({ taskId, taskStatus, canEdit = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await tasksService.getTaskAssets(taskId));
    } catch (err) {
      console.error('Failed to load task assets', err);
      setError(err?.response?.data?.detail || 'Failed to load materials and equipment');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  const remove = async (item) => {
    setError('');
    try {
      await tasksService.removeTaskAsset(taskId, item.task_asset_id);
      await load();
    } catch (err) {
      // A 409 here is the "already used" guard, and its message explains what
      // to do instead — show it rather than a generic failure.
      setError(err?.response?.data?.detail || 'Could not remove');
    }
  };

  if (loading) return <div className="tap-panel tap-loading">Loading materials and equipment…</div>;

  const assets = data?.assets || [];
  const equipment = assets.filter(a => !a.is_consumable);
  const consumables = assets.filter(a => a.is_consumable);
  const editable = canEdit && data?.can_edit && taskStatus !== 'completed' && taskStatus !== 'cancelled';

  return (
    <div className="tap-panel">
      <button className="tap-head" onClick={() => setOpen(o => !o)}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <h3>Materials &amp; equipment</h3>
        <span className="tap-count">
          {assets.length === 0 ? 'none attached' : `${equipment.length} equipment · ${consumables.length} consumable${consumables.length === 1 ? '' : 's'}`}
        </span>
      </button>

      {open && (
        <div className="tap-body">
          {error && (
            <div className="alert alert--danger tap-alert">
              <AlertTriangle size={14} /><div>{error}</div>
            </div>
          )}

          {assets.length === 0 ? (
            <p className="tap-empty">
              Nothing attached. Add what this task uses so the quantities can be recorded when
              it is completed.
            </p>
          ) : (
            <>
              {equipment.length > 0 && (
                <Section icon={Wrench} title="Equipment">
                  {equipment.map(item => (
                    <EquipmentRow
                      key={item.task_asset_id} item={item}
                      showCosts={data.shows_costs}
                      editable={editable} onRemove={() => remove(item)}
                    />
                  ))}
                </Section>
              )}

              {consumables.length > 0 && (
                <Section icon={Package} title="Consumables">
                  {consumables.map(item => (
                    <ConsumableRow
                      key={item.task_asset_id} item={item}
                      showCosts={data.shows_costs} editable={editable}
                      onRemove={() => remove(item)}
                    />
                  ))}
                </Section>
              )}

              {data.shows_costs && data.consumable_cost_total && (
                <div className="tap-total">
                  <span>Materials used</span>
                  <strong>{money(data.consumable_cost_total)}</strong>
                  {data.uncosted_consumables > 0 && (
                    <span className="tap-total-warn">
                      excludes {data.uncosted_consumables} product{data.uncosted_consumables === 1 ? '' : 's'} with no price
                    </span>
                  )}
                </div>
              )}
            </>
          )}

          {editable && (
            <button className="tap-add" onClick={() => setAdding(true)}>
              <Plus size={14} /> Add equipment or consumable
            </button>
          )}
        </div>
      )}

      {adding && (
        <AddAssetModal
          taskId={taskId}
          attachedIds={assets.map(a => a.asset_id)}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); load(); }}
        />
      )}
    </div>
  );
}

const Section = ({ icon: Icon, title, children }) => (
  <div className="tap-section">
    <div className="tap-section-title"><Icon size={13} /> {title}</div>
    {children}
  </div>
);

function EquipmentRow({ item, showCosts, editable, onRemove }) {
  const hours = num(item.actual_hours);
  return (
    <div className={`tap-row ${item.calibration_overdue ? 'tap-row--warn' : ''}`}>
      <div className="tap-main">
        <span className="tap-name">{item.asset_name}</span>
        {item.asset_number && <span className="tap-sub">{item.asset_number}</span>}
        {item.role && item.role !== 'primary' && <span className="tap-tag">{item.role}</span>}
      </div>
      <div className="tap-figures">
        <span className="tap-fig">
          <span className="tap-fig-label">Hours</span>
          {hours !== null
            ? <strong>{hours}h</strong>
            /* Not "0h": a machine with no hours recorded may well have run. */
            : <span className="tap-pending">not recorded</span>}
        </span>
        {showCosts && hours !== null && (
          item.actual_cost !== null && item.actual_cost !== undefined ? (
            <span className="tap-fig">
              <span className="tap-fig-label">Cost</span>
              <strong>{money(item.actual_cost)}</strong>
            </span>
          ) : (
            <span className="tap-fig">
              <span className="tap-fig-label">Cost</span>
              <span className="tap-pending">no rate set</span>
            </span>
          )
        )}
        {item.calibration_overdue ? (
          <span className="tap-overdue"><AlertTriangle size={12} /> Calibration overdue</span>
        ) : item.requires_calibration ? (
          <span className="tap-ok">Calibrated {item.last_calibration_date || ''}</span>
        ) : null}
      </div>
      {editable && (
        <button className="tap-remove" onClick={onRemove} title="Remove from task">
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

function ConsumableRow({ item, showCosts, editable, onRemove }) {
  const planned = num(item.planned_quantity);
  const actual = num(item.actual_quantity);
  const hasActual = actual !== null;
  // A variance only means something once there is an actual. Before that,
  // "planned 20 L" is a plan, not a shortfall.
  const variance = hasActual && planned !== null ? actual - planned : null;

  return (
    <div className="tap-row">
      <div className="tap-main">
        <span className="tap-name">{item.asset_name}</span>
        {item.batch_number && <span className="tap-sub">batch {item.batch_number}</span>}
      </div>

      <div className="tap-figures">
        {planned !== null && (
          <span className="tap-fig">
            <span className="tap-fig-label">Planned</span>
            {qty(planned, item.unit)}
          </span>
        )}
        <span className="tap-fig">
          <span className="tap-fig-label">Used</span>
          {hasActual
            ? <strong>{qty(actual, item.unit)}</strong>
            : <span className="tap-pending">not yet recorded</span>}
        </span>
        {variance !== null && Math.abs(variance) > 1e-9 && (
          <span className={`tap-var ${variance > 0 ? 'tap-var--over' : 'tap-var--under'}`}>
            {variance > 0 ? '+' : ''}{qty(variance, item.unit)}
          </span>
        )}
        {showCosts && hasActual && (
          item.actual_cost !== null && item.actual_cost !== undefined ? (
            <span className="tap-fig">
              <span className="tap-fig-label">Cost</span>
              <strong>{money(item.actual_cost)}</strong>
              {item.unit_cost && <span className="tap-sub"> @ {money(item.unit_cost)}/{item.unit || 'unit'}</span>}
            </span>
          ) : (
            // Never $0.00 — an unpriced product is not a free one.
            <span className="tap-fig">
              <span className="tap-fig-label">Cost</span>
              <span className="tap-pending">not costed</span>
            </span>
          )
        )}
      </div>

      {editable && (
        <button className="tap-remove" onClick={onRemove} title="Remove from task">
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function AddAssetModal({ taskId, attachedIds, onClose, onAdded }) {
  const [kind, setKind] = useState('consumable');
  const [options, setOptions] = useState([]);
  const [assetId, setAssetId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setAssetId('');
      try {
        const list = await assetService.listAssets({
          asset_type: kind === 'consumable' ? 'consumable' : 'physical',
          limit: 500,
        });
        if (!alive) return;
        // Already-attached assets are filtered out: the endpoint upserts on
        // (task, asset), so offering one again would silently overwrite the
        // planned quantity rather than adding a line.
        setOptions((Array.isArray(list) ? list : []).filter(a => !attachedIds.includes(a.id)));
      } catch (e) {
        if (alive) setErr('Could not load assets');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [kind, attachedIds]);

  const chosen = options.find(o => String(o.id) === String(assetId));

  const save = async () => {
    setSaving(true);
    setErr('');
    try {
      await tasksService.addTaskAsset(taskId, {
        asset_id: Number(assetId),
        asset_type: kind,
        is_required: true,
        ...(kind === 'consumable' && quantity !== '' ? { quantity: Number(quantity) } : {}),
      });
      onAdded();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not add');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tap-backdrop" onClick={onClose}>
      <div className="tap-modal" onClick={e => e.stopPropagation()}>
        <div className="tap-modal-head">
          <h3>Add to task</h3>
          <button className="tap-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="tap-modal-body">
          <div className="tap-kind">
            {['consumable', 'equipment'].map(k => (
              <button
                key={k}
                className={`tap-kind-btn ${kind === k ? 'active' : ''}`}
                onClick={() => setKind(k)}
              >
                {k === 'consumable' ? <Package size={14} /> : <Wrench size={14} />}
                {k === 'consumable' ? 'Consumable' : 'Equipment'}
              </button>
            ))}
          </div>

          <label className="tap-field">
            <span className="tap-label">{kind === 'consumable' ? 'Product' : 'Equipment'}</span>
            <select
              className="tap-input" value={assetId}
              onChange={e => setAssetId(e.target.value)} disabled={loading}
            >
              <option value="">{loading ? 'Loading…' : 'Choose…'}</option>
              {options.map(o => (
                <option key={o.id} value={o.id}>
                  {o.name}{o.asset_number ? ` (${o.asset_number})` : ''}
                </option>
              ))}
            </select>
            {!loading && options.length === 0 && (
              <span className="tap-help">
                Nothing left to add — everything of this kind is either already on the task or
                not registered yet.
              </span>
            )}
          </label>

          {kind === 'consumable' && (
            <label className="tap-field">
              <span className="tap-label">
                Planned quantity{chosen?.unit_of_measure ? ` (${chosen.unit_of_measure})` : ''}
              </span>
              <input
                className="tap-input" type="number" step="0.01" min="0"
                value={quantity} onChange={e => setQuantity(e.target.value)}
                placeholder="optional"
              />
              <span className="tap-help">
                A starting figure for the completion screen. What was actually used is recorded
                there and can differ.
              </span>
            </label>
          )}

          {err && <div className="alert alert--danger tap-alert"><AlertTriangle size={14} /><div>{err}</div></div>}
        </div>

        <div className="tap-modal-actions">
          <button className="tap-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="tap-btn tap-btn--primary" onClick={save} disabled={!assetId || saving}>
            {saving ? <><Loader2 size={14} className="tap-spin" /> Adding…</> : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
