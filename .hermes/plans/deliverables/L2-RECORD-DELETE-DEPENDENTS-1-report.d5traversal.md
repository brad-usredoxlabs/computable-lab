# L2-RECORD-DELETE-DEPENDENTS-1 — unit d5traversal (lane 2)

Worktree: /home/brad/cl-wt/L2-DELREFS-d5traversal-lane2
Branch: cl/lane2-delrefs-d5traversal-2315
Base: 250097fd57e47da7c4e52da3574b1d42545c72d9 (verified at STEP 0; tree clean)
Result: one shared traversal; both consumers delegate with an explicit policy;
neither consumer's observable output changed.

## Commits

- 20d07d6f delrefs d5traversal: pin both inverse-reference walkers (characterisation leg)
- 143ef4b1 delrefs d5traversal: one traversal, both consumers delegating with explicit policy

Final `git -c core.fileMode=false status --short` at exit: empty.

## Changed files (4, all owned)

- server/src/store/recordRefTraversal.ts (NEW, 103 lines) — `collectRefMatches(value, options)`.
  Emits `{ pointer, targetId, via: 'ref-object' | 'bare-string' }`. Options are a REQUIRED
  interface (`initialPointer`, `skipTopLevelKeys`, `includeBareStrings`,
  `descendIntoRefObjects`), all `readonly`, no defaults, no `undefined`-vs-absent site.
  Header documents, in one paragraph, the three options and the consumer whose legacy
  semantics each preserves, and records that the top-level-only `revisionRef` skip is
  deliberate and out of scope.
- server/src/store/recordRefTraversal.test.ts (NEW, 146 lines) — characterisation pins A–F.
- server/src/store/referenceCascade.ts — `collectAllRecordRefs` redirected to the shared
  traversal with `skipTopLevelKeys: ['revisionRef']`, `includeBareStrings: false`,
  `descendIntoRefObjects: false`, mapped back to `RawRef`. `RawRef`,
  `findRecordRefsInValue`, `findReferrers` and the sweep call sites untouched.
- server/src/api/handlers/RelatedRecordsHandlers.ts — `findRefFields` delegates with
  `skipTopLevelKeys: []`, `includeBareStrings: true`, `descendIntoRefObjects: true`,
  filters on `targetId`, maps to pointers. Signature unchanged; `export { findRefFields }`
  kept and IS used — the parity pins import it directly.

