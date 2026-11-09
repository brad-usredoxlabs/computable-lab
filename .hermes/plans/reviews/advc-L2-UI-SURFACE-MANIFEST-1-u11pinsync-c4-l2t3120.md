ADVERSARIAL REVIEW — L2-UI-SURFACE-MANIFEST-1 / leg u11pinsync (review cycle 4)

Reviewer: cl-adversarial-reviewer (openrouter deepseek/deepseek-v4.1-flash)
Worktree: /home/brad/cl-wt/wt-L2-UI-SURFACE-MANIFEST-1-u6checker
Branch:   cl/lane2-ui-surface-manifest-1-u6checker
Delta under review: 994d3745^..HEAD  (i.e. ab2c4a4e = code/test change, 994d3745 = report+marker)
Spec: .hermes/plans/2026-11-05_0740-L2-UI-SURFACE-MANIFEST-1-spec.md (PROMOTED)

VERDICT: ACCEPT
  Leg defects: 0.  Cycle-3 FIX-1 (sibling schema suite RED at HEAD) is VERIFIED RESOLVED.
  Carry-forward observations (OBS-1..OBS-5) below are item-level filing decisions, not leg defects.

=====================================================================
1. THE DELTA (full diff read, file by file)
=====================================================================
$ git -c core.fileMode=false show --stat ab2c4a4e
  server/src/schema/SurfaceManifestSchema.test.ts | 20 +++++++++++++++++++-
  1 file changed, 19 insertions(+), 1 deletion(-)

$ git -c core.fileMode=false diff --name-status 994d3745^..994d3745
  A  .hermes/plans/reports/L2-UI-SURFACE-MANIFEST-1-u11pinsync-report.md

Both files read in full (git show ab2c4a4e / git show 994d3745). The ONLY code-text
change anywhere in the delta is inside the two literal arrays of
`validates the committed manifest and pins surface + pane sets`
(SurfaceManifestSchema.test.ts:35-63):
  - surface-id pin: 7 ids -> 19 ids (tail appended after 'registry-host'):
    claims-collection, graph-search, lab-collection, literature-list,
    projects-collection, runs-collection, sequences-list, settings, splash,
    deck-host, project-event-graph, record-create.
  - paneVocabulary: one-line `toEqual(['ai-chat','event-editor','deck','project-tabs'])`
    -> multi-line `toEqual([... ,'collection-list'])`.
No production file, no schema YAML, no config/ui/surfaces.yaml, no script, no app file.
CONFIRMED: "the ONLY code change must be in SurfaceManifestSchema.test.ts" -> PASS.
Non-weakened: base `grep -c 'it('` = 4, HEAD = 4 (no test removed/added); no
`.only`/`.skip`/`.todo`/`toBeTruthy()`-style no-op assertion in the file (grep empty).

=====================================================================
2. SPEC ACCEPTANCE CRITERIA (verbatim from §4) AND HOW EACH WAS CHECKED
=====================================================================
AC1 "Route parity is mechanical": scripts/check-ui-surfaces.py prints
    ROUTES=41 DECLARED=<n> MISSING=0 PHANTOM=0 ... and must resolve lazy import() strings.
    CHECKED — ran it. Output is EXACTLY as I measured (below). MISSING is 22, not 0:
    the literal AC1 is NOT met at item level (see OBS-2). The mechanical part (41 routes
    counted, lazy imports resolved, UNRESOLVED-IMPORTS=0) IS met.
AC2 "Ajv is the validation authority": manifest validates through the real
    schema-registry/Ajv path; malformed /tmp manifest rejected with schema error text.
    CHECKED for this leg — SurfaceManifestSchema.test.ts drives createSchemaRegistry +
    loadSchemasFromContent + AjvValidator (no bespoke validator), 4/4 green, including
    negative legs uniqueItems and additionalProperties. (The full /validate-full HTTP
    path was a unit-1 artifact, not re-run here — no production change in this leg can
    affect it: zero server/src non-test files changed in the delta.)
AC3 "Lint fires, non-vacuously".
    CHECKED (sibling suite) — SurfaceManifestLint.test.ts 5/5 green, including (b) a
    phantom pane 'dec' producing a finding naming the value, and (c) the drift pin that
    rule.values must equal manifest.paneVocabulary. Both assertions are real `expect`s.
