# Study/Experiment Schema Audit — are relationships honored or hardcoded?

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task (Tasks 1–7). Tasks 0–2 are the AUDIT FINDINGS — read them first.

**Goal:** Answer "are the study/experiment schemas correct, and does the application honor them or hardcode the relationships?" with evidence, then fix the gaps so the declarative layer actually constrains the study→experiment→run links.

**Architecture:** computable-lab's contract is schema-driven: structural rules in `*.schema.yaml` (Ajv), business rules in `*.lint.yaml` (declarative predicate DSL — "never hardcoded rules in TS"). This audit found the schemas are *directionally correct* (flattened, reference-based, experiment-optional) but *unenforced*: all three lint files are empty, the lint DSL has no cross-record reference resolution, the id-shape conventions (STU-/EXP-/RUN- prefixes) exist only in prose, and two live records already violate the model. The tree builder in `IndexManager.getStudyTree()` hardcodes a strict single-parent nesting that contradicts both the schemas and the flattened-ownership decision (`.hermes/plans/2026-08-02_094500-flattened-ownership-vendor-pdf.md`).

**Tech Stack:** YAML schemas (JSON Schema 2020-12 + FAIRCommon mixin), AjvValidator, LintEngine (predicate DSL: exists/nonEmpty/regex/equals/in/all/any/not + `when`), IndexManager, Fastify.

---

## AUDIT FINDINGS (verified 2026-08-15 against schemas, code, and live data in `~/.computable-lab/worktrees/main/records`)

### F1 — Schemas are directionally correct
- `study.schema.yaml`: "It is NOT a container that enumerates child records. Experiments reference studyId." ✓ flattened.
- `experiment.schema.yaml`: "It does NOT embed assertions, evidence, runs, or event logs. Runs reference experimentId." ✓ flattened. `studyId` REQUIRED ✓.
- `run.schema.yaml`: `experimentId` = "Optional experiment recordId. Experiments are now optional grouping (saved views), not a required parent." ✓. `projectIds[]` = "A run MAY link to multiple projects (spec §2.2)". `studyId` documented as "auto-populated from projectIds[0]" — **but no code anywhere implements that auto-population** (only a frontend fallback in `DeckHostPage.tsx:66` reads `projectIds[0]` as a *display* fallback, and never writes it back).
- All three: `unevaluatedProperties: false` + FAIRCommon ✓.

