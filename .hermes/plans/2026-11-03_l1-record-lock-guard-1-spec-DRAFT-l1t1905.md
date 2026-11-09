# SPEC — L1-RECORD-LOCK-GUARD-1 (lane 1) · draft l1t1905

Draft author: cl-spec-composer. Not reviewed, not dispatched. Trunk under test:
`cl/integration-1` @ `819a2f448c73c15648571b2822195422948c472e` (worktree
`/mnt/vast/home/brad/git/cl-integration-1`, clean apart from untracked `node_modules`/`ready`).

## 1. Goal (one sentence)

Make `/record/<id>` refuse to write an approved/effective (or lifecycle-terminal) controlled
document — no enabled Save, a declared draft-copy affordance instead — and make a no-edit
save a byte-level no-op at the API so `meta.contentSha` cannot drift, without adding a second
hardcoded lifecycle list in TS.

## 2. Corrected problem statement (defect narrowing, criteria unchanged)

The 301ST handoff's sentence "NO content-immutability guard on plain PUT `/records/:id`" is
**wrong as written**. Two guards already exist, both keyed on the same hardcoded state set:

- `server/src/api/handlers/RecordHandlers.ts:1139-1141` — `CONTROLLED_RECORD_LOCKED` (409) when
  stored `lifecycleId` is set, stored state ∈ {approved, effective, superseded, archived}, and
  `controlledContent(previous) !== controlledContent(proposed)`.
- `server/src/store/RecordStoreImpl.ts:285-291` (`contentLockError`) — the same predicate at the
  store wall, so an API-bypassing service hits it too.

What the gate actually observed is a **no-edit** save: content, state, revision and signatures
unchanged, so the semantic guard passes, and the record still got a new `contentSha` and a new
data-repo commit. Acceptance criteria 1-5 stand verbatim; only the diagnosis narrows.

### Measured cause (verified first-hand, not a hypothesis)

`controlledContent` (`server/src/revisions/RecordRevisionService.ts:32-36`) strips
`state/createdAt/createdBy/updatedAt` then `canonical()` sorts keys — so it is blind to the very
field that changed. `RecordHandlers.ts:1195-1216` injects `updatedAt: new Date().toISOString()`
into the payload unconditionally, `store.update` (RecordStoreImpl.ts:696-698 → `updateUnlocked`
:700-840) re-serializes with `serializeRecord` and calls `repo.updateFile` with **no
content-equality short-circuit anywhere in that path** (grep: none exists — do not claim one is
missing before checking, and do not assume one exists).

Proof the drift is exactly the timestamp refresh and not key-order/formatting churn — the lane
data repo's own commit for the gate's no-edit click:

```
cd /home/brad/.computable-lab-lane1/worktrees/main
git show --stat dbda2eda            # 1 file changed, 1 insertion(+), 1 deletion(-)
git show dbda2eda -- records/controlled-document/DOC-DEMO-SOP__demo-gc-fid-standard-injection-sop.yaml \
  | grep '^[-+][^-+]'
-updatedAt: 2026-10-19T19:22:03.106Z
+updatedAt: 2026-11-03T23:49:44.028Z
```

So the orchestrator's serialization-order hypothesis is **not** the cause here (the file was
already written by the same serializer, so key order is stable). A coder who finds different
evidence on their own worktree must say so and re-derive; do not implement a byte-diff fix for a
timestamp bug.

## 3. Scope

IN scope (product code):

- `server/src/api/handlers/RecordHandlers.ts` — no-op short-circuit in `updateRecord` only.
- `server/src/api/handlers/RecordHandlers.writeGates.test.ts` **or** one new
  `server/src/api/handlers/RecordHandlers.controlledLock.test.ts` — RED-first pins.
- `app/src/event-editor/create/RecordEditPanel.tsx` — lock affordance + draft-copy.
- one new shared module `app/src/shared/records/lifecycleLock.ts` (name is a suggestion) — the
  single predicate home.
