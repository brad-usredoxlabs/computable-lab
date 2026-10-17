# SPEC DRAFT — OWN-5: OwnershipPolicyService — pure resolver with origin traces
Lane 1 · wave-3 lab-ownership-and-sharing-policy · composer l1t0330 · drafted 2026-10-11
Status: PROMOTED by orchestrator 2026-10-11T0520 — dispatchable. Orchestrator adjudications
of the composer's open questions are at the bottom ("ORCHESTRATOR ADJUDICATIONS").
Grounded first-hand (composer, no scout intermediary) at trunk `cl/integration-1` @
`a6e3c4c02b97080195e7cae9d21d3024f23dfbe5` (= a6e3c4c0, EDITOR-9 merge). Every path:line was
read at that SHA. Re-anchor at dispatch HEAD.

## Goal (one sentence)
Build `OwnershipPolicyService` — a pure, explainable resolver that reads
`ownership-policy` documents from a RecordStore and answers "owner / visibility / filedTo /
grants / shareTargets for this kind, and WHY (origin trace)" — RED-first against the 8 §T5
tests, plus the verbatim `MemoryRecordStore` extraction and an exported `Visibility` type.

## Item + deps
- Task-list block: `~/.hermes/cl/lanes/1/task-list.md` id OWN-5 (~line 2556). Deps: **none** —
  dispatchable any time; touches no schema YAML, so it can run parallel-safe against
  OWN-1/OWN-2/OWN-3 surfaces (file sets are disjoint).
- Plan of record §T5
  (`.hermes/plans/2026-10-10_192635-lab-ownership-and-sharing-policy.md:523-814`) is
  verbatim-authoritative: the test file (lines 531-617) and the service implementation
  (lines 627-798) are given as complete code blocks. **Transcribe them character-for-character
  (comments included), RED test first, then the implementation** — do not re-author them from
  this spec's summaries. Binding decisions D1-D13 apply; D11/D12 verbatim below.
  ONE known type-seam in the plan's verbatim impl — see "Type seam" and reviewer bait #1;
  adjudicate BEFORE dispatch (open question 1).

## Files
IN scope:
- `server/src/test-support/MemoryRecordStore.ts` (new dir + file; verbatim extraction)
- `server/src/security/OwnershipPolicyService.test.ts` (new; plan §T5 test block, RED first)
- `server/src/security/OwnershipPolicyService.ts` (new; plan §T5 impl block)
- `server/src/security/AccessControlService.ts` — **export-ONLY edit** (add
  `export type Visibility = 'private' | 'shared' | 'public';` and change the inline union in
  `AccessPolicyRecord` to use it; plan :806-811). Zero behaviour, zero other lines.
