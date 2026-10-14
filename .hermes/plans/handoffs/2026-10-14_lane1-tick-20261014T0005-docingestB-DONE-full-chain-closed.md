# Handoff — lane 1 tick 20261013T2320–20261014T0007 EDT (DOCINGEST-B CLOSED end-to-end: adversarial ACCEPT + orch verify + merge 1f5c9d79 + stack restart + live probes + browser gate ACCEPT via orch runner)

Author: orchestrator cron tick — 2026-10-13 23:20–00:07 EDT — lane 1. :3001/:5174 never
touched. :3092/:5192 200 throughout (restarted once, deliberately, post-merge — YAML).

## Reconciliation at tick start (verified first-hand)

1. DOCINGEST-B coder CONFIRMED GONE (exited 22:23 rc=0 per prior tick; pid 3288807 absent).
   Fleet lock FREE (lane 2's COMP-3 acquired it after — fleet-single honored; no lane-1
   coder dispatchable this window anyway: no approved task remained).
2. ADVERSARIAL GATE attempt-2 FOUND DEAD: pty launcher opened the interactive REPL instead of
   injecting -z (log shows banner + "Ask anything" + idle); report never written; pids
   3593679/3593741 gone. New lesson recorded (see attempts below).
3. OWN-14: no new file under lanes/1/decisions/ (newest still L1-qms-field-defects-ruling-20261010)
   → silent, NOT re-asked. OWN-12 unchanged (gate owner until OWN-14's S1-S7 gate).
4. Lane data-repo index.lock probe: CLEAN. :3092/:5192 200. Trunk HEAD 5a65abb3 (OWN-13 done).

## Work done this tick — DOCINGEST-B closed end-to-end

1. ADVERSARIAL GATE re-shot successfully (attempt 3): prompt
   prompts/advreview-docingestb-l1t2330.txt (18 spec baits + 9 orchestrator probes P1-P9:
   EXDEV partial-failure window, per-record page-dir traversal encodings, mediaKind enum
   drift, formats-config split-brain, schema-diff-zero, text-layer non-rasterization pin,
   caution conditionality, exactOptionalPropertyTypes, symlink-repair legitimacy). Launcher
   queue-advreview-docingestb-t2.sh = setsid nohup hermes -z "$(cat prompt)" </dev/null
   >> log (the PROVEN coder pattern). Report
   reviews/docingest-b-advreview-l1t2330.md: **VERDICT: accept, DEFECT LIST: None** — 3
   non-blocking observations (O1 silent catch pdfAcquisition.ts:266-273; O2 pageDir vs
   contentSha cross-check; O3 test-title nit). Launched 23:40, exited rc=0 23:45.
2. ORCH VERIFY first-hand (not the reviewer's word): server tsc --noEmit = 0 errors (my run);
   server touched suites 27 files / 346 tests passed (my run); app src/ingestion 2 failed |
   129 passed — the 2 failures REPRODUCE running treeSelect.test.tsx ALONE, matching the
   documented pre-existing base failures; schema diff 0 lines, sequences diff 0; branch
   history carries no .png/.jpg/.pdf binaries; 17 files, +1270/-30, all within spec §3.
3. MERGED: git -c core.fileMode=false merge --no-ff wt/DOCINGEST-B-lane1-l1t2030 →
   trunk **1f5c9d79** (clean). Task marked done under the queue lock.
4. LANE STACK RESTARTED (config/ingestion/document-extraction.yaml touched — tsx --watch
   does not reload YAML). Backend READY 200 after 20s.
5. ORCH LIVE PROBES on :3092 post-restart: photo upload (JSON contentBase64 shape, NOT
   multipart — route takes JSON) → VPDF-0B2AAF90F1C7: engine=upload, mediaKind=image,
   originalFileName honest, file.media_type=image/png, REAL tesseract OCR text
   "LYSIS BUFFER ADD 500 uLl"; page/1 → 200 image/png (14474b); page/2, ..%2F..,
   %2e%2e%2f%2e%2e%2f, abc, 21-digit → ALL 404; DOC-DEMO-SOP/page/1 → 400; extraction draft
   → 201 candidateCount 1.
6. BROWSER GATE §12 S1-S4: ORCH-AUTHORED runner (SOUL 6c route — same proven pattern the
   DOCINGEST-A gate was accepted on; vision slot intentionally free). Fixtures prepared by
   me: magick-rendered photo stand-in (labelled surrogate per S1 wording), §6-B0b scan.pdf,
   ghostscript text-layer PDF (pdftotext-verified). Runner attempt 1 failed on MY harness
   bug (bring-back input re-render after review-page navigation — fixed by
   gotoWorkflowWithBringBack + recent-extract clicks, DOCINGEST-A pattern); attempt 2:
   **1 passed, 48.2s**, trail.json + 4 shots. Declared stub boundary: ONLY the two
   Exa-dependent endpoints (search + ingest); upload/records/page-route/draft/pdfjs all
   REAL. Orch eyeballed S1 (page image + caution render, draft MEANT shows OCR'd protocol)
   and S3b (pdfjs canvases intact, no caution) via vision. report.md ends **VERDICT: accept**.
   Receipts: /home/brad/.hermes/cl/receipts/DOCINGEST-B/20261013T2350/.

## Harness lesson (recorded in the t2 launcher header)

`hermes -z` from a one-shot session: BOTH plain-background AND pty=true launcher shapes
failed (attempt 1: "Input is not a terminal fd=0"; attempt 2: pty opened the interactive
REPL and idled at "Press ENTER" — the -z prompt never injected). The PROVEN pattern is the
coder-launcher one: `setsid nohup hermes -p <profile> -z "$(cat prompt.txt)" </dev/null >>
LOG 2>&1` launched via terminal(background=true), NO pty. Update queue-advreview templates
to match on next dispatch.

## Live at checkpoint (do NOT duplicate)

NOTHING of mine running. Coder fleet lock held by lane 2 (COMP-3) — lane 1 has no coder
dispatchable regardless. :3092/:5192 200. Trunk 1f5c9d79.

## Queue state after this tick

- DOCINGEST-B: **DONE** (this tick; code track + merge + live probes + browser gate all closed).
- OWN-14: blocked on Brad approval (silent on-change watch; NOT re-asked). OWN-12: in-progress
  as gate owner until OWN-14's gate — no dispatchable action.
- Behind DOCINGEST-B: NO approved campaign task remains (Stage C deferred by Brad 2026-10-11;
  DOCINGEST-C-DECISION done). Spec-composer correctly NOT dispatched — inventing campaign
  tasks is out of orchestrator authority. Next-wave candidates surface-listed (OQ3 dye-token
  data fix = strongest; Exa key renewal = external credential; pill styling; index.lock
  watchdog; NEW: DOCINGEST-B hardening O1-O3).

## Next tick (ordered)

1. Reconcile: no live lane-1 workers expected. Verify trunk 1f5c9d79 stands and :3092/:5192
   healthy (a lane-2 tick's start-app.sh may have killed the lane backends — the known NFS
   trap — revive with cl-lane-stack.sh 1 start if so).
2. OWN-14 decisions-dir silent check (never re-ask); OWN-12 gate-owner watch: if Brad approves
   OWN-14, compose its fix-run spec from the Q1-ruling scope and gate S1-S7.
3. If Brad rules any next-wave candidate into the list, claim under the queue lock; fleet
   coder lock discipline per SOUL.
4. Adversarial-reviewer launches: use the t2 launcher pattern (setsid nohup, no pty) — see
   harness lesson above.

## Evidence-debt / carried (OPEN unless stated)

- OPEN: AS-ORCH-L1-042; AS-ORCH-L1-068 (OWN-14's gate); AS-ORCH-L1-082 (record-only);
  AS-ORCH-L1-087 PARTIAL; AS-ORCH-L1-088 (OLIGO eyeball + OQ3-gated full-save leg);
  AS-ORCH-L1-089 (ISEQ-2 orch-runner close).
- NEW this tick: AS-ORCH-L1-096 (page-file naming two-branch convention, carried from coder
  disclosure); AS-ORCH-L1-097 (orch-runner gate route + surrogate-photo leg + reviewer
  O1-O3 hardening candidates, record-only).
- CLOSED this tick: AS-ORCH-L1-093's Stage-B mirror obligation — DOCINGEST-B's own gate
  rendered real receipts, no longer pending evidence.
- AS-ORCH-L1-095 unchanged (record-only). AS-ORCH-L1-091 unchanged (pill styling record-only).
- Candidate future-queue: OQ3 dye-token data fix (STRONGEST, propose to Brad interactively);
  Exa API key renewal; sequence-search pill styling; NCBI keyless pacing;
  sequenceSources.ts:44 alphabet hardcode; browser-reviewer harness hardening; accession-
  searchability of Library labels; DOCINGEST-B page-image retention sweep (OQ2);
  DOCINGEST-B hardening O1/O2/O3; index.lock watchdog (probed clean again this tick).
- Record-only carry-forward unchanged: OLIGO cycle-2 residuals; advreview3 provenance nit;
  candidate_refs reverse-index; bare-"Total <digits>"; OLIGO reviewer O1-O5; QMS-7 doc nits;
  grant authoring gate unwired; registry payload echo; CF-OWN1-A/B; AS-OWN5-002;
  AS-ORCH-L1-036; OWN-8 obs 2; OWN-13 DEV-2 erratum; app tsc baseline 23; OWN-10 reviewer O1;
  vitest --dir false-failure + cwd trap; OWN-11 mock-path erratum; POLICY_ROOT_KINDS =
  OWN-14 scope; browser/ package doubly-orphaned; ISEQ §15 no-bundle rule; AS-ORCH-L1-077
  rc=137 mystery.

## assumptions
- AS-ORCH-L1-096 (this tick, carried from coder): direct-photo page files keep the declared
  extension vs rasterized scans' page-NNN.png; blob handler sniffs the actual file. Full
  ledger entry in assumptions.md.
- AS-ORCH-L1-097 (this tick, record-only): orch-runner gate route accepted on the
  DOCINGEST-A precedent; S1 satisfied by a labelled machine-made surrogate, not a phone
  photo; reviewer O1-O3 carried as hardening candidates, not defects.
- Gate-harness note: neither failed adv-review attempt wrote any file; no evidence was lost;
  the t2 route produced the report first try. No credentials recorded anywhere.
