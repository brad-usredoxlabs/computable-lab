# Login-first QMS plan — Option 2 (admin via session login only) — 2026-09-28

Goal: make the QMS safe to run where HTTP is the ONLY door. USR-LOCAL-ADMIN
(and eventually every user) becomes reachable strictly through a real login
(x-cl-session), the x-user-id header demotes to a convenience/legacy signal,
and the local-admin bootstrap gets a first-run password mechanism. Today the
server intercepts an explicit USR-LOCAL-ADMIN header and resolves the first
active non-admin user instead (pinned by LocalAuthorization.test.ts, commit
0704809b) — so admin is unreachable over HTTP and the switcher's
"@local-admin" entry is a UI lie. This plan removes the lie by making login
the front door, not by widening the header.

Prereq reading:
- server/src/security/LocalIdentityService.ts (intercept at ~88-122: session
  -> explicit header (with LOCAL_ADMIN special case) -> fallback)
- server/src/security/CredentialStore.ts (scrypt "hash:salt", dataDir/auth/
  credentials.json, NON-git on purpose)
- server/src/security/SessionStore.ts (opaque cl-sess- tokens, persisted,
  NO expiry, no revocation-on-password-change)
- server/src/api/handlers/AuthHandlers.ts (login/logout/set-password;
  set-password resolves the CURRENT user — which for local-admin is the bug)
- app/src/shared/shell/UserSwitcher.tsx (has some login affordance already —
  recon before writing; keep the switcher honest: it lists users the backend
  resolves, and after Phase 1 a logged-out session must not appear to have
  an identity)
- .hermes/plans/handoffs/2026-09-27_governance-hardening-complete.md
  (identity precedence decisions not to re-litigate)

## Phase 0 — pin the current truth (tests only, no behavior change)

- LocalAuthorization.test.ts: the "falls back ... stale local-admin header"
  test stays green in this phase (it documents the behavior we are about to
  DELIBERATELY change in Phase 1). Add a test pinning today's
  no-credentials-anywhere state: no token + x-user-id USR-BRAD => USR-BRAD
  (header-trusted path, to be tightened in Phase 2).
- Do not touch frontend yet.

## Phase 1 — first-run admin bootstrap + honor the explicit admin bootstrap ONLY before it has a credential

The chicken-and-egg: /auth/set-password resolves through the interceptor, so
the admin can never set its password. Bootstrap must not be an HTTP hole that
survives bootstrapping.

Mechanism (self-closing):
1. resolveRequestUser: an explicit x-user-id: USR-LOCAL-ADMIN resolves to the
   admin record ONLY WHILE credentialStore.hasCredential(LOCAL_ADMIN_USER_ID)
   === false (fresh install / never-bootstrapped). The moment a verifier
   exists for the admin, the header path is dead for that id — like a
   machine's "passwordless root until first password" and no longer.
   - LocalIdentityService gains an optional hasCredential(userId) predicate
     ctor param (same optional-wiring posture as sessionStore; absent => no
     bootstrap window, i.e. fail closed on the header for admin).
   - Record the decision: a policy_bundle_changed-style audit is NOT needed
     here; login_success/failure already audit the strong path.
2. Bootstrap path for the password: POST /auth/set-password while the header
   path is open (window 1) works unchanged — resolves isSystem:true, but
   setPassword currently REJECTS isSystem (AuthHandlers.ts ~101). Change
   narrowly: allow when resolved.userId === LOCAL_ADMIN_USER_ID &&
   !hasCredential(userId) (bootstrap window). Data-driven home: this
   bootstrap exception is a platform primitive (like localAdmin in the
   authoring DSL), not a business rule — TS is honest here; note it in the
   PR-body style comment.
3. CLI escape hatch for when the window is closed but the password is lost:
   `npm run bootstrap-admin -w server` (server/src/scripts/bootstrapAdmin.ts)
   — refuses unless interactive TTY, prompts password, writes verifier,
   revokes ALL sessions (sessionStore.clear() — new method). Filesystem
   access = game-over-anyway, so this is not a new hole.
4. Test changes: replace the "stale local-admin header" pin with TWO pins:
   (a) admin WITHOUT credential + admin header => resolves admin,
       isSystem true; (b) admin WITH credential + admin header => falls back
       to first active user (header dead). New tests: setPassword succeeds in
       window, 403 after; CLI script covered by unit over CredentialStore +
       SessionStore.clear (no TTY mocking).
Files: server/src/security/LocalIdentityService.ts,
server/src/api/handlers/AuthHandlers.ts (+tests), server/src/server.ts
(wire hasCredential into LocalIdentityService + SessionStore.clear),
server/src/scripts/bootstrapAdmin.ts (new), package script in server/package.json,
server/src/security/LocalAuthorization.test.ts.

