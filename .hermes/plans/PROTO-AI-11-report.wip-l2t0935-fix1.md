# PROTO-AI-11 report — FIX RUN 1 (wip-l2t0935-fix1)

Lane 2 · DATA-only fix cycle 1/2 · executed 2026-10-06 by cl-coder.
Fixes the single adversarial defect (review-PROTO-AI-11-20261006T0955.md, defect 1 [major]):
roleId `96-well-block` was mapped to the two FLAT 96-well defs (200/350 uL) though the protocol
fills that vessel with 500/500/900 uL and step 13 equates "deep-well block" and "96-Well Block"
on one vessel. Applied the reviewer's primary fix direction: remap `96-well-block` to the two
deepwell_96 defs (same set as deep-well-block). NOTHING else changed.

## HARD GATE — approval quote (from `/home/brad/.hermes/cl/lanes/2/decisions/PROTO-AI-11-data-approval.md`, Answer section)

> 2026-10-06 08:52 EDT (recorded by architect from Brad's direct reply): **REDEFINE (option 2).**
> Close the original no-op disposition; redefine PROTO-AI-11 to the residual data change:
> add `expectedLabwareKinds` (and descriptions where missing) to each `roles.labwareRoles`
> entry on PRT-wlj0qm where a matching labware-design record exists, so PROTO-AI-4's
> identity-bearing-clause warning goes green on the flagship protocol. Data repo
> (/home/brad/.computable-lab/worktrees/main) only. This section is Brad's explicit
> data-change approval for THIS change — the HARD GATE is satisfied by it.

## Pre-write confirmation (required gate — PASSED, both designs opened)

Both target design YAMLs opened under `/mnt/vast/home/brad/git/computable-lab/records/seed/labware-definition/`:

`lbw-def-generic-96-well-deep-plate.yaml`:
```
legacy_labware_types:
  - deepwell_96
capacity:
  max_well_volume_uL: 2000
  min_working_volume_uL: 50
```

`lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1.yaml`:
```
legacy_labware_types:
  - deepwell_96
capacity:
  max_well_volume_uL: 2000
  min_working_volume_uL: 1
platform_aliases: opentrons_ot2 / opentrons_flex -> nest_96_wellplate_2ml_deep
```

CONFIRMED: both declare legacy `deepwell_96` with max_well_volume_uL = 2000 >= 900 uL (covers the
900 uL MagWash 2 dispense at file line 182; 500 uL dispenses at lines 129/152 also fit).
Protocol text confirming the role's deep-vessel meaning (grep of the record):
```
182:    label: Dispense 900 µl ZymoBIOMICS™ MagWash 2 and mix well by
196:    label: Transfer the deep-well block to a magnetic stand until beads pellet,
199:          then aspirate and discard the supernatant. Remove the 96-Well Block
```
Step 13 equates the two names on one vessel — the reviewer's evidence reproduces exactly.

## The fix (the ONLY edit)

File: `/home/brad/.computable-lab/worktrees/main/records/protocol/PRT-wlj0qm__zymobiomics-96-magbead-dna-kit-opentrons.yaml`
(lines 312-316, `96-well-block` entry only):

```diff
@@ -312,8 +312,8 @@ roles:
     - roleId: 96-well-block
       description: 96-well block
       expectedLabwareKinds:
-        - lbw-def-generic-96-well-plate
-        - lbw-def-opentrons-nest-96-wellplate-200ul-flat-v1
+        - lbw-def-generic-96-well-deep-plate
+        - lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1
```

## Verification (a) — final state vs file BEFORE the original change

`git -c core.fileMode=false diff bb31170 63bfab2 -- records/protocol/PRT-wlj0qm__zymobiomics-96-magbead-dna-kit-opentrons.yaml`
(bb31170 = pre-PROTO-AI-11 base; 63bfab2 = final amended commit):

```
diff --git a/records/protocol/PRT-wlj0qm__zymobiomics-96-magbead-dna-kit-opentrons.yaml b/records/protocol/PRT-wlj0qm__zymobiomics-96-magbead-dna-kit-opentrons.yaml
index fdd111e..4f2503f 100644
--- a/records/protocol/PRT-wlj0qm__zymobiomics-96-magbead-dna-kit-opentrons.yaml
+++ b/records/protocol/PRT-wlj0qm__zymobiomics-96-magbead-dna-kit-opentrons.yaml
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
+        - lbw-def-generic-96-well-deep-plate
+        - lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1
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

Total diff vs the pre-change file = 26 added lines, ALL `expectedLabwareKinds:` + items, across
the 8 labwareRoles only. `96-well-block` now carries the two deepwell defs — NO flat 200/350 uL
plate on it. Steps, instrumentRoles, materialRoles, source, timestamps byte-identical.
`git diff --quiet HEAD -- <file>` -> CLEAN (worktree == commit).

## Verification (b) — both deep ids present in `records/_index/records.jsonl`

```
$ grep -c '"recordId":"lbw-def-generic-96-well-deep-plate"' records/_index/records.jsonl
1
$ grep -c '"recordId":"lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1"' records/_index/records.jsonl
1
```

## Verification (c) — lint re-run against lane backend :3093

Payload built from a NUMBER-PRESERVING YAML parse (PyYAML safe_load; 34 numeric scalars verified
as native ints in the parsed record AND in the POSTed JSON payload — e.g. `.steps[0].ordinal 1 int`,
`.steps[0].provenance[0].pageNumber 9 int`; counts identical both sides). Body: `{schemaId, payload}`
with schemaId `https://computable-lab.com/schema/computable-lab/protocol.schema.yaml`.

```
$ curl -s -m 30 -X POST localhost:3093/api/lint -H 'content-type: application/json' -d @/tmp/lint-body-fix1.json
{"valid":true,"violations":[],"summary":{"total":3,"passed":3,"failed":0,"skipped":0,"errors":0,"warnings":0,"info":0},"schemaId":"https://computable-lab.com/schema/computable-lab/protocol.schema.yaml"}
```

violations [] — errors=0, warnings=0. All 3 protocol lint rules pass (step-role-closure,
labware-role-identity-bearing, role-id-category-unique). Role closure (V5) covered by the pass.

## Verification (d) — final role mapping (parsed from the committed file)

```
deep-well-block             -> lbw-def-generic-96-well-deep-plate, lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1
96-well-block               -> lbw-def-generic-96-well-deep-plate, lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1   <-- FIXED
clean-elution-plate-or-tube -> lbw-def-generic-96-well-plate, lbw-def-opentrons-nest-96-wellplate-200ul-flat-v1, lbw-def-generic-1-5ml-microfuge-tube, lbw-def-generic-2ml-microfuge-tube
96-well-plate               -> lbw-def-generic-96-well-plate, lbw-def-opentrons-nest-96-wellplate-200ul-flat-v1
deep-well-plate             -> lbw-def-generic-96-well-deep-plate, lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1
microcentrifuge-tube        -> lbw-def-generic-1-5ml-microfuge-tube, lbw-def-generic-2ml-microfuge-tube
collection-tube             -> lbw-def-generic-1-5ml-microfuge-tube, lbw-def-generic-2ml-microfuge-tube
elution-plate               -> lbw-def-generic-96-well-plate, lbw-def-opentrons-nest-96-wellplate-200ul-flat-v1
```

The other 7 roles are unchanged from the prior run (reviewer judged all 7 defensible).

## Commit method — AMENDED

`git add records/protocol/PRT-wlj0qm__zymobiomics-96-magbead-dna-kit-opentrons.yaml` (single file
named explicitly; NO `git add -A`) + `git commit --amend --no-edit`. Prior local-only commit
9237255e83af20dbcfd1fc962748ec7165f0a779 replaced by:

```
commit 63bfab201af734f5134b33a0f91fe1659c75fd55
    data: PROTO-AI-11 identity-bearing expectedLabwareKinds on PRT-wlj0qm
 ...__zymobiomics-96-magbead-dna-kit-opentrons.yaml | 26 ++++++++++++++++++++++
 1 file changed, 26 insertions(+)
```

Branch main; origin/main = bb31170 (= parent), so the commit remains LOCAL ONLY, unpushed.
The unrelated dirty foundry/var files (55 status entries) remain untouched, exactly as found.
ZERO code-repo writes. `updatedAt`/contentSha not hand-edited; no server rewrite occurred
(lint was a read-only POST).

## Data questions carried forward (unchanged from prior report, not forced)

1. collection-tube conical defs excluded (no step justifies 15/50 mL) — Brad/orchestrator call.
2. lbw-def-generic-96x0p2ml-pcr-rack not used (kit elutes 50 uL/well into 96-well plate format).
3. Pre-existing validate-full schema errors (`/source.ingestion` unknown property; `$schema`
   unevaluated) — out of scope, unchanged by this fix.

## Status

DONE — defect 1 fixed exactly as directed: `96-well-block` expectedLabwareKinds remapped from the
two flat plate defs to the two deepwell_96 defs (both confirmed max 2000 uL >= 900 uL before
writing); every other line byte-identical; lint 0 errors / 0 warnings; single-file amended commit.
Final data-repo commit hash: 63bfab201af734f5134b33a0f91fe1659c75fd55 (main, unpushed).
Acceptance sign-off belongs to the orchestrator.