AC4 "Zero behaviour change: pnpm typecheck at the same baseline; app and server test
    suites at the same counts; diff confined to schema/ui, config/ui, script,
    deliverables."
    CHECKED — `npm run typecheck` in server is RED, but for a PRE-EXISTING ENVIRONMENT
    reason, not this leg (full text + proof in OBS-4). The delta cannot move tsc: the
    only changed TS file is `**/*.test.ts`, explicitly EXCLUDED by server/tsconfig.json
    ("exclude": [... "**/*.test.ts"]) — so the tsc error set is identical at HEAD^ and
    HEAD by construction. "Zero files under app/src/** or server/src/** modified" is
    violated only in the sense that a server/src TEST file's pinned literals were
    updated; that file is part of the item's deliverable (spec §8: "targeted vitest boot
    test shows the new lint spec loads") and was already present at the leg base, so the
    leg adds no new file class. See OBS-1.
AC5 "The orphan artifact": committed deliverables/ui-surface-manifest-1/orphans.txt.
    CHECKED — present; my checker run printed
      "Orphan artifact: .../deliverables/ui-surface-manifest-1/orphans.txt (42 orphans,
       719 scanned)" and git status stayed clean (file content unchanged by the run).

=====================================================================
3. THE TASK'S MANDATED CHECKS — MY OWN RUNS
=====================================================================
[Check 2] $ cd server && npx vitest run src/schema/SurfaceManifestSchema.test.ts src/schema/SurfaceManifestLint.test.ts
  RUN  v1.6.1 /home/brad/cl-wt/wt-L2-UI-SURFACE-MANIFEST-1-u6checker/server
   ✓ src/schema/SurfaceManifestLint.test.ts  (5 tests) 75ms
   ✓ src/schema/SurfaceManifestSchema.test.ts  (4 tests) 95ms
   Test Files  2 passed (2)
        Tests  9 passed (9)
  MATCHES the brief (2 files / 9 tests GREEN). PASS.

[Check 3] $ python3 scripts/check-ui-surfaces.py ; echo EXIT=$?
  UNRESOLVED-IMPORTS=0
  ROUTES=41 DECLARED=19 MISSING=22 PHANTOM=0 CATCHALL=1 REDIRECT=2 SLOT-HOST=1
  EXIT=0
  Census is byte-identical to the briefed one. PASS.

[Check 4] DONE marker names ab2c4a4e; `git show --stat ab2c4a4e` must contain this unit's change.
  $ grep -nE 'DONE [0-9a-f]{40}' .../L2-UI-SURFACE-MANIFEST-1-u11pinsync-report.md
    37:L2-UI-SURFACE-MANIFEST-1 UNIT u11pinsync DONE ab2c4a4ece3c25da49467a26d8b43d1a13cb9249
  (full 40-hex, not abbreviated; `git merge-base --is-ancestor ab2c4a4e HEAD` -> rc=0)
  $ git show --stat ab2c4a4e -> 1 file changed, 19 insertions(+), 1 deletion(-),
    server/src/schema/SurfaceManifestSchema.test.ts = exactly this unit's change. PASS.
  NOTE (consistent with the brief's own wording, not a defect): the marker LINE lives in
  the follow-up commit 994d3745, so `git cat-file -e ab2c4a4e:<report>` is rc=128. The
  task defines the criterion as "names ab2c4a4e; verify ab2c4a4e contains the unit's
  change", which is satisfied. (Cycle 2 raised this shape as FIX-1 under a stricter
  "must contain its own marker" rule; that rule is not the one briefed here.)

[Check 5] $ git -c core.fileMode=false status --porcelain
  (empty) — tree clean at 994d3745. `git rev-parse HEAD` = 994d3745ab1d2067...c067. PASS.

[System-required] $ cd server && npm run typecheck
  > tsc --noEmit
  src/storage/S3StorageProvider.ts(87,33): error TS2307: Cannot find module
  '@aws-sdk/client-s3' or its corresponding type declarations.
  npm error code 2
  ONE error, in a file this lane has never touched. See OBS-4 (proven environmental).

