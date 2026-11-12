# L2-JOURNEY-PORTS-1 — unit u1vocab-fix1 (closing two one-way pins)

Worktree: /home/brad/cl-wt/L2-JOURNEY-PORTS-u1vocab-lane2
Branch: cl/lane2-journeyports-u1vocab-2249
Base: a70c76e2

## Scope

Adversarial review c1 (VERDICT: FIX 2, no blocker/major). Closed exactly D1 and D2 in
`server/src/schema/JourneyPortSchema.test.ts`. No shipped schema change, no src change,
no other test file, no vocabulary string literals introduced (all new assertions derive
from `doc()` / `propertiesOf()` / `requiredOf()`).

## D1 — root document closedness was unpinned

Deleting root `additionalProperties: false` from the shipped YAML left the suite 9/9 green.
Added at the end of the existing closed-object test (`declares every port as a closed
object...`), after the PORT_DEFS loop:

```ts
// The ROOT container is closed too and carries no payload shape of its own:
// a caller addresses a port by $ref, never validates a bare root document.
expect(doc().additionalProperties, 'root.additionalProperties').toBe(false);
expect(Object.keys(doc().properties ?? {}), 'root payload properties').toHaveLength(0);
```

Supporting type widening only: `DocSchema` gained `additionalProperties?` / `properties?`
(it previously declared `$defs?` only), mirroring `DefSchema`. No runtime behaviour change.

## D2 — committed-vs-staged rule derived only one way

`committedOnly` is computed as committed-minus-staged, so a committed-only field ADDED to
staged shrank the forbidden set silently. Added the reverse derivation inside the same
(`refuses a staged draft carrying committed-record properties`) test, before the existing
loop; the existing assertions are unchanged:

```ts
const sharedProps = propertiesOf(committed).filter((key) => stagedProps.has(key));
const sharedRequired = requiredOf(committed).filter((key) => requiredOf(staged).includes(key));
expect(sharedRequired.length, 'the single shared required field (version)').toBe(1);
expect(sharedProps, 'staged and committed share only that field').toEqual(sharedRequired);
```

The two families may therefore intersect in exactly the one shared required field
(`version`); any committed-only name appearing on staged goes RED.

## Verification

Baseline (tree at a70c76e2, before edits), from `<wt>/server`:

    npx vitest run src/schema/JourneyPortSchema.test.ts
     ✓ src/schema/JourneyPortSchema.test.ts  (9 tests) 340ms
     Test Files  1 passed (1)
          Tests  9 passed (9)

After edits (same command):

     ✓ src/schema/JourneyPortSchema.test.ts  (9 tests) 338ms
     Test Files  1 passed (1)
          Tests  9 passed (9)

Typecheck (`npx tsc -p tsconfig.json --noEmit`, server): exit 0.

## Mutation probes (run, then reverted; never committed)

### (a) root `additionalProperties: false` removed from schema/workflow/journey-port.schema.yaml

     ❯ src/schema/JourneyPortSchema.test.ts  (9 tests | 1 failed) 458ms
       ❯ ... > declares every port as a closed object, so extra properties are refused
         → root.additionalProperties: expected undefined to be false // Object.is equality
     FAIL  ... declares every port as a closed object, so extra properties are refused
     AssertionError: root.additionalProperties: expected undefined to be false
     Tests  1 failed | 8 passed (9)

### (b) `receipt_id` added to StagedDraftReference properties + required

     ❯ src/schema/JourneyPortSchema.test.ts  (9 tests | 1 failed) 357ms
       ❯ ... > refuses a staged draft carrying committed-record properties (closed shape)
         → the single shared required field (version): expected 2 to be 1
     FAIL  ... refuses a staged draft carrying committed-record properties (closed shape)
     AssertionError: the single shared required field (version): expected 2 to be 1
     Tests  1 failed | 8 passed (9)

### (b') properties-only variant (`receipt_id` on staged properties, not required)

Exercises the `sharedProps` equality line specifically:

     ❯ src/schema/JourneyPortSchema.test.ts  (9 tests | 1 failed) 336ms
       ❯ ... > refuses a staged draft carrying committed-record properties (closed shape)
         → staged and committed share only that field: expected [ 'version', 'receipt_id' ]
           to deeply equal [ 'version' ]
     Tests  1 failed | 8 passed (9)

Both probes reverted with `git checkout -- schema/workflow/journey-port.schema.yaml`;
tree after revert contained only the test-file change (`git status --porcelain` → single
`M server/src/schema/JourneyPortSchema.test.ts`).

## Commits

- cff3904d6d70235686f7a1a8c8d4b423e0215d7d — test file only (2 files not touched)
- this report commit — report + marker

Diff size: 1 file changed, 19 insertions(+), 4 deletions(-) (budget 40 lines / 1 file).

## Next actions / notes

1. Reviewer: confirm the D1 pin lives on the ROOT (not per-port) and that D2's shared set
   is derived, with no field-name literal in TS.
2. The shipped schema YAML is intentionally untouched, so no lane-stack reload is needed
   for this unit (test-only change).
3. Adversarial c1's D1/D2 are the whole scope; nothing else in the file was modified.

L2-JOURNEY-PORTS-1 UNIT u1vocab-fix1 DONE cff3904d6d70235686f7a1a8c8d4b423e0215d7d
