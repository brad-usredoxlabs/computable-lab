# SPEC DRAFT — OWN-12: Share dialog policy-driven presets (whole lab / project members / private to me)

Campaign: lab-ownership-and-sharing-policy, wave 3. Canonical plan §T12:
`.hermes/plans/2026-10-10_192635-lab-ownership-and-sharing-policy.md` (§T12, lines 1401-1421;
D9 at line 69, D10 at line 70). Task: OWN-12, lane 1 task-list. Deps: OWN-6, OWN-9 — **BOTH
MERGED** (ancestors of trunk). Dispatch gate QMS-8 (client.ts) — SATISFIED.

BASE: trunk `cl/integration-1` @ **bc6685ce** (handoff 2026-10-12T1145: older anchors from the
3c27e218 era are stale). Every path:line below was re-anchored by the composer FIRST-HAND at
bc6685ce in `/mnt/vast/home/brad/git/cl-integration-1` (read-only + tmp test dirs; nothing under
git modified). Scout was NOT used: every load-bearing fact was verified directly with
read_file/search_files/live runs, per the OWN-10 spec precedent. The §T12 snippets are design
intent, **not drop-in code** — two plan-vs-trunk gaps are called out below (§T12 assumes an
`apiClient.getOwnershipPolicy()` that does NOT exist on trunk today — see OQ1; and "drop
lab-style grants" has no `lab` principalType to drop — see Preset semantics).

## Goal (one sentence)

Give the share dialog one preset row — **Share with whole lab** / **Share with project members**
/ **Private to me** — restricted to the share targets the ownership-policy document allows for
the record's kind (all three + a visible "policy unavailable — showing all targets" note on
fetch failure), where project-members adds the single D10 project grant
`{principalType:'project', principalId:<active studyId>, role:'editor'}` and the Add-principal
select gains a Project option labeled with the active project's title.

## Files IN scope

1. EDIT `app/src/shared/sharing/ShareRecordDialog.tsx` (269 lines at bc6685ce) — the task-list file.
2. NEW `app/src/shared/sharing/ShareRecordDialog.test.tsx` — task-list's "(+ test if present)"
   clause: NO dialog test exists today (`ls app/src/shared/sharing/` = policyRoots.ts,
   ShareRecordDialog.tsx, useRecordVisibility.test.tsx, useRecordVisibility.ts,
   VisibilityBadge.tsx), and §T12's RED-first test plan below requires one; this lane treats
   "if present" as "make it, mirroring the closest pattern" (OWN-11/§T11 set the precedent at
   plan line 1386: "mirror `app/src/shared/sharing/useRecordVisibility.test.tsx`").
3. **CONDITIONAL / FLAGGED** `app/src/shared/api/client.ts` — see OQ1. Trunk today has NO
   `getOwnershipPolicy` on apiClient (`grep -n getOwnershipPolicy app/src/shared/api/client.ts`
   = 0 hits; the OWN-9 merge shipped only the SERVER pair). If OWN-11 (dispatched l1t1145, coder
   queued) has merged its client pair by dispatch time, REUSE it and this file drops out of scope
   (2-file diff). If absent, ADD exactly:
   ```ts
   async getOwnershipPolicy(): Promise<{ record: RecordEnvelope | null; resolved: unknown }> {
     return request<{ record: RecordEnvelope | null; resolved: unknown }>('/settings/ownership-policy')
   },
   ```
   next to `getLabSettings` (client.ts:2914), per §T11 (plan line 1373). A diff that touches ANY
   other client.ts area, or that duplicates an existing `getOwnershipPolicy`, is a finding.
   **A 4th file beyond these three = reject** (browser-gate evidence lives outside the worktree).

## Explicitly OUT of scope

- ALL server files. The endpoints already exist: `GET/PUT /settings/ownership-policy` are
  registered at `server/src/api/routes.ts:602-603`; `GET/PUT /records/:id/access-policy` at
  `routes.ts:276-277`. No schema/YAML changes ship with this item (TS-only → no lane-stack restart).
- `app/src/shared/shell/activeProject.ts` — reuse as-is (exact export below), do not edit.
- `app/src/shared/sharing/useRecordVisibility.ts`, `VisibilityBadge.tsx`, `policyRoots.ts`.
- Callers of the dialog — `app/src/editor/RecordViewer.tsx:10,136`,
  `app/src/browser/DetailPane.tsx:19,178`,
  `app/src/event-editor/projects/WorkspaceShareButton.tsx:3,9,28`. The dialog signature
  `{recordId, onClose}` (ShareRecordDialog.tsx:29-32) does NOT change; no caller diff is allowed.
