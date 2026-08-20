// components/pro/ProEnquiryForm.jsx — the Pro sign-up form.
//
// There is no self-serve purchase (decided 2026-08-20: enquiry, then a Xero
// invoice, matching how Grow is billed), so this form IS the funnel. It writes
// to `insights_pro_enquiry` and the row is what counts as success — the
// notification email is best-effort on top, because a lead that exists only as
// a message in an inbox is a lead that gets lost.
//
// PREFILLED, NOT LOCKED. A signed-in visitor gets their name and email filled
// in and can still change both: the person enquiring is not necessarily the
// person the account belongs to, and a vineyard manager sending this on behalf
// of an owner should not have to sign out to do it.
//
// The honeypot field is hidden from people and left empty by them; bots fill
// every field they find. Cheaper and less hostile than a CAPTCHA, and it means
// nobody has to identify a bicycle to ask us a question.
import { useEffect, useState } from 'react';
import { Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { usePublicAuth } from '../../contexts/PublicAuthContext';
import { submitProEnquiry } from '../../services/proService';
import './ProEnquiryForm.css';

const EMPTY = {
  name: '',
  email: '',
  phone: '',
  business: '',
  region: '',
  hectares: '',
  sites: '',
  message: '',
  companyWebsite: '',   // honeypot
};

function ProEnquiryForm() {
  const { user, isAuthenticated } = usePublicAuth();
  const [form, setForm] = useState(EMPTY);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  // Prefill once the account is known. Guarded on the field being untouched so
  // a slow auth response cannot overwrite something already typed.
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    setForm((prev) => ({
      ...prev,
      name: prev.name || user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || '',
      email: prev.email || user.email || '',
    }));
  }, [isAuthenticated, user]);

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (error) setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (sending) return;

    const name = form.name.trim();
    const email = form.email.trim();
    if (!name || !email) {
      setError('A name and an email address are needed so we can reply.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      await submitProEnquiry({ ...form, name, email });
      setSent(true);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429) {
        setError('That is a few enquiries from here already. Try again a little later.');
      } else if (status === 422) {
        setError(err?.response?.data?.detail || 'Please check the details and try again.');
      } else {
        // Deliberately gives a way through rather than a dead end.
        setError('Something went wrong sending that. Please email insights@auxein.co.nz and we will pick it up.');
      }
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="enquiry enquiry--done" role="status">
        <CheckCircle2 size={30} aria-hidden="true" />
        <h3>Thanks — that is with us.</h3>
        <p>
          We will come back to you at <strong>{form.email.trim()}</strong> with
          what Pro looks like for your sites, usually within a working day.
        </p>
      </div>
    );
  }

  return (
    <form className="enquiry" onSubmit={handleSubmit} noValidate>
      <div className="enquiry__grid">
        <label className="enquiry__field">
          <span>Name <em aria-hidden="true">*</em></span>
          <input
            type="text" value={form.name} onChange={set('name')}
            autoComplete="name" required maxLength={120}
          />
        </label>

        <label className="enquiry__field">
          <span>Email <em aria-hidden="true">*</em></span>
          <input
            type="email" value={form.email} onChange={set('email')}
            autoComplete="email" required maxLength={254}
          />
        </label>

        <label className="enquiry__field">
          <span>Phone</span>
          <input
            type="tel" value={form.phone} onChange={set('phone')}
            autoComplete="tel" maxLength={40}
          />
        </label>

        <label className="enquiry__field">
          <span>Vineyard or business</span>
          <input
            type="text" value={form.business} onChange={set('business')}
            autoComplete="organization" maxLength={160}
          />
        </label>

        <label className="enquiry__field">
          <span>Region</span>
          <input
            type="text" value={form.region} onChange={set('region')}
            placeholder="Marlborough, Central Otago…" maxLength={120}
          />
        </label>

        <div className="enquiry__pair">
          <label className="enquiry__field">
            <span>Planted area (ha)</span>
            <input
              type="number" inputMode="decimal" min="0" step="0.1"
              value={form.hectares} onChange={set('hectares')}
            />
          </label>
          <label className="enquiry__field">
            <span>Sites</span>
            <input
              type="number" inputMode="numeric" min="0" step="1"
              value={form.sites} onChange={set('sites')}
            />
          </label>
        </div>

        <label className="enquiry__field enquiry__field--wide">
          <span>Anything else</span>
          <textarea
            rows={4} value={form.message} onChange={set('message')}
            maxLength={4000}
            placeholder="What you are hoping to get out of it, or anything you want to ask."
          />
        </label>
      </div>

      {/* Honeypot. Hidden from people and from screen readers; bots fill it. */}
      <div className="enquiry__hp" aria-hidden="true">
        <label>
          Company website
          <input
            type="text" tabIndex={-1} autoComplete="off"
            value={form.companyWebsite} onChange={set('companyWebsite')}
          />
        </label>
      </div>

      {error && (
        <p className="enquiry__error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      <div className="enquiry__actions">
        <button type="submit" className="enquiry__submit" disabled={sending}>
          <Send size={15} aria-hidden="true" />
          {sending ? 'Sending…' : 'Send enquiry'}
        </button>
        <p className="enquiry__privacy">
          We use this only to reply to you about Insights Pro.
        </p>
      </div>
    </form>
  );
}

export default ProEnquiryForm;