Prohibited files untouched: RecordDeleteReferences.test.ts, ReferenceCascadeSweep.test.ts,
schema/**, config/**, RecordStoreImpl.ts, RecordHandlers.ts, app/** (all clean in both
commits; only the four owned paths appear in `git show --stat`).

## Decisions

1. `initialPointer` added to the options object (fourth flag) because `findRefFields` keeps
   its 3-arg signature including `prefix`; the walk starts at that pointer. No consumer
   literal enters the walker — the only consumer-specific values are the option sets at the
   two call sites.
2. The walker is target-agnostic: with `includeBareStrings` it reports every string as a
   `bare-string` candidate and each consumer filters on `targetId`. This keeps the walker
   free of a targetId parameter, exactly as the brief's call-site expressions imply.
3. `skipTopLevelKeys` is matched against the EXACT pointer, reproducing
   `currentPath === 'revisionRef'`: top-level key skipped, nested `parent.revisionRef`
   still walked. Explicitly preserved and documented, not "fixed".
4. Pin G (a targetId-multiset assertion) was dropped as fully implied by pin F's exact
   deep-equality; output budget landed at 275 added lines (<= 280), 4 files.

## RED leg (characterisation, before any product change)

server/src/store/recordRefTraversal.test.ts, pinning today's `findRefFields` and
`findReferrers` output on one payload containing: nested ref object, bare string equal to
the target, top-level `revisionRef`, nested `parent.revisionRef`, array of refs.

```
 RUN  v1.6.1 /home/brad/cl-wt/L2-DELREFS-d5traversal-lane2/server
 ✓ src/store/recordRefTraversal.test.ts  (4 tests) 2ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```
Pinned outputs (unchanged after the refactor):
- findRefFields: resource, resource.id, note, revisionRef, revisionRef.id,
  parent.revisionRef, parent.revisionRef.id, items[0], items[0].id
- findReferrers (cascade): resource, parent.revisionRef, items[0]
  (no `.id` child, no bare string, no top-level revisionRef, nested revisionRef kept)

## VERIFY BEFORE EXIT (raw)

1) Targeted suites:

```
$ cd server && npx vitest run src/store/recordRefTraversal.test.ts \
    src/store/RecordDeleteReferences.test.ts src/store/ReferenceCascadeSweep.test.ts

 ✓ src/store/ReferenceCascadeSweep.test.ts  (5 tests) 4ms
 ✓ src/store/recordRefTraversal.test.ts  (6 tests) 7ms
 ✓ src/store/RecordDeleteReferences.test.ts  (10 tests) 135ms

 Test Files  3 passed (3)
      Tests  21 passed (21)
```
The two pre-existing suites contribute 10 + 5 = 15 passing, matching the 250097fd
baseline; the step-1 assertions in recordRefTraversal.test.ts are unchanged (only the
extra walker pins were appended, then one redundant pin removed).

2) Typecheck:

```
$ cd server && npx tsc --noEmit
error TS2688: Cannot find type definition file for 'semver'.
  The file is in the program because:
    Entry point for implicit type library 'semver'
TSC_EXIT=2
```
This is PRE-EXISTING and environmental, proven by stashing every change (`git stash -u`)
and re-running on pristine 250097fd: identical TS2688, `STASHED_TSC_EXIT=2`.
Cause: `server/node_modules/@types/semver/` is an empty directory (mtime Nov 10 12:31,
before this session) — a broken install artifact in this worktree. No installs were made
(prohibited). Typecheck of this change with the broken ambient type excluded:

```
$ cd server && npx tsc --noEmit --types node
TSC_NODE_TYPES_EXIT=0        (zero output lines)
```
Owner of the remaining blocker: environment/worktree provisioning (reinstall
`@types/semver`, or drop the empty dir). Not caused by, and not fixable within, this unit.

3) `git -c core.fileMode=false status --short` -> empty.

## MUTATION PROBE (pins are not vacuous)

Applied to recordRefTraversal.ts: `if (isRef && !options.descendIntoRefObjects) return;`
-> `if (isRef) return;` (force no descent into ref objects). Raw failure summary:

```
 ❯ src/store/recordRefTraversal.test.ts  (6 tests | 2 failed) 12ms
   ❯ ... pin A: keeps the ref object pointer, the .id child pointer, bare strings, and both revisionRefs
     → expected [ 'resource', 'note', …(3) ] to deeply equal [ 'resource', 'resource.id', …(7) ]
   ❯ ... pin E: related-record policy reproduces findRefFields pointers exactly
     → expected [ 'resource', 'note', …(3) ] to deeply equal [ 'resource', 'resource.id', …(7) ]

- Expected
+ Received
  Array [
    "resource",
-   "resource.id",
    "note",
    "revisionRef",
-   "revisionRef.id",
    "parent.revisionRef",
-   "parent.revisionRef.id",
    "items[0]",
-   "items[0].id",
  ]
 Test Files  1 failed (1)
      Tests  2 failed | 5 passed (7)
```
Reverted; re-ran the same file: `Tests 6 passed (6)`. `git status --short` clean before commit.

## Notes for the reviewer

- Behaviour parity is pinned at both levels: the endpoint helper (findRefFields) and the
  cascade consumer (findReferrers), including the divergent cases the reviewer called out
  (bare string, `.id` child pointer omitted by cascade, top-level vs nested revisionRef).
- `export { findRefFields }` is retained and is now exercised by
  recordRefTraversal.test.ts (pins A, B, E); it is not an unused export.
- No schema/config change; the walker is pure and imports no store, I/O or Ajv.

## Next actions

- Orchestrator: reload the lane stack only if a later unit touches YAML (none here).
- Adversarial review: read the two commits above; acceptance pin
  RecordDeleteReferences.test.ts and ReferenceCascadeSweep.test.ts are unmodified.
- Environment: fix the empty `server/node_modules/@types/semver` dir so plain
  `npx tsc --noEmit` can be the gate again.

L2-RECORD-DELETE-DEPENDENTS-1 UNIT 1 DONE 143ef4b17d05d24dec95f8fe44e887b8cbaef049