### F2 — The lint layer is EMPTY (the declared business-rule layer does nothing)
- `schema/studies/study.lint.yaml`, `experiment.lint.yaml`, `run.lint.yaml` are all `rules: []`.
- Consequence: the schema's own prose promises are unenforced. The run schema comment says "at least one [studyId/projectIds] should be present in practice, but the schema doesn't enforce this (lint rules can)" — and the lint rules were never written.
- The LintEngine DSL **cannot do cross-record checks** (no `refExists` op; `in` only resolves against the record's own payload). So "does experimentId point to a real experiment?" is uncheckable at write time today.

### F3 — Id-shape conventions are prose-only, and two live records already violate them
- Only ONE field in the whole run schema has a `pattern`: `executedBy: ^USR-`. `studyId`/`experimentId`/`projectIds[*]` have no pattern — so nothing stops a cross-kind id from landing in the wrong field.
- **Live violation A:** `records/run/RUN-first-run-xbzv__first-run.yaml:4` has `studyId: EXP-first-experiment-ot9r` — an experiment id stored in the study field. Ajv accepts it (no pattern).
- **Live violation B:** 42 records (14 of 18 runs) carry `studyId: STU-scratch`, but **no study record `STU-scratch` exists**. The frontend treats it as real (`app/src/event-editor/legacyRouteResolution.ts:18` `SCRATCH_STUDY_ID = 'STU-scratch'`, comment claims "see records/studies/STU-scratch__scratch.yaml — so the scratch study is real") — the file is missing from the live worktree. Orphaned parent refs, invisible to validation.

### F4 — The tree builder hardcodes the hierarchy the schemas deliberately removed
- `server/src/index/IndexManager.ts:569-700` `getStudyTree()`: nests runs ONLY under `experimentId` (`runs.filter(r => r.links?.experimentId === exp.recordId)`), and experiments ONLY under `studyId`. A run with 0 or 2+ parents is **invisible in the Projects tree** — exactly the strict hierarchy the flattened-ownership doc says is "the code-level embodiment of the nesting being removed."
- Inconsistent with its sibling: `getRunsForProject()` (line 429) correctly checks BOTH `studyId` and `projectIds[]`. The tree does not honor `projectIds[]` at all.
- So: two code paths implement two different relationship models of the same data.

### F5 — Relationship records are dead infrastructure
- `relationship.schema.yaml` exists (typed directed edges, "Projects, runs, and claims do not own each other — they are linked by relationship records"), but: **zero** `kind: relationship` records in the live worktree, **no POST endpoint** (only `GET /relationships` at `routes.ts:356`), and `study.schema.yaml`'s own `claimRelationships` field is marked DEPRECATED in favor of them. The mechanism the schemas point to is unbuilt.

### ANSWER TO THE QUESTION
**Partly both, leaning "honored structurally, ignored behaviorally."** The schemas correctly model a flattened, reference-based world, and Ajv enforces structure on write (RecordStoreImpl runs `validate()` + `lintEngine.lint()` at create/update). But the *relationships* — the referential meaning of studyId/experimentId/projectIds — are NOT honored by any layer: no patterns, empty lint, no cross-record resolution, no relationship records. And `getStudyTree()` hardcodes the old strict tree, contradicting the schemas. The two live data violations (F3) are the proof the gap is already biting.

---

## Scope decision (YAGNI)

Fix what makes the declarative layer *enforce its own promises*, in priority order:
1. **P0:** id-shape `pattern`s on all study/experiment refs (schema layer — catches cross-kind ids like F3-A at write time, zero new code).
2. **P0:** fill the three empty lint files with the rules the schemas' prose already promises (run needs ≥1 parent; experiment/study slug rules).
3. **P0:** seed the missing `STU-scratch` study record (or migrate the 14 runs — see open question).
4. **P1:** make `getStudyTree()` honor `projectIds[]` + surface parentless runs (kill the hardcoded single-parent nesting for RUNS; keep experiments→study since experiment REQUIRES studyId).
5. **P2 (separate epic, NOT this plan):** cross-record ref-integrity (`refExists` lint op) + relationship-record create path. These need DSL/wiring work and are the real "flattened ownership" build-out — tracked in the 2026-08-02 doc.

Out of scope: changing what a study IS, adding experiment auto-creation, the read-only-LPR bug (has its own plan: `2026-08-15_130056-protocol-planning-editable-draft-lpr-fix.md`).

---

## Tasks

### Task 1: Add id-shape patterns to study/experiment refs (schema layer)

**Objective:** Ajv rejects a cross-kind id (e.g. `EXP-…` in `studyId`) at write time.

**Files:**
- Modify: `schema/studies/run.schema.yaml` (lines ~35-47: `experimentId`, `studyId`, `projectIds.items`)
- Modify: `schema/studies/experiment.schema.yaml` (line ~40: `studyId`)
- Test: `server/src/validation/` — find the existing Ajv test file (`search_files "AjvValidator" server/src file_glob *.test.ts`); if none exists, create `server/src/validation/IdShape.test.ts`

**Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
// load the run schema the same way AjvValidator does (mirror the existing
// validator test's setup — SchemaLoader + AjvValidator, see
// server/src/validation/AjvValidator.test.ts if present)
// If no shared harness exists, use the plan's probe:
//   node -e "…load ALL schemas into Ajv (see skill 'JSON Schema Debugging')…"

describe('run schema id-shape patterns', () => {
  it('rejects an EXP- id in studyId', async () => {
    const ok = await validateRun({ kind: 'run', recordId: 'RUN-x', status: 'planned', studyId: 'EXP-first-experiment-ot9r' });
    expect(ok.valid).toBe(false);
    expect(ok.errors?.some(e => e.instancePath === '/studyId')).toBe(true);
  });
  it('accepts a well-formed STU-/EXP- pair', async () => {
    const ok = await validateRun({ kind: 'run', recordId: 'RUN-x', status: 'planned', studyId: 'STU-1', experimentId: 'EXP-1' });
    expect(ok.valid).toBe(true);
  });
  it('rejects an EXP- id inside projectIds[]', async () => {
    const ok = await validateRun({ kind: 'run', recordId: 'RUN-x', status: 'planned', projectIds: ['EXP-1'] });
    expect(ok.valid).toBe(false);
  });
});
```

(`validateRun` = thin helper over the loaded `run.schema.yaml`; implement it in the test file using the repo's existing schema-loading path — do NOT hand-build Ajv config if a harness already exists.)

**Step 2: Run — verify failure** (first two asserts fail: EXP- in studyId currently passes)

```bash
cd /home/brad/git/computable-lab/server && npx vitest run src/validation/
```

**Step 3: Edit schemas** — add the pattern to each ref field (keep existing descriptions; append the pattern line):

`run.schema.yaml`:
```yaml
  experimentId:
    type: string
    pattern: "^EXP-"
    description: "Optional experiment recordId. Experiments are now optional grouping (saved views), not a required parent."

  studyId:
    type: string
    pattern: "^STU-"
    description: "Parent study (project) recordId. Convenience field — when projectIds is present, this is auto-populated from projectIds[0]."

  projectIds:
    type: array
    description: "Projects this run is linked to. A run MAY link to multiple projects (spec §2.2). When present, this replaces the singular studyId as the primary project link."
    items:
      type: string
      pattern: "^STU-"
    uniqueItems: true
```

`experiment.schema.yaml`:
```yaml
  studyId:
    type: string
    pattern: "^STU-"
    description: "Parent Study recordId."
```

**Step 4: Run — verify pass**, then run the FULL server test suite (some existing tests seed records with non-conforming ids — fix the SEEDS, not the patterns; a test fixture using `studyId: 'STU-1'` is already conforming):

```bash
cd /home/brad/git/computable-lab/server && npx vitest run 2>&1 | tail -8
```
Expected: no NEW failures vs the pre-existing baseline (record baseline first: `npx vitest run 2>&1 | grep -E "Test Files|Tests "`).

**Step 5: Commit**

```bash
cd /home/brad/git/computable-lab
git add schema/studies/run.schema.yaml schema/studies/experiment.schema.yaml server/src/validation/
git commit -m "feat(schema): id-shape patterns on study/experiment refs (STU-/EXP-)"
```

---

### Task 2: Fill run.lint.yaml — a run must have at least one parent

**Objective:** Enforce the run schema's own comment: "studyId and projectIds are mutually optional — at least one should be present in practice, but the schema doesn't enforce this (lint rules can)."

**Files:**
- Modify: `schema/studies/run.lint.yaml`
- Test: `server/src/lint/LintEngine.test.ts` (append) or a new `server/src/lint/studyRunRules.test.ts`

**Step 1: Write failing test** (use the existing `LintEngine` + `LintSpecLoader` directly — no HTTP):

```ts
import { describe, it, expect } from 'vitest';
import { LintEngine } from './LintEngine.js';
import { loadLintSpec } from './LintSpecLoader.js'; // confirm actual export name first
import { readFileSync } from 'node:fs';

const RUN_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/run.schema.yaml';

function engine(): LintEngine {
  const eng = new LintEngine();
  const spec = loadLintSpec(readFileSync(new URL('../../../schema/studies/run.lint.yaml', import.meta.url), 'utf8'));
  eng.addSpec('run.lint.yaml', spec);
  return eng;
}

describe('run lint rules', () => {
  it('passes a run with studyId', () => {
    const r = engine().lint({ kind: 'run', recordId: 'RUN-1', status: 'planned', studyId: 'STU-scratch' }, RUN_SCHEMA_ID);
    expect(r.valid).toBe(true);
  });
  it('passes a run with projectIds only', () => {
    const r = engine().lint({ kind: 'run', recordId: 'RUN-1', status: 'planned', projectIds: ['STU-1'] }, RUN_SCHEMA_ID);
    expect(r.valid).toBe(true);
  });
  it('flags (warning) a run with neither parent', () => {
    const r = engine().lint({ kind: 'run', recordId: 'RUN-1', status: 'planned' }, RUN_SCHEMA_ID);
    expect(r.summary.warnings).toBeGreaterThanOrEqual(1);
    expect(r.violations.some(v => v.ruleId === 'run-has-parent-link')).toBe(true);
  });
});
```

**Step 2: Run — verify failure** (`run-has-parent-link` rule doesn't exist → 0 warnings)

**Step 3: Implement** `schema/studies/run.lint.yaml` (DSL confirmed: `any` = OR; shape mirrors `claim.lint.yaml`):

```yaml
# Lint rules for Run records
lintVersion: 1
schemaId: "https://computable-lab.com/schema/computable-lab/run.schema.yaml"
rules:
  - id: "run-has-parent-link"
    title: "A run must link to at least one study (studyId or projectIds)"
    severity: "warning"
    scope: "record"
    assert:
      op: "any"
      predicates:
        - op: "exists"
          path: "$.studyId"
        - op: "nonEmpty"
          path: "$.projectIds"
    message:
      template: "Run '{{$.recordId}}' links to no study (studyId and projectIds both empty)"
      paths: ["$.recordId"]
```

severity is **warning**, not error: 14 live runs point at the (currently missing) STU-scratch, and making this an error would block every update to those records until Task 3 lands — warning surfaces it without breaking writes. (If Task 3 creates the study record, the warning stays for truly-parentless runs only.)

**Step 4: Run — verify pass** (lint tests + `npx vitest run src/lint/`), then the full server suite (the new warning will start appearing in `result.lint` for parentless runs — check no test asserts `lint.summary.warnings === 0` on run records; adjust assertions if so, with a comment).

**Step 5: Commit**

```bash
git add schema/studies/run.lint.yaml server/src/lint/
git commit -m "feat(lint): run-has-parent-link rule (studyId or projectIds)"
```

---

### Task 3: Fill study/experiment lint files (slug + title hygiene)

**Objective:** The two empty lint files get minimal real rules so the layer is demonstrably live for all three kinds.

**Files:**
- Modify: `schema/studies/study.lint.yaml`, `schema/studies/experiment.lint.yaml`
- Test: same harness as Task 2 (one shared `studyRunRules.test.ts` is fine — DRY)

**Step 1: Failing tests** (4 cases: study bad-slug fails / good slug passes; experiment bad-slug fails / good passes). Slug rule: `shortSlug` must match `^[a-z0-9]+(?:-[a-z0-9]+)*$` (kebab-case, no leading/trash). Both rules severity `warning`, ids `study-short-slug` / `experiment-short-slug`.

**Step 2: Run — verify failure.**

**Step 3: Implement** (both files):

```yaml
# schema/studies/study.lint.yaml
lintVersion: 1
schemaId: "https://computable-lab.com/schema/computable-lab/study.schema.yaml"
rules:
  - id: "study-short-slug"
    title: "shortSlug must be kebab-case"
    severity: "warning"
    scope: "record"
    assert:
      op: "regex"
      path: "$.shortSlug"
      pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"
    message:
      template: "Study '{{$.recordId}}' shortSlug '{{$.shortSlug}}' is not kebab-case"
      paths: ["$.shortSlug"]
```
(experiment.lint.yaml: identical shape, `experiment-short-slug` id, experiment schemaId.)

**Step 4: Run — verify pass** + full server suite.

**Step 5: Commit** `git commit -m "feat(lint): shortSlug kebab-case rules for study + experiment"`

---

### Task 4: Seed the missing STU-scratch study record (data)

**Objective:** 42 records (incl. 14 of 18 runs) reference `STU-scratch`; the frontend (`legacyRouteResolution.ts:18`) asserts it exists — it doesn't. Restore it so refs resolve.

> **Path note (verified 2026-08-15):** study RECORDS live in `records/study/` (singular) — confirmed: `records/study/STU-wednesday-morning-projec-qumo__wednesday-morning-project.yaml`, `records/study/STU-quick-test__quick-test-project.yaml`. The top-level `records/studies/` directory is **workspace UI state only** (`workspace.yaml` + nested event-graphs), NOT a record store. The frontend comment's `records/studies/STU-scratch__scratch.yaml` and this plan's original `records/studies/…` path are both wrong; the correct seeded file is `records/study/STU-scratch__scratch.yaml`.

**Files:**

- Create (via API — never hand-edit the embedded-git worktree): `records/study/STU-scratch__scratch.yaml`

**Step 1: Verify it's really absent and check git history for the original**

```bash
git -C /home/brad/.computable-lab/worktrees/main log --all --oneline -- "records/studies/STU-scratch*" | head
git -C /home/brad/.computable-lab/worktrees/main show $(git -C /home/brad/.computable-lab/worktrees/main log --all --format=%H -- "records/studies/STU-scratch*" | head -1):records/studies/STU-scratch__scratch.yaml 2>/dev/null
```
If the original exists in history, restore THAT payload (faithful). If not, create:

**Step 2: Create via API**

```bash
curl -s -X POST http://localhost:3001/api/records -H 'content-type: application/json' -d '{
  "schemaId": "https://computable-lab.com/schema/computable-lab/study.schema.yaml",
  "recordId": "STU-scratch",
  "payload": {
    "kind": "study", "recordId": "STU-scratch",
    "title": "Scratch", "shortSlug": "scratch", "state": "in_progress",
    "description": "Default catch-all study for records created outside a specific project."
  }
}'
```
Expected: 201; then `GET /api/records/STU-scratch` returns it. (If the record already exists in the worktree under a different filename, STOP and report — do not duplicate.)

**Step 3: Verify** — `grep -rl "studyId: STU-scratch" ~/.computable-lab/worktrees/main/records | wc -l` still 42, and the tree now shows the Scratch study: `curl -s http://localhost:3001/api/tree | python3 -c "import sys,json; [print(s['recordId'], len(s.get('experiments',[])), 'exp') for s in json.load(sys.stdin)['studies']]"` (adjust key names to the actual response shape — inspect first with `| head -c 400`).

