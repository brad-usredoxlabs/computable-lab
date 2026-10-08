# QMS Manual Testing Cheat Sheet (2026-09-27)

Backend at :3001 (`./start-app.sh` starts both). Identity rides on two headers:

- `x-cl-session: <token>` — strong, from POST /auth/login. WINS over everything.
- `x-user-id: USR-...` — local dev spoof; still a real identity for most tests.

Users in the data repo: `USR-LOCAL-ADMIN`, `USR-BRAD`.

## Setup

```bash
# give a passwordless user a password (spoofed self-service):
curl -s -X POST localhost:3001/auth/set-password \
  -H 'content-type: application/json' -H 'x-user-id: USR-BRAD' \
  -d '{"password":"***"}'

# real login (exercises the session path + login audit):
curl -s -X POST localhost:3001/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"brad","password":"***"}'
# → .token; then: export TOK=... and add  -H "x-cl-session: $TOK"
```

## 1) Bundle switching — admin-gated

```bash
# admin: works
curl -s -X PATCH localhost:3001/api/config \
  -H 'content-type: application/json' -H 'x-user-id: USR-LOCAL-ADMIN' \
  -d '{"lab":{"policyBundleId":"POL-REGULATED"}}'
# brad: 403 POLICY_BUNDLE_CHANGE_FORBIDDEN, bundle unchanged
# unknown id: 400 (checked before the guard)
```
Live per-request (no restart). Audited as `policy_bundle_changed {from,to}`.
UI: Settings page selector.

## 2) Bundle strictness (set bundle via step 1 first)

- POL-SANDBOX: transitions flow; run starts with no acks.
- POL-TRACKED: POST /runs/:id/start → 409 CONFIRMATION_REQUIRED with
  details.confirmationRequired codes; re-POST with
  `{"acknowledgements":["<code>"]}` → 200.
- POL-REGULATED: preconditions deny → 403 CONTROLLED_USE_BLOCKED
  with details.findings; run stays planned.

## 3) Run-start identity binding

- No identity headers → POST /runs/RUN-x/start → 401 IDENTITY_REQUIRED,
  run stays planned.
- `-H 'x-user-id: USR-BRAD'` + body `{"executedBy":"USR-SOMEONE-ELSE"}`
  → 403 OPERATOR_MISMATCH.
- executedBy omitted → 200; payload.executedBy == session user, NOT the body.
  run_started audit actor == session user too.

## 4) Role grants — privilege-escalation guard

```bash
# as brad → 403 GRANT_FORBIDDEN:
curl -s -X POST localhost:3001/records -H 'content-type: application/json' \
  -H 'x-user-id: USR-BRAD' -d '{"schemaId":"https://computable-lab.com/schema/computable-lab/role-grant.schema.yaml","payload":{"kind":"role-grant","recordId":"GRANT-TEST-1","userId":"USR-BRAD","roles":["admin"]}}'
# as admin → 201 + grantedBy: USR-LOCAL-ADMIN stamped in the file
```
Prove the rule is DATA: edit only
`schema/identity/role-grant.lint.yaml` `require.anyOf` (e.g. add
`- role: quality_manager`) → that role can now mint grants.
Restart needed for YAML reload (see Gotchas).

## 5) Lifecycle roles (regulated bundle)

Transition requiring role `reviewer` → 403 without a grant;
admin mints the grant (step 4) → passes. No restart for the grant itself —
RoleResolver reads records per request.

## 6) E-signatures (lifecycle: document-controlled-signing)

```bash
curl -s -X POST localhost:3001/signatures -H 'content-type: application/json' \
  -H "x-cl-session: $TOK" \
  -d '{"action":"<declared signatureAction>","subjectRecordId":"REC-x","password":"***"}'
```
Wrong password → 403 REAUTH_FAILED. Right → SIG- record bound to the
current git commit sha. Pass its id in `signatureRefs` on the record PATCH
doing in_review→approved. `requires_signature` fails CLOSED when the
transition YAML declares no signatureAction.

## 7) Audit trail

```bash
grep -rl "login_success\|login_failed\|run_started\|policy_bundle_changed\|lifecycle_transition\|signature_applied" \
  /home/brad/.computable-lab/worktrees/main/records | head
```
- login_failed carries data.reason: bad_password | unknown_user | inactive | no_verifier
- Tamper: PATCH /records/<EVT-id or SIG-id> → 405 APPEND_ONLY.
- `git log -p` in /home/brad/.computable-lab/worktrees/main IS the auditor's view.

