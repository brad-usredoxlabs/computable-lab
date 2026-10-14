# Handoff — lane 1 tick 20261013T2000–2110 (DOCINGEST-A gate attempt-1 = blocked-on-Exa-key; orch-runner route planned; DOCINGEST-B CODER DISPATCHED l1t2030)

Author: orchestrator cron tick — 2026-10-13 ~20:00–21:10 EDT — lane 1. :3001/:5174 never
touched. :3092/:5192 200 throughout. Read handoffs 20261013T1950, 1744 — carried items live there.

## Reconciliation at tick start (verified first-hand)

1. Fleet coder lock was held by lane 2 (COMP-2 fix1, acquired 20:04:42). Lane 1 dispatched no
   coder at tick start. Fleet-single honored throughout.
2. DOCINGEST-A: trunk 50280e81 confirmed served-checkout HEAD; merged state unchanged from prior
   tick; the async browser gate was this tick's first action.
3. OWN-13: trunk CLAUDE.md md5 cc43d17766d5606ee3d532c5356cbff4 UNCHANGED -> silent.
   OWN-14: no new file under lanes/1/decisions/ (newest still L1-qms-field-defects-ruling-20261010)
   -> silent, not re-asked. OWN-12 unchanged. 0 due/changed blockers.

## Work done this tick

1. DOCINGEST-A BROWSER GATE ATTEMPT-1 (tier-1 cl-browser-reviewer, pid 3185484, rc=0, real
   trail): receipts/DOCINGEST-A/20261013T2016/report.md. S1 PASSED (Documents label +
   ingestion-tab-vendor-pdf testid). S2-S5 -> VERDICT: blocked — no visible file input on
   /ingestion. ORCH ROOT-CAUSE (code, first-hand): the spec-named bring-back input
   (VendorPdfSearchSection.tsx data-testid vendor-pdf-bring-back, accept includes .docx,.md)
   renders ONLY after an Exa search hit whose ingest returns EXA_TEXT_FALLBACK; the Exa key in
   config.yaml:144 is DEAD — verified first-hand by direct POST https://api.exa.ai/search with
   that exact key -> "Invalid API key". Backend search -> EXA_SEARCH_FAILED 401.
   NOT a product defect: coder's API-level upload re-verified live THIS tick
   (POST /api/vendors/graph-lemur/pdfs/upload, /tmp/gate-l1t2010-lysis.md -> record + artifact
   0d67940ef96d.md, extraction ran). External-credential outage on the UI path only.
   Structured blocker recorded in the task block (owner: Brad for a live Exa key; next_check:
   orch-runner route next tick). AS-ORCH-L1-092.
2. DOCINGEST-B CLAIMED + CODER DISPATCHED. Lane 2's COMP-2 fix1 exited 20:16:55 and released the
   fleet lock; queue-docingest-b.sh (launcher pid 3277001) acquired it 21:01:31, worktree
   /mnt/vast/home/brad/git/wt/DOCINGEST-B-lane1-l1t2030 (wt branch off trunk 50280e81, node_modules
   + schema conventions applied), coder pid 3283781 LIVE at checkpoint (log
   logs/coder-DOCINGESTB-l1t2030.log, report docingest-b-report-l1t2030.md, end-marker
   DOCINGEST-B CODER DONE <sha>). Prompt embeds spec §0 structural gate, §0.2 re-anchor, §0.3
   re-baseline, private-dev-port rule, host OCR facts (tesseract+pdftoppm present, pandoc absent),
   DEMO-fixture provenance rule. DISPATCH-JUDGEMENT: guard set to trunk-CONTENT (A substrate
   present) rather than A-status:done — SOUL 6b async-gate ruling; recorded as AS-ORCH-L1-093
   with the re-audit obligation if A's gate later rejects on a product defect.
   INCIDENT FIXED EN ROUTE: the first launcher instance inherited my task-list.lock fd and leaked
   the queue lock while sleeping (task-list writes blocked ~10 min); killed, launcher hardened
   (exec 9>&- before setsid), lock free again, claim written under the lock properly.
3. Silent-check sweep: :3092/:5192 200; trunk HEAD 50280e81.

## Live at checkpoint (do NOT duplicate)

1. cl-coder DOCINGEST-B pid 3283781 (fleet lock held; launcher pid 3277001; log
   lanes/1/logs/coder-DOCINGESTB-l1t2030.log; expected duration ~2-3h per coder history —
   due check ~00:00; at 2x re-check log motion, at 3x per 7b change approach).
