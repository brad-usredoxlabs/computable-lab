# Handoff — lane 1 tick 20261013T1230 (OLIGO-AI-3 D1 fixed + gate retry 3; DOCINGEST-A spec promoted)

Author: orchestrator cron tick — 2026-10-13 ~12:20–13:00 EDT — lane 1. Within budget.
No kills. :3001/:5174 never touched. :3092/:5192 200 throughout (new pids post-restart).

## What happened this tick

1. RECONCILED all three 1120-checkpoint workers first-hand:
   - OLIGO-AI-3 gate TIER-2 (pid 1695825) EXITED rc=0 12:25 with a REAL VERDICT: fix —
     the tier-2 mechanics worked (S1/S2 pass with byte-computed diagnostic-text proofs,
     three independent fresh-UI runs + an independent repro trail). D1 blocking: every
     S3 AI-read call 422'd "not JSON ... 'We need an'" (134-164 s each).
   - ISEQ-1 resume (launcher 1695812) acquired the fleet lock 12:24:40 when lane 2's
     SHORTHAND-COMP-1-FIX2 exited; hermes pid 1778484, ACTIVE: ncbiTools.ts +
     NcbiNucleotideTools.test.ts + BiosourceHandlers.ts touched after 12:20, vite
     running under it (test execution). Do NOT touch the worktree.
   - DOCINGEST-A composer (pid 1700131) DELIVERED 12:46: "COMPOSER DONE DOCINGEST-A
     34144", rc=0, draft at .hermes/plans/drafts/...l1t1155.draft.md.
2. D1 ROOT CAUSE verified first-hand in code+config (not the reviewer's word): profile
   qwen3.8-flash-OR in lane1-config.yaml was the ONLY profile lacking enableThinking;
   InferenceClient.ts:23-33 normalizeReasoningContent copies reasoning prose into
   message.content when content is empty; oligoOrderAiRead.ts:150-159 JSON.parses that
   prose. FIX: enableThinking: false added to the profile (yaml-verified, .bak-20261013T1230
   kept). This is RUNTIME lane config (gitignored) — no repo change, no coder needed.
   Lane stack restarted (cl-lane-stack.sh 1 restart, log stack-restart-l1t1230.log, backend
   ready 32 s; new backend pid 1792568 CONFIRMED with CONFIG_PATH=lane1-config.yaml +
   CL_DATA_DIR=/home/brad/.computable-lab-lane1 in /proc/environ).
3. GATE RETRY 3 DISPATCHED at tier-2 (the tier-2 model executed the mechanics correctly;
   raising the tier buys nothing here — the ladder's job was to escape the tier-1 harness
   class): proc_51170a1fc72e pid 1823985, prompt
   prompts/browergate-oligoai3-l1t1240-t3.txt — embeds: D1-fixed state + do-not-restart,
   the inner-pane scrollIntoView lesson, the role-based S3 selector lesson (text=AI read
   matches the OFFER diagnostic — attempt-2's own run-1 mistake), S5 scoping per the
   spec's OQ3 adjudication (prefer an issue-free row; dye-class refusal = BLOCKED-by-OQ3
   evidence, not a new defect; attempt-2 had re-litigated OQ3 as 'defect 2'), 422-recurs-
   post-fix = real product defect with one direct-POST reproduction. Receipts
   OLIGO-AI-3/20261013T1240/, log logs/browergate-oligoai3-l1t1240-t3.log. ~40-60 min.
4. DOCINGEST-A SPEC REVIEWED + PROMOTED with OQ1/OQ2/OQ3 all ACCEPTED at composer
   defaults, each adjudicated against my own trunk checks at 95d340a8: the two-
   extractPdfLayoutText-coexistence discovery (TableExtractionService.ts:20 vs
   PdfTextAdapter.ts:248) verified — delegation-not-import-swap is correct; the upload-
   handler 'exa'/'application/pdf' lies verified at VendorSearchHandlers.ts:1131/:1287/
   :1368/:1533 + phase9 :461 pin; schema source additionalProperties:false + required
   [engine, ingestedAt]; pandoc ABSENT, tesseract+pdftoppm PRESENT. Canonical spec:
   .hermes/plans/2026-10-13_docingest-a-stage-a-spec.md; linked in the task block.
5. Silent checks: OWN-13 DEV-1 — trunk CLAUDE.md md5 unchanged (cc43d177..., rule-9
   absent, not re-asked). OWN-14 — decisions/ newest unchanged, blocker stands.
   computable vision slot: gate-3 is cloud-tier, no local slot pressure.

## Live at checkpoint (do NOT duplicate)

1. ISEQ-1 resume coder: hermes pid 1778484 under launcher 1695812 (proc_2545e6ecebad);
   holds the fleet lock (pidfile ISEQ-1-resume(l1t1150) 12:24:40). Worktree
   /mnt/vast/home/brad/git/wt/ISEQ-1-lane1-l1t1020 (branch same, RED base cfe63a66 on
   95d340a8), report iseq-1-report-l1t1150resume.md (unique), end-marker "ISEQ-1 CODER
   DONE <sha>". Expected ~60-90 min from 12:24. On exit: ADVERSARIAL GATE (spec §11,
   unique path reviews/iseq-1-advreview-l1t<ts>.md); FIX -> fix run same worktree (max 2
   cycles); ACCEPT -> orch-verify per the 1120 handoff §Live-1 checklist, merge --no-ff,
   RESTART stack (SOURCE_MAP server change), LIVE PROBES §10, BROWSER GATE §13 on :5192.
