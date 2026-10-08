# Plan Summary — .hermes/plans/ (all 129 plan docs, June → October 2026)

Generated 2026-10-06. One line on what each plan was, then a quick implementation synopsis.
Status tags: DONE (verified in code or stated implemented), DONE*, implemented per the doc's own status line (not independently re-verified), PARTIAL, PLAN-ONLY (never executed), SUPERSEDED (replaced by a later plan), AUDIT/HANDOFF/STATUS (meta docs, not build plans).
"Verified" means I grepped the live repo for the named machinery today.

Supersedes the earlier short summary at ~/.hermes/specs/plan_summary.md (which only covered ~/.hermes/specs/).

---

## June 2026 — the founding wave

1. 2026-06-17 typescript-error-cleanup — clear the TS error backlog. DONE* (typecheck gates have been standard ever since).
2. 2026-06-18 pdf-protocol-to-event-graph — first PDF→protocol→event-graph workflow design. DONE — the whole vendor-PDF→protocol→run pipeline exists today (schema/lab/vendor-pdf.schema.yaml, server/src/protocol-intake/).
3. 2026-06-18 ai-loop-status-and-hermes-comparison — STATUS doc: snapshot of the AI loop vs Hermes. N/A.
4. 2026-06-18 lab-data-science-workspace (+ -revised) — vision for an analysis/data-science workspace (two-pane). DONE — verified: app/src/analysis/ (AnalysisPage, ViewRenderer) + server/src/analysis/ (analysisRunner, analysisAuthoring).
5. 2026-06-18 experiment-lifecycle-and-knowledge-capture (x2) — experiment status tracking + knowledge capture model. DONE — the knowledge layer (claim/assertion/evidence/context-role schemas) and lifecycle engine exist.
6. 2026-06-19 material-instantiation-bug-fix — INVALID_MATERIAL_USAGE fix via normalizeEventGraphMaterialUsage. DONE — verified in server/src/materials/AddMaterialSupport.ts.
7. 2026-06-19 fix-createdBy-validation — createdBy validation fix on material instance creation. DONE* (old, absorbed).
8. 2026-06-28 beaker-flask-labware — beaker/flask labware. DONE — verified: beaker_*.yaml in schema/registry/labware-definitions/.

## July 2026 — run execution + first big UI push

9. 2026-07-25 epic2-conversational-run-companion (x2) — conversational AI companion for runs. DONE — the AI panel (AiTabPanel) is the shipped form.
10. 2026-07-28/29 protocol-execution-redesign (complete + plan + revised, x3) — execution mode with per-step status (pending/in_progress/completed/skipped/deviated). DONE — verified: StepStatus in app/src/hooks/useExecutionState.ts + shared/api/execution.ts.
11. 2026-07-30 major-ui-overhaul — broad UI overhaul. PARTIAL — much superseded by the Aug/Sept nav+tabs waves.
12. 2026-07-30 quick-run-creation — skip TapTab, jump straight to event editor. UNVERIFIED (no quickRun symbol found; behavior likely absorbed into run creation flow).
13. 2026-07-30 schema-overhaul-typed-relationships — typed relationships between first-class objects. DONE — registry relationship machinery exists (schema/registry/derivations etc.).
14. 2026-07-30 run-to-project-breadcrumb — breadcrumb from run to project. DONE — verified: breadcrumb in RunWorkspacePage.tsx.
15. 2026-07-31 biology-engine + ai-sidebar-state-machine + biology-engine-synthesis — ambitious "biology engine" (ProtocolIntent IR) + sidebar state machine. PLAN-ONLY as named — no BiologyEngine code exists; ideas were absorbed into the compiler pipeline and AI panel that came later.

## August 2026 — navigation, tabs, vendor-PDF loop, small-model experiments

