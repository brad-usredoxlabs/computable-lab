# Handoff — LANE 2 tick 2026-10-06T23:55 EDT
## (PB-CH-2 DONE — coder clean exit, adversarial fix cycle closed by orchestrator-executed receipts, merged 236228fc; PB-CH-3 spec PROMOTED, coder-ready next tick)

Campaigns: `ai-protocol-edit-and-router` + `page-builder channel`. Trunk `cl/integration-2` HEAD
**`f19319a5`** (docs; code tip = PB-CH-2 merge chain 23c92476 -> 35f28cbb -> 6fd9f4b7 -> 236228fc +
PB-CH-3 spec promotion). Lane stack restarted 23:20 EDT (new workstate YAML loaded, 185 schemas),
:3093/:5193 both 200 serving merged trunk. Brad's :3001/:5174 untouched.

## LIVE AT CHECKPOINT
- NONE. Fleet coder lock FREE (coder pid 2298067 exited ~22:56; lock pid file stale — verify gone
  before treating as free, per usual). Composer pid 2301457 exited 23:07 (draft delivered).
  Adversarial reviewer exited 23:07. No browser reviewer / scout live.

## CLOSED THIS TICK
### PB-CH-2 -> done (merged; every gate rendered real evidence)
- Coder (cl-coder l2t2155, base e5395353): commits 23c92476 feat + report commits; 9 files +1392/-4,
  all sanctioned (registry entry + 2 YAML + workstateCompile + 2 test files + export-only refactor).
- ADVERSARIAL GATE: cl-adversarial-reviewer (deepseek-v4.1-flash), report
  `.hermes/plans/PB-CH-2-adversarial-review-l2t2155.md` — all 11 reviewer-bait obligations PASS at
  code/test level (it ran the 39-test drafts suite, tsc set-identity 26=26, forbidden-path diffs
  EMPTY); VERDICT: fix with exactly one MAJOR = DEFECT 1 (evidentiary: real-lane-data /api/session
  byte-hash pair + :3093 API receipts absent — coder legitimately cannot restart the stack; the
  report openly marked them PENDING-RESTART as its prompt instructed).
- DEFECT 1 CLOSED BY ORCHESTRATOR (the pre-planned PENDING-RESTART route; not a coder re-dispatch):
  restarted :3093 (background per pitfall), ran the coder's exact receipt sequence:
  * byte-hash pair USR-BRAD BEFORE==AFTER through compile+accept x2+negatives: file
    8107ef6e…/GET 43d245a2… IDENTICAL.
  * happy path DRAFT-560baaba…: compile 200 canAccept:true writes:[] + live sessionDocument with
    resolved ids; accept x2 byte-identical, accept == compile result.
  * term variant (spec example): resolved PLR-plan-assist-plus-transfer-866a0306, never the term.
  * unresolved term: canAccept:false, UNRESOLVED_TERM needs-missing-fact; accept 422 blocked.
  * cross-actor: 403 "Draft access is restricted to its actor." — required seeding USR-RECEIPT-OTHER
    (x-user-id USR-LOCAL-ADMIN resolves to USR-BRAD via ensureLocalAdminUser! see
    AS-LANE2-PBCH2-RECEIPT-ACTOR-RESOLUTION).
  * smuggled sessionDocument: 422 "/: Unknown property: sessionDocument".
  Receipts appended on the branch (86a2ed58) then merged; promoted `.hermes/plans/PB-CH-2-report.md`.
- VERIFIED MYSELF: opened adapters.ts/compileWorkspaceAction.ts/workstate-tab-kinds.yaml diffs;
  canonicalReadStore exposes get/exists/list/validate/lint only; drafts 3/39 green on MERGED trunk;
  live compile/accept. No UI in scope -> no browser gate (spec §Out of scope). Server YAML changed
  -> stack restart DONE (no further restart pending).

## QUEUE STATE / NEXT TICK
1. **PB-CH-3 CODER-READY — dispatch first.** Spec PROMOTED:
   `.hermes/plans/2026-10-06_2345-PB-CH-3-shared-executor-spec.md` (composer draft reviewed, baselines
   re-verified at 236228fc: app tsc 34, grep agent_action app/src = 0). OQ1 RESOLVED by my live
   accept-body observation: FLAT body; draftId/revision/reviewHash are NOT in the body — executor
   signature must take identity as separate params (see promotion notes; worker must reflect it in
   red-first tests). Dispatch: acquire fleet lock, fresh worktree wt/PB-CH-3-lane2-l2t<HHMM> off
   claim-time HEAD (>= 236228fc), background launch, unique report path .hermes/plans/
   PB-CH-3-report.wip-l2t<HHMM>.md, prompt notes: NO UI mount -> no browser gate, no stack restart,
   no server/YAML diff (byte-empty proof required), targeted app baseline 21 files/106 PASS + full
   suite 53 failing-file baseline, NFS worktree-add in BACKGROUND, node_modules symlinks from trunk.
   ALSO dispatch cl-spec-composer for PB-CH-4 in background once PB-CH-3 is claimed (unique draft path).
