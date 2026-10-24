# CFG-UNION-1 — LANE 2 report (l2t0810)

Task: deepMerge unions array-valued config keys (Brad ruling (b)): an explicit
config array may never silently drop DEFAULT_CONFIG entries.
Worktree: /mnt/vast/home/brad/git/wt/CFG-UNION-1-lane2-l2t0810
Branch: cl/lane2-cfg-union-1-l2t0810 (off cl/integration-2 trunk tip 8e376c0f — verified at dispatch)
Commit: d7017b90 "feat(config): CFG-UNION-1 — deepMerge unions array-valued config keys with dedup (Brad ruling (b))"
Diff: 2 files changed, 144 insertions(+), 0 deletions — loader.ts + loader.test.ts only. No pins rewritten.

## What changed

server/src/config/loader.ts:
- New `unionArrays<T>(target, source)` helper: DEFAULT (target) entries first in
  their order, then config (source) entries not already seen, dedup preserving
  first occurrence.
- `deepMerge` gains an explicit array branch: when BOTH target and source values
  are arrays, the result is `unionArrays(target, source)` instead of falling to
  the else and REPLACING. Non-array override semantics unchanged. Recursion
  into object keys is unchanged, so nested array keys (server.cors.origins)
  union too.

server/src/config/loader.test.ts:
- New describe block "array union semantics (CFG-UNION-1, Brad ruling (b))"
  with 5 tests (RED-first). 12 pre-existing tests untouched.

## RED-first evidence

Baseline pre-edit (cwd=server):
```
$ npx vitest run src/config --reporter=basic
 ✓ src/config/loader.test.ts  (12 tests) 25ms
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

RED (new tests against unmodified loader — replace semantics proven):
```
$ npx vitest run src/config --reporter=basic
 FAIL ... a partial appendOnlyKinds list still yields every DEFAULT_CONFIG entry post-load
 FAIL ... unions a partial appendOnlyKinds list DEFAULT-first and dedups repeated defaults
 FAIL ... an explicit empty appendOnlyKinds list cannot drop the defaults
 FAIL ... revisionOnEditKinds unions too (same data-knob pattern)
 FAIL ... nested array key server.cors.origins unions with the default
 Test Files  1 failed (1)
      Tests  5 failed | 12 passed (17)
```
Failure output confirms the defect exactly, e.g.:
```
AssertionError: expected [ 'custom-revision-kind' ] to deeply equal [ 'extraction-draft', …(1) ]
AssertionError: expected [ 'https://mylab.org' ] to deeply equal [ '*', 'https://mylab.org' ]
```
(the config array REPLACED the default array).

GREEN after the loader fix:
```
$ npx vitest run src/config --reporter=basic
 ✓ src/config/loader.test.ts  (17 tests) 29ms
 Test Files  1 passed (1)
      Tests  17 passed (17)