**Step 4: Commit** (the embedded git repo auto-commits on store writes; verify with `git -C ~/.computable-lab/worktrees/main log -1 --oneline`). If a manual commit is needed in the monorepo for `records/seed/`, seed a copy there: `records/seed/study/STU-scratch__scratch.yaml`.

---

### Task 5: Fix the one corrupted live record (RUN-first-run-xbzv)

**Objective:** `studyId: EXP-first-experiment-ot9r` → belongs to `STU-quick-test`? No — decide from context: the experiment's own `studyId` is the source of truth.

**Files:** data-only, via API.

**Step 1: Read the experiment's studyId**

```bash
grep -n "studyId" ~/.computable-lab/worktrees/main/records/experiment/EXP-first-experiment-ot9r__first-experiment.yaml
```

**Step 2: Patch the run** (read-modify-write the full payload; the run's `studyId` = the experiment's `studyId`; keep `experimentId` — it was likely INTENDED as the experiment link and the field got crossed during creation):

```bash
# fetch current payload, set studyId=<experiment's studyId>, keep experimentId=EXP-first-experiment-ot9r, POST /api/records/RUN-first-run-xbzv
```
With Task 1's patterns live, the OLD payload would now be REJECTED — this migration must run as part of the same deploy, before the schema change blocks the next write. Order: Task 4 → Task 5 → then the schema pattern change (Task 1) is safe for future writes. (If the implementer lands Task 1 first, do Task 5 with the server stopped or accept the one blocked write — note it in the commit.)

