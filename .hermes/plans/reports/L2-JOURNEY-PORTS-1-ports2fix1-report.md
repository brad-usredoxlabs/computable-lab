# L2-JOURNEY-PORTS-1 / ports2fix1 — test-only mutation teeth

Worktree: /home/brad/cl-wt/L2-JOURNEY-PORTS-ports2-lane2
Branch: cl/lane2-journey-ports-ports2-0630, base 87804ff5
Unit: 1 of 1. Scope: server/src/compiler/journey/ports.test.ts ONLY.
No production change: `git diff 87804ff5..HEAD -- server/src/compiler/journey/ports.ts` is empty.

## Changes (40 insertions, 1 deletion, 1 file)

D1 (M7 — producer-layer interpolation had no teeth):
- REJECTIONS (a) needles `['material', 'material-instance']` -> `['declares material:', 'material-instance']`.
  `declares material:` is the word+colon fragment only `${producer.provenance_layer}`
  can emit for this fixture (producer layer 'material'); it is NOT a substring of
  'material-instance', so prose without the interpolation cannot satisfy it.
- REJECTIONS loop now also deep-equals `result.diagnostic.producer_port` and
  `result.diagnostic.consumer_port` to the exact input ports (ports.ts:67 reject()
  carries both — verified before relying on it).

D2a (M12 — blank-receipt arm):
- New rejection leg: producer `receipt_id: '   '` (whitespace-only), record REC-2,
  expects `committed_reference_without_receipt` with needles `receipt_id`, `REC-2`.
  Note: the brief wrote `receiptId: '   '`; the interface field is `receipt_id`
  (ports.ts:39), so the camelCase spelling made `receipt_id` undefined and the leg
  still passed under M12. Fixed in commit 2; reversible detail resolved from code.

D2b (M11 — `labware_reference === undefined` arm):
- New rejection leg: consumer `{ port_type: 'LabwareDefinitionReference' }`
  (labware_reference omitted), producer labware-instance LBI-2 with receipt,
  expects `labware_instance_for_definition_requirement` with needles
  `labware-instance`, `LBI-2`.

Third leg (count + direction guard):
- Positive control: consumer `{ port_type: 'CommittedRecordReference',
  labware_reference: 'instance' }` accepts a labware-instance producer, pinning
  that rule 3 fires on definition only. Keeps the file at 12 tests (9 baseline +
  3 legs) as the brief's verify line states.

## Verification (measured, this worktree)

- `cd server && npx vitest run src/compiler/journey/ports.test.ts`
  - baseline at 87804ff5: 9 passed (9)
  - after: 12 passed (12)
- `cd server && npx tsc --noEmit` -> TSC_EXIT=0, no output (0 errors)
- Mutation self-checks (ports.ts temporarily mutated, then `git checkout --`;
  ports.ts confirmed unchanged and tree clean afterwards):
  - M7 replace `declares ${producer.provenance_layer}:` with `declares nothing:`
    -> 1 failed | 11 passed; FAIL = (a) refuses a material layer collapse
  - M11 drop `consumer.labware_reference === undefined ||`
    -> 1 failed | 11 passed; FAIL = (d-negative) omits labware_reference
  - M12 drop ` || receipt.trim() === ''`
    -> 1 failed | 11 passed; FAIL = (c) whitespace-only receipt
  Each mutation kills exactly its intended leg and no others.

## Commits

- 5011f393 journey/ports: add mutation-meaningful legs ... (ports2fix1)
- 15692ee4 journey/ports: fix whitespace-receipt fixture to receipt_id (ports2fix1)

## Next actions / handoff

- Independent adversarial review re-runs M7/M11/M12 to confirm RED.
- No browser review needed (test-only, no UI, no lane-stack change; no YAML).

DONE 15692ee4875799cd621195db30a609acf298e0d3
L2-JOURNEY-PORTS-1-ports2fix1 UNIT unit DONE 15692ee4875799cd621195db30a609acf298e0d3
