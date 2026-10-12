# PROTO-AI-14 browser gate — RUN 9 — orchestrator-rendered verdict on deterministic artifacts

Measurement route (changed approach per protocol; runs 3-8 were model-reviewer sessions, 3 of them
invalid): orchestrator authored the Playwright measurement scripts (no model in the measurement
loop): tmp-orch/gate-run9.mjs + tmp-orch/gate-run9b-dark.mjs. Raw outputs in trail.json. The
orchestrator then viewed the screenshots directly (built-in vision) and cross-read the served CSS.

Served candidate: trunk cl/integration-2 @ e5395353 (contains AI-14 merge cbacebab; ancestor
verified). :5193 CSS grep changes-panel__btn--apply=1, sessionYaml.ts byId=3, both endpoints 200.

Criteria (verbatim) vs evidence:
1. "ChangesPanel Accept/Reject render as distinct visible buttons in both themes"
   - LIGHT (01-panel-light.png, trail A4/A5): Discard rect 74x36 at x=1393; Apply rect distinct
     (no overlap); computed: apply bg rgb(9,105,218) accent fill, discard bg rgb(255,235,233)
     danger-soft, both 1px border, 8px/14px padding, 6px radius — real buttons, not jammed text.
     Orchestrator visual check: distinct styled pair visible on light page.
   - DARK (02-panel-dark.png, trail E0-E2): cl-theme='dark' set via init script BEFORE load —
     .cl-app data-theme='dark' confirmed at load; panel bg rgb(22,27,34); apply bg
     rgb(88,166,255), discard bg rgba(248,81,73,0.15) — distinct; orchestrator visual check
     confirms Reject/Accept render as distinct visible buttons on the dark panel.
2. "apply-error visibly alert-styled" — stated non-blocking substitution per gate contract 3c
   (no real apply-error path exercised; Accept never clicked, per contract): served
   ChangesPanel.css .changes-panel__apply-error = danger-soft fill + danger hairline border +
   danger ink (all --cl-* tokens); ChangesPanel.tsx:85 renders it with role="alert".
3. "console free of the duplicate-key warning during a run-tab-duplication repro"
   - GET /api/session (1 tab) -> PUT duplicate of tab[0] = 200 -> reload -> full console scan:
     ZERO 'two children with the same key' (trail D2/D3). Final-session scan also zero (Z).
     Session restored to original afterwards (D4=200).
4. propose-never-write corroboration: sha 30a353a8... identical before chat, after light-mode
   Discard click (C1 unchanged=true), and after dark-mode Reject click (E3).
5. "Reviewer re-verifies any blank/negative claim via reload": the duplicate-key negative was
   taken AFTER a reload by construction, and re-scanned at session end (two independent scans).

Red-first component tests clause: landed with merge cbacebab, orchestrator-verified at merge
(ChangesPanel.styling.test.tsx + tab-key tests green; adversarial review ACCEPT prior to merge).

VERDICT: accept