**Step 3: Verify** — `grep -n "studyId" <run file>` shows the STU- id; `GET /api/records/RUN-first-run-xbzv` validates.

**Step 4: Commit** (auto via store write).

---

### Task 6: getStudyTree() — honor projectIds[] and surface parentless runs

**Objective:** Kill the hardcoded "run invisible without exactly one experiment" nesting (F4) for runs, aligning the tree with the run schema. Experiments keep nesting under their (required) study.

**Files:**
- Modify: `server/src/index/IndexManager.ts:569-700` (`getStudyTree`)
- Modify: `server/src/index/types.ts` (`StudyTreeNode` — add `runs: RunTreeNode[]` at study level)
- Test: existing tree test file (`search_files "getStudyTree" server/src file_glob *.test.ts`) or new `server/src/index/StudyTree.test.ts`

**Step 1: Failing tests**

```ts
it('shows a run under the study (no experiment) via studyId', async () => {
  // seed: study STU-1, run RUN-1 {studyId: STU-1} (no experimentId)
  // expect: tree[0].runs contains RUN-1
});
it('shows a run under each study in projectIds[]', async () => {
  // seed: studies STU-1, STU-2; run RUN-1 {projectIds: ['STU-1','STU-2']}
  // expect: RUN-1 appears in BOTH studies' runs arrays
});
it('still nests experiment-linked runs under their experiment', async () => {
  // seed: STU-1, EXP-1 {studyId: STU-1}, RUN-1 {studyId: STU-1, experimentId: EXP-1}
  // expect: RUN-1 under tree[0].experiments[0].runs
});
```

