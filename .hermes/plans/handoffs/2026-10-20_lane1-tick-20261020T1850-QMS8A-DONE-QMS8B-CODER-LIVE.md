# Handoff — lane 1 tick 2026-10-20 18:50 → QMS8-A DONE (gate 2 accept+merge+browser-verified) · QMS8-B spec promoted + CODER LIVE

Author: orchestrator cron tick l1t1825 — lane 1. :3001/:5174 never touched. All git via -c core.fileMode=false.

## Reconciliation (first-hand)

- QMS8-A fix-2 coder (pid 2588866): EXITED CLEAN ~18:08, lock released (pid-file shows
  QUEUE-RELEASED 18:07:59). Report STATUS: complete; commit 6527cd2f on
  cl/lane1-qms8a-l1t1640. Adopted.
- QMS8-B composer (pid 2422052): EXITED CLEAN with the DRAFT LANDED
  (.hermes/plans/DRAFT-2026-10-20_1650-QMS8-B-draft-gated-authoring.md, 26KB,
  STATUS: draft-complete). The 18:10 tick's "gone-without-draft → orch writes PROVISIONAL"
  fallback was NOT needed.
- No other live lane-1 workers. Fleet lock was free at claim.

## Actions this tick

1. QMS8-A CLOSED. fix-2 chain completed in ~35 min: adv gate (scoped to the css/test delta,
   qms8a-fix2-advreview-l1t1825.md) VERDICT: accept+ (O1-O4 observations, none blocking; O4
   explicitly assigned the pixel re-measure to the browser gate). Orch self-verify: CSS diff
   read first-hand (token-only, warn chip replaces the inline #c92a2a), own vitest
   PermissionsSection 14/14, own app tsc 23-error set delta-ZERO vs pin
   (qms8a-fix2-orch-tsc-l1t1825.txt). MERGED --no-ff → trunk adbddaf4. Stack restarted, both
   ports 200. Browser gate 2 via the orch route (scripts/orch-gate2-qms8a-l1t1835.js; tier
   ladder: orch script after two tier-1 harness failures this campaign family): served-CSS pin
   PASS; geometry PASS (tableWidth 1134, cardWidth 1168 = :has span works; the gate-1 jam
   signature absent); inert chip computed warn tokens, no inline style; ZERO console errors;
   data truth re-held (5 rows, BRAD filter → exactly 1, nomatch → honest "no grants match this
   filter", Refresh present); orch vision confirmed the screenshot directly — both tables read
   as tables. ORCH-JUDGED ACCEPT. Receipts QMS8-A/orch-gate2-20261020T1835/. Marked DONE.
   wt/QMS8-A-lane1-l1t1640 worktree removed after DONE (housekeeping per last handoff).
2. QMS8-B CLAIMED + DISPATCHED. Composer draft promoted to canonical
   .hermes/plans/2026-10-20_1845-QMS8-B-draft-gated-authoring-spec.md after I verified its
   load-bearing claims first-hand in the trunk (rolesFor superset rule, unscoped
   checkAuthoringPolicy call at RecordHandlers.ts:360-363 vs scoped transition leg,
   AuthoringPolicy has no gateOnPolicySetting, instrument.lint.yaml is a rules:[] stub,
   equipment.lint.yaml absent, sandbox bundle zero-friction, LintEngine first-schemaId-match,
   getKindLifecycleCoverage wired at server.ts:790). OQ-1 resolved OPTION B WITHOUT a Brad
   round-trip — justified: the task block itself pre-selects the bundle-aware lint-DSL
   predicate as "preferred: data declares, code interprets" and demands Brad only for the
   always-bite alternative (AS-ORCH-L1-214). OQ-2 default stands; OQ-3 field lists accepted
   (AS-ORCH-L1-215). Worktree wt/QMS8-B-lane1-l1t1845 created off adbddaf4 with the standard
   node_modules symlinks. Coder dispatched: pid 2694522, fleet lock HELD (pid-file
   QMS8B(l1t1845) pid:2694522), log
   ~/.hermes/cl/lanes/1/logs/coder-QMS8B-l1t1845.log, report
   ~/.hermes/cl/lanes/1/qms8b-report-l1t1845.md, brief
   ~/.hermes/cl/lanes/1/briefs/coder-qms8b-l1t1845.txt. Expected 45-90 min (full RED-first +
   live probes; QMS8-A runs took ~30 min impl; this one is server+YAML+live-probe heavier) →
   due-check ~19:35, 2x-watch ~20:25.

## QUEUE STATE at checkpoint

- QMS8-B in-progress — cl-coder LIVE (fleet lock held). Nothing else may dispatch a coder.
- QMS8-C todo — deps [QMS8-B], not claimable; do NOT pre-dispatch its composer before QMS8-B
  merges (its spec depends on what QMS8-B's authoringGate shape actually shipped).
- Nothing else ready (all other items done/superseded).

## NEXT TICK CHECKLIST

1. Reconcile QMS8-B coder (pid 2694522 + report + QUEUE-RELEASED line in the pid file).
   Adopt → adv gate (full-scope review: this delta touches server code + lint YAML + bundles;
   reviewer must check the D1 scope leak discriminator is a REAL test, the role-grant
   byte-identical regression, and zero hardcoded kind/lifecycle literals) → on accept: verify
   myself (own vitest of the spec's suite list, own server tsc vs the coder's pin, open the
   diff), then LIVE re-probe: POL-REGULATED denial + grant happy lap + POL-SANDBOX restore
   (the coder's probes do not count as mine). YAML changes → restart stack first.
2. UI surface: none in QMS8-B's diff (server+YAML only) — if the diff smuggles app/ changes,
   that's a boundary violation, send back, and a browser gate is then mandatory.
3. After merge: claim QMS8-C; commission its spec (composer or orch — its intake block is
   dense; the status-fallback removal in lifecycleMiddleware.ts + the honest-create finding
   need fresh trunk probes, which now include the authoringGate machinery).
4. Housekeeping: QMS8-A worktree already removed. If QMS8-B merges, remove
   wt/QMS8-B-lane1-l1t1845 only after its browser/UI check confirms nothing pending.

## CARRIED (not blocking)

- Registry layout posture at narrow widths (AS-ORCH-L1-201): future intake only.
- app/tsconfig lacks exactOptionalPropertyTypes: spec-template housekeeping.
- POST /api/vendor/exa/search 502s from the term picker (console-clean caveat on
  clarify-state runs only).
- LabSettingsHandlers.test.ts 2 failures = lane-exclude symlink artifact (adv O7 proof) — do
  not chase.
- adv accept+ observations on QMS8-A fix2: th uses overflow-wrap:anywhere (jam-capable value,
  harmless with the span; strictly safer as break-word, serving test encodes it — future
  polish); .permissions-load-error missing from the "every class" pin list (CSS defines it).
- Reviewer-harness lesson stands: orch Playwright route proven four times now
  (QMS7-6, CHANGES-UI-1 g4, QMS8-A g1+g2); prefer it after any tier-1 harness failure.

## assumptions

New this tick: AS-ORCH-L1-213 CLOSED (QMS8-A gate 2 accepted). AS-ORCH-L1-214 (QMS8-B OQ-1
Option B decided in-task-scope, reversible). AS-ORCH-L1-215 (OQ-3 field lists accepted).
Carried open (unchanged): AS-ORCH-L1-042; 082; 087 PARTIAL; 088; 089; 096; 097; 099; 101; 119
(+post-QMS76 ext); 137 residual; 154 (interpretive only); 201 (posture-watch only); 206; 209;
210; 211; 212. Evidence debt: NONE open (213 closed this tick).

## decisions md5 sweep (unchanged)

L1-qms-field-defects-ruling-20261010.md = 1f41d8818f8864410281a79f5a40fb75
L1-wave3-followup-rulings-20261017.md = dcc03382b945287ce804bbab2518a810

## Checkpoint addendum (tick budget expiry ~19:00)

QMS8-B coder pid 2694522 LIVE at 09:57 elapsed; forward motion confirmed via cl-coder
state.db-wal mtime 18:58:19 (active session writes); log 0 bytes = normal until exit. Not
killed. Fleet lock stays held (pid-file QMS8B pid:2694522, no QUEUE-RELEASED yet). Next tick:
reconcile per checklist item 1 (adopt only after pid gone AND report shows STATUS; expected
completion ~19:25-20:10 given RED-first + live probes).