- `app/src/pages/RecordRegistryPage.tsx` — import that module, delete its inline
  `contentLocked` pair (`:554-560`). Behaviour must not change.
- `app/src/event-editor/create/RecordEditPanel.qms6e.test.tsx`,
  `app/src/shared/shell/RecordHostPage.share.test.tsx` — only to extend apiClient mocks and add
  new cases; do not weaken existing assertions.

OUT of scope: `RecordStoreImpl.ts` (optional defence-in-depth at most, see Leg B2), lifecycle
YAML/meta-schema, `LifecycleEngine`, `LifecycleHandlers`, any stack restart, any data-repo edit,
any new API contract/token, `/registry` behaviour changes.

## 4. Acceptance criteria (verbatim from the task block)

```
1. /record/DOC-DEMO-SOP (effective) renders NO enabled Save; the lock affordance is 'Create draft revision'
   (or an equivalent that mints via POST /records/:id/draft-copy). Browser-verified on :5192.
2. A no-edit submit on an effective record does not change meta.contentSha (or is refused with a typed
   rejection); a content-changing submit is refused, never silently accepted.
3. /registry S10 still passes unchanged (saveGone true, headerButtons ['Create draft revision','Cancel'],
   draft-copy 200, original untouched).
4. A DRAFT record still saves normally on /record (S1(b) preserved: PUT 200, reload shows the edit).
5. RED-first pin at the layer that was fixed + no new type errors.
```

## 5. Remedy decision rule (not a guess)

Land **both** legs. Order: **B first, then A**. B is the smaller, provable, policy-free change
and it is what makes acceptance 2 true for the bare API; A is what acceptance 1 grades on :5192.

### Leg B (MANDATORY) — no-edit save is a true no-op. Hardening of an existing guard, NOT a new one.

In `updateRecord`, after the last write gate (the QMS7-4 archive-guard block ending
`RecordHandlers.ts:1184`) and **before** the protocol `version` branch at `:1186`, add:

> if `String(previous.state) === String(proposed.state)`
> and `controlledContent(previous) === controlledContent(proposed)`
> and no `signatureRefs` were presented
> and no `lifecycleTransition` fired
> → return status 200 with `{ success: true, record: existing }` and touch nothing.

Notes that make this correct rather than plausible:

- Reuse `controlledContent` (already imported). Do **not** hand-roll a diff, and do not add
  `updatedAt` to the strip list anywhere — that would silently weaken the lock.
- Return the **stored** envelope (`existing`, which carries `meta.contentSha` from the file sha);
  the client's reload then shows the same sha. Do not fabricate a response envelope.
- Placing it after the gates keeps "a refusal persists nothing" and keeps the 409 path
  byte-identical; placing it before `:1186` means a no-op protocol save no longer bumps
  `version`. A no-op must not mint a revision, an audit event, or an index rebuild. If, and only
  if, a test or contract requires the protocol version bump on a no-edit PUT, narrow the
  short-circuit to records with `previous.lifecycleId` present and say so in the report.
- Do **not** implement this at the git adapter: `EmbeddedGitRepoAdapter.commitPaths` already
  returns `{success:true}` on a clean tree, but the file is written before that check, so the
  no-op must be decided above the store.
- Acceptance 2's "content-changing submit is refused" is **already true and already tested**
  (`RecordHandlers.writeGates.test.ts:247-268`, 409 `CONTROLLED_RECORD_LOCKED`, `updateCalls`
  empty). Add one effective/controlled-document case to pin the surface you touched; do not
  re-implement the refusal and do not invent a new token.

### B2 (optional, only if free) — store-level equality short-circuit

`RecordStoreImpl.updateUnlocked` may skip `repo.updateFile` when the serialized `content` equals
`target.content`. Keep it as a second, clearly-labelled commit; it must not change any error
path. If it costs more than a few lines, skip it and say so — Leg B in the handler is sufficient
for the acceptance bar.

### Leg A (MANDATORY) — data-driven lock affordance on /record.

