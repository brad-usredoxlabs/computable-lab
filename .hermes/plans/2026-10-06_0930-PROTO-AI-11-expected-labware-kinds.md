# PROTO-AI-11 spec — Add expectedLabwareKinds to PRT-wlj0qm labwareRoles (DATA-only)

Lane 2 · campaign `ai-protocol-edit-and-router` · dep PROTO-AI-4 (merged) · **Brad's data-change
approval RECORDED** — quote it in your report.

## HARD GATE (satisfied — quote in report)
`/home/brad/.hermes/cl/lanes/2/decisions/PROTO-AI-11-data-approval.md` Answer section (Brad
2026-10-06 08:52 EDT, architect-recorded): "**REDEFINE (option 2)** ... add
`expectedLabwareKinds` (and descriptions where missing) to each `roles.labwareRoles` entry on
PRT-wlj0qm where a matching labware-design record exists ... Data repo only. This section is
Brad's explicit data-change approval for THIS change." Do NOT touch anything beyond this scope.

## Goal
The flagship demo protocol PRT-wlj0qm (`records/protocol/
PRT-wlj0qm__zymobiomics-96-magbead-dna-kit-opentrons.yaml` in the DATA repo
`/home/brad/.computable-lab/worktrees/main`) trips PROTO-AI-4's `labware-role-identity-bearing`
WARNING: all 8 `roles.labwareRoles` entries carry a description but NONE carries
`expectedLabwareKinds`. Make the warning GREEN by adding, per role entry, the list of compatible
labware-definition recordIds.

## Verified orientation (orchestrator reads 2026-10-06, real tool output)
- Target record, `roles.labwareRoles` at file lines 306-322: roleIds `deep-well-block`,
  `96-well-block`, `clean-elution-plate-or-tube`, `96-well-plate`, `deep-well-plate`,
  `microcentrifuge-tube`, `collection-tube`, `elution-plate` — each with a description, none with
  expectedLabwareKinds. `instrumentRoles` (:323+) is OUT OF SCOPE — do not touch it.
- Schema `schema/workflow/protocol.schema.yaml:434-438`: `expectedLabwareKinds` is an **array of
  recordIds, uniqueItems**, described as an "Optional hint of compatible labware designs".
  Multiple compatible designs per role is legitimate ARRAY usage — ambiguity by SIZE VARIANT
  (e.g. 1.5 mL vs 2 mL microfuge tube) is resolved by listing both, NOT by guessing one.
- The design records are kind `labware-definition` (NOT the 5 `labware` vendor-set records).
  39 exist; live registry ids (from `records/_index/records.jsonl`, files under
  `/mnt/vast/home/brad/git/computable-lab/records/seed/labware-definition/`). Relevant ids:
  - `lbw-def-generic-96-well-plate`, `lbw-def-opentrons-nest-96-wellplate-200ul-flat-v1`
  - `lbw-def-generic-96-well-deep-plate`, `lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1`
  - `lbw-def-generic-1-5ml-microfuge-tube`, `lbw-def-generic-2ml-microfuge-tube`
  - `lbw-def-generic-15ml-conical-tube`, `lbw-def-generic-50ml-conical-tube`
  - `lbw-def-generic-96x0p2ml-pcr-rack` (only if genuinely compatible — verify against the
    Zymo kit's documented elution volume before using)
  - others: read the full id list from `records/_index/records.jsonl` (grep
    `"kind":"labware-definition"`); open each candidate's YAML under
    `/mnt/vast/home/brad/git/computable-lab/records/seed/labware-definition/` to CONFIRM the
    match (geometry/name) before referencing it.
- Prior-art convention: `records/protocol/prt-seed-biological-transfer__...yaml` uses
  `expectedLabwareKinds` with design recordIds directly — mirror its formatting.
- NEVER invent a kind id: every value you write MUST be a recordId that exists in
  `records/_index/records.jsonl` (verify each with grep before writing).

## Matching guidance (friction-first; it is a HINT array, not a binding)
The protocol is the ZymoBIOMICS 96 MagBead kit run on Opentrons. Suggested mapping — CONFIRM each
against the design record contents, and prefer the Opentrons-platform defs alongside generic ones:
- deep-well-block -> both 96-well deep-plate defs
- 96-well-block -> both 96-well flat-plate defs
- clean-elution-plate-or-tube -> elution-compatible set (96-well plate defs + microfuge tube defs)
- 96-well-plate -> both 96-well flat-plate defs
- deep-well-plate -> both 96-well deep-plate defs
- microcentrifuge-tube -> both generic microfuge tube defs
- collection-tube -> microfuge tube defs (and conical tubes only if the kit steps justify it —
  read the steps that reference it before including)
- elution-plate -> 96-well flat-plate defs (the kit elutes into a 96-well format)
A match that is NOT defensible from the design record + protocol context is an AMBIGUITY: STOP on
that role, leave it unchanged, and report it as a data question — do not force green.
(Descriptions: all 8 already have one — if you find any missing, add a plain lowercase one.)

## Scope / ownership / STOP
- WRITE: ONLY `records/protocol/PRT-wlj0qm__zymobiomics-96-magbead-dna-kit-opentrons.yaml` in
  `/home/brad/.computable-lab/worktrees/main`. ZERO code-repo files.
- The data repo working tree is DIRTY with unrelated foundry artifacts — commit ONLY your one file
  (`git add <that path>` explicitly); never `git add -A`, never stash, never touch other files.
- Do NOT hand-edit `updatedAt`/contentSha — the server owns those; if the server rewrites them
  during your lint round-trip, that is fine; if a rewrite COLLIDES (loop, churn), STOP and report.
- STOP if any referenced id is absent from the index, if a match is ambiguous, or if the lane
  backend refuses the write. Report, do not work around.

## Verification (do, not assert) — all output goes in your report
1. Before: `curl -s localhost:3093/...` lint/validate of the record shows exactly ONE warning —
   `labware-role-identity-bearing` (and zero errors). Record the raw response.
2. Apply the edit. Re-run lint -> **zero errors AND zero warnings** on the record. Record output.
   (If the lane stack does not see the change, note it and use whichever lint invocation the lane
   backend supports — read server/src/api routes for the lint/validate path; tsx --watch reloads
   TS/JSON but NOT YAML schemas — you are not changing schemas, only a record, so no restart is
   needed for your change to be read.)
3. `git -c core.fileMode=false diff` of the one file: ONLY `expectedLabwareKinds:` lines (+ any
   missing description) added; steps, instrumentRoles, everything else byte-identical.
4. Every written id verified present via grep of `records/_index/records.jsonl`.
5. Steps still resolve: the lint pass with zero findings covers role-closure (R1) by definition.
6. Commit in the DATA repo with message `data: PROTO-AI-11 identity-bearing expectedLabwareKinds
   on PRT-wlj0qm` (branch current; do not push anywhere new).

## Deliverable (UNIQUE path)
Report: `/mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/PROTO-AI-11-report.wip-l2t0935.md`
with: approval quote, before/after lint output, the mapping table you applied (roleId -> ids +
why), the diff, the commit hash in the data repo, and any per-role data questions you stopped on.
Do NOT edit the task list. Do NOT merge anything in the code repo.
