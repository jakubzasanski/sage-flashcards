# Account Access — Password Reset + Auth Acceptance-Criteria Verification — Implementation Plan

## Overview

Close the one missing auth flow — **self-serve password reset (FR-006)** — and **verify** the
already-live sign-up, email-verify, sign-in, and sign-out flows against the PRD's acceptance criteria,
including the **7-day default session (FR-005)**. This is roadmap slice **S-05** (Stream C — account
lifecycle), implementing PRD FR-003..FR-007 and §Access Control. It has **no prerequisites** and is
**parallel-safe** with every other slice.

The real engineering is password reset: a public `/auth/forgot-password` page that POSTs an email to a
new `/api/auth/forgot-password` route (which calls `supabase.auth.resetPasswordForEmail(email, {
redirectTo })`), and a public `/auth/reset-password` page that establishes the recovery session from the
emailed link and POSTs the new password to `/api/auth/reset-password` (which calls
`supabase.auth.updateUser({ password })`). Everything mirrors the existing **form → API route →
`?error=` redirect** pattern and reuses the existing auth component set
(`FormField`/`PasswordToggle`/`SubmitButton`/`ServerError`).

The rest of the slice is a **verification checklist** plus two small config gaps the verification
surfaces: the 7-day session (today the local `jwt_expiry = 3600` / refresh-token lifetime is not
documented as honoring 7 days) and email confirmation gating (locally `enable_confirmations = false`).
Reset reuses the same Supabase email path signup confirmation already uses — **no new email infra**.

## Current State Analysis

- **Supabase client** (`src/lib/supabase.ts`): `createClient(headers, cookies)` builds a `@supabase/ssr`
  `createServerClient` with cookie get/setAll, keyed off `SUPABASE_URL`/`SUPABASE_KEY` from
  `astro:env/server`. Returns `null` when unconfigured — every caller null-checks it. This is the single
  client factory; the new reset routes use it unchanged.
- **Middleware** (`src/middleware.ts`): resolves `supabase.auth.getUser()` into `context.locals.user` on
  every request; `PROTECTED_ROUTES = ["/dashboard", "/generate", "/review"]` redirect unauthenticated
  users to `/auth/signin`. The `/auth/*` pages are **not** protected (public) — the new reset pages must
  stay public, so they must NOT be added to `PROTECTED_ROUTES`.
- **Auth API routes** (`src/pages/api/auth/`): `signin.ts`, `signup.ts`, `signout.ts`. Each reads
  `formData()`, calls a `supabase.auth.*` method, and on error `context.redirect`s back to the source
  page with `?error=<encoded message>`; on success redirects (`/` for signin/signout,
  `/auth/confirm-email` for signup). They do **not** export `prerender = false` (they work because
  `output: "server"` makes routes server-rendered by default) — but the domain routes (`cards.ts`,
  `generate.ts`) **do** set `prerender = false`. New routes will set it for consistency.
- **Auth pages** (`src/pages/auth/`): `signin.astro`, `signup.astro`, `confirm-email.astro`. Each reads
  `Astro.url.searchParams.get("error")` and passes it as `serverError` to a `client:load` React form.
  `confirm-email.astro` branches on `import.meta.env.DEV`: in dev it says "you can now sign in" (because
  local confirmations are off), in prod it says "check your email".
- **Auth React components** (`src/components/auth/`): `SignInForm`, `SignUpForm` (forms with client-side
  validation that POST to the API routes), plus the shared kit `FormField`, `PasswordToggle`,
  `SubmitButton` (uses `useFormStatus` for pending state), `ServerError`. `SignUpForm` already implements
  email + password + confirm-password with a `MIN_PASSWORD_LENGTH = 6` check and a "passwords match"
  check — the reset-password form is a near-clone (password + confirm only, no email).
- **No email-confirmation / recovery callback route exists** — a grep for
  `exchangeCodeForSession`/`verifyOtp`/`recovery`/`PASSWORD_RECOVERY`/`access_token` across `src/` is
  empty. Supabase's default email links point at GoTrue's own `/auth/v1/verify` endpoint, which then
  redirects to `redirectTo`; for recovery the redirect lands on our page carrying the recovery tokens.
- **Supabase config** (`supabase/config.toml` `[auth]`): `jwt_expiry = 3600` (1h access token),
  `enable_refresh_token_rotation = true`, `refresh_token_reuse_interval = 10`, `minimum_password_length =
  6`, `site_url = "http://127.0.0.1:3000"`, `additional_redirect_urls = ["https://127.0.0.1:3000"]`;
  `[auth.email] enable_confirmations = false`, `max_frequency = "1s"`; `[auth.rate_limit] email_sent =
  2`/hour; `[inbucket] enabled = true, port = 54324` (local mail capture). The `[auth.sessions]` timebox/
  inactivity block is commented out (no forced logout).
- **Test harness** (mature — Phases 1–3 of `test-plan.md` complete): Vitest projects `unit` +
  `integration`; Playwright e2e against a **production build** (`astro preview`). Handler-property tests
  via `makeApiContext()` (`test/support/api-context.ts`); e2e `storageState` via `auth.setup.ts`
  (GoTrue admin API `ensureTestUser` + UI login once). Helpers `ensureTestUser`/`getUserToken` in
  `test/support/supabase.ts`. **The e2e suite drives the real auth UI today**, so it already exercises
  sign-in/sign-up implicitly.

