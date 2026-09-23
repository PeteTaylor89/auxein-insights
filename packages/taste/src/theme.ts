// T1 — theme runtime.
//
// The stylesheet does the actual work: dark mode is a token flip in index.css,
// driven by `prefers-color-scheme` plus a `data-theme` attribute on <html>.
// This module only owns the attribute, the stored preference, and the
// browser-chrome colour that has to match the page behind it.
//
// 'system' is the default and means "no attribute" — the media query decides.

export type Theme = 'system' | 'light' | 'dark';

const KEY = 'taste:theme';

// Must match --bg in index.css for each theme, or the iOS status bar and the
// Android chrome sit in a visibly different colour from the page.
const CHROME: Record<'light' | 'dark', string> = {
  light: '#f6f1e7',
  dark: '#17120f',
};

export function getStoredTheme(): Theme {
  // Private mode / blocked site data throws on access, and an installed PWA is
  // exactly where that bites — never let it take the app down.
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* no stored preference available — fall through to system */
  }
  return 'system';
}

/** What the user will actually see right now, with 'system' resolved. */
export function resolvedTheme(theme: Theme = getStoredTheme()): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  // index.html ships two media-scoped theme-color metas so first paint is right
  // before this runs. On an explicit choice we set BOTH to the same colour —
  // browsers disagree about which media-scoped tag wins, and making them agree
  // sidesteps that entirely. On 'system' we restore the per-scheme values.
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  metas.forEach((m) => {
    const media = m.getAttribute('media');
    const scheme: 'light' | 'dark' =
      theme === 'system' ? (media && media.includes('dark') ? 'dark' : 'light') : resolvedTheme(theme);
    m.setAttribute('content', CHROME[scheme]);
  });
}

export function setTheme(theme: Theme): void {
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    /* preference won't survive a reload, but the flip still applies below */
  }
  applyTheme(theme);
}

/**
 * Call once before render. Also tracks the OS setting while 'system' is
 * selected, so the app follows a sunset/sunrise switch without a reload.
 */
export function initTheme(): void {
  applyTheme(getStoredTheme());
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', () => {
      if (getStoredTheme() === 'system') applyTheme('system');
    });
  } catch {
    /* matchMedia unavailable — the stored/default theme still applied */
  }
}