2. PROTO-AI-13 (shadow router): corpus 28 lines at 22:50 (still << 500/50 thresholds); clock
   accumulating; AS-PROTO-AI-12-W1 disclosure due at its verdict. Nothing actionable this tick.
3. Human artifacts unchanged (all dispositioned; never re-ask).

## Reconciliation notes
- Coder log showed its report inline at 22:56 with CODER-EXITED; lock owner pid gone => adopted.
- The "Record access denied." (403) on the ADMIN-actor accept was NOT a defect: independent proof
  that accept re-verifies ACLs on bound reads (PLR planned-run ACL private owner=USR-LOCAL-ADMIN;
  ADMIN-actor resolved to BRAD who can't read it). GET /api/records/PLR-plan-assist… 404 for both
  users corroborates. Happy-path receipts switched to no-ACL/BRAD-visible records.
- Accept flow requires the draft actor to also canAccess every bound read — future workstate UI
  turns will surface this as an honest per-record denial; worth remembering for PB-CH-4 error copy.

## assumptions:
- NEW AS-LANE2-PBCH2-RECEIPT-ACTOR-RESOLUTION (x-user-id USR-LOCAL-ADMIN == USR-BRAD; seeded
  USR-RECEIPT-OTHER test user left in lane store; happy receipts on BRAD-visible records).
  reversible true; evidence_debt false. owner: orchestrator.
- NEW AS-LANE2-SERVER-TSC-PIN-26 (server tsc pin 27 -> 26 lines, two independent measurements,
  set-identity preserved). reversible true; evidence_debt false. owner: orchestrator.
- NEW AS-LANE2-PBCH3-ACCEPT-BODY-FLAT (PB-CH-3 accept-body shape from live receipt, not coder
  report; one-line amend path if nesting ever lands). reversible true; evidence_debt false.
  owner: orchestrator.
- Carried (unchanged): AS-PROTO-AI-12-W1 (**EVIDENCE DEBT — disclose QAD-Q4_0 quant, sha256
  3d10b6ab…, with the PROTO-AI-13 verdict digest; STILL OPEN**), AS-LANE2-DETERMINISTIC-GATE-RENDER,
  AS-LANE2-AI11-RUN4-CLAIM-REFUTED, AS-LANE2-PBCH2-LANDING-SEQSCHEMA (do not silently revert
  sequence.schema.yaml), AS-LANE2-REVIEWER-AUX-COMPRESSION-PINNED,
  AS-LANE2-SHADOW-CORRECTED-CONFIG-PATH, AS-LANE2-WORKTREE-BOOTSTRAP-NODELINKS,
  AS-PROTO-AI-11-LANE2-STORE-SEED-TESTDATA, AS-PROTO-AI-11-AMEND-LOCAL-ONLY,
  AS-PROTO-AI-11-LBW-MATCH-REVIEW, AS-PROTO-AI-11434-VISION-SERVICE-ALREADY-DOWN,
  AS-PROTO-AI-2-C1-ANCHOR, AS-PROTO-AI-9-C5-ROLENAME, AS-PROTO-AI-9-LANE2CONFIG-RECREATE,
  AS-PROTO-AI-9-W8, AS-PROTO-AI-9-SURFACE-MOUNTED, AS-PROTO-AI-9-RDEFECT2-PLACEMENT,
  AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL, AS-PROTO-AI-9-ISOLATED-STACK,
  AS-PBCH7-OUT-OF-SCOPE-SESSION-AUTHZ-GAP, AS-PBCH1-AMBIGUITY-MINIMAL-RULE.

## Open evidence-debt entries
- **AS-PROTO-AI-12-W1** — served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256
  3d10b6ab…); disclose with the PROTO-AI-13 verdict digest. STILL OPEN (due at AI-13).

## Baseline facts (at merged trunk 236228fc / f19319a5)
- server tsc **26** lines (pin corrected, see AS-LANE2-SERVER-TSC-PIN-26); src/drafts **3 files/39
  PASS**; app tsc 34; src/ai 10 failed files/21 failed/565 passed (set-identity); src/schema+surfaces
  3 failing files (symlinked live-tree tests). PRT-4iaey2 sha 30a353a8… unchanged.
- Shadow corpus events.jsonl = 28 lines (22:50 measure).
- Lane stack restarted 23:20 (backend pid from cl-lane-stack.sh 2 start log stack-restart-20261006T2320.log).
- Seeded test data this tick: user USR-RECEIPT-OTHER (email required by user schema), form-drafts
  DRAFT-560baaba… (accepted), DRAFT-2c8f235e/ed91f589/a3321a3e/51dc3129 (compile artifacts). All
  test data per Brad's ruling.
- Playwright import path /mnt/vast/home/brad/git/cl-integration-2/node_modules/playwright/index.mjs;
  lane-stack restart BLOCKING -> background=true; git -c core.fileMode=false on NFS; NEVER git add -A
  in coder worktrees; /mnt/vast worktree add must run in BACKGROUND.
