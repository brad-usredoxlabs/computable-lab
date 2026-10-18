# ORCHESTRATOR ADJUDICATION (l1t0400, promoting draft 2026-10-18_REG-4-provenance-card-spec-draft-l1t0130.md)
Grounding spot-checked first-hand by the orchestrator at trunk 125221bd:
handleSelectRecord meta-drop confirmed (RecordRegistryPage.tsx:288-293);
refreshSelectedRecord re-drop confirmed (:521-525); meta re-derivation on read confirmed
(server/src/store/RecordStoreImpl.ts:348-357 — path/commitSha/contentSha); create stamps
createdBy/createdAt (server/src/api/handlers/RecordHandlers.ts ~:788); client
listRecordRevisions exists (app/src/shared/api/client.ts:2404 — GET /records/:id/revisions).
- OQ-1 RULED: follow the plan verbatim — rail renders whenever a record is selected;
  create-mode empty aside is accepted (inert; REG-2 gate measured the fixed rail anyway).
  No coder-side gate invention.
- OQ-2 RULED: verbatim plan; NO RecordSearchCombobox widening this item. If combobox-
  selected records show empty File/Content rows until refresh, that is the pre-existing
  quirk — record as carried finding, do not absorb.
- OQ-3 RULED: browser gate picks an API/UI-created record; card MUST NOT invent fallbacks
  (git blame, mtimes, hardcoded strings). Absent rows are legitimate absences.
Composer baseline note: tsc base 23 lines at 5271a1a5 (tsc-reg4-base-app-l1t0130.txt);
binding rule is delta-zero at the coder's OWN base (REG-2 OQ-B precedent).

# [DRAFT — for orchestrator review/promotion; do NOT dispatch a coder against this path]

# REG-4 SPEC — Provenance carrot in the record rail (envelope meta + revisions surfaced, invents nothing)

DRAFT author: cl-spec-composer, lane 1, 2026-10-18 (l1t0130). Composed while REG-2 coder is
next in queue and REG-3 coder is live. Status: DRAFT; canonical spec after promotion lives at
`.hermes/plans/` inside the lane trunk. This file is the execution spec AROUND the plan; the
plan remains the intent.

## GOAL (one sentence)

Surface the provenance facts the server ALREADY returns — envelope `meta`
(createdBy/createdAt/updatedAt, contentSha/commitSha/gitCommit, path), payload FAIRCommon
timestamps, and the `GET /records/:id/revisions` count — in a token-styled collapsed
`<details>` "Provenance" card at the top of the registry rail, by carrying `meta` through
`RecordData`/`handleSelectRecord`/`refreshSelectedRecord`; the card renders NOTHING for a
create draft and invents no facts (W4-D2: no inline newest-revision-id).

## WHY (short)