2. Nothing else of mine running. No live browser gate (attempt-1 exited).

## Next tick (ordered)

1. DOCINGEST-A S2-S5 via ORCH-AUTHORED Playwright runner (the AS-ORCH-L1-092 plan): stub ONLY
   GET /api/vendors/graph-lemur/pdfs (one fake hit) + POST .../pdfs/ingest (EXA_TEXT_FALLBACK
   diagnostic response) at the route layer; REAL /upload to :3092; accept-attr crop, S3 text-kind
   review pane (engine=upload/mediaKind=text API readback + draft run), S4 pdf control
   VPDF-257F57196F6C pdfjs canvases, S5 .docx -> vpdf-review-diagnostics DOCX_TOOL_MISSING.
   Save the runner into the receipts dir; declare the stub boundary in report.md. Receipts
   /home/brad/.hermes/cl/receipts/DOCINGEST-A/<new-ts>/. Vision slot is FREE — a tier-1 re-shot
   with the same live-Exa dependency would fail identically; the runner route is the correct
   next action per 6c (harness/route change, not a blind retry).
   ON ACCEPT: mark DOCINGEST-A done + handoff (closes AS-ORCH-L1-090).
2. DOCINGEST-B coder observation: commit motion in the worktree, §0 gate quoted in report when
   first section lands. On exit: adversarial gate (spec §10 baits), orch-verify, merge, restart,
   gate §12.
3. OWN-13 md5 / OWN-14 decisions-dir silent checks; :3092/:5192 health.
4. If Brad supplies a live Exa key before the runner lands, prefer the fully-live S2 variant.

## Evidence-debt / carried (OPEN unless stated)

- OPEN: AS-ORCH-L1-042; AS-ORCH-L1-048/054 (close only at rule-9); AS-ORCH-L1-068 (OWN-14's gate);
  AS-ORCH-L1-082 (record-only); AS-ORCH-L1-087 PARTIAL (rule-9 eyeball residual); AS-ORCH-L1-088
  (OLIGO orch-judge eyeball + OQ3-gated full-save leg); AS-ORCH-L1-089 (ISEQ-2 orch-runner close);
  AS-ORCH-L1-090 (**DOCINGEST-A browser gate outstanding, pinned 50280e81** — attempt-1 blocked
  on external Exa key, S1 already accepted in receipts 20261013T2016); AS-ORCH-L1-091 (record-only
  pill styling); AS-ORCH-L1-092 NEW (stub-boundary runner route, declared); AS-ORCH-L1-093 NEW
  (B dispatched async to A's gate; re-audit obligation if A rejects on product defect).
- Candidate future-queue: OQ3 dye-token data fix (STRONGEST, propose to Brad interactively);
  Exa API key renewal (NEW — external credential, blocks live search UI path);
  sequence-search pill styling; NCBI keyless pacing; sequenceSources.ts:44 alphabet hardcode;
  browser-reviewer harness hardening (runner provenance — attempt-1 followed it: report only,
  no runner; the orch-runner route re-fixes this); accession-searchability of Library labels;
  DOCINGEST-B page-image retention.
- Record-only carry-forward unchanged: OLIGO cycle-2 residuals; advreview3 provenance nit;
  candidate_refs reverse-index; bare-"Total <digits>"; OLIGO reviewer O1-O5; QMS-7 doc nits;
  grant authoring gate unwired; registry payload echo; CF-OWN1-A/B; AS-OWN5-002; AS-ORCH-L1-036;
  OWN-8 obs 2; OWN-13 DEV-2 erratum; app tsc baseline 23; OWN-10 reviewer O1; vitest --dir
  false-failure + cwd trap; OWN-11 mock-path erratum; POLICY_ROOT_KINDS = OWN-14 scope;
  browser/ package doubly-orphaned; ISEQ §15 no-bundle rule; AS-ORCH-L1-077 rc=137 mystery.

## assumptions
- AS-ORCH-L1-092 (Exa-key outage + stub-boundary orch-runner route) — see assumptions.md entry.
- AS-ORCH-L1-093 (DOCINGEST-B dispatched on trunk-content guard while A's gate is owed) — see entry.
- Launcher fd-inheritance task-list-lock leak: killed + hardened (exec 9>&-); no queue writes lost;
  lesson recorded here (not an assumption, an incident note).
- No credentials recorded anywhere in this handoff. (Exa key value deliberately NOT reproduced;
  only its liveness status, verified by direct probe.)
