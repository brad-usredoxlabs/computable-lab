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

---

## UI-first runbook (2026-10-04, lane 1)

> **Draft status — read before citing anything below.** This section was authored for
> QMS-7 BEFORE the QMS-6B acceptance gate returned a verdict. Every statement about a
> flow's OUTCOME is PROVISIONAL and marked as such: "per QMS-6B receipts
> (`/home/brad/.hermes/cl/receipts/QMS-6B/`) — final confirmation pending QMS-6B
> VERDICT: accept". The accepted runstamp will be the NEWEST directory there once
> QMS-6B accepts; the runstamp is finalized on accept, so this section deliberately
> links the directory, not a pinned runstamp. Nothing here may be quoted as
> accepted/passing until that verdict exists. Static claims carry the `path:line` that
> was actually opened during drafting (2026-10-04, read-only probes only).

### 1) Where to look: `/registry` is the entry point

- Open `http://localhost:5192/registry` — the multi-kind QMS record browser (QMS-5).
  The ONE nav entry is **Registry** (`app/src/shared/shell/GlobalNavbar.tsx:31`); the
  route lives at `app/src/App.tsx:212`.
- Pick the **Documents** tab (kind `controlled-document`,
  `app/src/pages/RecordRegistryPage.tsx:21`), select `DOC-DEMO-SOP`, and the record's
  transition controls render in the signature-aware `DocumentControlBar`
  (`app/src/components/registry/DocumentControlBar.tsx`) — transition buttons plus the
  one-password-modal-per-gated-transition.
- Same records are also reachable from the **Lab** view: `/lab` → **Documents** pill
  (`app/src/collections/LabCollectionView.tsx:33`). Use `/registry` for the QMS flow;
  `/lab` is the browse-side view.
- The policy-bundle selector is NOT in the main nav: `/settings` (off-nav, reached via
  the Settings gear menu; `app/src/App.tsx:213`), where `PolicyBundleSelector` mounts
  at `app/src/shell/SettingsPage.tsx:285-287`.

### 2) Lane vs live — which stack is which (never confuse them)

| | Lane 1 (this runbook) | Brad's live stack |
|---|---|---|
| Backend API | `http://localhost:3092` | `http://localhost:3001` |
| Frontend | `http://localhost:5192` | `http://localhost:5174` |
| Data dir | `CL_DATA_DIR=/home/brad/.computable-lab-lane1` | `/home/brad/.computable-lab` |
| Data repo (embedded git) | `/home/brad/.computable-lab-lane1/worktrees/main` | `/home/brad/.computable-lab/worktrees/main` |

All URLs, ports, and grep paths below are LANE values unless a step says otherwise.
The legacy sections of this file (2026-09-27) were written against the live stack and
still carry `:3001` paths — see the corrections note at the end.

### 3) DEMO fixture ids (lane)

`PER-DEMO-AUTHOR`, `PER-DEMO-REVIEWER`, `DOC-DEMO-SOP`, `TRM-DEMO-GC`, `TRR-DEMO-1`,
`EQP-DEMO-GC`, `CAL-DEMO-GC`, `GRANT-DEMO-AUTHOR`, `GRANT-DEMO-REVIEWER`,
`BUD-DEMO-LANE1`, `USR-QMS-ADMIN`. Seeded by `scripts/qms-demo-seed.mjs`.

Read-back caveat (verified read-only on the lane, 2026-10-04): fixture READABILITY is
ACL-scoped, not universal. With `-H 'x-user-id: USR-QMS-ADMIN'`:
- `DOC-DEMO-SOP` reads 200 (lane ACL `ACL-DOC-DEMO-SOP` grants `USR-QMS-ADMIN` editor),
  and `GRANT-DEMO-REVIEWER` reads 200.
