# QMS8-B — Draft-gated registry authoring (LANE 1) — coder report l1t1845

Worktree: /mnt/vast/home/brad/git/wt/QMS8-B-lane1-l1t1845
Branch: cl/lane1-qms8b-l1t1845 (off trunk adbddaf4)
Spec: /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-20_1845-QMS8-B-draft-gated-authoring-spec.md
Binding rulings honored: OQ-1 Option B (per-block gateOnPolicySetting: authoringGate), OQ-2 instrument+equipment only, OQ-3 composer guardWhenChanged lists as spec'd.

## Commits (git -c core.fileMode=false throughout)

- RED commit: d38f832d39992f66850d07cfa0a420f945fb13e4 — "test(qms8b): RED first — instrument/equipment authoring lint blocks + the discriminator suite" (new files only: the two lint YAMLs + the test suite)
- Impl commit: a4f769e23d4048cb2cb794a26aeb5e850f056fb2 — "feat(qms8b): draft-gated registry authoring — D1 scoped rolesFor + D2B gateOnPolicySetting (inverts the RED suite)"
- Impl file set (11 files): schema/core/policy-bundle.schema.yaml (+3), the four policy bundles (+1 each), server/src/api/handlers/RecordHandlers.ts (+46/-~10), server/src/lint/AuthoringGuard.ts (+85, see AS-6), server/src/lint/types.ts (+7), server/src/policy/types.ts (+9), server/src/policy/PolicyProfileService.ts (+1), server/src/policy/PolicyProfileService.test.ts (+1). server.ts: ZERO changes (verified via typecheck, per spec §3).
- Worktree tracked status after all work: 0 uncommitted tracked changes.

## 1. RED evidence (captured BEFORE any product change)

Evidence file: /home/brad/.hermes/cl/lanes/1/qms8b-RED-l1t1845.txt
Command: npx vitest run src/api/handlers/RecordHandlers.instrumentAuthoring.test.ts (worktree server dir)
Result: Test Files 1 failed (1); Tests 6 failed | 20 passed (26)

The spec's RED discriminator cases failed exactly as predicted (unscoped rolesFor leak):
- "author@document-controlled-signing ALONE cannot author an equipment draft under authoringGate:deny" → expected 403, received 201
- "author@document-controlled-signing ALONE cannot author an instrument draft under authoringGate:deny" → expected 403, received 201
- "authoringGate:allow (sandbox-equivalent) + NO roles at all → no gate, create proceeds" → expected 201, received 403 (gate not yet bundle-gated)
- "authoringGate:allow + instrument with no roles → proceeds" → expected 201, received 403
- 2 update-leg guardWhenChanged cases (gate fired on undeclared change / not scoped)

## 2. GREEN

Evidence file: /home/brad/.hermes/cl/lanes/1/qms8b-GREEN-l1t1845.txt
Same suite after impl: Test Files 1 passed (1); Tests 28 passed (28).
(Suite grew 26→28 during GREEN iteration: the spec-internal scope contradiction was resolved — see §5 — and pinned with two extra scope tests: "role-grant stays UNSCOPED even when the mint payload declares a lifecycleId" and "a covered kind declaring its own lifecycleId is STILL scoped by coverage".)

## 3. Verified-by table

(3) Existing suites green UNCHANGED — spec's exact vitest list (roleGrant leg see AS-3):
Evidence: /home/brad/.hermes/cl/lanes/1/qms8b-VERIFIEDBY3-l1t1845.txt
npx vitest run src/governance/governanceStrictness.test.ts src/governance/denialMessageBoundary.test.ts src/lifecycle/denialMessage.test.ts src/governance/registryOpsLifecycle.test.ts src/api/handlers/RecordHandlers.instrumentAuthoring.test.ts
→ exit 0; Test Files 5 passed (5); Tests 67 passed (67).
RecordHandlers.roleGrant.test.ts (lane-excluded symlink in the worktree): ran in cl-integration-1 with the committed delta staged → exit 0, 5 passed (5). Evidence: /home/brad/.hermes/cl/lanes/1/qms8b-ROLEGRANT-TRUNKSTAGED-l1t1845.txt. It ALSO ran green inside the worktree 14-suite run below (symlinked test against patched code).

Wider regression sweep (my touched areas: handlers/lint/drafts/lifecycle/governance/policy), 14 files 143 tests → ALL GREEN:
Evidence: /home/brad/.hermes/cl/lanes/1/qms8b-GREEN-suites-l1t1845.txt — Test Files 14 passed (14); Tests 143 passed (143). Files: LabSettingsHandlers.routes, RecordHandlers.instrumentAuthoring, RecordHandlers.roleGrant, AnalysisDraftAdapter, FormDraftService, RecordDraftAdapter, recordDraftCompile.humanReviewed, WorkstateDraftAdapter, denialMessageBoundary, governanceStrictness, registryOpsLifecycle, denialMessage, PolicyBundleService.enforce, PolicyProfileService.

