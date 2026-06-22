---
change_id: account-access-recovery
title: Account access — password reset + auth acceptance-criteria verification
status: implemented
created: 2026-06-21
updated: 2026-06-22
archived_at: null
---

## Notes

Roadmap slice **S-05** (Stream C — account lifecycle). Standalone: **no
prerequisites** and **parallel-safe** with F-01, S-01, S-02, S-03, S-04 — auth
completion has no data dependency on the card layer (`roadmap.md` lines 131–141,
Streams table line 48).

Outcome (from roadmap.md): user can request an emailed password-reset link and
complete the reset (the one absent auth flow), and the existing sign-up,
email-verify, sign-in, and sign-out flows are confirmed to meet the PRD's
acceptance criteria — including the 7-day default session.

- PRD refs: FR-003 (sign-up), FR-004 (email verify), FR-005 (sign-in + ≥7-day
  session), FR-006 (password reset — **net-new**), FR-007 (sign-out); §Access
  Control; §Guardrail "no data loss".
- Net-new work is **FR-006 password reset** (absent today). The rest is verifying
  the live auth baseline against PRD criteria and patching any gaps.
- Reset rides Supabase's existing email path (signup-confirmation emails already
  work in production), so **no new email infrastructure** is needed — keeps the
  slice small and independent.
- Open decisions deferred to /10x-plan (resolved with recommended defaults, see
  plan §Open Risks & Assumptions): the 7-day session is governed by the
  **refresh-token lifetime** (a Supabase project/dashboard setting in prod, only
  partially expressible in local `config.toml`), and the emailed-link step of the
  reset E2E requires the local mail server (Inbucket/Mailpit at `:54324`).

## Auth-criteria verification (Phase 3, 2026-06-22)

Existing flows verified against PRD acceptance criteria; config gaps closed in
`supabase/config.toml` (commit-documented inline).

- **FR-003 (sign-up)** — verified. `signup.ts` calls `auth.signUp` and redirects to
  `/auth/confirm-email`; dev shows "you can now sign in", prod "check your email".
- **FR-004 (email verify, prod behavior)** — verified by design. Local
  `enable_confirmations = false` (dev convenience); **prod must have "Confirm email"
  ON** (documented inline in config.toml). No app change — verify-before-use is a
  GoTrue setting.
- **FR-005 (sign-in + ≥7-day session)** — verified/configured. `jwt_expiry = 3600`
  is the access token (refreshed silently); the 7-day guarantee is the
  refresh-token lifetime. Kept `enable_refresh_token_rotation = true` and left
  `[auth.sessions]` timebox/inactivity commented out so nothing caps the window.
  **Prod action: confirm dashboard refresh-token expiry ≥7 days** (Authentication →
  Sessions). Local cannot fully prove the window — documented as the highest open risk.
- **FR-007 (sign-out)** — verified. `signout.ts` calls `auth.signOut()` then redirects
  to `/`; middleware re-protects `PROTECTED_ROUTES` (redirects to `/auth/signin`).
- **Redirect allow-list (§4)** — `additional_redirect_urls` now includes the local
  e2e/preview origin `http://localhost:4321` (+ `127.0.0.1`/`:3000` variants), and
  `site_url` aligned to `http://localhost:4321` so the recovery email link
  (`{{ .SiteURL }}/auth/reset-password`) resolves to the running app. **Prod action:
  add the production `/auth/reset-password` origin to the dashboard Redirect URLs.**