SIBLING-SUITE SWEEP (my own extra gate, because cycle 3's blocker was "sibling suite"):
  $ cd server && npx vitest run src/ui/SurfaceManifestUiSpec.test.ts
    Test Files 1 passed (1) / Tests 1 passed (1)
  $ cd server && npx vitest run src/schema/      (all 57 schema test files)
    Test Files 35 failed | 17 passed | 5 skipped (57)
    Tests 207 failed | 279 passed | 53 skipped (617)
  The two SurfaceManifest files are GREEN inside that run; every red file fails on
  `missingRef: .../datatypes/revision-ref.schema.yaml`, and that file is absent from the
  branch and from disk because it is a LANE-EXCLUDE entry:
  $ git check-ignore -v schema/core/datatypes/revision-ref.schema.yaml
    /home/brad/.hermes/cl/lanes/1/lane-exclude:48:/schema/...  schema/core/datatypes/revision-ref.schema.yaml
  $ git ls-tree -r --name-only HEAD | grep -c 'revision-ref.schema'  -> 0
  i.e. the file was NEVER in this branch. Pre-existing environmental RED, identical at
  HEAD^ (the leg changes no non-test file), NOT a regression. See OBS-5.

=====================================================================
4. MUTATION CONTROL — IS THE NEW PIN LOAD-BEARING? (not just green)
=====================================================================
Read-only /tmp probe (worktree untouched): copied server/ (node_modules symlink preserved),
schema/ symlinked, config/ui/surfaces.yaml COPIED, so the test resolves cwd-relative files
exactly as in the worktree. Baseline in probe: 4 passed.
  MUTANT A — delete surface 'splash' from the copied manifest:
    AssertionError: expected [ 'run-workspace', ...(17) ] to deeply equal [ 'run-workspace', ...(18) ]
    Tests 1 failed | 3 passed (4)                      -> pin catches SURFACE shrink. RED.
  MUTANT B — drop 'collection-list' from paneVocabulary:
    AssertionError: expected [ 'ai-chat', 'event-editor', ...(2) ] to deeply equal [ ...(3) ]
    Tests 1 failed | 3 passed (4)                      -> pin catches PANE-VOCAB shrink. RED.
  MUTANT C — swap the test file for the pre-fix b240951d version, HEAD manifest kept:
    FAIL ... > validates the committed manifest and pins surface + pane sets
    +   "claims-collection" ... + "record-create"
    Tests 1 failed | 3 passed (4)                      -> reproduces the coder's claimed
                                                          RED-at-base exactly (1 failed,
                                                          +5 lint tests = 1 failed | 8 passed).
  RESTORED -> Tests 4 passed (4). Probe tree removed (`ls -d /tmp/pinprobe` -> none).
The pin is a real ordered toEqual on the full array (not a subset/containment check), so it
fails on shrink, growth, reorder and rename: non-vacuous in both directions.

=====================================================================
5. HUNT LIST (adversarial pattern checks)
=====================================================================
- Hardcoded domain logic in TS: the only literals added are EXPECTED VALUES in a test pin, not
  production branching. Production (schema + lint YAML + checker) stays data-driven; the pin is
  the spec-mandated "shrink-guard-equivalent pin" (§2). No schema-name branching, no kind map,
  no prefix table in production code. PASS.
- Ajv bypass / parallel validator: unchanged and none added — the suite validates through
  createSchemaRegistry + AjvValidator. PASS.
- exactOptionalPropertyTypes: no production object literals in the delta. N/A.
- Materials hierarchy / knowledge-layer conflation / CURIE-vs-free-text: N/A to a test-pin leg.
- Tests asserting nothing: all four `it(` blocks keep their substantive assertions
  (valid===true, exact id list, uniqueItems error, additionalProperties error); counts 4->4. PASS.
- Files outside approved scope: delta = 1 test file + 1 report. No config/schema/script/app
  file. PASS (spec §5's owned-files list omits the test file, but §8 mandates the vitest test;
  the file pre-dates this leg — OBS-1).
- YAML changed without stack restart: no YAML touched in this leg, so no restart question.
  (Census is produced by a read-only Python script, not by a running server.)
- Verdict of the report's own numbers: every numeric claim in the u11pinsync report
  (base b240951d = 994d3745~2's parent, code commit, RED 1 failed | 8 passed, 19-vs-7 mismatch,
  4->5 pane list, census line) is TRUE against my own runs. Report line number claim
  "SurfaceManifestSchema.test.ts:35" matches the base file's toEqual at line 35.

=====================================================================
6. CARRY-FORWARD DEBT — DOES IT BLOCK ITEM ACCEPTANCE?
=====================================================================
FIX-2 (cycle 3, minor) — duplicate host identity: deck-host / project-event-graph /
  record-create vs the pre-existing host-keyed prose (surfaces.yaml:63 record-host "also
  served at /record/new/:nodeType/:parentId?"; :74 project-deck-tab "also served at
  /project/:studyId/event-graph/:eventGraphId").
  JUDGEMENT: STAYS FILED, does not block integration. The duplicate lives only in
  `description`, a field the spec §3.1 explicitly says "no rule reads"; the `route` fields are
  distinct and the checker counts 19 real declarations with PHANTOM=0. Cleanup is a
  prose/vocabulary ruling for the architect — re-litigating it here would be a new FIX on
  pre-existing data this leg was forbidden to touch.
FIX-3 (cycle 3, minor) — 'collection-list' is a manifest-level taxonomy label with no
  component resolution; the checker has no pane resolution (PHANTOM counts route patterns,
  see check-ui-surfaces.py:264-289) and phase 1 has no runtime consumer.
  JUDGEMENT: STAYS FILED, does not block. It is a known phase-1 limitation, documented, and
  no production consumer can observe it.

OBS-1 (spec inconsistency, pre-existing) — spec §5 "Owned files: ... Nothing else" / §4.4
  "zero files under server/src/**" vs spec §8 "targeted vitest boot test shows the new lint
  spec loads". The two surface-manifest test files are under server/src/schema/ and were added
  by u1lintrules (b333de15, 6004c9f1) / u4chathosts (88b7b939) before this leg; this leg only
  edits one. Not introduced here; flagging so the orchestrator can decide whether §4.4's
  literal wording needs an amendment rather than holding the item to a contradictory pair of
  clauses.
OBS-2 (item-level, pre-existing) — spec AC1's literal "MISSING=0" is NOT met: DECLARED=19 of
  ROUTES=41, MISSING=22 (22 routes named in my run's output, incl. /chat, /ingestion*, /lab/*,
  /event-editor*). The briefed census treats 22 as the expected state and u8/u10 reports call
  the item open ("22 MISSING routes still need pane-vocabulary decisions in later units"), so I
  do not raise it as a leg FIX — but the item cannot be signed off as AC1-complete until 22
  routes are declared or the AC is re-scoped.
OBS-3 (spec §2 ambiguity, pre-existing) — §2: "New ids require the same CURIE-style local-term
  treatment (cf:surface-…) and a shrink-guard-equivalent pin". The 12 ids added in u8/u10 are
  bare kebab strings; `grep -rn 'cf:surface' config schema server/src app/src` returns nothing,
  and there is no `config/ui/surfaces.manifest.yaml` sha manifest (chat-hosts has
  config/chat/chat-hosts.manifest.yaml + harness shrink guard). The vitest exact-list pin this
  leg maintains is plausibly the intended "shrink-guard-equivalent" (it fails on any shrink),
  and the chat-hosts precedent itself uses bare ids — so this is a spec-language question for
  the architect, not a defect introduced by this leg.
OBS-4 (environment) — `npm run typecheck` fails on
  src/storage/S3StorageProvider.ts(87,33) TS2307 '@aws-sdk/client-s3'. The workspace symlink is
  DANGLING: server/node_modules/@aws-sdk/client-s3 -> ../../../node_modules/.pnpm/
  @aws-sdk+client-s3@3.1163.0/... while the store only has @aws-sdk+client-s3@3.1154.0
  (`readlink -f` prints nothing; `ls .pnpm | grep -c aws-sdk` = 17 dirs, none 3.1163.0).
  Not caused by the leg: the leg's only TS change is excluded from tsc by
  server/tsconfig.json ("exclude": ["node_modules","dist","**/*.test.ts"]), so the error set is
  identical at HEAD^ and HEAD.
OBS-5 (environment, baseline RED) — whole `src/schema/` dir: 35 failed / 17 passed / 5 skipped
  files, 207 failed tests, all on the missing schema ref
  `https://computable-lab.com/schema/computable-lab/datatypes/revision-ref.schema.yaml`, whose
  file is absent because it is listed in /home/brad/.hermes/cl/lanes/1/lane-exclude:48 and
  `git ls-tree -r HEAD | grep revision-ref.schema` = 0 (never in this branch). Identical at
  HEAD^; not a regression. Reported so the "sibling suite" question is closed with evidence
  rather than assumed.

=====================================================================
7. EVIDENCE HYGIENE
=====================================================================
I made no edits to the reviewed worktree and no commits. All mutation work happened in
/tmp/pinprobe (removed; `ls -d /tmp/pinprobe` -> No such file or directory). No __pycache__
left behind. Final `git -c core.fileMode=false status --porcelain` in the worktree: EMPTY.
HEAD unchanged at 994d3745ab1d2067adaa2569986862fd4918c067.

=====================================================================
FINAL VERDICT: ACCEPT
=====================================================================
No defect found in the fix leg 994d3745^..HEAD. FIX-1 from cycle 3 (sibling schema suite RED)
is resolved and I proved it is not a vacuous green: removing a surface or a pane-vocabulary
entry turns the suite RED, and the pre-fix test file is RED against the HEAD manifest.
FIX-2 / FIX-3 remain filed observations, not blockers. Item-level sign-off still depends on
OBS-2 (AC1 MISSING=22 vs literal MISSING=0) and the OBS-1/OBS-3 spec-question resolutions.