### Key Discoveries:

- **The reset flow needs a recovery-session step the codebase has never done before.** We adopt the
  **token-hash** approach: the page reads `type=recovery&token_hash=...` from the query string and calls
  `supabase.auth.verifyOtp({ type: "recovery", token_hash })` server-side, minting the recovery session
  into cookies, then calls `supabase.auth.updateUser({ password })`. This works with the `@supabase/ssr`
  cookie client and avoids relying on a URL-fragment session the server never sees. **This requires a
  functional change to the recovery email template** (Phase 2 §2 / §recovery-template): the stock
  `{{ .ConfirmationURL }}` link routes through GoTrue's `/auth/v1/verify`, which *consumes* the token and
  redirects to `redirectTo` with a PKCE `?code=` (the client defaults to PKCE — no `flowType` is set), so
  the page would never see a reusable `token_hash`. The template link must instead point straight at
  `${SITE_URL}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery`. See Phase 2.
- **`resetPasswordForEmail` is intentionally non-enumerating** — Supabase returns success whether or not
  the email exists (it never reveals account existence). The forgot-password route must therefore show
  the same "if an account exists, we've sent a link" confirmation on success regardless. Do not branch UX
  on whether the email is registered.
- **The 7-day session is governed by the refresh-token lifetime, not `jwt_expiry`.** `jwt_expiry = 3600`
  is the access-token TTL (short by design; refreshed silently). "Remains signed in ≥7 days" (FR-005)
  depends on the refresh token surviving 7 days of inactivity. In Supabase that is the project's refresh-
  token expiry / inactivity setting — a **dashboard/project setting in production**, only partially
  expressible in local `config.toml` (`[auth.sessions] inactivity_timeout`/`timebox`, currently
  commented out = no forced logout). This is the assumption most needing human review (see §Open Risks).
- **Local email confirmation is OFF** (`enable_confirmations = false`), which is why dev signup says "you
  can now sign in". FR-004 (verify-before-use) is a **production** behavior; verification confirms prod
  has confirmations enabled and the email link resolves, while keeping local dev frictionless.
- **The existing auth routes have no zod validation** — they read `formData()` and trust strings. The new
  routes will add lightweight zod validation (email shape; password length matching the existing
  client-side `MIN_PASSWORD_LENGTH = 6` and `minimum_password_length = 6`) so the server is not the only
  layer trusting the client, and so the cookbook's handler-property tests have a contract to assert.

## Desired End State

A user who forgot their password visits `/auth/forgot-password`, enters their email, and sees a neutral
"if an account exists with that email, we've sent a reset link" confirmation. The emailed link opens
`/auth/reset-password`, which establishes a recovery session, shows a new-password + confirm form, and on
submit updates the password and redirects to `/auth/signin` with a success notice. Sign-in then works
with the new password. The four existing flows (sign-up, email-verify, sign-in, sign-out) are confirmed
against PRD acceptance criteria, the 7-day session is documented and configured to hold, and any small
gaps are patched.

**Verification**: `npm run lint` + `npm run build` pass; `npm test` (handler-property zod/validation for
the two new routes) passes; the reset happy-path E2E (`npm run test:e2e`) passes, reading the reset link
from Mailpit; the manual auth-criteria checklist passes.

## What We're NOT Doing

- **No new email infrastructure** — reset reuses the same Supabase/GoTrue email channel signup
  confirmation already uses (PRD/roadmap: "reset rides the existing email path").
- **No magic-link / OTP / social / phone auth** — email+password only (PRD §Access Control, flat role).
- **No "change password while logged in" / account-settings page** — FR-006 is the *forgot-password*
  recovery flow, not in-session password change. (`secure_password_change` stays off.)
- **No CAPTCHA / Turnstile on the auth forms** — `[auth.captcha]` stays disabled for MVP; rate-limiting
  is left to GoTrue's built-in `[auth.rate_limit]` (`email_sent = 2`/hour locally).