## Phase 2 — login-first enforcement (the QMS turn)

Bundle-gated, declarative: new policy disposition in the bundle YAMLs, e.g.
identity.allowHeaderIdentity: true (sandbox/notebook) | false
(tracked/regulated) — mirror the enforceTransitionRoles plumbing exactly
(CompilerPolicySettings + meta-schema + 4 bundle YAMLs + live accessor).
- RecordHandlers + run routes already resolve via resolveRequestUser; add
  gate at the RESOLVER: when the active bundle says false, a resolved user
  that came from a HEADER (not session token) gets isSystem false + reason
  HEADER_IDENTITY_DISALLOWED and endpoints treating userId-null as 401/403
  already do the rest. Thread a `via: 'session'|'header'|'fallback'` field on
  ResolvedRequestUser (generic, not a business rule).
- Splash/home under regulated with no session: surface "sign in" (Phase 3 UI)
  instead of silently acting as first-active-user.
- Test: same request, header identity -> 401 under POL-REGULATED, allowed
  under POL-SANDBOX (governanceStrictness-style bundle-swap proof).
Files: schema/core/policy-bundles/*.yaml, schema/core/policy-bundle.schema
(meta), server/src/policy/types.ts, LocalIdentityService.ts (+ tests),
server.ts accessor wiring.

## Phase 3 — the login UX (frontend)

- Real sign-in screen (splash + first-visit 401 interception): shared/api
  client already sends x-cl-session when present. Add app/src/shared/identity
  LoginPanel: username+password -> apiClient.login -> token stored
  (existing setSessionToken) -> hard-nav '/'. Show server error verbatim.
- UserSwitcher honesty: while a session token is live, the switcher shows the
  SESSION user and switching = logout+nav (already landed this session in
  CurrentUserProvider). Users without a credential render "no password —
  sign in required" and are NOT switchable under a login-first bundle.
- Logout affordance in the shell chrome (apiClient.logout + reload).
- First-run wizard: when GET /settings/lab (or a new GET /auth/status
  {hasBootstrapAdmin:boolean, hasAnyCredential:boolean}) reports a fresh
  install, render "set admin password" inline (calls set-password inside the
  bootstrap window). New tiny endpoint in IdentityHandlers is fine — data
  from CredentialStore, zero secrets.
Files: app/src/shared/identity/*, app/src/shared/shell/UserSwitcher.tsx,
app/src/splash (locate real files first — churn-heavy area, sibling session),
server IdentityHandlers (/auth/status).

## Phase 4 — session hygiene (cheap, do it now or never)

- SessionStore: add expiresAt (created + configurable server.sessionTtlHours
  in config.yaml data, default 168h = 7d); resolve() returns null for
  expired; sweep on persist. No silent refresh token v1.
- Password change (set-password) revokes ALL sessions for that user
  (NIST-ish, and the recovery path when a session is hijacked).
- login_failed rate limiting: in-memory counter per username+ip, 5/min,
  429; config-driven threshold in server config.yaml, no hardcoded numbers
  (or a lint-adjacent YAML if a better declarative home exists — evaluate,
  don't force).
Files: SessionStore.ts, AuthHandlers.ts, config types + config.yaml, tests.

## Wave structure & ownership (disjoint, delegate-able)

W1: Phase 0+1 child (server security/handlers/scripts; parent owns server.ts
wiring as always). W2 after W1 verified: Phase 2 child (policy bundles +
resolver gate) ∥ Phase 3 child (frontend; needs /auth/status shape pinned by
parent from W1/W2 code). W3: Phase 4 child. Verify each wave with targeted
vitest + server tsc + app tsc-for-touched-files; never unfiltered vitest.

## Standing constraints (every child)

exactOptionalPropertyTypes conditional-spread idiom; business dispositions
in YAML (Phase 2 gate MUST read the bundle, no bundle-name branching in TS);
optional-wiring posture (system works with any hook ripped out); no secrets
in records repo (CredentialStore/SessionStore stay in dataDir/auth, NON-git);
shared tree: no state-changing git, absolute paths, re-read before patch.

## Decisions this plan makes (successor must not re-litigate)

- Header identity remains valid under sandbox/notebook bundles (local-first
  convenience preserved); login-first is enforced by POLICY, per bundle — not
  by ripping the header out globally.
- Bootstrap window is credential-existence-keyed, not config-keyed: nothing
  to remember to turn off; forgetting to bootstrap is the only failure mode,
  and the CLI hatch covers lost passwords.
- No OAuth/external IdP in this plan; local credentials.json is the v1
  substrate; WebAuthn per spec §9 stays deferred.
- Sessions get TTL + password-change revocation; no device-list UI yet.
