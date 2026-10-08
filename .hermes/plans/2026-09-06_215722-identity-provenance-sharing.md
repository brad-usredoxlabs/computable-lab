# Real Identity, System-Owned Provenance, and Lab-Wide Sharing

## Goal

Make every actor in computable-lab a real, authenticated user (not a proxy-typed admin), make record provenance (`createdBy`/`createdAt`/`updatedAt`) system-owned and non-editable on every TapTab surface, and give every record kind (not just study/experiment/run) a working user/group/shared/private access model that shows up when browsing lab items.

## Current context / assumptions (all verified by reading the code on this repo)

- **Users are already first-class records.** `schema/identity/user.schema.yaml` requires `kind/recordId/username/displayName/status`; `email` is optional and `passwordHash` does not exist. A user record was written to the git-backed store at `records/user/USR-BRAD__untitled.yaml` (embedded-git `~/.computable-lab/worktrees/main/records/...`), created by `createUser` in `server/src/api/handlers/IdentityHandlers.ts:235` which only needs `displayName` (username auto-derives, email optional).
- **"Login" today is a trust-the-header switcher, NOT authentication.** `server/src/security/LocalIdentityService.ts:69` `resolveRequestUser` reads the `x-user-id`/`x-computable-user-id` header and, when absent or unusable, falls back to the bootstrap `USR-LOCAL-ADMIN`. `app/src/shared/identity/CurrentUserProvider.tsx` and `app/src/shared/shell/UserSwitcher.tsx` both comment "NOT authentication — the server trusts the header". This is why everyone can drive as admin: no header → admin.
- **The backend ALREADY stamps provenance authoritatively.** `RecordHandlers.createRecord` (lines 315-335) overwrites `createdBy/createdAt/updatedAt` from the resolved request user; `updateRecord` (lines 555-590) sets `updatedAt` and **restores** the original `createdBy` (never trusting the client). So the server side is largely correct.
- **The create projection already pre-fills a read-only Created By.** `UIHandlers.getEditorDraftProjection` (lines 380-388) resolves the current user's display name and `applyDisplayValuesToSlots(projection, { createdBy: name })`. `schema/studies/study.ui.yaml` marks the Provenance section slots (createdAt/createdBy/updatedAt) `readonly: true`.
- **But provenance read-only is per-schema, opt-in markdown, and editable for schemas that don't mark it.** `app/src/event-editor/create/RecordCreatePanel.tsx:155` only forces `readOnly` on parent-path slots (`studyId`/`experimentId`); anything the ui spec doesn't mark readonly (many schemas) renders provenance as editable free text. The user's complaint ("created and created by are just free text fields") is real for those surfaces. **Married: the fix must be central, not per-schema.**
- **Sharing already exists but only for a whitelist of kinds.** `schema/identity/access-policy.schema.yaml` (visibility `private|shared|public`, `grants` of user/group + role), `server/src/security/AccessControlService.ts`, `server/src/security/AuthorizationService.ts` with `POLICY_ROOT_KINDS = {study, experiment, run, planned-run}`. `RecordHandlers` enforces `canAccess('read', …)` on list/get and `('read'|'write'|'admin')` on create/update/delete. `ensureOwnerPolicy` runs on create (RecordHandlers:450) but `AuthorizationService` only auto-stamps policies for `POLICY_ROOT_KINDS` (line 103). So **protocols, materials, data-references, results, claims have NO auto-policy → `resolveEffectivePolicy` returns null → `canAccess` returns true → open to everyone.** A `ShareRecordDialog` + `VisibilityBadge` already exist under `app/src/shared/sharing/`.
- Records repo today is embedded-git (`~/.computable-lab`), not the remote data repo; that's a separate concern.

## Decisions (do not reopen)

1. **Where credentials live:** identity records (username, displayName, email, groups, personRef) stay in the records repo (portable/shared). The **password verifier lives in `server.dataDir`** under an `auth/` subdir keyed by `USR-*`, explicitly excluded from git. Rationale: user *identity* is FAIR data that should sync; a credential is a secret that must not propagate to a shared/remote records repo. Backward compatible: existing `USR-*` without a credential stay active until a password is set (so this ships without locking anyone out).
2. **Provenance is never editable, anywhere.** The framework enforces it at projection-build time (server) and serialization time (client), not by trusting per-schema `readonly` flags. `createdBy/createdAt/updatedAt` are removed from editable slots and rendered as system-owned read-only display.
3. **Every record kind gets an owner policy on creation** (extend `ensureOwnerPolicy` beyond `POLICY_ROOT_KINDS`) so all browse/list filtering is meaningful.
4. Local table `us`-style sessions: use a `cl-session` token in the header, issued by a new login endpoint. This is still local-first (no external IdP), but it is a real login: password-verified, per-user.
5. **Fallbacks stay (per Brad): the very first session must never turn a user away for not authenticating.** `resolveRequestUser` keeps the existing behavior — no header / no valid session falls back to the resolved active local user (today `USR-LOCAL-ADMIN`), NOT a 401. Real login/session is how you become a *named* user and get proper provenance + scoped ACLs, but an anonymous/first-session user is still admitted (as the admin fallback) rather than rejected. This deliberately preserves today's zero-friction entry; the auth layer ADDS named identity on top instead of gating it.

