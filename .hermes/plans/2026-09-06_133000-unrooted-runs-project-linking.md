# Plan: Unrooted runs + Project→Run normalization (fix `/runs` listing)

## Goal
Make runs easy per the user's current mental model: a run may be created with **no project**, must be **listable everywhere** even when unrooted, and may be **attached to a project** (and an optional experiment "phase") later. Project→Run is the normal shape; experiments are optional grouping. Fix the concrete bug where study-linked and unrooted runs are invisible in `GET /runs`.

## Current context / assumptions (verified by reading the code)
- **The data model is already permissive.** `schema/studies/run.schema.yaml`: `studyId` is NOT required; `projectIds[]` is an array (a run may link to multiple projects, `studyId` auto-populates from `projectIds[0]`); `experimentId` is optional ("experiments are optional grouping (saved views), not a required parent"); `tags[]` exists as free-form labels.
- **The tree already emits study-level direct runs.** `server/src/index/IndexManager.ts` `getStudyTree()` (lines ~682-696) builds `study.runs` (run node with `experimentId` absent) for runs linked to a study via `links.studyId === study.recordId || projectIds?.includes(study.recordId)`. `RunTreeNode.experimentId` is documented as "Undefined for study-level runs".
- **The indexer correctly stores run→study links.** `IndexManager.ts` `buildIndexEntry()` (lines 50-55) reads `payload.links?.studyId ?? payload.studyId`. Verified in the live store: all three real runs (`RUN-2026-09-06-run-e1ul/-kt2a/-sza8`) have index `links.studyId = "STU-scratch"`.
- **THE BUG:** `server/src/api/handlers/TreeHandlers.ts` `createTreeHandlers().listRuns` (lines ~1687-1726) only iterates `study.experiments[].runs[]`. It **ignores `study.runs`** (direct runs) and **ignores unrooted runs** (a run with neither `studyId` nor `projectIds` is not placed under any study by `getStudyTree`). Result: `GET /runs` returns `[]` even though runs exist.
- `IndexManager.query({ kind: 'run' })` returns all run `IndexEntry[]` — the primitive for finding "unrooted" runs (those absent from the study tree).
- `app/src/shared/api/client.ts`: `RunListItem` (line ~474) declares `studyId/studyTitle/experimentId/experimentTitle` as required `string`; `listRuns()` → `GET /runs`; `updateRecord(recordId, payload)` → `PUT /records/:id` for late attach; `listRecordsByKind('study', 200)` lists studies for an attach picker.
- `recordStore.update()` triggers a full index rebuild (observed in backend logs: "Rebuilding record index..." after `PUT /api/records/...`), so attaching a project via a normal record update re-indexes automatically.
- `app/src/event-editor/create/quickCreateRun.ts` currently **requires** `studyId` and always writes `payload.studyId` (line 58). All 4 call sites pass `SCRATCH_STUDY_ID` (`STU-scratch`, from `app/src/event-editor/legacyRouteResolution.ts`).
- Both app instances share the same embedded-git record store at `~/.computable-lab`.

## Architecture / proposed approach
- **Do NOT add a parallel "tag as membership" system.** The link-based model (`studyId`/`projectIds`/`experimentId`) is already wired end-to-end (schema → indexer → tree → endpoints). A second membership path the tree doesn't read would silently re-create the exact invisibility bug. `projectIds[]` already IS a multi-project lightweight "tag" backed by real links. `tags[]` stays as generic free-form labels.
- **Fix the listing first (Milestone A), then the UX (Milestone B).** Unrooted runs are surfaced by listing every run from the index and subtracting those the study tree already places; unrooted rows show an explicit "Unassigned" placeholder.
- Experiment remains optional everywhere (a "phase within a project"); direct Project→Run is first-class.

---

## Milestone A — `GET /runs` shows study-level and unrooted runs (fix the bug)

