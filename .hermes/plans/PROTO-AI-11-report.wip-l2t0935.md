# PROTO-AI-11 report (wip-l2t0935) — expectedLabwareKinds on PRT-wlj0qm labwareRoles

Lane 2 · DATA-only change · executed 2026-10-06 by cl-coder.
File written: `/home/brad/.computable-lab/worktrees/main/records/protocol/PRT-wlj0qm__zymobiomics-96-magbead-dna-kit-opentrons.yaml` (the ONLY file touched; ZERO code-repo writes).

## HARD GATE — approval quote (from `/home/brad/.hermes/cl/lanes/2/decisions/PROTO-AI-11-data-approval.md`, Answer section)

> 2026-10-06 08:52 EDT (recorded by architect from Brad's direct reply): **REDEFINE (option 2).**
> Close the original no-op disposition; redefine PROTO-AI-11 to the residual data change:
> add `expectedLabwareKinds` (and descriptions where missing) to each `roles.labwareRoles`
> entry on PRT-wlj0qm where a matching labware-design record exists, so PROTO-AI-4's
> identity-bearing-clause warning goes green on the flagship protocol. Data repo
> (/home/brad/.computable-lab/worktrees/main) only. This section is Brad's explicit
> data-change approval for THIS change — the HARD GATE is satisfied by it.

## Verification 1 — BEFORE lint (lane backend :3093)

Route note: on the running :3093 instance the lint route is `POST /api/lint` (`POST /lint` returns 404 on this instance; bare `/lint` is not mounted). Body: `{schemaId, payload}` where payload is the record parsed from the YAML. Raw response, pre-edit:

```
$ curl -s -m 30 -X POST localhost:3093/api/lint -H 'content-type: application/json' -d @/tmp/lint-body.json
{"valid":true,"violations":[{"ruleId":"labware-role-identity-bearing","severity":"warning","message":"Protocol 'PRT-wlj0qm': labware role(s) at roles.labwareRoles are not identity-bearing (need description + expectedLabwareKinds); roleIds: deep-well-block,96-well-block,clean-elution-plate-or-tube,96-well-plate,deep-well-plate,microcentrifuge-tube,collection-tube,elution-plate.","path":"roles.labwareRoles"}],"summary":{"total":3,"passed":2,"failed":1,"skipped":0,"errors":0,"warnings":1,"info":0},"schemaId":"https://computable-lab.com/schema/computable-lab/protocol.schema.yaml"}
```

Exactly ONE warning (`labware-role-identity-bearing`), zero errors. Matches the spec's expected before-state.

## Verification 2 — AFTER lint (same invocation, post-edit)

```
$ curl -s -m 30 -X POST localhost:3093/api/lint -H 'content-type: application/json' -d @/tmp/lint-body-after.json
{"valid":true,"violations":[],"summary":{"total":3,"passed":3,"failed":0,"skipped":0,"errors":0,"warnings":0,"info":0},"schemaId":"https://computable-lab.com/schema/computable-lab/protocol.schema.yaml"}
```

Zero errors AND zero warnings. All 3 protocol lint rules pass (step-role-closure, labware-role-identity-bearing, role-id-category-unique — rule ids confirmed from `schema/workflow/protocol.lint.yaml` lines 19/72/101). No server restart was needed or performed (record-only change; tsx --watch reads records).

Honest note on `POST /api/validate-full` (validate + lint): the validation half reports TWO pre-existing schema errors — `/source: Unknown property: ingestion` and `/: must NOT have unevaluated properties ($schema)` — BYTE-IDENTICAL before and after my edit (raw outputs captured for both). They are a record-envelope/schema mismatch unrelated to labwareRoles, present in the committed record since creation, and out of PROTO-AI-11 scope; I did not touch them. The lint half is clean (0/0) after the change.

## Mapping applied (roleId -> ids + why)

Every id below was grepped-present in `records/_index/records.jsonl` (see Verification 4) and its design YAML opened under `/mnt/vast/home/brad/git/computable-lab/records/seed/labware-definition/` to confirm geometry/name before referencing.

| roleId | expectedLabwareKinds | why |
|---|---|---|
| deep-well-block | lbw-def-generic-96-well-deep-plate, lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1 | Steps 5/13/196-200 describe a 96-well deep block holding 200 µl lysate + 600 µl buffer + 25 µl beads (>825 µl/well) — both defs are `deepwell_96`, 2000 µL max. Opentrons NEST 2 mL deep def is the platform-native match. |
| 96-well-block | lbw-def-generic-96-well-plate, lbw-def-opentrons-nest-96-wellplate-200ul-flat-v1 | Steps 7/9/117-167: 96-well block on magnetic stand; step 5 transfers "up to 200 µl" — flat 96-well format. Both defs are `plate_96`; NEST 200 µL flat is the Opentrons-platform def. |
| clean-elution-plate-or-tube | lbw-def-generic-96-well-plate, lbw-def-opentrons-nest-96-wellplate-200ul-flat-v1, lbw-def-generic-1-5ml-microfuge-tube, lbw-def-generic-2ml-microfuge-tube | Step 17: "Transfer the supernatant (containing the eluted DNA) to a clean elution plate or tube" — the role name itself is plate-OR-tube; 50 µl elution fits both flat-plate defs and both microfuge-tube defs. Size-variant ambiguity resolved by listing both (per spec: legitimate ARRAY usage). |
| 96-well-plate | lbw-def-generic-96-well-plate, lbw-def-opentrons-nest-96-wellplate-200ul-flat-v1 | Generic 96-well flat plate role; same two flat defs. |
| deep-well-plate | lbw-def-generic-96-well-deep-plate, lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1 | Generic 96-well deep plate role; same two deep defs. |
| microcentrifuge-tube | lbw-def-generic-1-5ml-microfuge-tube, lbw-def-generic-2ml-microfuge-tube | Microcentrifuge tube role; both generic microfuge defs (1.5 mL vs 2 mL size-variant ambiguity resolved by listing both). |
| collection-tube | lbw-def-generic-1-5ml-microfuge-tube, lbw-def-generic-2ml-microfuge-tube | Tube-collection role. Conical defs EXCLUDED: no step references collection-tube with a volume justifying 15/50 mL (only mention is Appendix A sample collection, no labwareRole refs exist in steps). See data question below. |
| elution-plate | lbw-def-generic-96-well-plate, lbw-def-opentrons-nest-96-wellplate-200ul-flat-v1 | Kit elutes into a 96-well format (step 16: 50 µl elution per well; step 17 transfers supernatant to elution plate). Flat 96-well defs. |

Descriptions: all 8 entries already carried one — none added (spec's "where missing" clause was a no-op).

## Verification 3 — diff of the one file (`git -c core.fileMode=false diff`)

```
diff --git i/records/protocol/PRT-wlj0qm__zymobiomics-96-magbead-dna-kit-opentrons.yaml w/records/protocol/PRT-wlj0qm__zymobiomics-96-magbead-dna-kit-opentrons.yaml
index fdd111e..19d6e49 100644
--- i/records/protocol/PRT-wlj0qm__zymobiomics-96-magbead-dna-kit-opentrons.yaml
+++ w/records/protocol/PRT-wlj0qm__zymobiomics-96-magbead-dna-kit-opentrons.yaml
@@ -306,20 +306,46 @@ roles:
   labwareRoles:
     - roleId: deep-well-block
       description: deep-well block
+      expectedLabwareKinds:
+        - lbw-def-generic-96-well-deep-plate
+        - lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1
     - roleId: 96-well-block
       description: 96-well block
+      expectedLabwareKinds:
+        - lbw-def-generic-96-well-plate
+        - lbw-def-opentrons-nest-96-wellplate-200ul-flat-v1
     - roleId: clean-elution-plate-or-tube
       description: clean elution plate or tube
+      expectedLabwareKinds:
+        - lbw-def-generic-96-well-plate
+        - lbw-def-opentrons-nest-96-wellplate-200ul-flat-v1
+        - lbw-def-generic-1-5ml-microfuge-tube
+        - lbw-def-generic-2ml-microfuge-tube
     - roleId: 96-well-plate
       description: 96-well plate
+      expectedLabwareKinds:
+        - lbw-def-generic-96-well-plate
+        - lbw-def-opentrons-nest-96-wellplate-200ul-flat-v1
     - roleId: deep-well-plate
       description: deep-well plate
+      expectedLabwareKinds:
+        - lbw-def-generic-96-well-deep-plate
+        - lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1
     - roleId: microcentrifuge-tube
       description: microcentrifuge tube
+      expectedLabwareKinds:
+        - lbw-def-generic-1-5ml-microfuge-tube
+        - lbw-def-generic-2ml-microfuge-tube
     - roleId: collection-tube
       description: collection tube
+      expectedLabwareKinds:
+        - lbw-def-generic-1-5ml-microfuge-tube
+        - lbw-def-generic-2ml-microfuge-tube
     - roleId: elution-plate
       description: elution plate
+      expectedLabwareKinds:
+        - lbw-def-generic-96-well-plate
+        - lbw-def-opentrons-nest-96-wellplate-200ul-flat-v1
   instrumentRoles:
     - roleId: bead-beater
       description: bead beater
```

(26 insertions, 0 deletions; additions ONLY inside `roles.labwareRoles`.) Steps, instrumentRoles, materialRoles, source, timestamps: byte-identical. `updatedAt`/contentSha NOT hand-edited; no server rewrite occurred (lint was read-only POSTs, no record write through the server).

## Verification 4 — every written id grepped-present in `records/_index/records.jsonl`

```
lbw-def-generic-96-well-deep-plate -> 1
lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1 -> 1
lbw-def-generic-96-well-plate -> 1
lbw-def-opentrons-nest-96-wellplate-200ul-flat-v1 -> 1
lbw-def-generic-1-5ml-microfuge-tube -> 1
lbw-def-generic-2ml-microfuge-tube -> 1
```

(`grep -c "\"recordId\":\"<id>\"" records/_index/records.jsonl` per id; all 6 distinct ids used, each count 1. The full 39-id `labware-definition` list was enumerated from the index; candidate design YAMLs opened and confirmed: deep defs `legacy_labware_types: [deepwell_96]` 2000 µL; flat defs `plate_96` 200/350 µL; microfuge defs `tube` 1500/2000 µL.)

## Verification 5 — role closure

Covered by the lint pass: `step-role-closure` (R1) is one of the 3 rules in the summary `total:3, passed:3` after the edit.

## Verification 6 — commit (data repo, branch main, not pushed)

```
[main 9237255] data: PROTO-AI-11 identity-bearing expectedLabwareKinds on PRT-wlj0qm
 1 file changed, 26 insertions(+)
9237255e83af20dbcfd1fc962748ec7165f0a779 data: PROTO-AI-11 identity-bearing expectedLabwareKinds on PRT-wlj0qm
```

`git add` named the single file explicitly; no `git add -A`, no stash. The unrelated dirty foundry/var files (15 modified + untracked entries) remain untouched in the working tree, exactly as found.

## Data questions (flagged, not forced)

1. **collection-tube — conical defs excluded.** Spec guidance: "conical tubes only if the kit steps justify it". No step in PRT-wlj0qm references `collection-tube` at all (the protocol's steps carry no `labwareRole:` refs), and the only textual "collection" mention is Appendix A (DNA/RNA Shield sample collection). Zymo's DNA/RNA Shield collection tubes are conical-style in the vendor ecosystem, but nothing in THIS record justifies 15 mL/50 mL volumes. I listed only the two microfuge defs. If Brad wants `lbw-def-generic-15ml-conical-tube` (and/or 50 mL) added, it is a one-line-per-entry addition — orchestrator/Brad call.
2. **lbw-def-generic-96x0p2ml-pcr-rack — not used anywhere.** Spec said "only if genuinely compatible — verify against the Zymo kit's documented elution volume". Kit elutes 50 µl/well into a 96-well plate format (steps 16-17); the PCR rack is a 0.2 mL strip-tube tubeset, not a plate, and no role in this record names a PCR rack. Excluded from all 8 entries.
3. **Pre-existing validate-full schema errors** (`/source.ingestion` unknown property; `$schema` unevaluated) — identical before/after, out of scope, flagged for whoever owns the protocol schema envelope.

## Status

DONE — all 8 labwareRoles entries now carry expectedLabwareKinds; lint on :3093 went from 1 warning / 0 errors to 0 warnings / 0 errors; single-file commit 9237255e83af20dbcfd1fc962748ec7165f0a779 in the data repo (main, unpushed); acceptance sign-off belongs to the orchestrator.
