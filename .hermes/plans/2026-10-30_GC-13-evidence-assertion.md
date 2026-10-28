# GC-13 SPEC — Evidence hand-off: results -> evidence bundle -> assertion with full context
> ORCHESTRATOR PROMOTION BANNER (20261028T1350 tick l1t1345): PROMOTED for claim-prep, but the
> header's trunk stamp below is STALE. READ FIRST, before this spec:
> /home/brad/.hermes/cl/lanes/1/gc13-reanchor-l1t1235.md (re-anchor at trunk 6987f286, orch-verified):
> GC-11 MERGED (c6cc1960), GC-12 live at wt/gc-12-lane1-l1t1220. Corrected cites: mode-toggle.TSX:9
> (not .ts:11); measurementContextRef is sequence-action+measurement ONLY (drop well-role-assignment);
> sdkVersion at analysis-revision.schema.yaml:52 (not :88-118); RelatedRecordsHandlers getRelatedRecords :47;
> server tsc baseline is now 0 error lines (orch re-verified at trunk — the '~25 src/ai' number is DEAD);
> still re-derive ALL baselines at claim time against the then-current trunk. D1 mount cites remain
> AMEND-AT-MERGE vs GC-12's results surface (reanchor has the mechanical checklist).
> CLAIM IS STILL GATED ON: GC-12 merge (deps), and GC-11's RGF2 fix cycle + RUNGATE2 closing.
Composer: cl-spec-composer run l1t0055, 2026-10-28. STATUS: DRAFT — awaiting orchestrator cite-audit + promotion.
TRUNK VERIFIED AGAINST: 9f80a6ce56f7c75a6ec7f0cf62caa72d73f10f8a (cl/integration-1 tip; docs tip —
GC-11 code cluster 1ca3e514 NOT yet merged at this writing, adv cycle-1 live; GC-12 undispatched).
EVERY [F] cite below was opened first-hand by the composer at this sha. Because GC-13 deps are
GC-12 (which deps GC-11 + gc-fid-nas load-proof), the trunk WILL drift before dispatch:
**AMEND-AT-MERGE — every [F] cite must be re-anchored against shipped code at claim time**
(GC-11's spec §RE-ANCHOR is the house pattern; expect the results-tab surface to have moved).

## Goal (one sentence)
From a GC run's results surface, a scientist selects an analysis artifact, reviews its FULL
provenance chain (raw hash -> package -> lineage -> context -> method -> revision/run/params ->
reader -> engine -> calibration model/standards), and authors a lint-enforced evidence bundle
(supports/refutes/assesses) onto an assertion/claim through ClaimWorkspace links — with reciprocal
run<->claim navigation and zero AI/UI auto-decision of support.

## Task contract (verbatim from task-list.md :8606-8629)
- title: "Evidence hand-off — results -> evidence bundle -> assertion with full context"
- deps: GC-12. spec path (canonical, post-promotion): .hermes/plans/2026-10-30_GC-13-evidence-assertion.md
- description (verbatim, condensed pointers — read the block itself): select artifact/result from
  a run's results tab; review full context; author evidence bundle (supports/refutes/assesses) onto
  assertion/claim through ClaimWorkspace links; provenance resolves ALL the way down: raw file hash
  -> acquisition package -> sample/material lineage -> acquisition measurement-context
  (calibration/authorization refs stay pinned) -> gc-method revision -> analysis revision/run +
  effective params -> reader version -> ACTUAL ENGINE/VERSION (GC-D3's promise) -> calibration
  model + standards when quantification is claimed. No UI/AI auto-decides support —
  scientist-reviewed with lint-guarded required context. Reciprocal run<->claim navigation.
- verified by (verbatim): "Tests: bundle from a real analysis run passes evidence lint and its
  provenance chain resolves to the NAS hash; missing-context case lint-blocked. Browser receipt:
  reviewer creates a context-qualified assertion and follows evidence back to the acquisition."
- files (task block): app/src/run/ + app/src/claims/ (hand-off flow), evidence lint, server tests

## Provenance hop map — what EXISTS today (schema + live evidence) vs GAPS
Legend: [EXISTS] declarative link present, resolvable; [GAP-n] missing hop -> OQ-n with
recommendation. All [F] = file:line at 9f80a6ce; [F-run] = live API readback on :3092 by composer.

| # | Hop | Status | Cites |
|---|-----|--------|-------|
| 1 | raw file hash | [EXISTS] DREF.contentHash sha256 (schema-required), sizeBytes | schema/knowledge/data-reference.schema.yaml:40-48 |
| 2 | acquisition package | [EXISTS] ACQP pins per-file DREFs via files[].dataReferenceRef (type-pinned `data-reference`), + manifest-level signalCollectionRef (Merkle sha256 of per-file manifest) | schema/knowledge/acquisition-package.schema.yaml:75-134 |
| 3 | package <-> run-row link | [EXISTS] ISEN.acquisitionPackageRef (type: const acquisition-package, GC-3 forward-pin landed by GC-4) | schema/lab/instrument-sequence-entry.schema.yaml:100-107 |
| 4 | sample/material lineage | [EXISTS] ISEN.sampleRef (type: const sample; hierarchy never copied, ref-only), ACQP.sampleRef optional | instrument-sequence-entry.schema.yaml:72-82; acquisition-package.schema.yaml:141-143 |
| 5 | measurement-context with pinned QMS refs | [EXISTS in schema, GAP in GC wiring] MCTX.acquisition_context.calibration_refs/authorization_refs are ref.schema hosts so revisionRef REV- pins are legal; equipment_ref + readout_def_refs required | schema/lab/measurement-context.schema.yaml:53-78; ref datatype revisionRef: schema/core/datatypes/ref.schema.yaml (properties.revisionRef, REV- pattern) |
| 6 | GC run <-> measurement-context | [GAP-1] NOTHING links an analysis-run / ISEN to a measurement-context. measurement.schema.yaml:65 measurementContextRef is plate-side only. Zero MCTX records exist in the lane data dir (no records/measurement-context/ dir; composer ls). -> OQ-2 | server-side grep: measurementContextRef appears ONLY in schema/bio/sequence-action, schema/lab/measurement, well-role-assignment |
| 7 | gc-method revision | [EXISTS] ISEN.gcMethodRef type-pinned gc-method; optional revisionRef REV- pin freezes the revision via the shared ref datatype | instrument-sequence-entry.schema.yaml:84-98 |
| 8 | analysis revision + run freeze | [EXISTS] ANR.revisionRef + frozenRevisionRef; inputs{} name->ref frozen at submit; parameters frozen | schema/knowledge/analysis-run.schema.yaml:30-53,58-59 |
| 9 | effective params | [EXISTS] effective_parameters artifact produced by the run | live [F-run]: AOUT-000021 name=effective_parameters runRef->ANR-000013 |
| 10 | reader version | [EXISTS] DREF.readerVersion; GC-4 registration stamps 'gc-4-registration/1' | data-reference.schema.yaml:59; server/src/storage/acquisitionPackage.ts:466 |
| 11 | ACTUAL ENGINE/VERSION (GC-D3 promise) | [EXISTS, LIVE] ANR.engineProvenance {engineRef, engineVersion, adapter, interpreterPath, interpreterVersion, packages[], probedAt, capabilitiesReported}; ANREV.engineRef pinned | analysis-run.schema.yaml:78-135; analysis-revision.schema.yaml:88-95; live [F-run]: ANR-000013 engineProvenance -> ENG-PYCAL01-L1T2305, engineVersion reference-2026-10, interpreter /usr/bin/python3 3.14.7, capabilities curve_fitting+weighted_regression supported |
| 12 | calibration model + standards | [EXISTS as artifacts] calibration_model artifact AOUT-000020 (equation, statistics, fit_points w/ relative_residual); standards = run.parameters.levels[] (frozen) + level runs ANR-000008..12 -> AOUT-000014..18; kind calibration-record also exists schema/lab/calibration-record.schema.yaml | live [F-run]: ANR-000013 payload (composer curl readback 2026-10-28) |
| 13 | artifact -> run -> inputs chain | [EXISTS] AOUT.runRef + sourceRelations[]; run.inputs[] ref objects; peak_source row->input-name->run.inputs[name].id hop (GC-11 correction 4) | schema/knowledge/analysis-output-artifact.schema.yaml:27-69; live [F-run]: AOUT-000019/20/21 runRef->ANR-000013, sourceRelations->AOUT-000014..18 |
| 14 | back-navigation (any record) | [EXISTS, LIVE] GET /records/:id/related reverse-reference scan | server/src/api/routes.ts:255; server/src/api/handlers/RelatedRecordsHandlers.ts:44+; live [F-run]: /records/AOUT-000020/related -> ANR-000013 (refField outputManifest.artifactRefs.calibration_model.artifactRecordId) + VSPEC-000907; app client app/src/shared/api/client.ts:3830 + app/src/components/registry/RelatedRecordsCard.tsx |
| 15 | evidence bundle shape | [EXISTS — use verbatim] evidence schema already declares supports/refutes/assesses (anyOf >=1) + sources[] EvidenceSource{type,ref} + quality + status/retraction | schema/knowledge/evidence.schema.yaml:12-53, 88-98 |
| 16 | evidence lint required-context | [GAP-3] evidence.lint.yaml ships `rules: []`; assertion.lint.yaml `rules: []`; measurement.lint.yaml `rules: []` | schema/knowledge/evidence.lint.yaml:4; assertion.lint.yaml:4 |
| 17 | evidence source-type vocabulary | [GAP-2] EvidenceSource.type enum is [result, context, measurement_context, event, publication, file, event_graph] — NO term for analysis-run / analysis-output-artifact / data-reference / acquisition-package | evidence.schema.yaml:96 |

The gate fixture chain the orchestrator seeded (129th handoff) is the ready-made full-chain
fixture: **ANR-000013 (succeeded) -> AOUT-000019/20/21 + ANREV-000008 (engineRef
ENG-PYCAL01-L1T2305) + engineProvenance live + frozen parameters.levels[] standards +
level runs ANR-000008..12 -> AOUT-000014..18**. CAVEAT (composer live-check [F-run]): the level
runs ANR-000008..12 have `inputs: {}` — the CAL chain does NOT descend to DREF/ACQP/NAS hashes.
The acquisition end exists separately: ACQP-GATE-L1T2130 + its per-file DREFs + ISEN-GC3-GATE-001
(lane data dir ls). For the verified-by criterion "chain resolves to the NAS hash" the coder must
seed an API route that WIRES the two ends (run created with inputs pointing at the GC-4 DREF/ACQP
artifacts) — test-data seeding via API is sanctioned (GC-9 OQ-3 posture).

## Design points

### D1 — Entry surface: evidence hand-off from the results tab
The served /runs/:runId route is app/src/run/RunWorkspacePage.tsx [F app/src/App.tsx:45,202].
CRITICAL ROUTING FACT (composer first-hand): app/src/graph/RunWorkspacePage.tsx — which hosts the
results tab, RunResultsTab.tsx, EvidenceAssemblyPanel.tsx, ProvenanceChain.tsx, the analysis-bundle
export — is NOT served by any route (its only importer grep-hit outside itself is a test comment
app/src/event-editor/right-pane/ai/AiTabPanel.chain.test.tsx:10 "a page no route serves"). The
served run page has modes protocol-planning|plan|execute only
(app/src/run/lib/mode-toggle.ts:11). GC-12 (deps, undispatched) owns putting the GC results
surface on the served page. THEREFORE: GC-13 builds its hand-off affordance ON TOP OF GC-12's
shipped results surface — at claim, re-anchor: find where GC-12 landed "results flow back through
the existing analysis-bundle / results tab" (its own description) and mount there. Do NOT
resurrect app/src/graph/RunWorkspacePage.tsx (dead code; reviving it is two-sources-of-truth for
one entity — lane rule). Flow: artifact/result row (AOUT chip with name+dataKind, e.g.
calibration_model) -> "Review full context" (D2 provenance view) -> "Add as evidence…" opens the
bundle authoring form (D3) targeting an existing or newly-authored assertion (ASN) / claim (CLM).
Existing join logic to REUSE (screening reference, unserved code — read for logic, port with tests):
RunWorkspaceService.ts:415-421 evidenceByAssertionId over supports[];
app/src/graph/run-workspace/ProvenanceChain.tsx:20-41 claim->assertion->evidence tree.

### D2 — The provenance-resolution view (the reader walks the chain)
A "full context" panel that renders hop-by-hop, following EXACTLY these ref fields (each a real
record GET, never a cached copy — context-is-everything, refs not copies):
1. artifact: AOUT.runRef, AOUT.sourceRelations, inlineValue/dataReferenceRef
   [analysis-output-artifact.schema.yaml:27,52,65-69]
2. run: ANR.inputs[] (frozen ref objects), ANR.parameters, ANR.revisionRef + frozenRevisionRef,
   ANR.engineProvenance [analysis-run.schema.yaml:30-78]
3. engine: ANR.engineProvenance.engineRecordId/engineVersion/interpreterPath/interpreterVersion/
   packages[]/capabilitiesReported — the ACTUAL engine/VERSION, GC-D3 verbatim. Render the
   declared-vs-actual pairs; no silent fallback, no hiding `approximate`
   [analysis-run.schema.yaml:81-135]
4. revision: ANREV.engineRef + requiredCapabilities + sdkVersion [analysis-revision.schema.yaml:88-118]
5. effective params: the run's effective_parameters artifact (name match on
   outputArtifactRefs/outputManifest)
6. reader version: for each DREF reached (artifact dataReferenceRef, run inputs of type
   data-reference, package files): DREF.readerVersion, DREF.contentHash, storageDeviceId+path
   [data-reference.schema.yaml:30-61]
7. package: ACQP.files[].dataReferenceRef per-file hashes + role, signalCollectionRef manifest
   hash [acquisition-package.schema.yaml:75-134]
8. lineage: ISEN.sampleRef (sample), ISEN.gcMethodRef (+ revisionRef REV- pin when present),
   ISEN.acquisitionPackageRef [instrument-sequence-entry.schema.yaml:63-107]
9. measurement-context + pinned calibration/authorization refs: GAP-1 — render the honest
   "not linked" arm (a named gap, not a blank) unless OQ-2 resolves first. Dead-blank chrome is a
   defect; an honest arm is not.
10. calibration model + standards: calibration_model artifact payload (equation, statistic,
    fit_points with relative_residual incl. the honest null arm GC-11 shipped) + frozen
    ANR.parameters.levels[] as the standards list.
Every hop is a Link into /record/:recordId (existing generic host, App.tsx:208) or the run/claim
surface; unresolved refs render the record id + a loud arm, never silently skipped
(matches GC-11 correction 5: absence of optional pins is not an error, but must be VISIBLE).

### D3 — Evidence bundle authoring (shape = existing schema, verbatim)
No new record type. Author via kind `evidence` exactly as schema/knowledge/evidence.schema.yaml
declares (anyOf supports|refutes|assesses, each minItems 1; sources minItems 1). The scientist
explicitly picks supports / refutes / assesses AND the target ASN/CLM ref via the existing ref
picker (app/src/shared/ref/RefPicker.tsx) — the payload is POSTed via the canonical record-creation
path so Ajv + LintEngine run server-side (RecordStoreImpl create-path runs validate then lint and
rejects lint-invalid — server/src/store/RecordStoreImpl.ts create path: lint.valid check;
skipLint is not exposed to record writes). The existing AI accept path
POST /runs/:id/evidence/accept (routes.ts:452 -> RunDraftHandlers.ts:667-707 store.create) STAYS
as-is for AI-proposal review, but GC-13's scientist path must not pre-fill supports/refutes from
AI output and must not batch-accept without an explicit per-bundle support decision (GC-9/D
boundary: proposal/compiler/preview/accept; EvidenceAssemblyPanel's "AI-proposed … Review
carefully" notice is precedent for the honest label).
Sources mapping for GC hops (declarative, no schema edit): analysis-output-artifact ->
type: result; data-reference -> type: file; measurement-context -> type: measurement_context;
context -> context; event-graph -> event_graph. This is the RECOMMENDED reading of the enum
(GAP-2/OQ-1); the authoring UI writes these pairings from the selected artifact's kind — a data
table, not scattered ifs.
Assertion authoring (when the scientist targets a new assertion): assertion.schema.yaml shape —
claim_ref + scope + context_refs + roles[] + outcome. Ontology discipline from
docs/knowledge-layer-canonical-example.md is BINDING on any claim/subject/predicate/object the
flow pre-fills: one claim = one triple, RO: predicate CURIEs where covered, never claim->claim.
ClaimWorkspace surfaces (D4) must not collapse the materials hierarchy (concept != formulation !=
instance != aliquot != composition) — lineage hops render as their own records/refs, never merged
into one label.

### D4 — ClaimWorkspace: kill the dead chrome (both directions)
/claims/:claimId ClaimWorkspace.tsx is 113 lines of hardcoded "No supporting evidence yet." /
"No linked runs." placeholders (app/src/claims/ClaimWorkspace.tsx:61-100) — dead chrome, and the
item's own files: line claims app/src/claims/. Wire, with data:
- Evidence Ledger: query evidence records whose supports[]/refutes[]/assesses[] target this claim
  (directly or via its assertions' claim_ref — reuse the D1 join semantics) -> Supporting /
  Contradictory / Qualifying groups, each row linking /record/:evidenceId.
- Connections/Runs: GET /records/:claimId/related (client.ts:3830 already exists) + assertions ->
  evidence -> sources -> run/analysis-run refs -> /runs/:runId links.
- Reciprocal run->claim: from the results-tab evidence bundle rows (D1/D3 authored list for THIS
  run, derived from evidence.sources pointing at this run's artifacts/run) link into
  /claims/:claimId. BOTH directions are acceptance criteria; RED-first tests each.

### D5 — Required-context enforcement lives in LINT YAML (no TS policy)
Declare rules in schema/knowledge/evidence.lint.yaml (replacing rules: []) and
schema/knowledge/assertion.lint.yaml, using ONLY the shipped v1 DSL (server/src/lint/types.ts:
exists, nonEmpty, regex, equals, in, all, any, not, everyItem (collectionPath/itemField/assert,
:242-247), allIn, noneIn, compare, state_is; documented schema/lint/lint-v1.schema.yaml). Floor
rules (expressible today):
- evd-supports-target-shape: anyOf-parallel rule — when supports/refutes/assesses present, the
  target ref type must be `assertion` or `claim` (everyItem over the array + in on ref.type).
- evd-sources-cover-run-evidence: when the bundle targets an assertion (supports/refutes),
  sources[] must contain >=1 result-typed and >=1 context- or measurement_context-typed entry.
  CHECK THE DSL FIRST: '>=1 of type X within an array' needs the array-expressible form
  (everyItem is universal-only; an `any`-over-items form may not exist) — if inexpressible, the
  honest fallback (gc-method.lint.yaml INTENT-comment pattern, schema/lab/gc-method.lint.yaml:9-17)
  is: declare what IS expressible, record the un-expressible intent as a comment, and file it to
  the architect rather than faking a rule. Do NOT invent DSL ops (stop boundary).
- assertion-required-context: scope single_context|comparison|series -> context_refs nonEmpty;
  comparison/series -> at least 2 (compare op), roles[] everyItem role_ref+context_ref exists.
severity: error so create is refused (store create rejects lint-invalid — RecordStoreImpl).
YAML RELOAD TRAP: tsx --watch does NOT reload YAML; the lane stack (:3092/:5192) restart after
lint/YAML edits is ORCHESTRATOR-owned; the coder's API-level proofs may run against vitest-built
LintEngine only — do NOT restart the lane stack.

### D6 — No auto-decide, hard
No code path in GC-13's diff may set supports/refutes/assesses or an assertion outcome from AI
output, defaults, or heuristics. The server already enforces the AI read-only wall
(store.create throws-in-tests 'must NEVER reach store.create' family under
server/src/ai/AgentOrchestrator.*.test.ts; acceptEvidence is the human-acceptance seam). A grep
pin (GC-11 [F]-grep-leg pattern): zero new files under app/src or server/src that construct
evidence payloads with supports outside the scientist form handler.

## Explicitly OUT of scope
- No new record kind (the evidence/assertion/claim triplet exists; see OQ-1 before assuming you
  need one). No evidence.schema.yaml edit unless OQ-1 rules the enum widened.
- No GC-14 end-to-end NAS dossier; no real .D execution (GC-14). Synthetic TEST fixtures are fine
  (they are TEST DATA per standing rule).
- No app/src/graph/RunWorkspacePage.tsx resurrection; no app/src/analysis/** renderer edits beyond
  importing shipped components; no AnalysisPage.tsx edits (hot file, D-below).
- No lifecycle/signature workflow on evidence records; no retraction UI (schema fields exist; UI
  rides a future item). No AI drafting changes. No DNA/sequences surfaces.
- No interpreter/engine provisioning (stack config, orch-owned; ENG-PYCAL01-L1T2305 already
  minted). No task-list, no trunk, no canonical plans writes by the coder.

## Hot-file watch (serialization)
- **AnalysisPage.tsx** — hot: GC-10 hydration/hook regions + GC-11 composite mounts (merge
  conflict expected at the 129th handoff playbook item 1; GC-11 FORBIDDEN from touching
  AnalysisPage.css — keep it that way; GC-13 should need ZERO edits here).
- **app/src/run/RunWorkspacePage.tsx / RunResultsTab-mount + GC-12's new results surface** — GC-12
  will rewrite this region between now and dispatch. ALL D1 cites are AMEND-AT-MERGE: at claim,
  first action is re-anchoring where GC-12 landed results; if GC-12 has NOT merged, GC-13 is NOT
  dispatchable (deps).
- **ClaimWorkspace.tsx / ClaimWorkspace.test.tsx** — GC-13-owned; expect no contention.
- RunWorkspaceService.ts — server-side bundle service; extension allowed, keep existing
  analysis-bundle + ai-context response shapes byte-stable for non-GC runs (GC-10/GC-11 precedent).

## First targeted check (prove the approach early, before any UI)
Prove lint-first required-context against the REAL engine with the REAL spec files:
`cd /mnt/vast/home/brad/git/cl-integration-1/server && npx vitest run src/lint/EvidenceLint.test.ts`
(new suite; RED first: a supports-bundle missing a context-typed source must come back lint-invalid
with the named rule id; a complete bundle lint-clean; then write the YAML rules). If the DSL
cannot express the source-coverage rule (D5 note), the check instead proves the expressible floor
and the spec's honest-fallback clause is exercised — decision before UI work, not after.

## Verification (coder runs; orchestrator re-runs independently)
- Vitest from INSIDE the workspace dirs (repo-root --root fakes failures — standing rule):
  `cd server && npx vitest run src/lint/ src/api/ src/run-workspace/ src/knowledge/` and
  `cd app && npx vitest run src/claims/ src/run/ src/shared/ref/` (+ whatever GC-12 results dir
  ships). New suites: evidence lint rules (RED->GREEN, real spec files loaded through
  SchemaLoader/LintEngine, not inline fixtures-only), reciprocal-navigation logic tests (both
  directions against seeded records or store fakes matching the related-records shape), the
  no-auto-decide grep pin, provenance-view hop-resolution test that walks the seeded chain object
  graph (fixture mirroring ANR-000013 shape incl. engineProvenance).
- Typecheck (re-derive baselines, never assume): `cd app && npx tsc --noEmit 2>&1 | grep -c 'error TS'`
  — coder captures the trunk baseline at claim (recent ticks: ~21 lines) and reports ZERO new
  errors; `cd server && npx tsc --noEmit` vs the ~25-line src/ai lane-exclude baseline (baseline
  is lane-observed, re-derive at claim; zero OUTSIDE the pre-existing files).
- exactOptionalPropertyTypes stays ON (server tsconfig): every new optionality flows through
  `...(x ? {x} : {})` — copy the shipped house style (RunWorkspaceService.ts:434-447).
- API integration (lane stack, orch-restartable; coder may NOT restart :3092): POST a full chain
  via the record APIs (evidence + assertion + claim, TEST- ids, unique tag) and assert 201 +
  GET/related readback; the lint-blocked missing-context bundle returns the lint-invalid response
  (NOT a 2xx); DELETE-free — records are test data, no cleanup demanded.
- Chain-resolves-to-hash test: seed a mini-chain per the CAVEAT above (DREFs with real sha256 of
  tmp files, ACQP via GC-4 registration service/route, run inputs -> DREF, evidence -> artifact);
  test walks it hop by hop to contentHash. This is the automated witness for the verified-by line;
  the browser witness is the gate.
- Browser gate (orchestrator-owned Playwright on :5192/:3092; coder NEVER runs it). Gate criteria
  handed to the reviewer verbatim:
  G1 /analysis shows ANR-000013 (TEST GC-11 calibration run) and its composite/calibration view
     still renders (GC-11 regression guard).
  G2 From the GC run results surface (GC-12's shipped surface, path given at dispatch), reviewer
     selects AOUT-000020 (calibration_model) and opens full context.
  G3 Context view names engine ENG-PYCAL01-L1T2305 + version reference-2026-10 + interpreter
     /usr/bin/python3 3.14.7 verbatim (engineProvenance, not the revision's declared ideal).
  G4 Context view shows standards list from frozen levels[] + equation + effective_parameters
     artifact link; the measurement-context hop renders its HONEST gap arm (unless OQ-2 resolved).
  G5 Reviewer authors an evidence bundle onto a TEST assertion: supports/refutes/assesses chosen
     explicitly, no pre-decision visible; submitting WITHOUT required context shows the lint error
     verbatim; completing it creates EVD-TEST-<tag> (readback 200).
  G6 /claims/:claimId shows the bundle under Supporting (no placeholder text remains for the
     seeded claim).
  G7 Reciprocal: from the claim's workspace, following evidence back lands on the run, and the
     run results surface links back to the claim — BOTH links clicked in one session.
  G8 No console errors; no dead chrome (no hardcoded 'No linked runs' while data exists);
     every negative claim re-verified per the reviewer-reliability rule.

## Worker contract
- Deliverable spec (orchestrator promotes): this draft -> .hermes/plans/2026-10-30_GC-13-evidence-assertion.md.
- Worktree: /mnt/vast/home/brad/git/wt/gc-13-lane1-<tag> off trunk cl/integration-1 tip AT
  DISPATCH (never off a remembered sha); branch wt/gc-13-lane1-<tag>. ALL git with
  `git -c core.fileMode=false` (NFS mode-bit noise).
- Report (unique path): /home/brad/.hermes/cl/lanes/1/gc13-report-<tag>.md — report-first
  discipline: plan + Seeding log (record ids minted on the lane) + per-leg results land in the
  report BEFORE/with the commit; motion arbiter is git log + PID, report mtime lags (AS-L1T2345-3).
- RED-first: every leg lands its failing test first, commit message names the inversion.
- One commit per leg, messages `[GC-13][A] …` … `[GC-13][F] …` (suggested legs: A lint RED,
  B lint YAML GREEN, C provenance-view, D hand-off authoring, E ClaimWorkspace wiring +
  reciprocal nav, F grep-pin + suite/typecheck sweep).
- Records: TEST- prefixed, minted via API only, never hand-edited into the data repo; lane records
  are test data. NEVER touch :3001/:5174, Brad's data dir, or the lane stack lifecycle.
- Stop boundary: any hop needing a NEW schema field/kind beyond OQ rulings -> requires-rescope to
  architect with the exact gap, not an absorbed invention. No faked lint rules, no faked DSL ops.
- End marker: `GC13 DONE <sha>` (or `GC13 BLOCKED <reason>`).

## Open questions
- OQ-1 (source-type vocabulary; was "the evidence-bundle-shape question") — evidence bundle
  SHAPE EXISTS and is used verbatim (D3) — good news, no new triplet needed. But EvidenceSource.type
  [evidence.schema.yaml:96] has no term for analysis-run/analysis-output-artifact/data-reference/
  acquisition-package. RECOMMENDATION (smallest declarative change): map artifact->result,
  DREF->file, run context via sourceRelations/parent refs already cited — zero schema edit.
  Alternative B: widen the enum (schema change, one line + tests; requires approval). Checked:
  enum line, RunWorkspaceService/ProvenanceChain joins, canonical-example evidence block uses
  result/context/measurement_context/event_graph/file. Composer recommends A.
- OQ-2 (GAP-1: measurement-context hop) — GC runs/ISENs have no measurement-context link and the
  lane has none; the task text names it ("acquisition measurement-context ... refs stay pinned").
  Options: (A) orch/coder seeds a TEST MCTX with equipment_ref + readout_def_refs +
  acquisition_context.calibration_refs REV-pinned, linked via a NEW optional measurementContextRef
  on analysis-run following the GC-5 optional engineRef zero-backfill pattern
  (analysis-revision.schema.yaml:81-87 comment is the house precedent) — schema addition,
  REQUIRES APPROVAL; (B) put it on instrument-sequence-entry (same-argument, one-field addition);
  (C) GC-13 renders the honest gap arm and the hop ships with GC-14/12. Composer leans A with the
  ref left OPTIONAL (zero backfill, lint can require it for quantitative GC bundles later).
  Checked: measurementContextRef appears in only 3 schema files; lane records dir absent;
  measurement-context.schema.yaml:53-78 acquisition_context ships revision-pinnable calibration/
  authorization refs TODAY — the pinning machinery is ready, only the link is missing.
- OQ-3 (results-tab mount point) — GC-13's D1 surface depends on GC-12's shipped layout; today's
  served page has no results tab and the old one is unserved (D1 cites). RECOMMENDATION: promote
  this spec AFTER GC-12 merges (deps already enforce it) and make dispatch-brief item 1 the
  re-anchor sweep. If GC-12 lands results somewhere unexpected (e.g. a Slot), mount there — the
  Slot migration (bd2cd30f 'Migrate AI feature call sites to <Slot …>') is precedent.
- OQ-4 (evidence.ui.yaml staleness) — evidence.ui.yaml form fields reference $.claimId and
  $.content [F schema/knowledge/evidence.ui.yaml — 'Evidence Content' section] which the evidence
  schema does not declare (no claimId/content properties; unevaluatedProperties:false would REJECT
  them). Dead/stale triplet arm. RECOMMENDATION: fold a minimal ui.yaml correction into GC-13's
  lint/YAML leg (display + form sections for title/supports/refutes/assesses/sources/quality,
  EDITOR-1 block.slots binding honored) — declarative, zero TS. Low risk; ratify at promotion.
- OQ-5 (DSL expressiveness for '>=1 source of type X') — see D5: verify everyItem/any semantics
  against schema/lint/lint-v1.schema.yaml + LintEngine BEFORE committing to the floor rules;
  honest-fallback (declared-intent comment) is sanctioned if inexpressible. If a DSL op is
  genuinely needed, that is an architect stop-boundary item, not a coder invention.

## Reviewer bait (anticipate these; pre-empt in the diff)
1. exactOptionalPropertyTypes sites: every optional hop field rendered into views/requests must
   use the shipped `...(x ? { x } : {})` spread idiom (RunWorkspaceService.ts:434-447 verbatim
   style); a bare `x: maybeU` fails server tsc — and app has its own baseline to hold.
2. YAML-reload trap: lint rules in YAML are NOT hot-reloaded by tsx --watch. All engine-level
   proofs must build the LintEngine in-test from the real spec files; stack restart is
   orchestrator-only. A coder who 'restarts the lane stack to test' has violated the contract.
3. Ontology terms: claim subject/predicate/object authored through this flow must be ontology refs
   with CURIEs (ref.schema.yaml enforces namespace+label for kind: ontology); the claim lint's
   approved-predicate rule injects from PredicateRegistry (claim.lint.yaml:5-14 values []
   injected-at-startup) — check schema/registry/predicates.registry.yaml at claim; do NOT invent
   FAME/FID terms if compound-classes lacks them (wave header: registry has NO fatty-acid terms —
   use TEST- labels honestly or ontology CURIEs where they exist; a fabricated CURIE is a defect).
   Never collapse concept != formulation != instance != aliquot != composition in any lineage view.
4. Hardcode boundary: no kind names, support verdicts, source-type mappings, or required-context
   lists as TS string literals — mappings are data tables derived from schema or declared in YAML;
   the grep leg must return zero domain literals in the new handler/component files. Required
   context is LINT YAML (D5), never an if-chain in the form.
5. Auto-decide smuggling: supports pre-filled from AI draft, from the last-used value, or from a
   'suggested' default = defect; the form starts empty and submission is an explicit scientist act;
   acceptEvidence must stay human-triggered. Also: no UI may present `approximate` capability
   support as `supported` (engineProvenance.capabilitiesReported renders verbatim, GC-D3).
6. Two names for one entity: 'run' = kind `run` (study execution); analysis-run = ANR; ISEN is a
   sequence row. Views must label each with its record kind; no 'Run' column silently mixing ANR
   and run links.
7. related-scan semantics: /records/:id/related does a full store.list() scan (O(N), exact-match
   on any string field incl. labels — RelatedRecordsHandlers.ts findRefFields pushes on
   `kind: 'record' && id === target`, but plain-string matches too); do not treat its refField
   output as typed — filter by schemaId on the client; do not add a second reverse index.
8. Fixture drift is known: AOUT-000013 (inlineValue+dref both present, GC-10 noise note) — do not
   gate against it; gate against the named 129th-handoff fixtures (ANREV-000008/ANR-000013/
   AOUT-000019/20/21, VSPEC-000900-905 prior-noise caveat applies at the gate).
9. Lint severity: a rule at severity warning does NOT block create (only lint-invalid fails —
   check severity semantics in LintEngine at claim); the required-context floor rules must be
   severity error AND the test asserts the create rejection path, not just lint.valid=false.

## What the composer could NOT resolve locally
(1) GC-12's shipped results-tab shape — does not exist yet (deps, undispatched; OQ-3).
(2) LintEngine severity-to-block semantics line-verified (create-path check confirmed at
RecordStoreImpl create, exact severity filter inside LintEngine.lint() not read line-by-line —
flagged in bait 9 for the coder to pin).
(3) cl-scout recon was dispatched once and timed out at 300s (shared endpoint congestion);
everything load-bearing in this spec was then verified first-hand — no scout claim is cited.

TRUNK VERIFIED AGAINST: 9f80a6ce56f7c75a6ec7f0cf62caa72d73f10f8a
