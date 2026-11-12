# L2-ONTOLOGY-ANCHOR-SOURCES-1 — unit o6obo-fix1 (advc c1 FIX round: D1 BLOCKER + D2 pin) report

- worktree: /home/brad/cl-wt/L2-ONTOLOGY-o6obo-lane2 (branch cl/l2-ontology-o6obo-lane2)
- base: 9c96e437 (unit 1, structurally correct but NOT additive per advc c1)
- commits: a2d6b761 (RED + raw red) -> 1c0919b9 (D1 fix, body) -> this report commit

## Defect (D1, as briefed)

`matchesQuery` in providers/localObo.ts:156-161 let the DEFINITION arm answer
ordinary single-token nouns: the provider tokenizes on whitespace
(`searchLocalObo`, line 186), so "Material B" -> tokens ['material','b']; the
1-char token 'b' is a substring of virtually every English definition, so the
arm admitted junk (LWO:0000100, LEQ:0000149/184/187). The spine's `tokens()`
(ResolveSpine.ts:86) drops 1-char tokens for its OWN re-filter, but the
provider tokenized independently — the leak is in the provider, as the brief
diagnosed. Effect: resolve("Material B") returned 4 local-obo candidates and
the compiler flagged ambiguous-noun, flipping the green seeded drive to
needs-clarification. (The spine re-filter then keeps those 4 hits because the
spine token 'material' appears in every one of their definitions — a second
confirmation the junk must die at the source.)

## Fix (reviewer option (i), compliant route)

server/src/resolve/providers/localObo.ts — label/synonym arm BYTE-IDENTICAL;
the definition arm is now gated:

```ts
function definitionArmAllowed(tokens: string[]): boolean {
  return tokens.length > 1 && tokens.every((token) => token.length >= 3);
}

function matchesQuery(term: OboTerm, tokens: string[]): boolean {
  const lexical = `${term.label}\n${term.synonyms.join('\n')}`.toLowerCase();
  if (tokens.every((token) => lexical.includes(token))) return true;
  if (!definitionArmAllowed(tokens)) return false;
  const definition = term.definition?.toLowerCase();
  return Boolean(definition) && tokens.every((token) => (definition as string).includes(token));
}
```

This is exactly the briefed gate (multi-token AND every content token >= 3
chars); no cleaner equivalent was needed. Single-token and short-token
queries can NEVER match on definitions. Spine wiring at ResolveSpine.ts:173-175
and :272-275 untouched (verified: `git diff 9c96e437 --stat` on
ResolveSpine.ts/types.ts/config/app = empty).

## Changed files (this unit)

| file | change |
|---|---|
| server/src/resolve/providers/localObo.ts | +14: `definitionArmAllowed` gate (the fix) |
| server/src/resolve/providers/localObo.test.ts | +67/-4: header + tests (f)(g)(h) |
| server/src/resolve/ResolveSpine.test.ts | +13: import + D2 consumer pin |
| deliverables/o6obo-fix1-red.txt | raw RED receipts at base (item 1) |
| deliverables/L2-ONTOLOGY-ANCHOR-SOURCES-1-report.o6obo-fix1.md | this report |

On-disk only (not committed, git path not tracked):
server/.artifacts/o6obo-fix1-green.txt (raw green receipts), /tmp/green1.txt,
/tmp/green2.txt, /tmp/red1.txt.

## Verification — raw output per brief item

### 1. RED FIRST (captured at base 9c96e437, pre-fix — commit a2d6b761)

New tests RED (raw, from deliverables/o6obo-fix1-red.txt):
```
 Test Files  2 failed (2)
      Tests  3 failed | 17 passed (20)

 FAIL src/resolve/providers/localObo.test.ts > (f) ... single-token ... (D1)
  AssertionError: expected [ Array(2) ] to deeply equal []        ("sample")
 FAIL src/resolve/providers/localObo.test.ts > (g) ... short content tokens ... (D1)
  AssertionError: expected [ { curie: 'TST:0000010', …(5) } ] to deeply equal []   ("Material B")
 FAIL src/resolve/ResolveSpine.test.ts > D2 consumer pin ... (tier additive)
  AssertionError: expected [ …(20) ] to deeply equal []          ("sample" spine)
```

THE regression gate RED at base (raw, same receipt):
```
[D13-SEEDED-DRIVE] outcome: needs-clarification
[D13-SEEDED-DRIVE] clarifications: ["ambiguous-noun"]
 FAIL ... expected [ { label: 'Material B', …(3) } ] to deeply equal []
 (candidates: tier0 MAT-B + tier2 'autoclave','microscope','biosafety
  cabinet','labware' = LEQ:0000149/184/187 + LWO:0000100 via DEFINITION)
 Test Files  1 failed (1) / Tests  1 failed (1)
```

