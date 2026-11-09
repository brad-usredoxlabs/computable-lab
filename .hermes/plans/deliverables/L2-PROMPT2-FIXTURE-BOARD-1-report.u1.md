# L2-PROMPT2-FIXTURE-BOARD-1 — Unit u1 Report

Board ID: EVG-corpus2-prompt1-dmem-baseline
Gate URL: http://localhost:5193/project/STU-scratch/event-graph/EVG-corpus2-prompt1-dmem-baseline

## Pre-state (RED checks)
- GET /api/records/EVG-corpus2-prompt1-dmem-baseline -> 404 (id free)
- Base sha: 548b33d7b3cf576f55855f37ed8acaf05e90ec5a

## V-1 (--check)
```
{"validation": {"schemaId": "...", "valid": true, "errors": []}, "lint": {"valid": true, ...}}
check: 2 events, 1 labware, 32 wells, volume.value=100
```

## V-2 (--seed --verify)
First seed: record created: EVG-corpus2-prompt1-dmem-baseline
Idempotent reseed: record exists (reused): EVG-corpus2-prompt1-dmem-baseline
Verify: events=2 labwares=1 volume.value=100 wells=32 labwareId=lbw-seed-plate-96-flat
payload == fixture + {createdAt,updatedAt}: OK

## V-4 (reset + digest comparison)
Reset: deleted EVG-corpus2-prompt1-dmem-baseline -> record created: EVG-corpus2-prompt1-dmem-baseline
Before digest: 37d097cd0511d3992dd79ba1ab56c6414540099931eb8018eaebcc398d0055cc
After digest:  37d097cd0511d3992dd79ba1ab56c6414540099931eb8018eaebcc398d0055cc
DIGESTS MATCH

## V-6 (data repo)
Only records/_index/records.jsonl updated by the store (no hand-edit).

## V-7 (zero product code)
2 files changed, 263 insertions(+):
- .hermes/plans/harness/corpus2-board/c2p1-baseline.board.yaml (80 lines)
- .hermes/plans/harness/corpus2-board/seed-board.py (183 lines)

No product files modified.

## Changed Files
- .hermes/plans/harness/corpus2-board/c2p1-baseline.board.yaml
- .hermes/plans/harness/corpus2-board/seed-board.py

## Receipt Paths
- .hermes/plans/deliverables/rec-before.json
- .hermes/plans/deliverables/rec-after.json

## Notes
- Server strips recordId from stored payload; verify accounts for this.
- Delete targets only the fixture's own record via teardown_journey.
- The polluted board EVG-cellrox-flow-cytometry-assay-kits-method-bda3685b was NOT touched.
- --check proves schema legality only (validator is permissive per spec §6 L1).
- AC-1 tooltip probe (u2) and contrast leg (u3) are not in this unit's scope.

L2-PROMPT2-FIXTURE-BOARD-1-u1 UNIT unit DONE 68bf170a0bf5375f57bfa448d71d8d8d02e2cb1c