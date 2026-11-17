# L2-NOUN-CREATION-JOURNEY-1 / unit u2resume-v2 — report

Item: L2-NOUN-CREATION-JOURNEY-1 u2resume-v2 (2 of n), lane 2, tier consequential.
Worktree: /home/brad/cl-wt/L2-NOUN-CREATION-JOURNEY-1-u2resume-lane2
Branch: cl/lane2-nounjourney-u2resume-l2t2702
Base: 2fe105a7981984656d2aa60bd888798e6b032fb4

## What was done

The RETURN half of the declared noun-create journey is now LIVE at the governed
draft-accept seam. When a draft whose input declares the journey link
(`input.journey = {checkpointId, threadRef, endpoint, materialRecordId}` — the
open object of form-draft.schema.yaml; the closed form-draft-REQUEST schema was
not touched) is accepted, AFTER the ONE committed creation and the accepted
status are durable, `FormDraftService.accept` resumes the parked origin turn
BY IDENTITY:

1. `resumeAfterMaterialCreation` (the pure u1journey leg, unmodified) classifies
   the return against the parked checkpoint loaded BY IDENTITY from
   `PendingIntentStore` (same ai-threads root server.ts:1012-1013 wires:
   `process.env.AI_THREADS_ROOT || join(workspaceRoot, 'var', 'ai-threads')`).
