---
change_id: post-login-redirect
title: Authenticated-user routing — land on /dashboard, keep guest pages out of reach
status: archived
created: 2026-06-23
updated: 2026-06-23
archived_at: 2026-06-23T12:54:22Z
---

## Notes

send users to /dashboard after sign-in instead of the marketing landing page at /

Follow-up: authenticated users should not see guest pages either. When logged in, the
landing (`/`), sign-in, sign-up, and forgot-password pages should redirect to /dashboard
(guest-only guard in middleware — inverse of PROTECTED_ROUTES). Reset-password and
confirm-email are intentionally excluded (mid-flow pages reached while holding a
recovery/just-signed-up session).