- The `PUT /settings/ownership-policy` write path, the AI tools (OWN-10), Settings UI (OWN-11).
- No knowledge-layer involvement (claim/context/assertion/evidence surfaces untouched), so
  `docs/knowledge-layer-canonical-example.md` is NOT binding here.

## Acceptance criteria (verbatim from the task list)

> verified by >
>   npm run test:unit -w app clean. BROWSER RECEIPT on :5192: share a protocol with project
>   members, grant renders as a project principal, then curl GET /api/records/<id>/access-policy
>   proves visibility+grants persisted (read-back, not screenshot-only). Acceptance 8 (share half).

And the description, verbatim:

> ShareRecordDialog.tsx preset row driven by getOwnershipPolicy: whole lab -> visibility public;
> project members -> append grant {project, <studyId>, editor} using the existing
> activeProjectFromTabs helper (app/src/shared/shell/activeProject.ts), button disabled without
> an active project or links.studyId; private to me -> visibility private, drop project/lab-style
> grants, keep explicit user/group grants. RENDER ONLY the targets the document allows for the
> kind (shareTargetsFor); on fetch failure show all three WITH the visible note "policy
> unavailable — showing all targets" (never hide capability because config is missing). Add-
> principal select gains Project only when allowed; option label = active project's title.

Aggregate acceptance 8 share-half (plan line 1472): "share dialog offers lab / project-members /
private per the document (manual, with the observed values quoted)".

**VERIFICATION-REALITY FLAG (read before quoting "clean"):** at bc6685ce the app workspace is
NOT clean at baseline — measured first-hand below. "npm run test:unit -w app clean" is the
lane's *zero-new-failures* gate, not a literal green suite at this SHA. The scoped commands in
"Full verification" are the operative gate; the browser receipt is orchestrator-owned post-merge.

## Recon — re-verified anchors at bc6685ce (all first-hand)

### R1. ShareRecordDialog.tsx today (`app/src/shared/sharing/ShareRecordDialog.tsx`)

- Props `{recordId, onClose}` :29-32. Load :49-69 — `Promise.all([getAccessPolicy, listUsers,
  listGroups])` :53-57; working copy seeded from `p.direct ?? p.effective` :61-63.
- `editable = Boolean(policy?.isPolicyRoot && policy?.canAdmin)` :83.
- State: `visibility` :43, `grants: AccessGrant[]` :44, add-row draft `newType: 'user'|'group'`
  :45, `newPrincipal` :46, `newRole` :47.
- `principalLabel(g)` :85-95 — user → users lookup, **else group lookup** (a `project` grant
  today renders the raw principalId under a 👤 icon; grant icon line :181 is
  `g.principalType === 'group' ? '👥' : '👤'`). MUST be extended for project principals (R6).
- `addGrant` :97-102 (dedup on type+principalId+role), `removeGrant` :104.
- Save :106-117: `apiClient.putAccessPolicy(recordId, { visibility, grants })` :110 then `load()`
  :111. Presets mutate the SAME local working copy; Save stays the only write path. **No payload
  shape change** — `putAccessPolicy` body is `{visibility, grants}` verbatim (client.ts:1978-1986).
- Visibility select :164-166 (`VISIBILITIES` :22 = private|shared|public); grants list :173-190;
  Add row :192-211: type select :194-197 (User/Group), principal select :198-205, role select
  :206-208, Add button :209 (`disabled={!newPrincipal}`).
- **Inline-note precedent (failure-mode UX, R7):** `className="share-dialog__note"` paragraph
  block :145-154 (managed/inherited/no-permission/not-shared notes), styled :254. The policy note
  follows this exact pattern — visible, inline, non-blocking, no dead chrome. The component's
  existing fetch-failure behavior is a hard error `<p class="share-dialog__error">` :139-140 that
  replaces the body; the policy fetch must NOT reuse that path (policy failure degrades, it does
  not block).