- Create ONE predicate home (suggested `app/src/shared/records/lifecycleLock.ts`) exporting:
  `isContentLocked(payload)` (the approved|effective pair, moved verbatim out of
  `RecordRegistryPage.tsx:554-560`) and `isRecordWriteLocked(payload, terminalStates)` =
  `isContentLocked(payload) || (payload.state ∈ terminalStates)`. Keep the fail-open contract of
  `terminalStates` (empty ⇒ not terminal), matching `RecordRegistryPage.tsx:251-262`.
- `RecordRegistryPage` imports the module and deletes its inline pair; `contentLocked ||
  terminalLocked` composition and the `:884-905` affordance swap stay behaviourally identical.
- `RecordEditPanel` consumes the same predicate. When `formData.lifecycleId` is present, fetch
  `apiClient.getLifecycleTerminalStates(lifecycleId)` once (effect keyed on lifecycleId,
  try/catch ⇒ `[]`). Locked ⇒ render **no** `record-edit-save`; render
  `data-testid="record-edit-draft-copy"` labelled exactly `Create draft revision` plus the
  existing `Close`, and pass `disabled` to `ProjectionTapTabEditor` so the body is not editable
  (registry parity, `RecordRegistryPage.tsx:944`). Unlocked (draft, in_review, no lifecycleId) ⇒
  today's Save, untouched.
- Draft-copy: call `apiClient.createDraftCopy(recordId, {})` (no new endpoint), dispatch
  `cl:records-changed`, then surface the new record — navigating to `/record/<newId>` is the
  cheapest correct option (the host is route-driven, `App.tsx:217`). On failure show the existing
  error banner via `describeApiError`. Never submit the form on a locked record.

### A2 — declared lock policy in lifecycle DATA: OUT of this item

The `approved/effective` pair is **not** declared anywhere: `lifecycle.meta.schema.yaml` allows
only `id/label/initial/terminal/description` per state (`additionalProperties: false`), and
`document-controlled-signing.lifecycle.yaml` marks only superseded/archived `terminal: true`.
Making the pair data-driven therefore requires a meta-schema edit + YAML edits + engine accessor
+ endpoint field + client accessor + a **lane-stack restart**, which only the orchestrator may
perform. Do not do this silently and do not do it in this worktree. Leg A's obligation is
"reuse the one predicate, do not create a second list" — that is satisfied by the shared module.
If the coder believes A2 is required, STOP and return `requires-rescope` with the file list.

## 6. First targeted check (cheapest proof of the mechanism, run before writing code)

```
cd /home/brad/.computable-lab-lane1/worktrees/main
git show dbda2eda --stat --format='%h %s'
git show dbda2eda -- records/controlled-document/DOC-DEMO-SOP__demo-gc-fid-standard-injection-sop.yaml | grep '^[-+][^-+]'
```

Expected exactly (measured 2026-11-03 by the composer at `819a2f44`):

```
dbda2eda Update DOC-DEMO-SOP
 .../DOC-DEMO-SOP__demo-gc-fid-standard-injection-sop.yaml | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
-updatedAt: 2026-10-19T19:22:03.106Z
+updatedAt: 2026-11-03T23:49:44.028Z
```

Two changed lines, both `updatedAt`. If that is what you see, the fix is the Leg B short-circuit
above; if you see body/key reordering, stop and report the real diff instead of implementing
either leg blind.

Second, RED-first at the fixed layer (write before fixing), in the handler harness that already
exists (`RecordHandlers.writeGates.test.ts` exports its own fake store — `makeGateStore`,
`updateCalls`):

> no-op PUT on an `effective` controlled-document (payload identical to stored, fresh
> `updatedAt` only) ⇒ 200, `updateCalls.length === 0`, returned `record.meta.contentSha` equals
> the stored one. Currently RED: `updateCalls.length === 1`.

## 7. Verification bars (numbers measured by the composer at 819a2f44 — not invented)

Run every command from the worktree root unless stated.