## Architecture / proposed approach

Three independent layers, each landing green + committed:

1. **Auth layer** — a `POST /auth/login` that verifies username/password against a `server.dataDir/auth/credentials.json` store (scrypt hash, `crypto.scryptSync`), issues a `cl-session` token (opaque UUID → userId, in a session map in `server.dataDir`), and the client sends it as `x-cl-session` (replacing/alongside `x-user-id`). `resolveRequestUser` becomes: session token → user; else `x-user-id`; else **no user → 401** (kill the admin fallback silently). A `POST /auth/logout` clears it. First user bootstrap remains (setup creates the real owner with a password + email).
2. **Provenance layer** — server: in `editorProjectionService.project` (or `UIHandlers`), force any slot whose path is `$.createdBy|$.createdAt|$.updatedAt` to `readOnly:true` and move its value into `displayValues` (display name when it's an id). Client: `RecordCreatePanel` (and any TapTab surface) never serializes provenance — strip `createdBy/createdAt/updatedAt` from the serialized payload before save (they're always server-stamped). This matches the existing backend already being authoritative.
3. **Sharing layer** — extend `AuthorizationService.ensureOwnerPolicy` to stamp an owner policy on creation for *all* kinds (not just `POLICY_ROOT_KINDS`); a lint/backfill task stamps owner policies onto existing lab-item records owned by a known user; surface `VisibilityBadge` + `ShareRecordDialog` (already built) in protocol/result/browse list rows.

## Step-by-step tasks (TDD; each lands green + a commit)

### Phase A — Real login (password + session, no admin proxy)

**A1 — Credential store + login service (server).**
- `server/src/security/CredentialStore.ts` (new): manages `server.dataDir/auth/credentials.json`. API: `setVerifier(userId, passwordHash)`, `getVerifier(userId)`, `hasCredential(userId)`. Uses `createHash`/`scryptSync` (node:crypto). Watch: keep both `user` and `passwordHash` per entry; no plaintext ever.
- `server/src/security/CredentialStore.test.ts` (new): tests set/get/has and that the stored value is NOT the plaintext password.
- Fail: `npx vitest run src/security/CredentialStore.test.ts` → expect failure (no module).
- Implement; pass. Commit `feat(auth): credential store backed by server.dataDir`.

**A2 — Login endpoint issues a session.**
- `server/src/security/SessionStore.ts` (new): in-memory map `token → { userId, createdAt }` (or file-backed in `auth/sessions.json`) + `create(userId): string`, `resolve(token): userId|null`, `revoke(token)`.
- `server/src/security/SessionStore.test.ts`: create→resolve round-trip; resolves to null for unknown/revoked.
- `server/src/api/handlers/AuthHandlers.ts` (new): `login(request)` — body `{ username, password }`; look up user by username (store.list `kind:'user'`), find matching credential, `verifyPassword` via `scryptSync` against the stored hash, then `sessionStore.create(userId)`; on bad username/password → `401 { error:'INVALID_CREDENTIALS' }`. `logout` revokes token from header. `me` returns the session user.
- Wire routes in `server/src/api/routes.ts`: `POST /auth/login`, `POST /auth/logout`.
- `server/src/api/handlers/AuthHandlers.test.ts`: correct creds → 200 + token + `userId`; wrong password → 401; unknown user → 401.
- Pass; commit `feat(auth): login/logout endpoints with session tokens`.

