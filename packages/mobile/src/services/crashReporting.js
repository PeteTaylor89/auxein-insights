// services/crashReporting.js — Sentry, started before anything else can fail.
//
// Open since 2026-08-13 and deliberately never half-built, because it needs an
// account and a DSN before any of this is worth writing. It is wired now with
// the DSN read from the build environment, so the native module rides build 10
// — it is native, and missing that window costs a whole build cycle — and the
// value can arrive later without a code change.
//
// THE RULE HERE: a crash reporter must never be the thing that crashes the app.
// Every call is guarded and every failure is swallowed to a console line. An
// app that starts without telemetry is a working app; an app that will not
// start because telemetry failed is not.
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';

let started = false;

/** The DSN from the build environment, or '' when none was configured. */
export function crashReportingDsn() {
  return Constants.expoConfig?.extra?.sentryDsn || '';
}

export function isCrashReportingEnabled() {
  return started;
}

/**
 * Start crash reporting. Safe to call more than once; safe to call with no DSN.
 *
 * Called at module scope in App.js rather than inside a hook, because a crash
 * during the first render is exactly the crash worth catching and a reporter
 * started in an effect would miss it.
 */
export function initCrashReporting() {
  if (started) return true;
  const dsn = crashReportingDsn();
  if (!dsn) {
    // Expected in local development and in any build made before the DSN
    // existed. Said once, quietly, so it does not read as an error.
    console.log('[crash] No DSN configured — crash reporting is off.');
    return false;
  }

  try {
    Sentry.init({
      dsn,
      // Which build a crash came from. Without this every report from every
      // build lands in one undifferentiated pile.
      environment: Constants.expoConfig?.extra?.appVariant || 'development',
      release: Constants.expoConfig?.version,
      dist: String(
        Constants.expoConfig?.android?.versionCode
        ?? Constants.expoConfig?.ios?.buildNumber
        ?? '',
      ) || undefined,
      // Crashes only. No performance tracing and no session replay: this is a
      // field app on rural data, and neither is worth the bytes.
      tracesSampleRate: 0,
      // A vineyard is a workplace and the app holds staff timesheets, pay-rate
      // derived figures and incident records. Nothing about a person should
      // leave the device to a third party as a side effect of a stack trace.
      sendDefaultPii: false,
      beforeSend(event) {
        // Belt and braces on top of sendDefaultPii — the user object is the one
        // field that arrives populated by default.
        if (event.user) {
          event.user = { id: event.user.id };
        }
        return event;
      },
    });
    started = true;
    console.log('[crash] Crash reporting started.');
    return true;
  } catch (err) {
    console.log('[crash] Failed to start crash reporting:', err?.message);
    return false;
  }
}

/**
 * Tag the current session with who and which company, so a crash can be traced
 * to a build and a tenant. **Id only — no name, no email.**
 */
export function identifyForCrashReporting(user) {
  if (!started) return;
  try {
    Sentry.setUser(user ? { id: String(user.id) } : null);
    Sentry.setTag('company_id', user?.company_id ? String(user.company_id) : 'none');
  } catch (err) {
    console.log('[crash] identify failed:', err?.message);
  }
}

/**
 * Report something that was handled but should not have happened — a queue
 * drain that gave up, a sync that failed repeatedly. Never throws.
 */
export function reportHandledError(error, context = {}) {
  if (!started) return;
  try {
    Sentry.captureException(error, { extra: context });
  } catch (err) {
    console.log('[crash] capture failed:', err?.message);
  }
}

/**
 * Deliberately crash, to prove the pipeline end to end.
 *
 * Wiring a crash reporter and never seeing a report arrive is the normal
 * outcome, and it is indistinguishable from it working. **Build 10's test
 * sheet requires firing this once and confirming the trace lands.**
 */
export function sendTestCrash() {
  if (!started) {
    console.log('[crash] Cannot send a test crash — reporting is off.');
    return false;
  }
  Sentry.captureException(new Error('Auxein Grow test crash — ignore.'));
  return true;
}
