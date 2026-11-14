# L2-RUN-ATTACH-CAPABILITY-1 / u1matbind (unit 1 of 2, lane 2) — BLOCKED

- Worktree: /home/brad/cl-wt/L2-RUN-ATTACH-CAPABILITY-1-u1matbind-lane2
- Branch: cl/lane2-run-attach-capability-1-u1matbind-1042 @ base 9057f1e3e07dc0bc6d2967caeba6a30a3e7a32ef (clean)
- Tier: normal. OUTCOME: **BLOCKED** — the honest fix requires a one-field edit to
  `schema/knowledge/acquisition-package.schema.yaml` (+ its `.ui.yaml` triplet slot), and this unit's
  SCOPE prohibits `schema/**` with an explicit STOP-and-report clause for exactly this situation.
  No owned file was modified. No product commit exists; the only commit is this report (see below).

## BLOCKED reason (one line)

The live `acquisition-package.schema.yaml` (top-level `unevaluatedProperties: false`, line 18) does
not declare `materialRef`; `store.create` validates the stamped payload against it
(`acquisitionPackage.ts:521-527`, `RecordStoreImpl.ts:610-618`), so the material-scoped register
cannot succeed until the schema declares the field — and `schema/**` is PROHIBITED to this unit
(brief SCOPE: "if you believe a schema field is missing, STOP and report, do not edit the schema").

## Governing lines read (per grounding duty)

- Decision `.hermes/plans/decisions/RUN-IS-THE-PROVENANCE-RECORD-l2-20261114.md`: "a run records
  biological truth; acquisitions attach to it; no instrument may own a required sheet." The material
  side of the binding is exactly what this unit must add; the BLOCKED is a contract/scope conflict,
  not a domain disagreement.
- `.hermes/plans/architect-context-l2.md:34-36` (§2.4): "**Presentation ≠ execution.** A surface is
  where something is shown or a person acts; a capability is what executes." The blocked seam is the
  record contract (execution), so the door UI (unit 2) must not paper over it with a UI-side
  workaround.
- `.hermes/plans/architect-context-l2.md:66-68` (§2.15): "**Never invent a value.**" The tempting
  workarounds (skip validation, stamp a field the schema forbids, auto-mint an entry) all violate it.
- Note on authority: `.hermes/plans/architect-context-l2.md:138-140` names the SCHEMA as "the load-
  bearing distinction … the ONE source of truth." The schema is the authority for the record
  contract; this unit's TS-only scope cannot extend the truth it is forbidden to touch. Where the
  brief's premise ("no schema change is needed") disagrees with the measured repository, the
  repository wins, per the profile's grounding rule.

## Trunk check (brief §WHY, re-run by me at 9057f1e3e)

- `materialRef` in `server/src/storage/acquisitionPackage.ts`: **0 matches** (no commit pre-added it;
  the field is added fresh, not extended).
- `acquisitionPackage.ts` last touched by `539904825` (2026-10-24, FAME-1); last 3 days at base:
  `RunSheetHandlers.ts` UNTOUCHED, `client.ts` last touched by `7ad3323df` (binbytes) as briefed.
- `schema/knowledge/acquisition-package.schema.yaml` last touched by FAME-1 (539904825); unchanged in
  the brief's 3-day window. Its declared payload properties include `sourceRunRef` (:138) and
  `sampleRef` (:141) — but **not** `materialRef` (grep: 0 matches).

## Measured evidence

### E1 — probe: live schema rejects a stamped `materialRef`

Script: `/home/brad/.matbind-scratch/probe-materialref.mjs` (run from scratch dir with
`node_modules` symlinked to the worktree's `server/node_modules`, node v26.8.1). It replicates the
app's EXACT Ajv setup — `new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true,
discriminator: true, allErrors: true, verbose: true })` + `addFormats` (AjvValidator.ts:152-169) +
the same ref/common `$id` registrations (SchemaLoader.ts:24-36) — and validates a realistic package
payload (real `data-reference` + `measurement` $refs, `files` with `required: ["run_log"]`,
`signalCollectionRef` typed data-reference) against the live
`https://computable-lab.com/schema/computable-lab/acquisition-package.schema.yaml`.

