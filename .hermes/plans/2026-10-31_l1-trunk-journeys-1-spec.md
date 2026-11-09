# SPEC — L1-TRUNK-JOURNEYS-1 (lane 1) — trunk journeys harness
Dispatched: 20261031T1055 (l1t1045) | Owner: cl-coder (wt/l1-trunk-journeys-1-lane1-l1t1045)
Approved task: BRAD-APPROVED 2026-10-31 ("append blocks 1-3 onto both lane task-lists";
proposal ~/.hermes/specs/plans/2026-10-31_trunk-journeys-and-roundtrip-gate-proposal.md).
Deliverable/report path (UNIQUE, write progress here):
  /home/brad/.hermes/cl/lanes/1/l1-trunk-journeys-1-report-l1t1045.md
Receipts home: /home/brad/.hermes/cl/receipts/L1-TRUNK-JOURNEYS/<ts>/
End marker (full 40-char sha): `L1-TRUNK-JOURNEYS-1 DONE <sha>` / `L1-TRUNK-JOURNEYS-1 BLOCKED <reason>`

## Goal (one paragraph)
ONE re-runnable harness for lane 1 that runs the GC product loop END-TO-END against the
lane-1 TRUNK stack over REAL transport: journeys declared as DATA (YAML), executed by ONE
driver. A red journey must make the next tick decline to claim new work (RED-BLOCKS-CLAIMS:
the receipt set's verdict file is the machine-readable signal). This is harness/tooling +
journey YAML — NO product-code changes in the happy path (the canary severs a product line
only on a SCRATCH branch, reverted before done).

## Ground rules (hard)
- REAL transport only. No fetch/route interception of /api/ai/** anywhere in the harness —
  the driver must SELF-CHECK for banned interception patterns and fail closed (non-zero) if
  any exist in its own code/config. Model-layer fakes are allowed ONLY at the model/engine
  boundary, never at the /api/ai/** HTTP boundary.
- Writes land ONLY in a SEEDED THROWAWAY data dir. Never ~/.computable-lab (Brad's live
  dir), never /home/brad/.computable-lab-lane1 (that is the shared lane store). Run-meta
  must carry a digest proof (dir identity + before/after state) that ~/.computable-lab was
  untouched.
- The harness must manage its OWN stack processes (spawn + kill by recorded PID only).
  NEVER pkill/kill patterns; NEVER touch :3001/:5174/:3092/:5192/:3093/:5193. Use dedicated
  free ports (recommend backend :3094, frontend :5194 — probe with curl first; if occupied,
  pick another and record it in run-meta).
- Declarative rule: journey steps are DATA (YAML). TypeScript/Python only interprets them.
  No per-step hardcoded policy in the driver.
- Lane-2's L2-TRUNK-JOURNEYS-1 has NOT landed — build lane 1's own harness under
  `scripts/trunk-journeys/` (do not import/fork lane-2 files).

## Orchestrator-screened orientation (verified first-hand on trunk dec491dc; scout-assisted
## but scout is screening only — trust the VERIFIED marks, re-check anything else yourself)
- [VERIFIED] POST /api/analysis-runs (createRun) — server/src/api/routes.ts:1282;
  POST /api/analysis-runs/:id/execute (executeRun) — routes.ts:1284; GET /analysis-runs/:id
  — routes.ts:1283. Handlers: server/src/api/handlers/AnalysisHandlers.ts.
- [VERIFIED] POST /api/acquisition-packages/register — routes.ts:435 (RunSheetHandlers.register);
  body needs `directoryKey` — the .D directory key relative to the device root
  (server/src/api/handlers/RunSheetHandlers.ts:123-130). Registration PUTs
  payload.acquisitionPackageRef onto the target entry (RunSheetHandlers.ts:194-204).
- [VERIFIED] POST /api/acquisition-packages/:id/analysis-inputs — routes.ts:436 (verify-first
  returning { signal, package }; `package` is the DIRECTORY-kind manifest DREF — the
  runner-consumable pin is the FILE-level data-reference, see GC-12 fix-cycle-3 comment in
  app/src/run/gc/GcSectionChrome.tsx:231-244).
- [VERIFIED, CORRECTS SCOUT] The run-row flow-back (`entry.analysisRunRefs` append-only
  merge) is CLIENT-SIDE: app/src/run/gc/gcRunSheetModel.ts:9,57,148,164; schema field
  analysisRunRefs declared schema/lab/instrument-sequence-entry.schema.yaml:109.
  There is NO server-side append (zero server/src refs outside tests). Consequence:
  J1's "row appears with status" leg MUST be exercised through the UI (the Analyze button's
  client merge + persisted PUT), which is exactly the seam this harness exists to cover.
  The canary therefore severs a CLIENT-side merge step on a scratch branch.
- [VERIFIED] Frontend routes: /analysis — app/src/App.tsx:229; deep-link consumer
  app/src/analysis/AnalysisPage.tsx (GC-11 D3 `?run=` mount, ~:262-270, seeds
  manifest+artifactRefs client-side from payload.outputManifest); GcSectionChrome.tsx:227-244
  creates the run then navigates to /analysis?run=<id> (:258).
- [VERIFIED] Evidence/assertion endpoints (J2): POST /api/runs/:id/evidence/draft (:464),
  evidence/accept (:465), evidence/assemble (:469), assertions/draft (:470),
  assertions/check-contradictions (:471) — RunDraftHandlers.
- [VERIFIED] Seed script exists: scripts/qms-demo-seed.mjs (11 QMS fixtures; seeds NO GC
  runsheets/GC-method/analysis fixtures) — journeys must create their own GC fixtures via
  the API against the fresh dir, seeded per run.
- [SCOUT, verify before relying] run-sheet pages: /sequences page (App.tsx:227-228); GC run
  surfaces app/src/run/gc/ (GcRunSheetSection.tsx, GcAttachPanel.tsx, GcEvidenceHandoff.tsx,
  GcEvidenceRunPage.tsx). .D fixture material: check server/src/storage/acquisitionPackage.test.ts
  for existing .D-tree fixtures to reuse; do NOT invent instrument data — the GC-4/.D
  registration tests (server/src/api/handlers/RunSheetHandlers.test.ts,
  server/src/analysis/analysisGcIntegration.test.ts, analysisRunner) show what a real .D
  acquisition tree looks like; copy the smallest real-fixture shape into the journey seed.
- [VERIFIED] Trunk: cl/integration-1 @ dec491dc (+1115e9c6 docs). node_modules for worker
  worktrees are SYMLINKED (pattern: wt/widget-r1-lane1-l1t0510/node_modules ->
  /mnt/vast/home/brad/git/cl-integration-1/node_modules, same for server/node_modules).

## Work items
1. Journey declarations (DATA): scripts/trunk-journeys/journeys.l1.yaml with J1 and J2 as
   step lists (step kinds: seed/api/browser-navigate/browser-expect/api-expect). Driver:
   scripts/trunk-journeys/run-trunk-journeys.(ts|mjs) — single driver, executes the YAML
   against the live trunk stack (spawned by the harness), REAL transport, Playwright for
   rendered-surface assertions (chromatogram VISIBLE non-blank w/ trace present — assert on
   actual rendered SVG/canvas trace content, not container presence alone).
2. J1 GC loop (verbatim task text): create run -> bind gc-method -> add sample -> attach a
   REAL .D (GC-4 registration) -> Analyze (Flow A create in place) -> results flow-back row
   appears with status -> /analysis?run=<id> renders the chromatogram VISIBLE (non-blank,
   trace present).
3. J2 evidence hand-off: from the completed analysis-run row, GcEvidenceHandoff -> evidence
   bundle -> assertion with the full context graph (knowledge-layer canonical shape — read
   docs/knowledge-layer-canonical-example.md BEFORE asserting; the context graph assertion
   is server-side via the /runs/:id/evidence|assertions endpoints above).
4. Stack management: harness spawns its own backend (CL_DATA_DIR=<throwaway>, seeded fresh
   per run — scripts/qms-demo-seed.mjs where relevant + GC fixtures created via API) and
   frontend on dedicated free ports; tears down by recorded PID in a trap. run-meta.json
   records: ports, data-dir path+identity, created record ids (server-side write trail),
   ~/.computable-lab digest before/after (must be unchanged), stack startup/shutdown ok.
5. Receipts + RED-BLOCKS-CLAIMS: each run writes
   /home/brad/.hermes/cl/receipts/L1-TRUNK-JOURNEYS/<ts>/journeys-verdict.json (machine
   readable: {result: green|red, journeys:[{id, result, failed_step}]}), per-step log,
   screenshots (browser legs), run-meta.json. Exit code non-zero iff any journey red.
6. CANARY (acceptance 2): on a SCRATCH branch (never merged), sever the client
   results-flow-back merge (gcRunSheetModel analysisRunRefs append or the Analyze click
   handler that performs it) -> run harness -> J1 MUST go RED -> revert scratch branch ->
   GREEN again. Commit NOTHING from the scratch branch to the worktree branch; the
   scratch-branch commits live only as refs/receipt evidence (record sha + revert proof in
   the report).
7. RED-declines demo (acceptance 3): with a red receipt set in place, run the harness's
   tiny `check-green` entry point (or documented one-liner reading the newest
   journeys-verdict.json) and show it exits non-zero — the tick's pre-claim read. Record the
   demonstration in the report.
8. Tests: driver unit tests for YAML parsing/validation (malformed journey fails closed),
   banned-interception self-check test (inject a fake /api/ai/** route interception in a
   fixture config -> driver refuses). Typecheck both touched surfaces; no new tsc errors vs
   trunk baseline (server has 33 pre-existing TS errors — parity, not zero).

## File ownership
MAY CREATE: scripts/trunk-journeys/** (driver, journeys YAML, tests, fixtures seed data);
docs/trunk-journeys-l1.md (how the tick reads the verdict); receipts under the receipts home
(run artifacts, not git).
MUST NOT TOUCH: any app/ or server/ product file on the worktree branch (scratch-branch
canary excluded and reverted), schema/**, Brad's trees, the lane stacks' ports.

## Stop boundary
If J1 or J2 cannot complete over real transport because a PRODUCT gap exists (endpoint
broken on trunk, chromatogram never renders, evidence graph shape wrong) — STOP, write the
failure into the report as BLOCKED with the exact request/response/screenshot evidence, and
return; do NOT weaken the journey to pass, do NOT fix the product in this item. Harness
bugs are yours to fix; product gaps go to the orchestrator/architect.

## Verification commands (orchestrator will re-run)
- node scripts/trunk-journeys/run-trunk-journeys.mjs --help (or documented entry)
- full GREEN run producing the receipt set (report must name the newest <ts> dir)
- cat <receipts>/<ts>/journeys-verdict.json
- digest proof block in run-meta.json
- canary + revert evidence lines in the report
- npm run typecheck (workspaces touched) — parity with trunk baseline
