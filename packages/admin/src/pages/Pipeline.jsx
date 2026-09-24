// src/pages/Pipeline.jsx — the sales pipeline.
//
// Three kinds of deal on one board, told apart by a badge: a Grow sign-up, an
// Insights Pro upgrade, or an enterprise contract. The board is for moving
// things along (drag a card to a stage); the table is for scanning and sorting.
// Both open the same drawer, which holds the details and the activity log.
//
// Two things arrive by themselves on every load: Insights marketing opt-ins
// become Grow leads, and Pro enquiries become Pro leads. Enterprise deals, and
// anything else, are added by hand.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Loader2, Trash2, LayoutGrid, Table2, Search, AlertTriangle,
  Phone, Mail, Users, Presentation, StickyNote, ArrowRight, Sprout, BellOff,
  Inbox, Star,
} from 'lucide-react';

import pipelineService from '../services/pipelineService';
import AdminLayout from '../components/AdminLayout';
import PlanDrawer from '../components/PlanDrawer';
import { dayLabel, duePhrase, todayKey } from '../utils/planDates';
import '../components/task-detail.css';
import './pipeline.css';

const DEAL_TYPES = [
  { value: 'grow', label: 'Grow' },
  { value: 'insights_pro', label: 'Insights Pro' },
  { value: 'enterprise', label: 'Enterprise' },
];
const TYPE_LABEL = Object.fromEntries(DEAL_TYPES.map((t) => [t.value, t.label]));

const STAGES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'demo', label: 'Demo' },
  { value: 'trial', label: 'Trial' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];
const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.value, s.label]));

const SOURCES = [
  { value: 'insights', label: 'Insights' },
  { value: 'enquiry', label: 'Enquiry' },
  { value: 'referral', label: 'Referral' },
  { value: 'event', label: 'Event' },
  { value: 'website', label: 'Website' },
  { value: 'outbound', label: 'Outbound' },
  { value: 'other', label: 'Other' },
];
const SOURCE_LABEL = Object.fromEntries(SOURCES.map((s) => [s.value, s.label]));

const LOST_REASONS = [
  { value: 'price', label: 'Price' },
  { value: 'timing', label: 'Timing' },
  { value: 'not_a_fit', label: 'Not a fit' },
  { value: 'competitor', label: 'Went elsewhere' },
  { value: 'no_response', label: 'Went quiet' },
  { value: 'other', label: 'Other' },
];
const LOST_LABEL = Object.fromEntries(LOST_REASONS.map((s) => [s.value, s.label]));

const KINDS = [
  { value: 'call', label: 'Call', icon: Phone },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'meeting', label: 'Meeting', icon: Users },
  { value: 'demo', label: 'Demo', icon: Presentation },
  { value: 'note', label: 'Note', icon: StickyNote },
];
const KIND_ICON = { ...Object.fromEntries(KINDS.map((k) => [k.value, k.icon])), enquiry: Inbox };
const KIND_LABEL = { ...Object.fromEntries(KINDS.map((k) => [k.value, k.label])), enquiry: 'Enquiry' };

// What a new hand-added lead of each type most likely came from.
const DEFAULT_SOURCE = { grow: 'referral', insights_pro: 'enquiry', enterprise: 'outbound' };

const NZD = new Intl.NumberFormat('en-NZ', {
  style: 'currency', currency: 'NZD', maximumFractionDigits: 0,
});
const money = (v) => (v == null ? '—' : NZD.format(v));

const DAY_MS = 24 * 60 * 60 * 1000;

/** The totals strip, over whichever type is showing. */
function summarise(leads) {
  const open = leads.filter((l) => l.stage !== 'won' && l.stage !== 'lost');
  const since = Date.now() - 90 * DAY_MS;
  const won90 = leads.filter((l) => l.stage === 'won' && l.closed_at
    && Date.parse(l.closed_at) >= since);
  const won = leads.filter((l) => l.stage === 'won').length;
  const lost = leads.filter((l) => l.stage === 'lost').length;
  const sum = (ls) => ls.reduce((t, l) => t + (l.value_nzd || 0), 0);
  return {
    open: open.length,
    openValue: sum(open),
    overdue: open.filter((l) => l.overdue).length,
    won90: won90.length,
    won90Value: sum(won90),
    // None rather than 0% when nothing has closed — a zero reads as a verdict.
    winRate: won + lost ? Math.round((100 * won) / (won + lost)) : null,
  };
}

const errText = (err, fallback) => err?.response?.data?.detail
  && typeof err.response.data.detail === 'string'
  ? err.response.data.detail : fallback;

/** The name a lead is known by: a person if we have one, else the business. */
function leadTitle(l) {
  return l.contact_name || l.company_name || l.email || `Lead #${l.id}`;
}

