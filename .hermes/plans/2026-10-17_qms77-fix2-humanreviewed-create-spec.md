# QMS7-7 FIX-2 SPEC — architect RULING OPTION A: human-reviewed record-drafting create is NOT an auto-create action (lane 1)

Architect ruling (AUTHORITATIVE, read first): /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-16_qms77-autocreate-policy-ruling.md (RULING: OPTION A)
Decision request: .hermes/plans/2026-10-16_qms77-autocreate-policy-decision-request.md
Evidence: /home/brad/.hermes/cl/receipts/QMS7-8/20261016T2340/report.md §D1 (lap 7 blocked under POL-REGULATED) + /home/brad/.hermes/cl/receipts/QMS7-7/20261016T2245/ (tier-2 trail).

## Worktree / branch
Work in the EXISTING worktree /mnt/vast/home/brad/git/wt/QMS7-7-lane1-l1t1500 on branch wt/QMS7-7-lane1-l1t1500 (first `git -c core.fileMode=false pull . cl/integration-1` equivalent: rebase/merge current trunk c39dcfa2+ INTO the branch so the fix sits on the latest; trunk has the QMS7-7 merge already). NEVER touch /mnt/vast/home/brad/git/computable-lab or :3001/:5174. Use `git -c core.fileMode=false` for all git ops (NFS mode-bit noise).

## Defect (root cause anchors, orchestrator-verified)
CompilerKernel.ts:53-54 maps every inferred `new-record` binding to a `auto-create` PolicyActionRequest; POL-REGULATED (regulated.policy-bundle.yaml:7 allowAutoCreate: deny) blocks it; WorkstateProposalCard.tsx:168-177 then renders Reject-only. But the record-drafting flow has a HUMAN Accept click upstream of any write (FormDraftService accept loop: reviewHash re-check, full policy re-evaluation, owner-policy, audit). Labeling it auto-create is a classification error at the inference site.

## Required change (per ruling §Required actions — no deviations)
1. DATA SWITCH: config/drafting/adapters.yaml, record-drafting domain block: a declared flag (architect's suggested name `humanReviewedCreate: true`; implementer may choose a clearer name) lint-validated against the adapters config schema (extend that schema if it exists — if the adapters.yaml has no schema today, follow the existing validation precedent for that file and add the field there).
2. The staged-authoring compile pass must read the adapter's declared block (same per-call load pattern as the existing landing.tabKind block — QMS7-7 FIX1 precedent, find it by content) and, ONLY for flagged adapters, withhold the `auto-create` PolicyActionRequest for the adapter's staged create. NO spec names, spec ids, "training"/"registry" literals in TypeScript.
3. UNTOUCHED: CompilerKernel.inferredActions default behavior (unflagged `new-record` still yields auto-create), MaterialCompiler/protocol auto-deposition paths, every other policy setting (allowPlaceholders, allowSubstitutions, ...).
4. The accept loop's full policy re-evaluation must NOT be weakened — test-assert it still runs for flagged adapters.

## Tests (RED first)
- T1 RED: flagged adapter's compile under POL-REGULATED yields NO auto-create action (card-compilable, not POLICY_BLOCKED).
- T2: unflagged `new-record` binding under POL-REGULATED still yields POLICY_BLOCKED (default preserved).
- T3: material/protocol auto-deposition path unchanged under POL-REGULATED (regression).
- T4: accept loop still runs full re-evaluation for a flagged-adapter draft.
Report RED output before GREEN. Scope vitest to touched suites; typecheck: app tsc baseline is 23 pre-existing event-editor errors (AS-ORCH-L1-102 class) — bar is ZERO NEW errors.

## Deliverable (unique path)
Report: /home/brad/.hermes/cl/lanes/1/qms7-7-fix2-report-l1t0030.md — STATUS line, diff stat, test commands + real outputs (RED then GREEN), files changed. Commit on the branch with a message naming the ruling (RULING OPTION A). End coder output with marker "QMS7-7 FIX2 DONE <sha>".

## Stop boundaries
Platform gap outside this scope (e.g. the flag cannot be threaded without changing the compile-pass response shape) => STOP, return requires-rescope with evidence. No D2/AS-ORCH-L1-145 ACL work here. No app/ UI changes (WorkstateProposalCard renders Accept whenever the compile decision permits it — verify that holds with the flag on; if it does NOT, that IS in scope: the card must show Accept for a permitted compile, cite file:line).