Fixture note: (f)/(g) use a tmp OBO (labels/synonyms never carry the query
tokens, definitions do — isolating the definition arm) PLUS the shipped
registry (searchLocalObo default registryPath), so both the mechanism and the
measured production regression ("sample" 36 def hits -> spine-capped 20;
"Material B" the 4 junk CURIEs) are pinned. (h) proves the arm still works:
'holding samples' (2 tokens, all >=3 chars) matches TST:0000010 ONLY via its
definition; 'deep well' still hits the shipped label/synonym surface.

### 2. Post-fix (item 2)
```
cd server && npx vitest run src/resolve/providers/localObo.test.ts src/resolve/ResolveSpine.test.ts
 ✓ src/resolve/providers/localObo.test.ts  (8 tests) 24ms
 ✓ src/resolve/ResolveSpine.test.ts  (12 tests) 17ms
 Test Files  2 passed (2)
      Tests  20 passed (20)
```
(baseline at HEAD was 11/11 spine + 5/5 provider = 16; now 12/12 + 8/8.)

### 3. THE regression gate (item 3) — GREEN
```
cd server && npx vitest run src/compiler/scientistIntent/wellsetSeededDrive.test.ts
[D13-SEEDED-DRIVE] outcome: complete
[D13-SEEDED-DRIVE] clarifications: []
[D13-SEEDED-DRIVE] mix count: 1 with computed_wells: 1
[D13-SEEDED-DRIVE] computed_wells: ["A1","A2","B1","B2","C1","C2","D1","D2","E1","E2","F1","F2","G1","G2","H1","H2"]
[D13-SEEDED-DRIVE] details: {"volume":75,"cycles":3,"labwareId":"LWI-1","wellColumns":[[...col1...],[...col2...]],"channels":8}
 ✓ src/compiler/scientistIntent/wellsetSeededDrive.test.ts  (1 test) 107ms
 Test Files  1 passed (1) / Tests  1 passed (1)
```

### 4. Consumer pin (D2)
ResolveSpine.test.ts: one new test resolves "sample" through a
createLocalOboProvider-backed spine vs a tier-off spine; asserts zero
local-obo candidates AND identical non-mint CURIE sets (base-equality).
RED at base (20 local-obo candidates), GREEN post-fix (item 2 run).
The 35-suite sweep remains the orchestrator's post-merge check, not run here.

### 5. Typecheck (item 5)
```
cd server && npx tsc --noEmit   -> exit 0 (no output)
```

### AC3 negatives
```
git diff 9c96e437..HEAD --stat
 deliverables/o6obo-fix1-red.txt               | 347 ++++++++++...
 server/src/resolve/ResolveSpine.test.ts       |  13 +
 server/src/resolve/providers/localObo.test.ts |  67 ++++-
 server/src/resolve/providers/localObo.ts      |  14 ++
 4 files changed, 440 insertions(+), 1 deletion(-)
```
ResolveSpine.ts, types.ts, config/ontology-sources.yaml, app/**: ZERO diff vs
9c96e437. The 11 baseline spine tests are the same 11 (all pass; the 12th is
the new D2 pin). No amend/rebase of 9c96e437.

## Decisions

- Used the briefed gate verbatim (multi-token + all tokens >=3 chars). A
  "drop tokens < 3 chars first" variant was rejected: it would silently
  re-route short-token queries to a 1-token definition match (e.g. "sample b"
  -> ["sample"] -> definition hits), violating AC2 ("single-token or
  short-token queries NEVER produce local-obo definition matches").
- "Material B" tokens are ['material','b'] (provider whitespace tokenization)
  — the gate fires on token 'b' (length 1). Verified by probe: HEAD 4 hits
  (LWO:0000100, LEQ:0000149/184/187) -> post-fix 0.
- Environment repair (NOT a scope change, recorded for the orchestrator):
  this worktree was missing the standard gitignored symlinks
  `server/schema -> ../schema` and `server/records -> ../records` (trunk +
  every sibling worktree has `server/schema`; without it the compiler gate
  test could not even load: "scientist-intent-vocabulary.yaml not found").
  Both symlinks were created; they are gitignored and untracked, so no repo
  bytes changed. If a fresh worktree hits the same wall, the launcher should
  recreate them.

## Acceptance status

- AC1: wellsetSeededDrive.test.ts GREEN at this HEAD (was RED at 9c96e437) —
  outcome `complete`, zero spurious clarifications.
- AC2: single-token/short-token queries never produce definition matches
  (tests f/g, fixture + shipped registry); multi-token content queries keep
  definition reach (test h, definition-only hit pinned).
- AC3: spine tier code byte-identical to 9c96e437; no app/** or YAML bytes
  changed; existing 11 spine tests unaffected (all 11 pass).

## Next actions (orchestrator)

- Reload the lane stack before any live verification (provider behavior
  changed; no YAML/config change).
- Post-merge: run the 35-suite sweep (this unit ran only brief items 1-5).
- LWO picker visibility leg remains a separate later unit (no app work here).

L2-ONTOLOGY-ANCHOR-SOURCES-1-o6obofix1 UNIT unit DONE 0acda131854d01feee4fc2ede56f1a2db3d653d3
