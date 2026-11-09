# GC-16 D16 — FAILED schema-doc fetch: architect RULING

DECISION REQUEST: `.hermes/plans/2026-10-30_lane1-gc16-d16-failed-fetch-shortSlug-decision-request.md`
RULING PATH (as requested): this file.
Architect: cl-architect profile. Ruled 2026-10-30 (EDT). Read-only inspection; repo untouched.

## VERDICT: **Option A — tri-state; on a FAILED schema-document fetch, REFUSE spine submits with a named message. No stamp guessing.**

The A+B hybrid and Option B are REJECTED. The rejection of B/hybrid is not
availability preference — it is a hard technical argument (see "Why not B"
below): B fixes only one of the two document-derived gates and silently
re-opens the other, and closing it properly would require exactly the kind
table the constraint space bars.

## Status at ruling time — the provisional is already on the branch

The branch moved while this ruling was pending. At work time the coder
applied the decision-request's provisional fallback (Option A) exactly as
mandated:

- `ab93d81a` — RED legs reproducing the review's PROBE3/PROBE3B payloads.
- `9bc37179` — GREEN, "Option A PROVISIONAL".
- HEAD is now `f3555f8b` (branch `cl/gc16-knowledge-door-l1t2100`; the
  packet's cited HEAD `82044fa4` is two commits back).

All line cites below are re-read by this architect at HEAD `f3555f8b`
(worktree `/mnt/vast/home/brad/git/wt/gc16-knowledge-door-lane1-l1t2100`).
This ruling RATIFIES the provisional Option A; it is not a divergent
post-hoc ruling, so per the decision-request's routing no corrective fix
request is owed for the shipped shape. Two bounded deltas are ruled (§
"Ratified surface" items 5–6); fold them into the run that closes D16
verification, not a new campaign.

## Grounding (every claim read first-hand)

The D16 defect at `82044fa4` (confirmed, matches the packet):
- `app/src/event-editor/create/RecordCreatePanel.tsx` (at `82044fa4`,
  cited per the packet): `.catch` did `setSchemaDoc(null);
  setSchemaDocFor(schemaId)` — failure == settled; `schemaDeclaresShortSlug`
  went false (`:308-310`); the D12 gate at `:456` passed; `:495-508`
  `delete payload.shortSlug` — a silent invalid POST, and an author-typed
  shortSlug stripped (review probe PROBE3B).
- `schema/studies/experiment.schema.yaml:8` `unevaluatedProperties: false`,
  `:12-17` `required: [kind, recordId, title, shortSlug, studyId]` — the
  server Ajv 422s the stripped payload.

The ratified state at `f3555f8b` (this architect's read, current lines):
- `RecordCreatePanel.tsx:303` — `const [schemaDocFailed, setSchemaDocFailed] = useState(false)`;
  reset at `:308`/`:314` (no-schemaId and re-fetch arms); set `true` in the
  fetch `.catch` at `:330` (`setSchemaDocFor(schemaId)` + `setSchemaDocFailed(true)`
  — failure now settles as FAILED, not as "not declared").
- `:489` — the D12 in-flight gate `if (schemaDocFor !== schemaId) { setError(
  'Loading the schema document ...'); return }` — UNCHANGED (D12 does not
  regress; the failed arm is checked only after the doc has settled).
- `:510-515` — `if (schemaDocFailed && isSpine) { setError(
  'The schema document for "<kind>" could not be loaded — the identity
  fields cannot be decided (shortSlug is schema-required for spine records
  and is decided from the document; the client will not guess it). Retry,
  or try again later.'); return }` — the refusal branch, sited BEFORE the
  shortSlug stamp/delete decision.
- `:563` stamp arm (`payload.shortSlug = slugify(payload.title, 30)` only
  when `schemaDeclaresShortSlug`), `:566` `delete payload.shortSlug` only in
  the else arm — after the refusal gate, `delete` can only act on a RESOLVED
  document that declares no shortSlug (the knowledge triplet) or on a
  knowledge kind whose fetch FAILED (D9 "server speaks", see item 6).
- `isSpine` (`:195`, the pre-existing
  `nodeType === 'study' || 'experiment' || 'run'` union test) is the only
  classifier the refusal uses. `SPINE_SCHEMA_IDS` (`:112`) remains consulted
  at exactly one production site (`:259`, the registry-failure $id fallback,
  D5) — the D16 fix adds NO new use of it and NO new kind table.
- Tests: `app/src/event-editor/create/RecordCreatePanel.gc16-widget-commit.test.tsx`
  — `schemaDocFail` mock arm at `:161`/`:198-201` (getSchema rejects),
  describe block `GC-16 FIX RUN 4 D16` at `:669` with two legs (zero-creates
  + named refusal matching `/schema document (could not be loaded|unavailable)/i`
  and `/identity fields/i`; author-typed value survives the refusal, no
  discard of edits). The `gc16.test.tsx` mock has no `schemaDocFail` arm at
  all (`grep schemaDocFail RecordCreatePanel.gc16.test.tsx` → no matches),
  so every non-spine leg there runs on RESOLVED docs.

## Why not B (stamp) or the A+B hybrid — the decisive argument

The schema document drives TWO client gates, not one:
1. `schemaDeclaresShortSlug` (`:343-345`), and
2. `schemaRequiresTitle` (`:346`) feeding the "Title is required" client gate.

On a failed fetch BOTH go false. Option B (and the hybrid) patches only gate
1 — "stamp shortSlug for SPINE_SCHEMA_IDS kinds on failed". It leaves gate 2
open. `experiment.schema.yaml:12-17` and `study.schema.yaml:12-16` REQUIRE
`title`; a B-stamped submit with an empty title sails past the client with no
title gate and 422s at the server exactly like the original D16 defect —
the defect class (silent invalid POST from document-guessing) merely moves
fields. To close gate 2 under B you must guess "title required" per spine
kind — and `run.schema.yaml:12-15` requires `[kind, recordId, status]` but
NOT title, while study/experiment DO — so the guess needs a
run-vs-study/experiment table. That is a NEW kind table beyond
`SPINE_SCHEMA_IDS`, barred by the standing R1 ruling and by this packet's own
constraint space. Option A blocks uniformly on the one existing boolean
(`isSpine`) and guesses nothing.

Secondary grounds:
- The D12 remedy verbatim is "do not treat 'unknown' as 'not declared' for
  kinds whose identity fields are client-minted". B is the symmetric guess —
  treating 'unknown' as 'declared' — and the in-code principle at
  `:41-43`/`:61-73` (Ajv is the single validation authority; the client
  decides identity ONLY from the served document) is the panel's thesis.
  B reintroduces document-free client policy on the failure arm.
- The D5 precedent does NOT carry to D16: `SPINE_SCHEMA_IDS` on registry
  failure resolves the schema `$id` — a CONSTANT the data itself fixes, no
  inference. Stamping shortSlug on doc failure DERIVES requiredness the
  client never read. Different epistemic status; the "already chose this
  shape once" argument fails on that difference.
- A's cost (spine create blocked while the schemas endpoint is down) is
  bounded and honest: the endpoint is local; the refusal is loud, named, and
  matches the panel's existing refusal idiom (`:604-616`
  registry-unavailable refusal replaces the form body, `role="alert"`), so it
  is not the "dead form" the spec bans — dead forms are SILENT ones.
- Hybrid's notice adds nothing A lacks: A's refusal IS the visible notice;
  the hybrid's stamp re-imports B's title-gate hole for an availability gain
  on an endpoint that is local.

## Ratified implementation surface (what the coder must have / add)

Already in place at `f3555f8b` and hereby RATIFIED (verify, do not rework):

1. State shape: two settled-state signals, exactly as shipped —
   `schemaDocFor: string | null` (which schemaId settled) +
   `schemaDocFailed: boolean` (settled AS failed, reset on
   schemaId change / no-schemaId, set only in the fetch `.catch`).
   Do not collapse into one tri-state enum if it regresses the D12 arm;
   the two-flag form is acceptable because both flip in the same `.catch`
   arm and the gates read `schemaDocFor` first, `schemaDocFailed` second.
2. Gate order in `handleSubmit` (must stay exactly this order):
   a. title gate only when `schemaRequiresTitle` (D9, `:471-474`);
   b. `!schemaId` named refusal;
   c. D12 in-flight refusal `schemaDocFor !== schemaId` (`:489-493`) —
      UNCHANGED message;
   d. FAILED refusal `schemaDocFailed && isSpine` (`:510-515`) — refuse,
      zero creates, error via the panel's existing `role="alert"` error
      div (`:657`), author edits untouched;
   e. only THEN the stamp/delete arm (`:560-567`).
3. Refusal text (ratified, pin-compatible):
   `The schema document for "<kind>" could not be loaded — the identity
   fields cannot be decided (shortSlug is schema-required for spine records
   and is decided from the document; the client will not guess it). Retry,
   or try again later.`
   Retry affordance is re-select/reload (the fetch effect re-runs on
   schemaId change; the submit click itself only re-issues the same honest
   refusal — acceptable, no auto-refetch demanded).

Deltas ruled NOW (small; fold into the D16 closing run, RED-first):

4. WORDING (honesty, no behavior change): the parenthetical
   "shortSlug is schema-required for spine records" overclaims for `run` —
   `schema/studies/run.schema.yaml:12-15` requires `[kind, recordId,
   status]` (shortSlug is DECLARED at `:31` but not required). Refuse run
   anyway (document-decided either way; isSpine uniformity, no new table),
   but re-word the parenthetical to
   "(spine identity fields such as shortSlug are decided from the document;
   the client will not guess them)". MUST keep matching the pinned regexes
   `/schema document (could not be loaded|unavailable)/i` and
   `/identity fields/i` (`gc16-widget-commit.test.tsx` D16 legs).
