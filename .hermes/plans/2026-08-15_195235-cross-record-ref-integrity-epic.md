# P2 Epic — Cross-Record Referential Integrity (`refExists`) + Relationship Create Path

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. This is the strategy-level document; the phase cards (Phase 1 → Phase N) are the durable kanban breakdown.

**Goal:** Close the last remaining enforcement gap so the declarative layer verifies *referential* integrity, not just structure: a `refExists` lint op proves a link points at a real, kind-correct record, and the typed-relationship create path (the mechanism the schemas already point to) is actually buildable and enforced.

**Architecture:** computable-lab's contract is "every rule that can be data must be data." Structure is enforced by Ajv (`*.schema.yaml`), business rules by the LintEngine predicate DSL (`*.lint.yaml`). P0 reports that structure + in-record business rules are now enforced; what P0 could NOT do was verify that a referenced `recordId` actually exists with the right `kind` — `evaluatePredicate()` is a pure function with no store access, and there is no `POST /relationships`. This epic threads a record-lookup resolver into the predicate evaluator (so `refExists` can query the store) and builds the relationship-record create path (so typed edges can be created and their source/target validated for existence).

**Tech Stack:** TypeScript, JSON Schema 2020-12 + AjvValidator, LintEngine (predicate DSL), `PredicateEvaluator.ts` (pure dispatch), `LintContext` (already reserves `repo?: unknown`, currently unused), `RecordStoreImpl.exists()`, IndexManager, Fastify, schema/registry/predicates.registry.yaml.

---

## AUDIT FACTS (verified 2026-08-15 by architect against the live repo)

### F0 — Predicate evaluation is pure; there is no cross-record op today
- `server/src/lint/PredicateEvaluator.ts:565` — `evaluatePredicate(predicate, data): PredicateResult` takes **only** the predicate and the single record's data. No store, no index, no lookup.
- The dispatch chain (lines 569-623) handles: exists, nonEmpty, regex, equals, in, all, any, not, has_material_class, state_is, context_contains, lineage_includes, time_within, mention_kind_matches. **There is no `refExists` / `refKind` / `refExistsAny`.**
- `server/src/lint/types.ts:286-287` — `LintContext` already declares `repo?: unknown` ("Repository context for repo-scope rules") **but nothing ever populates it**, and `evaluatePredicate` ignores `ctx` entirely (it only receives `data`).
- `server/src/lint/LintEngine.ts:151` — the engine calls `evaluatePredicate(rule.assert, ctx.data)`; only `.data` is forwarded. The reserved `ctx.repo` is dead.
- This is the structural reason P0 could not enforce target-existence: the machinery to reach a store from a predicate simply isn't wired.

### F1 — The only way to know a record exists today is code, per call site
- `server/src/store/RecordStoreImpl.ts:788-791` — `exists(recordId)` already exists and works.
- But nothing threads it into lint. So "does `experimentId` point to a real experiment?" is answered nowhere — it is silently unverified (the exact hole P0 documented: 42 records referenced a missing STU-scratch and nothing complained until we hand-checked).

### F2 — Relationship records are read-only-dead
- `schema/knowledge/relationship.schema.yaml` exists (typed directed edge: `sourceType/sourceId/targetType/targetId/verb`; `verb` enum; `provenance` enum). Tested via the P0 methodology — schema loads and validates a well-formed payload.
- `server/src/api/routes.ts:356` — only `GET /relationships` is registered.
- `server/src/api/handlers/TreeHandlers.ts:1640-1661` — `listRelationships` already queries `kind:'relationship'` through the index and filters on sourceId/sourceType/targetId/targetType/verb. **The read path is proven to work.**
- There is **no `POST /relationships`** and **zero `kind: relationship` records** in the live tree. The write path + data are the missing pieces.

### F3 — `study.schema.yaml` already points at relationship records as the authoritative mechanism
- `schema/studies/study.schema.yaml:82-87` — `claimRelationships` (inline convenience) is documented as non-authoritative: "Authoritative relationships live as relationship records (kind: relationship) which carry provenance and are queryable."
- `schema/studies/study.schema.yaml:72-77` — the older `primaryClaims` field is marked **DEPRECATED: Use claimRelationships or relationship records**. So the direction of travel is already decided.

### F4 — A resolver interface is all that blocks `refExists`
- `RecordStoreImpl.exists(recordId)` is synchronous-ish async and correct. A thin adapter `(recordId) => Promise<boolean>` and (for kind checks) `(recordId) => Promise<string | undefined>` (recordId → kind) is all the evaluator needs.
- The LintContext already has a `repo` slot; we populate it and forward it. The DSL polynomial is small.