| # | command | expected |
|---|---|---|
| 1 | `cd server && ./node_modules/.bin/vitest run src/api/handlers/RecordHandlers.writeGates.test.ts src/api/handlers/RecordHandlers.lifecycle.test.ts src/store/RecordStore.test.ts` | baseline `3 files / 62 tests passed`; after the change: 63+ tests, 0 failed |
| 2 | `cd server && ./node_modules/.bin/vitest run src/governance/archivedAssignment.test.ts src/revisions/SignatureIntegrity.test.ts src/revisions/RevisionStorage.test.ts` | baseline `3 files / 22 tests passed`; must stay all-green (pins `controlledContent` semantics, `archivedAssignment.test.ts:479`) |
| 3 | `cd app && ./node_modules/.bin/vitest run src/event-editor/create/RecordEditPanel.qms6e.test.tsx src/shared/shell/RecordHostPage.share.test.tsx src/pages/RecordRegistryPage.test.tsx src/pages/RecordRegistryPage.qms6e.test.tsx src/pages/RecordRegistryPage.archiveBrowsing.test.tsx` | baselines measured separately: `RecordEditPanel.qms6e` (part of 4 files/31) + `RecordHostPage.share` 6 tests; combined must be all-green, with ≥2 new panel tests |
| 4 | `./node_modules/.bin/tsc --noEmit -p server` | rc 0, zero output (hard bar — server tsconfig has `exactOptionalPropertyTypes: true`) |
| 5 | `./node_modules/.bin/tsc --noEmit -p app \| grep -c 'error TS'` | **21** — the pre-existing baseline, and none of them in the touched files |
| 6 | `git -c core.fileMode=false diff --stat` | only the files listed in §3 |
| 7 | manual probe (no browser): `curl -s :3092/api/records/DOC-DEMO-SOP \| grep contentSha` before/after a scripted no-op PUT against the **lane** backend only | identical value; `git -C /home/brad/.computable-lab-lane1/worktrees/main log -1 --format=%h` unchanged. Do not run this against Brad's `:3001`. |

`pnpm install --frozen-lockfile` fails on this trunk (known lockfile drift) — use the existing
`node_modules`, in the worktree you are given.

## 8. Worker contract

- Fresh worktree: `wt/l1-record-lock-guard-1-lane1-<ts>` off `cl/integration-1` @ `819a2f44`.
- Branch: `cl/lane1-record-lock-guard-1-l1t<HHMM>`.
- Report: `/home/brad/.hermes/cl/lanes/1/record-lock-guard-1-report-l1t<HHMM>.md`, ending with
  exactly `RECORD-LOCK-GUARD-1 DONE <40-char sha>` or `RECORD-LOCK-GUARD-1 BLOCKED <one-line reason>`.
- In the report: which legs landed, the measured before/after `contentSha` for the no-op probe,
  the RED evidence for each new test (failing assertion text before the fix), the exact app-tsc
  error count, whether the protocol-version narrowing was needed, and the browser-brief path.
- No merge, no lane-stack restart, no task-list edit, no data-repo commit of your own.
- Worker writes product code only on the branch; the browser gate is not yours (below).

## 9. Browser gate hand-off (acceptance 1 — NOT the coder's job)

Leave, next to the report, `record-lock-guard-1-browser-brief-l1t<HHMM>.md` containing:

1. the branch name and last commit sha (the orchestrator merges and re-pins; the gate pins the
   **served** revision on `:5192`, not your branch);
2. testids/expected DOM for `/record/DOC-DEMO-SOP`: no `record-edit-save`,
   `record-edit-draft-copy` present with text `Create draft revision`, header buttons
   `['Create draft revision', 'Close']`, State `effective`, editor body non-editable;
3. the pre-gate baseline read commands the reviewer must run **first**
   (`GET :3092/api/records/DOC-DEMO-SOP` → `meta.contentSha`, and
   `git -C /home/brad/.computable-lab-lane1/worktrees/main log -1 --format='%h %ci'`) — do not
   reuse the `l1t1845` receipts or its `contentSha`;