- `PER-DEMO-AUTHOR`, `TRM-DEMO-GC`, `EQP-DEMO-GC`, `CAL-DEMO-GC` return 404 — their
  ACLs are `visibility: private`, `ownerUserId: USR-BRAD`, empty grants. The records
  exist in the data repo; a QMS-ADMIN probe correctly cannot see them. This is a
  lane test-data fact (`ACL-BUD-DEMO-LANE1` and `ACL-DOC-DEMO-SOP` similarly grant
  `USR-QMS-ADMIN` editor).
- `GRANT-DEMO-AUTHOR` 404s to everyone but privileged readers (role-grants are
  privileged reads — actor-matrix caveat 2).

Fixture lifecycle STATE drifts with every lap (reruns never revert an advanced
fixture): expect `DOC-DEMO-SOP` to sit wherever the last accepted lap left it. If it
is already `effective` when you start, follow §9 (draft-copy) instead of forcing state.

### 4) Actor matrix

Do NOT restate it here. See `docs/qms-actor-matrix.md` — it is the single table of who
may take which transition under which bundle, and QMS-7's denial expectations come
from its rows verbatim. One-line summary only: `USR-QMS-ADMIN` (username `qms-admin`)
holds `reviewer`+`approver`; `USR-BRAD` holds `author` ONLY and is the deliberately
under-granted actor for the regulated denial lap.

### 5) Prerequisite: give `USR-QMS-ADMIN` a login (self-service, no Brad needed)

`USR-QMS-ADMIN` is an ordinary login-capable user. The password may already be set by
a previous lap (credentials persist in `dataDir/auth`); setting it again is
idempotent-by-overwrite and reversible, so the runbook keeps this as the first step:

```bash
# self-service: resolves the CALLER from x-user-id, sets that user's own password
curl -s -X POST http://localhost:3092/api/auth/set-password \
  -H 'content-type: application/json' -H 'x-user-id: USR-QMS-ADMIN' \
  -d '{"password":"***"}'
# → {"success":true,"userId":"USR-QMS-ADMIN"}   (body field is `password`, min 8 chars)

# real login → session token (exercises the session path + login audit)
curl -s -X POST http://localhost:3092/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"qms-admin","password":"***"}'
# → {"success":true,"token":"***","userId":"USR-QMS-ADMIN"} ; export TOK=...
# then add  -H "x-cl-session: $TOK"  (the token WINS over x-user-id — see Gotchas)
```

Verified mechanism: `server/src/api/handlers/AuthHandlers.ts` — `set-password` is
self-service, rejects passwords < 8 chars, and refuses system identities with 403
(`NO_CURRENT_USER`); `login` requires username+password and an existing verifier.

**Obsolete — do NOT follow:** the 2026-09-27 Setup section's "Brad runs
`POST /auth/set-password` for `USR-LOCAL-ADMIN`" step must NOT be performed.
`USR-LOCAL-ADMIN` is a bootstrap/fallback identity: the header degrades to `USR-BRAD`,
and `set-password` refuses it — it can never set its own password or log in (see the
"Bootstrap identity" section of `docs/qms-actor-matrix.md`). Any signature-gated row
needs the acting user's OWN password for the `POST /api/signatures` re-auth — so
whoever runs the signed rows must hold the `qms-admin` password.

### 6) POL-SANDBOX happy path to `effective` (both signature gates) — PROVISIONAL

Per QMS-6B receipts (`/home/brad/.hermes/cl/receipts/QMS-6B/`) — final confirmation
pending QMS-6B VERDICT: accept. The lane's current bundle is `POL-SANDBOX`
(read-only `GET /api/config` → `lab.policyBundleId: "POL-SANDBOX"`, 2026-10-04).
Steps against `DOC-DEMO-SOP` (lifecycle `document-controlled-signing`):

1. **`draft → in_review` as `USR-BRAD`** (author; no signature gate). UI: sign in as
   brad in `/registry` → Documents → DOC-DEMO-SOP → "Submit for review". API:
   `PUT /api/records/DOC-DEMO-SOP` with `{"payload": {...,"state":"in_review"}}` and
   `-H 'x-user-id: USR-BRAD'`.