## 8) Bypass detector

Any direct store.update flipping a lifecycle-managed record's state outside
the API gate self-reports `lifecycle_state_bypass`. Hard to trigger by hand;
trust the unit pins, or grep audit records for that action.

## Ten-minute "everything works" pass

1. login as brad → token
2. brad switches bundle to POL-SANDBOX → 403
3. admin switches to POL-REGULATED → 200 + audit event
4. brad starts a run claiming another executedBy → 403 OPERATOR_MISMATCH
5. brad mints himself an admin grant → 403 GRANT_FORBIDDEN
6. admin grants brad 'admin' → 201 + grantedBy stamp
7. brad switches bundle → 200
Every security fix this wave touched, in one lap.

## Gotchas

- `tsx --watch` does NOT see YAML changes — restart via `./start-app.sh`
  (or a real .ts edit) after touching lint / lifecycle / policy-bundle YAML.
- Data repo = /home/brad/.computable-lab/worktrees/main (embedded git), never
  the code repo.
- The session token wins over `x-user-id` — a stale login token silently
  overrides header spoofing (also the cause of the UI user-switch quirk:
  switching users while logged in keeps the old token → backend still
  resolves the session user).

## Protocol revisions and signature integrity (2026-10-03)

Protocol Save now saves a working draft (`0.1.1` for a new import) and stamps
its author from the resolved session. Research protocols without a lifecycle
can be selected without approval. Previewing a graph does not release a
version. Accepting a saved graph with recorded protocol provenance, or starting
a directly protocol-linked run, freezes `1.0.0`; changed later uses allocate
`1.1.0`, `1.2.0`, etc. Reusing unchanged instructions reuses the existing version.
Controlled protocols must be effective before use. Research version allocation
never means QMS approval.

Immutable `record-revision` records contain the source payload, its canonical
SHA-256 hash, source ID/schema, actor/time, and a verified Git commit when one
is available. Read `/api/records/:id/revisions` for a source's revision history,
and `/api/records/REV-...` for its snapshot. These reads inherit source access
permissions. Snapshots cannot be created through generic record CRUD, and cannot
be updated or deleted, including through the store's validation-bypass path.

**Correction to the earlier QMS integration contract:** `meta.commitSha` is a
legacy repository concurrency token and is not reliably a Git commit. New code
uses `meta.contentSha` for optimistic updates. New signatures carry
`subject.revisionRef` and `subject.contentHash`; `subject.gitCommit` is populated
only after comparing the committed file bytes with the current source. Use the
snapshot to reconstruct signed content, including on local repositories without
Git. Existing signatures are preserved, but signatures without a verifiable
snapshot cannot authorize new transitions.

Successful lifecycle audit events include the applied `signatureRefs`; a minted
signature without a matching transition event must not be displayed as an
applied approval.

The signature flow remains POST `/api/signatures`, followed by PUT
`/api/records/:id` with top-level `signatureRefs`. Save edits first. A signature
for an earlier document revision returns `STALE_SIGNATURE`; a transition that
also changes content returns `SIGNED_CONTENT_CHANGED`. A separate signature is
needed for the later effective transition. Approved/effective content is locked
at both the HTTP and storage layers. POST `/api/records/:id/draft-copy` creates
a new draft with `derivedFromRevisionRef`, fresh session authorship, and no
inherited reviewer, approver, or signature assignments.

Graph consumers preserve source pins. POST `/api/records/:id/accept-graph`
accepts `{ "expectedSha": "<graph content token>" }`; it requires the source
fingerprint saved when generating the graph. A stale source returns
`STALE_PROTOCOL` and requires regeneration. Acceptance retries reuse the saved
pin. Historical graphs without a source fingerprint are left unpinned rather
than attributed to the current protocol. Existing historical runs are not
backfilled. Failed acceptance may leave an unused immutable snapshot, but does
not report the graph accepted or the run started; retries reuse that snapshot.

The current QMS browser/signoff work should display the snapshot ID/hash from
new signatures, retain legacy signatures as historical evidence, and use the
new draft-copy endpoint when editing an approved document. A draft copy is a new
record; automatic supersession of the original and a revision-management UI are
not part of this foundation.