5. TEST GAP — knowledge-on-failed is unpinned: every `schemaDocFail` leg is
   spine-only; no leg renders a KNOWLEDGE kind with `schemaDocFail: true`.
   Add RED-first: `schemaDocFail: true` + `nodeType="assertion"` +
   authored id/scope through the real inputs → submit must PROCEED (one
   createCall), must show NO "could not be loaded" refusal, and the payload
   must carry NO shortSlug (the `delete` arm at `:566` is the correct
   D9/`unevaluatedProperties:false` outcome; server's required-check is the
   visible authority via `describeApiError`, `:581`). This pins the half of
   the ruling the constraint space demands: knowledge payloads stay clean
   even on failure, and the refusal is SPINE-ONLY, not a global door-shut.
6. Ruling cite: replace the "PROVISIONAL / ruling file ABSENT" wording in
   the component header comment (`:60-74`), the `:495-509` block comment,
   and the D16 test header (`gc16-widget-commit.test.tsx:646-668`) with a
   cite to THIS ruling file (Option A is now ruled, not provisional).
   Comments only.

## Constraint-space compliance (checked, not asserted)

- No new kind tables: the refusal keys on the pre-existing `isSpine`
  union test; `SPINE_SCHEMA_IDS` gains no new production use site (single
  use `:259`, unchanged). B would have required a title-required-by-kind
  table — one reason it is barred.
- Knowledge payloads stay clean: on failed fetch a knowledge submit either
  carries no shortSlug (delete arm) or is authored against the server's
  visible verdict; delta 5 pins it. `unevaluatedProperties:false` respected.
- D12 no-regression: gate `:489` byte-identical to the accepted fix-3 arm;
  the in-flight D12 leg (`gc16-widget-commit.test.tsx:597`) is untouched by
  the D16 commits (`git log --oneline -- ...widget-commit.test.tsx`: only
  the two fix-4 commits appended legs).
- Silent-invalid-POST defect class: closed on BOTH document-derived gates —
  A blocks the whole submit on failure, which is precisely why patching one
  gate (B/hybrid) was rejected.

## For the orchestrator

Route: ratification + deltas 4–6 as the D16 leg of the current fix run (no
new campaign, no corrective rework of the shipped Option A shape).
Verification for the cycle report: the two existing D16 legs GREEN, the new
knowledge-on-failed leg GREEN (RED-first), D12 in-flight leg still GREEN,
and the three gc16 suites' baselines (D5/D9/D10/D11/D13) unchanged.

ARCHITECT D16 RULING WRITTEN
