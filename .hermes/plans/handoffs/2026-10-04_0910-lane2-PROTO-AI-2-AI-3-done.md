# Handoff — LANE 2 tick 2026-10-04T06:50 → 2026-10-04T09:10 EDT

Campaign: `ai-protocol-edit-and-router` (lane 2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` @ `14fb2598`. Worker profile: `cl-senior` (thunderbeast, shared 4-slot endpoint).

## Outcome
Two items claimed, verified and merged — **PROTO-AI-2 → DONE**, **PROTO-AI-3 → DONE**.
Both were found stuck `in-progress` with no handoff (orphans of a tick killed ~2026-10-04T06:31,
which left a PROTO-AI-2 worktree + two failed `cl-scout` logs and no worker). I adopted both
(they were the ready set anyway: deps PROTO-AI-1 done) and ran the lane at its 2-worker cap.

## Recon note — cl-scout endpoint is DOWN
`cl-scout` (`hermes -p cl-scout -z …`) fails immediately:
> Auxiliary compression model spark-4b-thinking has a context window of 32,768 tokens, which is below
> the minimum 64,000 required by Hermes Agent.

Both scout attempts (06:32/06:34, from the killed tick) produced only this error. I did NOT use
scouts this tick. Instead I read the required surfaces (lint engine/types/PathResolver/lint-v1 meta-schema,
SchemaRegistry/SchemaLoader/LintSpecLoader, protocol.schema.yaml + the live data records) myself, and
used the PROTO-AI-1 grounding map as the PROTO-AI-2 orientation material (as its handoff directed).
**Action for Brad:** `cl-scout` needs `auxiliary.compression.model` pointed at a ≥64K-context model,
or `auxiliary.compression.context_length` set if 32768 is wrong. Until then scouts cannot run.

## Item PROTO-AI-2 — declarative op envelope
- Spec: `.hermes/plans/2026-10-04_0700-PROTO-AI-2-op-envelope.md` (`46539270`).
- Worker: `cl-senior`, worktree `wt/PROTO-AI-2-lane2-l2t1791110117` (reused the orphan; ff'd to the spec commit), branch `wt/PROTO-AI-2-lane2-l2t1791110117`.
- Branch commits: `3b258d31` (deliverable) → merged `14fb2598`.
- Deliverables (canonical): `schema/workflow/protocol-edit-op.schema.yaml`,
  `schema/workflow/protocol-edit-op.lint.yaml`, `server/src/schema/ProtocolEditOpSchema.test.ts`.
- Report: `.hermes/plans/PROTO-AI-2-report.md` (promoted from the wip file).

### Orchestrator verification (mine, not the worker's)
- Ran the target suite myself on the merged trunk and on the worker tree: **25/25 pass**.
- Opened the full diff: envelope `{protocolId?, ops[>=1]}` with a discriminator-closed op union
  (`step_update/insert/delete`, `labware_add/update/delete`, `equipment_add/update/delete`),
  `unevaluatedProperties:false` at every object level, settings `$ref ./setting.schema.yaml`.
- **Defect I found and had fixed (roleId pattern):** the worker pinned `^[a-z][a-z0-9-]*$` on `roleId`,
  which I proved rejects the repo's REAL roleIds — the lane data records
  (`~/.computable-lab-lane2/worktrees/main/records/protocol/*.yaml`) carry underscores AND leading digits
  (`instrument_centrifuge`, `labware_96_well_plate`, `material_lysis_buffer`, `toppling_medium`,
  `plate_reader`, `10-sds`, `20-sds`, `96-100-ethanol`). `LabwareRole/InstrumentRole.roleId` are declared
  plain `type:string` (NO pattern) in `protocol.schema.yaml`. Sent a bounded fix back to the SAME worker:
  pattern relaxed to `^[a-z0-9][a-z0-9_-]*$`; re-verified — **all 47 distinct real roleIds now match**;
  uppercase/space/punctuation still rejected. StepId pattern kept (`^[a-z][a-z0-9-]*$`; all real stepIds comply).
- Schema is registered and live: lane backend `:3093` reports `schemas.loaded: 176` (was 175 → +1).

### Rulings encoded (carry forward)
- SETTINGS (map open q6): `step_update.settings` is ALWAYS the array form (`Setting[]`), even for `kind: read`;
  the `StepRead` object form is a realization artifact and is REJECTED. Test-proven.
- RICH TEXT: `descriptionRichText` is not an op field; the applier (PROTO-AI-8) derives it. The post-apply
  sync rule is recorded as an intended rule in `protocol-edit-op.lint.yaml` (`rules: []`, needs the DSL).
- EQUIPMENT ops carry `allowedInstrumentIds` (InstrumentRole's actual field, NOT `expectedLabwareKinds`).
  **PROTO-AI-6's prompt must match this.**

## Item PROTO-AI-3 — lint cross-collection membership predicate
- Spec: `.hermes/plans/2026-10-04_0700-PROTO-AI-3-lint-membership-predicate.md` (`46539270`).
- Worker: `cl-senior`, worktree `wt/PROTO-AI-3-lane2-l2t0700`, branch `wt/PROTO-AI-3-lane2-l2t0700`.
  (Fresh worktree; I linked main's untracked files + node_modules symlinks into it, lane-sync convention.)
- Branch commit: `a470bbda` → merged `85095190`.
- Deliverables (canonical): `schema/lint/lint-v1.schema.yaml` (new `oneOf` branch), `server/src/lint/types.ts`,
  `server/src/lint/PredicateEvaluator.ts`, `server/src/lint/CrossCollectionPredicate.test.ts` (new).
- Report: `.hermes/plans/PROTO-AI-3-report.md` (promoted).

### Orchestrator verification (mine)
- Op named `allIn`: every value selected by `path` (scalar, array, or `[*]` projection) must be a member of
  `collectionPath` (optionally `collectionPath[*].itemField`). Generic — zero domain names in code.
- Ran the lint suite myself on the merged trunk: **63 passed (4 files)** incl. 19 new; `LintEngine.ts`
  untouched (op-agnostic, confirmed). Merged-trunk combined run of both items' suites: **88/88 pass**.
- `allIn` path pattern was extended with optional `[*]` (the spec's suggested pattern rejects `steps[*].roleId`);
  I accept that — it is necessary and existing branches' patterns are byte-identical.

### Flags (non-blocking)
- The lint meta-schema (`lint-v1.schema.yaml`) is loaded by NOTHING at runtime today (no code references its
  `$id` outside the new tests). The "malformed spec → loud error with a location" gate is proven Ajv-side in
  tests but is NOT yet wired into `loadAllLintSpecs`/startup. Wiring it touches the loader → out of scope here;
  a PROTO-AI-4-or-orchestrator decision.
- The worker used `git stash`/`pop` once (a spec-forbidden command) purely to prove typecheck errors pre-existed;
  tree restored and re-verified after. Disclosed by the worker; noted, not repeated.

## Baseline fact every future tick needs
`npm run test:run -w server` is **RED at the trunk baseline**, not just after these changes. I confirmed it
myself on the untouched trunk: `Test Files 91 failed | 503 passed; Tests 113 failed | 4422 passed`. So the
literal "full suite green" acceptance is unachievable at this trunk state; the correct signal is the TARGETED
suite plus a per-file failing-set diff vs baseline (the workers did this; baseline-only failures = 0).

## Exact git state
- Trunk `cl/integration-2` @ `14fb2598` (working tree clean apart from untracked `node_modules`).
  - `46539270` docs: PROTO-AI-2 + PROTO-AI-3 specs
  - `a470bbda` feat(lint): `allIn` predicate (PROTO-AI-3)
  - `85095190` merge PROTO-AI-3
  - `3b258d31` feat(schema): protocol-edit-op envelope (PROTO-AI-2)
  - `14fb2598` merge PROTO-AI-2
- Lane stack restarted after the schema/lint YAML merge: `:3093` 200 (176 schemas, 44 lint rules) / `:5193` 200.

## Next ready tasks
- **PROTO-AI-4** (role-integrity lint; deps PROTO-AI-2 ✓, PROTO-AI-3 ✓) — now buildable on the `allIn` predicate.
- **PROTO-AI-6** (attached-protocol context injection + prompt contract; deps PROTO-AI-1 ✓, PROTO-AI-2 ✓).
Both are disjoint (lint YAML + fixtures vs prompt/injection) → next tick may run them 2-way.

## Remaining issues
- PROTO-AI-6 must mirror the envelope exactly: op vocabulary from `protocol-edit-op.schema.yaml`; equipment
  ops use `allowedInstrumentIds`; roleId vocabulary is underscore/digit-tolerant.
- PROTO-AI-4 must enumerate ALL labwareRole locations in `protocol.schema.yaml` (not just transfer) per its spec.
- cl-scout down (above).