16. 2026-07-31/08-01 lab-navigation-fix, unified-nav-splash-search, nav-fix-v2, splash-page-landing, run-centric-nav-find-home — five iterations of nav/splash/search. DONE — verified: SplashPage.tsx, AppShell.tsx; later reworked by the tabs system.
17. 2026-08-02 flattened-ownership-vendor-pdf + ingestion-destination-vendor-pdf — vendor PDF as a first-class lab record. DONE — verified: schema/lab/vendor-pdf.schema.yaml.
18. 2026-08-02 unified-browser-tabs-breadcrumb (+ completion handoff + phase41-deck-flatten session plan) — browser-like tabs + per-tab breadcrumb. DONE — tab system shipped; handoffs closed the remaining phases.
19. 2026-08-02 vendor-pdf-to-protocol-extraction + A3-handoff — activate the extraction pipeline. DONE — extraction pipeline shipped (protocol-intake).
20. 2026-08-03 resolver-unification — entity resolver + AI→deterministic compiler consistency. DONE* — doc carries a post-execution status section.
21. 2026-08-03 prompt-resolution-assurance — auto-resolve vs confirm-with-user. DONE* — gating exists (aiPrecompileGating tests).
22. 2026-08-03 test-failures-snapshot + 2026-08-05 test-failures-master-plan — the 153-failing-server-tests cleanup. DONE* — snapshot marks COMPLETE 2026-08-03.
23. 2026-08-04/05 protocol-loop-dflash (draft + handoff + consolidated) + 8gb-model-testing-plan — trained DFlash draft model on 8GB GPU for the universal→local protocol loop. SPIKE DONE — consolidated doc is the canonical resume; the model line later evolved into lfm2.5/Ornith.
24. 2026-08-05 protocol-planning-3mode-workspace — three-mode run workspace + protocol planning. DONE — run-plan/run-design/run-execute surfaces exist in surfaces.yaml.
25. 2026-08-05 browser-tabs-inplace-nav-pertab-history + tabs-on-every-surface — per-tab history, tab strips everywhere. DONE*.
26. 2026-08-12/13 phase-d-step-localization-loop + complete-localization-loop-corpus-save + step-localization-panel-redesign — per-step AI localization loop with ghost previews + corpus save button. DONE — verified: ProtocolPreviewBridge, _protocolStepStatus ghost machinery, corpus module.
27. 2026-08-15 protocol-planning-editable-draft-lpr-fix — make the planning draft editable. DONE*.
28. 2026-08-15 study-experiment-schema-audit-fixes — audit whether study/experiment relationships are honored or hardcoded. DONE* (audit + fixes at the time).
29. 2026-08-15 protocol-setup-combobox-document-lines — document-style editable combobox rows for "This assay needs". DONE — later extended by 2026-09-07_193923.
30. 2026-08-15 sample-count-is-a-run-property — architecture ruling: sample count belongs on the run, not the protocol. DONE* (absorbed into run model).
31. 2026-08-15 ratio-first-four-layer-protocol-architecture — concentration-first gap analysis. PARTIAL — gap analysis; the engine below was not built.
32. 2026-08-15 protocol-workflow-pdf-edit-execute — end-to-end workflow design review. PLAN-ONLY (design doc; the workflow itself later shipped through other plans).
33. 2026-08-15 concentration-propagation-engine — deterministic well-state tracker over the event graph. NOT IMPLEMENTED — plan mode, no matching code found today.
34. 2026-08-15 cross-record-ref-integrity-epic — refExists referential integrity epic. PARTIAL — refExists lint predicate appears in analysis tests; the generic cross-collection membership predicate landed later as lane-2 PROTO-AI-3.
35. 2026-08-16 condition-first-protocol-localization — resolve branches before starting steps. DONE — doc states COMPLETE, all 6 tasks committed & green.
36. 2026-08-16 pdf-sync-conditional-steps-editor + ui-protocol-authoring-surfaces-tasks — PDF↔step sync + conditional-branch UI. SUPERSEDED — plan-mode; realized later via the Sept TapTab review cluster.
37. 2026-08-16 protocol-chaining-context-handoff — chaining context between protocols (RNA ext → rtPCR). PARTIAL — plan mode; ContextChain.ts exists in the compiler pipeline.
38. 2026-08-21 scientist-intent-small-llm-compile (x2) — small-LLM portable YAML → canonical event graph via scientistIntent. DONE — verified: server/src/compiler/scientistIntent/compileScientistIntent.ts.
39. 2026-08-22 one-shot-seeded-protocol-localization — chat-driven one-shot whole-flow localization (trained small model). DONE* — shipped; model line evolved (see model switchers).
40. 2026-08-23 ontology-curie-strategy — CURIE/ontology strategy, Option B term spine. PLAN-ONLY at the time ("nothing implemented"); partially realized later (ontology copilot in TapTab, term panel 09-21). PARTIAL.
41. 2026-08-23 universal-local-bridge-review — review/fix of the universal→local bridge. DONE*.

