# MINT-IDEM-1 — POST /vocab/mint becomes truly idempotent by label (SPEC)

STATUS: CANONICAL — composed by cl-spec-composer (l2t2315), orchestrator-reviewed and
promoted 2026-10-17T23:59 EDT. OQ rulings in the ORCHESTRATOR ADJUDICATION block below.

Composer: cl-spec-composer, lane 2. Draft date 2026-10-17. Tip verified first-hand:
`cl/integration-2` @ 81bef33e (contains 81bef33e >= required 81bef33e; all git via
`git -c core.fileMode=false`). All file:line citations below re-read first-hand at this
tip, not copied from the decision blind.

## GOAL

Make `POST /vocab/mint` return the existing record (HTTP 200, same success shape) when a
repeat mint names a label whose record already exists, instead of hard-422ing
`Record already exists` — i.e. make the endpoint actually do what its own comment at
VocabHandlers.ts:97-100 promises.

## WHY (brief — mechanics live in the decision, not re-derived here)

Binding mechanics are in
`/mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/decisions/W28-A5d-reshoot-mint-idempotency-decision.md`
(V1 deterministic id, V2 the 422 is a record-id existence check, V4 the endpoint was
never idempotent, Q3 ruling (b) mint reuse-by-lookup, TASK MINT-IDEM-1). The scientist's
repeat mint click must not error in the product; this unblocks the A5d r2 repeat-mint
leg. No browser gate — this is a server-only task. The A5d re-shoot's in-browser leg
exercises it later; that is NOT this task's gate.

## SCOPE (exact paths)

In scope (the ONLY files the worker may touch):
- `server/src/api/handlers/VocabHandlers.ts` — the mint handler's create path + its
  aspirational comment at :97-100 (may be tightened to match the new reality; comment
  text only, no behavior attached to it).
- `server/src/api/handlers/VocabHandlers.mint.test.ts` — NEW test file (none exists at
  tip; see BASELINE MEASUREMENTS). Name is a suggestion; the orchestrator's naming wins.

Out of scope explicitly (touching any of these = reject):
- `server/src/store/RecordStoreImpl.ts` (the create-collision guard at :553-562 stays
  exactly as-is — it is correct for `create`; the fix is upstream of it).
- `server/src/materials/termId.ts` (do NOT "fix" its comment or the hash; V1 confirmed
  the id algorithm is correct and byte-reproducible).
- `server/src/materials/MaterialGrounding.ts` (the precedent is to MIRROR, not to
  refactor or import-refactor; its `payloadName`/`asPayload` helpers are module-private
  — leave them private).
