# SPEC DRAFT — QMS7-2: Copy-on-write promotion for seed-backed writes (D2)

Contract header:
- Campaign: QMS registry unification + CRUDa + seed coherence — lane 1, wave 3
- Item: QMS7-2 (task-list /home/brad/.hermes/cl/lanes/1/task-list.md, wave-3 block)
- Status: composer draft l1t1920 — NOT dispatchable until the orchestrator reviews and promotes
- Binding ruling A (Brad 2026-10-15, intake packet ~/.hermes/specs/intake/2026-10-15_qms-registry-unification-wave3/intake-packet.md): first AUTHORIZED, VALID write to a seed-resolved record copies the seed content into the working data dir (embedded git), applies the update there, and records an audit-visible promotion provenance marker (source seed path + content fingerprint). Seed dir stays factory defaults; record writes NEVER touch the code repo.
- Base: trunk cl/integration-1 @ 71412415 (composer re-anchored every cite at this tip)
- Worker: cl-senior coder, worktree /mnt/vast/home/brad/git/wt/qms7-2-lane1-<ts> off CURRENT trunk tip AT DISPATCH TIME (re-resolve `git -c core.fileMode=false rev-parse cl/integration-1`; do not trust 71412415 if the trunk moved), branch `wt/QMS7-2-lane1-<ts>`. ALL git commands with `git -c core.fileMode=false`. Handoff under .hermes/plans/handoffs/, report under ~/.hermes/cl/lanes/1/.
- SERVER-SIDE ONLY. Hard ownership OUTs (any touch = reject): app/**, schema/** (NO schema changes), records/seed/** (seed dir never written — it is inside the CODE repo), config/seed-sources* (none needed; see recon), docs/**.
- IN: server/src/store/RecordStoreImpl.ts, server/src/store/types.ts (typed promotion marker on StoreResult only, if needed), server/src/api/handlers/RecordHandlers.ts (audit-append hook on the update response path ONLY if OQ2 lands handler-side — the task-list files line lists store+tests, so this must be an explicit orchestrator ruling before the coder touches it), server-side tests. server/scripts only if a probe is needed (none expected).

## Goal (one sentence)

Make write paths agree with read paths about which records exist: a first authorized, valid PUT to a seed-resolved record promotes the seed content into the data dir (embedded git) with an audit-visible provenance marker, instead of dying with "Record not found" while reads see the record.

## Ground truth (composer-verified at tip 71412415, live probes on :3092 at ~2026-10-15 19:3x EDT)

Store — server/src/store/RecordStoreImpl.ts (923 lines):
- `findRecordPath()` :121-171 — scans ONLY the working data dir via `this.repo.listFiles({directory: this.config.baseDir})`; has the filename-convention content-identity fallback at :152-168 (prior art for "resolution-path disagreement": "list() and the library index read content and DO see them, which made get-by-id disagree with search").
- `findSeedRecordPath()` :173-222 — walks `this.config.seedDir` (CODE repo), populates `seedPathCache` :79.
- `getSeedRecord()` :224-241 — stamps `meta.path = seedPath`, `meta.commitSha: 'seed'`; does NOT stamp `meta.contentSha` (so the handler's `token()` = RecordRevisionService.ts:37 `meta?.contentSha ?? meta?.commitSha` returns the literal `'seed'` for seed reads — OQ3).
- `get()` :246-273 — falls back to `getSeedRecord` when `findRecordPath` misses :247-250. Read sees the seed world.
- `list()` :368-451 — after scanning the data dir, merges seed records by kind at :439-448 via `listSeedRecords(seedKindDir, existing)`; `listSeedRecords` :334-363 SKIPS seeds whose recordId is already in `existing` (:349). Exactly-once suppression after promotion already exists in list — but it is only exercised per-kind (seedDir merge requires `filter?.kind`, :439).
- `updateUnlocked()` :635-793 — resolves via `findRecordPath()` ONLY (:639-645); seed-invisible → returns `Record not found`. Then, in order: append-only wall :660 (`['record-revision','signature','audit-event', ...config.appendOnlyKinds]`), content lock :664 (`lifecycleId && state in [approved,effective,superseded,archived] && controlledContent changed`), SHA check :678, validate :687-696, lint :700-709, then `repo.updateFile` :716. THE FIX LIVES HERE: when `findRecordPath` misses, consult `findSeedRecordPath` and run the SAME walls against the seed payload before any durable write.
- `deleteUnlocked()` :802-868 — same `findRecordPath`-only asymmetry (:806-812), then append-only wall :825, SHA :831. (OQ1 — do not silently choose.)
- Locking: `update()` :631 / `delete()` :798 / `create()` :464 all funnel through `withRecordLock(this, 'write:' + recordId, ...)` — RecordRevisionService.ts:39-47, a per-store WeakMap promise queue keyed by lock id. Per-record serialization ALREADY EXISTS; the concurrency pin just proves promotion is inside it.
- `createUnlocked()` :468-595 — collision check is `findRecordPath` ONLY (:472): a POST create with a seed id today silently SHADOWS the seed (OQ4). Path generation via `generatePath` :539 (PathConvention.ts:98, filename `{recordId}__{slug}.yaml`, PATH_SEPARATOR '__' :51). Promotion must land at the same convention so `findRecordPath`'s fast scan resolves it.
- `pathCache` seeding pattern :569, :734; `clearCache()` :907-910 clears both caches.
- Config: `seedDir` RecordStoreConfig types.ts:193, `appendOnlyKinds` types.ts:209; defaults RecordStoreImpl.ts:50-56. Server wiring: server.ts:504 `resolveSeedRecordsDir()`, :509 seedDir pass-through, :512 appendOnlyKinds (default at config/types.ts:520 = `['audit-event','signature','vendor-protocol-candidate']`). seedRecordsDir.ts:13-23 walks UP from the compiled file to find `records/seed/` — resolves to the CODE REPO worktree (/mnt/vast/home/brad/git/cl-integration-1/records/seed). The DATA repo is embedded git under /home/brad/.computable-lab-lane1 (repos/main.git + worktrees/main); the RepoAdapter's baseDir lives there. NEVER conflate.
- Fingerprint convention: adapters hash content `createHash('sha256').update(content).digest('hex').slice(0, 40)` (EmbeddedGitRepoAdapter.ts:39, GitRepoAdapter.ts:199, LocalRepoAdapter.ts:28). Reuse this EXACT derivation for the seed content fingerprint — do not invent a second hash format.

Handler (PUT path) — server/src/api/handlers/RecordHandlers.ts:
- `updateRecord` :766. Order of gates, ALL before store.update: 404 check `store.get(id)` :788 (PASSES for seed records — store.get sees seed), auth :794, ACL canAccess :796-799, API append-only wall 405 :806-814, authoring gate :818-832, revision-pin / lifecycle-immutable :835-851, signature validation :860-908, lifecycle transition gate `checkLifecycleTransition` :912-928, CONTROLLED_RECORD_LOCKED 409 :933-935, protocol step gates :938-948, extraction-draft gate :950-960, provenance normalization :968-1001, then `store.update` :1011. Failure mapping: validation/lint 422, `'SHA mismatch'.includes` → 409 :1031-1036, ELSE generic `reply.status(400)` :1050. THE 400 AT TIP COMES FROM HERE.
- Post-write machinery the marker must join: index rebuild :1060-1067, `record_revised` audit via `security.auditService.append` :1074-1097 (pattern: `{actor, action:'record_revised', subjectType, subjectId, data:{previous_sha,new_sha,...}}`), `lifecycle_transition` audit :1102-1117. Audit failures are best-effort and never fail the write.
- `deleteRecord` :1267; store.delete :1311; same 400-generic fallback :1326. NOTE: handler does NOT pass `actor:` into store.update (:1011-1018) — the store-side bypass detector resolves actor from meta fallbacks (RecordStoreImpl.ts:748-756).
- Audit machinery — server/src/governance/AuditEventService.ts: audit events ARE records (kind `audit-event`, id `EVT-*`, schema schema/governance/audit-event.schema.yaml) created through the SAME store; `action` is a free-form string constrained only by pattern `^[a-z][a-z0-9_]*$` (schema :34-36) — NO action enum, so a promotion action value is DATA on existing machinery, not a code vocabulary change. Existing actions in handlers: `record_revised`, `lifecycle_transition`; store bypass: `lifecycle_state_bypass`.
- Search/index: IndexManager.rebuild IndexManager.ts:211-277 merges seeds only for ids NOT already indexed (:244) — exactly-once holds there too, keyed by recordId in a Map. POST /api/search/jsonld (routes.ts:715) is backed by the sqlite JSON-LD index via writeHook.onUpsert; the index is keyed per recordId, so a promoted record re-upserts, never duplicates.

Live probe evidence (composer, :3092, at tip):
- GET /api/records/EQC-QUANTSTUDIO5 → 200, meta shows `"path":"/mnt/vast/home/brad/git/cl-integration-1/records/seed/equipment-class/eqc-quantstudio5.yaml", "commitSha":"seed"`. Seed file sha256 (full): `9163d1a3b97c791154fa3c0760e84793d26027255fa65c117ebbdfac74e974cf`.
- PUT as `x-user-id: USR-QMS-ADMIN` with the record's own payload plus a trailing-space edit to `name` → HTTP **400** `{"success":false,"error":"Record not found: EQC-QUANTSTUDIO5"}`. HONEST CORRECTION to the packet: the architect recorded 404; at tip the status is 400 (the generic store-error mapping at RecordHandlers.ts:1050), because the handler's own 404 at :788 never fires for seed-visible records — store.get sees the seed, and it is the STORE that disagrees. Same body text, different status. The asymmetry itself reproduces exactly as described.
- DELETE as USR-QMS-ADMIN → HTTP 400 `{"success":false,"error":"Record not found: EQC-QUANTSTUDIO5"}` — the delete asymmetry reproduces too.
- ACL probe passed (the request reached the store — a 403 ACCESS_DENIED never appeared), so the "first AUTHORIZED write" scenario is live-reachable with this identity.
- The refused probes left no data-dir residue (lane data repo `git status --short` shows only pre-existing M files from earlier campaign probes; zero EQC files under /home/brad/.computable-lab-lane1).
- Kinds with seed records under records/seed/ (composer count): equipment(25), equipment-capability(12), equipment-class(4), graph-components(2), identity(1: OWN-LAB-DEFAULT, kind ownership-policy), labware(20), labware-definition(39), labware-definitions(4), materials(9), platforms(1), protocols(6 — consumed by ensureSeedProtocols bootstrap, NOT the store merge), verb-definition(10). The mechanism must stay generic across all of these — no kind-name switch.
- Baselines: `cd server && npx tsc --noEmit` → **0 errors** at tip (the 33-error baseline in older task-list outcome blocks is STALE for the server workspace — composer's own run this tick). `npx vitest run src/store/RecordStore.test.ts` → 38/38 green (this file already carries the seed-get tests at :352-390 — the RED regression belongs in this suite, same LocalRepoAdapter + tmpdir seedDir pattern).

## Design (what the coder builds)

In `updateUnlocked`, when `findRecordPath` misses AND `seedDir` is configured, resolve `findSeedRecordPath`; if found, this is a CANDIDATE PROMOTION. Treat the seed file exactly as `updateUnlocked` treats the working file today:

1. Parse the seed envelope; run the append-only wall (:660 logic, config-injected kinds, generic) and the content-lock check (:664 logic) against the SEED payload, before anything else.
2. SHA semantics (OQ3): if `options.expectedSha` is set, it must equal the seed content fingerprint (`sha256(content).slice(0,40)`, the adapter derivation) OR the literal token the seed read path stamps (`'seed'`, since getSeedRecord :235 sets only commitSha). Refuse with the existing `'SHA mismatch: expected X, got Y'` wording (the handler maps it to 409 at :1031) otherwise.
3. validate + lint the INCOMING envelope (:687-709 logic, unchanged skip flags).
4. Only now make the promotion durable: `repo.createFile` at the working path from `generatePath` (same convention as createUnlocked :539-545 so the fast path-scan finds it), content = `serializeRecord(incoming envelope)`. A single createFile commit = the atomic promotion+update step: git's create-or-fail is the durability wall; there is no half-written window because nothing before step 4 touches the repo and a failed createFile commits nothing. The commit message carries the provenance in human-visible form, e.g. `Promote seed record <recordId> from <seed-relative-path> (seed content <fingerprint>)`.
5. On success: prime `pathCache` (:734 pattern), fire `fireUpsertHook` (existing :778), and surface a typed promotion marker on the StoreResult — `promotion?: { seedPath: string; seedContentSha: string }` in server/src/store/types.ts (exactOptionalPropertyTypes: conditional spread, never `promotion: undefined`). The marker's content fingerprint = the sha256-40 of the seed file content at read time.
6. Audit visibility (OQ2 — orchestrator rules placement): RECOMMENDED handler-side — on `updateRecord` success, when `result.promotion` is present, `security.auditService.append({actor: user.userId, action: 'seed_record_promoted', subjectType: payloadKind, subjectId: id, data: {seed_path, seed_content_sha, promoted_path, ...commit}})` following the `lifecycle_transition` pattern (:1102-1117): best-effort, AFTER the durable write, never fails the business write, actor is the REAL acting user (the store has no actor on this path — RecordHandlers.ts:1011 never passes one). Alternative store-side via a late-bound audit collaborator à la `setLifecycleBypassAudit` (:111-114) is viable but loses the true actor; do not build both.
7. The SEED FILE IS ONLY EVER READ. No repo code path may open records/seed/** for writing. The promotion copies the seed file's PARSED envelope through the normal serialization path (so the working copy carries the canonical `$schema`/`recordId` header), not the raw seed bytes.
8. delete(): do NOT change behavior in this item unless OQ1 rules otherwise (see OQ1).
9. get()/list()/search need NO changes: get prefers working copy (:247 working-hit checked before seed fallback), list suppression at :349, index suppression at IndexManager.ts:244. Pin them with tests, change nothing. If the reviewer claims otherwise, the answer is those three line numbers.

## RED-first test plan (new file recommended: server/src/api/handlers/RecordHandlers.seedPromotion.test.ts + additions to server/src/store/RecordStore.test.ts)

Write these BEFORE the implementation; each must be observed failing at base (name the inversion in the commit message):
- R1 store-level regression (the core bug): tmpdir data repo + tmpdir seedDir with one seed record (reuse the :352-363 pattern, a labware fixture — do NOT use EQC-QUANTSTUDIO5 in unit tests); `store.get` resolves it, `store.update(valid envelope)` currently FAILS 'Record not found' → after the fix SUCCEEDS, the working file exists at the `{id}__{slug}.yaml` convention path, and the result carries `promotion.seedPath` + `promotion.seedContentSha` matching sha256-40 of the seed file content.
- R2 handler-level regression mirroring the live probe: direct-handler style of RecordHandlers.writeGates.test.ts (in-memory store + spies) is the model, but R2 needs a REAL store (LocalRepoAdapter) because the assertion is about the store's path resolution; assert PUT-via-handler as an authorized user flips from `{success:false,error:'Record not found: ...'}`/400 to 200-class success. (If wiring the full handler proves heavy, the store-level R1 + a narrow handler test for the audit append is acceptable — the live probe below is the end-to-end pin.)
- R3 EXACTLY ONCE: after promotion, `store.list({kind})` returns the record once (suppression :349), `store.get` returns the working copy (meta.path under the data dir, no commitSha 'seed'), and IndexManager seed-merge (IndexManager.seedMerge.test.ts pattern) indexes it once.
- R4 RESIDUE-FREEDOM: (a) invalid payload (validation fails) → update refuses AND `listFiles(baseDir)` shows ZERO new files, data-repo HEAD unchanged, no audit event; (b) append-only-kind seed (declare a test seed whose payload kind is in a config-injected appendOnlyKinds list — NOT a hardcoded kind name in the test's store setup) → refused, zero residue; (c) content-locked seed (lifecycleId + state approved + changed controlledContent) → CONTROLLED_RECORD_LOCKED, zero residue; (d) wrong expectedSha → SHA mismatch, zero residue. Assert "zero residue" as: data dir file list byte-identical before/after + no new git commit.
- R5 CONCURRENCY: fire two `store.update()` calls for the same seed id without awaiting between (Promise.all); both succeed or the second applies normally on top of the promoted copy; EXACTLY ONE working file and ONE pathCache identity result; final content is one of the two writers' (lock serializes, last-write-wins within the lock).
- R6 NONEXISTENT STILL 404-CLASS: update for an id in NEITHER dir still returns `Record not found` failure (no create-on-update); the handler still 404s at :788 before ever reaching the store.
- R7 audit marker (OQ2-dependent): promoted PUT appends an audit-event with the seed path + fingerprint and a real actor; refused PUT appends NOTHING.

## Acceptance criteria (verbatim from the task list `verified by:`)

  RED first: regression reproduces seed-visible-but-PUT-404. GREEN: PUT EQC-QUANTSTUDIO5
  succeeds once; GET/list/search POST-RESTART return the promoted record exactly once; the
  data dir contains it + promotion provenance; seed file hash + code-repo git status
  UNCHANGED by the request. Unauthorized / invalid / append-only / content-locked attempts
  produce no promotion residue. Genuinely nonexistent ids still 404. Server suite green.

(Note: the task-list's "PUT-404" wording — at tip the refusal is HTTP 400 with `Record not found` body text; the RED test pins the error STRING and the store-level refusal, not the status number, per the live-probe correction above. Orchestrator: accept this re-wording or re-rule it.)

## Reviewer bait (name these preemptively in the diff/comments so the adversarial review spends its ammunition elsewhere)

1. exactOptionalPropertyTypes sites: `StoreResult.promotion` must be optional-and-absent, constructed with conditional spreads (`...(promotion ? {promotion} : {})`), never assigned `undefined`; the audit `data` object follows the existing `...(x !== undefined ? {x} : {})` idiom (RecordStoreImpl.ts:760, RecordHandlers.ts:1090).
2. YAML-reload trap: this item changes ZERO YAML — no lane-stack restart is required for the unit gates. If a diff touches records/seed/** or any schema YAML, it is out of ownership, period.
3. Ontology/vocabulary: the promotion action name is DATA flowing into the free-form `action` string (audit-event schema only enforces `^[a-z][a-z0-9_]*$`, no enum). NO new store-level event enum, no new meta field on RecordEnvelope, no new file format. If the reviewer says "this is new vocabulary", answer with schema/governance/audit-event.schema.yaml:34-36 + the `data: {additionalProperties: true}` (:52-55) — the marker rides existing machinery as payload data.
4. Hardcode boundary: `EQC-QUANTSTUDIO5`, `equipment-class`, and any seed-file path must appear NOWHERE in server/src outside tests; seed root comes from `this.config.seedDir`, fingerprint from the existing sha256-40 derivation, append-only kinds stay config-injected (types.ts:209 comment is explicit about this).
5. No code-repo writes: the ONLY file-mutating calls allowed in the promotion path are `this.repo.*` (data-dir adapter) calls. `findSeedRecordPath` is readFileSync-only (:211) — keep it that way; do not "helpfully" add a seed write helper.
6. Seed-dir mutation: `records/seed/**` is git-tracked in the CODE repo; verification bar includes `git -c core.fileMode=false status --porcelain` on the code repo being clean AND `sha256sum records/seed/equipment-class/eqc-quantstudio5.yaml` == `9163d1a3...974cf` before/after the live probe.
7. No kind-name switch in TS: the promotion decision is `findRecordPath===null && findSeedRecordPath!==null`, evaluated generically; any `if (kind === ...)` in the promotion path is an instant reject.
8. Status-code honesty: current seed-write refusal surfaces as 400 (generic store-error mapping), not 404; tests pin the error string. Do not "fix" the status to 404 in this item — that re-mapping at RecordHandlers.ts:1050 affects ALL store errors, not just seeds.
9. The seed protocols bootstrap (ensureSeedProtocols, server.ts:633-635, uses `store.get` at seedProtocols.ts:53) stays idempotent after promotion: a promoted protocol record resolves via the working copy, `ensureSeedProtocols` skips it — pin nothing, but do not "fix" it either.

## First targeted check (proves the approach early)

`cd /mnt/vast/home/brad/git/cl-integration-1/server && npx vitest run src/store/RecordStore.test.ts -t 'seed'` — the existing seed tests (38-suite, :352-390) must stay green with the RED additions failing, confirming the tmpdir-seedDir harness is the right venue before any implementation.

## Verification bars (expected outputs)

Worker-side (before handoff):
1. RED observed: `cd server && npx vitest run src/store/RecordStore.test.ts src/api/handlers/RecordHandlers.seedPromotion.test.ts` → the new promotion tests FAIL at base (capture output in handoff), implementation added, re-run → all pass.
2. Targeted suites: `npx vitest run src/store/RecordStore.test.ts src/store/LifecycleBypassAudit.test.ts src/index/IndexManager.seedMerge.test.ts src/api/handlers/RecordHandlers.writeGates.test.ts src/api/handlers/RecordHandlers.seedPromotion.test.ts` → 0 failures.
3. Full server suite: `cd server && timeout 600 npx vitest run` → "Test Files ... Tests ... 0 failed" (no new failures vs base; run the full suite at base first if anything looks flaky).
4. Typecheck: `cd server && npx tsc --noEmit` → exit 0 (composer-measured baseline at tip is 0 errors, NOT 33 — if the coder's run reports errors, compare against `git stash`/base first; zero NEW errors is the bar).
5. Code-repo untouched: `git -c core.fileMode=false status --porcelain` (lane worktree) → only intended server/ files; `sha256sum records/seed/equipment-class/eqc-quantstudio5.yaml` → `9163d1a3b97c791154fa3c0760e84793d26027255fa65c117ebbdfac74e974cf`.
6. App workspace untouched: no app/ diffs; `npm run typecheck` root optional (app baseline unchanged).

Orchestrator-side (post-merge, post lane-stack restart — worker never restarts :3092):
7. Live: `curl -s http://localhost:3092/api/records/EQC-QUANTSTUDIO5` → 200, meta.path becomes the DATA-dir working path after the PUT (before the PUT it is the seed path).
8. Live one-shot: PUT as `x-user-id: USR-QMS-ADMIN` with the record's own payload + one harmless edit → `success:true` ONCE; re-GET shows the edit.
9. Exactly once: `curl -s 'http://localhost:3092/api/records?kind=equipment-class' | grep -o EQC-QUANTSTUDIO5 | wc -l` → 1; POST /api/search/jsonld (`{"query":"QuantStudio","limit":20}`) hits EQC-QUANTSTUDIO5 exactly once (search may need the post-restart index rebuild — it runs at boot).
10. Provenance: `git -C /home/brad/.computable-lab-lane1/worktrees/main -c core.fileMode=false log --stat -3` shows the promoted file + the promotion commit message; `grep -rl seed_record_promoted /home/brad/.computable-lab-lane1/worktrees/main/records/audit-event/` (name per OQ2) shows the marker with seed path + fingerprint.
11. Seed untouched: code-repo `git -c core.fileMode=false status --porcelain` clean of records/seed changes; seed file hash still `9163d1a3...974cf`.

## Worker contract

- Branch `wt/QMS7-2-lane1-<ts>` off current trunk tip at start, worktree /mnt/vast/home/brad/git/wt/qms7-2-lane1-<ts>; `git -c core.fileMode=false` for EVERY git invocation; no merges, no task-list edits, mark in-progress on claim only.
- Deliverables: branch + handoff `.hermes/plans/handoffs/<date>_qms7-2-seed-cow-complete.md` containing: RED-greens evidence (base-fail output + tip-pass output), the five pin tests named (R1,R3,R4,R5,R6 + R7 per OQ2), code-repo status + seed hash outputs, full-suite tail, and the OQ-dependent decisions actually implemented.
- Stop-boundary: if wiring the audit marker at the store level (without an actor) is the only local option when OQ2 is unresolved, STOP and return requires-rescope rather than forging a new audit channel. Never touch :3001/:5174, never restart :3092.

## Open questions for the orchestrator (I could not resolve these locally; recommendations included)

- OQ1 — delete() asymmetry (required ruling, the task block forbids silent choice). Server DELETE on a seed record currently 400s identically to PUT (composer probe: `DELETE /api/records/EQC-QUANTSTUDIO5` → 400 `Record not found`). Options: (a) leave delete seed-refused but make the store error explicit — 'resolves from seed; seed records cannot be deleted' — consistent with ruling B (archive replaces DELETE; factory defaults must not be erasable through a data-dir delete that a factory re-seed would resurrect anyway); (b) promote-then-delete (erase-then-shadow the factory default — works against ruling B's "usability-off, not erasure" spirit). RECOMMEND (a): DELETE-on-seed stays a refusal with a clearer message; QMS7-4/6 own archive semantics. Note (a) is a message-string change inside RecordStoreImpl.deleteUnlocked only — generic, no kind names. What I checked: ruling B text (intake packet), deleteUnlocked :802-868, RecordHandlers.deleteRecord :1267-1330 (it 404s only when store.get misses — same seed-blind spot at the store call :1311).
- OQ2 — where the audit marker is appended: handler-side append on `result.promotion` (RECOMMENDED — real actor, mirrors :1102 lifecycle_transition precedent, keeps the store free of governance imports) vs store-side collaborator (mirrors setLifecycleBypassAudit :111-114 but actor degrades to meta fallbacks because RecordHandlers.ts:1011 passes no `actor` — what I checked: bypass-actor resolution RecordStoreImpl.ts:748-756, updateRecord's store.update call site). If handler-side is approved, RecordHandlers.ts joins the file-ownership IN list. Also rule the action name if 'seed_record_promoted' is not to your taste; the schema accepts any lowercase snake_case string (audit-event.schema.yaml:34-36).
- OQ3 — seed SHA-token semantics: getSeedRecord stamps ONLY `meta.commitSha:'seed'` (:235) so handler-echoed expectedSha arrives as the literal `'seed'`. The promotion path must accept `expectedSha === 'seed'` as matching the seed fingerprint, or (alternative) getSeedRecord starts stamping `meta.contentSha` = fingerprint. RECOMMEND the former (one-line comparison, zero blast radius); the latter changes `token()` for every seed record and could ripple into signature/revision paths (RecordRevisionService.ts:37) that this item must not disturb. What I checked: token() definition, updateRecord's expectedSha assembly :1013, seed meta stamping.
- OQ4 — create() shadowing (DISCOVERED, adjacent, out of scope unless ruled in): POST create with a seed id passes `createUnlocked`'s collision check (:472, data-dir-only) and silently SHADOWS the seed today — the same resolution-path disagreement in the other direction. RECOMMEND: leave it; note it for QMS7-5 (Create button) where a user typing an existing seeded name could shadow factory defaults; a one-line seed-exists collision in createUnlocked is the eventual fix but widening QMS7-2 now violates "do not widen scope". What I checked: createUnlocked :468-478, no seed reference anywhere in the create path, registry create machinery (EDITOR-9) is app-side.

## Assumptions the coder may NOT make

- That PUT on a seed record currently returns 404 (it returns 400 + 'Record not found'; pin the string, not the status).
- That list()/search need suppression CODE for the promoted case (they already suppress — :349 and IndexManager.ts:244; your job is pinning tests, not new logic; if a pin test FAILS, that is a bug to raise, not a feature to build around).
- That the 33-error typecheck baseline applies here (server workspace typechecks at 0 errors at tip 71412415, composer-measured; the 33 is a stale wave-2 baseline).
- That the seed dir may be rewritten, reset, or "restored" by any code path, or that the data repo may be pre-seeded manually to make a test pass.
- That `EQC-QUANTSTUDIO5`, `equipment-class`, or any kind name may appear in server/src outside tests.
- That the worker may restart the lane stack, touch :3001/:5174, or run the live :3092 PUT probe (that probe is orchestrator-side post-merge; the worker's unit tests use tmpdir fixtures).
- That audit failure may fail a promoted write (the marker append is best-effort, AFTER durability, per the existing audit pattern) — or conversely, that promotion durability may wait on the audit event (refusals must not be auditable-but-half-promoted: the gate order is gates → durable promote → best-effort audit).

SPEC-DRAFT-QMS72 DONE /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-15_1930-QMS7-2-seed-cow-spec-draft-l1t1920.md

<tool_call>
<function=terminal>

---

## ORCHESTRATOR RULINGS (l1t0050, 2026-10-16) — this section PROMOTES the draft; it supersedes the OQ open-questions

All load-bearing cites re-verified first-hand by the orchestrator at tip 71412415 (updateUnlocked
findRecordPath-only :639-645; listSeedRecords suppression :349-350; getSeedRecord commitSha:'seed'
no contentSha :230-241; get() seed fallback :246-250; deleteUnlocked same asymmetry :806-812;
IndexManager entries.has suppression ~:246-247; token() at server/src/revisions/RecordRevisionService.ts:37
(NOT governance/ — the draft's path is imprecise, the line is right); audit-event action pattern
schema/governance/audit-event.schema.yaml:34-36 no enum; handler store.get 404-check :788; expectedSha/
token(existing) call site :1011-1018; generic 400 :1050; lifecycle_transition audit precedent :1101-1112).
Live probes confirmed first-hand: GET EQC-QUANTSTUDIO5 -> meta.path = seed path, commitSha='seed',
contentSha absent; seed sha256 = 9163d1a3b97c791154fa3c0760e84793d26027255fa65c117ebbdfac74e974cf.

- OQ1 RULED: option (a). delete() stays seed-refused; improve the store error message in
  deleteUnlocked ONLY to something like `resolves from seed; seed records cannot be deleted`
  (generic, no kind names, no behavior change). Archive semantics belong to QMS7-4/6.
- OQ2 RULED: handler-side audit append on result.promotion, action name 'seed_record_promoted',
  following the lifecycle_transition pattern (real actor, best-effort, after durability).
  RecordHandlers.ts (updateRecord success path only) is ADDED to the file-ownership IN list.
- OQ3 RULED: former option. Accept expectedSha === 'seed' as matching the seed fingerprint in the
  promotion path; do NOT start stamping meta.contentSha on seed reads.
- OQ4 RULED: leave create-shadowing as-is; recorded for QMS7-5 (Create button must collide-check
  seed ids). Out of scope here.
- Status-code re-wording ACCEPTED: RED tests pin the error STRING 'Record not found: <id>' and the
  store-level refusal, not HTTP status; the refusal is 400 at tip.

Coder deliverable paths: report /home/brad/.hermes/cl/lanes/1/qms7-2-report-l1t0050.md; worktree
/mnt/vast/home/brad/git/wt/QMS7-2-lane1-l1t0050; branch wt/QMS7-2-lane1-l1t0050.