Raw output:

```
ref schema file: /home/brad/cl-wt/L2-RUN-ATTACH-CAPABILITY-1-u1matbind-lane2/schema/core/datatypes/ref.schema.yaml
common schema file: /home/brad/cl-wt/L2-RUN-ATTACH-CAPABILITY-1-u1matbind-lane2/schema/core/common.schema.yaml
acquisition-package $id: https://computable-lab.com/schema/computable-lab/acquisition-package.schema.yaml
acquisition-package top-level unevaluatedProperties: false
acquisition-package declares materialRef in properties: false

== baseline (sampleRef+sourceRunRef stamped): valid=true

== u1matbind case (materialRef stamped, sampleRef still there): valid=false
   / unevaluatedProperties must NOT have unevaluated properties

== u1matbind case (materialRef stamped, no sampleRef): valid=false
   / unevaluatedProperties must NOT have unevaluated properties

RESULT: baseline=true withMaterialRef=false materialOnly=false
```

### E2 — end-to-end consequence (cited code, no edits made)

- Service stamps conditionally and creates LAST: `acquisitionPackage.ts:517-518` (conditional
  spreads for `sourceRunRef`/`sampleRef`), `:521-527` `store.create({ envelope: { ..., schemaId:
  ACQP_SCHEMA_ID, payload } })` then `throw new Error(...)` on failure.
- `RecordStoreImpl.createUnlocked` (`server/src/store/RecordStoreImpl.ts:610-618`): validation is
  only skipped when `skipValidation` is set — `registerAcquisitionPackage` does NOT pass it.
  Invalid payload → `success:false, error: 'Validation failed'`.
- Handler catch-all (`RunSheetHandlers.ts:171-186`): the thrown `Error` is neither an
  `AcquisitionPackageError` nor a `StorageError` → `throw e` → **bare 500**.
- Therefore, even with brief steps 2-4 implemented verbatim, AC1 fails at the store and the
  material-scoped call dies with a 500, not a success. The service's carry path for `sampleRef`
  (the "carry it the SAME way" model) is itself blocked for `materialRef` by the same schema.

### E3 — baseline at base 9057f1e3e (raw, run from `server/` per brief's cwd note)

- `cd server && npx vitest run src/api/handlers/RunSheetHandlers.test.ts`:
  `Test Files  1 passed (1)` / `Tests  17 passed (17)` / `Duration  38.81s`.
- `cd server && npx tsc --noEmit`: 6 errors, all pre-existing `Property 'parts'/'file' does not
  exist` (AIHandlers.ts:332,438,716; AiIngestionHandlers.ts:291; ExtractProtocolHandler.ts:63;
  sequenceRoutes.ts:37) — matches the briefed baseline of 6.
- `git -c core.fileMode=false status --short` at base: empty.

## Measured size of the honest fix (brief EXIT CONTRACT: "STOP and write BLOCKED with the measured size")

The honest minimal fix is the 4 owned-file changes (estimated +~35 lines) PLUS a schema triplet:

1. `schema/knowledge/acquisition-package.schema.yaml` — +3 lines: declare
   `materialRef:` `$ref: "./datatypes/ref.schema.yaml"` with a description beside `sampleRef`
   (`:141-143`). The ref datatype is already the authority for the shape — this is ONE field in ONE
   existing schema, not a second authority (it makes the schema and the record contract agree).
2. `schema/knowledge/acquisition-package.ui.yaml` — +6 lines: a `material-ref-slot` beside
   `sample-ref-slot` (`:146-149`) to keep the schema/lint/ui triplet consistent (no lint.yaml change:
   the lint file has zero `sampleRef`/`sourceRunRef` rules, so `materialRef` needs none either —
   verified by grep).