OUT of scope (do NOT touch): `AuthorizationService.ts` (its constructor at :93 stays
  `constructor(private readonly store: RecordStore) {}` — **OWN-5 does NOT wire the service
  into anything**; wiring is OWN-7's, gated on server.ts), `server.ts`, `IdentityHandlers.ts`,
  `LocalAuthorization.test.ts` (the task list is explicit: "do NOT rewrite the existing test —
  avoid churn"; the class is COPIED verbatim, the original keeps its private copy),
  `AccessControlService.test.ts`, all schema YAML, `app/`, `client.ts`.
  `server/src/policy/**` is read-only reference (origin-trace idiom), not an edit target.

## Lane-verified anchors (composer read first-hand @ a6e3c4c0)
1. **The extraction source is exactly `server/src/security/LocalAuthorization.test.ts:17-77`**
   (verified: :17 opens `class MemoryRecordStore implements RecordStore {`, :77 closes it;
   :78 blank, :79 starts `function user(...)` — do not copy that). It is self-contained: its
   only imports are the type block at :3-12 (`RecordEnvelope` from
   `'../types/RecordEnvelope.js'`; `CreateRecordOptions, DeleteRecordOptions, GetRecordOptions,
   RecordFilter, RecordStore, StoreResult, UpdateRecordOptions` from `'../store/types.js'`) —
   identical relative paths work unchanged from `server/src/test-support/`. It exports nothing
   today (file-local class); the extracted file exports it as `export class MemoryRecordStore`
   (+ nothing else). Members: `records` Map, ctor(records=[]), get, getByPath, getWithValidation,
   list (kind/schemaId/idPrefix/offset/limit filters), create, update, delete, validate, lint,
   exists. It typechecks today (the file is absent from trunk's tsc error set, anchor 6), so a
   verbatim copy typechecks in test-support.
2. **No `server/src/test-support/` exists yet** (verified) — create it. House precedent for
   committed test helpers exists (`server/src/compiler/protocol/localProtocolSchema.fixtures.ts`);
   the plan mandates the `test-support/` path — use it. vitest collection is
   `src/**/*.test.ts` (vitest.config.ts), so a non-`.test.ts` helper is never a spec.
3. **Origin-trace pattern to mirror** (task list: "the PolicyProfileService origin-trace
   pattern, policy/types.ts:9 scope order"): `server/src/policy/types.ts:9`
   `export const POLICY_SCOPE_ORDER = ['organization', 'lab', 'project', 'run'] as const;`
   (:11 derives `PolicyScope`); `PolicyProfileService.ts:38` ranks scopes by
   `POLICY_SCOPE_ORDER.indexOf`, :259 walks the order; answers carry an origin object
   (`PolicySettingOrigin` types.ts:66, attached into `origins` :85, surfaced on
   `PolicyActionDecision.origin` :110, and cited in prose at PolicyProfileService.ts:244
   `... is ${disposition} by ${origin.profileId}`). §T5's
   `origin: { policyRecordId, source: 'kind' | 'fallback' }` is this idiom in the ownership
   domain; **v1 resolves lab scope only** (activeLabPolicy: lab-scope doc first, else first
   doc, else null — plan :760-767). Do not import policy/types.ts into the service — mirror
   the shape, no cross-domain coupling (the plan's verbatim impl imports only
   `../store/types.js` and `./AccessControlService.js`).
4. **Visibility today is an inline union, NOT a named export**: `AccessControlService.ts:10-16`
   `AccessPolicyRecord` with `visibility: 'private' | 'shared' | 'public'` inline at :13;
   grep confirms no `Visibility` type exists anywhere in `server/src` — the new export cannot
   collide. `AccessGrant` (:4-8) is `principalType: 'user' | 'group'` — **'project' is NOT
   there yet** (that enum/type widening is OWN-6's surface).
5. **AuthorizationService stays untouched**: `AuthorizationService.ts:93`
   `constructor(private readonly store: RecordStore) {}`. No OwnershipPolicyService param, no
   ensureOwnerPolicy change, no server.ts construction — that is OWN-7
   (task-list OWN-7: ctor param + server.ts:495 wiring, gated on QMS-8 merge; QMS-8 has since
   merged at 25f74aaa but the WIRING is still OWN-7's item, not yours).
6. **Trunk typecheck is NOT clean** (composer l1t0330 measured first-hand at a6e3c4c0):
   `npm run typecheck -w server` fails; `cd server && npx tsc --noEmit` prints exactly
   **45 `error TS` lines across 13 files** (AgentOrchestrator, ProtocolIntakeHandlers,
   RecordHandlers, drafts/{adapters,FormDraftService,StagingStore}, lint/AuthoringGuard,
   revisions/{ProtocolUseService,RecordRevisionService}, scripts/bootstrapAdmin,
   sequences/{oligoOrder,SequenceService}, store/RecordStoreImpl). None in
   `src/security/**`. Task-list OWN-5's `verified by: npm run typecheck -w server clean`
   is NOT achievable against trunk — the honest done-gate is **zero NEW error lines** vs your
   base capture (see Acceptance). Do not claim "clean" or "exit 0" for trunk; report the diff.
7. `exactOptionalPropertyTypes` is ON (`server/tsconfig.json:13`). The plan's impl already
   respects it (`...(publishRole !== undefined ? { publishRole } : {})`, plan :727) — keep it
   verbatim; never write `publishRole: undefined`.
8. Envelope shape used by the test's `docEnv()`: `RecordEnvelope` requires `recordId`,
   `schemaId`, `payload` (`server/src/types/RecordEnvelope.ts:39-51`); `meta` optional. Both
   import paths in the plan's test/impl resolve: `store/types.ts:17` re-exports
   `RecordEnvelope` for the impl's `'../store/types.js'` import.

## The 8 §T5 tests — the worker's RED-first contract (verbatim list, plan :560-616)
RED first: write ONLY the test file (plan block verbatim), run it, capture the
module-not-found/all-fail output in the report, THEN add test-support + impl + Visibility.
1. `resolves a kind rule with its origin` — ruleFor('instrument') -> owner 'lab',
   visibility 'public', `origin` EXACTLY `{ policyRecordId: 'OWN-LAB-DEFAULT', source: 'kind' }`.
2. `falls back for an unlisted kind` — ruleFor('claim') -> visibility 'private',
   `origin.source === 'fallback'`.
3. `resolves create defaults: lab-owned kinds use the lab owner user` —
   defaultsForCreate({kind:'instrument', creatorUserId:'USR-BRAD'}) -> ownerUserId
   'USR-LOCAL-ADMIN' (docOwnerUserId from the document, NOT the caller), visibility 'public'.
4. `resolves create defaults: creator-owned kinds file into the active project` —
   local-protocol -> ownerUserId 'USR-BRAD', filedTo 'active-project'.
5. `returns null when no document is installed (no declared defaults)` — empty store ->
   ruleFor('protocol') null AND defaultsForCreate(...) null (never invent defaults).
6. `carries the declared default grants (multi-user: the lab admin group)` — **D12 verbatim**:
   "Lab-owned must not mean one person owns everything shared... a lab-owned kind also stamps
   `defaultGrants` declared on the rule (e.g. the lab's admin group with role `admin`)...
   A grant naming a group that does not exist is inert (never fabricated)." — defaults.grants
   EXACTLY `[{ principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' }]`.
7. `evaluates creator-owned defaults PER USER — two authors get two private records` —
   **D11 verbatim**: "Defaults are evaluated PER CREATING USER. `owner: creator` means the
   specific session user, so two scientists creating the same kind get two separate private
   records, each owned by its author." — USR-A/USR-B each own their own record; both
   `grants` are `[]`.
8. `reports the allowed share targets for a kind` — shareTargetsFor('instrument') ->
   `['user', 'group', 'lab']` (declaration order preserved).
Malformed-declaration behaviour (dropped, never guessed) is enforced structurally by
`coerceGrant`/`coerceKindRule` returning null (plan :701-729) and is exercised through tests
5's null-path discipline; do not add tests beyond the 8 without orchestrator say-so.

## The TYPE SEAM (adjudicate before/at dispatch — do not silently improvise)
The plan's verbatim `coerceGrant` (:702-711) accepts `principalType` user|group|**project**,
but trunk `AccessGrant.principalType` is `'user' | 'group'` only (anchor 4), so
`return { principalType, ... }` as `AccessGrant` is a TS2322 at implementation time.
Options: (a) narrow the guard to `'user' | 'group'` in OWN-5 (no §T5 test exercises a project
grant; OWN-6 widens the union as its own declared surface), or (b) widen `AccessGrant` now —
which lands on OWN-6's file surface beyond "export only" and pre-empts its diff.
Composer recommendation: (a) with a one-line comment `// 'project' principal lands with OWN-6`
— a 2-line deviation from the plan block, flagged in the report as AS-OWN5-* and here. If the
orchestrator picks (b), the "export-only" boundary must be re-scoped explicitly in this spec
before dispatch. Escalation is NOT needed for anything else in the block.

## Baselines (recapture at YOUR base; never claim trunk is green)
- Typecheck base capture (the load-bearing one):
  `cd server && npx tsc --noEmit 2>&1 | grep 'error TS' | sort > /tmp/own5-tsc-base.txt && wc -l /tmp/own5-tsc-base.txt`
  (expect 45-class drift around composer's a6e3c4c0 figure — record YOUR number; none of the
  existing lines may be in `src/security/OwnershipPolicyService*` / `src/test-support/` after
  your change, and the post-change diff vs base must be EMPTY).
- Security-suite base capture (fail-FILE SET, not bare counts):
  `npm run test:run -w server -- src/security/ 2>&1 | tail -30` — recapture the failing-file
  set at base; done criterion = same set post-change (LocalAuthorization.test.ts and
  AccessControlService.test.ts must remain green — your export edit is type-only).
- `src/schema/` is NOT green on trunk and stays irrelevant to your files: composer l1t0130
  measured 2 failed files / 5 failing tests (EventGraphEquipmentSchema,
  LabwarePhysicalGeometryData) + 278 pass pre-merge. You add no schema file — do not run or
  claim anything about that directory; no false "exit 0" claims anywhere.
- `src/validation/` 42/42 exit 0 was the last measured state — not your surface, not required.

## First targeted check (proves the approach early)
```bash
sed -n '17,77p' server/src/security/LocalAuthorization.test.ts | head -3
grep -n "type Visibility" server/src/security/AccessControlService.ts   # -> no match (pre-state)
```
The sed must show `class MemoryRecordStore implements RecordStore {` and the grep must be
empty — both confirm your base matches this spec's grounding. Then write the RED test and run
it: `npm run test:run -w server -- src/security/OwnershipPolicyService.test.ts` must FAIL with
module-not-found (capture verbatim). That failure is the first targeted proof.

## Acceptance checks (real commands; capture verbatim tails in the report)
```bash
npm run test:run -w server -- src/security/OwnershipPolicyService.test.ts
#   -> RED first (module-not-found), then: 8 passed, exit 0
npm run test:run -w server -- src/security/ 2>&1 | tail -30
#   -> fail-file set IDENTICAL to your base capture; LocalAuthorization + AccessControlService green
cd server && npx tsc --noEmit 2>&1 | grep 'error TS' | sort > /tmp/own5-tsc-after.txt
diff /tmp/own5-tsc-base.txt /tmp/own5-tsc-after.txt   # -> EMPTY (zero new errors; trunk 45-class stands)
git -c core.fileMode=false diff --stat                # -> exactly 4 paths (3 new + AccessControlService.ts)
git -c core.fileMode=false diff server/src/security/AccessControlService.ts
#   -> ONLY the Visibility type + :13 usage change; AccessGrant untouched (unless the orchestrator
#      ratified the type-seam option (b) above)
```
Task-list `verified by` verbatim: "npm run test:run -w server --
src/security/OwnershipPolicyService.test.ts -> 8 passed; npm run typecheck -w server clean."
— "clean" is re-scoped by this spec to "zero new error lines vs base" (anchor 6); state the
distinction in the report, do not paper over it.

## Worker contract
- Branch off lane trunk `cl/integration-1` (dispatch-time HEAD, ≥ a6e3c4c0):
  `wt/OWN-5-lane1-l1t<dispatch-id>`. Orchestrator creates the worktree; never branch/merge
  trunk yourself. ALWAYS `git -c core.fileMode=false ...` (NFS mode-bit noise). Never
  `git add -A` — stage exactly the four paths above.
- Commits: RED commit optional; GREEN commit message (plan §T5 :814):
  `feat(server): OwnershipPolicyService resolves declared ownership defaults`.
- Report: write ONLY `<REPORT_PATH>` (placeholder — orchestrator substitutes the unique path,
  pattern `/home/brad/.hermes/cl/lanes/1/own5-report-l1t<dispatch-id>.wip.md`). Every command
  with VERBATIM output (adversarial review re-runs them; paraphrase = defect). RED evidence,
  baseline captures, the type-seam option you were given and how it landed, assumptions
  AS-OWN5-*. End marker exactly: `OWN5 CODER DONE <head-sha>`. Blocked: `BLOCKED <reason>`,
  preserve work committed.
- NO lane-stack restart (orchestrator owns restarts; none needed — no YAML, no server.ts).
  NO curl against :3092/:3001/:5174/:3093/:5193/:5192. No dev-server interaction of any kind.
- Stop boundary: any need beyond the four paths — e.g. touching AuthorizationService,
  widening the ACL evaluator, changing canAccess's shape, discovering a platform gap in how
  records/lists are read by a pure resolver — is a NEW platform gap: STOP, preserve, report
  `BLOCKED requires-rescope <reason>`; the architect decides.

## Reviewer bait (pre-empt these; each is a real trap on this item)
1. **The type seam** (`coerceGrant` project-principal vs trunk `AccessGrant` at
   AccessControlService.ts:5): must land as the orchestrator ratified (see TYPE SEAM
   section), with the deviation/decision visible in the report — silently mangling the
   verbatim block either way is a defect.
2. **Export-only drift** on AccessControlService.ts: any change to AccessGrant, ROLE_ACTIONS,
   canAccess, or GroupRecord is out-of-scope surgery (OWN-6/OWN-7 surface). `git diff` that
   file is part of acceptance.
3. **Staking out the extraction**: the MemoryRecordStore copy must be VERBATIM :17-77
   (diff it: `diff <(sed -n '17,77p' server/src/security/LocalAuthorization.test.ts) <(sed -n
   '<impl-offset-lines>' server/src/test-support/MemoryRecordStore.ts)` modulo the `export`
   keyword and import placement). "Rewriting the existing test to use it" is forbidden churn.
4. **exactOptionalPropertyTypes sites** (tsconfig :13): `publishRole` uses the conditional
   spread (plan :727) — never `x: undefined`; same discipline in any payload you touch.
5. **Origin traces are EXACT** — `{ policyRecordId, source }` compared with `toEqual`;
   adding fields (scope, revision, kind) breaks tests 1/2 and violates the plan's shape.
6. **Purity boundary**: the service READS ONLY (`store.list({kind, limit})`) and decides
   nothing; malformed entries are DROPPED (coerce* -> null), never repaired, never guessed;
   no document -> `null`, never a fabricated default (test 5 is the pin). A reviewer will grep
   for `new Date`, `random`, `.push(` onto policy data, and hardcoded 'private' fallbacks —
   none may exist in the service.
7. **D11/D12 shape claims**: test 6 must compare grants with `toEqual` on the FULL object
   (verbatim group grant), and test 7 must show two DISTINCT owners and empty grants for both
   — a shared-owner or non-empty creator-private grants implementation fails these by
   construction; that is the point, do not "helpfully" grant anything.
8. **False green claims**: typecheck is NOT clean on trunk (45-line baseline at a6e3c4c0,
   measured) — the report's command must show the diff, not an aspirational "clean".
9. **No wiring**: anything that makes a running server behave differently (server.ts,
   AuthorizationService, ensureOwnerPolicy) is OWN-7 — a reviewer finding it in this diff is
   a scope defect even if the tests still pass.

## Open questions for orchestrator (max 3)
1. **Type seam ruling** (TYPE SEAM section): approve (a) narrow coerceGrant to user|group with
   an OWN-6 comment, (b) widen AccessGrant.principalType now (re-scoping the "export only"
   boundary), or a small plan-errata patch to §T5 before dispatch. Checked first-hand:
   AccessControlService.ts:5 lacks 'project'; plan :705 includes it; no §T5 test exercises a
   project grant; OWN-6 owns that widening per its task block.
2. **"typecheck clean" adjudication**: task-list `verified by` says clean; trunk typecheck has
   45 pre-existing error lines across 13 files at a6e3c4c0 (composer-measured). I pinned
   zero-NEW-error-lines as the done-gate — confirm, or tell me to point OWN-5 at a trunk where
   you intend to have cleared those 13 files first.
3. **MemoryRecordStore location**: `server/src/test-support/` is new convention (no such dir
   on trunk; nearest idiom is co-located `.fixtures.ts`). Plan §T5 mandates the path — confirm
   you want the directory introduced here (later OWN items reuse it), vs co-locating as
   `server/src/security/MemoryRecordStore.test-support.ts`. Checked: vitest include
   `src/**/*.test.ts` won't collect either form; tsc includes both.

## ORCHESTRATOR ADJUDICATIONS (2026-10-11T0520, binding for the worker)
1. TYPE SEAM: option (a) APPROVED — narrow the coerceGrant principalType guard to
   'user' | 'group' with the one-line comment `// 'project' principal lands with OWN-6`.
   Widening AccessGrant now (option b) would breach OWN-6's declared file surface; no §T5 test
   exercises a project grant. Record as AS-OWN5-001.
2. Typecheck: zero-NEW-error-lines vs base capture is the done-gate (same ruling as
   AS-ORCH-L1-028 / EDITOR-1 / EDITOR-2). "Clean" is re-scoped as this spec states; report the
   diff, never an aspirational exit-0.
3. test-support/: server/src/test-support/ APPROVED — the plan mandates the path and later
   OWN items reuse it.
