# QMS-8-POLICY-BUNDLE-SWITCH — implementation spec (DRAFT l1t1540, awaiting orchestrator promotion)
Item: QMS-8-POLICY-BUNDLE-SWITCH — "Regulated-mode switch is a dead button: implement PATCH /settings/lab + apiClient.patchLabSettings as ONE contract"
Lane: 1 · trunk cl/integration-1 · worktree /mnt/vast/home/brad/git/cl-integration-1 · stack :3092/:5192
Binding inputs: rulings/L1-qms-field-defects-ruling-20261010.md §Defect L1-A (architect, 2026-10-10);
architect decision .hermes/plans/2026-10-04_lane1-qms7-bundle-selector-decision.md (read first — it is the
ground this spec stands on); task block at /home/brad/.hermes/cl/lanes/1/task-list.md:2240-2271.

## GOAL
Make the Settings page policy-bundle selector a real control: one contract where the server persists
the selected bundle as DATA (config store) behind a validated, gated PATCH /settings/lab, and the client
method patchLabSettings that SettingsPage already calls finally exists — landing both halves together
because half a contract is a known-dead button (L1-A).

## SCOPE — ONE CONTRACT, NOT TWO TASKS
Both halves land in ONE branch, ONE merge (ruling L1-A "Required fix (both halves, ONE contract — landing
half ships a known-dead button)"; task-list triage ruling):
  1. SERVER: PATCH /settings/lab handler (validation against bundleService known bundles; persistence to
     the config store; identity gate; LabSettings-shaped response) AND the fix that makes
     GET /settings/lab read LIVE config, not the boot snapshot (the acceptance criterion "GET /settings/lab
     reflects the new bundle" is unsatisfiable without it — see Boot-snapshot trap below).
  2. CLIENT: apiClient.patchLabSettings in client.ts against that route; SettingsPage keeps its call site
     (app/src/shell/SettingsPage.tsx:96) and its error path shows the server's reason.
A merge that contains only one half is a reject — the reviewer should reject partial diffs outright.

## FILE OWNERSHIP
IN SCOPE (worktree /mnt/vast/home/brad/git/cl-integration-1 — all verified REGULAR files today):
- server/src/api/handlers/LabSettingsHandlers.ts — add patchLabSettings handler + switch the handler
  factory from a captured-config to a live-accessor signature (LabSettingsHandlers "area").
- server/src/api/routes.ts — register the PATCH at :590-593 (currently GET-only:
  `fastify.get('/settings/lab', labSettingsHandlers.getLabSettings.bind(...))`).
- server/src/server.ts — wiring only: :817 `createLabSettingsHandlers(ctx.appConfig, ctx.policyBundleService)`
  must pass (a) a LIVE appConfig accessor and (b) the identity resolver, following the two precedents already
  in the file: `getAppConfig: () => ctx.appConfig` (vendorSearchHandlers, :758 — with the explicit comment that
  ctx.appConfig is REASSIGNED by PATCH /api/config) and
  `resolveRequestUser: async (request) => ctx.localIdentityService?.resolveRequestUser(request) ?? null`
  (lifecycleHandlers, :822). The persistence callback writes via the exported helpers already proven on the
  patchConfig path: writeConfigYaml (configHandlers.ts:97) + validateConfig (config/loader.ts:572) +
  `ctx.appConfig = updated` reassignment (server.ts:1248 pattern).
- app/src/shared/api/client.ts — add `patchLabSettings` immediately after getLabSettings (:2867-2869):
  `async patchLabSettings(patch: { policyBundleId: string }): Promise<LabSettings> { return request<LabSettings>('/settings/lab', { method: 'PATCH', body: JSON.stringify(patch) }) }`.
  request() already stamps x-user-id + x-cl-session (:1400-1404) — do NOT re-implement identity.
- app/src/shell/SettingsPage.tsx — error path ONLY (:94-101): keep the call site, keep the alert, ensure the
  server's rejection reason reaches the user. ApiError.fromResponse builds message as "<error>: <message>"
  (client.ts:110-113 comment), so the existing alert surfaces the reason once the method exists; the required
  change is at most surfacing + not silently reverting the selector (selector state derives from
  labSettings, so a refusal correctly leaves the UI on the old bundle — verify, do not "fix" what works).
- NEW test file: server/src/api/handlers/LabSettingsPatch.test.ts (regular file, see symlink trap).

EXPLICITLY OUT OF SCOPE (touch = reviewer reject):
- server/src/policy/PolicyBundleService.ts — no new registry mechanics (no hot-reload, no bundle CRUD,
  no manifest). getBundle()/listBundles() as they exist are the validation oracle.
- server/src/api/handlers/configHandlers.ts — patchConfig semantics unchanged; do not move a gate inside it
  (see Stop boundary).
- schema/** (no YAML changes at all — bundles already exist: schema/core/policy-bundles/
  {sandbox,notebook,tracked,regulated}.policy-bundle.yaml = POL-SANDBOX, POL-NOTEBOOK, POL-TRACKED,
  POL-REGULATED. Do NOT invent other ids; those four are the ONLY ids found in code).
- app/src/components/settings/PolicyBundleSelector.tsx — its hardcoded BUNDLES list is recorded debt
  (hardcode-boundary note below), not this task.
- Any auth-surface change: no new role kind, no preHandler framework, no session requirement.
- config.yaml itself (gitignored .gitignore:36; lane copy is a SYMLINK to the main repo's file — see traps).
- docs/qms-manual-testing-cheatsheet.md §1 — one-line correction allowed ONLY if the gate passes (make the
  §1 "UI: Settings page selector" line true; do NOT claim the §1 403 POLICY_BUNDLE_CHANGE_FORBIDDEN token or
  the policy_bundle_changed audit — both verified ZERO matches in code; §1's gate stays aspirational until
  the open authz question below is ruled).

## THE DECLARATIVE RULE — PERSISTENCE IS DATA, NEVER CODE
Selecting a policy bundle changes DATA only: `lab.policyBundleId` in the config store, written with
writeConfigYaml and reflected in the live in-memory appConfig. No branch on bundle id in TS, no per-bundle
code paths, no touching the .policy-bundle.yaml files at runtime. Enforcement already reads the bundle LIVE
per request — server.ts:713-715 getPolicySettings() with the comment "resolve the bundle id per call" — so a
successful PATCH takes effect with no restart. The handler itself must not special-case POL-REGULATED vs
POL-SANDBOX in any way; the switch is pure configuration.

## BUNDLE-ID VALIDATION — DATA-DRIVEN, ACTIONABLE REFUSAL
Validate against bundleService known bundles (getBundle(id) !== undefined; listBundles() for the suggestion
list) — NEVER a hardcoded id list in the handler (hardcode boundary). Refusal shape is the lane rejection
contract {error: TOKEN, message} with NO code field:
- unknown id      -> 400 {error:'UNKNOWN_POLICY_BUNDLE', message:'Unknown policy bundle "<id>". Known bundles: <ids from listBundles()>.'}
- missing body / non-string / empty policyBundleId -> 400 {error:'BAD_REQUEST', message:'policyBundleId (string) is required'}
- write failure   -> 500 {error:'CONFIG_WRITE_FAILED', message:<reason>}
Validation happens BEFORE any disk write: an unknown id must leave config.yaml byte-identical and a
subsequent GET showing the OLD bundle. Success -> 200 with the full GET /settings/lab body (materialTracking,
policyBundleId, activePolicyBundle) so SettingsPage's `setLabSettings(updated)` type-checks and is truthful.

## AUTHZ DECISION (explicit, per ruling "likely yes — decide in spec, cite AuthorizationService")
RULING FOR THIS ITEM: the switch is GATED, with the gate that genuinely exists on this surface:
`identityService.resolveRequestUser(request)` must yield a CONCRETE user (userId != null && !isSystem &&
userRecord exists); otherwise 403 {error:'NO_CURRENT_USER', message} — the exact existing precedent:
AuthHandlers.ts:100-104 and IdentityHandlers.ts:193-196.
Why this and not more — AuthorizationService cited honestly: AuthorizationService.canAccess(userId, action,
record) (server/src/security/AuthorizationService.ts:95) is record-scoped — it needs a RecordEnvelope and
its ACL resolution (resolveEffectivePolicy / ensureOwnerPolicy stamp per-record ACLs). A lab-wide setting is
NOT a record; there is no ACL resource to check against, and fabricating one is auth-surface design.
RoleResolver.rolesFor(userId, lifecycleId?) (security/RoleResolver.ts:17) resolves QMS LIFECYCLE roles from
role-grant records — an "admin-of-the-lab" role does not exist and inventing one (and the role-grant to match)
is exactly the auth-surface redesign the stop boundary reserves for the architect. Verified first-hand and
corroborated by scout recon: routes.ts has NO preHandler/addHook/onRequest anywhere, and the only non-record
gates in the whole server are the two isSystem checks cited above. So NO_CURRENT_USER is the honest gate;
it rejects the anonymous fallback-to-system-admin path (resolveRequestUser with no header resolves to
USR-LOCAL-ADMIN with isSystem:true, LocalIdentityService.ts:127-138 — verified).
HONEST LIMITATION the coder must state in the handoff (do NOT over-claim): any concrete user (e.g.
USR-QMS-ADMIN via x-user-id, isSystem:false) can switch. The gate stops drive-by/system-identity switches,
not authenticated users, AND PATCH /api/config (routes.ts:849) remains fully ungated, so this gate is NOT a
security boundary while that write path stays open — architect decision 2026-10-04 finding 4 named this the
cosmetic-gate problem; Open question 1/2 below routes it. Cheatsheet §1's admin-gate + 403
POLICY_BUNDLE_CHANGE_FORBIDDEN + policy_bundle_changed audit remain unimplemented and unclaimed (grep: zero
matches — re-verified this draft).

## RED-FIRST TEST PLAN (server/src/api/handlers/LabSettingsPatch.test.ts, NEW regular file)
Harness: Fastify + app.inject with prefix '/api' — the proven pattern in
server/src/api/handlers/ProtocolIntakeHandlers.routes.test.ts:112-125. Deps as fakes, precedent from
governance/AuditEventService.test.ts:243: `resolveRequestUser: async () => ({ userId:'USR-QMS-ADMIN', isSystem:false })`.
Config store fake: writeConfigYaml into an fs.mkdtemp dir (configHandlers.ts:97 is exported), real
PolicyBundleService loaded via loadFromDir('schema/core/policy-bundles') like the existing
LabSettingsHandlers.test.ts does. Order of work — write ALL tests first, watch them fail, then implement:
  T0 (baseline, the RED the ruling demands): app WITHOUT the PATCH registration -> inject
     { method:'PATCH', url:'/api/settings/lab' } -> 404. Keep this test permanently: it is the route-exists
     fence against a silent de-registration. Live 404 already confirmed against the running lane (below).
  T1 (RED now, GREEN after impl): concrete user PATCH {policyBundleId:'POL-REGULATED'} -> 200, then
     GET /api/settings/lab -> policyBundleId === 'POL-REGULATED' AND activePolicyBundle.id === 'POL-REGULATED'.
     T1 also catches the boot-snapshot bug: if the GET keeps serving the captured-config it fails even after a
     "working" PATCH — this assertion is WHY the live-accessor change is in scope (decision 2026-10-04,
     finding 5: server.ts:817 captures by reference while onConfigUpdate reassigns at :1248).
  T2: config on disk actually changed (read the temp config.yaml back) and re-GET after re-invoking the
     handler against a FRESH boot from the written file still shows the new bundle (persistence, not memory).
  T3: unknown id 'POL-NOPE' -> 400, body.error === 'UNKNOWN_POLICY_BUNDLE', message names the offending id
     and lists the four known ids, config.yaml byte-identical, next GET shows the OLD bundle.
  T4 (gate): fake resolver returning { userId:null, isSystem:true } (and a second variant with no userRecord)
     -> 403, body.error === 'NO_CURRENT_USER', config unchanged.
  T5: missing/non-string policyBundleId, empty body -> 400 BAD_REQUEST, config unchanged.
First targeted check (proves the approach early, ONE command):
  cd /mnt/vast/home/brad/git/cl-integration-1/server && npx vitest run src/api/handlers/LabSettingsPatch.test.ts
  BEFORE any implementation: expect FAILS — T0 passes (404 matches "not registered"), T1-T5 red
  (404-where-200/400/403 expected). That failure output is your receipt that the baseline is real.
  After implementation: `Test Files 1 passed, Tests 6 passed` (or your exact test count) with T0 still passing.

## VERIFICATION COMMANDS (with expected output)
1. New suite: command above -> all pass.
2. Server suite vs baseline: `cd server && npx vitest run 2>&1 | tail -5` -> fail-set IDENTICAL to the
   claim-base fail-set (no NEW failures; pre-existing failures tolerated only if present at base).
3. Typecheck server: `cd server && npx tsc --noEmit` -> error multiset BYTE-IDENTICAL to the claim-base
   baseline (33 pre-existing server TS lines was the EDITOR-1/EDITOR-2 expectation — re-measure at claim
   base, do not trust that number). ZERO errors in LabSettingsHandlers.ts / routes.ts / server.ts diffs.
4. Typecheck app: `cd app && npx tsc --noEmit` -> multiset = baseline MINUS exactly the historical line
   `src/shell/SettingsPage.tsx(96,39): error TS2551 ... 'patchLabSettings' ... Did you mean 'getLabSettings'?`
   (decision 2026-10-04 finding 6; verify the line exists at your claim base). The app build has MANY other
   pre-existing tsc errors — "tsc exit 0" is a FALSE expectation on this trunk; the honest claim is
   "one error removed, zero added".
5. Live lane (stack :3092; tsx --watch reloads TS, but RESTART anyway: cl-lane-stack.sh 1 restart —
   YAML never reloads under tsx --watch, and do NOT touch :3001/:5174):
   a. RED baseline (already captured by the spec author 2026-10-10 ~16:36 EDT):
      curl -s -o /dev/null -w '%{http_code}\n' -X PATCH localhost:3092/api/settings/lab \
        -H 'content-type: application/json' -H 'x-user-id: USR-QMS-ADMIN' -d '{"policyBundleId":"POL-REGULATED"}'
      -> 404 today; -> 200 after deploy.
   b. GET localhost:3092/api/settings/lab -> {"policyBundleId":"POL-REGULATED", activePolicyBundle.id POL-REGULATED}
      WITHOUT a restart (proves live accessor).
   c. curl -s localhost:3092/api/config -> top-level "lab":{"policyBundleId":"POL-REGULATED"} (response is
      FLAT — d.lab.policyBundleId, NOT d.config.lab.policyBundleId — buildConfigResponse configHandlers.ts:139-147).
   d. Unknown id: ... -d '{"policyBundleId":"POL-OOPS"}' -> 400 {"error":"UNKNOWN_POLICY_BUNDLE", ...}.
   e. Gate: same PATCH with NO identity header while the resolver falls back to system admin -> 403
      {"error":"NO_CURRENT_USER", ...}; then c shows bundle unchanged.
   f. RESTORE, always, in the same session: PATCH {"policyBundleId":"POL-SANDBOX"} -> 200 and c shows
      POL-SANDBOX. (The lane's config.yaml is a symlink to the MAIN repo's config.yaml — see traps.)
6. App unit suite: `cd app && npx vitest run` -> fail-set identical to baseline (the client method is
   additive; no app test should move).

## BASELINES — CAPTURE AT CLAIM BASE FIRST (before writing any code)
At claim time record the exact base: `git -C /mnt/vast/home/brad/git/cl-integration-1 -c core.fileMode=false rev-parse HEAD`
(14637f6d was HEAD when this spec was drafted; claim your OWN). Then capture, storing all three under
~/.hermes/cl/lanes/1/:
  qms8-vitest-server-failset-<ts>.txt:  cd <worktree>/server && npx vitest run 2>&1 | grep -E "❯|FAIL|×" (plus the summary tail)
  qms8-tsc-server-multiset-<ts>.txt:    cd <worktree>/server && npx tsc --noEmit 2>&1 | sort
  qms8-tsc-app-multiset-<ts>.txt:       cd <worktree>/app && npx tsc --noEmit 2>&1 | sort
Delivery diff: server vitest fail-set unchanged; server tsc multiset unchanged; app tsc multiset = base minus
the TS2551 patchLabSettings line only. Quote these paths in the handoff. (Fresh capture is mandatory —
historical numbers in this spec are context, not authority.)

## WORKER CONTRACT
- Worktree branch off lane trunk: wt/qms8-bundle-switch-lane1-<claimstamp> (off cl/integration-1, pattern of
  wt/qms-7-lane1-20261004T1110).
- Deliverable path pattern: all product edits in the worktree as listed under FILE OWNERSHIP; NEW test file
  server/src/api/handlers/LabSettingsPatch.test.ts; handoff .hermes/plans/handoffs/<date>_qms8-bundle-switch-<state>.md;
  worker report ~/.hermes/cl/lanes/1/qms8-report-<ts>.md; baselines under ~/.hermes/cl/lanes/1/qms8-*.
- Mark in-progress on claim; NEVER done (orchestrator owns that). No merges. Lane stack only (:3092/:5192);
  NEVER pkill patterns, NEVER :3001/:5174. Rejections stay {error:TOKEN,message} with no code field.
  exactOptionalPropertyTypes stays on in both workspaces.
- Browser gate (cl-browser-reviewer, :5192, VERDICT: accept) — criteria VERBATIM from the task block:
  "Browser receipts (cl-browser-reviewer, :5192, VERDICT: accept): Settings -> regulated -> persists across
  reload; sandbox->regulated->sandbox round trip; lifecycle behavior difference visible (signature
  requirements differ per bundle). Server-side lint/tsc gates per lane rules."
  Reviewer must exercise the SHIPPED USER PATH (click the selector) — the wave-2 standing rule and the whole
  point of this item: no service-level or curl stand-in counts as the browser receipt. The negative claims
  (404/persists/unchanged) get re-verified via API-or-reload before being reported (reviewer reliability rule).
  Lifecycle-difference shot: the same under-granted transition (e.g. the QMS-7 denial row on DOC-DEMO-SOP,
  in_review -> approved requires signature + approver under POL-REGULATED per docs/qms-actor-matrix.md)
  observed permissive under sandbox and denied under regulated.
- Handoff must ALSO reconcile (ruling L1-A closing order): the QMS-7 lap test written for this switch but
  never run end-to-end — .hermes/plans/2026-10-04_qms7-ui-runbook-regulated-lap-spec.md and
  2026-10-04_qms7b-item10-api-lap-fix-spec.md — explain how the QMS-7 gate passed without the route (it
  switched via PATCH /api/config per the 2026-10-04 decision, i.e. a service/API-level stand-in, not the UI
  path) and record the lesson: gate runs must exercise the shipped user path, not a stand-in.

## REVIEWER BAIT (likely edge errors for this item — pre-empt them)
1. SYMLINK TRAP (worktree-specific, verified this draft): the worktree carries 92 symlinks into
   /mnt/vast/home/brad/git/computable-lab. server/src/api/handlers/LabSettingsHandlers.test.ts is one —
   vitest resolves its imports by REALPATH, so that test has been passing against the MAIN repo's handler
   (which returns availablePolicyBundles) while the worktree's LabSettingsHandlers.ts (38 lines, last touched
   eb4310e3) does NOT. Consequences: (a) NEVER write through that symlink (you would edit Brad's main repo);
   (b) your new test MUST be a regular file and must not import the drifted test; (c) a check like
   `expect(out).toHaveProperty('availablePolicyBundles')` would pass on main's module and prove nothing here —
   run your probes against worktree paths only. Before editing ANY file: `test -L <file>`; every owned file in
   FILE OWNERSHIP is regular today — if that ever changes, STOP (lane-infra defect, not yours).
2. BOOT SNAPSHOT: GET /settings/lab is stale-by-construction until the live-accessor lands (server.ts:817
   capture vs :1248 reassignment — decision 2026-10-04 finding 5). A PATCH that "works" while GET keeps
   serving the old bundle is the half-fix this spec exists to prevent; T1 fails it, and the browser
   "persists across reload" receipt fails it harder.
3. exactOptionalPropertyTypes sites: PolicyBundle.description?: string and LabSettings.availablePolicyBundles?
   (client.ts:845). Map optional fields with CONDITIONAL spread (main-repo pattern
   `description === undefined ? {id,label,level} : {id,label,level,description}`) — never assign `undefined`
   explicitly. activePolicyBundle is `PolicyBundle | null` — null, not undefined, when getBundle misses
   (unreachable post-validation, but keep the type honest).
4. YAML-RELOAD TRAP: tsx --watch reloads TS but NEVER YAML (lane operating fact). This task touches no YAML —
   if your diff contains schema/*.yaml changes you have wandered out of scope; restart the lane stack
   (cl-lane-stack.sh 1 restart) before any browser gate regardless.
5. HARDCODE BOUNDARY: validation must consult bundleService (getBundle/listBundles), not a TS array of ids;
   the 400 message's known-id list must come from listBundles(). The ONLY valid ids anywhere in this task are
   POL-SANDBOX / POL-NOTEBOOK / POL-TRACKED / POL-REGULATED (schema/core/policy-bundles/, verified). The
   frontend's hardcoded BUNDLES list in PolicyBundleSelector.tsx is recorded debt for the orchestrator, NOT
   to be "improved" here.
6. REJECTION SHAPE: {error:TOKEN,message}, NO code field (lane contract; client.ts:110-135 documents how the
   token lands in ApiError.message). A reviewer will grep your handler for `code:` — there must be none.
7. COSMETIC-GATE FALSE CLAIM: do not describe the NO_CURRENT_USER gate as an admin gate or security boundary;
   PATCH /api/config stays ungated (decision 2026-10-04 finding 4). Overclaiming in the handoff = reject.
8. "tsc is clean now" is false (app has many pre-existing errors, decision 2026-10-04 finding 6) — claim only
   the multiset delta.
9. config.yaml IS A SHARED SYMLINK on the lane (worktree config.yaml -> main repo's file; gitignored at
   .gitignore:36). Every live PATCH writes through it; restore POL-SANDBOX before exiting (the round trip in
   acceptance does this), never git-add it, never hand-edit it, and do NOT "fix" the sharing (lane-infra /
   architect territory).
10. Ontology terms: none required — this item touches no claim/context/assertion surface.

## STOP BOUNDARY -> ARCHITECT (STOP and return requires-rescope, never absorb)
- New bundle REGISTRY mechanics: adding/removing bundles at runtime, hot-reload of bundle YAML, bundle
  schema/validation work, per-bundle manifest design.
- Config-schema redesign: new config keys/sections, restructuring lab, settings-as-records.
- Auth-surface redesign: a lab-admin role kind, moving a gate INSIDE configHandlers.patchConfig (touches
  every Settings save), preHandler/session infrastructure, implementing cheatsheet §1's
  POLICY_BUNDLE_CHANGE_FORBIDDEN + policy_bundle_changed audit as real behavior.
- Any sign the gate must sit on PATCH /api/config too for the switch to be non-cosmetic (that is open
  question 2 — architect/Brad's, not the worker's).

## OPEN QUESTIONS (spec author could not resolve locally; orchestrator route)
1. WHO is "admin" for a compliance-bundle change? Spec ships the interim concrete-user gate (NO_CURRENT_USER).
   Brad's Q1/Q2 from decision 2026-10-04 (:3001 vs lane, USR-QMS-ADMIN vs role-grant, §1's 403 token+audit)
   remain unruled. Checked: AuthorizationService.ts (record-scoped only), RoleResolver.ts (lifecycle roles
   only), routes.ts (zero preHandlers), cheatsheet §1, repo-wide token grep (zero matches).
2. Cosmetic-gate: must the same validation+gate also cover PATCH /api/config's lab.policyBundleId path
   (architect decision 2026-10-04, Brad's Q3), or is /settings/lab's gate accepted as the UI-path gate while
   /api/config is explicitly operator surface? Checked: configHandlers.ts:314-322 merges lab verbatim with no
   bundle-id validation — PATCH /api/config CAN set an unknown bundle id today (pre-existing; flagged,
   out of scope here).
3. Trunk drift: worktree LabSettingsHandlers.ts predates the main-repo availablePolicyBundles variant that
   client.ts's LabSettings type (:845, optional) already declares. Should the worktree handler be aligned
   (availablePolicyBundles in the response, selector fed from data) — cheap here but out of scope by design?
   Checked: both file contents, symlink list (92), vitest realpath behavior via probe (KEYS=3, no field).

DRAFT-COMPLETE qms8