4. the no-drift probe for the reviewer: click-through may not add a data-repo commit and the
   `contentSha` must be unchanged, with `idle`/`consoleErrors`/`pageErrors` captured;
5. the note that `DOC-20660FF4E9734191` / `DOC-A56FD77A9B124087` 404 for `USR-BRAD` is an ACL read
   filter, not fixture loss.

## 10. Reviewer bait (pre-empt each explicitly)

1. **UI-only fix.** Enabling `Create draft revision` and leaving bare-API drift is exactly the
   half-fix the task block calls out (`description` A-alone residual gap). Leg B must be in the
   diff, with the `updateCalls.length === 0` pin.
2. **Over-locking DRAFTS.** Gating on "has `lifecycleId`" or "not draft" removes Save from
   `in_review` (`RecordEditPanel.qms6e.test.tsx` uses `state: 'in_review'`) and breaks acceptance
   4 / S1(b). The gate is the predicate, never the presence of a lifecycle.
3. **A second TS lifecycle list.** Adding `['approved','effective','superseded','archived']` (or
   any subset) inside the panel or a new helper is an automatic reject. Superseded/archived must
   come from `getLifecycleTerminalStates`. Note the pre-existing lists at
   `RecordHandlers.ts:1139` and `RecordStoreImpl.ts:286` are out of scope — do not "fix" them by
   adding a third, and do not delete them without an architect ruling.
4. **`exactOptionalPropertyTypes` (server).** Threading anything optional into a response or the
   store options must use the spread-if-defined idiom already used at `RecordHandlers.ts:1232-1238`
   (envelope/meta) and `:1390-1396` (response); a bare `{ record: existing, validation: undefined }`
   fails `tsc -p server`.
5. **YAML/reload trap.** `tsx --watch` does not reload YAML. Any lifecycle-YAML or meta-schema
   edit needs a `cl-lane-stack.sh 1 restart` **by the orchestrator**, and it is why A2 is out of
   scope. Do not restart, do not hand-edit the data repo, do not assume your YAML edit is live.
6. **"Writes only happen on submit."** They don't: the panel loads via GET, but the store may
   write on any PUT including a no-op one, and `updateRecord` also runs `indexManager.rebuild()`
   after a write. Verify the panel does not PUT on mount/open before claiming the only write path
   is Save.
7. **ACL 404 as fixture loss.** `DOC-20660FF4E9734191` / `DOC-A56FD77A9B124087` are visible as
   `USR-QMS-ADMIN` and return 404 only for the default viewer. Never delete, re-mint, or "repair"
   them.
8. **Mock-shape breakage.** `RecordEditPanel.qms6e.test.tsx:19-25` mocks `apiClient` with four
   methods only; a new `getLifecycleTerminalStates` call throws `is not a function` (the registry
   suites already log that noise at `RecordRegistryPage.tsx:195`). Extend the mock, keep the
   try/catch fail-open, and do not let a caught TypeError masquerade as "lock unavailable".
9. **Silently changing `/registry`.** Extracting the predicate must be a pure move: if
   `RecordRegistryPage.test.tsx`'s "Create draft revision replaces Save when locked" case changes
   shape, the move was not pure.
10. **Claiming the browser pass.** Acceptance 1 is a browser verdict on the served revision by
    `cl-browser-reviewer`; a unit test asserting absent Save does not discharge it.

## 11. Assumptions

- AS-L1T1905-1 The drift cause is the unconditional `updatedAt` refresh at
  `RecordHandlers.ts:1205-1216`, proven by data-repo commit `dbda2eda` (single-line diff). Debt:
  false.
- AS-L1T1905-2 Leg A may keep the `approved/effective` pair in TS **as the single existing
  predicate**, reused by a shared module, because no lifecycle DATA field declares content-lock
  today; declaring one is scoped out (A2) pending an architect ruling. Debt: **true** until A2 or
  a ruling.