The plan (§Current context #4) verified live that the data exists and the page throws it
away: `RecordRegistryPage.handleSelectRecord` builds a `RecordData` WITHOUT `meta`
(RecordRegistryPage.tsx:288-293), so no UI anywhere can show who created a record, when, or
where it lives. Every other part of the wave (REG-1 legibility, REG-2 width, REG-3 real refs)
makes the rail readable; this puts a fact in it.

## Canonical intent (VERBATIM tasks)

CANONICAL PLAN: `.hermes/plans/2026-10-17_192653-registry-legibility-recordrefs-provenance.md`
(8ac57673 lineage; trunk now 5271a1a5). **Read plan Task 13 (plan:1140) and Task 14
(plan:1197) in full before touching anything.** They carry the verbatim test file
(plan:1144-1192), the verbatim component (plan:1201-1277), the verbatim CSS
(plan:1281-1297), the verbatim `RecordMetaLike`/`RecordData`/`handleSelectRecord`/
`refreshSelectedRecord`/rail-snippet code (plan:1304-1384), and the commit command
(plan:1389). Reproduce every plan code block verbatim; this draft adds execution mechanics,
REG-2/REG-3 composition, baselines, and reviewer bait around them.

Binding ruling (plan:1623, RULED 2026-10-17): collapsed `<details>` is the accepted form —
**no inline newest-revision id**. The revisions COUNT row stays, shown only when count > 0.

## Dependency / execution base — READ TWICE

REG-4 branches off **POST-REG-2-merge trunk**. At execution base:
- `RecordRegistryPage.tsx` will already carry REG-1's className swaps + `RecordRegistryPage.css`
  (merged c895f0f0) AND REG-2's `width="full" railResizable` props on its `<DocumentShell>`
  (spec f3bd694e). REG-4 adds NO DocumentShell prop and touches the splitter in NO way — it
  edits only the CONTENT of the `rail={` render-prop REGION (currently the `<div
  className="registry-rail">` at trunk RecordRegistryPage.tsx:740-751). REG-2's splitter lives
  in DocumentShell.tsx OUTSIDE the rail contents; the two diffs are disjoint by construction.
- The plan's rail snippet at plan:1364-1384 replaces exactly that `rail={` region. It does
  NOT add `width`/`railResizable`; do not remove REG-2's props while editing the same JSX
  element.
- REG-3 (live, wt branch) is converting taptab/WidgetRenderer/RecordRefPicker/UISpecLoader/
  `schema/lab/*.ui.yaml` — ZERO overlap with REG-4's four files. Never touch those surfaces.
- ALL baselines MUST be RE-MEASURED at the coder's own worktree base (raw captures), not
  copied from this document. Composer numbers below are orientation at trunk 5271a1a5.

## Worktree contract (worker)

- Worktree: `/mnt/vast/home/brad/git/wt/REG-4-lane1-<orch-tick>` — branch
  `wt/REG-4-lane1-<orch-tick>` off lane-1 trunk (`cl/integration-1`) at the post-REG-2-merge
  tip (tick assigned by orchestrator at dispatch).
- `node_modules` symlinked at repo root, app/, server/ — do NOT npm/pnpm install.
- Every git command with `git -c core.fileMode=false` (NFS mode-bit noise).
- Never `git add -A` — stage exactly the in-scope files (below) per plan Task 14's commit
  command (plan:1389) — that is the ONE commit the plan prescribes; the RED file rides in it.
- Do NOT start/restart any dev stack; do not touch :3001/:5174/:3092/:5192. No merge, no push,
  no writes to either data dir. Browser gate is orchestrator-side after merge.
- Report at EXACTLY `/home/brad/.hermes/cl/lanes/1/reg4-report-l1t<orch-tick>.md` with: RED
  raw output (module-not-found failing all 4 pins), GREEN raw output (4/4), the
  pages+registry suite base vs head raw captures, tsc base/head raw capture files + delta,
  staged-file list, every assumption/deviation. Last line exactly: `REG4 CODER DONE <head-sha>`
  (commit before it).

## SCOPE — files IN (the entire diff surface)

1. `app/src/components/registry/RecordProvenanceCard.tsx` — NEW, verbatim plan:1201-1277.
2. `app/src/components/registry/RecordProvenanceCard.css` — NEW, verbatim plan:1281-1297.
3. `app/src/components/registry/RecordProvenanceCard.test.tsx` — NEW, verbatim plan:1144-1192
   (4 pins).
4. `app/src/pages/RecordRegistryPage.tsx` — meta plumbing + rail slot, plan:1301-1384
   (import, `RecordMetaLike`/`RecordData`, `handleSelectRecord`, the two call sites at trunk
   :652/:675, `refreshSelectedRecord`, the `rail={` region).

## SCOPE — files EXPLICITLY OUT

- `app/src/editor/taptab/DocumentShell.tsx`, `DocumentShell.test.tsx`, `taptab.css` — REG-2's
  files (rail contents region only for REG-4; the splitter/width are REG-2's).
- `app/src/components/registry/RelatedRecordsCard.{tsx,css,styling.test.tsx}`,
  `app/src/pages/RecordRegistryPage.css`, `RecordRegistryPage.styling.test.tsx` — REG-1's
  merged files. Do not restyle, do not re-scan. (Exception: if the styling test's palette
  regex starts failing on RecordRegistryPage.tsx because of YOUR edit, YOUR edit introduced
  palette utilities — fix your edit, never relax the test.)
- `app/src/editor/taptab/**` (WidgetRenderer, FieldRow, RecordRefPicker, RefCombobox,
  documentMapper), `server/src/ui/UISpecLoader.ts`, `schema/lab/*.ui.yaml` — REG-3 in flight;
  zero diff.
- Server, `schema/`, records data dirs — the endpoints already exist and are read-only here.
- `SignOffReceipt.tsx` — reuses `listRecordRevisions` (SignOffReceipt.tsx:67); no changes.
- `app/package.json` — zero dependency changes.

## CURRENT STATE (composer-verified first-hand at trunk 5271a1a5; re-anchor at worktree base)

- `RecordRegistryPage.tsx:64-68` — `interface RecordData { recordId; schemaId; payload }`. No
  `meta` field. The drop point.
- `RecordRegistryPage.tsx:288-301` — `handleSelectRecord(record: { recordId; payload })`:
  builds `RecordData` from recordId+payload only. (:652 combobox branch and :675 list-row
  onClick are the two call sites; both pass `{ recordId, payload }`.)
- `RecordRegistryPage.tsx:517-530` — `refreshSelectedRecord` refetches via
  `apiClient.getRecord(...)` and rebuilds `selectedRecord` WITHOUT meta (:521-525).
- `RecordRegistryPage.tsx:740-751` — rail slot: `rail={ selectedRecord.recordId &&
  editorMode !== 'create' ? <div className="registry-rail"><RelatedRecordsCard .../></div>
  : undefined }`. Post-REG-2 this `<DocumentShell>` also carries `width="full"
  railResizable` — leave them.
- `app/src/shared/api/client.ts:2255-2258` — `getRecord(recordId): Promise<RecordEnvelope>`
  returns `response.record`. **Envelope meta DOES arrive**: server `store.get()` stamps
  `meta: { ...parsed.meta, path, commitSha: file.sha, contentSha: file.sha, gitCommit? }`
  (server/src/store/RecordStoreImpl.ts:350-357, :502-509 for list), and create stamps
  `meta { createdAt, updatedAt, createdBy }` via `createEnvelope`
  (server/src/api/handlers/RecordHandlers.ts:790-794, server/src/types/RecordEnvelope.ts:124-141).
  Frontend `RecordEnvelope` declares exactly the fields the card reads:
  `meta?: { kind, path, commitSha, contentSha, gitCommit, createdAt, updatedAt, createdBy }`
  (app/src/types/kernel.ts:9-23). **Caveat (measured, see reviewer bait 5): seed-era record
  files carry no meta timestamps in YAML — `parseRecord` extracts only kind/path into meta
  (server/src/store/RecordParser.ts:120-134) and `serializeRecord` persists payload only
  (RecordStoreImpl.ts:613,795) — so `createdAt/createdBy` in meta exist for API-created
  records at create time; a seed or re-read record shows payload timestamps +
  contentSha/commitSha/path, and the card's payload fallback is load-bearing, not
  belt-and-braces.**
- `app/src/shared/api/client.ts:2404-2406` — `listRecordRevisions(recordId): Promise<{
  records: RecordEnvelope[] }>` → GET `/records/:id/revisions`. Server route:
  server/src/api/routes.ts:227, handler RecordHandlers.ts:366-372 (returns
  `{ records: [...] }`, 404 on unreadable). Existing call-site precedent:
  `SignOffReceipt.tsx:67` (`apiClient.listRecordRevisions(recordId).catch(() => null)` —
  honest-abstention pattern; reuse THIS client method, no new fetch).
- Payload fallback has real data: server create injects `createdAt/updatedAt/createdBy` into
  non-inventory payloads (RecordHandlers.ts:726-733); draft-copy stamps them too
  (RecordHandlers.ts:384).
- `.registry-rail` exists at RecordRegistryPage.css:259-265 (flex column, gap 16px) and is
  pinned by `RecordRegistryPage.styling.test.tsx:20` — the provenance card sits INSIDE that
  wrapper; no CSS change needed there.
- Registry test suites that must stay green (10 files, 90 tests, measured PASS): see
  BASELINES. The page suites' `vi.mock('../shared/api/client')` factories ALREADY include
  `listRecordRevisions: vi.fn().mockResolvedValue({ records: [] })` in every file checked
  (RecordRegistryPage.test.tsx:61, .createSearch:76, .createTab, .archiveBrowsing:157,
  .qms6e:74) — the new rail import cannot crash page mounts with an undefined method.
  Page suites that mock `../components/registry/RelatedRecordsCard` do NOT mock
  `RecordProvenanceCard` — it will render for real in page tests where a record with a
  recordId is selected (payload fallback; revisions mocked `[]` → no count row — W4-D2 safe).
- Test infra: vitest globals + jsdom + `src/test/setup.ts` imports
  `@testing-library/jest-dom/vitest` → `toBeEmptyDOMElement`/`toBeInTheDocument` available.

## DESIGN

**Meta plumbing (plan Task 14.1-14.5, verbatim).** `RecordData` gains
`meta?: RecordMetaLike` (plan's `RecordMetaLike` at plan:1305-1313 is structurally a subset of
kernel `RecordEnvelope['meta']` — keep plan's local interface verbatim; the app tsconfig has
`strict: true` but NOT `exactOptionalPropertyTypes` (verified app/tsconfig.json — that rule
is backend-only, CLAUDE.md rule 6), yet plan still uses `...(record.meta ? { meta:
record.meta } : {})` spreads. Keep the spreads verbatim: they are also the
`exactOptionalPropertyTypes`-safe habit the reviewer expects, and they mean absent-vs-present
is honored at every site.

- `handleSelectRecord` accepts `meta?` and carries it (plan:1326-1337).
- BOTH call sites (:652 combobox local-select branch, :675 list row) pass `...(record.meta ?
  { meta: record.meta } : {})` (plan:1342, :1348). The list rows come from
  `refreshRecords`'s `listRecordsByKind` → server list stamps path/commitSha/contentSha into
  every envelope meta (RecordStoreImpl.ts:502-509) — list-row selections arrive WITH meta.
  The combobox local branch passes `payload: {}` and its onSelect contract has no meta
  (RecordSearchCombobox.tsx:9-15) — meta simply stays absent there; the card's payload
  fallback and `refreshSelectedRecord` (which uses `getRecord`, full envelope) cover it. Do
  NOT widen `RecordSearchComboboxProps.onSelect` — out of scope, zero diff there.
- `refreshSelectedRecord` rebuilds with `...(fresh.meta ? { meta: fresh.meta } : {})`
  (plan:1354-1359). `fresh` is the full `RecordEnvelope` from `apiClient.getRecord` — meta
  arrives (verified above).
- `handleCreateRecord` (trunk :313) and the draft-copy path (:496-500) create
  `RecordData` without meta — verbatim plan behavior keeps create drafts meta-free; the card
  renders nothing for them via the `!recordId` guard (`handleCreateRecord` sets
  `recordId: ''`).

**Revisions fetch timing.** Inside the card's `useEffect([recordId])` (plan:1244-1253):
resets to `null`, early-returns when `recordId` falsy (nothing fetched for drafts), fetches
`apiClient.listRecordRevisions(recordId)` ONLY on record select, `cancelled` flag against
select-races, `.catch` → `null` (unavailable = no row, invents nothing). No page-level fetch,
no polling, no cache.

**W4-D2 compliance.** The ONLY revision fact rendered is `String(revisions)` when
`revisions !== null && revisions > 0` (plan:1272). Never a revision id, never a revision
envelope field.

**Rail composition.** plan:1364-1384: rail renders whenever `selectedRecord` is non-null
(Previously: only in edit mode with a recordId), with `<RecordProvenanceCard>` FIRST and
`<RelatedRecordsCard>` still gated on `recordId && editorMode !== 'create'`. Inside
DocumentShell the card lands in `<aside className="document-shell__rail">` — REG-2's splitter
is a sibling of the aside, unaffected.

**No hardcoded policy.** No id-prefix tables, no kind branching, no fabricated
fallback strings: every displayed value is a field read verbatim from meta/payload/revisions,
rows are conditional on presence. The card never synthesizes "unknown"/"you"/relative dates.

## EXACT EDITS per file

### 1. `app/src/components/registry/RecordProvenanceCard.test.tsx` (NEW — RED first)
Verbatim plan:1145-1191. Four pins:
1. `renders nothing for a create draft (no record id)` — `recordId=""` → empty container.
2. `shows who/when from envelope meta` — `createdBy`/`createdAt` rendered verbatim (exact ISO
   string), `path` row awaited.
3. `falls back to payload timestamps when meta is absent` — `payload={{ createdBy: 'USR-A',
   createdAt: ... }}` → `USR-A`.
4. `shows a revision count only when revisions exist` — mocked 3 revisions → `'3'` awaited;
   the `beforeEach` default `{ records: [] }` + pins 2/3 implicitly pin the no-zero-row case.
Do not add/remove pins. RED first:
`cd app && npx vitest run src/components/registry/RecordProvenanceCard.test.tsx` → FAIL
(module not found — all 4 red). If it doesn't fail exactly that way, STOP and report.

### 2. `app/src/components/registry/RecordProvenanceCard.tsx` (NEW)
Verbatim plan:1202-1276. Notes: `import { apiClient } from '../../shared/api/client'` is the
SAME module path RelatedRecordsCard.tsx:2 uses and the test's `vi.mock('../../shared/api/
client', ...)` factory mocks only `listRecordRevisions` — fine because the card imports
nothing else from it. `Row` is a file-local component (plan verbatim). The `sha` chain is
`meta?.gitCommit ?? meta?.contentSha ?? meta?.commitSha` with `Content` value
`sha.slice(0, 12)` + full `title` (plan:1270). The null-guard
(plan:1261) renders nothing when there is no provenance fact AT ALL even with a recordId.

### 3. `app/src/components/registry/RecordProvenanceCard.css` (NEW)
Verbatim plan:1282-1296. Token-only: `--cl-text`, `--cl-text-faint`, `--cl-text-dim`,
`--cl-accent` — all defined in `app/src/shared/styles/tokens.css` (verified `--cl-text-faint`
there; the rest already used by RelatedRecordsCard.css). No hex/rgb/hsl, no new tokens.

### 4. `app/src/pages/RecordRegistryPage.tsx` (EDIT — 5 anchors, plan Task 14.1-14.6)
a. Import `RecordProvenanceCard` beside the RelatedRecordsCard import (:8).
b. `RecordMetaLike` interface + `meta?: RecordMetaLike` on `RecordData` — replace trunk's
   :64-68 `RecordData` with plan:1305-1321 verbatim.
c. `handleSelectRecord` signature+body — plan:1326-1337 verbatim (replaces :288-293; keep the
   existing tail `setSelectedRecord(recordData); setEditorMode('edit'); ...` untouched).
d. Two call sites (:652, :675) gain `...(record.meta ? { meta: record.meta } : {})`
   (plan:1342/:1348 verbatim — line-wrapping may follow surrounding style, spread semantics
   exact).
e. `refreshSelectedRecord` `setSelectedRecord({...})` — plan:1354-1359 verbatim.
f. `rail={...}` region — plan:1364-1384 verbatim (provenance first, Related gated as before,
   outer `selectedRecord ? ... : undefined`). On post-REG-2 trunk the `rail={` key sits after
   `width="full" railResizable` — those props stay; only the rail value changes.
   (`onNavigate` uses `window.open(...)` — keep the file's existing semicolon style around the
   swapped block; trunk :746 has no semicolon after `'_blank')`, plan shows none — keep
   whichever the file's prettier/eslint accepts, no functional change.)

Commit (plan:1389, one commit):
`git add app/src/components/registry/RecordProvenanceCard.tsx app/src/components/registry/RecordProvenanceCard.css app/src/components/registry/RecordProvenanceCard.test.tsx app/src/pages/RecordRegistryPage.tsx && git commit -m "feat(registry): provenance carrot in the record rail (meta + revisions)"`

## TEST PLAN

RED-first (before ANY edit), raw-capture:
`cd app && npx vitest run src/components/registry/RecordProvenanceCard.test.tsx`
→ expected: 1 failed file, "Cannot find module './RecordProvenanceCard'".

GREEN:
`cd app && npx vitest run src/components/registry/RecordProvenanceCard.test.tsx` → 4/4 PASS.

Regression (task-list verified-by command):
`cd app && npx vitest run src/pages/RecordRegistryPage src/components/registry` → PASS.
At trunk 5271a1a5 the same command yields **10 files / 90 tests, all PASS** (composer raw
capture this session; per-file counts in BASELINS below). After REG-4: **11 files / 94
tests, all PASS** (+4 from the new card test). REG-2 adds no tests to this path (its tests
live under src/editor/taptab) and REG-1 added none here post-merge; if the coder's base
already includes REG-2/REG-3 merges, re-measure and gate DELTA on this suite = the same
pass set + the 4 new tests; ANY other change in pass/fail is a defect.

tsc delta-zero:
```
cd app && npx tsc --noEmit 2>&1 | grep 'error TS' | sort > /home/brad/.hermes/cl/lanes/1/tsc-reg4-base-app-l1t<tick>.txt   # BEFORE any edit (composer captured trunk base at tsc-reg4-base-app-l1t0130.txt: 23 lines, none in registry files)
cd app && npx tsc --noEmit 2>&1 | grep 'error TS' | sort > /home/brad/.hermes/cl/lanes/1/tsc-reg4-head-app-l1t<tick>.txt
diff <base> <head>   # MUST be empty (REG-2 OQ-B ruling: delta-zero at own base, never absolute zero)
```

Browser gate (orchestrator-side after merge; plan step e, verbatim plan:1577-1578):
"e. Provenance: on the saved record the rail shows a collapsed **Provenance** disclosure;
opening it lists Created by / Created / Updated / Content / File. (RULED: collapsed
`<details>` is the accepted form — no newest-revision id.)"
Verbatim-executable runbook at http://localhost:5174/registry:
1. Training tab → select a SAVED record (TRR-DEMO-1 if seeded, else any training-record row;
   if the tab is empty, pick any record on any tab — the card is kind-agnostic).
2. Assert collapsed-by-default + rows:
```js
(() => {
  const d = document.querySelector('.document-shell__rail details.provenance');
  if (!d) return { found: false };
  const collapsedBefore = !d.open;
  d.open = true;
  const labels = [...d.querySelectorAll('.provenance__label')].map(e => e.textContent);
  return { collapsedBefore, labels, hasTestId: !!document.querySelector('[data-testid="record-provenance"]') };
})()
```
   Expected: `found: true`, `collapsedBefore: true`, labels contains 'Created by' and
   'Content' and 'File' (Created/Updated present whenever the server supplied them — see
   reviewer bait 5 on seed records; 'Revisions' present only if count > 0).
3. Draft check: press Create → Confirm on any single-kind tab; the rail must show NO
   Provenance disclosure (`document.querySelector('.document-shell__rail details.provenance')
   === null` — drafts have recordId '' → card renders nothing).
4. No-revision-id assertion for W4-D2: opening the disclosure must list no `REV-` string:
   `[...d.querySelectorAll('.provenance__value')].every(v => !v.textContent.includes('REV-'))`.
5. cl-browser-reviewer VERDICT: accept (task-list requirement).

## REVIEWER-BAIT (the gate hunts these — pre-empt them)

1. **The `meta` drop re-appearing.** The whole item is meta plumbing; a diff where
   `handleSelectRecord`/`refreshSelectedRecord` still rebuild without the spread "passes" the
   card's own 4 tests (they test the component, not the page). The page must be inspected:
   grep the diff for `...(record.meta` ×2 call sites + `handleSelectRecord` +
   `...(fresh.meta`. If `registry-row` clicks show no File/Content rows in the browser gate,
   that IS this defect.
2. **W4-D2 violation.** Rendering `latestRevisionRef`, a revision recordId, or `newest REV-x`
   (SignOffReceipt shows one — copying its pattern into this card is the trap). Count-only.
3. **Zero-row.** Rendering `Revisions 0`/`No revisions` when the fetch returns `{records:[]}`
   or fails. Plan guard: `revisions !== null && revisions > 0`. Failure → `null` → no row,
   no error text.
4. **Palette colors.** REG-1's precedent (ChangesPanel.css, RelatedRecordsCard.css) makes any
   hex/rgb/hsl in RecordProvenanceCard.css a defect; --cl-* tokens ONLY. Note the styling
   tests scan `RecordRegistryPage.tsx`/`.css` and `RelatedRecordsCard.tsx`/`.css` — the NEW
   card files are NOT scanned by them (plan verbatim); the card's token-only-ness is enforced
   by reviewer + browser gate, do not "helpfully" extend the styling tests (out of scope).
5. **Invented facts.** Relative dates ("2 days ago"), "Unknown"/"You" placeholders, defaulting
   timestamps to `new Date().toISOString()`, or promoting payload `displayName` into a
   creator name. The card renders field values verbatim or nothing. Honest asymmetry is
   EXPECTED and not a defect: on seed-era records (files written outside the API; meta
   timestamps live only in create-time responses, RecordParser.ts:120-134 extracts no
   timestamps from YAML), the Created/Updated rows may legitimately be absent or payload-
   sourced while Content/File rows show. Do not "fix" the server to satisfy the browser
   gate — server is out of scope; picking an API-created record is the gate's move.
6. **Fetch on drafts / fetch storm.** Calling `listRecordRevisions('')`, or fetching on every
   render (missing dep-array `[recordId]`), or fetching at page level for the whole list.
   One call per selection; cancelled-flag guards the race.
7. **`exactOptionalPropertyTypes` sites.** app tsconfig does NOT enable it (verified) — but
   the plan's conditional spreads are the house style and the reviewer expects them at all
   four sites. Writing `meta: record.meta` unconditionally (injecting `| undefined`) is a
   style defect even though tsc won't catch it here.
8. **YAML-reload trap (n/a but state it):** nothing in REG-4 touches `*.ui.yaml`/schemas —
   no backend restart is needed or requested; anyone proposing a schema change to "add
   provenance" misunderstands the item (data already ships).
9. **Hardcode boundary:** no per-kind special-casing of which fields to show (no
   `kind === 'training-record'` branch); presence-of-field IS the policy.
10. **Scope creep into the rail:** re-ordering/re-styling RelatedRecordsCard, adding a
    splitter prop, touching DocumentShell — instant fix defect; the rail value diff is the
    whole page-side surface.

## ACCEPTANCE CRITERIA (VERBATIM from lane task list, item REG-4 "verified by")

> RecordProvenanceCard.test.tsx 4/4 (draft renders nothing; meta who/when/path; payload
> fallback; count row only when >0); cd app && npx vitest run src/pages/RecordRegistryPage
> src/components/registry -> PASS; app tsc no new errors. Browser gate per plan step e: saved
> record shows collapsed Provenance disclosure; opening lists Created by / Created / Updated /
> Content / File. cl-browser-reviewer VERDICT: accept.

**Composer caveat on "-> PASS":** honest at trunk 5271a1a5 (90/90 PASS on exactly that
command; REG-2 touches no file on this path; REG-3's files are all under taptab/server/schema,
outside both globs — see BASELINES). Delta-zero still binds at the coder's own base.

## OPEN QUESTIONS (max 3, each with a recommended default)

- **OQ-1 (rail renders in create mode):** plan:1364-1366 changes the rail gate from
  `selectedRecord.recordId && editorMode !== 'create'` to bare `selectedRecord` — so in
  create mode an empty `.registry-rail` div renders inside the aside where before the rail
  prop was `undefined` (DocumentShell hides `<aside>` when rail is undefined,
  DocumentShell.tsx:55). Checked: DocumentShell.tsx:55-62, taptab.css rail styling, plan text
  ("Always render the rail when a record is selected"). Recommended default: follow the plan
  verbatim; an empty aside is cosmetically inert (the rail bg already exists) and REG-2's
  browser gate measured the fixed rail anyway. If Brad wants strictness, gate on
  `selectedRecord && (selectedRecord.recordId || /* draft */ false)` — but that is
  off-plan; do not invent it coder-side.
- **OQ-2 (combobox local-select has no meta):** `RecordSearchCombobox.onSelect` contract
  (RecordSearchCombobox.tsx:9-15) carries no `meta`, so plan's verbatim spread at :652 is
  always a no-op there. Checked: combobox source :163-170 (local branch emits
  `payload: {}`, id only — the page then loads projection but shows an EMPTY payload until
  refreshSelectedRecord runs; that quirk predates REG-4). Recommended default: verbatim plan
  (no combobox change); selecting a record then triggering any lifecycle refresh
  repopulates meta via getRecord. A follow-up item could widen onSelect if the orchestrator
  wants combobox-selected records to show File/Content rows immediately.
- **OQ-3 (browser-gate record choice vs meta timestamps):** envelope meta carries
  createdAt/createdBy only for records created through POST /records after create
  (RecordHandlers.ts:790-794); reads re-derive meta as path/shas only
  (RecordStoreImpl.ts:350-357 — parseRecord keeps just kind/path). Payload fallback covers
  who/when for API-created and draft-copied records (payload stamps), so the gate should
  pass on TRR-DEMO-1 if it carries payload createdBy; if the demo record predates payload
  stamping, Created by/Created rows may be legitimately absent. Recommended default: browser
  reviewer picks an API-created record (create via UI in the gate itself — same session, step
  d of plan creates one) rather than the coder widening the card's fallback to git blame,
  file mtimes, or hardcoded strings (all bait-5 violations).

## BASELINES MEASURED (composer first-hand, trunk 5271a1a5, 2026-10-18 ~01:46 EDT)

- `cd app && npx tsc --noEmit | grep 'error TS' | sort` → **23 lines**, raw capture:
  `/home/brad/.hermes/cl/lanes/1/tsc-reg4-base-app-l1t0130.txt`. Distribution: 19 lines in
  event-editor/* and shared/hooks/useAiChat.surfaceContext.test.tsx (6) / ingestion (2) —
  NONE in RecordRegistryPage, components/registry, or DocumentShell. Matches REG-2 spec's
  trunk number (23). Binding rule is delta-zero at coder's own base (REG-2 OQ-B), not
  absolute zero.
- `cd app && npx vitest run src/pages/RecordRegistryPage src/components/registry` →
  **Test Files 10 passed (10) | Tests 90 passed (90)** — per-file: RecordRegistryPage.test 17,
  createTab 10, createSearch 5, archiveBrowsing 9, qms6e 2, styling 4, RecordProvenanceCard
  absent (will be +4), registry/: DocumentControlBar 20, SlideOverEditor 12, SignOffReceipt 7,
  RelatedRecordsCard.styling 4.
- REG-1 expectations cross-check: RelatedRecordsCard.styling.test.tsx = **4 tests** and
  RecordRegistryPage.styling.test.tsx = **4 tests** as plan pins them (the "43/47" wave
  numbers are per-item gate aggregates owned by REG-1's report, not suite sizes — both
  styling suites here are green and neither scans the new card files, so coexistence is
  structural).
- REG-3 perturbation risk: REG-3's files (taptab widgets, UISpecLoader, *.ui.yaml) appear in
  NONE of the 10 suite files above (page suites mock TapTabEditor wholesale — e.g.
  RecordRegistryPage.test.tsx:122 `vi.mock('../editor/taptab/TapTabEditor')`), so a
  REG-3-lands-first merge cannot move this suite's numbers; still re-measure at own base.
- jsdom/act noise: page suites print React `act()` warnings and a benign
  `getLifecycleTerminalStates is not a function` stderr in RecordRegistryPage.test.tsx (test
  mocks omit it; the page catches) — PRE-EXISTING, not failures; do not chase.

## First targeted check (proves the approach early)

After the page-side edit (anchors b/c/d/e) and BEFORE writing CSS polish:
`cd app && npx vitest run src/components/registry/RecordProvenanceCard.test.tsx src/pages/RecordRegistryPage.test.tsx`
→ card 4/4 (if component+css written) with page's 17 still green. If pin 2 (meta who/when/
path) or pin 3 (payload fallback) cannot go green with the plan-verbatim component, the
plan-block transcription is wrong — STOP and report, do not improvise a variant.

## Ontology / knowledge-layer note

No claim/context/assertion/evidence/mechanism-model touchpoints; the card displays
envelope/repository provenance facts only (not biological provenance — the material-
hierarchy rule 8 is not implicated). `docs/knowledge-layer-canonical-example.md` not in
scope.

COMPOSER DONE /home/brad/.hermes/cl/lanes/1/specs-draft/2026-10-18_REG-4-provenance-card-spec-draft-l1t0130.md