3. The 4 owned files per brief steps 1-4 (~35 lines, RED-first).

Total: 5-6 files / ~45 lines. The brief's cap is 4 files / 220 lines AND `schema/**` is PROHIBITED —
so the honest fix is out of this unit's scope by the schema half alone.

## What I did NOT do (and why)

- Did not write the RED tests yet: the brief's RED case (a) "material-only register → NOT a 400"
  cannot be made green within scope; a test that passes because the handler guard changed would
  assert a contract the store then violates (500), i.e. a false green. AC1 (record read back names
  the material ref) is unsatisfiable without the schema field.
- Did not skip validation / `skipValidation: true` / bypass the store: would violate §2.15
  ("never invent") and the Ajv single-authority rule (.clinerules via AjvValidator.ts:17-14).
- Did not fold the new refusal into `isConfigError` (`:87-89`): it is a request-shape error, not a
  config/mount error; the brief says `:93` classification stays untouched.
- Did not auto-mint an instrument-sequence-entry to satisfy the guard (the domain bait): that is the
  "instrument owns the sheet" model Brad's decision rejects.
- Did not edit `app/src/run/gc/GcAttachPanel.tsx` (prohibited) — it already calls
  `registerAcquisitionPackage` with `entryRef` (`:134`), which stays source-compatible after
  `entryRef` becomes optional client-side.
- Did not start the dev stack, run the full suite, or run the browser gate.

## Next actions (owner: orchestrator)

1. DECIDE the schema field (one-line addition, no new datatype):
   `schema/knowledge/acquisition-package.schema.yaml`
   ```yaml
   materialRef:
     $ref: "./datatypes/ref.schema.yaml"
     description: "Optional record ref to the material that went in (RUN-IS-THE-PROVENANCE-RECORD, 2026-11-14)."
   ```
   plus the `.ui.yaml` slot (triplet consistency). Owner: schema owner/orchestrator — this unit is
   not authorized to edit it.
2. Re-dispatch u1matbind (continuation) with `schema/knowledge/acquisition-package.schema.yaml` and
   `schema/knowledge/acquisition-package.ui.yaml` moved from PROHIBITED to owned — OR authorize this
   report's fix in place. Everything else in the brief then proceeds unchanged; the 4 owned files
   are exactly as planned (RED-first tests, conditional spread, named refusal token
   `MATERIAL_OR_ENTRY_REQUIRED` with a message naming what to supply, `entryRef` optional on both
   sides, response shape and config-error classification byte-identical).
3. After the schema lands, the probe E1 must re-run and show `withMaterialRef=true` before the
   GREEN step; AC1-AC4 then verify as briefed (AC3: material-scoped register creates NO entry —
   assert via `store.list({kind:'instrument-sequence-entry'})` count / absent `entryRecordId`).

## Verification commands (reproducible)

- Probe: `mkdir -p /home/brad/.matbind-scratch && ln -sfn <worktree>/server/node_modules /home/brad/.matbind-scratch/node_modules && node /home/brad/.matbind-scratch/probe-materialref.mjs <worktree>` (script deleted at exit per commit discipline — the raw output E1 is preserved above).
- `cd server && npx vitest run src/api/handlers/RunSheetHandlers.test.ts` (E3).
- `cd server && npx tsc --noEmit` (E3).

## Commit discipline

- No product commits (tree at base was clean and stays clean of code changes; the only commit is
  this report). Scratch dir `/home/brad/.matbind-scratch/` deleted at exit.

Marker: L2-RUN-ATTACH-CAPABILITY-1-u1matbind UNIT L2-RUN-ATTACH-CAPABILITY-1-u1matbind BLOCKED schema/knowledge/acquisition-package.schema.yaml lacks materialRef (top-level unevaluatedProperties:false) so a stamped materialRef fails store validation (probe: valid=false, 500 end-to-end); schema/** PROHIBITED to this unit; honest fix measured at 5-6 files/~45 lines
