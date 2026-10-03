# QMS-6 spec — Registry coverage + signature-aware DocumentControlBar + sign-off receipt

Campaign: light-qms-records-browser, **LANE 1**. Task: **QMS-6** (THE LIST
`~/.hermes/cl/lanes/1/task-list.md`).
Deps all `done`: QMS-2, QMS-3, QMS-3A, QMS-4, QMS-5, QMS-1A.

Contracts of record (READ BOTH BEFORE WRITING CODE):
- `.hermes/plans/handoffs/` history + `~/.hermes/specs/inbox/qms-integration-contract.md` (QMS-1)
- `~/.hermes/specs/inbox/qms-integration-contract-2026-10-03-delta.md` (D1–D9; **D6–D9 are THIS task's scope**)
- `docs/qms-actor-matrix.md` (QMS-4 — actor/role/credential facts)

## Goal

Turn three verified orphans — an unrouted QMS browser (now routed by QMS-5), an un-imported
`DocumentControlBar`, and a client with no signing path — into the real lightweight sign-off
workflow: browse `controlled-document` records, drive lifecycle transitions, and satisfy
signature-gated transitions through ONE password modal, with a read-only sign-off receipt.

## HARD RULES (violating any = rejected)

1. **No client.ts edits.** `QMS-3`/`QMS-3A` own it. If you need a client method, it already exists —
   use it. (`createSignature` :2351, `isReauthFailure` :119, `isSignatureRejection` :136,
   `updateRecord` 3-arg :2373, `createDraftCopy` :2321, `listRecordRevisions` :2325,
   `getValidTransitions` :4129 with `requires`.)
2. **No TS policy inference.** Signature-required-ness comes ONLY from
   `transition.requires` (QMS-1A, populated by the lifecycle YAML). Never write `if (target === 'approved')`
   or a `DOC-` special case. The preview stays permissive; do not try to "fix" it.
3. **No hardcoded vocabulary.** Kind `controlled-document` is canonical; the ONE tab entry below is the
   only kind literal you may add.
4. **Password material** never persists in editor state, storage, logs, fixtures or receipts. It lives
   in the modal component's local state and the single `createSignature` request body.
5. **No commits in the shared main checkout** and never touch `/mnt/vast/home/brad/git/computable-lab`.
   Work only in your worktree (below).

## Worktree / branch / deliverable

- Create and work in: `/mnt/vast/home/brad/git/wt/qms-6-lane1-20261003T1510`
- Branch: `wt/qms-6-lane1-20261003T1510` off `cl/integration-1` (HEAD `f68bb502`).
- Your DELIVERABLE is the branch + its commits. Do not open a PR, do not merge.

## Files you own (exclusive writer) — edit ONLY these

- `app/src/pages/RecordRegistryPage.tsx` (per QMS-1(b): first touch must normalize the exec-bit delta —
  the file is mode 755 on main; `chmod 644` it in your first commit, content-neutral)
- `app/src/components/registry/DocumentControlBar.tsx` (delete the signature-unaware direct-state path)
- `app/src/collections/LabCollectionView.tsx` (repoint or remove the dead `document` category)
- NEW supporting components/tests under `app/src/components/registry/` and
  `app/src/pages/RecordRegistryPage.test.tsx`

Do NOT touch `App.tsx`, `client.ts`, anything under `server/`, or any YAML.

## Verified facts you may rely on (opened 2026-10-03; do not re-derive, do not contradict)

- `REGISTRY_TABS` is a hardcoded TS array (`RecordRegistryPage.tsx:11-20`). **No declarative tab
  config surface exists** (QMS-1(c)). Adding one tab entry is correct.
- The authoritative editing surface for this campaign is `RecordRegistryPage`'s inline
  `ProjectionTapTabEditor` (`:307-313`); mount the control bar there.
- `/lab` Documents category targets kind `document` (`LabCollectionView.tsx:33`, card renderer `:157`);
  **no `document` schema exists** → it renders nothing. Repoint it to `controlled-document`.
- `DocumentControlBar.tsx` has zero importers today; its `handleTransition` (`:54-65`) does an
  unaudited `updateRecord(id, {...payload, state})` — this is the obsolete path to DELETE.
- Server transition verb is **PUT** `/records/:id`, body-top-level `signatureRefs`
  (`client.updateRecord(id, payload, { signatureRefs })`).
- The three rejections arrive as `{ error: TOKEN, message }` with no `code`; use
  `isSignatureRejection(err, 'STALE_SIGNATURE' | 'SIGNED_CONTENT_CHANGED' | 'SIGNATURE_TARGET_MISMATCH')`.
  Check `isReauthFailure(err)` BEFORE `describeApiError` (QMS-3 finding).
- Applied approvals: `AuditEvent` action `lifecycle_transition` carries
  `data.signatureRefs: string[]` and `data.event/to/from` (`RecordHandlers.ts:912-926`). A SIG with no
  matching transition event is an **orphan**, never an "applied approval" (delta D7/6b).

## Implementation steps

### Step 1 — `controlled-document` tab
Add `{ id: 'documents', label: 'Documents', kinds: ['controlled-document'] }` to `REGISTRY_TABS`.
Everything else (list, search combobox) already keys off `tab.kinds`.

### Step 2 — Repoint the dead `/lab` Documents category
`LabCollectionView.tsx:33` → `kind: 'controlled-document'`; update the `case 'document'` helper-token
branch (`:157`) to `case 'controlled-document'`. Do not leave a `document` kind anywhere.

### Step 3 — Password modal (ONE modal per signature-gated transition)
New component (e.g. `app/src/components/registry/SignaturePasswordModal.tsx`):
- Props: `{ open, action, targetState, subjectRecordId, lifecycleId, onCancel, onSuccess(signatureId) }`.
- Local `password` state only; cleared on close/cancel/success. Retries allowed inside the modal.
- On submit: `apiClient.createSignature({ action, subjectRecordId, lifecycleId, targetState, password })`.
  `targetState` is REQUIRED — both gates declare `signatureAction: approved`, so separation is by
  `targetState` (delta open-Q2; `RecordHandlers.ts:752-753`).
- On `isReauthFailure` show a distinct "password rejected" message; on
  `isSignatureRejection` show the specific instruction (below); anything else is a generic error.
  In-flight double-submit blocked (disable while submitting).

### Step 4 — `DocumentControlBar` rewrite (the core)
- Render only when `record.payload.lifecycleId` is present (plain TRR/CAL show NO chrome — A6).
- Load transitions via `getValidTransitions(recordId, lifecycleId)`. Read guard facts from
  `transition.requires` ONLY.
- **VISIBILITY RULE (round-2 fix, verified defect).** The preview evaluates guards with
  `presentedSignatures: []` (`LifecycleHandlers.ts:66`), so a signature-gated transition is
  ALWAYS reported `allowed:false` for every actor — including the reviewer. Rendering only
  `t.allowed` therefore hides "Approve"/"Make effective" forever and makes the entire signing
  flow unreachable. A transition button MUST be rendered when
  `t.allowed || t.requires?.signatureRequired === true`. Only signature-gated transitions are
  rendered despite `allowed:false`; a transition that is `allowed:false` for a NON-signature
  reason (missing role) stays hidden. There is no policy in TS here — the distinction is exactly
  the declarative `requires` fact from QMS-1A.
- **Dirty editor state disables every transition button** with a visible "save first" hint. The bar
  needs a `dirty` prop from the page.
- Transition button click:
  1. If `requires?.signatureRequired === false` (or `requires` absent): `updateRecord(recordId,
     {...payload, state: targetState})` — NO password prompt.
  2. If signature-gated: open ONE password modal. On success `signatureId`:
     `updateRecord(recordId, {...payload, state: targetState}, { signatureRefs: [signatureId] })`.
     On cancel: send nothing.
  3. **sign-ok / PUT-fail split (delta critical):** if the PUT fails after a mint, do NOT present the
     orphan SIG as applied. Show the server's ACTUAL state, surface the rejection reason, refetch.
     The SIG record stays (append-only) and is shown as an ORPHAN in the receipt.
  4. Rejection handling (6e): `STALE_SIGNATURE` → "re-sign the current saved revision";
     `SIGNED_CONTENT_CHANGED` → "save edits first"; `SIGNATURE_TARGET_MISMATCH` → "signature belongs
     to a different transition". NEVER render any of these as "wrong password".
- DELETE the old signature-unaware `handleTransition` direct-state PUT path.

### Step 5 — Sign-off receipt (READ-ONLY, delta R6)
Small read-only block near the state badge in the bar (or a sibling `SignOffReceipt` component):
- Fetch the record's signatures and its `lifecycle_transition` audit events; classify each SIG:
  **applied** (its id ∈ some transition event's `data.signatureRefs`), **orphan** (minted, no matching
  transition event), or **none required**.
- Show, per applied signature: signer, action, targetState/transition, and the snapshot id/hash from
  NEW signatures (`SignatureResult.subject.revisionRef?.id` / `contentHash`). Legacy signatures with no
  verifiable snapshot are labelled **historical evidence only — does not authorize**.
- No audit dashboard. Keep it minimal.
- Read surface EXISTS: `apiClient.listRecordsByKind(kind, limit)` (`client.ts:2069`; `GET
  /records?kind=…`). List `'signature'` and `'audit-event'`, filter client-side:
  `SIG.subject.recordId === recordId` and `EVT.subjectId === recordId && EVT.action ===
  'lifecycle_transition'`. Do NOT add a new client method (client.ts is not yours). If the kinds turn
  out not to be listable, STOP and report `requires-rescope` with the observed 4xx.

### Step 6 — Editing an approved/effective doc uses draft-copy (delta D6/6c)
When `state` ∈ {approved, effective}, the editor is READ-ONLY and in-place Save is replaced by a
"Create draft revision" action calling `apiClient.createDraftCopy(recordId, {})`; the returned new
draft opens for editing (fresh authorship, no inherited reviewer/approver/signature assignments — the
server does that; you only call it). Show the server's rejection if in-place edit is refused. No
supersession UI, no revision-management UI.

## Tests (TDD — RED before GREEN for at least the guard-branch logic)

Write and RUN:
- `app/src/components/registry/DocumentControlBar.test.tsx` — mock `apiClient`:
  - unguarded transition → `updateRecord` called with NO `signatureRefs` and NO password modal;
  - signature-gated transition → modal opens; on submit `createSignature` called WITH `targetState`;
    success → `updateRecord` called with `signatureRefs:[id]`;
  - dirty=true → all transition buttons disabled + "save first" hint present;
  - `requires` absent → no modal (permissive-preview contract preserved);
  - STALE_SIGNATURE / SIGNED_CONTENT_CHANGED / SIGNATURE_TARGET_MISMATCH each render their distinct
    instruction and NONE renders a "wrong password" message.
- `app/src/pages/RecordRegistryPage.test.tsx` — a `controlled-document` record appears under the
  Documents tab; the bar mounts for it and NOT for a plain `training-record`.

Commands (run each; paste raw output in your report):
```
cd /mnt/vast/home/brad/git/wt/qms-6-lane1-20261003T1510/app
npx vitest run src/components/registry/DocumentControlBar.test.tsx src/pages/RecordRegistryPage.test.tsx
npm run typecheck -w app 2>&1 | tail -20
```
Pre-existing app typecheck failures named `useAiChat.surfaceContext.test.ts` are NOT yours — leave
them, name them as pre-existing. Any NEW error in a file you touched is yours.

## Acceptance criteria (worker-verifiable slice)

1. RED→GREEN evidence for the guard-branch tests (both outputs pasted).
2. All tests above green; `git diff --stat` names ONLY the owned files.
3. `typescript` clean in the touched files; pre-existing failures named.
4. No occurrence of a kind literal other than `controlled-document` added; no `document` kind left.
5. Report the exact server read-surface you used for signatures/audit events (path:line), or a
   `requires-rescope` stop if none exists.

## NOT yours (do not attempt)

- The browser acceptance gate (orchestrator dispatches `cl-browser-reviewer` against :5192).
- QMS-7's runbook, POL-REGULATED lap, or the demo seed.
- Server-side anything. Reviewer-credential setup (needs Brad).

## Report back

Absolute paths + `git diff --stat`; the RED command/output and the GREEN command/counts; the app
typecheck output with pre-existing failures named; the sign-off read-surface path:line; anything that
surprised you (do NOT paper over it); a `requires-rescope` note instead of a guess if you hit a
genuine platform gap.

---

## ROUND 2 FIX (2026-10-03, orchestrator-verified defect) — small, targeted

Your first delivery is merged into `cl/integration-1` (`dd4f0b4f`). Live orchestrator verification on
`:5192` found ONE functional defect that makes the whole sign-off flow unreachable:

**Defect (reproduced live):** with `DOC-DEMO-SOP` open the bar renders "Submit for review" (draft).
After `draft→in_review` the bar renders ONLY "Return to draft" and "Archive" — there is **no
"Approve" button**, so no signature-gated transition can ever be started. Root cause: `DocumentControlBar`
renders `transitions.map(t => t.allowed && <button/>)`, but the permissive preview
(`LifecycleHandlers.ts:66`, `presentedSignatures: []`) reports every signature-gated transition
`allowed:false` for EVERY actor, including the reviewer. QMS-1A deliberately did not change `allowed`.

**Fix:** apply the VISIBILITY RULE above —
render a transition button when `t.allowed || t.requires?.signatureRequired === true`.
Signature-gated transitions are actionable via the password modal; a transition hidden for a
non-signature reason (missing role) must stay hidden.

**Note on the same-person denial (no code change expected, verify):** clicking "Approve" as the author
(USR-BRAD) opens the modal and mints a signature, then the PUT returns 422
`LIFECYCLE_TRANSITION_DENIED` ("You do not have the required role for this transition." — the
different-person guard). `describeApiError` passes 422 messages through, so the bar already shows the
server's actual message — confirm it is shown and is NOT a password error.

**Tests to add/update (TDD):** in `DocumentControlBar.test.tsx` add a case where a transition has
`allowed:false` and `requires:{ signatureRequired:true, differentPersonThan:'author' }` → its button
MUST render; and a case where `allowed:false` with `requires` undefined → its button must NOT render.
Run: `npx vitest run src/components/registry/DocumentControlBar.test.tsx` (all green) and
`npm run typecheck -w app` (no new errors in touched files).

**Worktree/branch:** `/mnt/vast/home/brad/git/wt/qms-6-fix1-lane1-20261003T1510`, branch
`wt/qms-6-fix1-lane1-20261003T1510` off `cl/integration-1` (HEAD `dd4f0b4f`). Commit there. Owned
files: `app/src/components/registry/DocumentControlBar.tsx` + its test only.

---

## ROUND 3 (2026-10-03 tick 20261003T222126) — GATE OBTAINED, VERDICT: fix, and the cause is a PLATFORM GAP → STOP

The independent `cl-browser-reviewer` gate finally ran (appliance-2 endpoint stable). Receipts:
`/home/brad/.hermes/cl/receipts/QMS-6/20261003T222126/` (`trail.json`, `report.md`, 10 shots).

Accepted by the gate (real receipts): `/registry` + reload; Documents tab + controlled-document tag;
`draft→in_review` with NO password modal; `Approve` RENDERS in `in_review` (round-2 fix holds) and
opens exactly ONE modal (action `approved`); Cancel sends nothing; TRR-DEMO-1 has no lifecycle chrome;
/lab Documents pill resolves; fixture restored to `draft`; no console errors.

The reviewer's 2 defects were re-verified by the orchestrator: **one is a false positive** (CAL-DEMO-GC
IS listed under Calibrations and renders — API and live both confirm), and **one is REAL and is NOT
QMS-6's to fix**:

**The document editor renders NO fields for controlled-document.** `GET /api/ui/record/DOC-DEMO-SOP/editor`
returns every block with `slotIds: []`; the live TipTap node is empty and the payload text appears
nowhere in the DOM. Cause: `controlled-document.ui.yaml`'s `editor.blocks` declare no `path`, and
`assignSlotsToBlocks()` (`server/src/ui/EditorProjectionService.ts:105-116`) is the only binding
mechanism and binds solely by `slot.path.startsWith(block.path)` — skipping blocks without a `path`.
`buildProjectionDocument` (`app/src/editor/taptab/documentMapper.ts:173-177`) then skips every block.
There is no declarative way to bind scalar slots to a section block: `EditorBlock` has only `path`
(documented for repeater/table), `EditorSlot` has no back-reference, and `schema/ui/ui-v1.schema.yaml`
does not model `editor` at all (`additionalProperties:false`, no `editor` key).

This re-opens QMS-1 (a) — classed **resolved** ("use the `markdown` widget on an `editor.blocks` slot")
but only ever checked the widget, never the block↔slot binding. QMS-2 authored the ui.yaml on that
guidance and its test asserted slot presence only.

**QMS-6 is FORBIDDEN to absorb this** (this spec's own rule: a genuine new platform gap goes back to the
architect as blocked). Remedy options in the handoff. QMS-6 → **blocked**; QMS-7 stays behind it.
Second blocker unchanged: `USR-LOCAL-ADMIN` has no credential, so the signed rows cannot be exercised
(Brad's `POST /auth/set-password`).