### A1. Red test — `listRuns` includes a study's direct (non-experiment) run
Create `server/src/api/handlers/TreeHandlers.listRuns.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTreeHandlers } from './TreeHandlers.js';

function fakeStudyTree(runs: unknown[]) {
  return [
    {
      recordId: 'STU-1',
      title: 'My Project',
      path: 'records/studies/STU-1/workspace.yaml',
      experiments: [],
      runs,
    },
  ];
}

describe('createTreeHandlers.listRuns', () => {
  let handlers: ReturnType<typeof createTreeHandlers>;

  beforeEach(() => {
    const indexManager = {
      getStudyTree: vi.fn(),
      query: vi.fn().mockResolvedValue([]), // no unrooted runs by default
    } as never;
    const recordStore = {
      get: vi.fn(async () => ({
        payload: { status: 'planned', updatedAt: '2026-09-06T10:00:00Z', startedAt: '2026-09-06T09:59:00Z', title: 'Sunday Run' },
      })),
    } as never;
    handlers = createTreeHandlers(indexManager, recordStore, {} as never);
  });

  it('returns a study-level (direct, experiment-less) run', async () => {
    // Drive behavior through the stub return values (see Notebox below):
    // indexManager.getStudyTree -> tree with STU-1 with runs:[{recordId:'RUN-DIRECT'}]
    // indexManager.query -> []
    // recordStore.get -> canned run envelope.
    expect(true).toBe(true); // replaced by real assertions below
  });
});
```

> **Notebox for the implementer:** the factory signature is `createTreeHandlers(indexManager, recordStore, platformRegistry)`. To keep the test minimal, pass stubs for all three and make `indexManager.getStudyTree` return the tree you want, `indexManager.query` return your unrooted run array, and `recordStore.get` return a canned run envelope. Prefer the existing style in `server/src/api/handlers/TreeHandlers.inventoryUsage.test.ts` (which stubs `indexManager.getStudyTree` and `recordStore`). Do NOT invent a `_setTree` helper — drive behavior through the stub return values instead.

Assert : call `handlers.listRuns({} as never, {} as never)`, expect `runs.length === 1`, `runs[0].recordId === 'RUN-DIRECT'`, and `studyId === 'STU-1'` with `experimentId` **absent** (`'experimentId' in runs[0] === false`).

Run (`server/` workdir): `npx vitest run src/api/handlers/TreeHandlers.listRuns.test.ts` → **fails** (returns 0 runs).

### A2. Red test — `listRuns` includes unrooted runs as "Unassigned"
Add a second `it` in the same file: `indexManager.query` resolves `[{ recordId: 'RUN-LONE', title: 'Lone Run', ... }]` (a run entry with no study link), `getStudyTree` resolves `[]`. Expect `runs.length === 1`, `runs[0].recordId === 'RUN-LONE'`, `'studyId' in runs[0] === false`, `'experimentId' in runs[0] === false`.

Run → **fails**.

### A3. Implement: make `RunListItem` parent fields optional (server)
In `server/src/api/handlers/TreeHandlers.ts` (lines ~50-60):

```ts
export interface RunListItem {
  recordId: string;
  title: string;
  status: string;
  studyId?: string;
  studyTitle?: string;
  experimentId?: string;
  experimentTitle?: string;
  updatedAt: string;
  startedAt?: string;
}
```

### A4. Implement: rewrite `listRuns` to include direct + unrooted runs
Replace the body of `listRuns` in `server/src/api/handlers/TreeHandlers.ts` (from `const studies = await indexManager.getStudyTree();` to `return { runs: paged, total: allRuns.length };`). Add a module-local helper and new logic:

