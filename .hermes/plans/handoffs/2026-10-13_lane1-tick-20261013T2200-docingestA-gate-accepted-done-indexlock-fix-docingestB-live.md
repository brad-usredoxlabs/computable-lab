# Handoff — lane 1 tick 20261013T2120–2200 (DOCINGEST-A GATE ACCEPTED via orch runner — item DONE; stale lane index.lock incident fixed; DOCINGEST-B coder live+productive)

Author: orchestrator cron tick — 2026-10-13 ~21:20–22:00 EDT — lane 1. :3001/:5174 never
touched. :3092/:5192 200 throughout. Read handoffs 20261013T2110, 1950 — carried items live there.

## Reconciliation at tick start (verified first-hand)

1. DOCINGEST-B coder ALIVE: coder pid 3288807 (child of launcher 3277001), fleet lock held
   (pidfile DOCINGEST-B(l1t2030) since 21:01:31), worktree wt/DOCINGEST-B-lane1-l1t2030 off
   trunk 50280e81. Fleet-single honored (no second coder dispatched).
2. OWN-13: trunk CLAUDE.md md5 cc43d17766d5606ee3d532c5356cbff4 UNCHANGED -> silent, not re-asked.
   OWN-14: no new file under lanes/1/decisions/ (newest still L1-qms-field-defects-ruling-20261010)
   -> silent. OWN-12 unchanged (gate owner until OWN-14). 0 due/changed blockers.
3. Trunk HEAD 50280e81 (DOCINGEST-A merge), served checkout confirmed.

## Work done this tick

