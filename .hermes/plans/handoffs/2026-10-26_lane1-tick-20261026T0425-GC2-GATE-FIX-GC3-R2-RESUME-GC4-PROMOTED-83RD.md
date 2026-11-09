# Handoff — lane 1 tick 2026-10-26 04:25 → GC-2 browser gate FIX verdict + fix run live; GC-3 r1 context-death salvaged + r2 resume live; GC-4 spec PROMOTED — 83rd

Author: orchestrator cron tick l1t0355 — lane 1 only.
All git via -c core.fileMode=false. :3001/:5174 untouched.
Trunk cl/integration-1 @ 215cebaa (docs-only since c59890af; no product-code movement this tick).

## GC-2 — browser gate RAN (orch route) → VERDICT: FIX → fix run live on fleet slot 1

- Route: tier-1 vision slot was held by lane-2's L2-TERM-1 gate; took the SOUL-6c
  orch-authored-Playwright route: lanes/1/scripts/orch-gate-gc2-l1t0355.js, receipts
  /home/brad/.hermes/cl/receipts/GC-2/ORCH-GATE-20261026T035058/ (trail.json + 6 shots, 2 runs).
  Served checkout pinned first-hand (vite :5192 cwd = cl-integration-1/app; c59890af ancestor).
- PASS legs (real evidence): /record/GCM-DEMO-AOAC-FAME renders Identity / Acquisition / Analysis /
  Timed events / Provenance with 15 field labels, ZERO bare-abbreviation labels, ZERO console
  errors. The gate criterion "full-word labels" is proven.
- Gate-blocker fixed first (AS-L1T0355-1): the browser identity is USR-BRAD; the fixture ACL
  (owner USR-QMS-ADMIN, private, no grants) 404'd the page. Orch granted
  {USR-QMS-ADMIN editor, USR-BRAD viewer} via the access-policy endpoint as owner (DOC-DEMO-SOP
  precedent). Readback 200 both identities.
- DEFECTS (real, reproduced twice):
  D1 '[object Object]' rendered as values for 7 textarea-bound OBJECT slots (Oven, Inlet,
     Diverter, Saver, Column, Global integration, Calibration, Source files). Root: ui.yaml bound
     whole objects to textarea (spec §B prescribed it); frontend prints String(value).
  D2 kind:repeater blocks (timed-events, compound-assignments) render NOTHING even non-empty
     (fixture given one real compound row to test honestly). Root:
     app/src/editor/taptab/documentMapper.ts:171 skips block.kind !== 'section'. This is a
     PLATFORM rendering limitation: GC-2 was right to stay out of app/ (its stop boundary).
- FIX RUN dispatched 04:10:13 fleet slot 1: unit cl-l1-coder-gc2fix1-l1t0405, SAME worktree
  wt/gc-2-lane1-l1t2355, brief prompts/coder-GC2-fix1-l1t0405.txt (leaf-scalar decomposition +
  widget: array WITH properties per documentMapper.ts:228, budget $.lines precedent; delete both
  repeater blocks; RED-first test update; report gc-2-report-l1t0405-fix1.md; end-marker
  'GC2 FIX1 DONE <sha>'). On exit: adversarial gate cycle-2 (unique path), orch verify, merge
  amendment, RE-RUN THE ORCH SCRIPT (no vision slot needed) — acceptance = no '[object Object]',
  array rows visible.
- REGISTRY ROW criterion: adjudicated — RecordRegistryPage.tsx REGISTRY_TABS (:23-35) is a
  frontend DATA table, gc-method has no tab. Adding it is an app/ change = GC-2's stop boundary.
  PLAN: a separate micro follow-up item (one data row + its test) at re-gate; GC-2's mergeable
  scope stays as merged. Do not silently drop the criterion — it moves to the follow-up.

## GC-3 — r1 CONTEXT-DEATH salvaged; r2 resume live on fleet slot 0

- r1 (unit cl-l1-coder-gc3-l1t0310, slot 0 since 03:14:44) exited 03:51 rc=0 WITHOUT the
  'GC3 DONE' marker; report STATUS: partial (G-red DONE, A partial). Last stdout mid-step-3.
  Same class as GC-2 attempt-1 (dies late after heavy orientation).
- SALVAGE verified first-hand: commit fae39894 'GC-3(G-red): contract tests RED'; UNCOMMITTED on
  disk instrument-sequence.schema.yaml (122 L), instrument-sequence-entry.schema.yaml (234 L),
  test edits +30/-16, registry-kinds +6 rows. NOTHING lost. Slot 0 released at 03:51:35.
- r2 RESUME dispatched 04:20:56 slot 0: unit cl-l1-coder-gc3-r2-l1t0430, SAME worktree/branch,
  brief prompts/coder-GC3-r2-l1t0430.txt — commit-after-every-step mandate, schema-completeness
  check first, plus the rendering rule learned from GC-2's gate (section-only blocks; leaf
  scalars; widget: array + properties for arrays; NO kind: repeater for anything that must
  render). Report gc-3-report-l1t0430-r2.md, end-marker 'GC3 DONE <sha>'. Due ~08:20, 2x ~12:20.