## September 2026 — surfaces, corpus, per-step subgraphs, three-pane harness, governance

42. 2026-09-03 model-switcher — lfm2.5 ⇄ Ornith switching. DONE* ("DONE for both directions").
43. 2026-09-03 review-deck-before-ghost — review deck/labware before one-shot event ghosting. DONE*.
44. 2026-09-04 ai-model-switcher-ornith-lfm25 — model profiles inside CL. DONE — model choice now lives in /settings (single switcher, per standing ruling).
45. 2026-09-04 graph-search-engine-v01-spike — graph search engine spike. DONE — verified: app/src/graph-search/ (GraphSearchPage, plate view).
46. 2026-09-04 biological-types-culture-systems + cells-biological-type-plating-workflow — cells as a biological type, count-driven plating. DONE — verified: schema/registry/biological-types/.
47. 2026-09-04 ontology-term-review-surface — term review/sign-off surface. PARTIAL — term review machinery exists (ontology copilot, term panel); full sign-off surface not verified.
48. 2026-09-05 surface-context-small-model-corpus — lab identity + surface context training corpus. DONE — verified: server/src/corpus/surfaceContextCorpus.ts.
49. 2026-09-05 analysis-surface-slice-a — first analysis surface slice. SUPERSEDED (same day) by storage-instrument plan.
50. 2026-09-05 storage-instrument-analysis-surface + analysis-model-lifecycle-chained — storage devices, instrument coordination, model lifecycle + chained analyses. DONE — verified: analysisRunner, modelLifecycle tests, analysis-run/analysis-revision schemas.
51. 2026-09-06 unrooted-runs-project-linking — fix /runs listing for direct + unrooted runs. DONE — verified: TreeHandlers.listRuns test names unrooted runs.
52. 2026-09-06 vendor-pdf-unified-surface, promoted-protocol-titles, protocol-pane-search, protocol-cleanup-consolidated, protocol-loop-cleanup — one cleanup wave for the vendor-PDF→run-protocol loop. DONE* — surfaces exist (Protocol pane search, unified vendor-PDF surface).
53. 2026-09-06 taptab-vendor-pdf-protocol-review — fold extractor into TapTab rich editor. DONE — verified via 09-12 audit + TapTab widgets in repo.
54. 2026-09-06 slim-protocol-tab-search-attach-run — slim run Protocol tab to search + attach. DONE*.
55. 2026-09-06 per-step-subgraph-ai-feedback-loop + per-step-subgraph-realization-model — select→draft→inspect→revise→commit per step. DONE — verified: ProtocolSelectionContext, protocol-selection-bridge, StepGraphCompiler route.
56. 2026-09-06 identity-provenance-sharing — real identity, system-owned provenance, lab-wide sharing. DONE — verified: schema/identity/ (user, group, role-grant).
57. 2026-09-06 bring-home-protocol-run-inspection — wire the run editor to actually inspect protocol steps. DONE — bridge wiring present.
58. 2026-09-07 investigate-protocol-selection-context-divergence — root-cause investigation (nested provider bug). DONE — investigation closed; fix recorded in the three-pane audit.
59. 2026-09-07 vendor-pdf-real-roles-rich-text-taptab-lists — real role terms + rich-text lists. DONE*.
60. 2026-09-07 exa-vendor-products-event-editor-ai-chat (x2) — Exa-backed vendor products in editor UI + chat. DONE — verified: schema/registry/curated-vendors/.
61. 2026-09-07 freebench-instruments-move-and-zoom — place/move/zoom instruments on the freebench. DONE*.
62. 2026-09-07 promote-run-keeps-event-graph-localized-run-tab — promote ad-hoc run → protocol, gate run tab on localization. DONE — verified: approved-state filter in ProtocolContextService.
63. 2026-09-07 editable-setup-combobox-per-step-prompt — editable setup sections + per-step prompt-and-localize. DONE*.
64. 2026-09-07 unify-deck-add-modal-plates-labware-equipment — one Add-to-deck modal (Plates/Labware/Equipment). DONE — verified: AddToDeckDialog exists, AddEquipmentDialog deleted.
65. 2026-09-07 save-saveas-promote-run-tab-approved — Save/Save As semantics + approved-only run-tab protocols. DONE*.
66. 2026-09-07 three-pane-agent-harness — navigation | investigation | persistent agent workspace. DONE — shipped on main 2026-09-08 per its own status; verified: AiTabPanel + left-pane tabs.
67. 2026-09-09 chrome-compaction-hover-toolbar — compact chrome + hover controls. DONE*.
68. 2026-09-09 tabs-deep-dive-decision — decision doc: custom tabs vs browser tabs. AUDIT/DECISION.
69. 2026-09-12 audit-three-pane-harness + audit-per-step-taptab-cluster — task-by-task implementation audits of plans 53/55/66. AUDIT.
70. 2026-09-12 phase2-left-nav-tabs-permanent-ai-chat — left nav pane tabs + permanent AI chat column. DONE*.
71. 2026-09-12 water-bath-equipment-and-step-subgraph — water-bath placement via agent. SUPERSEDED 2026-09-19 → deck-equipment-via-agent.
72. 2026-09-12 first-class-equipment-deck-placement — place instrument records on the deck. DONE (later) — equipment-kinds registry + equipment tab in AddToDeckDialog.
73. 2026-09-12 editable-equipment-settings-cycling-programs — editable equipment settings + declarative cycling programs. DONE — verified: cycling programs in schema/lab/equipment-class.schema.yaml + equipment-kinds registry.
74. 2026-09-18 vendor-pdf-corpus-subgraph-proposals — vendor PDF → decision tree → subgraph event-graph proposals. DONE — waves 1-5 complete (per corpus-moat doc); verified: server/src/protocol-intake/ (deriveDecisionTree, enumerateChoiceBindings, materializeBranchCandidate).
75. 2026-09-19 tmux-style-persistent-session — tabs survive refresh/device switch; fresh load lands in project. DONE* — session API + client-side persistence references present (not fully re-verified).
76. 2026-09-19 corpus-moat-relocation — corpus private data to remote + leak quarantine. DONE*.
77. 2026-09-19 protocol-pipeline-consolidation — one review surface, one engine, one axis set. DONE* — carries an implementation-status section (2026-09-19).
78. 2026-09-19 deck-equipment-via-agent — bench equipment through the agent. PLAN-ONLY (status: not executed).
79. 2026-09-19 platform-modules-in-deck-slots — platform modules as slot-resident equipment. PLAN-ONLY (not executed; no code found).
80. 2026-09-19 corpus-catchup — real compiles, fresh trees, fix not_run root cause. PARTIAL — plan diagnosed the hollow-corpus gap; its named root cause was "still unfixed" at writing.
81. 2026-09-20 material-clarification-contract — one authoritative ref, layer-scoped menus, bound answers. DONE — doc states IMPLEMENTED 2026-09-20; verified: MaterialProfileClarification tests.
82. 2026-09-20 draft-friction-reduction — snappy draft path accepting what biologists say. PLAN-ONLY as written — but its spirit became Brad's friction-first ruling and later AI-loop loosening. PARTIAL.
83. 2026-09-21 term-panel-labware-equipment — term panel covers labware/equipment + kind-scoped override search. DONE — doc states IMPLEMENTED 2026-09-21; TermPanel references verified.
84. 2026-09-26 qms-governance-gap-plan — close the gap between the QMS governance architecture spec and the code. DONE (via successors) — governance wave + login-first + the Oct QMS campaign closed it.
85. 2026-09-27 tyf-customer-handoff-alignment — align CL lab-sync with the website's Customer & Evidence Integration v1. DONE (wave 1) — verified: server/src/lab-sync/ (ArtifactClient, cursor, evidence).
86. 2026-09-27 governance-hardening-wave — phased governance hardening. DONE* — handoffs named "governance-runtime-complete" / "controlled-use-run-start"; verified: server/src/lifecycle/ + readiness/ RunStartGate machinery.
87. 2026-09-28 login-first-qms-plan + login-first-w1-spec — admin via session login only; first-run bootstrap. DONE — verified: POST /auth/set-password route.