```

New tests cover:
1. Partial `appendOnlyKinds: [attestation]` post-load yields ALL five
   DEFAULT_CONFIG entries (audit-event, signature, vendor-protocol-candidate,
   attestation, material-receiving) — the twice-proven live defect, now pinned.
2. DEFAULT-first order + dedup: config naming `audit-event` twice yields it
   exactly once; config-only entry appended after defaults.
3. Explicit `appendOnlyKinds: []` cannot drop the defaults (ruling (b): an
   explicit array may never silently drop DEFAULT entries).
4. `revisionOnEditKinds` unions too (same data-knob pattern).
5. Nested array: `server.cors.origins` unions `['*', 'https://mylab.org']`
   (deepMerge recursion covers nested arrays).

## Typecheck

```
$ npx tsc -p .   (cwd=server, HEAD d7017b90)
exit 0, 0 lines of output
```
Base proof (detached checkout of 8e376c0f in the same worktree, same symlink
environment): `npx tsc -p .` exit 0, 0 lines. => zero new errors.

Environment note (disclosed, not a code change): the fresh worktree was
created WITHOUT the 54 sibling-lane symlinks that cl-integration-2 carries
(materialRefFields.ts, BypassAudit.ts, AuthoringGuard.ts, RunStartGateService.ts,
materializeBranchCandidate.ts, labwareDefinitionSearch.ts, clarificationLoop.ts,
etc. — all lane-excluded paths per
/home/brad/.hermes/cl/lanes/2/lane-exclude-a6fix-l2t0430). Without them the
first `tsc -p .` run showed 29 pre-existing TS2307 "Cannot find module" lines
at BOTH base and edit (identical, diff empty). I restored the same 54 symlinks
(pointing at /mnt/vast/home/brad/git/computable-lab, read-only references —
main was never touched), mirroring sibling lane worktrees
(MATRES-CHAIN-fix2-lane2-l2t0810, SPINE-7-lane2-l2t0810 each carry 43+).
With them, base AND head typecheck exit 0. Symlinks are git-excluded;
`git status --porcelain` stays clean.

## Adjacent suites (union semantics touch the append-only wall consumers)

```
$ npx vitest run src/scripts/applyOwnershipDefaults.test.ts src/store/RecordStore.test.ts src/store/AppendOnlyWall.attestation.test.ts --reporter=basic
 ✓ src/scripts/applyOwnershipDefaults.test.ts
 ✓ src/store/RecordStore.test.ts  (49 tests)
 ✓ src/store/AppendOnlyWall.attestation.test.ts  (4 tests)
 Test Files  3 passed (3)
      Tests  58 passed (58)