2. **`in_review → approved` as `USR-QMS-ADMIN`** (reviewer; gated +
   `requires_different_person` — which is exactly why BRAD cannot do this row).
   UI: one password modal per gated transition; the modal mints the signature and the
   PUT rides it. API:
   ```bash
   curl -s -X POST http://localhost:3092/api/signatures -H 'content-type: application/json' \
     -H "x-cl-session: $TOK" \
     -d '{"action":"approved","subject":{"recordId":"DOC-DEMO-SOP","targetState":"approved"},"password":"***"}'
   # → SIG-...  (body: action + subject.{recordId,targetState} + password — NOT the old
   #            flat {action,subjectRecordId,password} shape from §6 of the 2026-09-27 sections)
   curl -s -X PUT http://localhost:3092/api/records/DOC-DEMO-SOP -H 'content-type: application/json' \
     -H "x-cl-session: $TOK" \
     -d '{"payload":{...full payload...,"state":"approved"},"signatureRefs":["SIG-..."]}'
   ```
3. **`approved → effective` as `USR-QMS-ADMIN`** (approver; second signature gate).
   MINT A NEW SIGNATURE with `targetState:"effective"` — both gated transitions
   declare the SAME `signatureAction: approved`
   (`schema/core/lifecycles/document-controlled-signing.lifecycle.yaml:44-63`), so the
   only thing separating the two gates is the signature's `targetState`; reusing
   signature #1 returns `SIGNATURE_TARGET_MISMATCH` (422,
   `server/src/api/handlers/RecordHandlers.ts:753`).
4. **Receipt read-back** (all reads):
   - `GET /api/records/DOC-DEMO-SOP` → `payload.state: "effective"`.
   - `GET /api/records/DOC-DEMO-SOP/revisions` (`routes.ts:224`) → the `REV-` snapshot
     chain; `GET /api/records/REV-...` for each snapshot.
   - `GET /api/records/SIG-...` → each SIG carries `subject.revisionRef` +
     `subject.contentHash`.
   - Audit: `grep -rl "lifecycle_transition" /home/brad/.computable-lab-lane1/worktrees/main/records/audit-event`
     → successful transition events include the applied `signatureRefs`.

### 7) Save edits first — the three integrity rejections

The transition button is `disabled` while the editor is dirty ("Save changes first",
`DocumentControlBar.tsx:164-166`); in the API path, the same rule is server-enforced.
All three rejections return `{ "error": "<TOKEN>", "message": "..." }` with **NO
`code` field** — the token is the `error` field / message text only
(`server/src/api/handlers/RecordHandlers.ts:745-753`):

| token | status | meaning → what to do |
|---|---|---|
| `STALE_SIGNATURE` | 409 | the document changed after signing → re-sign the CURRENT saved revision |
| `SIGNED_CONTENT_CHANGED` | 409 | a signed transition may only change state → save content edits FIRST, then sign |
| `SIGNATURE_TARGET_MISMATCH` | 422 | the signature was minted for a different transition → mint one with the right `targetState` |

