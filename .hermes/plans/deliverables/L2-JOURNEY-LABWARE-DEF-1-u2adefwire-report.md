# L2-JOURNEY-LABWARE-DEF-1 / unit u2adefwire — coder report

Lane 2, composer run 2026-11-13T18:15-05:00. Item `L2-JOURNEY-LABWARE-DEF-1-u2adefwire`,
1 of 1 unit in this leg (u2b and u3 are later and separate).

## Environment findings (measured before any edit)

1. **The brief's base commit did not contain the owned files.** The worktree was created at
   `0fa36082` (2026-11-13 18:00:25), but the declaration `config/journey/declarations/labware-definition.yaml`
   and the test `server/src/compiler/journey/labwareDefinitionJourney.test.ts` were authored by `0f11b254`
   (17:38:15) and only reached the lane trunk at `73507b4b` (18:00:53, merged by cl-closure-feeder on accept
   verdict), i.e. AFTER the base was cut. `git ls-tree 0fa36082` shows neither file. This unit EXTENDS both
   files and cannot start from a base that lacks them, so I fast-forwarded the lane branch
   `0fa36082..cd0218ff` (pure fast-forward, no history rewrite) to the trunk tip. The trunk tip `cd0218ff`
   is the commit the architect context itself measured against ("§3 re-measured at 73507b4b"), and the
   only commit between the briefed base and the trunk tip touching the owned files is `0f11b254` itself —
   byte-identical at `cd0218ff` (verified: `git diff 0f11b254 cd0218ff -- <the two files>` is empty).
   All brief anchors (yaml:31/38/40/53/72, test:75 etc.) match the file at `cd0218ff` verbatim.
   Effective base: `cd0218ff67d49795a42cfecd5c11afa36ef9ea54`.
