# SPEC — QMS-8-POLICY-BUNDLE-SWITCH (lane 1)
# Composed by orchestrator tick 20261010T1540 from rulings/L1-qms-field-defects-ruling-20261010.md
# (Defect L1-A, APPROVED by Brad 2026-10-10) + orchestrator-screened cl-scout recon
# (scout-logs/qms8-s1.log) — every load-bearing line re-verified first-hand by the orchestrator
# [VERIFIED marks]. Trunk base: cl/integration-1 @ 14637f6d.

## Item
id: QMS-8-POLICY-BUNDLE-SWITCH
"Regulated-mode switch is a dead button": SettingsPage.tsx:96 calls
apiClient.patchLabSettings({policyBundleId}) — the method is ABSENT from
app/src/shared/api/client.ts [VERIFIED: only patchConfig exists at client.ts:3190;
getLabSettings exists at :2867], and the server registers ONLY GET /settings/lab
[VERIFIED: routes.ts:590-593; live probe PATCH /api/settings/lab -> 404
{"message":"Route PATCH:/api/settings/lab not found"} on :3092 today].
BOTH halves land as ONE contract — landing half ships a known-dead button.

## Ground truth the coder starts from [VERIFIED first-hand]
- server/src/api/handlers/LabSettingsHandlers.ts: createLabSettingsHandlers(config?, bundleService?)
  — getLabSettings reads config?.lab?.policyBundleId ?? 'POL-SANDBOX', returns
  {materialTracking, policyBundleId, activePolicyBundle: bundleService?.getBundle(id) ?? null}.
  It is a STATIC config object today (server.ts:817 passes ctx.appConfig by value-at-construction).
- THE SNAPSHOT TRAP (orchestrator-discovered, load-bearing): server.ts:817 captures
  ctx.appConfig at construction; PATCH /api/config's onConfigUpdate REASSIGNS ctx.appConfig
  (configHandlers.ts:362 `this.appConfig = updated` + :363 onConfigUpdate). The vendor-search
  handlers already solved exactly this with a LIVE ACCESSOR — server.ts:755 comment
  "Live accessor, not a snapshot" and `getAppConfig: () => ctx.appConfig`. The new PATCH
  /settings/lab + a refreshed GET MUST go live through a live accessor (or reuse the
  configHandlers instance), or the write persists to disk while GET /settings/lab keeps
  returning the stale bundle until restart.
- PATCH /api/config precedent (configHandlers.ts:200-374) [VERIFIED]: body-object guard ->
  400 {success:false,error}; deep-merge mergeConfigPatch; validateConfig -> 400 with details;
  ATOMIC write tmp+rename (writeConfigYaml :97-107); in-memory reassign + onConfigUpdate;
  response {success, message, restartRequired, config}. It accepts lab.policyBundleId patches
  already (types.ts:84 policyBundleId?: string) — but it is the WHOLE-config surface; the
  ruling wants a narrow lab-settings route, not exposing that surface to Settings.