- `server/src/api/routes.ts`, `server/src/server.ts` (wiring unchanged).
- Anything under `app/` (picker UI, /m floor, MINT-FLOOR-UI-1's turf).

## NON-GOALS

- NO response-shape change: `MintTermResponse` (`{ success: true, recordId, label, iri }`)
  stays exactly as declared at VocabHandlers.ts:35-41. No `reused`/`created`/`existed`
  field, no status-code vocabulary beyond the existing 200/400/422/500.
  (Header comment :5-6 lists a `mention` field the interface never had — leave that
  comment lie alone; fixing it is not this task.)
- NO refKind change: `MINTABLE` (:44-68) untouched; material remains the only mintable
  kind; the created payload builder `build()` (:53-66) untouched — the record a MISS
  creates must stay byte-identical (no `lifecycleId`, no `provenance` block added to
  match MaterialGrounding's richer payload; that would break first-mint byte-identity).
- NO picker/UI change; MINT-FLOOR-UI-1 (picker mint-row de-dup, browser-gated) and
  WIRE-TEMP-1 (temperature forwarding) stay fully independent — zero file overlap.
- NO new policy values, no config, no YAML.
- First-mint behavior byte-identical: a label with no existing record takes EXACTLY the
  same path (envelope build → store.create → 200 with `iri = baseUri + recordId`) as at
  81bef33e, plus two read-only lookups before create.

## ROOT CAUSE (verified file:line at 81bef33e, first-hand)

- `server/src/api/handlers/VocabHandlers.ts:100` — `recordId =
  localMaterialIdForLabel(label)` (deterministic).
- `server/src/materials/termId.ts:21-26` (`labelHash`, stable case-insensitive djb2) and
  `:41-43` (`localMaterialIdForLabel` → `MAT-<slug>-<hash>`). Same label → same recordId,
  always. The id is NOT random-suffixed (decision V1).
- `server/src/api/handlers/VocabHandlers.ts:112-126` — `store.create`; on
  `!result.success` → 422 `Minting "<label>" failed: <error>`.
- `server/src/store/RecordStoreImpl.ts:553-562` (`createUnlocked`) —
  `findRecordPath(envelope.recordId)` hit → `{ success: false, error:
  "Record already exists: <recordId>" }` (:561). So the second mint of any label
  recomputes the same recordId and hard-422s. Nothing catches the collision into a
  success (decision V2/V4 — verified no harness-side catch in the current re-shoot
  driver either).
- The repo ALREADY contains the correct shape:
  `server/src/materials/MaterialGrounding.ts` `ensureLocalMaterialForDraft` — verified at
  tip: `:211` `store.list({ schemaId: MATERIAL_SCHEMA_ID, limit: 10000 })`; `:213-214`
  `needle = label.toLowerCase()` matched against
  `payloadName(asPayload(env)).toLowerCase() === needle` (payloadName =
  `typeof payload?.name === 'string' ? payload.name.trim() : ''`, :56-58); `:219-223`
  `store.get(localMaterialIdForLabel(label))` → on hit return the EXISTING record's
  `recordId` and `payloadName(...) || label`. /vocab/mint simply never reuses this path.

## EXACT EDITS

In `createVocabHandlers.mintTerm` (VocabHandlers.ts), AFTER label/refKind validation
(:84-95) and AFTER `recordId`/payload/envelope building — i.e. lookup-first, immediately
BEFORE the `store.create` call at :112 — insert:

1. Name-match arm (mirror MaterialGrounding :211-214 EXACTLY — same normalization, no
   looser, no tighter):
   - `const materials = await store.list({ schemaId: mintable.schemaId, limit: 10000 })`
     (use the `mintable.schemaId` already in `MINTABLE` :49 — do not add a refKind `if`
     branch and do not re-import MATERIAL_SCHEMA_ID; one mintable kind today, zero new
     policy).
   - `const needle = label.toLowerCase();`
   - `const nameMatch = materials.find((env) => <name(env)>.toLowerCase() === needle);`
     where `<name(env)>` is a LOCAL payload-name helper identical to
     MaterialGrounding's `payloadName ∘ asPayload` (name is `payload.name` trimmed, else
     `''`). Duplicate the ~6-line helper locally rather than exporting/refactoring
     MaterialGrounding (mirroring the precedent is a convention, not an import
     requirement; keeping the diff to one file is the reviewer's friend).
   - On hit: `reply` status stays 200 (set NOTHING — the success path never calls
     `reply.status`) and `return { success: true, recordId: nameMatch.recordId, label:
     <name(nameMatch)> || label, iri: `${baseUri}${nameMatch.recordId}` }` — the
     EXISTING record's id/name, mirroring `payloadName(...) || label` at
     MaterialGrounding :216.
2. Id arm (mirror MaterialGrounding :219-223): `const existing = await
   store.get(recordId);` — on non-null return `{ success: true, recordId:
   existing.recordId, label: <name(existing)> || label, iri:
   `${baseUri}${existing.recordId}` }`.
3. MISS: fall through to the existing `store.create` block (:112-126) and the existing
   success return (:128-134) UNCHANGED — 422 still fires for real validation/lint
   failures (only the already-exists case becomes unreachable-by-design, the 422 arm
   itself stays as the generic create-failure path).
4. Hoist `const baseUri = namespace?.baseUri ?? 'http://localhost:3001/records/'` above
   the two hit arms (it is currently at :128; the hit arms need it). Its value/default
   must not change.
5. Optional (allowed): update the :97-99 comment to state the endpoint is now idempotent
   (200 with the existing record on repeat), since after this change the promise is
   true. Do not touch termId.ts's comment.

`exactOptionalPropertyTypes` requirements (server/tsconfig.json:13, ON):
- Do not build the response as `{ label: maybeUndefined }`. `MintTermResponse.label` is
  required `string`; use `payloadNameOrEmpty(env) || label` (never `?? name`, name can be
  `''`). `sourceQuery` stays conditionally spread inside `build()` (:61-65) — do not
  pass `undefined` into it.
- `store.get` returns `RecordEnvelope | null` (store/types.ts:149) — check truthiness,
  never assign `null` into a response field.
- No `reply.status(200)` call is needed or wanted; do not add optional fields to the
  response object with `: undefined`.

## ACCEPTANCE CRITERIA (RED-first — write these tests FIRST, watch them fail on the
current tip, then fix; task-list `verified by` verbatim: "Server tests: mint(label) x2 ->
both 200 same recordId, exactly one record; mint of a label equal to an existing
material NAME -> 200 pointing at it, no duplicate; VocabHandlers mint suite green;
typecheck 0 new. NO browser gate (server-only).")

New file (suggested `server/src/api/handlers/VocabHandlers.mint.test.ts`), harness style
= direct-handler + in-memory envelope store, mirroring
`RecordHandlers.writeGates.test.ts` (Map-backed `get`/`list`/`create`, `create` returning
`{ success: false, error: "Record already exists: " + id }` on duplicate — the fake MUST
honor the real guard for the RED test to be honest):
1. mint("idem probe label") x2 → both results are the success shape, SAME `recordId`,
   `reply` status never set above 200, and the store map holds EXACTLY ONE record
   (size-1 read-back, plus `store.list` length 1).
2. Store pre-seeded with a material whose `name` is "Foo Reagent" but whose recordId is
   arbitrary (e.g. an ontology-path `MAT-FOO-REAGENT` id, i.e. id ≠
   localMaterialIdForLabel(label)) → mint(refKind material, label "foo reagent") returns
   200 pointing at the SEEDED recordId (proves the name-match arm), no duplicate created.
3. Store pre-seeded with a record AT `localMaterialIdForLabel(label)` but a different
   name (proves the store.get arm independently of name-match) → 200 pointing at it.
4. First-mint regression pins: fresh store, mint once → 200, recordId ===
   `localMaterialIdForLabel(label)`, payload in store has exactly `kind/id/name/domain/
   status` (plus `definition` iff `sourceQuery` given) — i.e. first-mint byte-identity
   against `MINTABLE.material.build`.
5. Still-400/422 pins: empty label → 400; unmintable refKind → 400; a create that fails
   for a NON-collision reason (fake store returning `success:false, error:'Validation
   failed'`) still 422s with the existing message shape.
6. Case-insensitivity pin: mint "DMSO" then mint "dmso" → both 200, one record
   (labelHash is case-insensitive, termId.ts:20-26 — the two labels share the id).

RED-first evidence in the worker report: paste the failing run of tests 1-3 against the
unmodified handler (expected: test 1 fails with the 422 `Record already exists` message)
BEFORE the fix commit lands.

## FIRST TARGETED CHECK

```
cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run src/api/handlers/VocabHandlers.mint.test.ts
```
Before the fix: the repeat-mint test fails (422 VALIDATION_FAILED `Minting "<label>"
failed: Record already exists: MAT-...`). After: green. This single command proves the
approach early (lookup-first kills the collision instead of catching its error string).

## BASELINE MEASUREMENTS (taken first-hand by the composer at tip 81bef33e)

- **There is NO existing VocabHandlers test file**: `grep -rl "createVocabHandlers"
  server/src --include='*.test.ts'` → empty (also `mintTerm`, `vocab/mint` in any
  `*.test.ts` → empty). The "VocabHandlers mint suite" in the acceptance criteria is the
  NEW file this task writes RED-first. Baseline pass count: 0 files / 0 tests.
- Adjacent suites at tip (the set this task must not break):
  `npx vitest run src/materials` → 6 files, 41/41 passed (incl. termId.test.ts 6/6).
  `npx vitest run src/api/handlers/RecordHandlers.writeGates.test.ts` → 12/12 passed
  (the harness pattern to copy).
- `cd server && npx tsc --noEmit` → **0 errors, exit 0** at tip. "typecheck 0 new"
  therefore means: MUST stay 0.

## VERIFICATION COMMANDS (worker runs all, report pastes all outputs)

```
cd /mnt/vast/home/brad/git/cl-integration-2/server
npx vitest run src/api/handlers/VocabHandlers.mint.test.ts        # expected: all pass
npx vitest run src/materials                                       # expected: 6 files 41/41 pass
npx vitest run src/api/handlers/RecordHandlers.writeGates.test.ts  # expected: 12/12 pass
npx vitest run $(grep -rl "ensureLocalMaterialForDraft\|MaterialGrounding\|localMaterialIdForLabel" src --include='*.test.ts' | tr '\n' ' ') 2>/dev/null || true  # targeted-adjacent; expected 0 failures
npx tsc --noEmit                                                   # expected: 0 errors (baseline 0)
```
(If the orchestrator's dispatch adds a full-suite run, `npm run test:run` inside
server/, the bar is: no new failures vs the tip baseline.)
NO BROWSER GATE. No :5193 / playwright / picker leg for this task — say so in the report;
a reviewer who asks for browser evidence is out of scope.

## WORKER CONTRACT

- Worktree/branch/report-path NAMING IS OWNED BY THE ORCHESTRATOR (precedent shape:
  worktree `/mnt/vast/home/brad/git/wt/MINT-IDEM-1-lane2-l2tNNNN`, branch
  `MINT-IDEM-1-lane2-l2tNNNN` off the lane trunk tip, dispatched with the promoted spec
  path). The worker uses what the orchestrator hands it; nothing here pre-empts it.
- Report: the orchestrator-assigned `.hermes/plans/MINT-IDEM-1-report.wip-l2tNNNN.md`
  INSIDE the worker worktree (unique wip path pattern `MINT-IDEM-1-report.wip-<ticket>.md`
  — never a shared name). Must contain: RED run output (pre-fix failure of tests 1-3),
  post-fix GREEN run of the VERIFICATION COMMANDS block, the diff (expected: one product
  file + one new test file), and a line "no browser gate — server-only task".
- All git via `git -c core.fileMode=false`. Do not touch the trunk working tree, do not
  restart stacks, do not merge.

## REVIEWER BAIT (likely edge errors for this item — the coder pre-empts them)

1. **Catching the collision instead of avoiding it**: wrapping `store.create` and
   string-matching `result.error.includes('Record already exists')` (or regex on it) to
   then `store.get`. REJECT — decision V2/Q3 chose lookup-first mirroring
   MaterialGrounding; string-matching a store error message couples the handler to the
   store's error wording and is not the precedent.
2. **Changing the response shape**: adding `reused: true`, `created: false`, a different
   status (201/208), or a `mention` field. REJECT — `MintTermResponse` frozen; the picker
   and any replay legs consume today's exact 200 shape.
3. **Dedupe normalization drift**: case-INSENSITIVE *substring* matching, slugified or
   fuzzy name comparison, trimming/normalizing beyond `trim()+toLowerCase()`, or scanning
   ALL records instead of `store.list({ schemaId: <material schema>, limit: 10000 })`.
   The precedent (MaterialGrounding :211-214) is EXACT normalized-name equality over
   MATERIALS only — mirror it exactly, narrower or broader is a defect (this is the same
   seam that makes decision V6's spaced-vs-hyphenated variants miss on purpose).
4. **Absorbing MINT-FLOOR-UI-1** (picker mint-row de-dup, app/ surface, browser-gated) or
   sneaking a WIRE-TEMP-1 edit because "it's the same incident". REJECT — file overlap
   with either = reject.
5. **"Fixing" termId.ts's comment** (its idempotency prose is TRUE — it speaks of the ID)
   instead of fixing the endpoint. The endpoint comment at VocabHandlers.ts:97-100 may be
   updated post-fix; termId.ts is untouched.
6. **First-mint drift**: adding `lifecycleId`/`provenance` to the minted payload to
   "match" MaterialGrounding's create payload, reordering the envelope `createdAt`, or
   otherwise making the MISS path non-byte-identical. Test 4 above pins it.
7. **exactOptionalPropertyTypes slop**: `label: env.payload.name ?? label` with
   untyped payloads (could widen to `string | undefined`), or setting optional response
   fields to `undefined`. Helper must return `''`-or-string and the code uses `||`.
8. **Touching RecordStoreImpl.ts** to make `create` itself idempotent/return-existing.
   REJECT — `create`'s collision guard is correct store semantics; many callers depend on
   create-means-new.

## OUT-OF-SCOPE MAP

- `app/**` — everything user-visible, incl. the /m picker and mint floor →
  MINT-FLOOR-UI-1 (independent, browser-gated).
- `server/src/ai/InferenceClient.ts`, `intentCompile.ts`, temperature/sampling →
  WIRE-TEMP-1 (independent).
- Spine-side declared-role consultation (decision Q3 (iii)) — NOT pre-authorized; needs
  its own architect decision; do not open `resolveNounsPass.ts`/`adapters.ts`.
- Store-layer semantics (`RecordStoreImpl.createUnlocked` guard), seed promotion,
  lifecycle/lint behavior → untouched.
- Labware-role category error (decision V9): a labware noun is never minted as MAT-;
  this task changes no category logic.
- Harness-side mint-replay tolerance (decision Q4) — a bridge in the re-shoot prompt,
  owned by the orchestrator/harness, to be deleted once this lands; not in product code.
- Knowledge-layer record types — untouched; canonical example doc not implicated
  (material mint floor unchanged in meaning).

## OPEN QUESTIONS (max 3)

1. Label-on-hit semantics: for a name-match/lookup hit the decision says return "the
   existing recordId/label/iri" — I read `label` as the EXISTING record's name (mirrors
   MaterialGrounding :216/:222 `payloadName(...) || label`), which for a case-variant
   second mint returns the FIRST mint's casing, not the request's. Checked: decision
   TASK block, MaterialGrounding precedent, MintTermResponse. If the orchestrator wants
   echo-request-label instead, say so — it changes acceptance test 2's expectation only.
2. No VocabHandlers test file exists at tip (verified, see baselines), so "VocabHandlers
   mint suite green" is necessarily a NEW suite this task authors. If the orchestrator
   meant an existing suite I could not find, it is not in `server/` (searched
   `createVocabHandlers|mintTerm|vocab/mint` across all `*.test.ts`).
3. Whether to reuse `mintable.schemaId` (my edit plan) vs importing `MATERIAL_SCHEMA_ID`
   from MaterialGrounding.ts for the `store.list` filter — functionally identical today
   (MINTABLE has exactly one entry with the identical URI string). Checked both files;
   no repo rule forces either; flagged so review doesn't treat the choice as a defect.

COMPOSER DONE


## ORCHESTRATOR ADJUDICATION (l2t2315) — rulings on the 3 open questions
OQ1 — APPROVED as drafted: on a reuse-hit the response `label` is the EXISTING record's
  name (`payloadName(env) || label`, mirroring MaterialGrounding :216). Echoing the request
  label would make two 200s for the same record disagree — the record's name is the truth.
OQ2 — ACCEPTED: `rg createVocabHandlers|vocab/mint|mintTerm server/src --include=*.test.ts`
  re-run first-hand by the orchestrator = EMPTY; the "VocabHandlers mint suite green" gate
  IS the new RED-first suite this task authors. No pre-existing suite expected at promotion.
OQ3 — APPROVED: use `mintable.schemaId` (already in scope at :49; createEnvelope at :105
  already consumes it). Functionally identical today; no new import, no refKind branch.
Also binding at promotion: worker contract mechanics superseded by orchestrator dispatch
(worktree /mnt/vast/home/brad/git/wt/MINT-IDEM-1-lane2-<token> off trunk tip at dispatch;
report at the UNIQUE wip path in the dispatch prompt). Fleet single-coder: this item and
MINT-FLOOR-UI-1 queue behind each other — orchestrator dispatches MINT-FLOOR-UI-1 first
(browser-gated, longer path), MINT-IDEM-1 next.
