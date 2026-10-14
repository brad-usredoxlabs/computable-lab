# Handoff — lane 1 tick 20261013T0020 (OLIGO-AI-2 CODER LIVE; OLIGO-AI-3 COMPOSER LIVE)

Author: orchestrator cron tick — 2026-10-13 ~00:20–01:25 EDT — lane 1.
Budget: 45-min soft; last dispatch 00:40 (composer). No kills. :3001/:5174 never touched.

## Headline

OLIGO-AI-2 went spec-review -> promote -> worktree -> coder dispatch IN ONE TICK. The
composer draft (l1t2325) delivered with the end-marker; the orchestrator verified its
load-bearing anchors first-hand at trunk 11aca57e (§0's "not on trunk" gate is now
satisfied — AI-1 merged last tick), adjudicated OQ1/OQ2/OQ3 at the recommended defaults,
and PROMOTED to `.hermes/plans/2026-10-13_oligo-ai-2-ai-producer-fallback-spec.md`.
Fleet coder dispatched 00:36 via the flock queue (lock was FREE — prior holder pid
4013654 confirmed gone, not just timed out). OLIGO-AI-3 spec-composer dispatched 00:40
in parallel (thunderbeast). Both workers LIVE at checkpoint.

## Actions this tick

1. RECONCILED: no lane-1 workers alive at tick start. OWN-13 CLAUDE.md md5
   cc43d17766d5606ee3d532c5356cbff4 UNCHANGED (rule-9 still absent; Brad-owned, not
   re-asked). OWN-14: newest file under lanes/1/decisions/ still
   L1-qms-field-defects-ruling-20261010.md — NO Brad approval (silent check, not
   re-asked; stays blocked with existing structured fields). Fleet lock: stale pid
   4013654 DEAD -> flock -n probe returned FLEET_LOCK_FREE. Stack :3092/:5192 200.
2. OLIGO-AI-2 draft l1t2325 reviewed; anchors verified first-hand at 11aca57e:
   oligoOrderDraft.ts exports (OligoOrderDraftRow :18 / OligoOrderDraft :32 /
   oligoRowsFromDraft :41), schema additionalProperties:false + required[kind,rows],
   pinned $id at OligoOrderDraftSchema.test.ts:26-27 ("OLIGO-AI-2 imports this string"),
   normalizeOligoRawBases/OligoModification/OligoRow exported in oligoOrder.ts, NO
   aiFallback/declaredItemCount key in config/sequence-analysis/oligo-order.yaml.
   Line shifts post-merge noted (extractOligoRows call now :85, ingestOligoOrder :67).
   ORCH PROBE of the §6 declaredItemCount regex (my own run): ITEMS:/QTY/Total Items
   match; "Total Amount: $12.34" and "QTY: 12 (20 uM)" reject — BUT bare "Total 1234567"
   MATCHES (spec §15.8 bait wording is "price lines with trailing text", so arguably in
   spec; flagged for the adversarial reviewer to adjudicate — see carried notes).
3. PROMOTED spec -> .hermes/plans/2026-10-13_oligo-ai-2-ai-producer-fallback-spec.md
   with a PROMOTION NOTE (supersedes §0; OQ1 json_object / OQ2 diagnostics in
   ingestOligoOrder / OQ3 colocated evaluator — all ACCEPTED at composer defaults).
   AS-ORCH-L1-076 re-verification obligation DISCHARGED (anchors checked at trunk).
4. Worktree /mnt/vast/home/brad/git/wt/OLIGO-AI-2-lane1-l1t0025 created off
   cl/integration-1 @ 11aca57e; node_modules symlinks per AI-1 convention.
5. CODER DISPATCHED 00:36:24 (terminal proc_65d6d8bfc46a; flock-holding wrapper pid
   84205; hermes pid 84268; prompt prompts/coder-OLIGOAI2-l1t0035.txt; log
   logs/coder-OLIGOAI2-l1t0035.log; unique report
   ~/.hermes/cl/lanes/1/oligo-ai-2-report-l1t0035.md; end-marker
   "OLIGO-AI-2 CODER DONE <sha>"). Fleet lock HELD by 84205 for the run.
6. SPEC-COMPOSER for OLIGO-AI-3 dispatched 00:40 (proc_c0d548a1fc2e, hermes pid 103013;
   prompt prompts/composer-OLIGOAI3-l1t0040.txt; log logs/composer-OLIGOAI3-l1t0040.log;
   unique draft .hermes/plans/drafts/2026-10-13_oligo-ai-3-job-wiring-review-ui-spec.l1t0040.draft.md;
   end-marker "COMPOSER DONE OLIGO-AI-3 <bytes>"). Brief pins Tasks 6-10 only, marks
   OLIGO-AI-2 producer surface references "per OLIGO-AI-2 spec (pending merge)", and
   requires a §0 dispatch-base gate + the :5192 browser-gate spec surfaces.
