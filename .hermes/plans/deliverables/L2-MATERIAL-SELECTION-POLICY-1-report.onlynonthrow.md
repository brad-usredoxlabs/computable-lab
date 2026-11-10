# L2-MATERIAL-SELECTION-POLICY-1 — unit onlynonthrow

Lane 2 · worktree /home/brad/cl-wt/L2-MATSEL-onlynonthrow-lane2
Branch cl/lane2-matsel-onlynonthrow-2041 · base d2f7c08e

## Ruling (why)
D2 cross-record `only` uniqueness is DESCOPED — task-list.md:18442 verbatim:
"D2 cross-record ONLY-uniqueness is DESCOPED - no uniqueness lint, no load-path
guard, no test asserting two 'only' rows fail; do not dispatch another unit to
chase it". item text task-list.md:18477-18478: such a record "loads, validates
and is served without error - and nothing further happens".

The shipped `guardDuplicateOnlyPolicies` (policy.ts:111) threw `PolicyGuardError`
and the loader rethrew it (policy.ts:170), rejecting `getMaterialSelectionPolicies()`.
That promise is awaited bare inside `Promise.all` at four resolver sites
(resolvers.ts:119/237/263/285), so a legal duplicate `only` pair rejected the whole
material-resolution leg — the opposite of "nothing further happens". The picker's
own fail-open (clarifyPickerRanking.ts:474-477) was unreachable.

This unit DELETES enforcement. It adds no lint, warning, metric or replacement guard.

## Changed files (3, allowed scope)
- `app/src/shared/taptab/slashMenu/policy.ts`
  - deleted `PolicyGuardError` class, `guardDuplicateOnlyPolicies`, its call in the
    payload mapper and in `__setMaterialSelectionPolicies`;
  - collapsed `.catch` to the plain fail-open (`selCache = []; return []`) — a genuine
    fetch failure still never fabricates;
  - updated the module docblock to state duplicate `only` is legal and unenforced;
  - payload-shape filter (kind / only|default|alternative checks) left byte-unchanged.
- `app/src/shared/taptab/slashMenu/clarifyPickerRanking.ts` — COMMENT TEXT ONLY:
  the docblock no longer claims the server rejects the duplicate state, and the
  fail-open branch comment says the pair is legal. No executable line changed.
- `app/src/shared/taptab/slashMenu/clarifyPickerRanking.test.ts`
  - removed the `PolicyGuardError` import;
  - rewrote the two duplicate-only describes to assert the ruled behaviour:
    seeding does not throw and serves both records; the fetch path resolves with 2;
    `applySelectionPolicies` returns every row with none `preselected: true`.
  - the three unchanged guard-adjacent cases (single `only`, different concepts,
    `only`+`default`) still assert no-throw and remain green.

Server code, schema, types.ts and every other slashMenu file untouched.

## Verification (raw)
RED against unchanged product code:
```
 Tests  2 failed | 31 passed (33)
 FAIL ... u2fix4 D2 ... __setMaterialSelectionPolicies accepts two only policies ...
      → expected [Function] to not throw an error but 'Error: Duplicate \'only\' selection ...'
 FAIL ... u2fix5 ... fetch path with duplicate only policies RESOLVES ...
      → promise rejected "Error: Duplicate 'only' selection for mat…" instead of resolving
   ❯ guardDuplicateOnlyPolicies src/shared/taptab/slashMenu/policy.ts:125:13
```

GREEN:
```
cd app && npx vitest run src/shared/taptab/slashMenu/clarifyPickerRanking.test.ts
 Test Files  1 passed (1)
      Tests  33 passed (33)
   Duration  1.81s
```

Typecheck `cd app && npx tsc -p . --noEmit 2>&1 | grep -c "error TS"`:
before (product code unchanged) = 0; after = 0. No diagnostic names
`slashMenu/policy.ts` or `slashMenu/clarifyPickerRanking`.

Mutation probe (alone, immediately before the fail-open `return rows`):
`if (onlyCount > 1) throw new Error('dup')` →
```
 FAIL ... fail-open — two only policies for the same concept leaves list unchanged
 FAIL ... u2fix4 D2 ... applySelectionPolicies fails open ...
      Tests  2 failed | 31 passed (33)
```
Reverted; `git -c core.fileMode=false status --short` showed no product path from the probe.

Reviewer-bait pre-empts:
1. Not re-opening D2: the ruling names "no load-path guard"; deleting the guard removes
   enforcement rather than adding it.
2. Silence is the ordered behaviour (no warn/metric substitution).
3. The picker fail-open block is untouched and proven by the new `applySelectionPolicies`
   leg (`toHaveLength(rows.length)`, none preselected).
4. `grep -rn 'PolicyGuardError\|guardDuplicateOnlyPolicies' app/src` → 0 hits.
5. No server edit; `normalizeMaterialSelectionPolicies` has no caller outside its test.
6. Payload-shape filter unchanged (visible in diff).
7. clarifyPickerRanking.ts diff contains only comment hunks.

L2-MATERIAL-SELECTION-POLICY-1 UNIT onlynonthrow DONE d07506b3b00f043b9d9a27feb155e107c2093ba6
