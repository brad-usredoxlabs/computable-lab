# Handoff — lane 1 tick 20261013T1840–1950 (DOCINGEST-A merged 50280e81 + gate owed; ISEQ-2 CLOSED via orch-runner; pill chrome defect recorded)

Author: orchestrator cron tick — 2026-10-13 ~18:40–19:50 EDT — lane 1. :3001/:5174 never
touched. :3092/:5192 200 throughout (restart post-merge, schemas 196). Read handoffs
20261013T1744, 1620 — carried items live there.

## Reconciliation at tick start (verified first-hand: ps + git + logs)

1. DOCINGEST-A coder pid 2407986 DEAD (launcher 2330563 dead too, log tail: "CODER EXIT rc=0",
   end-marker DOCINGEST-A CODER DONE 32f5bc93 present, report 22KB written 17:41) — clean exit,
   adopted the output. 12 commits exact §9 C1-C12 sequence, base includes 95d340a8 + 0a4dc3f8.
2. ISEQ-2 tier-1 gate pid 2888288 exited with receipts + VERDICT: accept at
   receipts/ISEQ-2/20261013T1540/ — BUT ruled internally suspect (see work item 2).
3. OWN-13: trunk CLAUDE.md md5 cc43d17766d5606ee3d532c5356cbff4 UNCHANGED -> silent.
   OWN-14: no new file under lanes/1/decisions/ (newest still L1-qms-field-defects-ruling-20261010)
   -> silent, not re-asked; stays blocked on Brad, correct per its block.
4. OWN-12: unchanged (gate owner until OWN-14). Fleet lock: correctly handed to lane 2's
   COMP-2 launcher (pid 2953064, active coder) — lane 1 dispatched NO coder this tick (fleet-
   single honored).

## Work done this tick

1. DOCINGEST-A GATED + MERGED. Adversarial ACCEPT: cl-adversarial-reviewer (OpenRouter) report
   reviews/docingest-a-advreview-l1t1845.md — all 16 §10 baits closed against the real diff,
   0 defects, 3 non-blocking observations (O1 html arm gains `##` markers via OQ1 convergence —
   accepted, only the PDF arm is contractually byte-identical; O2 fail-closed on unreadable
   config; O3 dispatcher extension mirror). Orch-verified FIRST-HAND: `server tsc --noEmit` = 0;
   vitest extract+vendor-documents+VendorPdfSourceSchema+VendorSearchHandlers(.phase9) =
   26 files/324 passed; app IngestionPage+sourcePreview+VendorPdfSearchSection = 3 files/25
   passed; diff --name-only 23 files ALL within spec §3; schema enum + extractionDiagnostics
   declarations and the format-policy YAML read first-hand (no hardcoding — the format map is
   data, bait-8 mutation probe in the coder report showed csv-remove -> 415). MERGED --no-ff ->
   trunk 50280e81. Stack RESTARTED (schema+config+UI touched); :3092/:5192 200, health ok.
   OPEN OBLIGATION (SOUL 6b, pinned): spec §12 browser gate S1-S5 NOT yet run — receipts
   /home/brad/.hermes/cl/receipts/DOCINGEST-A/<ts>/ against served 50280e81. The vision slot was
   busy all tick; this is the async track, recorded, never auto-accepted. AS-ORCH-L1-090.