- Bundle registry is DATA: schema/core/policy-bundles/*.policy-bundle.yaml loaded by
  PolicyBundleService.loadFromDir (server.ts:430-434, dir resolve(schemaDir,'core/policy-bundles'))
  [VERIFIED]. Known ids: POL-NOTEBOOK, POL-REGULATED, POL-SANDBOX, POL-TRACKED.
  PolicyBundleService.getBundle(id) / listBundles() exist (PolicyBundleService.ts:38-43).
- Authz: AuthorizationService.canAccess(userId, 'admin', record) is the precedent gate
  (IdentityHandlers.ts:313,362) [VERIFIED]. configHandlers has ZERO authz today.
  Lab settings have no Record — the ruling's "likely yes, gated" must be decided in THIS spec:
  DECISION (orchestrator, per architect lean): gate the PATCH with the same identity surface the
  lane uses for privileged non-record acts: resolve the request user (resolveRequestUser,
  server.ts pattern used by lifecycle handlers) and require the admin-role grant the way
  IdentityHandlers does — concretely: reuse `authorizationService.canAccess(userId, 'admin', <the
  config-as-record is impossible>)`. Because canAccess is record-scoped and a config write is not
  a record, the coder must follow the ACTUAL privileged-write precedent that exists on this
  trunk for non-record routes (check configHandlers' route wiring + server.ts auth middleware
  for how PATCH /api/config is protected — if NOTHING protects it today, gate the new route on
  resolved-user admin-role via the role resolver used by lifecycle transitions, deny with
  403 {error:'FORBIDDEN', message}, and record the mismatch as an observation, not a redesign).
  Never silently ship the switch ungated while the ruling leans gated; if neither mechanism is
  reachable, STOP-note for architect.
- Persistence MUST be DATA: write through the same config-store mechanism (writeConfigYaml
  atomic tmp+rename + in-memory reassign + onConfigUpdate). The lane's config file is
  CONFIG_PATH=/home/brad/.hermes/cl/lanes/1/lane1-config.yaml (A-L1-015) — lane-local, fine.
  NEVER hand-edit the YAML file in code paths; go through the config writer.

## Contract
1. Server: PATCH /settings/lab accepting {policyBundleId: string} ONLY (extra keys -> 400).
   - 400 actionable refusal when the id is not in bundleService (message names the bad id and
     lists known ids from listBundles() — data, not a hardcoded list in TS).
   - 2xx response shape = the SAME body getLabSettings returns (client setLabSettings(updated)
     at SettingsPage.tsx:96-97 already assumes that).
   - persists lab.policyBundleId via the config-writer path (atomic), refreshes in-memory config
     live, fires onConfigUpdate.
   - unknown-route baseline: today 404 (RED baseline).
   - authz gate per the DECISION above; denial -> 403 {error:'FORBIDDEN',message} (rejections are
     {error:TOKEN,message}, no code field — lane fact).
2. Client: app/src/shared/api/client.ts patchLabSettings(patch:
   {policyBundleId: string}): Promise<LabSettings> against PATCH /settings/lab, mirroring
   getLabSettings' request<> style (:2867). SettingsPage keeps its call site; replace the alert
   with surfacing the server's message in the existing labSettingsError state (:69-71) — the
   alert() at :99 may stay only if the message shown IS the server's reason (match how the page
   already renders labSettingsError at :280-282; prefer the state, not alert).

## RED-FIRST tests (headless; server suite from the server package dir)
- Route absent baseline documented (404) before adding.
- configHandlers-style test file (follow configHandlers.test.ts style): PATCH valid known id ->
  2xx + GET /settings/lab reflects new bundle IN THE SAME PROCESS (proves live accessor — the
  snapshot trap is THE most likely defect); unknown id -> 400 with the id + known ids named;
  non-object/multi-key body -> 400; unauthorized -> 403 if the gate lands (per DECISION).
- Client-side: follow whatever client.test pattern exists (survey app/src/shared/api for a test
  file; if none, a vitest that stubs fetch and asserts the PATCH path/body — do not invent a new
  test framework).

## Baselines (capture fresh at claim base, report §0)
- server vitest fail-FILE SET + server tsc multiset vs /tmp trunk baseline — capture fresh in
  YOUR worktree at your base sha (prior lane baselines: server tsc had 33 PRE-EXISTING error
  lines on trunk; re-capture, do not trust the number, assert multiset equality).
- app vitest fail-FILE SET (cd app && npx vitest run); app tsc multiset.
- Zero NEW failing files; schema MANIFEST/golden file untouched — if a golden would move, STOP
  and report (goldens are not editable by coders).

## Browser gate (mandatory; cl-browser-reviewer, http://localhost:5192)
VERBATIM acceptance: "Settings -> regulated -> persists across reload; sandbox->regulated->sandbox
round trip; lifecycle behavior difference visible (signature requirements differ per bundle).
unknown bundle id refused with actionable error."
RESTORE POL-SANDBOX at the end of the gate (stop-boundary honored by the QMS-7 lap; same rule).
The QMS-7 process lesson is binding for this gate: exercise the SHIPPED user path (click the
Settings control), never the bundle service or a direct PATCH as a stand-in.

## File ownership
server/src/api/handlers/LabSettingsHandlers.ts (and/or a new SettingsLab PATCH handler next to
it), server/src/api/routes.ts (+ server.ts wiring for live accessor / authz), server test file,
app/src/shared/api/client.ts, app/src/shell/SettingsPage.tsx (error path only).
NOT owned: schema/core/policy-bundles/* (data already correct), config.yaml semantics,
configHandlers.ts (reuse the writer, do not refactor PATCH /api/config).

## Stop boundaries -> architect (requires-rescope; stop, do not absorb)
- bundle-registry mechanics changes (loading, schema of bundles);
- any need to change PATCH /api/config semantics or expose it to Settings;
- authz-surface redesign (a NEW authz primitive);
- restartRequired semantics for bundle switches (if a bundle change truly needs a restart to
  affect the lifecycle engine, STOP-note with evidence — the gate's "lifecycle behavior
  difference visible" implies live effect; check LifecycleEngine's bundle read path at :714/:779
  area before claiming liveness).

## Deliverables
- Worktree off cl/integration-1, ONE final commit.
- Report at the unique .wip path in the dispatch prompt (untracked), carrying §0 baselines,
  RED->GREEN outputs, authz DECISION evidence, live-accessor proof (GET-after-PATCH same
  process), diff --name-only, and the process-lesson reconciliation note: how the QMS-7 gate
  passed without the route (service-level test) and that this gate used the shipped path.
- Records created during verification are TEST DATA (A4); restore POL-SANDBOX regardless.