```ts
async function readRunListItem(
  recordStore: RecordStore,
  run: { recordId: string; title?: string },
  study?: { recordId: string; title: string },
  experiment?: { recordId: string; title: string },
): Promise<RunListItem> {
  const runRecord = await recordStore.get(run.recordId);
  const runPayload = (runRecord?.payload ?? {}) as Record<string, unknown>;
  const runStatus = typeof runPayload['status'] === 'string' ? runPayload['status'] : 'planned';
  const updatedAt =
    typeof runPayload['updatedAt'] === 'string'
      ? runPayload['updatedAt']
      : (runRecord?.meta?.updatedAt ?? '');
  const startedAt = typeof runPayload['startedAt'] === 'string' ? runPayload['startedAt'] : undefined;
  return {
    recordId: run.recordId,
    title: run.title || run.recordId,
    status: runStatus,
    ...(study ? { studyId: study.recordId, studyTitle: study.title } : {}),
    ...(experiment ? { experimentId: experiment.recordId, experimentTitle: experiment.title } : {}),
    updatedAt,
    ...(startedAt ? { startedAt } : {}),
  };
}
```

Then in `listRuns`:

```ts
const studies = await indexManager.getStudyTree();
const allRuns: RunListItem[] = [];

for (const study of studies) {
  for (const experiment of study.experiments) {
    for (const run of experiment.runs) {
      allRuns.push(await readRunListItem(recordStore, run, study, experiment));
    }
  }
  for (const run of study.runs ?? []) {
    allRuns.push(await readRunListItem(recordStore, run, study));
  }
}

// Unrooted runs: any run in the index not already placed by the study tree.
const treeRunIds = new Set(allRuns.map((r) => r.recordId));
const allRunEntries = await indexManager.query({ kind: 'run' });
for (const entry of allRunEntries) {
  if (treeRunIds.has(entry.recordId)) continue;
  allRuns.push(await readRunListItem(recordStore, entry));
}
```

Update the filter block to handle optional parent fields (a `studyId`-filtered request intentionally excludes unrooted runs):

```ts
if (studyId && study && study.recordId !== studyId) continue;
if (experimentId && experiment && experiment.recordId !== experimentId) continue;
```

Preserve the existing sort (`allRuns.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))`), offset/limit, and the `{ runs: paged, total: allRuns.length }` return.

Run A1+A2 → **pass**.

### A5. Green on the whole tree suite + typecheck
- `npx vitest run src/api/handlers/TreeHandlers.listRuns.test.ts` → pass
- `npx vitest run src/api/handlers/TreeHandlers.inventoryUsage.test.ts` → still passes (no regressions)
- `npm run typecheck -w server` → clean

Commit: `fix(runs): listRuns surfaces study-level and unrooted runs`.

### A6. Match the client `RunListItem` type (frontend)
In `app/src/shared/api/client.ts` (line ~474), make the same fields optional:

```ts
export interface RunListItem {
  recordId: string
  title: string
  status: string
  studyId?: string
  studyTitle?: string
  experimentId?: string
  experimentTitle?: string
  updatedAt: string
  startedAt?: string
}
```

### A7. Frontend renders unrooted runs ("Unassigned")
In `app/src/collections/RunCollectionView.tsx`:
- Line ~25 search string: guard the optional fields, e.g. `const searchable = `${run.title} ${run.studyTitle ?? ''} ${run.experimentTitle ?? ''} ${run.recordId} ${run.status}`.toLowerCase()`.
- Wherever the row renders project/experiment names, show an "Unassigned" fallback when `run.studyId` is absent (e.g. `{run.studyTitle ?? 'Unassigned'}`), and do not render an experiment fragment when `run.experimentTitle` is absent.
- Run `npm run typecheck -w app` → clean.

Commit: `feat(runs): show unrooted runs as Unassigned`.

---

## Milestone B — Create unrooted runs + attach to a project later

### B1. `quickCreateRun` makes `studyId` optional
In `app/src/event-editor/create/quickCreateRun.ts`:
- Change options: `studyId?: string` (currently `studyId: string`).
- In `payload`, only set `studyId` when provided (the file already guards `experimentId` this way for `exactOptionalPropertyTypes`):

```ts
const payload: Record<string, unknown> = {
  kind: 'run',
  recordId,
  status: 'planned',
  title,
  shortSlug,
};
if (options.studyId) payload.studyId = options.studyId;
if (options.experimentId) payload.experimentId = options.experimentId;
```