```

## REPLACE-RELIANCE AUDIT

Every array-valued key in DEFAULT_CONFIG / DEFAULT_REPO_CONFIG (types.ts) and
every consumer found by grep (non-test .ts), with verdict:

| key | default site | consumer (file:line) | verdict |
|-----|--------------|----------------------|---------|
| server.appendOnlyKinds | types.ts:535 | server.ts:532 (`?? DEFAULT_APP_CONFIG...` fallback) | union-safe |
| server.appendOnlyKinds | types.ts:535 | server.ts:784 getAppendOnlyKinds (`?? DEFAULT` fallback) | union-safe |
| server.appendOnlyKinds | types.ts:535 | scripts/migrateRecordLifecycles.ts:347 (`?? DEFAULT` fallback) | union-safe |
| server.appendOnlyKinds | types.ts:535 | store/RecordStoreImpl.ts:274, :957 (spreads `...(config.appendOnlyKinds ?? [])` onto hardcoded base list — additive) | union-safe |
| server.appendOnlyKinds | types.ts:535 | api/handlers/RecordHandlers.ts:949, :1492 (same additive spread via getAppendOnlyKinds) | union-safe |
| server.revisionOnEditKinds | types.ts:536 | server.ts:787 getRevisionOnEditKinds (`?? DEFAULT` fallback) | union-safe |
| server.revisionOnEditKinds | types.ts:536 | api/handlers/RecordHandlers.ts:1241-1243 (`.includes(editedKind)` membership test) | union-safe |
| server.cors.origins (nested) | types.ts:526 | NONE — server.ts:733-736 hardcodes `origin: true` and never reads config.server.cors | union-safe (dead key — see surfaced defect D1) |
| repositories (RepositoryConfig[]) | types.ts:542 (`[]`) | loader.ts:763 passthrough `.map(applyRepoDefaults)` — never deepMerge'd against DEFAULT (DEFAULT is `[]`); per-repo merge uses DEFAULT_REPO_CONFIG which has NO array keys | unaffected by change |
| storageDevices | types.ts:543 (`[]`) | loader.ts:764 passthrough `?? []` — never deepMerge'd | unaffected by change |
| ontology.localOntologies | NO default in DEFAULT_CONFIG | loader.ts:788-790 passthrough (bypasses deepMerge); ResolveSpine.ts:173; resolve/providers/oak.ts:43-45 | unaffected by change (see surfaced defect D2) |
| DEFAULT_REPO_CONFIG | types.ts:560-577 | namespace/jsonld/sync/records — no array-valued keys exist | n/a |

(Workspace.modified/staged/untracked at types.ts:629-633 are runtime status
types, not config keys — out of scope.)

REPLACE-RELIANT CONSUMERS FOUND: NONE. Every consumer is a membership test
(`.includes(kind)`) or an additive spread onto a hardcoded base list, with a
`?? DEFAULT` fallback. No consumer expects an explicit config array to REMOVE
default entries. No sibling fix was needed; loader-only change shipped.

## Latent defects SURFACED (not changed — per task constraint)

D1. server.cors.origins is a DEAD config key. DEFAULT_CONFIG ships
    `cors.origins: ['*']` (types.ts:526) and config.example.yaml documents
    restricting origins, but server.ts:733-736 registers @fastify/cors with a
    hardcoded `origin: true` and never reads `config.server.cors` at all. A
    deployment restricting origins gets no restriction. Union now applies to
    the key (test 5 pins it), but the key has no effect until a consumer is
    wired. Owner call: orchestrator/architect (server.ts is not in my scope).

D2. ontology.localOntologies bypasses the layering machinery AND has its
    default as a TS literal: loader.ts:788-790 passes the ontology block
    through without deepMerge, and resolve/providers/oak.ts:14 hardcodes
    `DEFAULT_LOCAL_ONTOLOGIES = ['chebi','go','ncit','uberon','ncbitaxon','bto']`
    in TypeScript. "Things that can be data should be data" says this default
    belongs in DEFAULT_CONFIG.ontology (where union would then apply). Not a
    replace-reliant consumer; surfaced for an architect decision.

D3. Stale doc comment: types.ts:383-384 says of appendOnlyKinds "an empty or
    absent list simply leaves those kinds unprotected." Under ruling (b) an
    explicit empty list now CANNOT drop the defaults (test 3 pins this). The
    comment contradicts the shipped semantics. types.ts is outside my file
    scope; flagged for the orchestrator/architect to amend.

D4. Semantic consequence of ruling (b), stated plainly: config arrays are now
    ADDITIVE ONLY — a deployment cannot remove a default kind (e.g. drop
    'signature' from appendOnlyKinds) via config. Removal would need a future
    explicit opt-out mechanism. This is the ruling's intent (safety property is
    monotone), but it is a behavior change for any hypothetical
    removal-seeking config; none exists in the audited trees.

## Verify checklist (all run)

- [x] Baseline `npx vitest run src/config --reporter=basic` recorded pre-edit: 12/12 green.
- [x] RED: 5 new tests fail against unmodified loader (replace semantics proven in failure output).
- [x] GREEN: 17/17 green post-fix; 12 pre-existing tests unchanged (diff: 144 insertions, 0 deletions — no pins rewritten).
- [x] `npx tsc -p .` cwd=server exit 0 at HEAD; base (detached 8e376c0f, same env) exit 0 — zero new errors.
- [x] Adjacent suites (RecordStore, AppendOnlyWall.attestation, applyOwnershipDefaults): 58/58 green.
- [x] Commit d7017b90; `git -c core.fileMode=false status --porcelain` CLEAN (empty output).
- [x] No push, no stack touched, nothing dispatched. End-to-end PUT-tamper re-prove on the lane stack is the orchestrator's post-merge duty.

## Assumptions recorded

- "Nested-array case if the loader supports nesting" — it does (deepMerge
  recurses via the object branch); covered by test 5 (server.cors.origins).
- DEFAULT-first union order applied to EVERY array key the merge reaches
  (ruling (b) is about array values in deepMerge, not appendOnlyKinds alone);
  revisionOnEditKinds and cors.origins tests pin this.
- repositories/storageDevices/ontology blocks are loader passthroughs today;
  making them deepMerge-merged is a layering change beyond this task's scope
  (surfaced as D2 context, not done).

STATUS: complete
