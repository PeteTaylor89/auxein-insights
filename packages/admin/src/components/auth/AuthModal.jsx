// src/components/auth/AuthModal.jsx — deliberate no-op shim.
//
// `ArticleSurfaceMap` renders an <AuthModal> to catch the anonymous reader who
// hits the archive gate: on the public Insights site, scrubbing back past the
// newest surface step prompts them to create an account.
//
// That gate cannot fire here. Every viewer on this origin has already cleared
// AdminRoute, which requires `public_users.is_admin` — so they are signed in,
// entitled, and the server returns the full step list. Rendering the real modal
// would mean importing the public auth stack (AuthModal -> LoginForm +
// SignupForm + ForgotPasswordForm + PasswordResetModal + LegalModal +
// LegalContent + PublicAuthContext + publicAuthService + analytics: ~2,400 LOC)
// purely so that a branch which never executes has something to render.
//
// That also violates two Phase 1 decisions on purpose-built grounds: the auth UI
// was forked to LOGIN ONLY (no signup path on a staff origin), and this origin
// carries no analytics. So: shim.
//
// If a future admin screen genuinely needs a sign-up or account-switch modal,
// build it against AdminAuthContext — do not resurrect the Insights one.
export default function AuthModal() {
  return null;
}
