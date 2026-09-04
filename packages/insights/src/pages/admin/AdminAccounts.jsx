// src/pages/admin/AdminAccounts.jsx — enterprise accounts and who can see them.
//
// An account is a client organisation that owns many sites; a member is a named
// person who may open them. Until this page existed there was no way to create
// the second thing at all — `import_account_sites.py` provisions an account and
// its sites and never writes a membership row, so BSI's 67 sites were extracted
// nightly and visible to nobody.
//
// ## Adding a member is an entitlement change, and the page says so
//
// Membership makes someone Pro (`core/entitlements.is_pro` reads it). For a
// colleague on the free tier that is the ONLY thing granting them access, so
// removing them later revokes Insights Pro entirely rather than just hiding one
// page. The server returns `entitled_by_account_only` on add and the member
// list shows each person's own tier, because an admin should never have to
// infer which of those two a removal will do.
import { useCallback, useEffect, useState } from 'react';
import {
  Building2, Plus, Trash2, UserPlus, AlertTriangle, Loader, Check, X,
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { adminAccountService } from '../../services/adminService';
import './AdminAccounts.css';

const ROLE_HELP = {
  owner: 'May manage membership (not yet enforced — reads the same as member today).',
  member: 'May read the account’s sites and portfolio.',
};

/** Pull a readable message out of a FastAPI detail, which may be a dict. */
const errorText = (e, fallback) => {
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object' && d.message) return d.message;
  return fallback;
};

const MemberRow = ({ member, onRole, onRemove, busy }) => {
  const [confirming, setConfirming] = useState(false);
  // A free-tier member holds their access entirely through this account.
  const accountOnly = !['pro', 'grow'].includes(member.subscription_tier);

  return (
    <tr className={busy ? 'is-busy' : undefined}>
      <td>
        <div className="acct-member__name">{member.full_name || '—'}</div>
        <div className="acct-member__email">{member.email}</div>
      </td>
      <td>
        <select
          value={member.role}
          disabled={busy}
          onChange={(e) => onRole(member, e.target.value)}
          title={ROLE_HELP[member.role]}
        >
          <option value="member">Member</option>
          <option value="owner">Owner</option>
        </select>
      </td>
      <td>
        {/* Their OWN tier, which is not what entitles them here. Shown so the
            consequence of a removal is legible before it is made. */}
        {accountOnly ? (
          <span className="acct-tag acct-tag--account" title="Pro through this account only. Removing them revokes Insights Pro, not just the portfolio.">
            via account
          </span>
        ) : (
          <span className="acct-tag acct-tag--own" title="Holds Pro in their own right. Removing them from the account hides the portfolio and nothing else.">
            {member.subscription_tier === 'grow' ? 'Pro · Grow' : 'Pro'}
          </span>
        )}
        {member.pro_site_quota > 0 && (
          <span className="acct-tag acct-tag--quota">
            {member.pro_site_quota} own site{member.pro_site_quota === 1 ? '' : 's'}
          </span>
        )}
      </td>
      <td className="acct-actions">
        {confirming ? (
          <>
            <button className="acct-btn acct-btn--danger" disabled={busy}
                    onClick={() => { setConfirming(false); onRemove(member); }}>
              <Check size={14} /> Remove
            </button>
            <button className="acct-btn" onClick={() => setConfirming(false)}>
              <X size={14} />
            </button>
          </>
        ) : (
          <button className="acct-btn acct-btn--quiet" disabled={busy}
                  onClick={() => setConfirming(true)} title="Remove from account">
            <Trash2 size={14} />
          </button>
        )}
      </td>
    </tr>
  );
};

const AccountPanel = ({ account, onChanged }) => {
  const [members, setMembers] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => {
    adminAccountService.listMembers(account.slug)
      .then(setMembers)
      .catch(() => setError('Could not load members.'));
  }, [account.slug]);

  useEffect(() => { setMembers(null); setError(null); setNotice(null); load(); },
    [load]);

  const add = async (e) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    setAdding(true); setError(null); setNotice(null);
    try {
      const result = await adminAccountService.addMember(account.slug,
        { email: value, role });
      setEmail('');
      load();
      onChanged?.();
      setNotice(result.entitled_by_account_only
        ? `${result.member.email} added. They were not Pro — this membership is now the only thing granting them Insights Pro, and removing it takes it away.`
        : `${result.member.email} added. They already hold Pro in their own right.`);
    } catch (err) {
      setError(errorText(err, 'Could not add that member.'));
    } finally {
      setAdding(false);
    }
  };

  const changeRole = async (member, next) => {
    setBusyId(member.public_user_id);
    try {
      await adminAccountService.updateMember(account.slug, member.public_user_id, next);
      load();
    } catch (err) {
      setError(errorText(err, 'Could not change that role.'));
    } finally { setBusyId(null); }
  };

  const remove = async (member) => {
    setBusyId(member.public_user_id); setNotice(null);
    try {
      await adminAccountService.removeMember(account.slug, member.public_user_id);
      load();
      onChanged?.();
    } catch (err) {
      setError(errorText(err, 'Could not remove that member.'));
    } finally { setBusyId(null); }
  };

  const toggleStatus = async () => {
    const next = account.status === 'active' ? 'suspended' : 'active';
    try {
      await adminAccountService.updateAccount(account.slug, { status: next });
      onChanged?.();
    } catch (err) {
      setError(errorText(err, 'Could not change the account status.'));
    }
  };

  return (
    <section className="acct-panel">
      <header className="acct-panel__head">
        <div>
          <h2>{account.name}</h2>
          <p className="acct-panel__meta">
            <code>{account.slug}</code> · {account.site_count} site
            {account.site_count === 1 ? '' : 's'} · {account.member_count} member
            {account.member_count === 1 ? '' : 's'}
          </p>
        </div>
        <button className="acct-btn" onClick={toggleStatus}>
          {account.status === 'active' ? 'Suspend' : 'Reactivate'}
        </button>
      </header>

      {account.status !== 'active' && (
        <div className="acct-alert acct-alert--warn">
          <AlertTriangle size={16} />
          {/* Suspension is not deletion, and the distinction is the whole point
              of the status column — say it rather than showing a bare word. */}
          <span>
            Suspended. The {account.site_count} sites and their extracted history
            are kept, but every member reads as having no access until this is
            lifted.
          </span>
        </div>
      )}

      {account.member_count === 0 && account.site_count > 0 && (
        <div className="acct-alert acct-alert--warn">
          <AlertTriangle size={16} />
          <span>
            No members. These {account.site_count} sites are being extracted
            nightly and nobody can open them.
          </span>
        </div>
      )}

      <form className="acct-add" onSubmit={add}>
        <input
          type="email"
          value={email}
          placeholder="Email of an existing Insights user"
          onChange={(e) => setEmail(e.target.value)}
          disabled={adding}
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} disabled={adding}>
          <option value="member">Member</option>
          <option value="owner">Owner</option>
        </select>
        <button className="acct-btn acct-btn--primary" type="submit" disabled={adding}>
          {adding ? <Loader size={14} className="spin" /> : <UserPlus size={14} />}
          Add
        </button>
      </form>
      <p className="acct-hint">
        They must already have an Insights login. Membership attaches to an
        existing account; it does not create one.
      </p>

      {error && <div className="acct-alert acct-alert--error"><AlertTriangle size={16} /><span>{error}</span></div>}
      {notice && <div className="acct-alert acct-alert--ok"><Check size={16} /><span>{notice}</span></div>}

      {members === null ? (
        <p className="acct-empty">Loading members…</p>
      ) : members.length === 0 ? (
        <p className="acct-empty">Nobody can see this account yet.</p>
      ) : (
        <table className="acct-table">
          <thead>
            <tr><th>Person</th><th>Role</th><th>Pro via</th><th /></tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <MemberRow
                key={m.public_user_id}
                member={m}
                busy={busyId === m.public_user_id}
                onRole={changeRole}
                onRemove={remove}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};

const AdminAccounts = () => {
  const [accounts, setAccounts] = useState(null);
  const [slug, setSlug] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ slug: '', name: '' });

  const load = useCallback((keep) => {
    adminAccountService.listAccounts()
      .then((list) => {
        setAccounts(list);
        setSlug((current) => keep || current || (list[0]?.slug ?? null));
      })
      .catch(() => setError('Could not load accounts.'));
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const created = await adminAccountService.createAccount({
        slug: form.slug.trim().toLowerCase(), name: form.name.trim(),
      });
      setForm({ slug: '', name: '' });
      setCreating(false);
      load(created.slug);
    } catch (err) {
      setError(errorText(err, 'Could not create that account.'));
    }
  };

  const selected = accounts?.find((a) => a.slug === slug) || null;

  return (
    <AdminLayout
      title="Enterprise accounts"
      subtitle="Client organisations that own sites, and the people who may see them"
    >
      {error && (
        <div className="acct-alert acct-alert--error">
          <AlertTriangle size={16} /><span>{error}</span>
        </div>
      )}

      <div className="acct-toolbar">
        <div className="acct-tabs">
          {accounts?.map((a) => (
            <button
              key={a.slug}
              className={`acct-tab${a.slug === slug ? ' is-active' : ''}`}
              onClick={() => setSlug(a.slug)}
            >
              <Building2 size={14} />
              {a.name}
              <span className="acct-tab__count">{a.member_count}</span>
            </button>
          ))}
        </div>
        <button className="acct-btn" onClick={() => setCreating((v) => !v)}>
          <Plus size={14} /> New account
        </button>
      </div>

      {creating && (
        <form className="acct-create" onSubmit={create}>
          <input
            value={form.name}
            placeholder="Display name, e.g. BSI"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            value={form.slug}
            placeholder="url-slug"
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            required
          />
          <button className="acct-btn acct-btn--primary" type="submit">Create</button>
        </form>
      )}

      {accounts === null && <p className="acct-empty">Loading…</p>}
      {accounts?.length === 0 && (
        <p className="acct-empty">
          No enterprise accounts. Sites are imported with
          {' '}<code>backend/scripts/import_account_sites.py</code>, which creates
          the account; members are added here.
        </p>
      )}
      {selected && (
        <AccountPanel key={selected.slug} account={selected}
                      onChanged={() => load(selected.slug)} />
      )}
    </AdminLayout>
  );
};

export default AdminAccounts;
