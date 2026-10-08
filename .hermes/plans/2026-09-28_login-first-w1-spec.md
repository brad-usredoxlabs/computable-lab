# W1 Spec — Phase 0 + Phase 1: first-run admin bootstrap + self-closing header window

Source plan: `.hermes/plans/2026-09-28_login-first-qms-plan.md` (approved by Brad).
This spec is the executable slice for W1. Read the source plan's Phase 0 and
Phase 1 sections before coding; they are authoritative. This spec pins the
exact behavior and file ownership so the worker does not guess.

## Goal

Make the local admin reachable over HTTP through a real first-run bootstrap,
and make the explicit `x-user-id: USR-LOCAL-ADMIN` header self-close the moment
the admin has a credential. Today the server intercepts an explicit
USR-LOCAL-ADMIN header and resolves the first active non-admin user instead
(pinned by LocalAuthorization.test.ts) — so admin is unreachable over HTTP and
the switcher's "@local-admin" entry is a UI lie. This removes the lie by making
login the front door for admin, not by widening the header.

## Current code state (read these first)

- `server/src/security/LocalIdentityService.ts` — `resolveRequestUser`:
  session token first, then explicit `x-user-id`/`x-computable-user-id` header
  (with a `LOCAL_ADMIN_USER_ID` special case at ~103-112 that calls
  `ensureLocalAdminUser()` and returns whatever it gives), then the active
  local-user fallback. `ensureLocalAdminUser()` returns the FIRST active
  non-admin user if one exists, else the admin.
- `server/src/security/CredentialStore.ts` — already has
  `hasCredential(userId): Promise<boolean>` (line 73). No change needed here.
- `server/src/security/SessionStore.ts` — needs a new `clear()` method
  (revoke ALL sessions).
- `server/src/api/handlers/AuthHandlers.ts` — `setPassword` (~111-131)
  resolves the current user and REJECTS `isSystem` (line 125). This is the
  bug: the admin can never set its own password.
- `server/src/security/LocalAuthorization.test.ts` — has the "stale
  local-admin header" test (line 157) that documents the behavior we are
  DELIBERATELY changing.
- `server/src/api/handlers/AuthHandlers.test.ts` — setPassword tests at
  ~119-146.
- `server/src/server.ts` — line 501 constructs
  `new LocalIdentityService(store, sessionStore)`. PARENT owns this wiring.

## Phase 0 — pin the current truth (tests only, no behavior change)

1. Keep the "falls back ... stale local-admin header" test green in this
   phase (it documents the behavior we are about to change in Phase 1).
2. Add a test pinning today's no-credentials-anywhere state: no token +
   `x-user-id: USR-BRAD` => resolves USR-BRAD (header-trusted path, to be
   tightened in Phase 2).
3. Do NOT touch the frontend.

## Phase 1 — first-run admin bootstrap + honor the explicit admin bootstrap ONLY before it has a credential

### 1. `LocalIdentityService` — self-closing admin header window

Add an optional third constructor param, a `hasCredential` predicate, with the
same optional-wiring posture as `sessionStore`:

```ts
constructor(
  private readonly store: RecordStore,
  private readonly sessionStore?: SessionStore,
  private readonly hasCredential?: (userId: string) => Promise<boolean>,
)
```

In `resolveRequestUser`, the `explicitUserId === LOCAL_ADMIN_USER_ID` branch
becomes:

- **Bootstrap window open** = `this.hasCredential` is wired AND
  `await this.hasCredential(LOCAL_ADMIN_USER_ID) === false`. In that case the
  admin header resolves to the ADMIN record specifically (isSystem true),
  even if other active users exist. Ensure the admin record exists (create if
  missing) and return it with `isSystem: true`.
- **Window closed** (admin has a credential) OR **no predicate wired** (fail
  closed on the header for admin): the admin header is DEAD — fall back to the
  first active user exactly as today (the existing `ensureLocalAdminUser()`
  fallback path). Do NOT resolve to admin.

Behavior pins (these become the tests):
- (a) admin WITHOUT credential + admin header => resolves admin, isSystem true.
- (b) admin WITH credential + admin header => falls back to first active user
  (header dead), isSystem false.