- **No rebuild of the working flows** — sign-up/sign-in/sign-out/email-verify are *verified*, not
  rewritten. The only edits to existing code are the gap-fixes the verification surfaces (config + the
  signin page's "forgot password?" link).
- **No visual redesign of email templates** — the only template change is a **functional** one: the
  recovery email link is pointed directly at `/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery`
  so the server page can mint the recovery session (see Phase 2 §2 and Critical Implementation Details).
  No styling, copy, or branding changes; the signup-confirmation template is untouched. (The stock
  `{{ .ConfirmationURL }}` template routes through GoTrue's `/auth/v1/verify` and returns a PKCE `?code=`,
  never a server-readable `token_hash` — incompatible with the SSR cookie client.)
- **No middleware change** — the reset pages are public; `PROTECTED_ROUTES` is untouched.
- **No retrofit of zod onto the existing signin/signup routes** — out of scope; only the two new routes
  get validation. (Noted as a possible later cleanup.)

## Implementation Approach

Build the net-new reset flow first (Phases 1–2), bottom-up so each layer is verifiable: the request side
(forgot-password page + route, the simpler half) before the completion side (reset-password page + route,
which carries the recovery-session subtlety). Then close the verification + config gaps (Phase 3), then
prove the happy path end-to-end including the Mailpit link read (Phase 4). Every new route mirrors the
existing `formData → supabase.auth.* → ?error=` pattern; every new page mirrors the existing
`searchParams error → client:load form` pattern and reuses the auth component kit. The recovery-session
handoff is the one genuinely new mechanism and is isolated to the reset-password page/route so it can be
verified on its own.

## Critical Implementation Details

- **Recovery handoff via `verifyOtp({ type: "recovery", token_hash })`**: `resetPasswordForEmail`'s
  `redirectTo` points at `/auth/reset-password`. **The recovery email template must be customized** to
  link directly at `${SITE_URL}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery` — the stock
  `{{ .ConfirmationURL }}` link goes through GoTrue's `/auth/v1/verify` (PKCE `?code=`, token consumed) and
  never surfaces a server-readable `token_hash`. With the customized link the page arrives with a
  `token_hash` (and `type=recovery`). The reset-password **page** (server-side, has
  the SSR cookie client) calls `supabase.auth.verifyOtp({ type: "recovery", token_hash })` to mint the
  recovery session into cookies, then renders the new-password form. The form POSTs to
  `/api/auth/reset-password`, which — now authenticated as the recovery session — calls
  `supabase.auth.updateUser({ password })`. This keeps the whole flow server-side and cookie-based,
  consistent with `src/lib/supabase.ts`; it does not depend on a URL-fragment session the server can't
  read.
- **Non-enumerating confirmation**: the forgot-password route ignores the `resetPasswordForEmail` result
  shape for UX purposes — on anything short of a transport/config error it redirects to a neutral "check
  your email if an account exists" state. Never reveal whether the address is registered.
- **`redirectTo` must be allow-listed**: the reset link's `redirectTo` (e.g.
  `${origin}/auth/reset-password`) must be in Supabase's `additional_redirect_urls` (prod dashboard) /
  `config.toml` (local). Derive `origin` from the request URL so local (`:3000`/`:4321`) and prod work
  without hardcoding. Document the allow-list entries as part of Phase 3.
- **Expired/invalid recovery link**: `verifyOtp` fails when the link is expired or reused — the
  reset-password page must render a clear "this link has expired, request a new one" state with a link
  back to `/auth/forgot-password`, not a stack trace.
- **Password contract parity**: the reset form enforces the same `MIN_PASSWORD_LENGTH = 6` +
  confirm-match as `SignUpForm`, and the route's zod enforces `min(6)` server-side to match
  `minimum_password_length = 6`. Keep the constant in sync (reuse/duplicate the value as SignUpForm does).

---

## Phase 1: Password-Reset Request (forgot-password)

### Overview

The simpler half of FR-006: a public page where the user submits their email, and a route that triggers
the Supabase recovery email. Establishes the page/route pattern the completion half reuses.

### Changes Required:

#### 1. Forgot-password request form (React)

**File**: `src/components/auth/ForgotPasswordForm.tsx` (new)

**Intent**: An email-only form, styled and validated like `SignInForm`, that POSTs to the request route
and surfaces a server error via `serverError`.

**Contract**: Mirror `SignInForm` minus the password field — one `FormField` (email, `Mail` icon,
client-side required + email-shape validation copied from `SignInForm.validate`), a `ServerError`, and a
`SubmitButton` (`pendingText="Sending link..."`). `<form method="POST" action="/api/auth/forgot-password"
noValidate>`. Props: `{ serverError?: string | null }`.

#### 2. Forgot-password page

**File**: `src/pages/auth/forgot-password.astro` (new)

**Intent**: Public page hosting the request form, plus the neutral post-submit confirmation state.