Existing callers (SplashPage, CreateMenu, FindTabPanel, RunCollectionView) still pass `studyId: SCRATCH_STUDY_ID` → unchanged behavior for the quick action. Typecheck: `npm run typecheck -w app` → clean.

### B2. Add an "Attach to project" action for unassigned runs
In `app/src/collections/RunCollectionView.tsx`, for each row where `run.studyId` is absent, render a small "Attach to project" control:
- On click, fetch studies: `const studies = await apiClient.listRecordsByKind('study', 200)`; show a picker (a simple inline `<select>` populating the study titles, matched on `recordId`).
- On select, preserve existing payload and set `studyId`:

```ts
const current = await apiClient.getRecord(run.recordId); // confirm exact method name in client.ts
await apiClient.updateRecord(run.recordId, {
  ...(current?.payload ?? {}),
  studyId: selectedStudyId,
});
await fetchRuns();
```

> **Notebox:** confirm the exact client getter name (`getRecord` vs `readRecord` vs similar) before writing B2. Also confirm whether `PUT /records/:id` merges or replaces the payload by reading the record PUT handler in `server/src/api/`; if it replaces wholesale, then constructing the payload as `{...current.payload, studyId}` (as above) is required — do NOT send a bare `{ studyId }`.
> Because `recordStore.update()` triggers a full index rebuild (verified in backend logs), the run will appear under the chosen project in the tree on the next /runs fetch.

Verify manually: create a run via the new unrooted path (or temporarily set one run's `studyId` to empty), confirm it lists as "Unassigned" in `GET /runs`, then attach it to `STU-scratch` and confirm it now groups under that project.

Commit: `feat(runs): create unrooted runs and attach to a project later`.

### B3. Seed-data sanity check (optional, non-destructive)
Do NOT hand-edit the live record store. The three existing runs already carry `links.studyId = "STU-scratch"`; after A4 they will appear under Project "STU-scratch" in `/runs` with `experimentId` absent. This is the expected, correct outcome — no cleanup required.

---

## Tests / validation summary
- Server: new `TreeHandlers.listRuns.test.ts` (A1, A2) — write-fail-pass.
- Server: `TreeHandlers.inventoryUsage.test.ts` regression → green.
- Typechecks: `npm run typecheck -w server` and `npm run typecheck -w app`.
- Live E2E (both instances share the store): `curl http://100.111.141.22:5174/api/runs` and `:5191/api/runs` should each return the 3 runs (study-linked) after restart; create an unrooted run and verify it lists until attached.
- `pnpm`/native-deps note: the isolated `architect-ds4` worktree used `pnpm`; the main tree uses npm-style `node_modules`. Rebuild `better-sqlite3` if a backend fails to boot (see prior work).

## Risks, tradeoffs, open questions
- **`projectIds[]` vs `studyId`:** the schema says `studyId` auto-populates from `projectIds[0]` but the indexer reads `payload.studyId` for the tree link. If a future create path sets only `projectIds` (no `studyId`), the run will not attach to the tree because `getStudyTree` checks `links.studyId === study.recordId` (the index reads `payload.studyId`, not `projectIds`). Open: whether to make `getStudyTree`'s direct-run filter also honor a run linked purely via `projectIds`. Recommend keeping `quickCreateRun` writing `studyId` for now and treating this as a follow-up.
- **Tag-based membership is deferred (intentionally).** The user raised "maybe Tag runs instead." Recommendation: do NOT build a tag-as-membership path now — `projectIds[]` already provides the lightweight multi-project grouping, and a second path would re-break tree visibility. Revisit only if the user explicitly wants non-link "labels" to group runs.
- **Record PUT merge semantics** must be confirmed before B2 (see Notebox) — the attach action's correctness depends on it.
- **Permission/filtering:** `/runs` currently applies no access filter; adding unrooted runs doesn't introduce a new surface, but confirm this stays consistent with other list endpoints.