2. On a `resume` verdict, `PendingIntentStore.resume` compare-and-set
   (`expectedVersion` = the loaded document's `concurrency_version`) flips the
   checkpoint to `resumed` at most once; the accept result carries the
   MaterialReference delta, the verbatim origin prompt, `requireExplicitResume`,
   the confirmed receipt, and `{committedRecordId, committedRevision}` where
   `committedRevision` is the committed record's ACTUAL observed revision token
   (`token(env)`), not an event count.
3. Every refusal (`already-resumed`, `version_conflict`, `checkpoint-not-found`,
   `journey-declaration-missing`, `material-record-missing`, classification
   refusals, and any thrown error) is NOTED on the result as
   `{resumed:false, checkpointId, refusal:{code,message}}`; the seam NEVER
   throws out of accept and never re-commits the creation. Unlinked drafts: the
   seam returns undefined and the checkpoint store is byte-untouched.

## Changed files (2, +212 lines; budget 2 files / 250 lines)

- server/src/drafts/nounCreateResumeAccept.test.ts (NEW, 144 lines) — RED-first.
- server/src/drafts/FormDraftService.ts (+68/-1 net: imports, `join`, the seam
  call after the accepted persist inside the existing record+source locks, and
  the private `resumeNounCreateJourney` method).

No other file touched. Prohibited files (nounCreateResume.ts,
PendingIntentStore.ts, nounCreateResume.test.ts, app/**, config/journey/**)
unmodified.

## Commits

1. d2d79e721d0b4991cc37ddf5ff4427abf5fd7e7f — RED: test file only. Verified
   RED at this commit: `npx vitest run src/drafts/nounCreateResumeAccept.test.ts`
   => "3 failed | 1 passed (4)" (exit 1) — the 3 linked-checkpoint cases fail on
   the missing `journeyResume` note; the unlink case passed vacuously (it
   asserts the store is untouched, which is also the pre-seam behavior).
2. 667f2c57f477e5a89325e5607bdc3b5d022b4250 — GREEN: the seam.
3. (this report + marker commit — see the DONE marker for its SHA; the marker
   names the commit that CONTAINS this report).

## Verification (RAW outputs, run at the final commit)

Baseline at base 2fe105a79 (before any change):
- `npx tsc --noEmit` => exit 0, 0 "error TS" lines. NOTE: the brief's baseline
  claim of "exactly 6 pre-existing multipart errors" was NOT reproduced at
  this base in this worktree; the honest invariant is "no NEW errors" and that
  holds (0 at base, 0 at final).
- `npx vitest run src/drafts` => exit 0, "Test Files 10 passed (10), Tests
  104 passed (104)".
- Environment note: this worktree was missing the (gitignored) `server/schema`
  symlink every other worktree has (`.gitignore:52` ignores it). Without it the
  base drafts suite fails to load schemas; I recreated `server/schema ->
  ../schema` (untracked, gitignored, matching sibling worktrees) so the suite
  can run. It is not part of any commit.

At the final commit:
- `npx vitest run src/drafts/nounCreateResumeAccept.test.ts src/drafts/FormDraftService.test.ts`
  => exit 0, "Test Files 2 passed (2), Tests 14 passed (14)" (4 + 10).
  (FormDraftService.test.ts logs pre-existing `[acl-mint-refusal]` stderr lines
  from the unresolvable-principal owner-policy test; the test passes.)
- `npx vitest run src/drafts` => exit 0, "Test Files 11 passed (11), Tests
  108 passed (108)" (104 base + 4 new).
- `npx tsc --noEmit` => exit 0, 0 "error TS" lines (was 0 at base).

## Acceptance matrix

(a) Linked accept flips the checkpoint to `resumed` via store CAS and attaches
    the MaterialReference delta: asserted at the RECORD — delta entry
    `semantic_type === 'MaterialReference'`, `canonical_value ===
    record:<id>`, `source_records === [{record_id, revision: token(committed
    envelope)}]`; checkpoint doc `status === 'resumed'`, `concurrency_version
    === 2`, `resume_receipt.resumed_by === 'USR-test'`, receipt id matches the
    note. PASS.
(b) Unlinked draft: checkpoint store file byte-identical before/after
    (`readFile` compare), `journeyResume` absent from the result. PASS.
(c) Pre-resumed checkpoint (an external concurrent `store.resume` won first):
    accept still succeeds, refusal noted `already-resumed`, store file
    byte-identical to the post-first-resume state, first resume's receipt stays
    authoritative (`resumed_by === 'USR-other'`, version 2). One committed
    effect. PASS.
(d) Resume failure never throws: a link with a thread segment outside the store
    id alphabet makes the store constructor throw; accept still succeeds,
    `journeyResume.resumed === false`, `refusal.code === 'resume-error'`. PASS.

## Design decisions

- Link carrier: `input.journey` on the draft RECORD. The draft record's
  `input` is an open object (form-draft.schema.yaml), while the compile
  request schema is closed AND the sequence-action intent schema rejects
  unknown keys (`additionalProperties: false` per oneOf branch) — so the link
  cannot ride in the intent or the request without touching prohibited
  surfaces. The seam reads it from the persisted draft record.
- The seam runs INSIDE accept's existing `withRecordLock(id, ...)` +
  `lockSources(...)` region, AFTER the accepted persist, wrapped so no error
  escapes; it re-runs nothing and writes no record — the only record write of
  the accept is the unchanged creation loop.
- Store root: identical to server.ts wiring (env override, workspace default);
  `userId` = the accepting actor (checkpoint docs are per-(user,endpoint,scope,
  thread)).
- The seam builds its own `PendingIntentStore` instance (the store is
  per-thread and stateless apart from the module-level CAS chain, so a second
  instance for the accept path is correct by construction — the chain is
  module-level, shared across instances, which is the double-fire guard).

## Known limitations / next units

- The link is stamped on the draft record by whoever parked the checkpoint
  (the checkpoint-creation leg / UI wiring owns populating `input.journey`);
  this unit owns the return side of the seam only.
- `committedRevision` falls back to the literal `'unobserved'` if the committed
  envelope carries no revision token (real store writes always do).
- Browser acceptance (reload mid-journey, two tabs not double-consuming) is
  owned by the orchestrator's journey-milestone gate — not attempted here.
- YAML changes: none (no journey/config YAML touched), so no lane-stack reload
  is required by this unit.

## Resume

Unit is implementation-complete at the marker SHA below. Browser milestone
gate (orchestrator-owned) remains open for the item.
