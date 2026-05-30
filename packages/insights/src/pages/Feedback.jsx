// pages/Feedback.jsx
/**
 * Public Insights feedback form (/feedback) — no auth required.
 *
 * Destination for the subscriber email campaign. POSTs to /api/v1/feedback,
 * which emails the response to insights@auxein.co.nz. Persists nothing.
 */

import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Logo from '../assets/Logo_September 2025.png';
import { submitFeedback } from '../services/feedbackService';
import './Feedback.css';

const REGIONS = [
  'Northland',
  'Auckland',
  'Waikato / Bay of Plenty',
  'Gisborne',
  "Hawke's Bay",
  'Wairarapa',
  'Nelson',
  'Marlborough',
  'North Canterbury / Waipara',
  'Canterbury',
  'Central Otago',
  'Otago (other)',
  'Other / multiple',
  'Not a grower',
];

const USAGE_FREQUENCY = [
  'Weekly or more',
  'Monthly',
  'A few times a season',
  'Signed up but rarely use it',
];

const NEW_METRICS = [
  'Date of last frost',
  'Early-season frost count',
  '1-day extreme rainfall events',
  'Very hot days (>30°C)',
  'Not sure yet',
];

const DEVICE = ['Desktop', 'Mobile', 'Both about equally'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INITIAL = {
  regions: [],
  usageFrequency: '',
  newMetricsUseful: [],
  missingMetric: '',
  easeOfUseScore: null,
  frictionPoint: '',
  device: '',
  painBeyondClimate: '',
  worthPayingFor: '',
  anythingElse: '',
  replyEmail: '',
};

const Feedback = () => {
  const [form, setForm] = useState(INITIAL);
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [regionsError, setRegionsError] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const regionsRef = useRef(null);
  const emailRef = useRef(null);

  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggle = (field, value) => {
    setForm((prev) => {
      const list = prev[field];
      const next = list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value];
      return { ...prev, [field]: next };
    });
    if (field === 'regions') setRegionsError(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (status === 'submitting') return;

    // Only Q1 (regions) is required.
    if (form.regions.length === 0) {
      setRegionsError(true);
      regionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Email is required (light format validation).
    const email = form.replyEmail.trim();
    if (!EMAIL_RE.test(email)) {
      setEmailError(true);
      emailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setEmailError(false);

    setStatus('submitting');
    try {
      await submitFeedback(form);
      setStatus('success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="feedback-page">
        <main className="feedback-content">
          <div className="feedback-confirm">
            <h1>Thank you.</h1>
            <p>Your feedback has gone straight to Pete.</p>
            <a className="feedback-confirm-link" href="https://insights.auxein.co.nz">
              Back to Auxein Insights
            </a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="feedback-page">
      <header className="feedback-header">
        <Link to="/" className="feedback-back">
          <ArrowLeft size={20} />
          <span>Back to Insights</span>
        </Link>
        <img src={Logo} alt="Auxein" className="feedback-logo" />
      </header>

      <main className="feedback-content">
        <div className="feedback-container">
          <div className="feedback-intro">
            <h1>Help shape Auxein Insights</h1>
            <p>
              A few quick questions on what matters to you. Everything is optional
              except your region and email. It takes about three minutes.
            </p>
          </div>

          <form className="feedback-form" onSubmit={handleSubmit} noValidate>
            {/* Section A */}
            <section className="feedback-section">
              <h2>About you</h2>

              <fieldset
                ref={regionsRef}
                className={`feedback-field ${regionsError ? 'has-error' : ''}`}
              >
                <legend>
                  Which region(s) do you grow in or work with?
                  <span className="required"> (required)</span>
                </legend>
                <div className="option-list">
                  {REGIONS.map((r) => (
                    <label key={r} className="option check">
                      <input
                        type="checkbox"
                        checked={form.regions.includes(r)}
                        onChange={() => toggle('regions', r)}
                      />
                      <span>{r}</span>
                    </label>
                  ))}
                </div>
                {regionsError && (
                  <p className="field-error">Please select at least one region.</p>
                )}
              </fieldset>

              <fieldset className="feedback-field">
                <legend>How often do you use Auxein Insights?</legend>
                <div className="option-list">
                  {USAGE_FREQUENCY.map((o) => (
                    <label key={o} className="option radio">
                      <input
                        type="radio"
                        name="usageFrequency"
                        checked={form.usageFrequency === o}
                        onChange={() => setField('usageFrequency', o)}
                      />
                      <span>{o}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </section>

            {/* Section B */}
            <section className="feedback-section">
              <h2>The metrics that matter</h2>

              <fieldset className="feedback-field">
                <legend>Which of the new metrics will you actually use?</legend>
                <div className="option-list">
                  {NEW_METRICS.map((o) => (
                    <label key={o} className="option check">
                      <input
                        type="checkbox"
                        checked={form.newMetricsUseful.includes(o)}
                        onChange={() => toggle('newMetricsUseful', o)}
                      />
                      <span>{o}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="feedback-field">
                <label className="field-label" htmlFor="missingMetric">
                  What metric or data is missing that you'd reach for during the season?
                </label>
                <textarea
                  id="missingMetric"
                  rows={3}
                  value={form.missingMetric}
                  onChange={(e) => setField('missingMetric', e.target.value)}
                />
              </div>
            </section>

            {/* Section C */}
            <section className="feedback-section">
              <h2>How it feels to use</h2>

              <fieldset className="feedback-field">
                <legend>How easy is it to find what you need on Insights?</legend>
                <div className="scale">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      type="button"
                      key={n}
                      className={`scale-btn ${form.easeOfUseScore === n ? 'active' : ''}`}
                      onClick={() => setField('easeOfUseScore', n)}
                      aria-pressed={form.easeOfUseScore === n}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="scale-labels">
                  <span>1 = Hard to navigate</span>
                  <span>5 = Effortless</span>
                </div>
              </fieldset>

              <div className="feedback-field">
                <label className="field-label" htmlFor="frictionPoint">
                  What's the one thing that slows you down or confuses you?
                </label>
                <textarea
                  id="frictionPoint"
                  rows={3}
                  value={form.frictionPoint}
                  onChange={(e) => setField('frictionPoint', e.target.value)}
                />
              </div>

              <fieldset className="feedback-field">
                <legend>Where do you mostly use Insights?</legend>
                <div className="option-list">
                  {DEVICE.map((o) => (
                    <label key={o} className="option radio">
                      <input
                        type="radio"
                        name="device"
                        checked={form.device === o}
                        onChange={() => setField('device', o)}
                      />
                      <span>{o}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </section>

            {/* Section D */}
            <section className="feedback-section">
              <h2>Beyond climate — where next?</h2>

              <div className="feedback-field">
                <label className="field-label" htmlFor="painBeyondClimate">
                  Outside of climate and weather, where do you lose the most time or
                  make the least confident decisions in a season?
                </label>
                <textarea
                  id="painBeyondClimate"
                  rows={3}
                  value={form.painBeyondClimate}
                  onChange={(e) => setField('painBeyondClimate', e.target.value)}
                />
              </div>

              <div className="feedback-field">
                <label className="field-label" htmlFor="worthPayingFor">
                  If Auxein built one tool beyond climate insights, what would make it
                  worth paying for?
                </label>
                <textarea
                  id="worthPayingFor"
                  rows={3}
                  value={form.worthPayingFor}
                  onChange={(e) => setField('worthPayingFor', e.target.value)}
                />
              </div>
            </section>

            {/* Section E */}
            <section className="feedback-section">
              <h2>Close</h2>

              <div className="feedback-field">
                <label className="field-label" htmlFor="anythingElse">
                  Anything else we should know?
                </label>
                <textarea
                  id="anythingElse"
                  rows={3}
                  value={form.anythingElse}
                  onChange={(e) => setField('anythingElse', e.target.value)}
                />
              </div>

              <div className="feedback-field" ref={emailRef}>
                <label className="field-label" htmlFor="replyEmail">
                  Email<span className="required"> (required)</span>
                </label>
                <input
                  id="replyEmail"
                  type="email"
                  className={emailError ? 'input-error' : ''}
                  value={form.replyEmail}
                  onChange={(e) => {
                    setField('replyEmail', e.target.value);
                    if (emailError) setEmailError(false);
                  }}
                />
                {emailError && (
                  <p className="field-error">Please enter a valid email address.</p>
                )}
              </div>
            </section>

            {status === 'error' && (
              <p className="form-error" role="alert">
                Something went wrong sending your feedback. Please try again, or email
                insights@auxein.co.nz directly.
              </p>
            )}

            <button
              type="submit"
              className="feedback-submit"
              disabled={status === 'submitting'}
            >
              {status === 'submitting' ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Sending…
                </>
              ) : (
                'Send feedback'
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default Feedback;