### F5 — Predicate registry is the allow-list source of truth
- `schema/registry/predicates.registry.yaml` — curated allow-list of ~28 relationship predicates (families: Causality & Regulation, Mereology & Location, Lineage & Taxonomy, Functional & Molecular, Measurement & Assay, Association). Consumed by PredicateRegistry, LintEngine, and the AI extraction prompt. Anything that validates "the target is the right kind of thing" should reuse or extend this registry rather than hardcode.

### F6 — No test currently covers a cross-record ref check
- `server/src/lint/LintEngine.test.ts`, `studyRunRules.test.ts`, `IdShape.test.ts` all test in-record predicates. No test exercises a resolver-backed op.

---

## SCOPE & DECISIONS

**In scope (this epic):**
1. `refExists` (+ optional `refKind`) predicate: evaluates `does <recordId at path> exist` and optionally `is it of kind X`, using a resolver threaded through `LintContext.repo`.
2. Thread the resolver: `RecordStoreImpl.lint()` supplies `repo` built from its own `exists()` + a kind lookup; `LintEngine.evaluateRule` forwards `ctx` (not just `ctx.data`) to `evaluatePredicate`.
3. `POST /relationships`: create a `kind: relationship` record; validate schema; run `refExists`-style existence+kind checks on source and target; best-effort error shape consistent with the records API.
4. Apply `refExists` rules to existing schemas as **warning** (not error — see Risks): e.g. `run.lint.yaml` gains `run-experiment-ref-exists`, `run-study-ref-exists`; `experiment.lint.yaml` gains `experiment-study-ref-exists`. This is the "the relationships are now schema/lint-enforced" payoff.
5. Tests at every layer.

**Explicitly OUT of scope (deliberate, prevent bloat):**
- CLI/AI to *author* relationships hands-free (user stays in the loop; AI suggests, never commits — per project AI-acceptance rule).
- Relationship traversal/visualization in the UI (separate concern).
- Back-migration of the 42 STU-scratch links into relationship records (leave the ref-style links in place; both models coexist; the tree now honors both).
- Auto-population of `studyId` from `projectIds[0]` (still unimplemented; separate work).

**Decision: severity = warning for the applied rules.** A hard error on ref-exists would brick the existing live corpus (many records link to records that may not all exist post-cleanup). Warnings surface violations without blocking writes; the acceptance criteria explicitly assert warnings, and a follow-on can flip selected rules to error once the corpus is clean.

---

## PHASES (each independently testable; sequence is mandatory)

### Phase 1 — Verify foundation (no code yet)

**Objective:** Lock down the current behavior so the build-out has a regression baseline.

**Files:**
- Inspect only: `server/src/lint/PredicateEvaluator.ts`, `server/src/lint/LintEngine.ts`, `server/src/lint/types.ts`, `server/src/store/RecordStoreImpl.ts`, `server/src/api/handlers/TreeHandlers.ts` (listRelationships), `schema/knowledge/relationship.schema.yaml`, `schema/registry/predicates.registry.yaml`.

**Step 1: Confirm the baseline & record it**

