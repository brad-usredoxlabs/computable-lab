# L2-GC-PEAK-NAMING-1-u2data — data leg: FAME-LOCAL methyl-ester terms (GC gate r1 T2-4)

Worktree: /home/brad/cl-wt/L2-GC-PEAK-NAMING-1-u2data-lane2
Branch: cl/lane2-peaknaming-u2data-l2t2661
Base: 97cb9cd5fb735ba6ef5f06911e1959d2d9b72157
Tier: routine; decision GC-ANALYSIS-IS-CL-SURFACE-l2-20261114.md

## What changed
1. `schema/registry/ontology-terms/fame-local.yaml` — APPEND ONLY, +40 lines, 0 deletions:
   four `ontology-term` entries after the existing `FAME-LOCAL:methyl-palmitate-n16` block:
   - `FAME-LOCAL:methyl-myristate-n14`      CHEBI:89199  CAS 124-10-7   chain 14:0
   - `FAME-LOCAL:methyl-pentadecanoate-n15` CHEBI:142657 CAS 7132-64-1  chain 15:0
   - `FAME-LOCAL:methyl-heptadecanoate-n17` CHEBI:136920 CAS 1731-92-6  chain 17:0
   - `FAME-LOCAL:methyl-arachidate-n20`     CHEBI:143582 CAS 1120-28-1  chain 20:0
   Values are the orchestrator-verified identities from the brief verbatim; nothing invented.
   Existing n6/n8/n10/n16 methyl esters and the FFA terms are untouched (verified: 0 deleted lines).
2. `server/src/registry/FameCompoundClassResolvability.test.ts` (new) — loads
   `fame-medium-chain.yaml` + `fame-local.yaml` via js-yaml with the same
   `fileURLToPath/__dirname` path idiom as `FameCompoundClass.test.ts`, collects every
   `kind: ontology-term` id from the term registry, and asserts the candidate id set has
   no member missing from it. Test name: 'every fame-medium-chain candidate resolves to a
   FAME-LOCAL ontology term'.

Note on history: the test file first landed in the launcher's `WIP AT EXIT` commit
5a2569831 from an earlier run of this unit. This run fixed a defect in it: the id
collector walked arrays only and never descended into the registry's root mapping
(`{source, terms: [...]}`), so it reported all 8 candidates missing. With the descent added
it reported exactly the 4 genuinely-missing ids, which is the RED this unit required.

## Verification (run in this worktree, on the committed tree)

RED — before the YAML entries (test commit ed9ac3835, HEAD 417b155f8's parent):
```
$ cd server && npx vitest run src/registry/FameCompoundClassResolvability.test.ts
- Array []
+ Array [
+   "FAME-LOCAL:methyl-myristate-n14",
+   "FAME-LOCAL:methyl-pentadecanoate-n15",
+   "FAME-LOCAL:methyl-heptadecanoate-n17",
+   "FAME-LOCAL:methyl-arachidate-n20",
+ ]
 Test Files  1 failed (1)
      Tests  1 failed (1)
```

GREEN — after the YAML entries (HEAD 417b155f89ee6dd40b35acc05781351281b537a2):
```
$ cd server && npx vitest run src/registry/FameCompoundClassResolvability.test.ts
✓ src/registry/FameCompoundClassResolvability.test.ts  (1 test) 5ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

Regression — existing class test stays green:
```
$ cd server && npx vitest run src/registry/FameCompoundClass.test.ts
✓ src/registry/FameCompoundClass.test.ts  (3 tests) 2ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

YAML parse:
```
$ cd server && node -e "require('js-yaml').load(require('fs').readFileSync('../schema/registry/ontology-terms/fame-local.yaml','utf8')); console.log('YAML-OK')"
YAML-OK
```

Typecheck:
```
$ cd server && npm run typecheck
> tsc --noEmit        (exit 0, no output)
```

Append-only check: `git diff --stat -- schema/registry/ontology-terms/fame-local.yaml`
→ `1 file changed, 40 insertions(+)`; `git diff | grep '^-' | wc -l` → `0`.

## Acceptance map
- AC1 (four exact-value ontology-term entries present alongside the existing four) — met,
  see diff above; values match BEDROCK 2 field for field.
- AC2 (test asserts EVERY candidate resolves; passes) — met, GREEN above; RED listed
  exactly the four ids that were absent.
- AC3 (FameCompoundClass.test.ts green; YAML parses; existing entries unchanged) — met,
  3/3 pass, YAML-OK, 0 deletions.

## Scope discipline
Touched only the two owned paths. `fame-medium-chain.yaml`, `records/**`, `schema/lab/**`,
`app/**` untouched; no material records authored; resolver untouched.

## Commits
- ed9ac3835 test(red) — cross-check test (incl. the collector fix described above)
- 417b155f8 data — the four FAME-LOCAL ontology terms
- (this report + marker)

## Next action / handoff
Orchestrator must reload the lane stack before any live verification (YAML change).
Remaining blocker: none for this leg. Parent L2-GC-PEAK-NAMING-1 remains open — other legs
(u1 KEYS, u3 mapping/UI) are outside this unit; acceptance of the parent is not claimed here.

L2-GC-PEAK-NAMING-1-u2data UNIT L2-GC-PEAK-NAMING-1-u2data DONE b80f3c0eb2a100ab4638ab7503dc6aa35647d377