2. ISEQ-2 CLOSED via ORCH-RUNNER route (SOUL 6c; AS-ORCH-L1-089). Tier-1 receipts were
   internally suspect (capture.mjs cites testids absent from the product —
   import-as-sequence-record vs the real sequence-import-button — and its trail.json shape
   doesn't match that runner's writer; the agent ran an unrecorded variant). So I authored my
   own deterministic Playwright runner (proven OLIGO pattern), ran it fresh against :5192:
   S1 pills present+functional (computed-style probe proves class toggling), S2 live-NCBI search
   -> NR_028961 card, S3 fresh import -> SEQ-e4f3414f1b31ecb44c923282 + Open-in-Sequences link
   (count=1; screenshot eyeballed first-hand), S4 deep-link -> editor textarea 1462 chars = the
   16S sequence, alerts=0, S5 reload -> Library entry present (hasLibBtn). Two independent API
   readbacks (tier-1's SEQ-79c458a3 + my fresh import). Report
   receipts/ISEQ-2/20261013T1855/report.md ends VERDICT: accept. Task marked DONE.
3. CHROME DEFECT FOUND AND RECORDED (AS-ORCH-L1-091, candidate future-queue): the
   .source-pill CSS lives ONLY in SourceSelector.tsx's scoped <style> (Literature tab) —
   SequencesPage.css has none, so /ingestion/sequences pills render as unstyled run-together
   text with invisible active state. Pre-existing ISEQ-1 debt (cf0bea07 fixed only the
   Literature copy), NOT ISEQ-2 scope — recorded, not drive-by fixed.
4. AS-ORCH-L1-086 CLOSED (coder report §5 fixture-provenance declaration present, DEMO-labeled).

## Live at checkpoint (do NOT duplicate)

1. NO lane-1 coder running; fleet coder held by LANE 2 (COMP-2, launcher pid 2953064, log
   lanes/2/logs/coder-COMP2-l2t1830.log).
2. Nothing else of mine running. ISEQ gate queue for ISEQ-2 is satisfied (task done).

## Next tick (ordered)

1. DOCINGEST-A BROWSER GATE spec §12 S1-S5 against served 50280e81 on :5192 (first action;
   vision slot should be free). States: Documents tab label + testid crop; accept-attr crop
   (.docx,.md, NO image types); text-kind review pane first-class selectable text, original
   file named, NO pdfjs, engine=upload/mediaKind=text API-readback, draft run shows candidates;
   S4 legacy PDF record still pdfjs canvases (zero regression); S5 .docx -> honest DOCX_TOOL_
   MISSING rendered (pandoc absent), never blank success. Tier ladder per 6c; ORCH-runner is a
   proven tier. ON ACCEPT: mark DOCINGEST-A done + handoff; THEN claim DOCINGEST-B (§0 gate
   satisfied), acquire fleet lock queue, dispatch coder + next composer.
2. OWN-13 md5 / OWN-14 decisions-dir silent checks; :3092/:5192 health.
3. Lane 2 COMP-2 will release the coder lock eventually — do NOT pre-empt it; queue via
   flock -w like the DOCINGEST-A queue script did.

## Evidence-debt / carried (OPEN unless stated)

- OPEN: AS-ORCH-L1-042; AS-ORCH-L1-048/054 (close only at rule-9); AS-ORCH-L1-068 (OWN-14's
  gate); AS-ORCH-L1-082 (record-only); AS-ORCH-L1-087 PARTIAL (half (b) CLOSED this tick via
  1855 receipts — check assumptions.md, the entry now has only the rule-9 eyeball residual);
  AS-ORCH-L1-088 (OLIGO orch-judge eyeball + OQ3-gated full-save leg); AS-ORCH-L1-089 NEW
  (ISEQ-2 orch-runner close; superseded tier-1 receipts noted); AS-ORCH-L1-090 NEW (**DOCINGEST-A
  browser gate outstanding, pinned 50280e81 — the lane's top obligation**); AS-ORCH-L1-091 NEW
  (record-only pill styling).
- CLOSED this tick: AS-ORCH-L1-086 (fixture provenance declared).
- Candidate future-queue: OQ3 dye-token data fix (STRONGEST, propose to Brad interactively);
  sequence-search pill styling (NEW this tick); NCBI keyless pacing; sequenceSources.ts:44
  alphabet hardcode; browser-reviewer harness hardening (NEW class of evidence: on-disk runner
  != runner that produced trail — gate runners must be saved to their receipts dir);
  accession-searchability of Library labels; DOCINGEST-B page-image retention.
- Record-only carry-forward unchanged: OLIGO cycle-2 residuals; advreview3 provenance nit;
  candidate_refs reverse-index; bare-"Total <digits>"; OLIGO reviewer O1-O5; QMS-7 doc nits;
  grant authoring gate unwired; registry payload echo; CF-OWN1-A/B; AS-OWN5-002; AS-ORCH-L1-036;
  OWN-8 obs 2; OWN-13 DEV-2 erratum; app tsc baseline 23; OWN-10 reviewer O1; vitest --dir
  false-failure + cwd trap; OWN-11 mock-path erratum; POLICY_ROOT_KINDS = OWN-14 scope;
  browser/ package doubly-orphaned; ISEQ §15 no-bundle rule; AS-ORCH-L1-077 rc=137 mystery.

## assumptions
- AS-ORCH-L1-089 (ISEQ-2 orch-runner close + tier-1 supersession) — see assumptions.md entry.
- AS-ORCH-L1-090 (DOCINGEST-A merged-pending-gate, pinned 50280e81) — see assumptions.md.
- AS-ORCH-L1-091 (pill chrome defect = pre-existing ISEQ-1 debt, recorded not fixed) — see entry.
- AS-ORCH-L1-086 CLOSED (fixture provenance verified in coder report §5).
- Adversarial reviewer's unverified G10 app-baseline claim (61 vs 62 fail files) accepted on the
  coder's honest disclosure + my set-diff trust from prior ticks; not load-bearing for the merge
  (zero app-test regressions in the 3 touched suites, verified first-hand).
- No credentials recorded anywhere in this handoff.