## GC-4 — spec PROMOTED (trunk 215cebaa); coder waits on GC-3 merge

- Composer l1t0310 finished 'COMPOSER DONE GC-4 48865'. Orch cite-audit: 5/5 load-bearing [F]
  cites CONFIRMED first-hand vs trunk (DataKind signal-collection acquisition.ts:18-25;
  data-reference required list :109; provisionInputs does NOT re-hash — contentHash refs are
  :15 import/:266 output/:435 frozen-payload only; LocalMountStorageProvider.resolvePath lexical
  :46-54; registry-kinds gc-method :29).
- DEFECT FIXED AT PROMOTION: draft D12 UI used kind: repeater — the GC-2 gate just PROVED that
  cannot render. Promotion note replaces it with section + widget: array + properties.
- OQ resolutions folded: OQ1 post-submit NAS re-hash in provisionInputs DECLINED (GC-5's, per
  D7's honest boundary); OQ2 service-only (no HTTP route); OQ3 manifest format/readerVersion
  strings PINNED as authored (free-string fields, zero collision).
- Canonical: .hermes/plans/2026-10-26_GC-4-nas-package-registration.md. GC-4 dispatch only after
  GC-3 merges (deps + shared files: registry-kinds rows).

## assumptions:

- AS-L1T0355-1 (new, no debt): GCM fixture ACL gained USR-BRAD viewer + USR-QMS-ADMIN editor
  (lane data, owner-minted via endpoint, DOC-DEMO-SOP precedent). Reversible.
- AS-L1T0355-2 (evidence-debt: true): the widget: array + properties render path is asserted as
  THE fix in both fix briefs on code-reading evidence only (documentMapper.ts:228 + budget
  precedent). Clearance = re-run of orch-gate script after each merge must show real rendered
  fields/rows. Where: prompts/coder-GC2-fix1-l1t0405.txt + coder-GC3-r2-l1t0430.txt; owner:
  orchestrator.
- Carried open: AS-L1T2355-2 (CAS anchors — close when GC wave closes), GC-1 vendor-format
  confirmation (low), KERRY escape-tag audit → GC-6 parser rule, saturated-flag lint → GC-10,
  AS-L1T0245-2 (GC-3 draft-era cite churn clearance — now riding the r2 adv-gate + orch diff).

## live-worker checkpoint (do NOT kill, do NOT duplicate)

- cl-coder GC-2 fix-1: unit cl-l1-coder-gc2fix1-l1t0405, FLEET SLOT 1 held since 04:10:13, log
  lanes/1/logs/coder-GC2-fix1-l1t0405.log.
- cl-coder GC-3 r2: unit cl-l1-coder-gc3-r2-l1t0430, FLEET SLOT 0 held since 04:20:56, log
  lanes/1/logs/coder-GC3-r2-l1t0430.log. Fleet at 2/2 capacity.
- No composer running (GC-4 spec already promoted; GC-5+ composition not yet claimed).

## NEXT TICK checklist

1. GC-2 fix-1 exit ('GC2 FIX1 DONE <sha>'): adversarial gate cycle-2 (reviews/GC2-adversarial-<ts>.md
   unique; brief it this is cycle-2 of a browser-gate fix) → orch verify (own vitest
   GcMethodSchemas + EditorProjectionService + UISpecLoader; tsc line-count comparator) → merge
   --no-ff → stack RESTART (ui.yaml changed) → RE-RUN scripts/orch-gate-gc2-l1t0355.js (edit its
   OUT dir first) → accept → then decide the registry-tab micro follow-up (claim as new item if
   created: REGISTRY_TABS += gc-method row + test; app/ change — spec it small) → mark GC-2 done
   only when BOTH the form leg AND the registry-row criterion are evidenced (the latter via the
   follow-up's merge, recorded in GC-2's done entry).
2. GC-3 r2 exit ('GC3 DONE <sha>'): adversarial gate → orch verify (own vitest
   InstrumentSequenceSchemas + InstrumentSequenceRules + GcMethodSchemas + ControlledDocument +
   3 pin suites; tsc comparator) → merge → stack restart → live :3092 create-validation curls
   (create an instrument-sequence + entry fixture; expect real rejections on wrong-kind refs —
   this caught value for GC-2) → GC-3's .ui.yaml gets an orch Playwright form gate (same script
   pattern, new fixture id) since r2 briefs it to render honestly → then GC-4 dispatch is UNBLOCKED.
3. GC-4 coder dispatch once GC-3 merges: worktree wt/gc-4-lane1-<ts>, spec
   .hermes/plans/2026-10-26_GC-4-nas-package-registration.md, brief must re-state: OQ resolutions,
   the section-only rendering rule, D12 as-amended, and the commit-after-every-step mandate (two
   context-deaths this wave — every coder brief gets the small-commit rule now).
4. Coverage-pin fence note (unchanged): registryOpsLifecycle fence requires the new schemas to
   declare matching lifecycleId/state enums (GC-2 precedent; GC-3 spec resolution 1 approves).
