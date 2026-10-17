# SPEC — OWN-11: Settings "Ownership & Sharing" policy section (table + YAML edit, round-trip persists)

Status: PROMOTED by orchestrator 2026-10-12 ~14:10 EDT (from composer draft l1t1145).
This adjudication block WINS on conflicts with the draft body or canonical plan §T11.

## Orchestrator adjudication (l1t1400)

VERIFIED first-hand by the orchestrator at trunk bc6685ce (independent of the composer):
SettingsPage.tsx:15 PolicyBundleSelector import, Section "Policy Bundle" :292, sync-controls
comment :324 (mount = between :322 and :324); client.ts getLabSettings :2914 / patchLabSettings
:2927 (pair inserts after :2930); GET not-found branch {record:null,resolved:null,defaults:null}
and found branch {record,resolved:doc??coerceOwnershipPolicy(record)}
(OwnershipPolicyHandlers.ts:74-86); PUT success shape {success:true,record} (:133), store-failure
422 branch (:126-132); codemirror/lang-yaml/yaml all in app/package.json (:19,:36,:43).
Seed write trap RE-PROVED live this tick against :3092: GET serves seed copy, records list total=0,
valid PUT round-trip returns 422 {"error":"Record not found: OWN-LAB-DEFAULT"}.

OQ1 — ACCEPTED (orchestrator-owned, zero code): the seed write trap is BROWSER-GATE PREP, NOT a
product defect and NOT OWN-11's scope. Before the :5192 receipt the ORCHESTRATOR will materialize
the doc as a real repo record (POST :3092/api/records with the seed payload + admin header,
verified by records list total>=1), then run the gate. The coder must NOT auto-create records from
the settings UI and must NOT touch server code for this. Surfacing "Record not found" honestly on
seed state is CORRECT behavior.

OQ2 — RATIFIED: acceptance "test:unit + typecheck clean" means, per the OWN-10 promotion
precedent: zero NEW failures vs measured baselines (app tsc == 23 error-TS lines with ZERO
mentioning OwnershipPolicySection/shared/api/client/shell/SettingsPage; full app suite baseline
59 failed files / 65 failed tests, +-2 flaky; neighborhood vitest 12 files/117 tests green + the
new suite), and server tsc stays 0.

OQ3 — ACCEPTED DEFAULT: inline CodeMirror mount inside OwnershipPolicySection.tsx. NO 4th product
file, no shared YamlEditor extraction, no package.json diff.

