# L2-JOURNEY-CHECKPOINT-1 — UNIT cpschema2 (1 of 4) — report (RE-CUT 0201)

Run: cl-spec-composer brief 0201 (cpschema2 RE-CUT), lane 2. Worktree
`/home/brad/cl-wt/L2-JOURNEY-CHECKPOINT-1-cpschema2-lane2`, branch
`cl/lane2-journey-checkpoint1-cpschema2-0201`, base `82d51fba`.

## State found on arrival (measured, not assumed)

The brief's premise ("absence measured at base: no checkpoint schema, no
checkpointContract.ts") is true AT BASE `82d51fba`, but the branch already
carried this unit's completed work, committed by a prior 0201 run before it
lost its marker:

- `25d37c25` — the two schema declarations
- `29be43e5` — checkpointContract.ts + test (seam + drift tests)
- `1022b850` — prior report commit (this file, overwritten by this commit)

This run VERIFIED that work against the acceptance contract by actually
running every check (below). No product file was re-cut: the four owned files
satisfy the brief, and the tree is clean. All numbers below are from THIS
run, 2026-11-13 ~04:11 EST.

## What landed (the four owned files, all NEW at base)

- `schema/workflow/pending-intent-checkpoint.schema.yaml` (81 lines) — draft
  2020-12, `$id` on the human-task convention, `additionalProperties: false`
  at every object level EXCEPT `restoration_state` (deliberately open, stated
  in its description; unit 3 gives surfaces their own export). Required:
  identity/lineage (checkpoint_id, journey_ref, revision, thread_ref =
  ai-threads threadId), request_anchor {message_id, verbatim_text} both
  minLength 1 (immutable by contract, same shape as
  journey-document.schema.yaml:36 — anchor re-read verbatim this run),
  pending_intent {intent_id, intent_revision}, `unresolved_slots` (name +
  semantic_type; empty array allowed — an unset slot is DECLARED), origin
  {surface, route, active_tab, record_revisions[]}, restoration_state,
  optional parent_journey_ref, expected_return_type = the six
  journey-port.schema.yaml `$defs` names (the port vocabulary —
  journey-document's `permitted_result_types` is a free pattern string, so
  the closed vocabulary available to declare is the port one; a test pins the
  enum to the port schema), status enum EXACTLY
  [pending, resumable, resumed, cancelled, blocked], concurrency_version
  (integer, min 1), optional resume_receipt {receipt_id, resumed_at
  (date-time), resumed_by, outcome}.
- `schema/workflow/context-delta.schema.yaml` (51 lines) — closed; entry kind
  enum [unresolved-slot, proposed-addition]; canonical_value + semantic_type;
  source_records minItems 1 ({record_id, revision}); source_journey_ref,
  source_step_id; evidence (array of strings, may be empty);
  epistemic_status enum EXACTLY [observed, user-selected, inferred,
  proposed]; accepted_by {actor, at (date-time)}. Optional `request_revision`
  {changed_fields ⊆ [quantity, targets, purpose], reason} whose PRESENCE
  forbids silent injection — stated in its description; prose lives in
  `description:` keys only.
- `server/src/compiler/journey/checkpointContract.ts` (94 lines) — one Ajv
  (`ajv/dist/2020.js` + `ajv-formats` for the date-time format), both new
  schemas + journey-port added to the SAME Ajv BEFORE compile, schema dir
  resolved exactly like journeyDocumentLint.ts:65 (`new URL('.',
  import.meta.url)` + `'../../../../schema/workflow'`). Exports
  `validateCheckpoint(doc, opts?: { messageText?: string })`,
  `validateContextDelta(doc)`, `ContractDiagnostic {code, path, message}`
  with all seven required codes (anchor-missing, anchor-not-verbatim,
  status-invalid, slot-undetermined, delta-entry-incomplete,
  epistemic-status-invalid, source-records-empty). `anchor-not-verbatim`
  fires ONLY when messageText is SUPPLIED and differs (exactOptionalPropertyTypes
  is ON in server/tsconfig.json:13, re-measured this run; the option is
  absent, never forwarded as undefined). `slot-undetermined` checks
  semantic_type against the port schema's `$defs` read from disk — no baked
  vocabulary, no surface/route/thread ids in TS. Ajv `instancePath` maps
  VERBATIM into `path`; no hand-rolled shape checks duplicating the schema,
  no `as any` on parsed results (only the post-gate `doc as T` narrowing,
  same idiom as journeyDocumentLint.ts:99).
- `server/src/compiler/journey/checkpointContract.test.ts` (74 lines) —
  asserts CODES: valid minimal checkpoint accepted; empty verbatim_text ->
  anchor-missing; mismatched messageText -> anchor-not-verbatim (and absent
  opts is NOT a failure); status "parked" -> status-invalid; unknown
  property -> unknown-property with path "/"; delta entry missing
  epistemic_status -> delta-entry-incomplete; source_records [] ->
  source-records-empty; absent accepted_by -> delta-entry-incomplete;
  invented label "vibes" -> epistemic-status-invalid. Drift tests: schema
  status enum == CHECKPOINT_STATUSES, delta epistemic_status enum ==
  EPISTEMIC_STATUSES, expected_return_type enum == EXPECTED_RETURN_TYPES ==
  journey-port $defs (schema/TS enum drift fails here).

## Acceptance — ACTUAL output (this run, 2026-11-13 ~04:11 EST)

- `cd server && npx vitest run src/compiler/journey/checkpointContract.test.ts`
  -> Test Files 1 passed (1); Tests **7 passed (7)** (58ms tests, 1.93s).
- `cd server && npx vitest run src/compiler/journey/journeyDocumentLint.test.ts`
  -> Test Files 1 passed (1); Tests **5 passed (5)** (64ms) — baseline 5/5
  unchanged.
- `cd server && npx tsc --noEmit` -> exit **0**.
- Both YAMLs compile under Ajv 2020-12 strict:true (the contract module
  compiles them at load; every green test proves it); `additionalProperties:
  false` everywhere except restoration_state.
- Diffstat at base: `git diff --stat 82d51fba..HEAD -- <the four owned
  paths>` -> 4 files changed, **300 insertions(+)**, 0 deletions
  (81 + 51 + 94 + 74 = 300) — inside the <=300-line budget.
- `git status --porcelain` at exit: EMPTY (clean tree).

## Commits on this branch (beyond base 82d51fba)

- `25d37c25` — the two schema declarations
- `29be43e5` — checkpointContract.ts + test (seam + drift tests)
- `1022b850` — prior report commit
- `97172767`, `a35961e6`, `2310d339` — UNIT 2 (cpstore2, PendingIntentStore)
  work, another unit's authority; untouched by this run
- this paperwork commit — rewritten report with this run's actual output
  (replaces the stale numbers at 1022b850)

The marker sha is the commit containing THIS report:
`git rev-parse HEAD` at write time (paperwork commit; the unit's code lives
in 25d37c25 + 29be43e5).