State advance is **`PUT /api/records/:id`** with `signatureRefs` at the BODY TOP
LEVEL (`routes.ts:233`, `RecordHandlers.ts:721-723`) — never PATCH
(`/api/records/:id` has no PATCH verb; the legacy §6's "record PATCH" is wrong). The
UI translates each token into a concrete instruction
(`app/src/components/registry/SignaturePasswordModal.tsx:39-46`). Adjacent rejections
exist with the same shape and should not be confused with the three above:
`SIGNATURE_SUBJECT_MISMATCH`, `SIGNATURE_SIGNER_MISMATCH`,
`SIGNATURE_REVISION_REQUIRED` (a legacy signature without a verifiable snapshot
cannot authorize a new transition).

### 8) Orphan-`SIG` interpretation

`POST /api/signatures` is APPEND-ONLY: a minted signature that never rides a
successful transition stays on disk forever as an **ORPHAN**. It is evidence that a
re-auth happened, never evidence of an approval. Join SIG ↔
`lifecycle_transition` audit event by `signatureRefs` on the event: a SIG with no
matching event must not be displayed as an applied approval (2026-10-03 section above;
delta doc D7). A rejected PUT (§7) still leaves its minted SIG behind — same rule.

### 9) Locked content and draft-copy

`approved` / `effective` content is locked at BOTH the HTTP and storage layers — a
plain `PUT` editing the payload of such a record fails. Editing an approved document
means creating a NEW record:

```bash
curl -s -X POST http://localhost:3092/api/records/DOC-DEMO-SOP/draft-copy \
  -H 'content-type: application/json' -H "x-cl-session: $TOK" -d '{}'
```

The copy (`routes.ts:225`, `RecordHandlers.ts:180`) gets a fresh recordId, `state:
draft`, NEW session authorship, and `derivedFromRevisionRef` pointing at the source's
saved revision — and it inherits NO reviewer, approver, or signatureRefs. **Explicitly
out of scope** (never add these to test expectations): automatic supersession of the
original, and any revision-management UI.

### 10) POL-REGULATED denial lap — PROVISIONAL

Per QMS-6B receipts (`/home/brad/.hermes/cl/receipts/QMS-6B/`) — final confirmation
pending QMS-6B VERDICT: accept. Restore-the-bundle is REQUIRED even if the lap fails.

1. `/settings` → policy-bundle card → click **Regulated** (`POL-REGULATED`).
   `PolicyBundleSelector` renders the bundle catalog (four cards: POL-SANDBOX,
   POL-NOTEBOOK, POL-TRACKED, POL-REGULATED —
   `app/src/components/settings/PolicyBundleSelector.tsx:5-29`); click →
   `onBundleChanged(bundle.id)` → `SettingsPage.tsx:94-100` PATCHes lab settings.
   On failure it shows a plain JS `alert("Failed to update policy bundle: …")`
   (`SettingsPage.tsx:99`) — a browser reviewer must DISMISS it, not treat it as a
   product crash. Live per-request (no restart); audited as `policy_bundle_changed
   {from,to}` on builds that carry that hook (see the divergence note below).
2. Switch the session user to **`USR-BRAD`** (author ONLY — the under-granted actor).
   Under POL-REGULATED, `enforceTransitionRoles: deny`
   (`schema/core/policy-bundles/regulated.policy-bundle.yaml:16`).
3. Open `DOC-DEMO-SOP` while it sits in `in_review` or `approved`. The
   **permissive-preview rule** (`DocumentControlBar.tsx:150-159`): a signature-gated
   transition is rendered for EVERY actor — preview always reports it `allowed:false`
   because it evaluates with no signatures presented, and the bar shows it anyway
   because `requires.signatureRequired === true`. So BRAD still sees
   "Approve"/"Make effective" buttons.
4. BRAD clicks the gated button → password modal → signs → the PUT returns **422
   `LIFECYCLE_TRANSITION_DENIED`** with message "You do not have the required role for
   this transition." (deny-mode role check; actor-matrix rows BRAD @ POL-REGULATED)
   → denial observed **despite the visible, permissive-preview button**, and the
   document's state is unchanged. Capture the screenshot at this point
   (`qms-regulated-denial.png`).
5. **RESTORE THE BUNDLE** to the pre-lap value (`POL-SANDBOX` on the current lane —
   read `GET /api/config` first to capture it): `/settings` → Sandbox, then verify
   `curl -s -H 'x-user-id: USR-QMS-ADMIN' http://localhost:3092/api/config | jq .lab`
   → `policyBundleId: "POL-SANDBOX"` (`qms-bundle-restored.png`). Do this EVEN IF any
   lap step failed. Never leave the bundle changed.

**Lane-build divergence note (static-verified at drafting, 2026-10-04; reported to the
orchestrator as a flag, NOT resolved here).** The lane trunk `cl/integration-1 @
e4c76142` does NOT contain main @ `8e14b061` (guard commit; `merge-base --is-ancestor`
says not-ancestor). On the LANE build as it stands:
- The `PATCH /api/config` handler (`server/src/api/handlers/configHandlers.ts:314-320`)
  merges `patch.lab` with NO admin guard (no `POLICY_BUNDLE_CHANGE_FORBIDDEN`), NO
  known-bundle 400 check, and NO `policy_bundle_changed` audit emit;
  `validateLabConfig` (`server/src/config/loader.ts:404-425`) does not check bundle
  ids. The 403-guard / 400-before-guard / audit contract stated in the legacy
  "1) Bundle switching — admin-gated" section (2026-09-27) and in the QMS-7 spec
  orientation holds only on builds containing `8e14b061` (main).
- The Settings selector CANNOT switch the bundle on the lane build:
  `SettingsPage.tsx:96` calls `apiClient.patchLabSettings(...)`, and no such method
  exists in the lane's `app/src/shared/api/client.ts` (dropped by merge `a17ffb4e`) —
  every click lands in the catch and alerts "Failed to update policy bundle: …". If
  the accepted build for QMS-7's final lap does not carry main's fix, the UI path in
  step 1 will always fail on it; the API `PATCH /api/config` path still changes the
  bundle on the lane build (with the guard/audit caveats above). The reviewer's
  screenshots will distinguish these cases; this note is the drafting-time evidence.

### 11) What is NOT automated — stated plainly

The lane's checks do NOT automate, and no lap here proves: **competency inference**
(equipment/training requirement satisfaction is data + UI reads, not an enforced
gate), **run-start preconditions** (bundle-level ack flows / `CONTROLLED_USE_BLOCKED`
belong to §2's run-start path, not the document lifecycle), and **CAPA**. Do not
extend the doc to claim coverage of these.

### 12) Pre-isolation demo audit events (A4) — factual note

Demo audit events generated BEFORE data-dir isolation remain in the LIVE data dir:
`/home/brad/.computable-lab/worktrees/main/records/audit-event` contains events
referencing `DOC-DEMO-SOP` (verified 2026-10-04: three
`lifecycle_transition`/`signature_applied`-bearing events there; the lane's own
audit-event dir carries only current lap events and no `policy_bundle_changed` at
drafting time). All NEW evidence for this campaign is lane evidence
(`/home/brad/.computable-lab-lane1/...`); the live-dir events are historical residue,
kept for provenance, not lane receipts.

## Corrections to the 2026-09-27 sections (pointer list — sections left as written)

- Header / Setup / §1-§8 assume the LIVE stack (`:3001`, `/home/brad/.computable-lab`);
  for lane work use the table in §2 above (lane `:3092`/`:5192`,
  `/home/brad/.computable-lab-lane1`).
- `USR-LOCAL-ADMIN` as a working actor (§Setup line 8, §1 line 30, §4 line 62) is
  obsolete: bootstrap/fallback identity that degrades to `USR-BRAD` and can never log
  in — the actor is `USR-QMS-ADMIN` (username `qms-admin`); see §5 and the
  actor-matrix "Bootstrap identity" section.
- §Setup's `POST /auth/...` URLs lack the `/api` prefix — real routes are
  `/api/auth/login`, `/api/auth/set-password` (`server/src/api/routes.ts:265,267`
  under the `/api` prefix registered at `server/src/server.ts:1547`).
- §6's signature body `{action, subjectRecordId, password}` is the OLD shape; current
  `POST /api/signatures` requires `{action, subject:{recordId, targetState},
  password}` (`server/src/api/handlers/SignatureHandlers.ts:59-102`), and "the record
  PATCH" is a PUT (§7 above).
- §7's grep path targets the live data dir; lane greps use
  `/home/brad/.computable-lab-lane1/worktrees/main/records` (§12).