## October 2026 — QMS campaign specs + pipeline remap

88. 2026-10-02 qms-1-integration-contract-spec — the QMS-1 grounding spike spec. DONE — became lane-1 QMS-1 (done); contract delivered to ~/.hermes/specs/inbox/.
89. 2026-10-03 qms-1a-preview-guard-metadata-spec — guard metadata in transitions preview. DONE (QMS-1A done).
90. 2026-10-03 qms-2-controlled-document-schema-spec — controlled-document (cf:SOP) triplet. DONE (QMS-2 done).
91. 2026-10-03 qms-3-client-signature-plumbing-spec — signature plumbing in the API client. DONE (QMS-3 done).
92. 2026-10-03 qms-4-demo-seed-spec — DEMO seed + actor matrix. DONE (QMS-4 done).
93. 2026-10-03 qms-cheatsheet-reconciliation — reconcile the QMS campaign with the signature/revision contract. DONE via lane-1 wave 2 (QMS-6A/6B/6C/6D/6E/6F + EDITOR-1/2 all done).
94. 2026-10-03 ai-protocol-edit-tool — AI protocol-edit tool call from the chat pane. DONE via lane-2 campaign PROTO-AI-1..10 (all done); PROTO-AI-11/12 blocked awaiting Brad, PROTO-AI-13 todo.
95. 2026-10-05 cl-pipeline-local-remap — fully-local pipeline remap (appliance-2 coder, adversarial reviewer, endpoint map). DONE — tasks 1-2 marked DONE 2026-10-06; matches the live fleet config.