export default function Pipeline() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('pipeline.view') || 'board'; } catch { return 'board'; }
  });
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [dealType, setDealType] = useState(() => {
    try { return localStorage.getItem('pipeline.type') || ''; } catch { return ''; }
  });
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  // A drag onto Won or Lost does not move the card straight away — it asks
  // the one question that stage needs answered first.
  const [closing, setClosing] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await pipelineService.listLeads());
    } catch (err) {
      setError(errText(err, 'Could not load the pipeline.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    try { localStorage.setItem('pipeline.view', view); } catch { /* private mode */ }
  }, [view]);

  useEffect(() => {
    try { localStorage.setItem('pipeline.type', dealType); } catch { /* private mode */ }
  }, [dealType]);

  // The type filter drives the totals too; search and source only narrow what
  // is shown, so typing a name does not rewrite the win rate.
  const ofType = useMemo(
    () => (data?.leads || []).filter((l) => !dealType || l.deal_type === dealType),
    [data, dealType],
  );

  // Open leads per type, for the counts on the type switcher.
  const typeCounts = useMemo(() => {
    const c = { '': 0 };
    (data?.leads || []).forEach((l) => {
      if (l.stage === 'won' || l.stage === 'lost') return;
      c[''] += 1;
      c[l.deal_type] = (c[l.deal_type] || 0) + 1;
    });
    return c;
  }, [data]);

  const leads = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ofType.filter((l) => {
      if (source && l.source !== source) return false;
      if (!q) return true;
      return [l.contact_name, l.company_name, l.email, l.region, l.next_action]
        .some((v) => v && v.toLowerCase().includes(q));
    });
  }, [ofType, query, source]);

  async function moveTo(lead, stage, extra = {}) {
    if (lead.stage === stage) return;
    // Optimistic, so the card lands where it was dropped instead of snapping
    // back for a round-trip. The reload that follows is the source of truth.
    setData((d) => d && {
      ...d, leads: d.leads.map((l) => (l.id === lead.id ? { ...l, stage } : l)),
    });
    try {
      await pipelineService.updateLead(lead.id, { stage, ...extra });
    } catch (err) {
      setError(errText(err, 'Could not move that lead.'));
    }
    load();
  }

  function requestMove(lead, stage) {
    if (lead.stage === stage) return;
    if (stage === 'won' || stage === 'lost') setClosing({ lead, stage });
    else moveTo(lead, stage);
  }

  const s = data ? summarise(ofType) : null;

  return (
    <AdminLayout
      title="Sales pipeline"
      subtitle="Grow sign-ups, Insights Pro upgrades and enterprise contracts. Opt-ins and Pro enquiries are added automatically."
    >
      <div className="pipe-page">
        <div className="pipe-types" role="group" aria-label="Deal type">
          {[{ value: '', label: 'All' }, ...DEAL_TYPES].map((t) => (
            <button
              key={t.value || 'all'}
              type="button"
              className={t.value ? `type-${t.value}` : undefined}
              aria-pressed={dealType === t.value}
              onClick={() => setDealType(t.value)}
            >
              {t.label}
              <span className="pipe-count">{typeCounts[t.value] || 0}</span>
            </button>
          ))}
        </div>

        {s && (
          <div className="pipe-totals">
            <Stat value={s.open} label="open" />
            <Stat value={money(s.openValue)} label="open value / yr" />
            <Stat
              value={s.overdue}
              label="follow-ups overdue"
              tone={s.overdue ? 'warn' : undefined}
            />
            <Stat
              value={s.won90}
              label={s.won90Value ? `won, last 90 days · ${money(s.won90Value)}` : 'won, last 90 days'}
            />
            <Stat
              value={s.winRate == null ? '—' : `${s.winRate}%`}
              label="win rate, all time"
            />
          </div>
        )}

        {data?.synced > 0 && (
          <p className="pipe-synced">
            <Sprout size={14} aria-hidden="true" />
            {data.synced} new Grow {data.synced === 1 ? 'lead' : 'leads'} from Insights marketing opt-ins.
          </p>
        )}
        {data?.synced_pro > 0 && (
          <p className="pipe-synced">
            <Inbox size={14} aria-hidden="true" />
            {data.synced_pro} new Insights Pro {data.synced_pro === 1 ? 'enquiry' : 'enquiries'}.
          </p>
        )}

        <header className="pipe-controls">
          <label className="pipe-search">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, company, email"
              aria-label="Search leads"
            />
          </label>

          <select
            className="pipe-select"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            aria-label="Filter by source"
          >
            <option value="">All sources</option>
            {SOURCES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <div className="pipe-toggle" role="group" aria-label="View">
            <button
              type="button" aria-pressed={view === 'board'}
              onClick={() => setView('board')}
            >
              <LayoutGrid size={14} aria-hidden="true" /> Board
            </button>
            <button
              type="button" aria-pressed={view === 'table'}
              onClick={() => setView('table')}
            >
              <Table2 size={14} aria-hidden="true" /> Table
            </button>
          </div>

          <button type="button" className="pipe-new" onClick={() => setCreating(true)}>
            <Plus size={15} aria-hidden="true" /> Add lead
          </button>
        </header>

        {error && <p className="pipe-error" role="alert">{error}</p>}

        {loading && (
          <p className="pipe-loading">
            <Loader2 size={15} className="pipe-spin" aria-hidden="true" /> Loading…
          </p>
        )}

        {!loading && data && !ofType.length && (
          <p className="pipe-empty">
            {dealType === 'enterprise'
              ? 'No enterprise deals yet. They are always added by hand.'
              : dealType === 'insights_pro'
                ? 'No Insights Pro leads yet. They arrive from the Pro enquiry form, or add one by hand.'
                : 'No leads yet. Add someone by hand to get started.'}
          </p>
        )}

        {!loading && data && ofType.length > 0 && (
          view === 'board'
            ? <Board leads={leads} onOpen={setOpenId} onMove={requestMove} />
            : <LeadTable leads={leads} onOpen={setOpenId} />
        )}

        {creating && (
          <NewLead
            dealType={dealType || 'grow'}
            onClose={() => setCreating(false)}
            onSaved={(lead) => { setCreating(false); load(); setOpenId(lead.id); }}
          />
        )}

        {openId && (
          <LeadDetail
            key={openId}
            leadId={openId}
            onClose={() => setOpenId(null)}
            onChanged={load}
          />
        )}

        {closing && (
          <CloseLead
            lead={closing.lead}
            stage={closing.stage}
            onCancel={() => setClosing(null)}
            onConfirm={(extra) => {
              const { lead, stage } = closing;
              setClosing(null);
              moveTo(lead, stage, extra);
            }}
          />
        )}
      </div>
    </AdminLayout>
  );
}

