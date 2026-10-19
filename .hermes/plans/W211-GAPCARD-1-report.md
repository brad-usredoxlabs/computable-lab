# W211-GAPCARD-1 — orchestrator-authored merge-time evidence report

Authored by the orchestrator (l2t0300, 2026-10-19T03:1x EDT) because the coder
process exited code=0 at 02:36 on a context-compression timeout and never wrote
its report (log: logs/coder-W211-GAPCARD1-l2t0055.log, "Context compression
timed out ... CODER EXITED code=0 2026-10-19T02:36:51-04:00"). Precedent for an
orch-authored merge report: W211-MACH-1 (887ea241). This report contains ONLY
evidence the orchestrator or the adversarial reviewer produced and observed
first-hand; no coder claims are relayed unchecked.

## Candidate
- Worktree /mnt/vast/home/brad/git/wt/W211-GAPCARD-1-lane2-l2t0055
  branch feat/W211-GAPCARD-1-lane2-l2t0055, code commit e1ad8009, base c8f8c476
  (ancestor of trunk — three-dot diff authoritative).
- Merged: --no-ff into cl/integration-2 -> b2173068 (trunk was 1cca2fa9, docs tip;
  no concurrent code movement, merge output 7 files +723/-15 matches the diff).

## Adversarial gate (MANDATORY, passed)
- cl-adversarial-reviewer (OpenRouter deepseek) c1:
  reviews/advc-GAPCARD1-c1-l2t0210.md -> VERDICT: accept (exited code=0
  03:00:28). It ran the targeted suites itself:
  "Test Files 4 passed (4) / Tests 28 passed (28)" and the base-RED check
  "1 failed (1) / 9 failed | 1 passed (10)" (gapcard test file RED at base —
  non-vacuity proven). Fixture integrity "8 passed (8)" (spec's "7 PASS" is a
  stale count; file untouched, all pass — reviewer adjudicated, not a defect).
- Non-blocking observations recorded in the review (prototype-chain `in` —
  contrived; OQ5-ratified wording posture). No defects.

## Orchestrator verification (first-hand, this tick)
1. Scope: `git -c core.fileMode=false diff c8f8c476...HEAD --stat` = 7 files
   +723/-15, ALL app/; zero server/src, zero schema/, app/e2e/fixtures
   untouched (fixture bytes: diff empty).
2. ParameterAnswerInput.tsx: NEW TRACKED; `diff` against trunk's untracked
   source -> EMPTY (byte-identical). Satisfies the spec addendum (extraction
   CANCELLED; verbatim tracked copy).
3. Fold discipline (bait 6): ProtocolLocalizationThread.tsx has ZERO
   heldFactToClarificationRequest call-sites; ONE shared foldCards import used
   by foldHeldBundle and foldResponseClarifications (Array.isArray+length>0
   guard), cards set BEFORE holdForReview at every arm (lines ~385-388, 508-514,
   561-564, 603+). Gate call unchanged.
4. Table rows verbatim: 'ambiguous': '/m', 'contradicts-the-text': '/m',
   'missing-required-argument': null (+ labware '/l' overrides); fallback keys
   ONLY on table-entry presence + actionLocation slot identity; explicit-null
   typed `| null`.
5. Domain-literal scan of the diff: bead/lysis hits are ONLY inside test
   fixtures (labels/reasons of synthetic facts); product sources clean.
6. Targeted tests RUN BY ORCH: adapter suite 10+9+4 passed; gapcard thread
   .tsx suite 5/5 passed (vitest 1.6.1, worktree). Integrity test on worktree:
   8/8 passed.
7. app tsc comm: worktree 28 lines vs trunk 28 lines; the only comm-13 delta is
   the PRE-EXISTING runDeckLock TS2339 shifted 232->233 by the diff's own lines
   (same error, same file, present in the trunk baseline) -> ZERO new errors.

## Browser obligation (open, tracked)
Per spec BROWSER GATE section the UI gate covers BOTH cards incl. 'not-stated'
and clears AS-LANE2-SAMPLECARD1-NOTSTATED-LITERAL-CROSSITEM. Stack restarted at
merge (tracked ParameterAnswerInput.tsx replaces a symlink-resolved path); gate
dispatch is the NEXT action once :5193 is confirmed serving b2173068. Until a
real receipts VERDICT: accept lands, the item's browser evidence debt stays
open and is carried in the handoff (merge precedes the async gate per rule 6b;
the merge itself is justified by the hard code-track gates).