## Also in the lane worktrees (not counted above)

- cl-integration-1/.hermes/plans/ — the per-task specs + architect decision artifacts for the QMS wave (qms-6a..f, editor-1/2, ops-1, different-person, draft-copy, bundle-selector decisions) — all closed with the lane-1 tasks done.
- cl-integration-2/.hermes/plans/ — the per-task specs + worker reports for PROTO-AI-1..12 — closed except the blocked 11/12.

## Roll-up

- ~70 plans DONE (verified in code or self-declared implemented with corroborating code found).
- ~10 PARTIAL (concentration-propagation engine, ref-integrity epic, ontology term spine, protocol chaining, draft-friction, corpus-catchup, term review surface, major-ui-overhaul, ratio-first architecture, quick-run-creation unverified).
- ~6 PLAN-ONLY / never executed (biology engine as named, deck-equipment-via-agent, platform-modules-in-deck-slots, pdf-sync/protocol-chaining design docs, concentration engine).
- ~10 SUPERSEDED by later plans (normal churn: analysis slice A, water-bath plan, dflash drafts, early protocol-cleanup variants).
- ~15 AUDIT/HANDOFF/STATUS docs (meta, not build plans).
- The Oct campaigns (QMS lane 1, PROTO-AI lane 2) are the live edge: lane 1 fully done; lane 2 10/13 done, 2 blocked on Brad's approval, 1 todo.