**A3 — `resolveRequestUser` prefers session, then user-id, and KEEPS the admin fallback.**
- `server/src/security/LocalIdentityService.ts`: read `x-cl-session` header first → `sessionStore.resolve`; then fall back to `x-user-id` (still honored existing clients); then fall back to the resolved active local user (admin) exactly as today. **Do NOT return 401 when nothing resolves** — first-session users stay admitted (decision #5). The change here is only that a valid `cl-session` becomes the STRONGEST identity signal (drives provenance + ACLs), not that authentication is gated.
- Update `LocalIdentityService` tests: add a case that `x-cl-session` resolves to its user AND that "no header" still resolves to the admin fallback.
- Commit `feat(auth): resolveRequestUser requires a live session or explicit user id`.

**A4 — Require email + password on user creation.**
- `server/src/api/handlers/IdentityHandlers.ts:createUser` — body becomes `{ displayName, username?, email (required, format email), password (required, min 8) }`; on missing/invalid → `400`. Set `email` in the payload; write the verifier via `CredentialStore.setVerifier(userId, scrypt(password))`. Do NOT store password in the payload (schema has no field; keep it clean).
- `user.schema.yaml` — make `email` required (format `email`), keep `passwordHash` **out** of the record schema (it lives in the credential store). This keeps credentials out of the records git repo.
- Update `IdentityHandlers` unit tests (`IdentityHandlers.test.ts` or wherever createUser is tested).
- Verify: `curl -s -X POST localhost:3001/api/users -H 'Content-Type: application/json' -d '{"displayName":"April","username":"april","email":"april@usrl.org","password":"supersecret1"}'` → `201`; then `curl -s localhost:3001/api/auth/login -d '{"username":"april","password":"supersecret1"}'` → token.
- Commit `feat(auth): user creation requires email + password`.

**A5 — Bootstrap "real owner" instead of anonymous admin.**
- `server/src/security/LocalIdentityService.ts:ensureLocalAdminUser` — rename concept to `ensureOwnerUser`: when a store has NO active `user` records, the first run still needs a usable user. Add env/config `SERVER_BOOTSTRAP_*` (username/password/... ) OR keep a one-time `/auth/bootstrap` that creates the first active user (which then owns everything). Keep the `LOCAL_ADMIN_USER_ID` bootstrap ONLY for a store that has never had a user (setup), and stamp a real credential on it.
- This is deliberately small; verify by wiping `~/.computable-lab/worktrees/main/records/user` and confirming the server bootstraps a scoped owner (not a shared admin).
- Commit `feat(auth): bootstrap creates a real owner (no silent shared admin)`.

**A6 — Frontend login flow (replace unrestricted switcher as the primary gate).**
- `app/src/shared/shell/UserSwitcher.tsx` — when the session is anonymous (no `x-cl-session`, `/me` returns `userId:null`), show a **Login** form instead of silently falling back to admin. `apiClient.login(username,password)` + `setSessionToken(token)`; on 401 show an inline error.
- `app/src/shared/api/base.ts` — send `x-cl-session` header alongside `x-user-id`; a new `getSessionToken()`/`setSessionToken()` mirroring the user-id storage, persisted in `localStorage`/cookie.
- `app/src/shared/api/client.ts` — add `login()`/`logout()`/`me()` typed methods (mirror the existing `listUsers`/`getMe`).
- `app/src/shared/api/client.test.ts`/existing tests — assert the session header is sent and login calls the right endpoint.
- Commit `feat(auth): login form + x-cl-session header on the client`.

### Phase B — System-owned provenance everywhere

**B1 — Force provenance read-only + display-name at projection time (server).**
- `server/src/ui/EditorProjectionService.test.ts` — add a case: project a ui spec whose `createdBy`/`createdAt` slots are NOT marked readonly; assert they come back `readOnly:true` and `createdBy` maps to `displayValues` when a user is resolvable.
- In `UIHandlers.getEditorDraftProjection` (and/or `EditorProjectionService.project`): after building the projection, iterate slots; for paths `$.createdBy|$.createdAt|$.updatedAt` set `readOnly:true`; if path is `$.createdBy`, set `displayValues.createdBy = resolvedDisplayName`. Remove "rely on ui spec flags."
- Pass; commit `feat(provenance): provenance slots are always read-only + display in draft projection`.

**B2 — Client never serializes provenance on create/update.**
- `app/src/event-editor/create/RecordCreatePanel.tsx` — in `handleSubmit`, `delete payload.createdBy/createdAt/updatedAt` before `createRecord` (server will stamp them). Add a unit test (`RecordCreatePanel.test.tsx` or add to existing) asserting a save does NOT include provenance fields.
- `app/src/editor/taptab/recordSerializer.ts` — make `serializeDocument` (or `buildProjectionDocument`) drop `createdBy`/`createdAt`/`updatedAt` if they appear as no-op base-record values (so a read-only display value can't be written). Add/adjust `DefaultEditorFixtures.test.tsx` (the existing "preserves baseRecord createdAt/createdBy" test must be updated to expect them dropped on save).
- Commit `feat(provenance): client strips provenance fields before save`.

**B3 — Audit: no editable provenance anywhere.**
- Grep `app/src/editor/taptab/widgets/` and schema `*.ui.yaml` for `createdBy|createdAt|updatedAt` — ensure any that appear are either `hidden` or `readonly`. Fix any schema ui spec that exposes them editable.
- Verify by browsing `/create/study` and a material/protocol create in the live UI: provenance shows as inert display text, not text inputs.
- Commit `chore(provenance): no editable provenance slots remain`.

### Phase C — Lab-wide user/group/shared/private

**C1 — Owner policy on every kind at creation.**
- `server/src/security/AuthorizationService.ts` — `ensureOwnerPolicy` currently returns early unless `POLICY_ROOT_KINDS.has(kind)` (line 103). Change it to stamp an owner policy for **any** `kind` that has a valid recordId and a `meta.createdBy`/`user` — but skip `user`, `group`, `access-policy` (self-referential / admin-only). Delete the `POLICY_ROOT_KINDS` gate.
- `server/src/security/AuthorizationService.test.ts` (or the ACL test file): a `material-spec` / `protocol` create now yields an owner policy with `visibility:private`, `ownerUserId` set.
- Commit `feat(sharing): all record kinds get an owner policy on create`.

**C2 — Backfill owner policies for existing lab-item records.**
- `server/src/security/AuthorizationService.ts:backfillOwnerPolicies` — extend the kind walk beyond `['study','experiment','planned-run','run']` to lab kinds (protocol, material-spec, data-reference, claim, etc.). Only stamp when `meta.createdBy` is a `USR-*` (else skip, don't guess an owner). Idempotent.
- Test: seed an existing protocol with `meta.createdBy:'USR-BRAD'`, run `backfillOwnerPolicies`, assert an `ACL-*` owner policy appears.
- Commit `feat(sharing): backfill owner policies on existing lab records`.

**C3 — Visibility in browse.**
- `app/src/collections/LabCollectionView.tsx` / `app/src/collections/ProjectCollectionView.tsx` / `app/src/protocols/ProtocolsPage.tsx` / results tab — render the existing `VisibilityBadge` (record `private/shared/public`) on each row, and surface the existing `ShareRecordDialog` (only for admin/owner; the dialog already gates on `isPolicyRoot` — C1 makes these kinds policy-roots-in-spirit so the dialog becomes editable).
- `getAccessPolicy`/`putAccessPolicy` (`IdentityHandlers.ts`) — these already return `isPolicyRoot` = `POLICY_ROOT_KINDS.has(kind)` (line 287). After C1, broaden `isPolicyRoot` to "has a direct policy OR is a browsable lab kind" so `ShareRecordDialog` becomes editable for protocols/results. Add a test.
- Commit `feat(sharing): visibility badge + editable share dialog on lab browse rows`.

**Open, smaller follow-ups (include if time; not required):**
- Group membership UI (create/edit groups in the switcher or settings) — the schema + ACL evaluator already support groups; only a create/edit surface is missing.

## Tests / validation

- Every code task is TDD: write the failing test, `npx vitest run <file>` to confirm RED, implement, re-run to GREEN, then `npm run typecheck` (app) / `npx tsc --noEmit` (server), then commit.
- Run the full affected suites at the end of each phase:
  - server: `cd server && npx vitest run src/security src/api/handlers/IdentityHandlers.test.ts src/api/handlers/AuthHandlers.test.ts`
  - app: `cd app && npx vitest run src/shared/identity src/shared/api src/event-editor/create src/editor/taptab src/collections`
  - typechecks: `npm run typecheck` (root) both workspaces.
- Manual login smoke: `curl -X POST localhost:3001/api/users` (needs email+password), then `curl -X POST localhost:3001/api/auth/login`, then `curl localhost:3001/api/me -H 'x-cl-session: <token>'` returns that user.
- Manual provenance: create a study via `/create/study`; confirm `createdBy` shows as your display name, is inert (not an input), and the saved record's `createdBy` is the session user id (`USR-*`), not text you typed.
- Manual sharing: create a protocol as user A; as user B with no grant, `GET /records/<protocol>` returns the visibility `private` and (after C3) the list hides it; share it to B via the dialog, and B can now see/read it.

## Risks, tradeoffs, and open questions

- **This is local-first, not SSO.** Sessions are opaque tokens in `server.dataDir`; there is no external IdP. That is the right scope for a lab appliance, but it means no forgot-password / MFA. Do NOT try to bolt on OAuth here.
- **Migration:** existing users (`USR-BRAD`, `USR-LOCAL-ADMIN`) have no credential. A4/A5 make them active-but-unaddressed until a password is set. Ship a "set password" affordance in the switcher (A6 reuses the edit-profile UI) so nobody is locked out.
- **The admin fallback removal is the sharp edge.** Any script/call that relied on "no header → admin" will start 401ing. That is the intent; but grep for other callers of `resolveRequestUser` that are not the record CRUD handlers and ensure they degrade gracefully (e.g. `/meta`, health, seed).
- **Credentials in `server.dataDir`:** ensure `server.dataDir` is durable (the main config uses `~/.computable-lab`, which is fine) and that `auth/` is never written into a records-path that gets pushed. It isn't (records live under `records/`, credentials under `auth/`).
- **Backfill granularity (C2):** stamping owner policies en masse changes select/list behavior immediately (records with no known owner stay open). Run it deliberately, not on every boot except the idempotent-safe path.