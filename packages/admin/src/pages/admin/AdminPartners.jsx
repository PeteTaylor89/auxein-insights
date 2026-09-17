// src/pages/admin/AdminPartners.jsx — partner API clients, keys and grants.
//
// The write side of `/api/v1/partner/*`. Until this page existed every key was
// a hand-written SQL insert, and the first mistake would have been invisible
// until a partner read something they did not buy.
//
// ## Why the endpoint grid is a MATRIX, not a form per key
//
// The question an admin actually has is "do these two keys differ, and where".
// A form per key makes that answerable only by remembering what the last one
// said. Endpoints as rows and keys as columns puts the drift on screen.
//
// ## Two levels, and the grey state carries meaning
//
// The CLIENT holds what was sold (`entitled_endpoints`); the KEY holds the
// operational toggle. A checkbox for something the client never bought is
// disabled, not just unticked — "not sold" and "switched off" are different
// sentences, and the difference is the upsell conversation. The server refuses
// it too (422); this is the courtesy, not the enforcement.
//
// ## The secret appears once
//
// `KeyRevealModal` is the only irreversible moment on this page, so it is the
// only one that blocks: no click-outside, no Escape, and an explicit
// acknowledgement before it closes. Everything else here is editable.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyRound, Plus, RefreshCw, Ban, AlertTriangle, Copy, Check, Loader,
  ShieldCheck, Activity, X,
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { adminPartnerService } from '../../services/adminService';
import './AdminPartners.css';

/** Pull a readable message out of a FastAPI detail, which may be a dict. */
const errorText = (e, fallback) => {
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object' && d.message) return d.message;
  if (Array.isArray(d) && d[0]?.msg) return d[0].msg;
  return fallback;
};

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-NZ', {
  day: 'numeric', month: 'short', year: 'numeric',
}) : '—');