- No test file for the dialog exists (see Files IN scope #2).

### R2. getOwnershipPolicy / shareTargetsFor — what exists TODAY

- **Client: absent.** `grep -in "ownership" app/src/shared/api/client.ts` = 0 real hits. The
  server route exists and is ungated for GET. This is the OQ1 gap.
- **Server GET** (`server/src/api/handlers/OwnershipPolicyHandlers.ts`): registered
  `routes.ts:602`. Response shape DEV-1: `:79` `{record:null, resolved:null, defaults:null}` when
  no record; `:85` `{ record, resolved: doc ?? coerceOwnershipPolicy(record) }`. GET is ungated
  (OQ2 adjudication, file header :14-16) — safe for the dialog to call pre-login.
- **`OwnershipPolicyDoc`** (`server/src/security/OwnershipPolicyService.ts:41-47`):
  `{recordId, scope, labOwnerUserId, fallback: KindRule, kindRules: Record<string, KindRule>}` —
  **kindRules is a KEYED MAP** (coercion at :115-120), not the array form the schema YAML stores.
  `KindRule.shareTargets: ShareTarget[]` :26; `ShareTarget = 'user'|'group'|'project'|'lab'` :18.
- **`shareTargetsFor(kind)`** exists ONLY server-side (`OwnershipPolicyService.ts:167-170`;
  `null` = nothing declared → "UI falls back to all", comment :166). **There is no client-side
  equivalent or client-side type** — the dialog computes it locally:
  `resolved.kindRules[kind]?.shareTargets ?? resolved.fallback.shareTargets ?? null`
  (mirroring `ruleFor` :144-150 exactly: kind rule first, fallback second, null = treat as all).
  Mirror this in a typed local interface in the dialog (or in client.ts if OQ1's add lands):
  ```ts
  interface OwnershipPolicyResolved {
    kindRules: Record<string, { shareTargets?: string[] }>
    fallback?: { shareTargets?: string[] }
  }
  ```
  Do NOT hardcode any kind list or share-target default in TS — the document is the authority (D9).
- Kind source for the lookup: `AccessPolicyResponse.kind: string | null`
  (client.ts:1911-1920, field :1913; server fills `kind ?? null`,
  `IdentityHandlers.ts:306-307` `const kind = kindOf(record)` + response `kind: kind ?? null`).
  The dialog ALREADY has the kind from its first fetch — no extra call needed. If `kind === null`,
  treat as policy-unavailable (show all three + note).
- Lane seed for smoke intuition (`records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml`):
  fallback shareTargets `[user, group, project, lab]` :21; `local-protocol` :24-29
  `[project, lab, user, group]`; `protocol` :30-35 `[lab, project, user, group]`. So on a boot-fresh
  lane all three presets are legal for protocols — the browser receipt cannot rely on a
  *disabled-by-policy* case; that is unit-test territory.

### R3. activeProjectFromTabs + links.studyId

- `app/src/shared/shell/activeProject.ts:24-51` — `export function activeProjectFromTabs(state:
  OpenTabsState | null | undefined): ActiveProject | null`; `ActiveProject = { studyId: string;
  title: string }` :19-22. Resolution: active tab → most-recently-visited project tab → last open
  project tab (:10-15 comment). **studyId IS the STU-* record id; title is the tab title**
  (already exercised: `activeProject.test.ts:52` asserts `{studyId:'STU-2', title:'Second'}`).
- Consumer pattern to copy (`app/src/shared/shell/SurfaceIndicator.tsx:58-60`):
  `const openTabs = useOptionalOpenTabs()` (export at OpenTabsContext.tsx:627, null-safe outside
  a provider) + `useMemo(() => activeProjectFromTabs(openTabs?.state), [openTabs?.state])`.
  useOptionalOpenTabs is REQUIRED (the dialog renders in standalone routes too — that's why the
  hook exists, OpenTabsContext.tsx:624-626 comment).
- **The dialog does not currently know the record's `links.studyId`** — it only receives
  `recordId`. Add ONE best-effort fetch inside `load()`'s existing Promise.all slot:
  `apiClient.getRecord(recordId)` (client.ts:2230-2233 → `record.payload.links?.studyId`, cast
  `payload.links as { studyId?: string } | undefined` — the same cast precedent as
  `app/src/event-editor/right-pane/protocol/ProtocolSelector.tsx:76`). Wrap it so its failure
  yields `undefined` WITHOUT failing the whole load (a failing record fetch must not blank the
  policy UI; treat missing studyId = preset disabled, which is also the correct UX for the
  SELF_MANAGING 404 edge). No `links.studyId` fields exist on AccessPolicyResponse — do not invent them.

### R4. The project principal is server-legal (OWN-6 merged) — the preset payload is provably well-formed

- Wire enum: `schema/identity/access-policy.schema.yaml:52-58` —
  `principalType enum: [ user, group, project ]` with the membership description
  ("project = members of the project (study) named by principalId (STU-*)").
- Evaluator: `server/src/security/AccessControlService.ts:4`
  `AccessPrincipalType = 'user'|'group'|'project'`; project branch :73-76; membership =
  `principalIsMember` :93-101 (owner, public study, user/group grant incl. nested; project
  principals deliberately do NOT chain :99).
- PUT hardening (`IdentityHandlers.ts` `putAccessPolicy` :330+): `sanitizeGrants` :117-132 admits
  project grants (:126) and **rejects 400 any principalId not starting `STU-`** :342-350. The
  client-side `AccessGrant` type already includes `'project'`
  (`app/src/shared/api/client.ts:1898-1902`). D10: exactly ONE project grant, never enumerated
  member grants — the preset adds at most one and `addGrant`-style dedup applies (see P2).

### R5. Save path + the curl read-back (browser gate mechanics, orchestrator-owned post-merge)

- Save: `apiClient.putAccessPolicy` (client.ts:1978-1986) → `PUT /api/records/:id/access-policy`
  (`routes.ts:277` → `IdentityHandlers.putAccessPolicy` :330). Body on the wire for the
  project-members preset: `{"visibility":"shared","grants":[...existing..., {"principalType":"project","principalId":"STU-x","role":"editor"}]}`
  (visibility is whatever the working copy holds — the preset does NOT change visibility; the
  dialog's current select stays the visibility control). Server writes it onto the record's ACL
  envelope `payload.grants` verbatim (:368-390) after `admin` canAccess (:360-365).
- Read-back: `GET /api/records/<id>/access-policy` (`routes.ts:276` →
  `IdentityHandlers.getAccessPolicy` :295-325) returns
  `{recordId, kind, isPolicyRoot, canAdmin, canWrite, direct, effective, inherited}` where
  `direct/effective.grants` are sanitized grants (`aclFromEnvelope` → sanitizeGrants :113).
  The gate curl therefore asserts `direct.grants` contains
  `{"principalType":"project","principalId":"STU-x","role":"editor"}` (and for whole-lab /
  private presets, the expected `visibility`). Lane stack: :5192 UI / :3092 API — curl with the
  lane's identity header (`x-user-id`, per client.ts request() :1401-1404) as the orch runbook
  dictates; this item ships NO YAML so no restart is owed for the TS itself.

### R6. What renders a project grant as a "project principal" (browser receipt depends on it)

Today `principalLabel` :85-95 sends every non-user grant down the group lookup → a project grant
would show the raw `STU-…` id under 👤. The receipt says "grant renders as a project principal",
so the dialog MUST: (a) extend `principalLabel`: `g.principalType === 'project'` →
`activeProject?.title === g.principalId ? title : (study record title if already loaded else
principalId)` — simplest correct rule: label = activeProject.title when studyId matches, else the
principalId; (b) icon :181 → distinct for project (e.g. 🗂, keep 👥/👤 semantics); (c) the grant
`li` key :180 already includes principalType — fine.

### R7. Baselines — REAL measured values at bc6685ce (this composer, live runs)

- `npm run typecheck -w app` → **FAILS, 23 `error TS` lines** (measured twice; `npx tsc --noEmit |
  grep -c 'error TS'` = 23). Distribution: `shared/hooks` 6, `event-editor/right-pane` 4,
  `event-editor/viewer` 3, `event-editor/editorHistory.test.ts` 2, `event-editor/deck` 2,
  one each: shared/context, ingestion/protocol-review, ingestion/components, event-editor/topbar,
  event-editor/focus, event-editor/EventEditorContext.tsx. **ZERO errors in
  `app/src/shared/sharing/` or `app/src/shared/api/client.ts`.** (`exactOptionalPropertyTypes` is
  NOT enabled in `app/tsconfig.json` — strict + noUnusedLocals/Parameters are. Server is
  separately at tsc 0 per the 1145 handoff; untouched here.)
- `npm run test:unit -w app` → **FAILS at baseline**: run 1 = Test Files 59 failed | 279 passed
  (338), Tests 65 failed | 2212 passed (2277); run 2 = 60 failed | 278 passed, Tests 66 failed |
  2211 passed (flaky ±1; concentrated in event-editor/protocol-ide/welcome/extraction —
  cross-lane post-merge fallout, NOT this item's surface).
- Scoped green slice (measured): `cd app && npx vitest run src/shared/sharing
  src/shared/shell/activeProject.test.ts` → **Test Files 2 passed (2), Tests 6 passed (6)**.
- Consequence for the done-gate: the task-list's "test:unit -w app clean" and §T12's
  "typecheck clean" are NOT true of the base. The operative gate is **zero NEW failures + zero
  new tsc errors + the scoped slice green**, quoted against the 23 / 59-60-files numbers above.
  The orchestrator already re-based baselines this era for server (0 / 45-45); this is the app-side
  equivalent fact. Do not "fix" unrelated red — that is out of scope (4th-file rule energy).

## Implementation requirements (ShareRecordDialog.tsx)

1. **Policy fetch inside `load()`** (:49-69), non-fatal and separate from the body error path:
   add to the Promise.all a `apiClient.getOwnershipPolicy().then(r => r.resolved).catch(() =>
   null)` (or equivalent try/catch) → state `policyTargets: string[] | null` where `null` means
   UNAVAILABLE (show-all + note), computed once AccessPolicyResponse is in hand — the kind comes
   from `p.kind` (:1913), so order it AFTER the policy response or chain it; simplest is a
   `void` chained `.then` after `setPolicy(p)` or a second await using the already-awaited `p.kind`.
   Also add the best-effort `getRecord` for `links.studyId` (R3) with `.catch(() => undefined)`.
   A failing `getOwnershipPolicy`/`getRecord` must NEVER set the top-level `error` state (:64-65).
2. **Preset row** rendered ABOVE the grants list (:173) and ONLY when `editable` (:83) — presets
   that write with no write permission are dead chrome, reject class. Three buttons:
   - **"Share with whole lab"** — render iff `targets === null || targets.includes('lab')`.
     P1 semantics: `setVisibility('public')`; grants UNTOUCHED (task verbatim "keep grants
     untouched").
   - **"Share with project members"** — render iff `targets === null ||
     targets.includes('project')`. **Enabled iff `activeProject !== null && recordStudyId !==
     undefined`** (task verbatim: "disabled without an active project or links.studyId"), else
     `disabled` WITH a `title`/aria reason (e.g. "No active project" / "This record isn't filed
     to a project") — disabled chrome must explain itself. P2 semantics: append
     `{principalType:'project', principalId: activeProject.studyId, role:'editor'}` — skip when an
     identical grant already exists (dedup like addGrant :99; NEVER enumerate members — D10, plan
     line 70), visibility UNTOUCHED, no auto-save (Save persists).
     **principalId = activeProject.studyId** (the helper's studyId), per the description's own
     wording; the record's links.studyId is the gate, per the same sentence. Mismatch case → OQ3.
   - **"Private to me"** — render ALWAYS (OQ2: it is a withdrawal, not a share target; hiding it
     would hide capability). P3 semantics: `setVisibility('private')` AND
     `setGrants(prev => prev.filter(g => g.principalType !== 'project'))`.
     **Exact drop set: grants with `principalType === 'project'` are removed; user grants, group
     grants (including GRP-LAB-ADMINS-style admin groups) and any other non-project grant SURVIVE
     verbatim.** There is no `lab` principalType on the wire (R4: enum is user|group|project) —
     "drop project/lab-style grants" resolves to exactly this filter plus the visibility
     private-ing (which is what `shareTargets:'lab'` always meant: whole-lab visibility, not a
     grant). Record this reading in the PR body so the reviewer doesn't hunt a non-existent case.
3. **Policy-unavailable note** — when `policyTargets === null` AND editable, render inside the
   preset row:
   `<p className="share-dialog__note">policy unavailable — showing all targets</p>`
   — the sentence **verbatim, lowercase, em dash (U+2014), exact text from the task list**.
   Pattern precedent :145-154 / style :254. It must be visible (no `display:none` games), must
   not block any control, and must not appear when the policy loaded.
4. **Add-principal select gains Project** (:194-197): widen `newType` state (:45) to
   `'user' | 'group' | 'project'`; render the `<option value="project">Project</option>` ONLY
   when `targets === null || targets.includes('project')`. When `newType === 'project'`, the
   principal select (:198-205) lists exactly one option — value `activeProject.studyId`, label
   **the active project's title** (task verbatim) — and shows the disabled/explain state when no
   active project (empty list ⇒ Add stays disabled via :209's `!newPrincipal` guard for free).
   `principalOptions` (:119) branches accordingly. `principalLabel` + icon per R6.
5. **No hardcoded policy data** (D9 / hardcode boundary): no kind strings, no study ids, no
   share-target defaults invented in TS; the only literals are the three preset labels,
   `'editor'`/`'public'`/`'private'` which already exist as component constants
   (ROLES :21, VISIBILITIES :22). Reuse `VISIBILITY_HELP` :23-27 unchanged.
6. **Type strictness**: app tsconfig is `strict` + `noUnusedLocals/Parameters` (no
   exactOptionalPropertyTypes here — that trap is server-side only, tsconfig.json:13).
   `AccessGrant` already admits `'project'` (client.ts:1899) — widening `newType` typechecks
   against it with zero client-type edits when OQ1 reuses OWN-11's client method.

## RED-first test plan — `app/src/shared/sharing/ShareRecordDialog.test.tsx`

Harness: mirror `useRecordVisibility.test.tsx` (`vi.mock('../api/client')` with vi.fn()s, render,
waitFor) PLUS a mocked open-tabs module: `vi.mock('../shell/OpenTabsContext', () => ({
useOptionalOpenTabs: () => ({ state: mockTabsState }) }))` — mock the CONTEXT, not the pure
`activeProject` helper (the helper's mapping logic stays real; it is already pinned by
activeProject.test.ts). Real `OpenTabsProvider` (SurfaceIndicator.test.tsx:65 pattern) is the
fallback if the context mock fights localStorage. Mock `apiClient`: `getAccessPolicy` (root,
canAdmin true, direct with seeded visibility/grants), `listUsers`, `listGroups`, `getRecord`,
`putAccessPolicy`, `getOwnershipPolicy`. Build the resolved-doc fixture like the lane seed
(kindRules KEYED map — `OwnershipPolicyService.ts:115-120`; a test fixture in schema-array form
proves nothing about the client lookup).

Commit the test file FIRST (dialog exists, so this is an ASSERTION RED, not a structural one —
say `test(app): RED — share-dialog preset contract (§T12)` in the commit message).

Required cases (each names its mutation probe):
1. **Presets gated by targets**: resolved with `kindRules['local-protocol'].shareTargets =
   ['user','group']` → only "Private to me" visible; whole-lab and project-members ABSENT.
   Second case with `['lab','user']` → whole lab present, project absent. Probe: rendering all
   three unconditionally flips this RED.
2. **Policy fetch failure → all three + note**: `getOwnershipPolicy` rejects → all three preset
   buttons render AND text matches `/policy unavailable — showing all targets/` (assert the exact
   em-dash string). Probe: dropping the note or hiding presets on failure flips RED.
3. **Project-members payload shape**: click preset → click Save → assert
   `putAccessPolicy` called with `(recordId, { visibility: <unchanged seed>, grants: [...seed,
   {principalType:'project', principalId:'STU-A', role:'editor'}] })`. Seed includes a
   `GRP-LAB-ADMINS` group grant that MUST survive untouched (D10 non-enumeration + no collateral
   edits). Probe: mutating the preset's role/principalId, or clobbering visibility, flips RED.
4. **Disabled without active project / studyId**: two renders — (a) `useOptionalOpenTabs` state
   with no project tab, record payload `links.studyId` present → button `disabled`; (b) active
   project present, `getRecord` payload WITHOUT links → `disabled`. Enabled case asserts
   `not.disabled`. Probe: removing either gate flips RED.
5. **Private-to-me drop set**: seed grants `{project STU-A editor} + {user USR-B editor} +
   {group GRP-LAB-ADMINS admin}` → click Private → Save → grants in the call = the user + group
   grants ONLY, visibility `'private'`. Probe: dropping the user grant or keeping the project
   grant each flip RED (this pins the exact DROP/KEEP boundary).
6. **Select gating + label**: targets include `project` → Add-principal type select contains a
   `Project` option; switching to it lists the active project's TITLE as the option label;
   targets WITHOUT project (and a successful policy fetch) → no Project option. Probe: an
   unconditional option flips the negative case RED.
7. (cheap, keep) **Read-only regression**: `canAdmin:false` → no preset row, no note, no Project
   option (presets never render when not editable).

## First targeted check (run THIS before implementing)

After committing the RED test file:
```bash
cd app && npx vitest run src/shared/sharing/ShareRecordDialog.test.tsx 2>&1 | tail -15
```
Expected: FAIL on preset assertions (e.g. "Unable to find ... 'Share with whole lab'") — the
dialog renders but has no presets. That RED proves the harness (mocks, jsdom, context wiring)
lines up. If it fails on module load or React context instead, the harness assumption is broken —
stop and report, do not paper over.

## Full verification commands (with EXPECTED output, from measured baselines above)

```bash
# 1. New suite — expected: all cases passed, 0 failed
cd app && npx vitest run src/shared/sharing/ShareRecordDialog.test.tsx

# 2. Sharing + activeProject surface regression — expected: Test Files 3 passed (3),
#    Tests 6 + new-cases passed, 0 failed (baseline measured: 2 files / 6 tests)
cd app && npx vitest run src/shared/sharing src/shared/shell/activeProject.test.ts

# 3. App typecheck — expected: STILL exactly 23 'error TS' lines, none in
#    shared/sharing/ or shared/api/client.ts (baseline measured at bc6685ce = 23;
#    ANY new error line, or count >23, is a defect)
cd app && npx tsc --noEmit 2>&1 | grep -c 'error TS'
cd app && npx tsc --noEmit 2>&1 | grep -E 'shared/sharing|shared/api' || echo "clean in-scope"

# 4. Full app suite zero-new-failures (soft, flaky ±1) — expected: roughly the baseline band
#    Test Files 59-60 failed | 278-279 passed; Tests 65-66 failed | 2211-2212 passed;
#    NO entry under src/shared/sharing in the FAIL list (baseline FAIL list contains none)
npm run test:unit -w app 2>&1 | grep -E 'FAIL|Test Files|Tests ' | tail -70

# 5. Diff scope — expected: 2-3 files, ALL under app/src/shared/{sharing,api/}
git -c core.fileMode=false diff --name-only bc6685ce

# 6. Server untouched — expected: empty
git -c core.fileMode=false diff --name-only bc6685ce -- server schema | wc -l   # → 0
```

The BROWSER RECEIPT (task-list `verified by`) is **orchestrator-owned post-merge on :5192**
(share a protocol with project members → grant renders as a project principal, i.e. titled with
the active project's name, not a raw STU id) plus the curl read-back of R5
(`GET /api/records/<id>/access-policy` shows the project grant + expected visibility — read-back,
not screenshot-only). No YAML ships → no lane-stack restart owed for the TS merge itself.

## Worker contract

- Worktree: `/mnt/vast/home/brad/git/wt/OWN-12-lane1-l1t<dispatch-ts>` (lane precedent
  `wt/OWN-10-lane1-l1t1130`), branch `wt/OWN-12-lane1-l1t<dispatch-ts>` off
  `cl/integration-1` @ bc6685ce-or-later (RE-ANCHOR: if trunk moved past bc6685ce at dispatch,
  re-run the two baseline numbers in R7 on the new HEAD and report both).
- Fleet-lock protocol applies (`/home/brad/.hermes/cl/appliance2-coder.pid`); node_modules
  symlink pattern; never kill a legit lane-2 lock holder.
- Report: `~/.hermes/cl/lanes/1/own12-report-l1t<dispatch-ts>.md`; final line exactly
  `OWN12 CODER DONE <sha>`. RED commit then feature commit
  (`feat(app): share targets driven by the ownership policy (lab / project members / private)` —
  plan line 1421).
- Stage EXACTLY the in-scope files (2, or 3 if OQ1's client.ts add was needed) — **never
  `git add -A`** (lane data dir / NFS mode-bit noise; always `git -c core.fileMode=false` for
  diffs). Never touch :3001/:5174 (Brad's stack); lane surfaces are :3092/:5192 and the coder
  does not need either — the browser gate is orchestrator-owned post-merge.
- No server/schema/YAML edits; no caller edits; report must quote the measured before/after of
  verification commands 1-5 verbatim.

## Reviewer bait (expected adversarial focus; mutation probes included)

1. **The DROP/KEEP boundary of "private to me"** — exactly `principalType==='project'` grants
   die; user AND group grants survive (including `GRP-LAB-ADMINS` admin grants — killing the
   lab admin group is the classic overreach). Probe: widen the filter to `!== 'user'` → test 5
   must go RED. Also: private-to-me does NOT remove the owner (ownerUserId is never in grants).
2. **D10 / non-enumeration** — exactly one project grant, never per-member grants; double-click
   must not duplicate (dedup). Probe: removing the dedup makes a two-click test flaky-RED.
3. **Fail-open, never fail-closed** — policy fetch failure shows all three WITH the verbatim note;
   a coder who hides presets "until policy loads" violates the task's "never hide capability".
   Probe: delete the note / gate presets on null → tests 1-2 flip. Em dash U+2014 must be exact.
4. **kindRules keyed-map trap** — the server coerces the schema's kindRules ARRAY into a keyed
   `Record<string, KindRule>` (OwnershipPolicyService.ts:115-120). A client that array-scans the
   response is broken against the real GET; test fixtures must be keyed maps. Probe: `.find(x =>
   x.kind===...)` array code fails the keyed fixture.
5. **Fallback-rule lookup** — kinds with no kindRule fall back to `resolved.fallback.shareTargets`
   (`ruleFor` :144-150 mirrors server semantics); a spec implementation that shows ALL on
   no-kindRule (instead of the declared fallback set) silently over-permits. Check the dialog
   mirrors ruleFor exactly.
6. **STU- prefix / payload well-formedness** — the server 400s a project grant whose id doesn't
   start `STU-` (IdentityHandlers.ts:342-350); the client must send exactly
   `{principalType:'project', principalId: activeProject.studyId, role:'editor'}` (test 3). No
   client-side prefix validation is needed or wanted (single authority = server); no server edit
   is allowed to "help".
7. **Preset row gated by `editable`** (:83) — presets on a read-only view are dead chrome. Probe:
   rendering outside the gate → test 7 RED.
8. **Disabled-without-reason** — the project button's disabled cases need a visible/aria reason;
   a bare `disabled` button is UX bait the browser gate can catch.
9. **The dialog never auto-saves** — presets mutate the working copy only; a coder who wires a
   preset straight to `putAccessPolicy` skips the human confirm and breaks "grants untouched"
   previews. Probe: assert `putAccessPolicy` NOT called before Save (add to test 3 if absent).
10. **Baseline honesty** — report MUST carry the 23-error / 59-60-failed-file baselines; a report
    claiming the app suite is green at base is false (R7, measured twice). Fixing unrelated app
    red inside this item = scope violation (4th-file rule energy).
11. **exactOptionalPropertyTypes** — NOT applicable in app (app/tsconfig.json has no such flag;
    it is `server/tsconfig.json:13`). Do not "port" server house style blindly; but conditional
    spreads remain fine style for the `resolved` passthrough.
12. **YAML-reload trap** — N/A for shipping (TS-only); only relevant if someone smoke-tests
    against :3092 with an edited seed (forbidden — server out of scope).

## Open questions (composer could not close locally; ≤3)

- **OQ1 — `getOwnershipPolicy` is not on trunk's apiClient.** §T12 says "driven by
  `apiClient.getOwnershipPolicy()`", but that method belongs to §T11/OWN-11's client.ts pair
  (plan lines 1367-1380) and is absent at bc6685ce (grep = 0); OWN-9 merged only the server
  handlers. Checked: `grep -in ownership app/src/shared/api/client.ts`, OWN-9 promoted spec (no
  client method in its files), OWN-11 draft (not yet in drafts/), handoff 1145 (OWN-11 composer
  in flight, coder queued). **Recommended default:** OWN-12 branches AFTER OWN-11 merges and
  reuses its method (2-file diff); if the orch dispatches OWN-12 first, the coder adds the exact
  §T11 snippet (flagged file 3) and the later OWN-11 merge dedupes with a trivial conflict.
- **OQ2 — is "Private to me" gated by shareTargets?** The doc's ShareTarget enum has no `private`
  entry (OwnershipPolicyService.ts:18), so literally gating all three presets makes
  "Private to me" unrenderable for any kind whose rule omits... nothing — it can never be
  "allowed" and strict gating would hide it only when implemented as always-hidden. Checked
  §T12 wording ("RENDER ONLY the targets the document allows"), the enum, and the seed (all
  kinds include the relevant targets anyway). **Recommended default:** Private-to-me renders
  ALWAYS (it withdraws sharing; hiding it hides capability, contra the task's own principle);
  lab/project presets gate on `'lab'`/`'project'` ∈ targets.
- **OQ3 — record-studyId vs active-project mismatch.** Task verbatim gates on BOTH "an active
  project" and "the record's links.studyId" but names one value for the grant (`<studyId>` via
  activeProjectFromTabs) and one label source (active project's title). If the record is filed to
  STU-A while the active tab project is STU-B, the literal reading grants STU-B on an STU-A record.
  Checked: §T12 both readings, D10 (project grant = members of the NAMED project),
  ProtocolSelector.tsx:76 links-cast precedent. **Recommended default:** literal task behavior —
  grant `activeProject.studyId`, disable only on the two named absences; if the orch prefers the
  safe reading (require equality / grant the record's own studyId), it's a one-line adjudication
  change and test 3's fixture flips — I did NOT invent equality logic the task didn't state.

## Recon provenance

No scout dispatches (every load-bearing fact verified first-hand by the composer at bc6685ce in
the lane worktree, read-only; live measurements: `npm run typecheck -w app` → 23 error TS;
`npm run test:unit -w app` ×2 → 59|279 files 65|2212 tests and 60|278 files 66|2211 tests; scoped
vitest on src/shared/sharing + activeProject.test.ts → 2 files / 6 tests passed; both runs at
bc6685ce, ~12:38-13:05 EDT, tmp logs under /tmp only — nothing under git modified).

## ORCHESTRATOR ADJUDICATION (20261012T1350, promotes this draft)

- Spot-verified first-hand at bc6685ce by the orchestrator: IdentityHandlers.ts STU-/USR-/GRP-
  prefix 400 loop (:341-350), OwnershipPolicyService.ts kindRules array->keyed-map coercion
  (:115-120), ShareRecordDialog Props {recordId,onClose} (:29-32), editable (:83),
  putAccessPolicy(recordId,{visibility,grants}) (:110). Draft accepted.
- OQ1 ACCEPTED as recommended: OWN-12 branches AFTER OWN-11 merges and REUSES OWN-11's
  getOwnershipPolicy (2-file diff). If trunk lacks the method at dispatch time, add the exact
  §T11 snippet (flagged file 3) — the dedupe obligation then falls on the later merge, orch-side.
- OQ2 ACCEPTED as recommended: "Private to me" renders ALWAYS (withdrawal, not a share target).
- OQ3 ACCEPTED as recommended: literal task behavior — grant activeProject.studyId; disable only
  on the two named absences. The safe-equality variant is NOT adopted (would be invented policy).
- Worker note: fleet lock via queue-OWN-12.sh fd-flock pattern; worktree to be built at dispatch.