Broader sweep (14 files 170 tests incl. AuditEventService, LintEngine, LifecycleEngine, filing/lifecycle/seedPromotion/writeGates, archivedAssignment): 2 failed | 168 passed — the 2 failures are src/governance/AuditEventService.test.ts ("signature-ref validation" and "append-only kinds", both `expected undefined to be true`). PROVEN pre-existing trunk debt: same 2 named tests fail on the CLEAN trunk checkout cl-integration-1 with my delta fully reverted (exit 1, 2 failed | 11 passed). Evidence: /home/brad/.hermes/cl/lanes/1/qms8b-HEAD-sweep-l1t1845.txt and /home/brad/.hermes/cl/lanes/1/qms8b-AUDIT-TRUNKCLEAN-l1t1845.txt. Matches the documented trunk-debt ledger; not chased.

(4) Typecheck delta-zero:
- BASE pin (before any product change): npx tsc --noEmit in worktree server → exit 0, 0 'error TS' lines. Saved: /home/brad/.hermes/cl/lanes/1/qms8b-tsc-BASE-l1t1845.txt (0 bytes = empty error set).
- HEAD: same command after impl → exit 0, 0 'error TS' lines. Saved: /home/brad/.hermes/cl/lanes/1/qms8b-tsc-HEAD-l1t1845.txt (0 bytes).
- diff BASE HEAD → identical. DELTA-ZERO: 0 new errors (0→0). exactOptionalPropertyTypes honored: authoringGate is an OPTIONAL key (authoringGate?: PolicyDisposition) with default 'allow' in DEFAULT_COMPILER_POLICY_SETTINGS; accessor widened to { enforceTransitionRoles: PolicyDisposition; authoringGate?: PolicyDisposition }.
- The two +1-line edits to PolicyProfileService.ts (origins map gains authoringGate: defaultOrigin) and PolicyProfileService.test.ts (expected settings literal) mirror precedent commit 56740422 (which added enforceTransitionRoles) file-for-file; without them the mapped type Record<CompilerPolicySettingKey, Origin> is incomplete (typecheck) and the profile test fails at runtime. server tsconfig excludes test files, so the test edit is a runtime fix, same as the precedent commit made it.
- Ajv check on the bundle data (NOT whole-file Ajv of authoring blocks — bait #6 avoided): scratch probe with the trunk's Ajv2020 (per AjvValidator.ts:17) + common.schema.yaml $ref registered → notebook/regulated/sandbox/tracked bundles all VALID against the updated policy-bundle.schema.yaml (authoringGate: enum [allow, confirm, deny] added, mirroring enforceTransitionRoles). Probe deleted after run (server/tmp is scratch).

## 4. LIVE PROBES on :3092 (lane stack; :3001/:5174 never touched — :3001 pid 966163 verified still listening at end)

Method note (AS-1): cl-lane-stack.sh serves cl-integration-1 (trunk), not the worktree. Sequence: (Phase A) trunk clean + only the two lint YAMLs copied → live RED leak; (Phase B) full committed delta staged into cl-integration-1 via git show HEAD:<file> (12 files) + stack restart → live GREEN; (Phase C) delta reverted, trunk restored byte-clean (git status 0 tracked changes; AuthoringGuard.ts symlink restored), post-revert health probe. tsx --watch does not reload YAML — every YAML/code staging was followed by cl-lane-stack.sh 1 restart (run backgrounded; the script blocks; status polled).

--- Phase A: live RED (trunk code, POL-REGULATED already active on lane) ---
$ curl -s -w '\nHTTP=%{http_code}\n' -X POST localhost:3092/api/records -H 'content-type: application/json' -H 'x-user-id: USR-BRAD' -d '{"schemaId":"https://computable-lab.com/schema/computable-lab/equipment.schema.yaml","payload":{"kind":"equipment","id":"EQP-QMS8B-PROBE1","name":"QMS8B Live Probe Autoclave","status":"active","notes":"QMS8-B live RED probe (lane test data per A4)."}}'
{"success":true,"record":{"recordId":"EQP-QMS8B-PROBE1",...,"payload":{...,"lifecycleId":"registry-ops","state":"draft",...,"createdBy":"USR-BRAD"},...}}
HTTP=201
→ THE LEAK: BRAD holding only GRANT-DEMO-AUTHOR (author@document-controlled-signing) created an equipment draft under trunk's unscoped rolesFor. Verified later via GET: recordId EQP-QMS8B-PROBE1, createdBy USR-BRAD, state draft, lifecycleId registry-ops.

--- Phase B: live GREEN (delta staged, stack restarted; boot log: "Loaded 31 lint specs, 85 rules") ---
Probe 1 (BRAD, DEMO grant only, POL-REGULATED, equipment):
HTTP=403 {"error":"EQUIPMENT_AUTHORING_FORBIDDEN","message":"Authoring a https://computable-lab.com/schema/computable-lab/equipment.schema.yaml record is forbidden for this actor"}
Probe 2 (BRAD, instrument): HTTP=403 {"error":"INSTRUMENT_AUTHORING_FORBIDDEN","message":"Authoring a https://computable-lab.com/schema/computable-lab/instrument.schema.yaml record is forbidden for this actor"}
Probe 3 (mint GRANT-BRAD-REGOPS as USR-QMS-ADMIN, spec §5 curl verbatim): accepted; stored payload {recordId: GRANT-BRAD-REGOPS, userId: USR-BRAD, roles: [author], lifecycleId: registry-ops, grantedBy: USR-QMS-ADMIN, createdBy: USR-QMS-ADMIN} (grantedBy auto-stamped by the unchanged role-grant guard — bundle-blind, as required).
Probe 4 (BRAD re-POST EQP-QMS8B-PROBE2 after grant):
HTTP=201 {"success":true,"record":{"recordId":"EQP-QMS8B-PROBE2",...,"payload":{...,"lifecycleId":"registry-ops","state":"draft",...,"createdBy":"USR-BRAD"},...},"validation":{"valid":true,"errors":[]},"lint":{"valid":true,"violations":[]},...}
→ state=draft + coverage stamp lifecycleId=registry-ops confirmed. NOTE (first-hand evidence vs spec label): the spec's verified-by (1) says "200"; the create leg returns 201 Created (RecordHandlers.ts:854 reply.status(201)) — behavior matches, status-code label in the spec is loose. No invented approval/signature steps in the accepted response (verified-by 4: plain create, zero-friction beyond the role check).
Probe 5 (BRAD POST instrument after grant): HTTP=422 — PRE-EXISTING trunk debt, NOT the gate: instrument.schema.yaml has additionalProperties:false at root and does not declare createdAt/updatedAt/createdBy, which the create handler injects for all non-inventory kinds (RecordHandlers.ts:753-767). PROVEN identical on the untouched trunk stack :3001 with the same payload (same 3 "Unknown property" errors, no record created — verified absent on disk). The instrument happy-lap 201+stamp IS proven in the unit suite ("the same actor WITH author@registry-ops passes, and the coverage stamp still lands (state=draft)").

--- Verified-by (2): POL-SANDBOX returns friction ---
PATCH /api/config as USR-QMS-ADMIN {"lab":{"policyBundleId":"POL-SANDBOX"}} → HTTP 200, restartRequired:false (live accessor: server.ts:781 resolves ctx.appConfig.lab.policyBundleId per call — no restart needed for bundle flips).
Probe 6 (USR-GATE-NONADMIN-2335 — valid local user with ZERO grants — POST equipment): HTTP=201, state=draft, lifecycleId=registry-ops. Friction-free with ZERO new grants.
Probe 6b (BRAD POST instrument under POL-SANDBOX): HTTP=422 (same pre-existing schema debt as probe 5 — NOT 403: the authoring gate stood down under the allow bundle).
Roundtrip B–E (proves the gate is bundle-gated live, not boot-frozen): PATCH back to POL-REGULATED → 200; same no-grant user POST equipment → 403 EQUIPMENT_AUTHORING_FORBIDDEN; PATCH to POL-SANDBOX → 200; same user same record → 201.
Probe F (BRAD POST equipment under POL-SANDBOX): HTTP=201 (EQP-QMS8B-PROBE5, state=draft).
Probe 6 (unknown user id): HTTP=401 UNAUTHENTICATED (identity leg, unchanged).

--- Phase C: revert + final state ---
Delta reverted from cl-integration-1 (git checkout -- 11 tracked files; rm equipment.lint.yaml; AuthoringGuard.ts symlink restored). cl-integration-1 git status: 0 tracked changes; grep authoringGate in regulated bundle / policy types / lint types = 0 hits. Stack restarted clean; post-revert health probe (BRAD POST equipment, trunk code, POL-SANDBOX): HTTP=201.
FINAL STATE: GET /api/config → lab.policyBundleId = POL-SANDBOX. Lane 1 left on POL-SANDBOX (bundle-restore discipline honored; lane1-config.yaml on disk also reads POL-SANDBOX). Lane stack up: backend :3092 http=200, frontend :5192 http=200. :3001 untouched throughout.
Probe records EQP-QMS8B-PROBE1..6 + GRANT-BRAD-REGOPS remain on lane disk as TEST DATA (A4); EQP-QMS8B-PROBE1 is the live-RED leak artifact.

## 5. Spec-internal contradiction resolved (reported, not absorbed)

Spec D1.3 create-leg scope formula is literally `declared ?? coverage` (payload's own lifecycleId wins). But spec §5's own mint probe payload DECLARES lifecycleId: registry-ops, and D1.5/hard-boundary requires role-grant's gate to stay byte-identical (unscoped). A payload-declared-first scope would let any actor self-select a lifecycle where they hold a grant (self-scoping escalation) and would change role-grant mint behavior — violating the hard boundary. Resolution (evidence-driven via scratch scope probe against real lane data): scope comes ONLY from the coverage entry for the payload's kind (registry-kinds.registry.yaml data); kinds with no coverage entry (role-grant) resolve to no scope → today's unscoped rolesFor call, byte-identical. Pinned by tests: "a covered kind declaring its own lifecycleId is STILL scoped by coverage — the demo grant stays inert" and "role-grant stays UNSCOPED even when the mint payload declares a lifecycleId". Live probe 3 confirms the mint path still works (admin grant accepted). If the orchestrator wants the literal `declared ??` formula, that is a spec amendment — flagged here, implementation follows the hard boundaries.

## 6. Hard-rule compliance

- Zero kind/lifecycle/role literals in added TS lines (verified by grep of the commit diff for 'author'/'registry-ops'/'equipment'/'instrument'/'admin'/'reviewer' string literals in added lines: zero hits). Scope comes from coverage data; setting key comes from YAML (gateOnPolicySetting); denyCode/require/guardWhenChanged all YAML.
- Denial bodies {error: TOKEN, message}, no code field (asserted on `error` in tests; live 403 bodies above show the shape).
- No whole-file Ajv validation of authoring blocks added (lint-v1.schema.yaml untouched — bait #6 avoided). role-grant.lint.yaml untouched (pinned by test "role-grant lint declares NO gateOnPolicySetting").
- RoleResolver unscoped-superset semantics preserved and asserted ("an UNSCOPED grant (no lifecycleId) still passes — RoleResolver superset semantics are intentional").
- 403-before-422 ordering accepted, not chased.
- Stop boundaries respected: no role-grant lint change, no coverage widening (instrument+equipment only), role-grant guard NOT bundle-conditionaled (undeclared gateOnPolicySetting ⇒ always active), no app/ frontend changes.

## 7. Assumptions (every one)

- AS-1: Live probes require the code in the served checkout — cl-lane-stack.sh serves cl-integration-1 (trunk), not the lane worktree. I staged my committed delta into cl-integration-1 (git show HEAD:<file>), probed, then reverted to byte-clean (verified: 0 tracked changes, symlink restored, post-revert health probe 201). No commit was made in cl-integration-1.
- AS-2: Spec D1.3 `declared ?? coverage` contradicts spec §5 + the byte-identical role-grant boundary; resolved as coverage-only scope (§5 above). Orchestrator may amend; implementation follows the hard boundaries.
- AS-3: RecordHandlers.roleGrant.test.ts is lane-excluded (lane-exclude:82) and untracked in the worktree (symlink into computable-lab). Ran it green in cl-integration-1 with the delta staged, and it also ran green in the worktree 14-suite run.
- AS-4: instrument happy-lap 422 (probes 5/6b) is pre-existing trunk schema debt (instrument.schema.yaml additionalProperties:false vs handler-injected provenance fields), proven identical on untouched :3001. Not fixed in-lane (out of QMS8-B scope; equipment happy-lap fully proven live).
- AS-5: policy-bundle.schema.yaml + PolicyProfileService.ts/.test.ts edits are required by the mapped-type completeness of CompilerPolicySettings; file set mirrors precedent commit 56740422 exactly. All four bundles re-validated VALID against the updated schema with the trunk's Ajv2020.
- AS-6: server/src/lint/AuthoringGuard.ts is lane-excluded (lane-exclude:95) and untracked at trunk — a symlink into computable-lab in the lane checkouts. I materialized it as a real copy in the worktree (never edited the computable-lab original) and committed it with git add -f so the branch is self-contained and mergeable (precedent: lane-2 ParameterAnswerInput.tsx e1ad8009). Orchestrator: choose track-vs-copy-back at merge; the branch currently TRACKS it.
- AS-7: cl-lane-stack.sh restart blocks past a plain foreground timeout and its process-group kill can orphan tsx children (EADDRINUSE on :3092). Recovery used: stack stop → kill orphan pids → stack start (backgrounded) → poll status until http=200. Brad's :3001 was never touched.
- AS-8: All probe records + GRANT-BRAD-REGOPS are lane TEST DATA (A4), left on lane disk intentionally (PROBE1 kept as the live-RED leak artifact).
- AS-9: RED suite had 26 tests; GREEN suite has 28 (two scope-semantics pins added during the §5 contradiction resolution). RED evidence stands as captured pre-implementation.

STATUS: complete