Note: because `ensureLocalAdminUser()` prefers the first active non-admin user,
the bootstrap-open branch must fetch/create the ADMIN record directly (e.g.
`store.get(LOCAL_ADMIN_USER_ID)` then create via `ensureLocalAdminUser()` only
if absent) — it must NOT route through the "first active user" preference.

### 2. `AuthHandlers.setPassword` — allow the admin bootstrap window

Currently rejects `isSystem`. Change narrowly: allow when
`resolved.userId === LOCAL_ADMIN_USER_ID && !(await credentialStore.hasCredential(LOCAL_ADMIN_USER_ID))`
(the bootstrap window). Everything else stays rejected. This is a platform
primitive (like `localAdmin` in the authoring DSL), not a business rule — add
a short PR-body-style comment noting that.

### 3. `SessionStore.clear()` — new method

Revoke ALL sessions (clear the map + persist). Used by the CLI escape hatch.

### 4. CLI escape hatch — `server/src/scripts/bootstrapAdmin.ts` (NEW)

`npm run bootstrap-admin -w server`:
- Refuses to run unless `process.stdin.isTTY` (interactive terminal).
- Resolves the auth dir the same way server.ts does: `dataDir` from
  `appConfig.server.dataDir ?? '~/.computable-lab'` (see server.ts ~456 and
  the `loadConfig`/`resolveConfiguredPath` pattern at ~202, ~330), then
  `join(dataDir, 'auth')`.
- Prompts for a password (readline), writes the verifier via
  `CredentialStore.setVerifier(LOCAL_ADMIN_USER_ID, hashPassword(password))`,
  then revokes ALL sessions via `sessionStore.clear()`.
- Filesystem access = game-over-anyway, so this is not a new hole.
- Structure the script so its core (write verifier + clear sessions) is a
  plain function over `(credentialStore, sessionStore, password)` that a unit
  test can call WITHOUT TTY mocking. The TTY guard and prompt live in the
  `main()` entrypoint only.
- Add the `bootstrap-admin` script to `server/package.json`.

### 5. Test changes

- Replace the "stale local-admin header" pin in LocalAuthorization.test.ts
  with the TWO pins (a) and (b) above.
- New tests: setPassword succeeds in the bootstrap window, 403 after the
  window closes (admin has a credential).
- CLI script covered by a unit test over CredentialStore + SessionStore.clear
  (no TTY mocking) — test the core function directly.

## File ownership

CHILD owns (edit only these):
- `server/src/security/LocalIdentityService.ts`
- `server/src/security/SessionStore.ts` (add `clear()`)
- `server/src/api/handlers/AuthHandlers.ts`
- `server/src/security/LocalAuthorization.test.ts`
- `server/src/api/handlers/AuthHandlers.test.ts`
- `server/src/scripts/bootstrapAdmin.ts` (NEW)
- `server/package.json` (add `bootstrap-admin` script)

PARENT owns (do NOT touch):
- `server/src/server.ts` — parent will wire `hasCredential` into the
  `LocalIdentityService` ctor at line 501.

Do not touch any other file. Do not touch the frontend.

## Standing constraints

- `exactOptionalPropertyTypes` is on: optional means absent OR value, never
  `undefined`. Use the conditional-spread idiom where needed.
- Optional-wiring posture: the system must work with any hook ripped out.
  `hasCredential` absent => fail closed on the admin header (no bootstrap
  window), and setPassword keeps rejecting isSystem.
- No hardcoded domain logic in TS. No secrets in the records repo
  (CredentialStore/SessionStore stay in dataDir/auth, NON-git).
- The shared tree is dirty with prior uncommitted work (governance-hardening).
  Build on the CURRENT file contents, not a fresh checkout. Do not `git
  checkout` or revert anything.

## Acceptance criteria (parent verifies)

1. Targeted vitest green: `LocalAuthorization.test.ts` and
   `AuthHandlers.test.ts` (plus the new bootstrapAdmin unit test).
2. `npx tsc --noEmit -p server/tsconfig.json` exit 0.
3. Behavior pins (a) and (b) hold; setPassword succeeds in window, 403 after.
4. `bootstrap-admin` script present in package.json; core function unit-tested.
5. server.ts wiring done by parent (not the child).