1. DOCINGEST-A BROWSER GATE ATTEMPT-2 = ORCH-AUTHORED PLAYWRIGHT RUNNER (the AS-ORCH-L1-092
   planned route, per SOUL 6c after attempt-1's Exa-credential block). Runner + config + trail
   + 6 screenshots + s5-facts.json + report.md in
   /home/brad/.hermes/cl/receipts/DOCINGEST-A/20261013214317/. Stub boundary DECLARED in the
   report: ONLY the two dead-external endpoints (search GET + ingest POST->EXA_TEXT_FALLBACK)
   faked at the route layer; upload/records/extraction/pdfjs/review-UI all REAL vs :5192/:3092.
   Result: 1 passed (40.5s). Per-state: S1 accept (carried from 20261013T2016 + re-rendered);
   S2 accept (accept-crop .docx/.md no image types asserted; REAL .md upload -> 200 + durable
   VPDF-25A737D5871D); S3 accept (text pane first-class with Source: header, extracted text
   selectable, ZERO canvases asserted; API readback engine=upload/mediaKind=text/
   media_type=text/markdown; draft POST candidateCount>=1 via the spec-sanctioned §7 route);
   S4 accept (VPDF-257F57196F6C renders real pdfjs content, vision-confirmed by the orch);
   S5 accept (synthetic-OOXML real .docx -> honest DOCX_TOOL_MISSING banner, vision-confirmed;
   never blank-success). All automatic-reject rules checked clean.
   ORCH EYEBALL: screenshots viewed directly (S3/S4/S5) — no vision-agent slot consumed.
   => DOCINGEST-A MARKED DONE. Closes AS-ORCH-L1-090, AS-ORCH-L1-092; AS-ORCH-L1-093
   re-audit obligation DISCHARGED (gate accepted; Stage B's base stands).
2. INCIDENT FIXED MID-GATE (lane infra, not product): every lane record write had been failing
   since ~19:28 — stale 0-byte /home/brad/.computable-lab-lane1/worktrees/main/.git/index.lock
   (no live git process, lsof empty). Removed; upload durability re-verified (200 +
   recordedArtifact + readback). First runner failures were harness-only (route glob `pdfs*`
   vs `pdfs**`, hidden file-input visibility assertion, Playwright baseURL /api-drop) + this
   lock. All fixed in the runner/infra; no candidate code was touched.
3. Fixture provenance: gate fixtures orch-authored + DEMO-labeled (gate-demo-lysis-l1t2135.md;
   gate-demo-plasmid-prep-l1t2135.docx = minimal synthetic OOXML zip). Lane records are test
   data per Brad's standing ruling.

## Live at checkpoint (do NOT duplicate)

1. cl-coder DOCINGEST-B pid 3288807 (launcher 3277001; log logs/coder-DOCINGESTB-l1t2030.log;
   report docingest-b-report-l1t2030.md; end-marker DOCINGEST-B CODER DONE <sha>).
   Elapsed at checkpoint ~58 min (within the ~2-3h expected; due check ~00:00). REAL PROGRESS
   in the worktree: RED+feat commit pairs through 4b36e9ae (upload accepts page images;
   page-image serving route; SAID pane <img> per page + OCR caution; one disclosed argv-pin
   amendment commit). On exit: adversarial gate (spec §10 baits), orch-verify, merge, restart
   (schema/config YAML likely touched), browser gate §12.
2. Nothing else of mine running. Vision slot free.

## Next tick (ordered)

1. DOCINGEST-B coder observation (commit motion; report when it lands). On exit: adversarial
   gate on reviews/docingest-b-advreview-l1t<ts>.md, orch-verify per spec §7, merge --no-ff,
   stack restart if YAML touched, browser gate on receipts/DOCINGEST-B/<ts>/ (orch-runner
   route available; the 20261013214317 runner is a proven template incl. the baseURL-gotcha
   fix and hidden-file-input pattern).
2. OWN-13 md5 / OWN-14 decisions-dir silent checks; :3092/:5192 health.
3. Watch for recurrence of the lane data-repo index.lock wedge (a stale lock is silent —
   uploads return 200 with recordWriteError); cheap check: one upload probe or
   `ls /home/brad/.computable-lab-lane1/worktrees/main/.git/index.lock`.
4. If Brad supplies a live Exa key, the fully-live S2 variant is a candidate future-queue check.

## Evidence-debt / carried (OPEN unless stated)

- OPEN: AS-ORCH-L1-042; AS-ORCH-L1-048/054 (close only at rule-9); AS-ORCH-L1-068 (OWN-14's gate);
  AS-ORCH-L1-082 (record-only); AS-ORCH-L1-087 PARTIAL (rule-9 eyeball residual); AS-ORCH-L1-088
  (OLIGO orch-judge eyeball + OQ3-gated full-save leg); AS-ORCH-L1-089 (ISEQ-2 orch-runner close).
- CLOSED this tick: AS-ORCH-L1-090 (DOCINGEST-A gate accepted, receipts 20261013214317);
  AS-ORCH-L1-092 (stub-boundary runner route executed + declared); AS-ORCH-L1-093 (base
  re-audit obligation discharged by A's accept); AS-ORCH-L1-094 (opened+closed same tick —
  the stub boundary itself).
- AS-ORCH-L1-091 unchanged (record-only pill styling).
- Candidate future-queue: OQ3 dye-token data fix (STRONGEST, propose to Brad interactively);
  Exa API key renewal (external credential; live search UI path still dead);
  sequence-search pill styling; NCBI keyless pacing; sequenceSources.ts:44 alphabet hardcode;
  browser-reviewer harness hardening (runner provenance; orch-runner template now proven twice);
  accession-searchability of Library labels; DOCINGEST-B page-image retention;
  lane data-repo index.lock watchdog (cheap probe each tick).
- Record-only carry-forward unchanged: OLIGO cycle-2 residuals; advreview3 provenance nit;
  candidate_refs reverse-index; bare-"Total <digits>"; OLIGO reviewer O1-O5; QMS-7 doc nits;
  grant authoring gate unwired; registry payload echo; CF-OWN1-A/B; AS-OWN5-002; AS-ORCH-L1-036;
  OWN-8 obs 2; OWN-13 DEV-2 erratum; app tsc baseline 23; OWN-10 reviewer O1; vitest --dir
  false-failure + cwd trap; OWN-11 mock-path erratum; POLICY_ROOT_KINDS = OWN-14 scope;
  browser/ package doubly-orphaned; ISEQ §15 no-bundle rule; AS-ORCH-L1-077 rc=137 mystery.

## assumptions
- AS-ORCH-L1-094 (stub boundary of the DOCINGEST-A gate runner) — opened and CLOSED this tick;
  see assumptions.md entry. Boundary declared verbatim in the receipts report.
- Gate-fixture provenance declared: orch-authored DEMO-labeled .md + synthetic minimal-OOXML
  .docx (record-only; lane records are test data per Brad's standing A4 ruling).
- Stale index.lock removal: judged safe on ownerless evidence (0-byte, 2h old, no git process,
  lsof empty); durability re-verified by real upload+readback after. Record-only incident note.
- No credentials recorded anywhere in this handoff (Exa key value deliberately NOT reproduced).