SEQUENCING (ties to OWN-12's promoted adjudication): OWN-12 reuses OWN-11's getOwnershipPolicy /
putOwnershipPolicy and the exported interfaces. Keep the names EXACTLY as the Client-methods
section specifies so OWN-12's 2-file diff holds.

DISPATCH CORRECTIONS:
- Coder runs in the PRE-BUILT worktree /mnt/vast/home/brad/git/wt/OWN-11-lane1-l1t1200
  (branch wt/OWN-11-lane1-l1t1200, node_modules symlinked). It is @ bc6685ce. If trunk has
  advanced when the coder starts, `git -c core.fileMode=false merge cl/integration-1` into the
  branch first (fileMode flag mandatory on this NFS mount) and re-anchor only if lines moved.
- Report: /home/brad/.hermes/cl/lanes/1/own11-report-l1t1400.md; end-marker "OWN11 CODER DONE <sha>".

---

# SPEC DRAFT — OWN-11: Settings "Ownership & Sharing" policy section (table + YAML edit, round-trip persists)

Status: composer draft `l1t1145` — orchestrator review/promotion required before dispatch.
Composer: cl-spec-composer, run started 2026-10-12 12:23 EDT. Scout was NOT used: every
load-bearing fact below was verified first-hand at bc6685ce (read_file / grep / live curls /
real tsc + vitest runs in the lane worktree; nothing under git modified).

Campaign: lab-ownership-and-sharing-policy, wave 3, lane 1. Canonical plan §T11:
`.hermes/plans/2026-10-10_192635-lab-ownership-and-sharing-policy.md:1367-1413`. §T11 snippets
are design intent, NOT drop-in code — this spec corrects two snippet defects (§T11 client shapes
are wrong, see "Client methods" below) and adds one runtime-proved blocker (§T11's own :5174
browser wording is already overridden to lane :5192).

BASE: trunk `cl/integration-1` @ **bc6685ce** (verified `git rev-parse HEAD` =
bc6685ce5b25227b5d418e73618201b51ce7661d, worktree /mnt/vast/home/brad/git/cl-integration-1).
Every path:line below re-anchored at this SHA — the task-list's :2867 / :285 anchors are stale.

## Goal (one sentence)

Give the Settings page an "Ownership & Sharing" section that reads
`GET /settings/ownership-policy`, renders the resolved lab policy as a read-first
`kind | owner | visibility | filed to | share targets` table, offers an advanced raw-YAML edit
of the full payload mounted on the existing CodeMirror pattern (zero new dependencies), saves
via `PUT /settings/ownership-policy` surfacing 422 `INVALID_POLICY` validation errors honestly,
and persists (save → reload → new value shown).

## Files IN scope (exactly the three task-list paths; a 4th product file = reject)

1. EDIT `app/src/shared/api/client.ts` — add `getOwnershipPolicy` / `putOwnershipPolicy` beside
   `getLabSettings`. Re-verified anchors at bc6685ce: `getLabSettings` is at
   **client.ts:2914-2916** (task's ":2867" is stale), `patchLabSettings` at :2927-2930 — insert
   the new pair after :2930, before `listSemanticsInstruments` (:2932).
2. NEW `app/src/components/settings/OwnershipPolicySection.tsx` + NEW
   `app/src/components/settings/OwnershipPolicySection.test.tsx` (the task's "(+test)" pair
   counts as one deliverable; PolicyBundleSelector.tsx + PolicyBundleSelector.test.tsx set the
   precedent that settings components colocate their tests).
3. EDIT `app/src/shell/SettingsPage.tsx` — mount the section (mount point below; task's ":285"
   is stale — the Policy Bundle section now spans SettingsPage.tsx:292-322, see below).

## Explicitly OUT of scope

- `server/` — OWN-9 shipped: routes at `server/src/api/routes.ts:602-603` (re-verified),
  handler `server/src/api/handlers/OwnershipPolicyHandlers.ts` (136 lines, read fully — the
  response-type authority for this spec), service
  `server/src/security/OwnershipPolicyService.ts`. No server edit is needed or allowed.
- `app/src/components/settings/PolicyBundleSelector.tsx` (reference only),
  `app/src/shell/settings/EditableSection.tsx` / `index.ts` barrel (the new component lives in
  `app/src/components/settings/` next to PolicyBundleSelector, which is NOT in the barrel —
  SettingsPage imports it directly at SettingsPage.tsx:15; do the same, do not touch index.ts).
- `app/src/editor/RawRecordEditor.tsx` — reference only; its 4 baseline test failures are NOT
  yours to fix (see baselines).
- Extracting a shared `YamlEditor.tsx` component (would be a 4th product file — see OQ3;
  default: inline the mount pattern).
- OWN-12 (share-target presets in ShareRecordDialog), the seed YAML, schema files, `server.ts`.
- No knowledge-layer surface (claim/context/assertion/etc.) — canonical example doc not binding.

## Acceptance criteria (verbatim from the task list)

> verified by >
>   npm run test:unit -w app + npm run typecheck -w app clean. BROWSER RECEIPT (cl-browser-reviewer
>   on LANE :5192 — the plan's :5174 wording is overridden; lane tasks never touch the main stack):
>   /settings renders the section, edit a rule, save, reload, value persisted, before/after values
>   quoted. Acceptance 8 (settings half).

AND the description's binding pieces (verbatim):

>   client.ts getOwnershipPolicy/putOwnershipPolicy beside getLabSettings (lane anchor :2867 —
>   RE-VERIFY at bc6685ce). New app/src/components/settings/OwnershipPolicySection.tsx: read-first
>   table (kind | owner | visibility | filed to | share targets) + raw-YAML advanced edit REUSING
>   the existing CodeMirror YAML component (check RawRecordEditor.tsx; no new editor dependency).
>   Mount beside PolicyBundleSelector (SettingsPage.tsx:285 — RE-VERIFY; note trunk moved: the
>   cross-lane merge added main's data-driven PolicyBundleSelector prop wiring) under heading
>   "Ownership & Sharing". Component test mirrors useRecordVisibility.test.tsx with a mocked client.

**BASELINE CORRECTION (acceptance wording, load-bearing):** "test:unit clean" and "typecheck
clean" are NOT true of app/ at bc6685ce — re-measured first-hand this run (see "Baselines").
As at OWN-10's promotion, take them as: **zero NEW failures / zero NEW error-TS lines, none in
touched files, plus the targeted new suite green.** The orchestrator should ratify this in the
adjudication.

## Baselines (re-measured by the composer at bc6685ce, 2026-10-12 ~12:35-12:55 EDT)

| Command | Measured | Note |
| --- | --- | --- |
| `cd app && npx tsc --noEmit \| grep -c 'error TS'` | **23** | old "31" is pre-merge; concentrated in event-editor / useAiChat test files (6 in `useAiChat.surfaceContext.test.ts`); NONE in client.ts / SettingsPage.tsx / settings components |
| `cd server && npx tsc --noEmit \| grep -c 'error TS'` | **0** | matches OWN-10 promotion note |
| `npm run test:unit -w app` (full, repo root) | **Test Files 59 failed \| 279 passed (338); Tests 65 failed \| 2212 passed (2277)** | pre-existing debt: 15 `e2e/*.spec.ts` collection errors + event-editor/protocol-ide/App/WelcomePage/RawRecordEditor failures. Includes the 4 `RawRecordEditor.test.tsx` failures — out of scope, do not "fix" |
| `cd app && npx vitest run src/shell/settings src/components src/shared/sharing` | **12 files / 117 tests passed** | your neighborhood is green — the new suite must land inside it without breaking it |

## Recon findings (first-hand, cited)

### 1. Server response/error types the client must mirror

Source of truth: `server/src/api/handlers/OwnershipPolicyHandlers.ts` (read fully).

- **GET** (`:74-86`): found → `{ record: RecordEnvelope; resolved: OwnershipPolicyDoc }` where
  `resolved: doc ?? coerceOwnershipPolicy(record)` (DEV-1, :85). Not found → 200
  `{ record: null, resolved: null, defaults: null }` (:78-79). The `defaults: null` key exists
  ONLY in the not-found branch. NOTE: §T11's snippet return type omits `defaults` — model it as
  optional or as a union; do not fabricate a non-null `defaults`.
- **PUT** (`:90-134`): body = the **full payload object** (same shape as `record.payload`,
  validated against `OWNERSHIP_POLICY_SCHEMA_ID`, DEV-3 envelope at :113-117). Outcomes:
  - 200 `{ success: true, record: RecordEnvelope }` (:133). **NOT `WriteResponse`** —
    §T11's `Promise<WriteResponse>` is WRONG: no `validation`/`lint`/`commit` keys ship.
    `WriteResponse` (`app/src/types/kernel.ts:113-122`) requires them.
  - 403 `{ error: 'ACCESS_DENIED', message }` — two paths: no credential header presented at all
    (DEV-2 fail-closed, :55-70, :97-105) or `canAccess(userId,'admin',record)` false (:107-110).
  - 422 `{ error: 'INVALID_POLICY', validation }` on schema failure (:118-121) — live-proved:
    a junk body returned `{"error":"INVALID_POLICY","validation":{"valid":false,"errors":[{"path":"/","message":"Missing required property: scope",...}]}}`.
  - 422 `{ error: <store error> }` when `store.update` fails (:126-132) — including
    **`{"error":"Record not found: OWN-LAB-DEFAULT"}` — live-proved against the lane :3092**
    (see "Seed write trap" below).
  - 404 `{ error: 'NOT_FOUND', message }` when no document installed at all (:93-96).
- Credentials are automatic: `request()` already sends `x-user-id` / `x-cl-session` from
  localStorage (client.ts:1394-1412) — the client methods need NO header code, and the browser
  gate (logged-in session) satisfies DEV-2.
- Error surfacing is already done: `ApiError.fromResponse` (`app/src/shared/api/errors.ts:44-80`)
  folds `validation.errors` into `ApiError.message` AND keeps structured `err.validation`
  (`errors.ts:25`). Catch `ApiError.isApiError(err)` and render `err.message` (verbatim house
  style, errors.ts:4 comment) plus per-row `err.validation?.errors` when present.

### 2. The CodeMirror "component" — there is no component; there is a pattern

`app/src/editor/RawRecordEditor.tsx` is a **route-level component** (uses `useParams`, its own
client calls) — it cannot be imported. What you reuse is its editor mount
(`RawRecordEditor.tsx:231-298`): `EditorState.create({ doc, extensions: [basicSetup, yaml(),
EditorView.updateListener.of(...)] })` → `new EditorView({ state, parent })` inside a
`<div className="codemirror-wrapper" />` (:552; styles app/src/index.css:617-627).
Imports (:3-6): `import { parse, stringify } from 'yaml'`; `EditorState` from `@codemirror/state`;
`EditorView, basicSetup` from `codemirror`; `yaml` from `@codemirror/lang-yaml`. No lazy-loading.

**Dependencies: all already in app/package.json — codemirror ^6.0.1 (:36),
@codemirror/lang-yaml ^6.1.1 (:19), @codemirror/state (:20), @codemirror/view (:21),
yaml ^2.6.1 (:43). Adding any package = reject.** YAML lib is `yaml` (NOT js-yaml — zero js-yaml
imports in app/src; precedents RawRecordEditor.tsx:3, sessionYaml.ts:22, SequencesPage.tsx:3).

### 3. SettingsPage.tsx mount point at bc6685ce

The merge left a self-contained Policy Bundle card: state `labSettings`/`labSettingsLoading`/
`labSettingsError` (:71-73), fetch effect (:79-93), `handlePolicyBundleChanged` (:96-107), and
`<Section title="Policy Bundle">…</Section>` at **:292-322** (heading via local `Section`
component :38-49; FIX-RUN-1 error-row pattern at :299-308 — the error renders as a row ABOVE the
control and never replaces it, `data-testid="lab-settings-error" role="alert"`; "Not configured"
row when `labSettings` null, :315-319).

**Mount:** insert `<Section title="Ownership & Sharing"><OwnershipPolicySection /></Section>`
directly after the Policy Bundle `</Section>` (:322), before the `{/* ---- Sync controls */}`
block (:324), importing `OwnershipPolicySection` beside the PolicyBundleSelector import (:15).
The component is self-contained (fetches/holds its own state — the GroupMembershipSection
pattern, SettingsPage.tsx:289 mounts it bare, but here wrap in `Section` for the heading).

### 4. Resolved doc shape (the table's data)

`OwnershipPolicyService.ts` (read fully): `OwnershipPolicyDoc.kindRules` is
`Record<string, KindRule>` — a **KEYED MAP** (:46), built by looping the payload ARRAY at
:116-120 (`payload.kindRules` is an array of `{kind, owner, visibility, filedTo, editRoles,
shareTargets, defaultGrants?, publishRole?}`; `required: [owner, visibility, filedTo, editRoles,
shareTargets]` per schema/identity/ownership-policy.schema.yaml:64, `required:[kind]` per :53).
Runtime-proved against lane :3092: GET returned `resolved.kindRules` as a dict with keys
`['local-protocol','protocol','sequence','claim','material',...]`, e.g.
`local-protocol: {"owner":"creator","visibility":"private","filedTo":"active-project","editRoles":["owner","editor"],"shareTargets":["project","lab","user","group"],"defaultGrants":[]}`.
Table: `Object.entries(doc.kindRules)` for the rows + one row for `doc.fallback` (label it
"(fallback)"); also render `labOwnerUserId` and `scope` as InfoRows above the table (useful,
free, no new data source). The YAML editor edits **`record.payload`** (array form), NOT the
coerced doc — stringify(record.payload), PUT the parsed object.
`resolved === null` (or GET `{record:null,resolved:null,defaults:null}`) → render an honest
"Not configured" row (mirror :315-319), never a crash, never a fake table.

### 5. Test harness

Mirror `app/src/shared/sharing/useRecordVisibility.test.tsx` (48 lines): `vi.mock` the client
module wholesale (`vi.mock('../api/client', () => ({ apiClient: { getOwnershipPolicy: vi.fn(),
putOwnershipPolicy: vi.fn() } }))` — path from the new test: `'../../../shared/api/client'`),
`beforeEach(() => { vi.clearAllMocks() })`, `waitFor` after render. jsdom env
(app/vitest.config.ts:8). For driving CodeMirror content use the exported
`EditorView.findFromDOM(dom)` (verified present, `@codemirror/view` index.d.ts:1454): grab
`container.querySelector('.codemirror-wrapper')`, `view.dispatch({ changes: {...} })` — this
fires the updateListener and avoids keyboard simulation. Do not depend on
RawRecordEditor.test.tsx passing — its 4 failures are baseline.

### 6. PUT round-trip semantics the UI must honor

PUT replaces the payload WHOLESALE (admin-gated server-side; the UI is the human path — the AI
path OWN-10 does read-modify-write, the settings YAML is intentionally a full-document replace:
what you see in the editor is exactly what ships). Invalid body → 422 `INVALID_POLICY` +
`validation.errors` — the advanced edit MUST surface these verbatim (house rule: "The UI
surfaces server error messages verbatim", errors.ts:4). Records are embedded-git: a GET after a
successful PUT reads the file back, so save-then-reload shows the new payload — with ONE
runtime-proved exception:

**SEED WRITE TRAP (live-proved 2026-10-12 12:47 EDT against the lane :3092 — this gates the
browser receipt):** on a boot-fresh lane stack the policy doc exists ONLY as the seed copy
(`records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml`; live GET meta shows
`"commitSha": "seed"`, `GET /api/records?kind=ownership-policy` → `{"records":[],"total":0}`).
`store.update` scans the repo only (`RecordStoreImpl.ts:638-644` findRecordPath →
`Record not found`), so a fully-valid PUT with a credential currently returns
`422 {"error":"Record not found: OWN-LAB-DEFAULT"}` (exact probe: payload round-trieved from
GET + `x-user-id: USR-LOCAL-ADMIN`). The UI must surface that message honestly; making the
round-trip actually persist is a BROWSER-GATE PREP step, not a UI feature (OQ1).

## Client methods (exact contract — corrects the two §T11 snippet defects)

House style = `request<T>` with an exported interface (LabSettings :819, patchLabSettings
:2927). Add after client.ts:2930, mirroring the patchLabSettings doc-comment style:

```ts
export interface OwnershipPolicyKindRule {
  owner: 'creator' | 'lab'
  visibility: 'private' | 'shared' | 'public'
  filedTo: 'none' | 'active-project'
  editRoles: string[]
  shareTargets: string[]
  defaultGrants?: Array<{ principalType: 'user' | 'group' | 'project'; principalId: string; role: string }>
  publishRole?: string
}
export interface OwnershipPolicyDocView {
  recordId: string
  scope: { type: 'lab' | 'project'; id: string }
  labOwnerUserId: string
  fallback: OwnershipPolicyKindRule
  /** KEYED MAP keyed by kind (server coerces the payload array — OwnershipPolicyService.ts:46). */
  kindRules: Record<string, OwnershipPolicyKindRule>
}
export interface OwnershipPolicyResponse {
  record: RecordEnvelope | null
  resolved: OwnershipPolicyDocView | null
  defaults?: null   // present-null only on the handler's not-found branch (:78-79)
}
```

```ts
  async getOwnershipPolicy(): Promise<OwnershipPolicyResponse> {
    return request<OwnershipPolicyResponse>('/settings/ownership-policy')
  },
  async putOwnershipPolicy(payload: Record<string, unknown>): Promise<{ success: true; record: RecordEnvelope }> {
    return request<{ success: true; record: RecordEnvelope }>('/settings/ownership-policy', {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },
```

`RecordEnvelope` is already imported (client.ts:7) — verify before adding imports. The PUT
return type is the handler's literal 200 shape (`{success:true,record}` —
OwnershipPolicyHandlers.ts:133), NOT WriteResponse. On 403/422/404 `request` throws `ApiError`
with status/code/validation — nothing extra to do at client level.

## Component requirements — OwnershipPolicySection.tsx

1. Read-first: on mount fetch `getOwnershipPolicy()` (cancelled-flag pattern,
   SettingsPage.tsx:79-93 or GroupMembershipSection.tsx load()). Loading row, error row,
   not-configured row per recon §3/§4.
2. Table: header `kind | owner | visibility | filed to | share targets`; one row per
   `Object.entries(resolved.kindRules)` (stable order = Object order is fine), plus a final
   `fallback` row labeled "(fallback)". Cells: owner, visibility, filedTo verbatim; shareTargets
   joined with ", ". `data-testid="policy-row-<kind>"` per row (the gate + test target rows).
3. Advanced edit (collapsible, default collapsed): CodeMirror mount per recon §2, initial doc
   `stringify(record.payload)` — the RAW PAYLOAD (array kindRules, $schema/kind/recordId/title/
   description/scope/labOwnerUserId/fallback/kindRules), NOT `resolved`. Keep `.codemirror-wrapper`
   class (existing CSS + the RawRecordEditor test precedent for querying it).
4. Parse-on-change (RawRecordEditor.tsx:269-283 pattern): maintain `{ valid, data?, error? }`.
   **Save button disabled while `!valid`** (or editor never opened → save hidden/disabled —
   table-only mode has nothing to save; the ONLY save path PUTs the parsed editor data).
   When invalid, show the parse error message inline; do NOT disable after a server-side 403/422
   (a refusal must not replace the control — retry on the same page, FIX-RUN-1 defect-5
   precedent SettingsPage.tsx:299-308, `data-testid="policy-save-error" role="alert"`).
5. Save: `putOwnershipPolicy(parseResult.data)`; on success refetch GET (single source of truth —
   do NOT splice the local payload into state; the table then proves persistence), clear the
   error; on `ApiError` render `err.message` verbatim + `err.validation?.errors` as
   `path: message` rows.
6. No hardcoded kinds/visibilities/user ids in the component — it renders whatever the doc says
   (D9 hardcode boundary; `USR-LOCAL-ADMIN`/`local-protocol` allowed ONLY in the test file).
7. `exactOptionalPropertyTypes` is NOT enabled in app/tsconfig.json (checked — `strict` only),
   so the server's conditional-spread law is relaxed here, but keep strict-clean optional
   handling (`defaultGrants?: ...` accessed with `?? []`).

## RED-first test plan — OwnershipPolicySection.test.tsx

Commit the test file FIRST, before the component exists: `npm run test:unit -w app --
src/components/settings/OwnershipPolicySection.test.tsx` fails with a load/collection error —
structural RED, say so verbatim in the commit message (`test(app): RED — ownership-policy
settings section contract (§T11) — structural RED: component absent`), per the lane's OWN-13
structural-RED precedent.

Mocked fixtures: a `resolved` OwnershipPolicyDocView built from the real seed doc (local-protocol
private + active-project; material lab/public) and a matching `record.payload` (array kindRules).
Cases (all with `vi.mock('../../../shared/api/client', ...)`):

1. **Table renders from mocked resolved doc** — assert row `local-protocol` shows `private` and
   `active-project` (verbatim §T11 test requirement), `material` row shows `lab`/`public`, and a
   "(fallback)" row exists.
2. **Save disabled when YAML unparseable** — open advanced edit, wait for `.codemirror-wrapper`,
   `EditorView.findFromDOM(...).dispatch({ changes: { from: 0, to: full length, insert: broken
   YAML, e.g. "kind: [unclosed" } })`, assert the save button is `disabled` and the parse error
   text is visible; fix the YAML → save re-enables (mutation probe: deleting the updateListener's
   parse must flip this RED).
3. **Save PUTs the parsed payload** — valid edit of `visibility` on one rule, click Save, assert
   `putOwnershipPolicy` called with an object whose `kindRules` is an ARRAY containing the edited
   rule (mutation probe: PUTting `resolved` instead of payload flips RED — array-vs-map guard).
4. **422 surfaced honestly** — mockRejectedValue an `ApiError`-shaped rejection (build
   `new ApiError({status:422, code:'HTTP_422', message:'INVALID_POLICY: /kindRules/0: ...',
   validation})` — ApiError is exported from `../../../shared/api/errors`), assert the message
   and a `validation.errors` line render in the error row, the table is still visible (error does
   NOT replace the control), and `getOwnershipPolicy` was re-... not called — table unchanged.
5. **Not-configured** — `{record:null,resolved:null,defaults:null}` → "Not configured" row, no
   crash, no table, save not offered.
6. **Success refetch proves round-trip in the unit layer** — after a resolved PUT, assert
   `getOwnershipPolicy` is called a second time and the table re-renders from the new response
   (this is the unit-level stand-in for the reload check).

## First targeted check (run THIS before writing anything else)

From the worktree root, after committing the structural-RED test (before the component):

```bash
npm run test:unit -w app -- src/components/settings/OwnershipPolicySection.test.tsx 2>&1 | tail -15
```

Expected: FAIL to load/collection error on the missing component (structural RED — proves path +
vitest pickup). Passing = vacuous test. Error inside `vitest` bootstrap = harness assumption
broken, stop and report.

## Full verification commands (expected output = my bc6685ce measurements)

```bash
# 1. New suite — expected: 1 passed file, ~6 tests, 0 failed
npm run test:unit -w app -- src/components/settings/OwnershipPolicySection.test.tsx

# 2. Neighborhood gate — expected: 13 files passed / ~123 tests (baseline 12/117 + yours)
cd app && npx vitest run src/shell/settings src/components src/shared/sharing

# 3. App typecheck — expected: STILL exactly 23 error-TS lines (baseline 23; NOT "clean" —
#    see baseline table), with ZERO lines mentioning client.ts / SettingsPage.tsx /
#    OwnershipPolicySection
cd app && npx tsc --noEmit 2>&1 | grep -c 'error TS'
cd app && npx tsc --noEmit 2>&1 | grep -E 'OwnershipPolicySection|shared/api/client|shell/SettingsPage' | wc -l   # expected 0

# 4. Server untouched — expected: prints exactly 0
cd server && npx tsc --noEmit 2>&1 | grep -c 'error TS'

# 5. Full app suite vs recorded baseline — expected: 59 failed files / 65 failed tests UNCHANGED
#    (allow ±2 flaky in the timeout-prone event-editor cluster; any FAIL line naming a settings/
#    sharing/sharing-prefixed file is a defect)
npm run test:unit -w app 2>&1 | tail -6

# 6. Scope check — expected: only the 3 in-scope paths (client.ts, OwnershipPolicySection.tsx,
#    OwnershipPolicySection.test.tsx, SettingsPage.tsx)
git -c core.fileMode=false diff --name-only bc6685ce && git status --short
```

## Worker contract

- Branch off trunk: `wt/OWN-11-lane1-l1t<dispatch-ts>` (lane precedent
  `wt/OWN-9-lane1-l1t1255`). NOTE: the orchestrator already pre-built
  `/mnt/vast/home/brad/git/wt/OWN-11-lane1-l1t1200` (branch `wt/OWN-11-lane1-l1t1200` @
  bc6685ce, node_modules symlink applied — lane handoff 20261012T1230): prefer dispatching into
  that worktree; if a fresh one is built, same naming.
- Fleet-lock protocol applies (`/home/brad/.hermes/cl/appliance2-coder.pid`).
- Report path: `~/.hermes/cl/lanes/1/own11-report-l1t<dispatch-ts>.md`;
  end-marker line `OWN11 CODER DONE <sha>`.
- Stage EXACTLY the in-scope files — **never `git add -A`**. Never touch :3001/:5174 (Brad
  stack); the lane stack :3092/:5192 is read-only for the coder (no restarts — if live-smoke
  against :3092 is needed, TS-only diff needs none).
- Browser gate is ORCHESTRATOR-OWNED, post-merge, cl-browser-reviewer on **lane :5192**
  (`/settings`). Contract: quote the before value (e.g. `claim` rule `visibility: private`),
  perform the edit through the section, save, hard-reload, quote the after value persisted, plus
  the GET `/api/settings/ownership-policy` payload excerpt. SEEED-PREP per OQ1 must happen
  BEFORE the reviewer starts.

## Reviewer bait (likely edge errors for this item — pre-empt them)

1. **PUT return type** — §T11 says `WriteResponse`; the handler ships `{success:true,record}`
   (OwnershipPolicyHandlers.ts:133). A coder pasting the plan snippet gets a lying type that
   will crash on `.validation.errors` reads. Mutation probe: read `res.validation` → must be a
   type error.
2. **Array-vs-map confusion** — payload `kindRules` is an ARRAY (schema :53-64, seed YAML);
   resolved `kindRules` is a KEYED MAP (Service :46, live-proved dict). Table must read the map;
   YAML/PUT must carry the array. A table that iterates `record.payload.kindRules` with
   `Object.entries` (or PUTs the coerced doc) is a defect. Test case 3 is the guard.
3. **New editor/YAML dependency** — forbidden; codemirror + @codemirror/lang-yaml + yaml are
   already in app/package.json (:19-21, :36, :43). Any package.json diff = reject. (js-yaml does
   NOT exist in app — the "js-yaml available?" question resolves to: use `yaml`, precedent
   RawRecordEditor.tsx:3.)
4. **"REUSING the CodeMirror component"** — there is no importable component; RawRecordEditor is
   a route. Reusing the pattern inline inside OwnershipPolicySection is the compliant reading;
   extracting a shared component is a 4th-file OQ (OQ3, default: don't).
5. **Error replacing the control** — FIX-RUN-1 defect-5 lesson (SettingsPage.tsx:299-308): the
   403/422 row renders ABOVE/next to the editor+table, which stay operable for retry. Test case 4
   guards it. The opposite bait: swallowing the error (test 4 asserts message text).
6. **Save must be disabled ONLY on unparseable YAML** — not on dirty (PUT is replace-wholesale,
   by design), not after a server refusal.
7. **Seed write trap** — a browser-gate failure mode pre-loaded: valid PUT 422s
   `Record not found: OWN-LAB-DEFAULT` on boot-fresh seed state (live-proved, recon §6). The UI
   surfacing that message is CORRECT; anyone "fixing" it by auto-POSTing a new record from the
   settings UI is out of scope (that's a product decision, OQ1).
8. **exactOptionalPropertyTypes** — N/A in app (tsconfig verified: strict only). Don't add the
   flag; don't assign `undefined` to optionals anyway.
9. **Hardcode boundary** — no kind strings/visibility values/ids in the component (D9); the
   table renders the doc. `local-protocol`/`USR-LOCAL-ADMIN` are test-data only.
10. **YAML-reload trap** — N/A for shipping (TS-only). If live-smoked through the lane stack no
    restart is owed (no YAML/schema touched).
11. **RawRecordEditor.test.tsx's 4 red tests are baseline** — "fixing" them is a scope
    violation; leaving `test:unit` full-suite red is expected (baseline 59/65).

## Open questions (≤3, with recommended defaults)

- **OQ1 — the browser-gate round-trip needs the doc materialized in the repo.** Live-proved at
  :3092: GET serves the seed copy (`meta.commitSha: 'seed'`) but PUT 422s `Record not found:
  OWN-LAB-DEFAULT` because `store.update` only sees repo files (RecordStoreImpl.ts:638-644);
  `GET /api/records?kind=ownership-policy` → total 0 (seed-dir list-merge reads
  `seedDir/<kind>/`, the file lives under `seed/identity/`). Checked: handler, store update
  path, live curls, OWN-9 report (its own no-live-runtime disclaimer, own9-report-l1t1255.md:68).
  **Recommended default (orchestrator-owned gate prep, zero code):** before the :5192 receipt,
  POST the seed payload as a real record (e.g. `curl -X POST :3092/api/records` with the seed
  payload + admin header, or edit the doc once via an existing editor path), then GET serves and
  PUT round-trips against the repo copy. Alternative (server make-seed-writable / handler
  create-on-first-write) is a NEW server item — flag, do not smuggle into OWN-11.
- **OQ2 — acceptance wording vs measured baselines.** "npm run test:unit -w app + typecheck -w
  app clean" cannot pass at bc6685ce (measured: 23 app tsc errors, 59/65 test failures
  pre-existing). **Recommended default:** no-new-failures + targeted suite green +
  zero new error-TS in touched files (the OWN-10 promotion set this precedent verbatim);
  ratify in adjudication so the coder doesn't chase a red herring or "fix" 59 files.
- **OQ3 — inline CodeMirror mount vs shared YamlEditor component.** The task's files list is 3
  paths; a reusable `YamlCodeEditor.tsx` is a 4th. **Recommended default:** inline mount inside
  OwnershipPolicySection.tsx (pattern copy, ~40 lines per RawRecordEditor.tsx:264-298); if the
  orchestrator wants the extraction, it should name the 4th file in the promoted spec — checked:
  no existing shared YAML-editor module anywhere under app/src/components or app/src/shared.

## Recon provenance

Composer-only (no scout). First-hand at bc6685ce: full reads of OwnershipPolicyHandlers.ts,
OwnershipPolicyService.ts, useRecordVisibility.test.tsx, PolicyBundleSelector.tsx,
SettingsPage.tsx, client.ts regions, errors.ts, RawRecordEditor.tsx mount region, seed YAML,
schema requireds, RecordStoreImpl get/update/find paths, lane-stack config; live curls against
:3092 (GET shape incl. keyed kindRules; PUT invalid→INVALID_POLICY 422; PUT valid→
Record not found 422; PUT no-credential→403); `@codemirror/view` d.ts grep; real baseline runs:
app tsc 23 / server tsc 0 / app full vitest 59f|279p files, 65f|2212p tests / neighborhood
vitest 12/117 green. Nothing under git modified; tmp files only under /tmp.

COMPOSER DONE OWN11 29754