7. Task list updated under task-list.lock: OLIGO-AI-2 -> in-progress with full worker
   identity; dispatch_gate annotated promoted.

## Live at checkpoint (do NOT duplicate)

1. OLIGO-AI-2 coder pid 84268 (wrapper 84205 holds the fleet lock; lock pidfile names
   OLIGO-AI-2(l1t0035) dispatch-pid:84205). Alive 01:22 (~46 min; AI-1 precedent ~53 min
   end-to-end; suspect at >= ~110 min / 2x). Motion at checkpoint: server/oligo-ai2-probe.mts
   + server/src/sequences/oligoOrderAiRead.test.ts EXIST untracked (spec §12 probe done, RED
   test being written, no commits yet — normal for the RED-first sequence's first commit).
   Delivery rule: report exists + end-marker. On exit: adversarial gate
   (cl-adversarial-reviewer, unique report reviews/oligo-ai-2-advreview-l1t<tick>.md), then
   orch verify (real diff, RED re-runs, §13 commands), then merge --no-ff, then — config YAML
   CHANGED by this item -> lane-stack restart + boot check (the aiFallback key must load;
   NO browser gate owed for the item itself per spec).
2. OLIGO-AI-3 composer pid 103013. Alive 01:22 (~42 min; expected ~45; suspect >= ~90 min
   with no draft file). On draft: review, verify anchors against trunk HEAD POST-OLIGO-AI-2
   merge (the producer code will exist by then — re-anchor the "pending merge" refs),
   adjudicate OQs, promote. Its coder queues on the fleet lock AFTER OLIGO-AI-2.

## Next tick (ordered)

1. Reconcile both workers by pid + artifacts (above). OLIGO-AI-2 exited -> full gate
   sequence (adversarial -> verify -> merge -> restart -> done + handoff). Still alive ->
   observe; >= 2x duration with no report AND no file/commit motion -> escalate per ladder
   (inspect its state.db via the profile dir before declaring death).
2. OLIGO-AI-3 draft -> review/promote (re-anchor to post-AI-2 trunk), dispatch coder via
   fleet-lock queue when the lock frees.
3. OWN-13: check ONLY whether CLAUDE.md md5 != cc43d17766d5606ee3d532c5356cbff4 with text
   matching own13-report-l1t1900resume.md DEV-1 verbatim; if applied, close OWN-13 +
   AS-ORCH-L1-048/054, prune wt/OWN-13-lane1-l1t1305.
4. OWN-14: silent approval check (lanes/1/decisions/ + session record). Unchanged ->
   stays blocked, never re-asked.
5. Health-check :3092/:5192 at tick start.

## Evidence-debt / carried (OPEN unless stated)

- OPEN: AS-ORCH-L1-042 (boot list-visibility class); AS-ORCH-L1-048/054 (close only when
  rule-9 applied); AS-ORCH-L1-068 (closes only at OWN-14's gate).
- CLOSED this tick: AS-ORCH-L1-076 (OLIGO-AI-2 draft anchors re-verified first-hand at
  trunk 11aca57e at promotion).
- NEW carried: declaredItemCount regex bare-"Total 1234567" arm — orch probe shows the
  spec's own §6 pattern ACCEPTS a bare "Total <digits>" line (a quantity header reads as
  a declared count; a price line with trailing text does not). Spec-permissible reading;
  put it to the adversarial reviewer explicitly; if judged a defect it goes to the coder's
  fix run, not to an orch patch.
- Prior carried findings unchanged: OLIGO reviewer O3 (minItems/minLength tightening
  candidate), O1 (envelope-identity arm mod-free); QMS-7 doc nits; grant authoring gate
  unwired (OPS-1 b); reviewer-harness cwd trap; registry pre-transition payload echo;
  CF-OWN1-A ../core/ dangling-ref class; CF-OWN1-B json widget demand; AS-OWN5-002 plan
  errata candidate; evidence dir no tracked files (AS-ORCH-L1-036); OWN-8 reviewer obs 2;
  OWN-13 DEV-2 spec erratum stands; app tsc baseline = 23; OWN-10 reviewer O1 (AI update
  drops defaultGrants — architect-level); vitest --dir false-failure invocation; OWN-11
  spec mock-path erratum; OWN-11 narrow-panel table-gutter cosmetic nit; POLICY_ROOT_KINDS
  reconciliation is OWN-14 scope; browser/ package doubly-orphaned pending approved
  deletion.

## assumptions
- No new consequential assumptions this tick. OQ1-OQ3 adjudications were orchestrator
  decisions recorded in the promoted spec, not invented values. The declaredItemCount
  regex is the spec's shipped data, flagged for adversarial adjudication, not assumed
  correct. No credentials recorded anywhere.
