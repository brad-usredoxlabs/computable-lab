# Login-first QMS — W1 (Phase 0+1) handoff — 2026-10-02

Plan: `.hermes/plans/2026-09-28_login-first-qms-plan.md`. W1 spec:
`.hermes/plans/2026-09-28_login-first-w1-spec.md`.

Status: W1 COMPLETE and parent-verified (architect ran the tests/tsc itself;
not child self-report). Parent-owned server.ts wiring done. UNCOMMITTED
(shared tree), consistent with the standing no-commit-attended rule.

## Landed

Phase 0 — pinned today's no-credentials header-trusted path (no token +
x-user-id USR-BRAD => USR-BRAD) with a dedicated test.

Phase 1 — first-run admin bootstrap + self-closing header window:

- `LocalIdentityService` gained an optional 3rd ctor param
  `hasCredential(userId)` (optional-wiring; absent => FAIL CLOSED on the admin
  header, no bootstrap window). The explicit `x-user-id: USR-LOCAL-ADMIN`
  header now resolves the ADMIN record (isSystem true) ONLY while the
  predicate is wired AND admin has no credential. The moment a verifier
  exists the header is dead and falls back to the first active user.
  Extracted `upsertAdminRecord()` so the bootstrap window creates/returns the
  ADMIN specifically — the direct trap the spec flagged (routing through
  `ensureLocalAdminUser()` returns the first active NON-admin user instead).
- `SessionStore.clear()` (revoke ALL sessions).
- `AuthHandlers.setPassword` allows the admin inside the bootstrap window
  (`isSystem` rejected otherwise), read off the always-mandatory
  `credentialStore` — so the window state does not depend on the identity
  service's optional predicate. Platform primitive, commented as such.
- NEW `server/src/scripts/bootstrapAdmin.ts` + `npm run bootstrap-admin -w
  server`: interactive-TTY-only escape hatch; writes the admin verifier and
  calls `SessionStore.clear()`. Core `bootstrapAdminCredential(credentialStore,
  sessionStore, password)` is a plain function unit-tested with NO TTY mocking.
- Tests: LocalAuthorization pins (a)/(b) + fail-closed/no-predicate + admin
  record upsert; AuthHandlers setPassword succeeds-in-window / 403-after /
  fail-closed; bootstrapAdmin 3 cases (verifier + all-sessions revoked +
  persistence + re-claim preserves others).

## Verification (architect-run)

- `npx vitest run src/security/LocalAuthorization.test.ts
  src/api/handlers/AuthHandlers.test.ts src/scripts/bootstrapAdmin.test.ts`
  -> 3 files, 30 tests passed.
- `npx tsc --noEmit -p server/tsconfig.json` -> exit 0 (before AND after the
  parent wiring line).
- Smoke: `echo | npx tsx src/scripts/bootstrapAdmin.ts` prints the TTY
  refusal (guard works against real non-TTY stdin).
- Parent wiring (server.ts:501): `new LocalIdentityService(store,
  sessionStore, (userId) => credentialStore.hasCredential(userId))`.

## NOT done / open

- Broader sweep `src/security/ src/api/handlers/AuthHandlers.test.ts
  src/scripts/` (child reported 7 files / 49 tests) was NOT independently
  re-run — the terminal command was blocked on approval. The 3 changed
  files are fully verified; the wider sweep is a regression nice-to-have.
- COMMIT: skipped intentionally (shared dirty tree; see handoff
  2026-09-27). Suggest committing W1 separately once the sibling session's
  server.ts hunks are reconciled.
- Bootstrap-window logic on a store that already has OTHER active users is
  pinned by tests (admin still wins the header while un-bootstrapped).

## Next

W2 (Phase 2 policy-bundle resolver gate) and W3 (Phase 3 login UX frontend)
are the parallel dispatch after W1. Phase 3 /auth/status shape is pinned in
W2/W1 code. **Interview decision still pending from Brad**: the pipeline's
designed flow is cl-interviewer producing/approving the W2/W3/W4 breakdown
before dispatch; current THE LIST was populated directly from the plan's waves
(no cl-interviewer run). Decide before dispatching W2/W3.