**Step 2: Run — verify failure** (study-level `runs` doesn't exist).

**Step 3: Implement** — in the study loop, after building `experimentNodes`:

```ts
      // Runs linked to THIS study without an experiment (or via projectIds[]):
      // the schema makes experiment optional grouping, so the tree must not
      // require it to show a run.
      const studyRunIds = new Set(
        experimentNodes.flatMap(exp =>
          (exp.runs ?? []).map(r => r.recordId)),
      );
      const directRuns = runs.filter(r => {
        if (studyRunIds.has(r.recordId)) return false;
        if (r.links?.experimentId) return false; // experiment-linked runs nest under the experiment
        return r.links?.studyId === study.recordId
          || r.projectIds?.includes(study.recordId);
      });
      const directRunNodes: RunTreeNode[] = directRuns.map(run => {
        // same runRecords/counts/artifact logic as the experiment-level loop —
        // extract to a shared local function buildRunNode(run, studyId) (DRY)
      });
```
and in the `tree.push({...})`: `...(directRunNodes.length ? { runs: directRunNodes } : {})`. Refactor the existing per-run counting block into the shared `buildRunNode` helper used by both loops (DRY — do NOT copy the 20-line block).

**Step 4: Run — verify pass** + full server suite. Frontend impact check: the tree shape type lives in `app/src/types/tree.ts` (imported by `app/src/shared/api/treeClient.ts`). Add `runs?: RunTreeNode[]` to the `StudyTreeNode` interface (`app/src/types/tree.ts:22`) — additive, no breaking change (older trees omit it). Typecheck app.

**Step 5: Commit**

```bash
git add server/src/index/IndexManager.ts server/src/index/types.ts server/src/index/IndexManager.tree.test.ts
git commit -m "fix(index): study tree surfaces runs without an experiment (projectIds[] honored)"
```

---

### Task 7: Final verification

**Step 1:** Server gates

```bash
cd /home/brad/git/computable-lab/server && npx tsc --noEmit && npx vitest run 2>&1 | grep -E "Test Files|Tests "
```
Compare failure set to the baseline recorded in Task 1 Step 4 — must be identical modulo the new passing tests.

**Step 2:** App gates

```bash
cd /home/brad/git/computable-lab/app && npx tsc --noEmit && npx vitest run src/shared/api 2>&1 | tail -3
```

**Step 3:** Live data check (read-only)

```bash
grep -rn "studyId: EXP-" ~/.computable-lab/worktrees/main/records --include=*.yaml   # must be empty
grep -rL . /dev/null; grep -rl "studyId: STU-scratch" ~/.computable-lab/worktrees/main/records | wc -l   # 42, now resolvable
```

**Step 4:** Live browser (DOM-based; `browser_vision` is BROKEN on this profile — model rejects image input): load the Projects page, assert via `browser_console` that (a) the Scratch study node exists, (b) `RUN-2026-08-12-run-lm47` is visible under it even though it has no experimentId (acceptance proof for Task 6), (c) `RUN-first-run-xbzv` appears under the correct study.

**Step 5:** `git -C /home/brad/git/computable-lab status --short` clean; `git log --oneline -8`.

## Acceptance criteria

1. `POST /api/records` with `kind: run`, `studyId: 'EXP-…'` → 400 (Ajv pattern). Same for `projectIds: ['EXP-…']` and experiment `studyId: 'EXP-…'`.
2. A run with neither `studyId` nor `projectIds` → lint warning `run-has-parent-link` in the API response's lint section.
3. `STU-scratch` study record exists; all 42 referencing records resolve.
4. `RUN-first-run-xbzv.studyId` is a STU- id; no `studyId: EXP-*` anywhere in live records.
5. Projects tree: a run with no experimentId is visible under its study; a multi-project run is visible under every study in `projectIds[]`; experiment-nested runs unchanged.
6. Server + app typecheck clean; no new test failures vs baseline.

## Risks & tradeoffs

- **Pattern breakage of legacy ids:** if any LIVE record uses a study/experiment id not starting with STU-/EXP- (e.g. a UUID), the pattern change will block writes to it. Pre-flight before Task 1 Step 4: `grep -rh "^studyId:\|^experimentId:" ~/.computable-lab/worktrees/main/records --include=*.yaml | grep -v "STU-\|EXP-" | sort -u` — if non-empty, list the offenders and migrate them first (add as Task 1b).
- **Lint severity:** warning chosen deliberately (see Task 3 note) — an error would brick updates to the 14 scratch runs until the data fix lands.
- **Tree shape change is additive** (`runs` at study level) — old consumers ignore unknown keys; still typecheck the app.
- **Multi-actor repo:** re-verify `git status` + `git reflog` before every commit; stage only named files.
- **Embedded-git worktree:** data edits go through the API (auto-commit); do NOT hand-edit `~/.computable-lab/worktrees/main/records`.

## Open questions (answer before Task 4)

- STU-scratch: restore from git history (preferred — check first) or recreate as the default catch-all study? If Brad wants the 14 runs migrated into a real study instead, Task 4 becomes a data migration (14 run updates) — confirm which.
- Is `projectIds[]` currently written by ANY creation path, or only read? (`grep -rn "projectIds" server/src app/src | grep -v "projectIds\[0\]\|includes"` — if zero writers, Task 6's multi-study case is future-proofing; keep it (schema promises it) but note it.)
- P2 epic (cross-record `refExists` lint op + `POST /relationships`): schedule as its own planning session? Recommended — it's the true flattened-ownership build-out from the 2026-08-02 doc.