```bash
cd /home/brad/git/computable-lab/server && npx vitest run 2>&1 | grep -E "Test Files|Tests "
```
Record the failing-test set exactly (the ENOENT/PDF-fixture failures are pre-existing; verify they're unchanged).

**Step 2: Probe the pure-function boundary (proves the gap)**

Add a throwaway spec asserting `evaluatePredicate` cannot reach a store — confirm the LintContext.repo slot is ignored today:
```bash
cd /home/brad/git/computable-lab/server && cat > /tmp/ref_probe.ts <<'EOF'
import { evaluatePredicate } from '../src/lint/PredicateEvaluator.ts';
EOF
```
No code ships in this phase; the deliverable is the recorded baseline + a one-line note that `repo` is currently un-threaded.

**Step 3: Verify relationship schema loads**

```bash
cd /home/brad/git/computable-lab/server && node -e "
import Ajv2020 from 'ajv/dist/2020.js'; import addFormats from 'ajv-formats'; import { parse } from 'yaml';
import { readFile } from 'fs/promises';
const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true }); addFormats(ajv);
const rel = parse(await readFile('../schema/knowledge/relationship.schema.yaml','utf8'));
// load FAIRCommon + datatypes refs chain first via the real loader, then:
"
```
Simpler: confirm it's on the schema-registry load path and that `getSchema(schemaRelationshipId)` resolves (see P0 methodology).

**Acceptance:** baseline recorded; `repo` noted as dead; relationship schema resolves.

---

### Phase 2 — `refExists` predicate type + evaluator (core, TDD)

**Objective:** Add a `refExists` op (and optional `refKind`) to the predicate DSL, evaluable against a resolver.

**Files:**
- Modify: `server/src/lint/types.ts` (add `RefExistsPredicate` / `RefKindPredicate` interfaces + type guards; extend `Predicate` union)
- Modify: `server/src/lint/PredicateEvaluator.ts` (dispatch + `evalRefExists`; change signature to accept optional context)
- Test: `server/src/lint/RefExistsPredicate.test.ts` (new)

**Design:**
- Signature change — backwards-compatible: `evaluatePredicate(predicate, data, context?: { repo?: LintRepoResolver })`. Existing callers pass only `(pred, data)` and behave unchanged (a `refExists` with no resolver → result `false` with reason `no resolver`), so all current tests keep passing.
- `LintRepoResolver`: `{ exists(recordId: string): Promise<boolean>; kindOf?(recordId: string): Promise<string | null> }` (defined in `types.ts`). `kindOf` resolves recordId → its `kind`. Comparator `X` for `refExists` "does the record at `path` exist".
- New DSL shape (canonical):
  ```yaml
  - id: "run-experiment-ref-exists"
    severity: "warning"
    scope: "record"
    assert:
      op: "refExists"
      path: "$.experimentId"
      # optional kind constraint when the field's meaning demands it:
      # kind: "experiment"
  ```
- Semantics:
  - value undefined/null/empty → `true` (field absent is not a missing-ref; the run-has-parent-link rule owns "must have a parent").
  - Resolver absent → `false` + reason `"refExists requires a repo resolver (LintContext.repo)"`.
  - `exists(id)` false → `false` + reason `"Referenced record '<id>' at '<path>' does not exist"`.
  - `exists(id)` true + `kind` not specified → `true`.
  - `exists(id)` true + `kind` specified + `kindOf(id) === kind` → `true`; mismatch → `false` + reason `"Referenced record '<id>' at '<path>' is kind '<actual>', expected '<kind>'"`.

**Step 1: Write failing tests** (in `RefExistsPredicate.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { evaluatePredicate } from './PredicateEvaluator.ts';
import type { LintRepoResolver } from './types.ts';

const repo: LintRepoResolver = {
  exists: async (id) => id === 'EXP-1' || id === 'STU-1',
  kindOf: async (id) => (id === 'EXP-1' ? 'experiment' : id === 'STU-1' ? 'study' : null),
};

describe('refExists predicate', () => {
  it('passes when the referenced record exists', async () => {
    const r = await evaluatePredicate(
      { op: 'refExists', path: '$.experimentId' },
      { experimentId: 'EXP-1' },
      { repo },
    );
    expect(r.result).toBe(true);
  });
  it('fails when the referenced record does not exist', async () => {
    const r = await evaluatePredicate(
      { op: 'refExists', path: '$.experimentId' },
      { experimentId: 'EXP-MISSING' },
      { repo },
    );
    expect(r.result).toBe(false);
    expect(r.reason).toContain('EXP-MISSING');
  });
  it('trivially passes when the field is absent (no ref to check)', async () => {
    const r = await evaluatePredicate({ op: 'refExists', path: '$.experimentId' }, {}, { repo });
    expect(r.result).toBe(true);
  });
  it('returns false with reason when no resolver is provided', async () => {
    const r = await evaluatePredicate({ op: 'refExists', path: '$.experimentId' }, { experimentId: 'EXP-1' });
    expect(r.result).toBe(false);
    expect(r.reason).toContain('repo resolver');
  });
  it('refKind: fails on kind mismatch', async () => {
    const r = await evaluatePredicate(
      { op: 'refExists', path: '$.studyId', kind: 'study' },
      { studyId: 'EXP-1' }, // exists but is an experiment → mismatch (cross-kind caught again, now against reality)
      { repo },
    );
    expect(r.result).toBe(false);
    expect(r.reason).toContain('expected');
  });
});
```
Note: `evaluatePredicate` becomes async (or returns a Promise) because `exists` is async. That's a **breaking internal change** to its return type. Decision: make it return `Promise<PredicateResult>` and update the ~6 in-file callers (`evalAll`/`evalAny`/`evalNot` already await; `evalExists` etc. stay sync but the top-level dispatcher returns a Promise). `compilePredicate` becomes `(data, ctx?) => Promise<PredicateResult>`. Flag: this ripples to `LintEngine.ts:139/151` — `when`/`assert` become awaited. All existing tests already `await` engine methods, so only the sync helper call sites need updating.

**Step 2: Run — verify failure** (refExists unknown op → fall-through `false`/“Unknown predicate op”)
```bash
cd /home/brad/git/computable-lab/server && npx vitest run src/lint/RefExistsPredicate.test.ts
```

**Step 3: Implement**
- Add `RefExistsPredicate` to `types.ts` and to the union; add `isRefExistsPredicate(p)` (`p.op === 'refExists'`).
- Add `evalRefExists` to `PredicateEvaluator.ts` implementing the semantics above; wire it into the dispatch (after mention_kind).
- Change `evaluatePredicate` to return `Promise<PredicateResult>`; make `evalAll`/`evalAny`/`evalNot` already-async (they compose sub-results — await children); return `Promise.all`/`await` where needed; add optional `context` param.
- Update `compilePredicate` return type.

**Step 4: Run — verify pass**, plus the full existing lint suite (no regressions from the async change):
```bash
cd /home/brad/git/computable-lab/server && npx vitest run src/lint
```
Expected: RefExists tests 5 pass + all prior LintEngine/PredicateEvaluator tests still pass.

**Step 5: Commit**
```bash
cd /home/brad/git/computable-lab
git add server/src/lint/types.ts server/src/lint/PredicateEvaluator.ts server/src/lint/RefExistsPredicate.test.ts
git commit -m "feat(lint): refExists predicate (async, resolver-backed) + LintContext.repo threading"
```

---

### Phase 3 — Wire the resolver into the store's lint call (TDD)

**Objective:** `RecordStoreImpl.lint()` and the engine supply a real `repo`, so `refExists` works against the actual store.

**Files:**
- Modify: `server/src/store/RecordStoreImpl.ts` (`lint()`, and a private resolver builder)
- Modify: `server/src/lint/LintEngine.ts` (forward `ctx` to `evaluatePredicate` for `when` and `assert`)
- Modify: `server/src/lint/types.ts` (export `LintRepoResolver`)
- Test: `server/src/store/RecordStore.lintRefExists.test.ts` (new)

**Step 1: Failing tests**

```ts
describe('RecordStore.lint with repo resolver', () => {
  it('flags a run whose experimentId points at no existing experiment', async () => {
    // seed STU-1, EXP-1; run RUN-1 {studyId:'STU-1', experimentId:'EXP-MISSING'}
    // run.lint.yaml has run-experiment-ref-exists (added in Phase 5); assert warning appears
  });
  it('does NOT flag a run whose experimentId resolves to a real experiment', async () => {
    // seed STU-1, EXP-1; run RUN-1 {studyId:'STU-1', experimentId:'EXP-1'}
  });
});
```

**Step 2: Run — verify failure** (currently the STU-1/EXP-MISSING run lints clean — resolver not threaded).

**Step 3: Implement**
- `RecordStoreImpl`: add a private `#buildLintRepo()` returning `{ exists: (id) => this.exists(id), kindOf: (id) => this.findKind(id) }`. If `findKind` doesn't exist, add `async findKind(recordId): Promise<string | null>` that reads the record's `kind` (via `findRecordPath` + payload, or index). Keep it cheap.
- `lint(envelope)`: `return this.lintEngine.lint(envelope.payload, envelope.schemaId, { repo: this.#buildLintRepo() })`.
- `LintEngine.lint(payload, schemaId, context?)`: merge `context || {}` into the `LintContext` passed to `evaluateRule`; in `evaluateRule`, forward the full `ctx` to `evaluatePredicate(rule.when/assert, ctx.data, ctx)`.
- Update `server/src/lint/LintEngine.ts` `lint()` signature (composable `ctx?: Partial<LintContext>`).

**Step 4: Run — verify pass** + full `src/store` and `src/lint` suites.

**Step 5: Commit**
```bash
git add server/src/store/RecordStoreImpl.ts server/src/lint/LintEngine.ts server/src/lint/types.ts server/src/store/RecordStore.lintRefExists.test.ts
git commit -m "feat(store): thread LintRepoResolver into RecordStore.lint for refExists"
```

---

### Phase 4 — `POST /relationships` + source/target existence validation (TDD)

**Objective:** The typed-edge write path exists, validates against the schema, and refuses to create a relationship pointing at a record that doesn't exist.

**Files:**
- Create: `server/src/api/handlers/RelationshipHandlers.ts`
- Modify: `server/src/api/routes.ts` (register `POST /relationships`)
- Modify: `server/src/store/RecordStoreImpl.ts` or a helper — existence+kind check for source/target
- Test: `server/src/api/handlers/RelationshipHandlers.test.ts` (new)

**Step 1: Failing tests**

```ts
describe('POST /relationships', () => {
  it('rejects a relationship whose sourceId does not exist', async () => {
    // POST {sourceType:'run', sourceId:'RUN-MISSING', targetType:'claim', targetId:'CLM-1', verb:'tests'}
    // expect 400 / { ok:false, error: contains 'source' and 'not exist' }
  });
  it('rejects a relationship whose targetId does not exist', async () => {
    // source Run RUN-1 (seeded), target CLM-MISSING → 400
  });
  it('accepts a valid relationship and stores a kind: relationship record', async () => {
    // source RUN-1, target claim CLM-1 (both seeded) → 201, record kind 'relationship'
    // GET /relationships?sourceId=RUN-1 returns it
  });
  it('rejects an invalid verb', async () => {
    // verb 'florps' → schema error, not silently accepted
  });
});
```

**Step 2: Run — verify failure** (route 404 today).

**Step 3: Implement**
- `RelationshipHandlers`:
  - Load schema, Ajv-validate the payload against `relationship.schema.yaml`.
  - Existence checks: `source` (by `sourceId`) exists; `target` (by `targetId`) exists. Optionally cross-check `sourceType`/`targetType` against the actual `kind` via `kindOf` when the caller sends it (defensive — the schema enum already constrains allowed kinds). Return 400 on any mismatch with a clear message.
  - On success: `store.create(relationshipPayload)` → returns the new relationship record.
- Register `fastify.post('/relationships', h.postRelationships.bind(h))` in `routes.ts` next to line 356.
- Ensure `create` runs the standard store path (validate + lint + persist) so a relationship is itself linted.

**Step 4: Run — verify pass** + `src/api` and `src/store` suites. Confirm `GET /relationships` round-trips a stored record.

**Step 5: Commit**
```bash
git add server/src/api/handlers/RelationshipHandlers.ts server/src/api/routes.ts server/src/api/handlers/RelationshipHandlers.test.ts
git commit -m "feat(api): POST /relationships with source/target existence validation"
```

---

### Phase 5 — Apply `refExists` rules to the schemas (the payoff)

**Objective:** The ref-looking fields on run/experiment/study are now lint-governed warnings, proving "relationships are schema/lint-enforced."

**Files:**
- Modify: `schema/studies/run.lint.yaml` (add `run-experiment-ref-exists`, `run-study-ref-exists`, `run-project-ref-exists`)
- Modify: `schema/studies/experiment.lint.yaml` (add `experiment-study-ref-exists`)
- Modify: `schema/studies/study.lint.yaml` (add `study-claim-ref-exists` for `claimRelationships`, if present)
- Test: `server/src/lint/studyRunRules.test.ts` (append) — same harness as P0 Tasks 2/3.

**Step 1: Failing tests** — assert each new rule id surfaces a warning only when the ref is dangling; existing good cases must not warn.

**Step 2: Run — verify failure.**

**Step 3: Implement** — e.g. in `run.lint.yaml` append:

```yaml
  - id: "run-experiment-ref-exists"
    title: "experimentId must reference an existing experiment record"
    severity: "warning"
    scope: "record"
    assert:
      op: "refExists"
      path: "$.experimentId"
      kind: "experiment"
    message:
      template: "Run '{{$.recordId}}' references experiment '{{$.experimentId}}' which does not exist"
      paths: ["$.experimentId"]

  - id: "run-study-ref-exists"
    title: "studyId must reference an existing study record"
    severity: "warning"
    scope: "record"
    assert:
      op: "refExists"
      path: "$.studyId"
      kind: "study"
    message:
      template: "Run '{{$.recordId}}' references study '{{$.studyId}}' which does not exist"
      paths: ["$.studyId"]
```
(experiment.lint.yaml: `experiment-study-ref-exists` with `$.studyId` → `kind: study`; same shapes.)

**Step 4: Run — verify pass** (warnings only on dangling refs) + full lint suite.
```bash
cd /home/brad/git/computable-lab/server && npx vitest run src/lint src/store
```

**Step 5: Live sanity** (read-only, no writes): report which live records warn under the new rules — this is the honest migration signal.
```bash
# via API after starting server: POST each run to /api/validation, inspect lint warnings
```

**Step 6: Commit**
```bash
git add schema/studies/run.lint.yaml schema/studies/experiment.lint.yaml schema/studies/study.lint.yaml server/src/lint/studyRunRules.test.ts
git commit -m "feat(lint): refExists warnings on run/experiment/study parent refs"
```

---

### Phase 6 — Registry + final verification

**Objective:** Everything is verifiably live; regression set is unchanged.

**Files:**
- Modify: `schema/registry/predicates.registry.yaml` (document `refExists` op as a lint predicate — optional but recommended for discoverability)
- Test: full-suite regression.

**Step 1: Gate suite**
```bash
cd /home/brad/git/computable-lab/server && npx tsc --noEmit && npx vitest run 2>&1 | grep -E "Test Files|Tests "
cd /home/brad/git/computable-lab/app && npx tsc --noEmit && npx vitest run src/shared/api 2>&1 | tail -3
```
Failure set must be identical to Phase 1 baseline (modulo new passing tests).

**Step 2: End-to-end live check**
- Start server + app (`./start-app.sh` or per CLAUDE.md).
- `POST /relationships` a bad ref → 400; a good ref → 201; `GET /relationships` round-trips.
- Create a run with `experimentId: EXP-NOPE` → API response lint shows `run-experiment-ref-exists` warning.
- Confirm a genuinely-good run/study/experiment does NOT warn.

**Step 3: regressions** — `git status --short`, `git log --oneline -10`.

---

## ACCEPTANCE CRITERIA

1. `evaluatePredicate({op:'refExists',path}, data, {repo})` returns correct pass/fail with reasons; absent field passes; absent resolver fails with a clear reason.
2. A run with `experimentId` pointing at a non-existent experiment produces a `run-experiment-ref-exists` **warning** in the API response lint; a good ref does not.
3. `POST /relationships` returns 400 for a missing source/target and 201 + persists (queryable via `GET /relationships`) for a valid one; invalid verb rejected.
4. `LintContext.repo` is populated by `RecordStoreImpl.lint()`; `LintEngine` forwards full ctx to the evaluator.
5. All prior in-record lint/schema tests still pass (async evaluator change is non-breaking).
6. Server + app typecheck clean; failure set matches Phase 1 baseline (no new failures).
7. `schema/registry/predicates.registry.yaml` documents the `refExists` lint op.

## RISKS & TRADEOFFS

- **Async return-type change to `evaluatePredicate`** (`PredicateResult` → `Promise<PredicateResult>`) is the single riskiest edit. Mitigate in Phase 2: it's contained to `PredicateEvaluator.ts` + `LintEngine.ts` + `compilePredicate`; all existing tests already `await` engine methods, so the surface is small. Run `src/lint` in full after Phase 2 before proceeding.
- **Severity = warning (not error)** for the applied ref rules: a hard error would brick writes to the existing corpus (records with dangling refs). Warnings surface violations while staying non-blocking. Flip to error only in a follow-up after corpus cleanup.
- **Kind checks need a `kindOf` lookup** — if `findKind` is expensive (reads each record), it's called only when a `refExists` rule has a `kind` constraint. Keep `findKind` cheap (index-served) or cap usage. YAGNI: only build `kindOf` if a rule actually needs it (run/experiment refs do).
- **Resolver correctness under concurrency:** `RecordStoreImpl.lint()` runs during a create/update; the resolver reads committed state. Editing the same record's refs concurrently could see a stale target — acceptable for warnings (never errors). Note in code comment.
- **Performance:** full-corpus `refExists` could add store reads per linted record. Mitigate: resolver uses the in-memory index when available (`IndexManager`) rather than per-record disk reads; revisit if lint latency regresses.
- **`findRecordPath` semantics:** `RecordStoreImpl.exists()` and `findKind()` must agree on the store layout (draupt paths); verify both resolve the embedded-git worktree correctly (P0 noted the tree is `records/study/` singular).
- **The `repo` slot is currently dead** — this plan activates a field that has always been reserved but unused; no behavior change for rules that don't use `refExists`.

## EXECUTION HANDOFF

Plan complete and saved. Execute via subagent-driven-development: **Phase 1 → 2 → 3 → 4 → 5 → 6**, each a fresh subagent (or in-session for the tightly-coupled evaluator work) with two-stage review (spec compliance, then code quality). Phase 2 (async evaluator) is the caution point — do it in full, run `src/lint` before advancing. Confirm severity choices (warning vs error) with Brad before Phase 5.