function Stat({ value, label, tone }) {
  return (
    <div className={tone ? `is-${tone}` : undefined}>
      <span className="pipe-bignum">{value}</span>
      <span className="pipe-biglabel">{label}</span>
    </div>
  );
}

// ----------------------------------------------------------------- board

function Board({ leads, onOpen, onMove }) {
  const [dragId, setDragId] = useState(null);
  const [overStage, setOverStage] = useState(null);

  const byStage = useMemo(() => {
    const m = Object.fromEntries(STAGES.map((s) => [s.value, []]));
    leads.forEach((l) => m[l.stage]?.push(l));
    return m;
  }, [leads]);

  return (
    <div className="pipe-board">
      {STAGES.map((st) => {
        const cards = byStage[st.value];
        return (
          <section
            key={st.value}
            className={`pipe-col is-${st.value}${overStage === st.value ? ' is-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOverStage(st.value); }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setOverStage(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setOverStage(null);
              const lead = leads.find((l) => String(l.id) === e.dataTransfer.getData('text/plain'));
              if (lead) onMove(lead, st.value);
            }}
            aria-label={`${st.label}, ${cards.length}`}
          >
            <h2 className="pipe-colhead">
              <span>{st.label}</span>
              <span className="pipe-count">{cards.length}</span>
            </h2>
            <ul className="pipe-cards">
              {cards.map((l) => (
                <li key={l.id}>
                  <LeadCard
                    lead={l}
                    dragging={dragId === l.id}
                    onOpen={() => onOpen(l.id)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', String(l.id));
                      e.dataTransfer.effectAllowed = 'move';
                      setDragId(l.id);
                    }}
                    onDragEnd={() => { setDragId(null); setOverStage(null); }}
                  />
                </li>
              ))}
            </ul>
            {!cards.length && <p className="pipe-colempty">Nothing here</p>}
          </section>
        );
      })}
    </div>
  );
}

function LeadCard({ lead, dragging, onOpen, onDragStart, onDragEnd }) {
  const closed = lead.stage === 'won' || lead.stage === 'lost';
  const secondary = lead.contact_name ? lead.company_name : null;
  return (
    <button
      type="button"
      className={`pipe-card${dragging ? ' is-dragging' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
    >
      <span className="pipe-cardname">{leadTitle(lead)}</span>
      {secondary && <span className="pipe-cardco">{secondary}</span>}

      {lead.value_nzd != null && (
        <span className="pipe-cardvalue">{money(lead.value_nzd)}/yr</span>
      )}

      <span className="pipe-chips">
        <TypeBadge type={lead.deal_type} />
        <span className={`pipe-chip src-${lead.source}`}>{SOURCE_LABEL[lead.source]}</span>
        {lead.region && <span className="pipe-chip">{lead.region}</span>}
        {lead.insights && !lead.insights.marketing_opt_in && (
          <span className="pipe-chip is-warn" title="Has since turned off marketing emails">
            <BellOff size={11} aria-hidden="true" /> Opted out
          </span>
        )}
        {lead.grow_match && (
          <span className="pipe-chip is-good" title="Someone with this email now has a Grow login">
            <Sprout size={11} aria-hidden="true" /> On Grow
          </span>
        )}
        {lead.pro_match && (
          <span className="pipe-chip is-good" title="Their Insights account is now on Pro">
            <Star size={11} aria-hidden="true" /> On Pro
          </span>
        )}
      </span>

      {!closed && lead.next_action_on && (
        <span className={`pipe-next${lead.overdue ? ' is-overdue' : ''}`}>
          {lead.overdue && <AlertTriangle size={12} aria-hidden="true" />}
          {duePhrase(lead.next_action_on)}
          {lead.next_action && <> · {lead.next_action}</>}
        </span>
      )}
      {!closed && !lead.next_action_on && lead.next_action && (
        <span className="pipe-next">{lead.next_action}</span>
      )}
      {lead.stage === 'lost' && lead.lost_reason && (
        <span className="pipe-next">{LOST_LABEL[lead.lost_reason]}</span>
      )}
      {lead.stage === 'won' && (lead.insights_account_name || lead.grow_company_name) && (
        <span className="pipe-next">→ {lead.insights_account_name || lead.grow_company_name}</span>
      )}
    </button>
  );
}

function TypeBadge({ type }) {
  return <span className={`pipe-type type-${type}`}>{TYPE_LABEL[type]}</span>;
}

// ----------------------------------------------------------------- table

const COLUMNS = [
  { key: 'name', label: 'Lead', get: (l) => leadTitle(l).toLowerCase() },
  { key: 'type', label: 'Type', get: (l) => DEAL_TYPES.findIndex((t) => t.value === l.deal_type) },
  { key: 'stage', label: 'Stage', get: (l) => STAGES.findIndex((s) => s.value === l.stage) },
  { key: 'value', label: 'Value / yr', get: (l) => l.value_nzd ?? -1 },
  { key: 'source', label: 'Source', get: (l) => l.source },
  { key: 'region', label: 'Region', get: (l) => l.region || '' },
  { key: 'next', label: 'Next action', get: (l) => l.next_action_on || '9999' },
  { key: 'touch', label: 'Last touch', get: (l) => l.last_touch_on || '' },
];

function LeadTable({ leads, onOpen }) {
  const [sort, setSort] = useState({ key: 'next', dir: 1 });

  const rows = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key);
    return [...leads].sort((a, b) => {
      const x = col.get(a);
      const y = col.get(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [leads, sort]);

  return (
    <div className="pipe-tablewrap">
      <table className="pipe-table">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                aria-sort={sort.key === c.key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}
              >
                <button
                  type="button"
                  onClick={() => setSort((s) => ({
                    key: c.key, dir: s.key === c.key ? -s.dir : 1,
                  }))}
                >
                  {c.label}
                  {sort.key === c.key && <span aria-hidden="true">{sort.dir > 0 ? ' ↑' : ' ↓'}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id} onClick={() => onOpen(l.id)}>
              <td>
                <button type="button" className="pipe-rowlink" onClick={() => onOpen(l.id)}>
                  {leadTitle(l)}
                </button>
                {l.contact_name && l.company_name && (
                  <span className="pipe-rowsub">{l.company_name}</span>
                )}
              </td>
              <td><TypeBadge type={l.deal_type} /></td>
              <td><span className={`pipe-stage is-${l.stage}`}>{STAGE_LABEL[l.stage]}</span></td>
              <td className="pipe-num">{l.value_nzd != null ? money(l.value_nzd) : '—'}</td>
              <td>{SOURCE_LABEL[l.source]}</td>
              <td>{l.region || '—'}</td>
              <td className={l.overdue ? 'is-overdue' : undefined}>
                {l.next_action_on ? duePhrase(l.next_action_on) : '—'}
                {l.next_action && <span className="pipe-rowsub">{l.next_action}</span>}
              </td>
              <td>{l.last_touch_on ? dayLabel(l.last_touch_on) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="pipe-empty">No leads match.</p>}
    </div>
  );
}

// ---------------------------------------------------------- close dialog

// What a won deal links to, by type. A Pro upgrade links to nothing: the
// subscriber behind the lead IS the account.
const LINKS = {
  company: {
    field: 'grow_company_id',
    nameField: 'grow_company_name',
    label: 'Grow company',
    search: (q) => pipelineService.searchCompanies(q).then((r) => r.companies || []),
  },
  account: {
    field: 'insights_account_id',
    nameField: 'insights_account_name',
    label: 'Insights account',
    search: (q) => pipelineService.searchAccounts(q).then((r) => r.accounts || []),
  },
};
const LINKS_BY_TYPE = {
  grow: ['company'],
  insights_pro: [],
  enterprise: ['account', 'company'],
};

function LinkPicker({ kind, value, onChange }) {
  const link = LINKS[kind];
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      link.search(q)
        .then((rows) => { if (live) setResults(rows); })
        .catch(() => {});
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [q, link]);

  return (
    <div className="pipe-picker">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Search ${link.label.toLowerCase()}s`}
        aria-label={`Search ${link.label.toLowerCase()}s`}
      />
      <select
        size={Math.min(Math.max(results.length, 2), 6)}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        aria-label={link.label}
      >
        {results.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
}

function ProMatchLine({ lead }) {
  const tier = lead.insights?.subscription_tier;
  if (lead.pro_match) {
    return (
      <p className="pipe-match">
        <Star size={14} aria-hidden="true" />
        {lead.pro_match.email} is on Insights Pro.
      </p>
    );
  }
  return (
    <p className="td-hint">
      {lead.public_user_id
        ? `Their Insights account is on ${tier === 'pro' ? 'Pro' : tier || 'Free'}. `
        : 'Not linked to an Insights account. '}
      Pro is switched on from Users, not from here.
    </p>
  );
}

function CloseLead({ lead, stage, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [links, setLinks] = useState({
    grow_company_id: lead.grow_company_id ?? lead.grow_match?.company_id ?? null,
    insights_account_id: lead.insights_account_id ?? null,
  });
  const won = stage === 'won';
  const kinds = LINKS_BY_TYPE[lead.deal_type] || [];
  const chosen = Object.fromEntries(
    kinds.map((k) => [LINKS[k].field, links[LINKS[k].field]]).filter(([, v]) => v),
  );

  return (
    <PlanDrawer
      open
      title={`${won ? 'Won' : 'Lost'}: ${leadTitle(lead)}`}
      onClose={onCancel}
      footer={(
        <>
          <button type="button" className="pipe-ghost" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="pipe-save"
            disabled={!won && !reason}
            onClick={() => onConfirm({
              stage_note: note.trim() || null,
              ...(won ? chosen : { lost_reason: reason }),
            })}
          >
            Mark {won ? 'won' : 'lost'}
          </button>
        </>
      )}
    >
      {won ? (
        <>
          {kinds.length > 0 && (
            <p className="td-hint">
              Link what they signed up as, so the deal traces through to the
              account. You can skip this and link it later.
            </p>
          )}
          {lead.grow_match && (
            <p className="pipe-match">
              <Sprout size={14} aria-hidden="true" />
              {lead.email} already has a Grow login
              {lead.grow_match.company_name ? ` at ${lead.grow_match.company_name}` : ''}.
            </p>
          )}
          {lead.deal_type === 'insights_pro' && <ProMatchLine lead={lead} />}
          {kinds.map((k) => (
            <label className="td-field" key={k}>
              <span>{LINKS[k].label}</span>
              <LinkPicker
                kind={k}
                value={links[LINKS[k].field]}
                onChange={(id) => setLinks((l) => ({ ...l, [LINKS[k].field]: id }))}
              />
            </label>
          ))}
        </>
      ) : (
        <label className="td-field">
          <span>Why was it lost?</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)} autoFocus>
            <option value="" disabled>Choose a reason</option>
            {LOST_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
      )}

      <label className="td-field">
        <span>Note (optional)</span>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </PlanDrawer>
  );
}

// -------------------------------------------------------------- new lead

function NewLead({ dealType, onClose, onSaved }) {
  const [form, setForm] = useState({
    deal_type: dealType,
    contact_name: '', company_name: '', email: '', phone: '', region: '',
    hectares: '', value_nzd: '', source: DEFAULT_SOURCE[dealType],
    next_action: '', next_action_on: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  // Changing the type moves the source to that type's usual one, unless it
  // has already been picked away from the previous type's default.
  const setType = (e) => {
    const t = e.target.value;
    setForm((f) => ({
      ...f,
      deal_type: t,
      source: f.source === DEFAULT_SOURCE[f.deal_type] ? DEFAULT_SOURCE[t] : f.source,
    }));
  };

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const lead = await pipelineService.createLead({
        ...form,
        hectares: form.hectares === '' ? null : Number(form.hectares),
        value_nzd: form.value_nzd === '' ? null : Number(form.value_nzd),
        next_action_on: form.next_action_on || null,
        notes: form.notes || null,
      });
      onSaved(lead);
    } catch (err) {
      setError(errText(err, 'Could not add that lead.'));
      setSaving(false);
    }
  }

  const empty = !form.contact_name.trim() && !form.company_name.trim() && !form.email.trim();

  return (
    <PlanDrawer
      open
      title="Add lead"
      onClose={onClose}
      footer={(
        <>
          <span />
          <button type="submit" form="pipe-new" className="pipe-save" disabled={saving || empty}>
            {saving ? 'Adding…' : 'Add lead'}
          </button>
        </>
      )}
    >
      {error && <p className="td-error" role="alert">{error}</p>}
      <form id="pipe-new" onSubmit={submit} className="pipe-form">
        <label className="td-field">
          <span>Deal type</span>
          <select value={form.deal_type} onChange={setType}>
            {DEAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <div className="td-row">
          <label className="td-field">
            <span>Name</span>
            <input autoFocus value={form.contact_name} onChange={set('contact_name')} />
          </label>
          <label className="td-field">
            <span>Company</span>
            <input value={form.company_name} onChange={set('company_name')} />
          </label>
        </div>
        <div className="td-row">
          <label className="td-field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={set('email')} />
          </label>
          <label className="td-field">
            <span>Phone</span>
            <input type="tel" value={form.phone} onChange={set('phone')} />
          </label>
        </div>
        <div className="td-row">
          <label className="td-field">
            <span>Region</span>
            <input value={form.region} onChange={set('region')} />
          </label>
          <label className="td-field">
            <span>Hectares</span>
            <input type="number" min="0" step="0.1" value={form.hectares} onChange={set('hectares')} />
          </label>
        </div>
        <div className="td-row">
          <label className="td-field">
            <span>Value (NZD / yr)</span>
            <input type="number" min="0" step="100" value={form.value_nzd} onChange={set('value_nzd')} />
          </label>
          <label className="td-field">
            <span>Source</span>
            <select value={form.source} onChange={set('source')}>
              {SOURCES.filter((o) => o.value !== 'insights').map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="td-row">
          <label className="td-field">
            <span>Next action</span>
            <input value={form.next_action} onChange={set('next_action')} placeholder="e.g. Call to book a demo" />
          </label>
          <label className="td-field">
            <span>By</span>
            <input type="date" value={form.next_action_on} onChange={set('next_action_on')} />
          </label>
        </div>
        <label className="td-field">
          <span>Notes</span>
          <textarea rows={3} value={form.notes} onChange={set('notes')} />
        </label>
        {empty && <p className="td-hint">Needs at least a name, company or email.</p>}
      </form>
    </PlanDrawer>
  );
}

// ---------------------------------------------------------------- detail

/** A text input that saves on blur, and only when the value actually changed. */
function BlurField({ label, value, onSave, type = 'text', multiline = false, ...rest }) {
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <label className="td-field">
      <span>{label}</span>
      <Tag
        type={multiline ? undefined : type}
        defaultValue={value ?? ''}
        onBlur={(e) => {
          const raw = e.target.value;
          let v = type === 'number' ? (raw === '' ? null : Number(raw)) : (raw.trim() || null);
          if (multiline && raw.trim()) v = raw;
          if (v !== (value ?? null)) onSave(v);
        }}
        {...rest}
      />
    </label>
  );
}

function LeadDetail({ leadId, onClose, onChanged }) {
  const [lead, setLead] = useState(null);
  const [error, setError] = useState(null);
  const [closing, setClosing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [kind, setKind] = useState('call');
  const [body, setBody] = useState('');
  const [when, setWhen] = useState(todayKey());

  const reload = useCallback(async () => {
    try {
      setLead(await pipelineService.getLead(leadId));
    } catch (err) {
      setError(errText(err, 'Could not load that lead.'));
    }
  }, [leadId]);

  useEffect(() => { reload(); }, [reload]);

  const patch = async (payload) => {
    setError(null);
    try {
      setLead(await pipelineService.updateLead(leadId, payload));
      onChanged();
    } catch (err) {
      setError(errText(err, 'Could not save that change.'));
    }
  };

  async function logActivity(e) {
    e.preventDefault();
    if (kind === 'note' && !body.trim()) return;
    setError(null);
    try {
      setLead(await pipelineService.addActivity(leadId, {
        kind, body: body.trim() || null, occurred_on: when,
      }));
      setBody('');
      onChanged();
    } catch (err) {
      setError(errText(err, 'Could not log that.'));
    }
  }

  if (!lead) {
    return (
      <PlanDrawer open title="Lead" onClose={onClose}>
        {error ? <p className="td-error">{error}</p> : <p>Loading…</p>}
      </PlanDrawer>
    );
  }

  // The won/lost question REPLACES this drawer rather than stacking on it. Two
  // PlanDrawers open at once would both hear Escape, and this one — registered
  // first — would close the lead instead of backing out of the question.
  if (closing) {
    return (
      <CloseLead
        lead={lead}
        stage={closing}
        onCancel={() => setClosing(null)}
        onConfirm={(extra) => {
          const stage = closing;
          setClosing(null);
          patch({ stage, ...extra });
        }}
      />
    );
  }

  const closed = lead.stage === 'won' || lead.stage === 'lost';
  // The syncs would recreate either of these as a blank lead, undoing the
  // delete; the API refuses them too.
  const synced = lead.source === 'insights' || lead.activities.some((a) => a.kind === 'enquiry');
  const linkKinds = LINKS_BY_TYPE[lead.deal_type] || [];

  return (
    <PlanDrawer
      open
      title={leadTitle(lead)}
      onClose={onClose}
      footer={(
        <>
          <span className="td-savestate">
            {SOURCE_LABEL[lead.source]} · added {dayLabel(lead.created_at.slice(0, 10))}
          </span>
          {synced ? (
            <span className="td-hint">
              {lead.source === 'insights' ? 'Insights' : 'Enquiry'} leads can't be deleted. Mark them lost.
            </span>
          ) : confirmDelete ? (
            <span className="td-confirm">
              Delete lead?
              <button
                type="button" className="td-danger"
                onClick={async () => {
                  try {
                    await pipelineService.deleteLead(leadId);
                    onChanged();
                    onClose();
                  } catch (err) {
                    setError(errText(err, 'Could not delete that lead.'));
                    setConfirmDelete(false);
                  }
                }}
              >
                Delete
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </span>
          ) : (
            <button type="button" className="td-deletebtn" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} aria-hidden="true" /> Delete
            </button>
          )}
        </>
      )}
    >
      {error && <p className="td-error" role="alert">{error}</p>}

      {/* Stage as a row of steps. The current one is filled, earlier ones are
          ticked off, and Won/Lost sit apart as the two ways out. */}
      <div className="pipe-steps" role="group" aria-label="Stage">
        {STAGES.map((st) => (
          <button
            key={st.value}
            type="button"
            className={`pipe-step is-${st.value}`}
            aria-pressed={lead.stage === st.value}
            onClick={() => {
              if (st.value === lead.stage) return;
              if (st.value === 'won' || st.value === 'lost') setClosing(st.value);
              else patch({ stage: st.value });
            }}
          >
            {st.label}
          </button>
        ))}
      </div>

      <div className="td-row">
        <label className="td-field">
          <span>Deal type</span>
          <select
            value={lead.deal_type}
            disabled={lead.source === 'insights'}
            title={lead.source === 'insights' ? 'Insights opt-in leads stay Grow leads' : undefined}
            onChange={(e) => patch({ deal_type: e.target.value })}
          >
            {DEAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <BlurField
          key={`value-${lead.id}`}
          label="Value (NZD / yr)" type="number" min="0" step="100"
          value={lead.value_nzd} onSave={(v) => patch({ value_nzd: v })}
        />
      </div>

      {lead.pro_match && (
        <div className="pipe-match">
          <Star size={14} aria-hidden="true" />
          <span>{lead.pro_match.email} is now on Insights Pro.</span>
          <button type="button" onClick={() => setClosing('won')}>
            Mark won <ArrowRight size={13} aria-hidden="true" />
          </button>
        </div>
      )}

      {lead.grow_match && (
        <div className="pipe-match">
          <Sprout size={14} aria-hidden="true" />
          <span>
            {lead.email} now has a Grow login
            {lead.grow_match.company_name ? ` at ${lead.grow_match.company_name}` : ''}.
          </span>
          <button type="button" onClick={() => setClosing('won')}>
            Mark won <ArrowRight size={13} aria-hidden="true" />
          </button>
        </div>
      )}

      {lead.insights && !lead.insights.marketing_opt_in && (
        <p className="pipe-warnline">
          <BellOff size={14} aria-hidden="true" />
          Has turned off marketing emails since being added. Contact them directly, not by campaign.
        </p>
      )}

      {lead.stage === 'lost' && (
        <label className="td-field">
          <span>Lost because</span>
          <select
            value={lead.lost_reason || ''}
            onChange={(e) => patch({ lost_reason: e.target.value || null })}
          >
            <option value="">Not recorded</option>
            {LOST_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
      )}

      {lead.stage === 'won' && linkKinds.map((k) => {
        const { field, nameField, label } = LINKS[k];
        return (
          <div className="td-field" key={k}>
            <span>{label}</span>
            {lead[field] ? (
              <p className="pipe-linked">
                {lead[nameField] || `${label} #${lead[field]}`}
                <button type="button" onClick={() => patch({ [field]: null })}>Unlink</button>
              </p>
            ) : (
              <LinkPicker kind={k} value={null} onChange={(id) => id && patch({ [field]: id })} />
            )}
          </div>
        );
      })}
      {lead.stage === 'won' && lead.deal_type === 'insights_pro' && <ProMatchLine lead={lead} />}

      {!closed && (
        <div className="td-row pipe-nextrow">
          <BlurField
            label="Next action"
            value={lead.next_action}
            onSave={(v) => patch({ next_action: v })}
            placeholder="What happens next?"
          />
          <label className="td-field">
            <span>By</span>
            <input
              type="date"
              className={lead.overdue ? 'is-overdue' : undefined}
              value={lead.next_action_on || ''}
              onChange={(e) => patch({ next_action_on: e.target.value || null })}
            />
          </label>
        </div>
      )}

      <section className="td-section">
        <h3>Contact</h3>
        <div className="td-row">
          <BlurField label="Name" value={lead.contact_name} onSave={(v) => patch({ contact_name: v })} />
          <BlurField label="Company" value={lead.company_name} onSave={(v) => patch({ company_name: v })} />
        </div>
        <div className="td-row">
          <BlurField label="Email" type="email" value={lead.email} onSave={(v) => patch({ email: v })} />
          <BlurField label="Phone" type="tel" value={lead.phone} onSave={(v) => patch({ phone: v })} />
        </div>
        <div className="td-row">
          <BlurField label="Region" value={lead.region} onSave={(v) => patch({ region: v })} />
          <BlurField
            label="Hectares" type="number" min="0" step="0.1"
            value={lead.hectares} onSave={(v) => patch({ hectares: v })}
          />
        </div>
        {lead.source !== 'insights' && (
          <label className="td-field">
            <span>Source</span>
            <select value={lead.source} onChange={(e) => patch({ source: e.target.value })}>
              {SOURCES.filter((o) => o.value !== 'insights').map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        )}
        <BlurField
          label="Notes" multiline rows={3}
          value={lead.notes} onSave={(v) => patch({ notes: v })}
        />
      </section>

      {lead.insights && (
        <section className="td-section">
          <h3>On Insights</h3>
          <dl className="pipe-facts">
            <dt>Signed up</dt>
            <dd>{lead.insights.signed_up_at ? dayLabel(lead.insights.signed_up_at.slice(0, 10)) : '—'}</dd>
            <dt>Last login</dt>
            <dd>{lead.insights.last_login ? dayLabel(lead.insights.last_login.slice(0, 10)) : 'Never'}</dd>
            <dt>Plan</dt>
            <dd>{lead.insights.subscription_tier === 'pro' ? 'Pro' : 'Free'}</dd>
            <dt>Describes self as</dt>
            <dd>{lead.insights.user_type ? lead.insights.user_type.replaceAll('_', ' ') : '—'}</dd>
          </dl>
        </section>
      )}

      <section className="td-section">
        <h3>Activity <span className="td-badge">{lead.touch_count}</span></h3>
        <form className="pipe-logform" onSubmit={logActivity}>
          <div className="pipe-kinds" role="group" aria-label="Activity type">
            {KINDS.map((k) => {
              const Icon = k.icon;
              return (
                <button
                  key={k.value} type="button" aria-pressed={kind === k.value}
                  onClick={() => setKind(k.value)}
                >
                  <Icon size={13} aria-hidden="true" /> {k.label}
                </button>
              );
            })}
          </div>
          <textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={kind === 'note' ? 'Add a note' : 'What happened? (optional)'}
            aria-label="Details"
          />
          <div className="pipe-logrow">
            <input
              type="date" value={when} aria-label="When"
              onChange={(e) => setWhen(e.target.value)}
            />
            <button type="submit" className="pipe-save" disabled={kind === 'note' && !body.trim()}>
              Log {KINDS.find((k) => k.value === kind)?.label.toLowerCase()}
            </button>
          </div>
        </form>

        <ol className="pipe-timeline">
          {lead.activities.map((a) => {
            const Icon = KIND_ICON[a.kind] || ArrowRight;
            return (
              <li key={a.id} className={`is-${a.kind}`}>
                <span className="pipe-tlicon" aria-hidden="true"><Icon size={12} /></span>
                <div className="pipe-tlmain">
                  <span className="pipe-tlhead">
                    {a.kind === 'stage'
                      ? (a.from_stage
                        ? <>{STAGE_LABEL[a.from_stage]} → <strong>{STAGE_LABEL[a.to_stage]}</strong></>
                        : <>Added as <strong>{STAGE_LABEL[a.to_stage]}</strong></>)
                      : <strong>{KIND_LABEL[a.kind]}</strong>}
                    <span className="pipe-tlwhen">
                      {dayLabel(a.occurred_on)}
                      {a.author_email && ` · ${a.author_email.split('@')[0]}`}
                    </span>
                  </span>
                  {a.body && <span className="pipe-tlbody">{a.body}</span>}
                </div>
                {a.kind !== 'stage' && a.kind !== 'enquiry' && (
                  <button
                    type="button" aria-label="Delete entry" className="pipe-tldel"
                    onClick={async () => {
                      try {
                        setLead(await pipelineService.deleteActivity(leadId, a.id));
                        onChanged();
                      } catch (err) {
                        setError(errText(err, 'Could not delete that entry.'));
                      }
                    }}
                  >
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </section>

    </PlanDrawer>
  );
}
