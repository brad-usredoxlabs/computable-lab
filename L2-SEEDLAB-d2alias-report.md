# L2-SEED-LABLOCAL-1 UNIT d2alias — Report

Worktree: /home/brad/cl-wt/L2-SEEDLAB-d2alias-lane2
Branch: cl/lane2-seedlab-d2alias-2205 (base b854c18c6bf60224ad92713c44f24b7c9fa085dd)
Item: L2-SEED-LABLOCAL-1-d2alias (unit d2alias, D2 leg of
.hhermes/plans/decisions/RESERVOIR-SHAPE-AND-SPEC-SHEET-INGEST-l2-20261109.md — path is
`.hermes/plans/decisions/RESERVOIR-SHAPE-AND-SPEC-SHEET-INGEST-l2-20261109.md`)

## Decisions
- One shared module-level helper pair (`declaredAliasKeys`, `resolveByAlias`) used by BOTH
  factories, so `createRegistryLoader` and `createAggregateRegistryLoader` cannot drift.
- Keys are collected from `platform_aliases[].alias` and `legacy_labware_types[]`, compared with
  exact `===`; no prefix/fuzzy, no allow-list, no domain terms in the resolver.
- >1 match throws `[registry:<kind>] ambiguous alias "<alias>" claimed by N entries: id1, id2`
  with ids sorted; 0 matches -> undefined; 1 -> that entry.
- Optional fields read defensively with `Array.isArray` + `typeof`; no `as any`, no assignment of
  undefined into optional properties (`exactOptionalPropertyTypes` clean).
- Ambiguity is tested only through fresh temp-dir loaders, never the module singleton.
- `get()`, `list()`, `reload()`, `getBySource()` untouched.

## Changed files (3; ~60 changed lines)
- server/src/registry/RegistryLoader.ts — doc comment + shared exact-match/ambiguity resolver in
  both factories.
- server/src/registry/RegistryLoader.test.ts — TestSpec/schema extended with the two optional key
  fields; 2 new tests (ambiguity refusal naming alias + both ids; legacy-only key resolution).
- server/src/registry/LabwareDefinitionRegistry.test.ts — 1 new assertion: `getByAlias('reservoir')`
  is undefined (existing `reservoir_25ml_single` pin kept green).

## Commits
- 98d150799d4cfb326ffcc4faae2a545b0245c75b test(registry): RED for ... d2alias
- 4431e84eb05b0d2fe6123432de36415a8d9c72d6 fix(registry): ... exact alias match + ambiguity
- f4cb3b2bc807eeabad0e96ca331cef36e0c74492 test(registry): ... family word reservoir must not resolve
(plus a docs report commit after this file)

## RED (trunk-first, before the fix)
`cd server && npx vitest run src/registry/RegistryLoader.test.ts`
  FAIL  ... getByAlias throws a named ambiguity error when two entries claim the same alias
  AssertionError: expected undefined to be an instance of Error
  FAIL  ... getByAlias finds keys declared only in legacy_labware_types (exact match)
  AssertionError: expected undefined to be 'legacy_entry'
  Test Files  1 failed (1)
       Tests  2 failed | 7 passed (9)

## GREEN (after the fix)
`cd server && npx vitest run src/registry/RegistryLoader.test.ts src/registry/LabwareDefinitionRegistry.test.ts`
  RUN  v1.6.1 /home/brad/cl-wt/L2-SEEDLAB-d2alias-lane2/server
   ✓ src/registry/RegistryLoader.test.ts  (9 tests) 19ms
   ✓ src/registry/LabwareDefinitionRegistry.test.ts  (16 tests) 29ms
   Test Files  2 passed (2)
        Tests  25 passed (25)
  VITEST_EXIT=0
(baseline on b854c18c was 22 passed; +3 new tests)

`cd server && npx tsc --noEmit`
  TSC_EXIT=0 (no output)

`git -c core.fileMode=false status --short`
  (empty) — clean tree.

## Notes / non-defects
- The repo tracks two .pyc files under .hermes/plans/harness/l2-suite-a/lib/__pycache__/ that get
  rewritten whenever the suite tooling is exercised; they were restored with `git checkout --`
  before exit and are not part of this change.
- The launcher-created `app/node_modules` / `server/node_modules` symlinks were added to the local
  (untracked) .git/info/exclude so `git status` reports the tree clean; nothing tracked changed.
- A full `npx vitest run` (whole server suite) exceeded the 5-minute cell budget and was abandoned;
  the brief requires only the targeted run, which is green. No assertion was weakened.

## Next actions
- Adversarial review of the two factories + message text.
- Orchestrator: no blockers; nothing pending on the coder.

L2-SEEDLAB-LABLOCAL-1-d2alias UNIT d2alias DONE f4cb3b2bc807eeabad0e96ca331cef36e0c74492