2. OLIGO-AI-3 gate retry 3: proc_51170a1fc72e pid 1823985 (cloud tier, no lock).
   VERDICT: accept -> mark OLIGO-AI-3 done (code already merged 95d340a8; close
   AS-ORCH-L1-070/078/079/080 in assumptions) + handoff + restart stack if needed.
   VERDICT: fix with D1 RECURRING post-config-fix -> the reviewer's candidate (b) becomes
   a coder fix run off trunk (request-level enableThinking:false in
   readOligoOrderWithAi and/or JSON-extraction before parse; FIFO behind ISEQ-1/ISEQ-2).
   VERDICT: fix on S4-S6 review-UI wiring -> defect list + absolute screenshot paths to a
   fix run. Another harness-class death -> orch-route deterministic Playwright (my own
   script judging artifacts), per AS-ORCH-L1-078 escalation.
3. Lane 2 coder (SHORTHAND-COMP-1-FIX2) exited clean 12:24 (lock passed to ISEQ-1);
   fleet-lock pidfile now names ISEQ-1-resume — that is lane 1's own worker, not a hold.

## Next tick (ordered)

1. Reconcile gate retry 3 (proc 1823985 + receipts 20261013T1240 trail/report). Handle
   per Live-2 above.
2. Reconcile ISEQ-1 resume (log coder-ISEQ1-l1t1150resume.log + report end-marker +
   worktree commits). Exited -> §11 adversarial gate. Alive past ~3x the ~90-min estimate
   (rule 7b: inspect state.db motion first; at 3x re-dispatch via a different route).
   rc=137 AGAIN -> environment-defect escalation (AS-ORCH-L1-077), do NOT blindly retry.
3. On ISEQ-1 merge: ISEQ-2 is the next FIFO coder (spec already promoted, dispatch_gate
   = fleet lock only). Dispatch cl-coder with queue script + unique report path
   iseq-2-report-l1t<ts>.md off the post-merge trunk.
4. OWN-13 md5 / OWN-14 approvals silent checks; :3092/:5192 health.

## Evidence-debt / carried (OPEN unless stated)

- OPEN: AS-ORCH-L1-042; AS-ORCH-L1-048/054 (close only when rule-9 applied);
  AS-ORCH-L1-068 (closes only at OWN-14's gate); AS-ORCH-L1-070 (OLIGO-AI-3 browser
  obligation, pinned 95d340a8 — gate-3 is its third attempt); AS-ORCH-L1-077 (ISEQ-1
  rc=137 kill source unidentified); AS-ORCH-L1-078 (tier-2 proved sufficient: it
  rendered a real verdict — the D1 suspect was product/config, falsified-and-fixed);
  AS-ORCH-L1-079 (D1 config fix assumed sufficient — closes at gate-3 accept or at the
  product-side fix run); AS-ORCH-L1-080 (gate-3 S5 scoping; if NO row on the fixture
  imports, report BLOCKED-by-OQ3 for architect adjudication, do not force a pass).
- OPEN: OWN-13 DEV-1 rule-9 append (Brad/interactive-owned).
- NEW candidate future-queue proposal (record-only, NOT bundled anywhere): product-side
  hardening of the AI-producer JSON path — request-level enableThinking:false and/or
  JSON-extraction before JSON.parse + prompt "ONLY the JSON object" rule
  (reviewer's D1 candidate (b)); lane config is fixed but ANY deployment can hit the
  prose-in-content path again.
- Record-only carry-forward (unchanged): OLIGO cycle-2 residuals (C8 static-trace,
  manual-reopen-input quirk); candidate_refs reverse-index; bare-"Total <digits>";
  OQ3 dye-leak config fix (NOW ALSO gate-3's S5 scoping rule — if gate-3 reports
  BLOCKED-by-OQ3, this graduates to a real dependent-work blocker for architect);
  sequenceSources.ts:44 alphabet hardcode; OLIGO reviewer O1-O5; QMS-7 doc nits; grant
  authoring gate unwired (OPS-1 b); reviewer-harness cwd trap; registry payload echo;
  CF-OWN1-A/B; AS-OWN5-002; AS-ORCH-L1-036; OWN-8 obs 2; OWN-13 DEV-2 erratum; app tsc
  baseline 23; OWN-10 reviewer O1; vitest --dir false-failure + cwd trap; OWN-11
  mock-path erratum; POLICY_ROOT_KINDS = OWN-14 scope; browser/ package doubly-orphaned;
  ISEQ-1 §15 no-bundle rule; reviewer negative-claim re-verification rule stands.

## assumptions
- AS-ORCH-L1-079: D1 fixed via RUNTIME lane config (enableThinking:false on
  qwen3.8-flash-OR, gitignored lane1-config.yaml) — assumed sufficient because the prose
  came exclusively from the reasoning-fallback path; if gate-3 still gets a non-JSON 422
  the fix is product-side (candidate (b)), NOT another config tweak.
- AS-ORCH-L1-080: gate-3 S5 re-scoped per the spec's existing OQ3 adjudication (prefer an
  issue-free row; dye-class refusal = pinned-behavior evidence, not a new defect).
- Gate retry kept at TIER-2 (not escalated): tier-2 executed mechanics correctly and its
  verdict was real; the SOUL-6c ladder escalates harness CLASS failures, not productive
  re-shots. Tier noted in the receipts.
- No credentials recorded anywhere in this handoff.