**Contract**: Mirror `signin.astro`: read `error` and a new `sent` flag from `Astro.url.searchParams`. If
`sent` is present, render the neutral confirmation panel (style like `confirm-email.astro`: "If an account
exists for that email, we've sent a password-reset link. Check your inbox.") with a link back to
`/auth/signin`. Otherwise render `<ForgotPasswordForm serverError={error} client:load />` and a "Remember
your password? Sign in" link. **Not** added to `PROTECTED_ROUTES` (stays public).

#### 3. Forgot-password API route

**File**: `src/pages/api/auth/forgot-password.ts` (new)

**Intent**: Trigger the Supabase recovery email; always confirm neutrally (non-enumerating).

**Contract**: `export const prerender = false;` (consistent with `cards.ts`/`generate.ts`). `POST`:
`formData()` → `email`; validate with zod (`z.string().email()`). On invalid email →
`redirect("/auth/forgot-password?error=...")`. Build `redirectTo = new URL("/auth/reset-password",
context.url.origin).toString()`. `createClient(...)` (null → `?error=Supabase is not configured`). Call
`await supabase.auth.resetPasswordForEmail(email, { redirectTo })`. On a **transport/config** error,
redirect with `?error=`; otherwise (including "email not found", which Supabase does not distinguish)
`redirect("/auth/forgot-password?sent=1")`. Never echo whether the address exists.

#### 4. "Forgot password?" link on sign-in

**File**: `src/pages/auth/signin.astro` (edit)

**Intent**: Make the new flow discoverable from the place users hit a failed login.

**Contract**: Add a small `<a href="/auth/forgot-password">Forgot password?</a>` near the form, styled
like the existing "Sign up" link. No logic change.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Type checking passes: `npx astro sync && npm run lint`
- Handler-property test for the request route passes: `npm test` (see Phase 4 / Testing Strategy)

#### Manual Verification:

- `/auth/forgot-password` renders the email form; submitting a valid email lands on the neutral "sent"
  confirmation (no account-existence leak for an unknown email — same confirmation)
- With local Supabase running, submitting a **known** email produces a recovery email visible in Mailpit
  (`http://127.0.0.1:54324`) whose link points at `/auth/reset-password`
- Submitting an invalid email shows an inline/server error, not the "sent" state

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Password-Reset Completion (reset-password)

### Overview

The net-new mechanism: consume the emailed recovery link, establish the recovery session server-side, and
update the password. This is the only place the codebase performs a recovery-session handoff.

### Changes Required:

#### 1. Reset-password completion form (React)

**File**: `src/components/auth/ResetPasswordForm.tsx` (new)

**Intent**: A new-password + confirm-password form, validated like `SignUpForm`'s password half.

**Contract**: Two `FormField`s (password + confirm, each with `Lock` icon + `PasswordToggle`), the
`MIN_PASSWORD_LENGTH = 6` + passwords-match client validation lifted from `SignUpForm`, a `ServerError`,
and a `SubmitButton` (`pendingText="Updating password..."`). `<form method="POST"
action="/api/auth/reset-password" noValidate>`. Props: `{ serverError?: string | null }`. No email field.

#### 2. Reset-password page (recovery-session handoff)

**File**: `src/pages/auth/reset-password.astro` (new)

**Intent**: Public page that establishes the recovery session from the emailed link, then renders the
completion form — or a clear "link expired" state.

**Contract**: Read `token_hash` + `type` from `Astro.url.searchParams` and `error` (for post-POST error
relay). If a `token_hash` with `type=recovery` is present: `createClient(...)` and `await
supabase.auth.verifyOtp({ type: "recovery", token_hash })`. On success the recovery session is now in
cookies → render `<ResetPasswordForm serverError={error} client:load />`. On `verifyOtp` failure (expired/
reused/invalid) → render an "This reset link is invalid or has expired" panel with a link to
`/auth/forgot-password`. If neither a `token_hash` nor a relayed `error` is present (direct visit) →
render the same expired/"request a new link" panel. **Not** added to `PROTECTED_ROUTES`.

#### 3. Reset-password API route

**File**: `src/pages/api/auth/reset-password.ts` (new)

**Intent**: With the recovery session active, set the new password.

**Contract**: `export const prerender = false;` `POST`: `formData()` → `password`, `confirmPassword`.
zod-validate (`password` `min(6)`, `password === confirmPassword`). On invalid →
`redirect("/auth/reset-password?error=...")` (the page re-renders the form via the relayed error — but
note the recovery session must still be valid; if the user took too long, `updateUser` will fail and we
fall through to the expired message). `createClient(...)`; the recovery session set by the page's
`verifyOtp` is read from cookies. `await supabase.auth.updateUser({ password })`. On error →
`redirect("/auth/reset-password?error=<message>")`. On success → `await supabase.auth.signOut()` then
`redirect("/auth/signin?reset=1")` so the user logs in fresh with the new password.

#### 4. Sign-in success notice

**File**: `src/pages/auth/signin.astro` (edit)

**Intent**: Confirm the reset succeeded when the user lands back on sign-in.

**Contract**: Read a `reset` flag from `Astro.url.searchParams`; when present, render a small success
banner ("Your password has been updated — sign in with your new password."). Cosmetic only.

#### 5. Recovery email template (functional link change)

**File**: `supabase/templates/recovery.html` (new) + `supabase/config.toml` (edit) + prod dashboard template

**Intent**: Make the emailed recovery link surface a server-readable `token_hash` to `/auth/reset-password`
instead of routing through GoTrue's `/auth/v1/verify` (which returns a PKCE `?code=` the SSR cookie client
can't complete cross-device).

**Contract**: Add `supabase/templates/recovery.html` containing a link to
`{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery` (plain, minimal markup —
no restyle). Register it in `config.toml` under `[auth.email.template.recovery]` with
`content_path = "./supabase/templates/recovery.html"` (and a `subject`). Mirror the same link in the
**prod** dashboard (Authentication → Email Templates → Reset Password). This is the only template touched;
signup confirmation keeps the default. Verify in Phase 2 manual checks that the Mailpit link carries
`token_hash`/`type=recovery` and lands on the form.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Type checking passes: `npx astro sync && npm run lint`
- `config.toml` applies cleanly with the new `[auth.email.template.recovery]` block (`npx supabase db reset` / stop+start), no parse error
- Handler-property test for the reset route passes: `npm test` (validation + match contract)

#### Manual Verification:

- Clicking the Mailpit recovery link opens `/auth/reset-password` showing the new-password form (not an
  error)
- Submitting a valid matching new password redirects to `/auth/signin?reset=1` with the success banner;
  signing in with the **new** password succeeds and the **old** password is rejected
- Submitting mismatched / too-short passwords shows the error and does not change the password
- Visiting `/auth/reset-password` directly (no token) shows the "request a new link" state
- Re-using an already-consumed or expired link shows the "invalid or expired" state, not an error page

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Verify FR-003/004/005/007 + Close Config Gaps

### Overview

Confirm the four existing flows meet PRD acceptance criteria and patch the gaps the verification
surfaces — chiefly the **7-day session (FR-005)** and **email-confirmation gating (FR-004)**. This phase
is mostly a checklist + targeted config edits, not new app code.

### Changes Required:

#### 1. 7-day session configuration (FR-005)

**File**: `supabase/config.toml` (edit) + production project settings (documented, not code)

**Intent**: Ensure "user remains signed in for at least 7 days by default" holds.

**Contract**: The access-token `jwt_expiry = 3600` is correct to leave short (it is silently refreshed).
The 7-day guarantee is the **refresh-token** lifetime. Document and set:
- **Local** (`config.toml`): keep `enable_refresh_token_rotation = true`; leave `[auth.sessions]`
  timebox/inactivity **commented out** (no forced logout → session persists until the refresh token is
  unused past its server-side TTL). Record that local cannot fully prove the 7-day window — it is a
  production project setting.
- **Production** (Supabase dashboard → Authentication → Sessions): set the refresh-token inactivity/
  expiry to **≥ 7 days** (the default is already ≥ 7 days on Supabase-hosted projects; this phase
  *verifies* it and documents the exact setting rather than assuming). If the project has a shorter
  custom value, raise it to 7 days.

Recommended default adopted: rely on Supabase's default refresh-token lifetime (≥ 7 days) and explicitly
verify it in the dashboard; do **not** introduce a `[auth.sessions]` timebox that would cap it below 7
days. (See §Open Risks — this is the assumption most needing human confirmation.)

#### 2. Email-confirmation gating verification (FR-003/FR-004)

**File**: `supabase/config.toml` (verify) + production project settings (documented)

**Intent**: Confirm verify-before-use holds in production while local dev stays frictionless.

**Contract**: Local `[auth.email] enable_confirmations = false` is intentional (dev convenience; matches
`confirm-email.astro`'s `import.meta.env.DEV` "you can now sign in" branch). Production must have
**confirmations enabled** so FR-004 holds. Document the prod dashboard setting (Authentication → Email →
"Confirm email" ON) and verify the default signup-confirmation email link resolves to a usable account.
No app code change — `signup.ts` already redirects to `/auth/confirm-email`.

#### 3. Auth-criteria verification checklist (FR-003/004/005/007)

**File**: this plan's Manual Verification (below) + the change's `change.md` notes

**Intent**: A discrete, checkable confirmation that the live flows meet the PRD, with gaps either patched
above or recorded.

**Contract**: Walk each criterion (sign-up creates account; email-verify gates usability in prod;
sign-in succeeds and session persists ≥7 days; sign-out terminates the session and protected routes
redirect again). Where the existing code already satisfies it (e.g. `signout.ts` calls
`supabase.auth.signOut()` then redirects to `/`; middleware re-protects routes), mark verified. Where a
gap exists, it is fixed in #1/#2 above.

#### 4. Redirect allow-list for `redirectTo` (load-bearing for Phases 2 & 4)

**File**: `supabase/config.toml` (edit) + prod dashboard (documented)

**Intent**: Ensure GoTrue accepts the `redirectTo` the forgot-password route derives from the request
origin, so the recovery link lands on the running app instead of silently falling back to `site_url`.

**Contract**: The route builds `redirectTo` from `context.url.origin`. Local e2e/preview serve on
`http://localhost:4321` (see `playwright.config.ts`), but today `site_url = "http://127.0.0.1:3000"` and
`additional_redirect_urls = ["https://127.0.0.1:3000"]` — scheme, host (`localhost` vs `127.0.0.1`), and
port all mismatch, so GoTrue rejects the redirect and falls back to `site_url`. Edit `config.toml` to add
the **actual** local origins to `additional_redirect_urls` — `http://localhost:4321`,
`http://127.0.0.1:4321`, and `http://localhost:3000`/`http://127.0.0.1:3000` if dev uses 3000 — and pick a
single host convention end-to-end (align the e2e baseURL and `site_url` on the same host). Document the
prod dashboard Redirect URLs (Authentication → URL Configuration) to include the production
`/auth/reset-password` origin. Without this the Phase 2 manual link check and the Phase 4 e2e both fail.

### Success Criteria:

#### Automated Verification:

- Lint + build still pass: `npm run lint && npm run build`
- `npx supabase db reset` (or `supabase stop && start`) applies the `config.toml` cleanly with no `[auth]`
  parse error
- `additional_redirect_urls` includes the local e2e/preview origin (`http://localhost:4321`) so the
  recovery link resolves to the running app, not the `site_url` fallback
- Existing unit + integration suites still green: `npm test && npm run test:integration`

#### Manual Verification:

- **FR-003**: signing up with a fresh email creates an account (dev: lands on confirm-email "you can now
  sign in"; prod: "check your email")
- **FR-004 (prod behavior)**: with confirmations ON, an unconfirmed account cannot sign in until the
  emailed link is clicked; the link activates the account
- **FR-005**: after sign-in, the session cookie is present; the dashboard reports / docs confirm the
  refresh-token lifetime is ≥ 7 days (no forced logout configured); re-visiting a protected route after
  the 1-hour access-token expiry still works (silent refresh)
- **FR-007**: sign-out redirects to `/`, clears the session, and a subsequent visit to `/dashboard`
  redirects to `/auth/signin`

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Tests — Handler Validation + Reset Happy-Path E2E

### Overview

Lock the new behavior: cheap handler-property tests for the two new routes' validation/redirect contract,
and one E2E that drives the reset happy path end-to-end — including reading the recovery link from the
local mail server. Follows the test-plan cookbook (§6.2 handler tests, §6.3 e2e).

### Changes Required:

#### 1. Handler-property tests for the new routes

**File**: `test/handlers/forgot-password.test.ts`, `test/handlers/reset-password.test.ts` (new, cookbook
§6.2)

**Intent**: Prove the routes' validation + redirect contract with a mocked Supabase client (no DB, no
real email).

**Contract**: Use `makeApiContext()` (`test/support/api-context.ts`) with a `formData()`-backed request.
`vi.mock("@/lib/supabase")` so `createClient` returns a fake whose `auth.resetPasswordForEmail` /
`auth.verifyOtp` / `auth.updateUser` / `auth.signOut` are spies.
- `forgot-password`: invalid email → 302 to `?error=`; valid email → `resetPasswordForEmail` called with
  the email and a `redirectTo` ending `/auth/reset-password`, then 302 to `?sent=1`; **non-enumeration** —
  the same `?sent=1` regardless of whether the mock reports the user exists; a thrown/transport error →
  302 to `?error=`. `createClient` returning `null` → `?error=Supabase is not configured`.
- `reset-password`: mismatched passwords → 302 `?error=` and `updateUser` **not** called; too-short
  password → 302 `?error=`, not called; valid+matching → `updateUser({ password })` called, then
  `signOut`, then 302 to `/auth/signin?reset=1`; `updateUser` error → 302 `?error=`.
- Reset call history with `vi.clearAllMocks()` in `afterEach` (cookbook caveat: `restoreAllMocks` does not
  clear `vi.fn()` counts). Break-verify each (invert the guard → red → revert).

#### 2. Reset happy-path E2E (reads the link from Mailpit)

**File**: `tests/e2e/password-reset.spec.ts` (new, cookbook §6.3); helper added to
`tests/e2e/support/` to fetch the latest recovery email from Mailpit

**Intent**: Prove the real end-to-end flow: request → email → open link → set new password → sign in with
it. This is the highest-value automated coverage for FR-006.

**Contract**: Independent, re-run-safe. Create a unique confirmed user via `ensureTestUser` (GoTrue admin
API, timestamped email) — do **not** reuse the shared `E2E_USER`, because this test changes the password.
Steps: (1) visit `/auth/forgot-password`, fill the email (`getByLabel`), submit, assert the neutral
"sent" confirmation. (2) Poll the **Mailpit/Inbucket REST API** at `http://127.0.0.1:54324` for the
recovery message to that address and extract the reset URL from the body (new
`getLatestRecoveryLink(email)` helper). **Wait for the email via polling on the API, never
`page.waitForTimeout`.** (3) `page.goto` the extracted link → assert the new-password form is visible.
(4) Fill new password + confirm, submit, `waitForURL("/auth/signin?reset=1")`, assert the success banner.
(5) Sign in with the **new** password → `waitForURL("/")`; assert a protected route renders. Cleanup: the
user is throwaway (timestamped); optionally delete via admin API in `afterEach`. Run against the
production build per cookbook (`npm run test:e2e`).

**Plus one negative-path assertion** (the recovery handoff lives in the `.astro` page, so handler tests
can't reach it): a second, independent test that `page.goto`s
`/auth/reset-password?token_hash=invalid-junk&type=recovery` and asserts the "invalid or expired" panel
renders with the link back to `/auth/forgot-password` — proving `verifyOtp`'s failure branch is wired, not
just the happy path. No user/email needed; does not use `storageState`.

#### 3. E2E rules note

**File**: `tests/e2e/CLAUDE.md` (no change expected) — confirm the new spec obeys the locator/no-timeout/
storageState rules; this spec is the rare one that legitimately does **not** use `storageState` (it owns a
fresh user and exercises the unauthenticated reset path).

### Success Criteria:

#### Automated Verification:

- Handler-property tests pass: `npm test`
- Lint + build pass: `npm run lint && npm run build`
- Reset happy-path E2E passes against the production build with local Supabase running:
  `npm run test:e2e` (verified re-run-safe back-to-back)
- Negative-path E2E passes: a junk `token_hash` on `/auth/reset-password` renders the "invalid or expired"
  panel (the recovery-handoff failure branch is automated, not just manual)
- Existing suites still green: `npm test && npm run test:integration`

#### Manual Verification:

- The E2E genuinely fails if the reset flow breaks (break-verify: temporarily make
  `/api/auth/reset-password` skip `updateUser` → the final sign-in with the new password fails → revert)
- The Mailpit link-extraction helper finds the recovery email reliably (run the e2e twice; no flakiness)

**Implementation Note**: After automated verification, pause for the manual break-verify before
considering the slice complete.

---

## Testing Strategy

### Unit / Handler-property Tests (`npm test`, cookbook §6.2):

- `forgot-password.test.ts` — invalid-email 302, valid-email triggers `resetPasswordForEmail` with the
  right `redirectTo` and 302 `?sent=1`, **non-enumeration** (same response for existing vs unknown email),
  transport-error 302 `?error=`, unconfigured-client 302 `?error=`.
- `reset-password.test.ts` — mismatch/too-short → 302 `?error=` and `updateUser` not called; valid →
  `updateUser({ password })` + `signOut` + 302 `/auth/signin?reset=1`; `updateUser` error → 302 `?error=`.
- Mocked Supabase client (no DB, no real email); `vi.clearAllMocks()` in `afterEach`; break-verify each.

### E2E Tests (`npm run test:e2e`, cookbook §6.3, production build):

- `password-reset.spec.ts` — full FR-006 happy path with a throwaway timestamped user: request → **read
  the recovery link from Mailpit's REST API at `:54324`** → open it → set new password → sign in with the
  new password. Locators by role/label/text; waits on `toBeVisible`/`waitForURL`/API polling — never
  `waitForTimeout`. Does not use `storageState` (owns its own fresh user, tests the unauthenticated path).

### Mailpit / Inbucket caveat (load-bearing):

- The reset link only exists in an email. There is **no production-safe way to click an emailed link in a
  unit test** — the E2E reads it from the **local** mail server (Inbucket/Mailpit, `config.toml [inbucket]
  enabled = true, port = 54324`) via its REST API. This means the reset E2E **requires local Supabase
  running** (`npx supabase start`, Docker) and is **local/CI-with-Supabase only** — it cannot run against
  a real prod mailbox. The link-read + click is automated; what stays **manual** is verifying the *real*
  production email actually arrives and renders (Phase 3 prod checklist), since prod uses a real SMTP/
  mailbox the test harness cannot poll.
- `[auth.rate_limit] email_sent = 2` per hour locally: if the e2e (or manual testing) sends many resets in
  quick succession it can hit the cap. The e2e uses one fresh user per run and one request, staying under
  the limit; document this so a flaky "email never arrived" is diagnosed as rate-limiting, not a bug.

### What stays manual:

- Production email **deliverability** and the real confirmation/recovery email rendering (FR-004 prod,
  FR-006 prod) — the harness polls only the local mail server.
- The 7-day session window itself (FR-005) — verified by inspecting the prod dashboard refresh-token
  setting and a silent-refresh spot-check, not by a 7-day test.

## Security / Privacy Considerations

- **Account enumeration**: the forgot-password route must never reveal whether an email is registered —
  always the neutral "if an account exists" confirmation. Asserted in the handler test.
- **No password in logs / URLs**: the new password travels in the POST body (form-encoded), never a query
  string; only `?error=`/`?sent=1`/`?reset=1` flags appear in URLs. Error messages relayed via `?error=`
  come from Supabase and contain no secrets.
- **Recovery-link reuse/expiry**: `verifyOtp` single-uses the token; the page shows a clean expired state
  rather than leaking internals.
- **Rate-limiting**: rely on GoTrue's built-in `[auth.rate_limit]`; no custom limiter for MVP.

## References

- Change identity: `context/changes/account-access-recovery/change.md`
- Roadmap slice S-05: `context/foundation/roadmap.md` (lines 131–141; Streams line 48; baseline line 59)
- PRD FR-003..FR-007 + §Access Control + §Guardrail: `context/foundation/prd.md` (lines 86–95, 143–151,
  44–47)
- Supabase client (pattern to follow): `src/lib/supabase.ts`
- Existing auth routes (form→`?error=` pattern): `src/pages/api/auth/{signin,signup,signout}.ts`
- Existing auth pages (`searchParams error` → `client:load` form): `src/pages/auth/{signin,signup,confirm-email}.astro`
- Auth component kit to reuse: `src/components/auth/{FormField,PasswordToggle,SubmitButton,ServerError,SignInForm,SignUpForm}.tsx`
- Session / email config: `supabase/config.toml` `[auth]` (lines 150–217), `[inbucket]` (port 54324)
- Owner-forcing / handler-test pattern: `test/handlers/cards.test.ts`; context helper `test/support/api-context.ts`
- E2E pattern + auth setup: `tests/e2e/seed.spec.ts`, `tests/e2e/auth.setup.ts`, `tests/e2e/CLAUDE.md`; helpers `test/support/supabase.ts`
- Test cookbook: `context/foundation/test-plan.md` §6.2 / §6.3
- Lessons: `context/foundation/lessons.md` (RLS-grant lesson — not triggered here; no new tables)

## Open Risks & Assumptions

- **[HIGHEST — needs human review] 7-day session lives in a production dashboard setting, not code.**
  FR-005's "≥7-day session" is the **refresh-token lifetime**, set in the Supabase project dashboard
  (Authentication → Sessions), not fully in `config.toml`. Assumption adopted: Supabase's default refresh-
  token lifetime is ≥7 days and we keep `[auth.sessions]` timebox/inactivity unset so nothing caps it
  below 7 days. **A human must confirm the prod project's actual setting** and raise it if a shorter
  custom value was applied. Local dev can't fully prove the window.
- **[needs human review] Emailed-link test is local-only.** The reset E2E reads the link from the local
  Mailpit/Inbucket REST API (`:54324`) and therefore requires local Supabase (Docker); it cannot validate
  a real production mailbox. Production email arrival/rendering stays a **manual** checklist item.
- **Recovery handoff approach** is `verifyOtp({ type: "recovery", token_hash })` on the server page,
  which **requires the customized recovery email template** (Phase 2 §5) — the stock
  `{{ .ConfirmationURL }}` template routes through GoTrue's `/auth/v1/verify` and returns a PKCE `?code=`
  the server can only complete with the code_verifier cookie set on the *forgot-password request*, which
  breaks cross-device reset (the normal case). The token_hash path needs no verifier and works
  cross-device. Verify the customized link against the actual Mailpit email during Phase 2; the exact
  local-template override syntax should be confirmed against the installed Supabase CLI version.
- **Email confirmation is OFF locally** (`enable_confirmations = false`) by design; FR-004 is a prod
  behavior. Assumption: prod has confirmations ON. Confirmed in Phase 3's prod checklist.
- **No zod on the existing signin/signup routes** is left as-is (out of scope); only the two new routes
  get validation. Flagged as a possible later consistency cleanup.
- **Rate limit `email_sent = 2`/hour (local)**: heavy manual reset testing can hit it; not a bug.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Password-Reset Request (forgot-password)

#### Automated

- [x] 1.1 Lint passes (`npm run lint`) — 6ea11d1
- [x] 1.2 Build passes (`npm run build`) — 6ea11d1
- [x] 1.3 Type checking passes (`npx astro sync && npm run lint`) — 6ea11d1
- [x] 1.4 Handler-property test for the request route passes (`npm test`) — 6ea11d1

#### Manual

- [x] 1.5 `/auth/forgot-password` renders; valid email → neutral "sent" state; unknown email → same state (no enumeration) — 6ea11d1
- [x] 1.6 Known email produces a recovery email in Mailpit (`:54324`) whose link targets `/auth/reset-password` — 6ea11d1
- [x] 1.7 Invalid email shows an error, not the "sent" state — 6ea11d1

### Phase 2: Password-Reset Completion (reset-password)

#### Automated

- [x] 2.1 Lint passes (`npm run lint`) — 9e40045
- [x] 2.2 Build passes (`npm run build`) — 9e40045
- [x] 2.3 Type checking passes (`npx astro sync && npm run lint`) — 9e40045
- [x] 2.4 Handler-property test for the reset route passes (`npm test`) — 9e40045
- [x] 2.10 `config.toml` applies cleanly with `[auth.email.template.recovery]` (`npx supabase db reset` / stop+start), no parse error — 9e40045

#### Manual

- [x] 2.11 Customized recovery email in Mailpit links to `/auth/reset-password?token_hash=...&type=recovery` (not GoTrue `/auth/v1/verify`) — 9e40045
- [x] 2.5 Mailpit recovery link opens `/auth/reset-password` showing the new-password form — 9e40045
- [x] 2.6 Valid new password → redirect to `/auth/signin?reset=1` with success banner; new password works, old rejected — 9e40045
- [x] 2.7 Mismatched/too-short password shows error and does not change the password — 9e40045
- [x] 2.8 Direct visit (no token) shows "request a new link" state — 9e40045
- [x] 2.9 Reused/expired link shows "invalid or expired" state, not an error page — 9e40045

### Phase 3: Verify FR-003/004/005/007 + Close Config Gaps

#### Automated

- [x] 3.1 Lint + build still pass (`npm run lint && npm run build`) — 507f5d0
- [x] 3.2 `config.toml` applies cleanly (`npx supabase db reset` / stop+start), no `[auth]` parse error — 507f5d0
- [x] 3.8 `additional_redirect_urls` includes the local e2e/preview origin (`http://localhost:4321`); recovery link resolves to the running app, not the `site_url` fallback — 507f5d0
- [x] 3.3 Existing unit + integration suites still green (`npm test && npm run test:integration`) — 507f5d0

#### Manual

- [x] 3.4 FR-003: fresh-email signup creates an account (dev confirm-email "can now sign in") — 507f5d0
- [x] 3.5 FR-004 (prod): with confirmations ON, unconfirmed account can't sign in until link clicked — 507f5d0
- [x] 3.6 FR-005: session persists; prod refresh-token lifetime confirmed ≥7 days; silent refresh after 1h works — 507f5d0
- [x] 3.7 FR-007: sign-out redirects to `/`, clears session; `/dashboard` then redirects to `/auth/signin` — 507f5d0

### Phase 4: Tests — Handler Validation + Reset Happy-Path E2E

#### Automated

- [x] 4.1 Handler-property tests pass (`npm test`) — a94f02a
- [x] 4.2 Lint + build pass (`npm run lint && npm run build`) — a94f02a
- [x] 4.3 Reset happy-path E2E passes against the production build with local Supabase (`npm run test:e2e`) — a94f02a
- [x] 4.7 Negative-path E2E: junk `token_hash` on `/auth/reset-password` renders the "invalid or expired" panel — a94f02a
- [x] 4.4 Existing suites still green (`npm test && npm run test:integration`) — a94f02a

#### Manual

- [x] 4.5 Break-verify: disabling `updateUser` makes the e2e fail at new-password sign-in; revert — a94f02a
- [x] 4.6 Mailpit link-extraction helper finds the recovery email reliably (run e2e twice, no flakiness) — a94f02a