2. **The worktree had NO node_modules** despite the brief's "node_modules is guaranteed". I did not
   install anything. `pnpm-lock.yaml` hash is identical (`5e21439e…`) across my worktree and every
   same-item sibling lane, so I symlinked
   `node_modules -> /home/brad/cl-wt/L2-JOURNEY-LABWARE-DEF-1-u2adecl-lane2/node_modules` and
   `server/node_modules -> /home/brad/cl-wt/L2-JOURNEY-LABWARE-DEF-1-u2adefwire-lane2/...` (the u2adecl
   lane's server nm). Both paths are in `.gitignore`; `git status` stayed clean throughout, so no product
   path was touched and nothing is committed.

## The change (2 commits)

- `7da12346` — declaration (data only):
  a. `complete-definition`: `capability_ref: journey.ontology-lookup` → `journey.labware-definition-create`;
     step-level `output_ports: []` → exactly one port at index 0: `{version: v1, labware_definition_id: LAB-DEF-1}`
     (a LabwareDefinitionReference — ports.ts:122 rejects a CommittedRecordReference bound to the consumer's
     definition port, so the committed record correctly STAYS on `human_task.output_port`, which is
     byte-identical to before: `REC-labware-definition` / `labware-definition` / `RCPT-labware-definition`).
     The whole `human_task` block (decision, surface `record-create`, controls, selectable_kinds,
     completion `{kind: governed_write, receipt_required: true}`, on_cancel, on_defer) is untouched.
  b. Appended third step `place-instance`: `capability_ref: journey.labware-instance-place`,
     `interaction_mode: automatic`, `input_ports: [{version: v1, labware_definition_id: LAB-DEF-1}]`
     (byte-identical `LAB-DEF-1` to (a) — the seam), `output_ports: [{version: v1, record_id: LAB-INST-1,
     record_type: labware-instance, receipt_id: RCPT-labware-instance}]`.
  c. Header scope note (yaml:6-9) reworded: it no longer asserts "exactly two steps / NO placement step";
     it now states the three-step shape and that both governed writes are ADMITTED but
     `status.implemented: false`. `unresolved_questions[0]` reworded to the surviving truth
     ("the place-instance capability is admitted but status.implemented is false — the governed-write
     executor leg for the placement is still unresolved and owned by a later unit") — still names
     place-instance/placement, so the existing pin at test:56-60 (`/place[- ]?instance|placement/i`) holds.
     `unresolved_questions[1]` (record-create surface) is byte-identical to the original.
- `b2997496` — the pin (append-only; the existing five `it` blocks are byte-identical, including the
  surface assertion at :70-77 which stays RED until u2asurf):
  1. capability-ref pin: `complete-definition` = `journey.labware-definition-create`,
     `place-instance` = `journey.labware-instance-place`.
  2. seam pin: `complete-definition.output_ports[0].labware_definition_id` ===
     `place-instance.input_ports[0].labware_definition_id`, both non-empty.
  3. catalogue-only lint pin: `lintJourneyDocument(doc, catalogue).diagnostics` deep-equals `[]`
     (two arguments — no surfaces registry, so the human-task rules at journeyDocumentLint.ts:115 do not
     run; the port chain at :118-145 is still exercised).

Size vs the 90-line budget: 57 insertions + 7 deletions = 64 changed lines, 2 files.

## Evidence (raw outputs)

Baseline (on trunk tip, before any edit — matches the brief's baseline `Tests 1 failed | 4 passed (5)`,
failing on `journey_human_task_surface_unknown`, surface `record-create`, step `complete-definition`):

```
 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
```

Final run on the final commit `b2997496` (`cd server && npx vitest run src/compiler/journey/labwareDefinitionJourney.test.ts`):

```
 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
```

The ONLY failure is `journey_human_task_surface_unknown` — step `complete-definition`, surface
`record-create` — PRE-EXISTING on the trunk (brief-quoted baseline line: `Tests 1 failed | 4 passed (5)`)
and owned by u2asurf. The three new tests all pass. No second failure exists.

`git -c core.fileMode=false status --short` at exit: clean (only the gitignored node_modules symlinks
exist in the worktree; nothing tracked is modified).

`tsc --noEmit` not run (brief: data + test bodies only, no signature change; test bodies use only
already-imported symbols and `any`-typed YAML access, consistent with the file's existing style).

### Mutation probe A — seam identity (declared in the brief)

Changed ONLY `place-instance`'s input `labware_definition_id` to `LAB-DEF-X`, ran the targeted test:

```
FAIL ... > pins the definition-id seam: complete-definition output_ports[0] is the same
LabwareDefinitionReference as place-instance input_ports[0]
AssertionError: expected 'LAB-DEF-X' to be 'LAB-DEF-1' // Object.is equality
```

(Also, the seam pin's non-empty check would not pass on `undefined`; the same-id assertion is the
discriminating failure.) Reverted; `git diff 7da12346 -- <declaration>` = 0 lines; `git status` clean.

### Mutation probe B — port type at the seam (declared in the brief)

Set `place-instance`'s `input_ports[0]` to `{version: v1, draft_id: DRAFT-1}` (StagedDraftReference).
Raw `port_type_mismatch` from the catalogue-only lint pin:

```
Object {
  "index": 0,
  "message": "consumer port StagedDraftReference cannot be bound to producer port LabwareDefinitionReference",
  "next_step_id": "place-instance",
  "rule": "port_type_mismatch",
  "step_id": "complete-definition",
}
```

Reverted; clean.

## What must NOT change — verified

`journey_id: journey-labware-definition`, `revision: 1`, `request_anchor`, `completion_contract`,
`return_contract`, the `human_task` block, `parameters`, `alternatives`, `assumptions`,
`unresolved_questions[1]`, both capability descriptors, the surface registry, lint/ports/humanTask TS —
none touched. `git diff cd0218ff..HEAD --name-only` lists exactly the two owned files.

## Decisions / notes for the reviewer

- The fast-forward was forced by the missing-files state (finding 1); it rewrote nothing and the
  effective content base is the trunk tip the brief's anchors were verified against. If the reviewer
  expected work strictly on `0fa36082`, that base is unusable for this unit by measurement — it does
  not contain the unit's subject files.
- The node_modules symlinks are environment plumbing, not code: gitignored, uncommitted, and removed
  from this worktree if the reviewer prefers (tests re-runnable after any real `pnpm install` in the
  worktree).
- The pre-existing RED (`journey_human_task_surface_unknown`) is intentionally left in place per the
  brief: the assertion at test:70-77 stays byte-identical and red until u2asurf lands the surface.
- ACCEPTANCE for this unit is WAIVED (data-only); item-level AC1-AC3 are served by u2asurf.

## Next actions / resume conditions

- u2asurf: admit `record-create` into the work-surface registry → the last remaining failure turns
  green; nothing in this unit needs to change.
- Later leg (executor): flip `status.implemented` on the two descriptors and wire `records.create`;
  owned by the later unit this declaration names, NOT this one.

Commits: `7da12346` (data), `b2997496` (pin). Final commit before the report: `b29974967e086d07d4d9cd8f6e091bcb867b6d50`.