const fmtWhen = (v) => {
  if (!v) return 'never';
  const diff = Date.now() - new Date(v).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

const fmtBytes = (n) => {
  if (n === null || n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
};

const fmtNum = (n) => (n === null || n === undefined
  ? '—' : n.toLocaleString('en-NZ'));

// ---------------------------------------------------------------------------

/**
 * The one irreversible moment on this page.
 *
 * Deliberately NOT dismissable by clicking outside or pressing Escape. The
 * secret is not stored anywhere and cannot be recovered, so an accidental
 * dismissal costs a rotation and a support round trip.
 */
function KeyRevealModal({ payload, onClose }) {
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payload.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the key is selectable in the field either way.
      setCopied(false);
    }
  };

  return (
    <div className="pk-modal__scrim" role="dialog" aria-modal="true">
      <div className="pk-modal">
        <div className="pk-modal__head">
          <KeyRound size={18} />
          <h2>Your new API key</h2>
        </div>

        <div className="pk-modal__warn">
          <AlertTriangle size={16} />
          <span>{payload.warning}</span>
        </div>

        <div className="pk-modal__key">
          <code>{payload.key}</code>
          <button type="button" onClick={copy} className="pk-btn pk-btn--ghost">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <label className="pk-modal__ack">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          <span>I have saved this key somewhere safe.</span>
        </label>

        <div className="pk-modal__foot">
          <button
            type="button"
            className="pk-btn pk-btn--primary"
            disabled={!acknowledged}
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function NewClientForm({ endpoints, onCreate, onCancel, busy }) {
  const [form, setForm] = useState({
    name: '', slug: '', contact_email: '', environment: 'live',
    site_cap: '', history_from: '', contract_end: '',
  });
  const [entitled, setEntitled] = useState(() => new Set());

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggle = (key) => setEntitled((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const submit = (e) => {
    e.preventDefault();
    onCreate({
      ...form,
      contact_email: form.contact_email || null,
      site_cap: form.site_cap === '' ? null : Number(form.site_cap),
      history_from: form.history_from || null,
      contract_end: form.contract_end || null,
      entitled_endpoints: [...entitled],
    });
  };

  return (
    <form className="pk-card pk-newclient" onSubmit={submit}>
      <h3>New partner client</h3>
      <div className="pk-grid">
        <label>Name
          <input value={form.name} onChange={set('name')} required />
        </label>
        <label>Slug
          <input
            value={form.slug}
            onChange={set('slug')}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            required
          />
          {/* The slug is not cosmetic: partner sites are resolved through the
              `insights_account` with the SAME slug, so this has to match the
              account that holds them. */}
          <small>Must match the Insights account slug that holds their sites.</small>
        </label>
        <label>Contact email
          <input type="email" value={form.contact_email} onChange={set('contact_email')} />
        </label>
        <label>Environment
          <select value={form.environment} onChange={set('environment')}>
            <option value="live">live</option>
            <option value="test">test (sandbox)</option>
          </select>
        </label>
        <label>Site cap
          <input
            type="number"
            min="0"
            value={form.site_cap}
            onChange={set('site_cap')}
            placeholder="blank = unlimited"
          />
        </label>
        <label>History from
          <input type="date" value={form.history_from} onChange={set('history_from')} />
          <small>Blank = no floor.</small>
        </label>
        <label>Contract ends
          <input type="date" value={form.contract_end} onChange={set('contract_end')} />
          <small>Past this date every key stops working.</small>
        </label>
      </div>

      <div className="pk-newclient__ents">
        <span className="pk-label">Sold endpoints</span>
        <div className="pk-chips">
          {endpoints.map((ep) => (
            <button
              type="button"
              key={ep.key}
              className={`pk-chip${entitled.has(ep.key) ? ' is-on' : ''}`}
              onClick={() => toggle(ep.key)}
            >
              {ep.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pk-actions">
        <button type="button" className="pk-btn pk-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="pk-btn pk-btn--primary" disabled={busy}>
          {busy ? <Loader size={14} className="pk-spin" /> : <Plus size={14} />}
          Create
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

function EndpointMatrix({ endpoints, keys, entitled, onToggle, saving }) {
  const live = keys.filter((k) => k.is_active);
  if (!live.length) {
    return <p className="pk-empty">No active keys. Create one to grant endpoints.</p>;
  }

  return (
    <div className="pk-matrix__wrap">
      <table className="pk-matrix">
        <thead>
          <tr>
            <th className="pk-matrix__ep">Endpoint</th>
            {live.map((k) => (
              <th key={k.id} className="pk-matrix__key">
                <span className="pk-matrix__keylabel">{k.label}</span>
                <code>{k.key_prefix}</code>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {endpoints.map((ep) => {
            const sold = entitled.includes(ep.key);
            return (
              <tr key={ep.key} className={sold ? undefined : 'is-unsold'}>
                <th scope="row">
                  <span>{ep.label}</span>
                  <code>{ep.key}</code>
                </th>
                {live.map((k) => (
                  <td key={k.id}>
                    <input
                      type="checkbox"
                      checked={!!k.grants?.[ep.key]}
                      disabled={!sold || saving}
                      onChange={(e) => onToggle(k.id, ep.key, e.target.checked)}
                      /* Disabled means NOT SOLD, which is a different fact from
                         unticked. The title says which, because a disabled
                         checkbox with no explanation reads as a bug. */
                      title={sold ? ep.label
                        : 'Not in this client’s contract — add it to the '
                          + 'client’s sold endpoints first.'}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="pk-matrix__note">
        Greyed rows are not in this client’s contract. Edit the client to sell them.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function KeyRow({ k, onRotate, onRevoke, busy }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <tr className={k.is_active ? undefined : 'is-revoked'}>
      <td>
        <div className="pk-key__label">{k.label}</div>
        <code className="pk-key__masked">{k.masked}</code>
      </td>
      <td>{fmtDate(k.created_at)}</td>
      <td className={k.last_used_at ? undefined : 'pk-muted'}>
        {fmtWhen(k.last_used_at)}
      </td>
      <td>
        {k.is_active
          ? <span className="pk-pill pk-pill--ok">active</span>
          : <span className="pk-pill pk-pill--off">revoked</span>}
      </td>
      <td className="pk-key__actions">
        {k.is_active && (
          <>
            <button
              type="button"
              className="pk-btn pk-btn--ghost"
              onClick={() => onRotate(k.id)}
              disabled={busy}
              title="Issue a replacement with the same grants. Both stay active."
            >
              <RefreshCw size={13} /> Rotate
            </button>
            {confirming ? (
              <>
                <button
                  type="button"
                  className="pk-btn pk-btn--danger"
                  onClick={() => { setConfirming(false); onRevoke(k.id); }}
                  disabled={busy}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  className="pk-btn pk-btn--ghost"
                  onClick={() => setConfirming(false)}
                >
                  <X size={13} />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="pk-btn pk-btn--ghost"
                onClick={() => setConfirming(true)}
                disabled={busy}
              >
                <Ban size={13} /> Revoke
              </button>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------

export default function AdminPartners() {
  const [clients, setClients] = useState(null);
  const [endpoints, setEndpoints] = useState([]);
  const [pepperDerived, setPepperDerived] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reveal, setReveal] = useState(null);

  const loadClients = useCallback(async () => {
    try {
      const data = await adminPartnerService.listClients();
      setClients(data.clients);
      setEndpoints(data.endpoints);
      setPepperDerived(!!data.pepper_is_derived);
      if (data.clients.length && selectedId === null) {
        setSelectedId(data.clients[0].id);
      }
    } catch (e) {
      setError(errorText(e, 'Could not load partner clients.'));
    }
  }, [selectedId]);

  const loadDetail = useCallback(async (id) => {
    if (id === null) return;
    try {
      const [d, u] = await Promise.all([
        adminPartnerService.getClient(id),
        adminPartnerService.getUsage(id, 30),
      ]);
      setDetail(d);
      setUsage(u);
    } catch (e) {
      setError(errorText(e, 'Could not load that client.'));
    }
  }, []);

  useEffect(() => { loadClients(); }, [loadClients]);
  useEffect(() => { loadDetail(selectedId); }, [selectedId, loadDetail]);

  const createClient = async (payload) => {
    setBusy(true); setError(null);
    try {
      const created = await adminPartnerService.createClient(payload);
      setCreating(false);
      await loadClients();
      setSelectedId(created.id);
    } catch (e) {
      setError(errorText(e, 'Could not create that client.'));
    } finally { setBusy(false); }
  };

  const createKey = async () => {
    const label = window.prompt('Name this key (e.g. "ETL nightly")');
    if (!label) return;
    setBusy(true); setError(null);
    try {
      const res = await adminPartnerService.createKey(selectedId, { label });
      // The ONLY moment this value exists outside the partner's own store.
      setReveal(res);
      await loadDetail(selectedId);
    } catch (e) {
      setError(errorText(e, 'Could not create that key.'));
    } finally { setBusy(false); }
  };

  const rotateKey = async (keyId) => {
    setBusy(true); setError(null);
    try {
      const res = await adminPartnerService.rotateKey(selectedId, keyId);
      setReveal(res);
      await loadDetail(selectedId);
    } catch (e) {
      setError(errorText(e, 'Could not rotate that key.'));
    } finally { setBusy(false); }
  };

  const revokeKey = async (keyId) => {
    setBusy(true); setError(null);
    try {
      await adminPartnerService.revokeKey(selectedId, keyId);
      await loadDetail(selectedId);
    } catch (e) {
      setError(errorText(e, 'Could not revoke that key.'));
    } finally { setBusy(false); }
  };

  const toggleGrant = async (keyId, endpoint, enabled) => {
    setBusy(true); setError(null);
    // Optimistic: the matrix is a lot of small clicks and a full reload between
    // each one makes it feel broken. The server is still the authority — any
    // failure reloads and the tick reverts.
    setDetail((d) => (d ? {
      ...d,
      keys: d.keys.map((k) => (k.id === keyId
        ? { ...k, grants: { ...k.grants, [endpoint]: enabled } } : k)),
    } : d));
    try {
      await adminPartnerService.setGrants(selectedId, keyId, { [endpoint]: enabled });
    } catch (e) {
      setError(errorText(e, 'Could not change that grant.'));
      await loadDetail(selectedId);
    } finally { setBusy(false); }
  };

  const client = detail?.client;
  const eps = detail?.endpoints || endpoints;

  const activeKeys = useMemo(
    () => (detail?.keys || []).filter((k) => k.is_active).length,
    [detail],
  );

  return (
    <AdminLayout
      title="Partners"
      subtitle="Client organisations with Data API access, their keys, and what each key may call"
    >
      {error && (
        <div className="pk-alert pk-alert--error">
          <AlertTriangle size={16} /><span>{error}</span>
          <button type="button" onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      {pepperDerived && (
        <div className="pk-alert pk-alert--warn">
          <AlertTriangle size={16} />
          <span>
            <strong>PARTNER_KEY_PEPPER is not set.</strong> Keys are hashed with a
            value derived from SECRET_KEY, so rotating SECRET_KEY would invalidate
            every partner key. Set it explicitly before issuing a live key.
          </span>
        </div>
      )}

      <div className="pk-toolbar">
        <div className="pk-tabs">
          {clients?.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`pk-tab${c.id === selectedId ? ' is-active' : ''}`}
              onClick={() => setSelectedId(c.id)}
            >
              {c.name}
              {!c.is_live && <span className="pk-pill pk-pill--off">{c.status}</span>}
              {c.environment === 'test' && <span className="pk-pill">sandbox</span>}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="pk-btn pk-btn--primary"
          onClick={() => setCreating((v) => !v)}
        >
          <Plus size={14} /> New client
        </button>
      </div>

      {creating && (
        <NewClientForm
          endpoints={eps}
          busy={busy}
          onCreate={createClient}
          onCancel={() => setCreating(false)}
        />
      )}

      {clients && clients.length === 0 && !creating && (
        <p className="pk-empty">No partner clients yet.</p>
      )}

      {client && (
        <>
          <section className="pk-card">
            <h3><ShieldCheck size={16} /> Contract</h3>
            <dl className="pk-dl">
              <div><dt>Status</dt><dd>{client.status}{client.is_live ? '' : ' — not serving'}</dd></div>
              <div><dt>Environment</dt><dd>{client.environment}</dd></div>
              <div><dt>Term</dt><dd>{fmtDate(client.contract_start)} → {fmtDate(client.contract_end)}</dd></div>
              <div><dt>Contact</dt><dd>{client.contact_email || '—'}</dd></div>
              <div>
                <dt>Sites</dt>
                <dd>
                  {fmtNum(client.sites_in_use)}
                  {client.site_cap === null ? ' (uncapped)' : ` of ${fmtNum(client.site_cap)}`}
                </dd>
              </div>
              <div><dt>History from</dt><dd>{client.history_from ? fmtDate(client.history_from) : 'no floor'}</dd></div>
            </dl>
            {!client.account_exists && (
              <div className="pk-alert pk-alert--warn pk-alert--inline">
                <AlertTriangle size={16} />
                <span>
                  No Insights account with slug <code>{client.slug}</code>.
                  Partner sites resolve through it, so <code>POST /sites</code>{' '}
                  will refuse until it exists.
                </span>
              </div>
            )}
          </section>

          <section className="pk-card">
            <div className="pk-card__head">
              <h3><KeyRound size={16} /> Keys <span className="pk-count">{activeKeys} active</span></h3>
              <button type="button" className="pk-btn pk-btn--primary" onClick={createKey} disabled={busy}>
                <Plus size={14} /> New key
              </button>
            </div>
            <table className="pk-table">
              <thead>
                <tr><th>Key</th><th>Created</th><th>Last used</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {detail.keys.map((k) => (
                  <KeyRow key={k.id} k={k} busy={busy}
                          onRotate={rotateKey} onRevoke={revokeKey} />
                ))}
              </tbody>
            </table>
            {detail.keys.length === 0 && <p className="pk-empty">No keys yet.</p>}
          </section>

          <section className="pk-card">
            <h3>Endpoints</h3>
            <EndpointMatrix
              endpoints={eps}
              keys={detail.keys}
              entitled={client.entitled_endpoints}
              onToggle={toggleGrant}
              saving={busy}
            />
          </section>

          {usage && (
            <section className="pk-card">
              <h3><Activity size={16} /> Usage — last {usage.days} days</h3>
              <div className="pk-stats">
                <div><span>{fmtNum(usage.totals.requests)}</span><small>requests</small></div>
                <div><span>{fmtNum(usage.totals.rows)}</span><small>rows</small></div>
                <div><span>{fmtNum(usage.totals.objects)}</span><small>objects</small></div>
                <div><span>{fmtBytes(usage.totals.bytes)}</span><small>transferred</small></div>
              </div>
              {usage.per_key.length > 0 && (
                <table className="pk-table pk-table--compact">
                  <thead>
                    <tr><th>Key</th><th>Requests</th><th>Rows</th><th>Objects</th><th>Bytes</th><th>Last</th></tr>
                  </thead>
                  <tbody>
                    {usage.per_key.map((r) => (
                      <tr key={r.credential_id}>
                        <td>{r.label || <code>{r.key_prefix}</code>}</td>
                        <td>{fmtNum(r.requests)}</td>
                        <td>{fmtNum(r.rows)}</td>
                        <td>{fmtNum(r.objects)}</td>
                        <td>{fmtBytes(r.bytes)}</td>
                        <td>{fmtWhen(r.last_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {usage.refusals.length > 0 && (
                <>
                  {/* What they were REFUSED and why. This is where "they keep
                      hitting a 403 on rasters" becomes visible before it
                      becomes an email. */}
                  <h4 className="pk-subhead">Refusals</h4>
                  <ul className="pk-refusals">
                    {usage.refusals.map((r) => (
                      <li key={r.decision || 'unknown'}>
                        <code>{r.decision || 'unknown'}</code>
                        <span>{fmtNum(r.n)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
        </>
      )}

      {reveal && <KeyRevealModal payload={reveal} onClose={() => setReveal(null)} />}
    </AdminLayout>
  );
}
