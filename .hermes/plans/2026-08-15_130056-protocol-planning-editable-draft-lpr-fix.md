# Protocol Planning: editable draft LPR (fix read-only setup section)

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** A run attached directly to a universal protocol must auto-specialize into an editable draft local-protocol (LPR) in Planning mode even when the run has **no experimentId**, so the "This assay needs" setup section renders as an editable draft instead of the read-only preview. Also kill the `Failed to fetch settings for step step-001: 400` console error on every load.

**Architecture:** The auto-specialize path already exists end-to-end (`ensureLocalProtocolDraft` in ProtocolTabPanel → `POST /protocol-actions/specialize-for-experiment` → `ProtocolContextService.specializeForExperiment` → re-point PLR + run at the new LPR). It is dead for runs without an `experimentId` because (a) the frontend bails silently at `if (!studyId || !experimentId) return` and (b) the server hard-400s on missing experimentId. The run schema already declares `experimentId` optional ("Experiments are now optional grouping (saved views)" — see `.hermes/plans/2026-08-02_094500-flattened-ownership-vendor-pdf.md`), and `promoteRunMethod` in the same service already works with studyId only — so making experimentId optional end-to-end matches the existing model, not a new one.

**Tech Stack:** Fastify + TypeScript (server), React + Vitest (app), schema-driven records (YAML), live-browser verification (Playwright via browser tools — note: `browser_vision` is BROKEN on this profile: the model rejects image input ("image input is not supported — hint: provide the mmproj"). Verify UI by DOM inspection via `browser_console`, not screenshots).

---

## Current state (verified live, 2026-08-15 12:30)

- Run `RUN-2026-08-12-run-lm47` (study `STU-scratch`, `plannedRunRef → PLR-plan-zymobiomics-96-magbead-dna-kit-02b63b4a`, **no experimentId**, **no localProtocolRef**) attached to universal protocol `CAN-protocol-1785934813058`.
- `GET /api/protocol-context?runId=…` → runMethods[0] = that PLR, `sourceType: 'protocol'`, `sourceRef → CAN-protocol-…`.
- Live page shows the preview hint: "Declared roles from the universal protocol — no concrete bindings yet. Use the local version of this protocol…" with all rows read-only `suggested`.
- Auto-specialize effect (`ProtocolTabPanel.tsx:1224`) fires (setupIsPreview=true, universalProtocolId set) → `ensureLocalProtocolDraft` bails at line 1167: `if (!studyId || !experimentId) return` — **no log, no UI feedback, forever**.
- Even with an experimentId, the server would 400: `ProtocolContextService.ts:288` `if (!options.experimentId) throw new ProtocolContextError(400, 'BAD_REQUEST', 'experimentId is required.')`.
- Second bug: `ProtocolTabPanel.tsx:1265` fetches `/api/protocols/${runId}/steps/${stepId}/settings` — the endpoint requires a PROTOCOL id (`protocol-steps.ts:191` rejects `kind !== 'protocol'` with 400 NOT_A_PROTOCOL). The correct id is the resolved protocol the steps were loaded from (already computed as `stepsId` in the load effect, line 989, but not stored in state).
- `local-protocol.schema.yaml` `links` = `{studyId?, experimentId?, runId?}` — all optional, `additionalProperties: false`. Study-only LPRs already exist in the repo (5 local-protocol records; `promoteRunMethod` creates them with `links: { studyId }` only).
- Pre-existing test baseline (do NOT regress): app full suite 1334 passed / 52 failed / 5 errors (failures all in unrelated modules); server `ProtocolContextService.test.ts` green.

## Files that change

| File | Change |
|---|---|
| `server/src/protocol/ProtocolContextService.ts:39-44, 286-339` | `experimentId?` optional in options interface; drop the 400; conditional `links.experimentId`; conditional commit message |
| `server/src/protocol/ProtocolContextService.test.ts` | +2 tests (study-only specialize; still rejects missing studyId) |
| `server/src/api/handlers/ProtocolHandlers.ts:160-179` | body type `experimentId?`; conditional spread |
| `app/src/shared/api/client.ts:4135-4144` | `experimentId?` in payload type |
| `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx:1159-1232, 1259-1276, ~989, ~1023` | extract pure `resolveSpecializeTargets` helper; relax bail to studyId-only; warn on every bail; new `stepsProtocolId` state used by `fetchStepSettings` |
| `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.test.tsx` | +tests for `resolveSpecializeTargets` and `stepSettingsUrl` |

**Repo warning (multi-actor):** other agents commit to this working tree mid-session. Before each commit: `git status --short` + `git reflog -5` + `git ls-remote origin feat/ai-extension-api` — stage ONLY the files named in the task. Never `git add -A`.

**TypeScript:** the repo enables `exactOptionalPropertyTypes` — never assign `undefined` to an optional field; use conditional spreads (`...(x ? { x } : {})`).

---

### Task 1: Server — allow study-only specialization (TDD)

**Objective:** `specializeForExperiment` creates a study-only LPR when `experimentId` is absent, and still 400s when `studyId` is absent.

**Files:**
- Test: `server/src/protocol/ProtocolContextService.test.ts`
- Modify: `server/src/protocol/ProtocolContextService.ts:39-44` (interface), `:286-288` (guards), `:315-336` (payload + commit message)

**Step 1: Write failing tests** — append inside the existing `describe` in `ProtocolContextService.test.ts` (after the existing 'specializes a project protocol…' test, ~line 146):

```ts
  it('specializes a universal protocol into a study-only local-protocol when experimentId is absent', async () => {
    const store = new MemoryRecordStore([
      env('PRT-kit', { kind: 'protocol', recordId: 'PRT-kit', title: 'Kit Protocol', links: { studyId: 'STU-1' }, roles: { labwares: [{ id: 'labware_deep_well_block' }] }, steps: [] }),
    ]);

    const record = await new ProtocolContextService(store).specializeForExperiment({ protocolId: 'PRT-kit', studyId: 'STU-1' });

    expect(record.recordId).toMatch(/^LPR-/);
    expect(record.payload).toMatchObject({
      kind: 'local-protocol',
      inherits_from: { kind: 'record', id: 'PRT-kit', type: 'protocol' },
      links: { studyId: 'STU-1' },
    });
    expect(record.payload).not.toHaveProperty(['links', 'experimentId']);
  });

  it('still rejects specialization without a studyId', async () => {
    const store = new MemoryRecordStore([
      env('PRT-kit', { kind: 'protocol', recordId: 'PRT-kit', title: 'Kit Protocol', steps: [] }),
    ]);

    await expect(
      new ProtocolContextService(store).specializeForExperiment({ protocolId: 'PRT-kit' } as never),
    ).rejects.toMatchObject({ status: 400, code: 'BAD_REQUEST' });
  });
```

**Step 2: Run tests — verify failure**

```bash
cd /home/brad/git/computable-lab/server && npx vitest run src/protocol/ProtocolContextService.test.ts
```
Expected: the new study-only test FAILS (service throws 400 'experimentId is required'); the other test passes; existing tests pass.

**Step 3: Implement**

`server/src/protocol/ProtocolContextService.ts` — interface (line 39):

```ts
export interface SpecializeForExperimentOptions {
  protocolId: string;
  studyId: string;
  // Experiments are optional grouping (saved views) — a run may legitimately
  // have no experimentId. When absent, the LPR is study-scoped only.
  experimentId?: string;
  title?: string;
}
```

Guards (line 287-288) — delete the experimentId guard, keep studyId:

```ts
    if (!options.studyId) throw new ProtocolContextError(400, 'BAD_REQUEST', 'studyId is required.');
```

Payload `links` (line 323-326):

```ts
      links: {
        studyId: options.studyId,
        ...(options.experimentId ? { experimentId: options.experimentId } : {}),
      },
```

Commit message (line 336):

```ts
    const created = await this.store.create({ envelope, message: `Specialize ${options.protocolId} for ${options.experimentId ?? options.studyId}` });
```

**Step 4: Run tests — verify pass**

```bash
cd /home/brad/git/computable-lab/server && npx vitest run src/protocol/ProtocolContextService.test.ts
```
Expected: all tests in the file PASS (existing + 2 new).

**Step 5: Commit**

```bash
cd /home/brad/git/computable-lab
git status --short   # MUST show only the two files below staged
git add server/src/protocol/ProtocolContextService.ts server/src/protocol/ProtocolContextService.test.ts
git commit -m "feat(protocol): allow study-only specialization (experimentId optional)"
```

---

### Task 2: Server handler — accept optional experimentId in body

**Objective:** `POST /protocol-actions/specialize-for-experiment` type-checks and forwards when the body omits `experimentId`.

**Files:**
- Modify: `server/src/api/handlers/ProtocolHandlers.ts:160-179`

**Step 1: Edit the handler**

```ts
    async specializeForExperiment(
      request: FastifyRequest<{
        Body: { protocolId: string; studyId: string; experimentId?: string; title?: string };
      }>,
      reply: FastifyReply,
    ) {
      try {
        const body = request.body ?? {};
        const envelope = await protocolContext.specializeForExperiment({
          protocolId: body.protocolId,
          studyId: body.studyId,
          ...(body.experimentId ? { experimentId: body.experimentId } : {}),
          ...(body.title ? { title: body.title } : {}),
        });
        reply.status(201);
        return { success: true, record: envelope };
      } catch (err) {
        return handleProtocolContextError(err, reply);
      }
    }
```

**Step 2: Typecheck server**

```bash
cd /home/brad/git/computable-lab/server && npx tsc --noEmit
```
Expected: exit 0.

**Step 3: Commit**

```bash
cd /home/brad/git/computable-lab
git add server/src/api/handlers/ProtocolHandlers.ts
git commit -m "feat(api): specialize-for-experiment accepts optional experimentId"
```

(No dedicated handler unit test exists for this endpoint — behavior is covered by Task 1's service tests and the live verification in Task 6. YAGNI.)

---

### Task 3: Frontend client — optional experimentId in payload type

**Objective:** `apiClient.specializeProtocolForExperiment` accepts a payload without `experimentId`.

**Files:**
- Modify: `app/src/shared/api/client.ts:4135-4144`

**Step 1: Edit**

```ts
  async specializeProtocolForExperiment(payload: {
    protocolId: string
    studyId: string
    experimentId?: string
    title?: string
  }): Promise<{ success: true; record: RecordEnvelope }> {
    return request<{ success: true; record: RecordEnvelope }>('/protocol-actions/specialize-for-experiment', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
```

**Step 2: Typecheck app**

```bash
cd /home/brad/git/computable-lab/app && npx tsc --noEmit
```
Expected: exit 0.

**Step 3: Commit**

```bash
cd /home/brad/git/computable-lab
git add app/src/shared/api/client.ts
git commit -m "feat(api-client): optional experimentId on specializeProtocolForExperiment"
```

---

### Task 4: Frontend — extract `resolveSpecializeTargets`, relax bail to studyId-only (TDD)

**Objective:** `ensureLocalProtocolDraft` proceeds for runs that have a studyId but no experimentId, and every early bail logs a `console.warn` (this bug must NEVER be silent again).

**Files:**
- Test: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.test.tsx`
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx:1159-1179`

**Step 1: Write failing tests** — append to `ProtocolTabPanel.test.tsx` and extend its import from `./ProtocolTabPanel` to include `resolveSpecializeTargets`:

```ts
describe('resolveSpecializeTargets', () => {
  const base = { kind: 'run', studyId: 'STU-scratch', plannedRunRef: { kind: 'record', id: 'PLR-x', type: 'planned-run' } };

  it('resolves studyId for a run without experimentId (the reported bug case)', () => {
    expect(resolveSpecializeTargets(base as Record<string, unknown>)).toEqual({
      studyId: 'STU-scratch',
      plannedRunId: 'PLR-x',
    });
  });

  it('carries experimentId through when present', () => {
    expect(resolveSpecializeTargets({ ...base, experimentId: 'EXP-1' } as Record<string, unknown>)).toEqual({
      studyId: 'STU-scratch',
      experimentId: 'EXP-1',
      plannedRunId: 'PLR-x',
    });
  });

  it('bails (null) for non-run records, already-local runs, missing studyId, missing plannedRunRef', () => {
    expect(resolveSpecializeTargets({ kind: 'planned-run' } as Record<string, unknown>)).toBeNull();
    expect(resolveSpecializeTargets({ ...base, localProtocolRef: { kind: 'record', id: 'LPR-1', type: 'local-protocol' } } as Record<string, unknown>)).toBeNull();
    expect(resolveSpecializeTargets({ kind: 'run', plannedRunRef: base.plannedRunRef } as Record<string, unknown>)).toBeNull();
    expect(resolveSpecializeTargets({ kind: 'run', studyId: 'STU-1' } as Record<string, unknown>)).toBeNull();
  });
});
```

**Step 2: Run tests — verify failure**

```bash
cd /home/brad/git/computable-lab/app && npx vitest run src/event-editor/right-pane/protocol/ProtocolTabPanel.test.tsx
```
Expected: FAIL — "resolveSpecializeTargets is not exported / is not a function".

**Step 3: Implement** — in `ProtocolTabPanel.tsx`, add an exported pure helper just above `ensureLocalProtocolDraft` (~line 1158):

```ts
/**
 * Resolve the inputs needed to draft a local protocol for a run, or null when
 * specialization is impossible. studyId is the ONLY hard requirement:
 * experiments are optional grouping (saved views) per the run schema, so a
 * study-only run still gets an editable draft. Every bail reason is logged by
 * the caller — this must never fail silently (2026-08-15: silent bail on
 * missing experimentId left the setup section read-only forever).
 */
export function resolveSpecializeTargets(
  runPayload: Record<string, unknown> | null | undefined,
): { studyId: string; experimentId?: string; plannedRunId: string } | null {
  if (!runPayload || runPayload.kind !== 'run') return null
  if (runPayload.localProtocolRef) return null // already on an LPR
  if (typeof runPayload.studyId !== 'string' || !runPayload.studyId) return null
  const plrId = (runPayload.plannedRunRef as { id?: string } | undefined)?.id
  if (typeof plrId !== 'string' || !plrId) return null
  const experimentId = typeof runPayload.experimentId === 'string' && runPayload.experimentId
    ? runPayload.experimentId
    : undefined
  return { studyId: runPayload.studyId, ...(experimentId ? { experimentId } : {}), plannedRunId: plrId }
}
```

Then rewrite the head of `ensureLocalProtocolDraft` (lines 1159-1179) to use it — note the `warn` on every bail:

```ts
  const ensureLocalProtocolDraft = useCallback(
    async (universal: { id: string; title?: string }) => {
      const runEnv = await apiClient.getRecord(runId)
      const rp = (runEnv?.payload ?? runEnv) as Record<string, unknown> | null
      const targets = resolveSpecializeTargets(rp)
      if (!targets) {
        console.warn(
          `[ProtocolTabPanel] cannot draft a local protocol for run ${runId} — need kind:'run', studyId, plannedRunRef and no existing localProtocolRef`,
          rp,
        )
        return
      }

      // 1. Create the draft local protocol, seeded from the inherited roles.
      const spec = await apiClient.specializeProtocolForExperiment({
        protocolId: universal.id,
        studyId: targets.studyId,
        ...(targets.experimentId ? { experimentId: targets.experimentId } : {}),
        title: `${universal.title ?? universal.id} (lab draft)`,
      })
      const lprId = spec?.record?.recordId ?? null
      if (!lprId) {
        console.warn('[ProtocolTabPanel] specializeProtocolForExperiment returned no recordId', spec)
        return
      }
```

and change the `plrId` lookup in step 2 (line ~1168/1183) to use `targets.plannedRunId` instead of re-reading `rp.plannedRunRef`. The rest of the function (re-point PLR, attach LPR to run, `cl:records-changed`, refetch) is unchanged.

**Step 4: Run tests — verify pass**

```bash
cd /home/brad/git/computable-lab/app && npx vitest run src/event-editor/right-pane/protocol/ProtocolTabPanel.test.tsx
```
Expected: PASS (old helper suites + 3 new).

**Step 5: Commit**

```bash
cd /home/brad/git/computable-lab
git add app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx app/src/event-editor/right-pane/protocol/ProtocolTabPanel.test.tsx
git commit -m "fix(protocol-tab): auto-specialize on studyId alone; never bail silently"
```

---

### Task 5: Frontend — fix the step-settings 400 (wrong id in URL) (TDD)

**Objective:** `fetchStepSettings` calls `/api/protocols/{PROTOCOL-id}/steps/{stepId}/settings` using the resolved protocol the steps were loaded from, not the run id.

**Files:**
- Test: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.test.tsx`
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx` (~line 886 state block, ~line 1023 state-set block, `fetchStepSettings` at 1259-1276)

**Step 1: Write failing test** — append (and add `stepSettingsUrl` to the import from `./ProtocolTabPanel`):

```ts
describe('stepSettingsUrl', () => {
  it('uses the resolved protocol id when known', () => {
    expect(stepSettingsUrl('CAN-proto-1', 'RUN-9', 'step-001'))
      .toBe('/api/protocols/CAN-proto-1/steps/step-001/settings');
  });
  it('falls back to the run id only when no protocol resolved (legacy)', () => {
    expect(stepSettingsUrl(null, 'RUN-9', 'step-001'))
      .toBe('/api/protocols/RUN-9/steps/step-001/settings');
  });
});
```

**Step 2: Run test — verify failure**

```bash
cd /home/brad/git/computable-lab/app && npx vitest run src/event-editor/right-pane/protocol/ProtocolTabPanel.test.tsx
```
Expected: FAIL — `stepSettingsUrl` not exported.

**Step 3: Implement** — in `ProtocolTabPanel.tsx`:

(a) Helper next to `resolveSpecializeTargets`:

```ts
/** Settings endpoints require a PROTOCOL id (400 NOT_A_PROTOCOL for a run id). */
export function stepSettingsUrl(stepsProtocolId: string | null, runId: string, stepId: string): string {
  return `/api/protocols/${stepsProtocolId ?? runId}/steps/${stepId}/settings`
}
```

(b) New state next to `universalProtocolId` (line ~890):

```ts
  // The UNIVERSAL protocol id the step list was loaded from — the id the
  // /protocols/:id/steps/:stepId/settings endpoints accept. Null until the
  // step load resolves one (then it's the attached protocol, or the LPR's
  // inherited universal protocol).
  const [stepsProtocolId, setStepsProtocolId] = useState<string | null>(null)
```

(c) In the load effect, right after `setUniversalRoleIds(resolvedRoleIds)` in the `if (!cancelled)` block (line ~1023-1036), add:

```ts
        setStepsProtocolId(stepsId)
```
(`stepsId` is the local already in scope at that point — line 989/1004.)

(d) `fetchStepSettings` (line 1259-1276):

```ts
  const fetchStepSettings = useCallback(async (stepId: string): Promise<void> => {
    // Return early if already cached
    if (stepSettings[stepId]) {
      return;
    }
    try {
      const res = await fetch(stepSettingsUrl(stepsProtocolId, runId, stepId));
      if (!res.ok) {
        console.warn(`Failed to fetch settings for step ${stepId}: ${res.status}`);
        return;
      }
      const data = await res.json();
      const fetchedSettings: Setting[] = data?.settings ?? [];
      setStepSettings(prev => ({ ...prev, [stepId]: fetchedSettings }));
    } catch (err) {
      console.error(`Error fetching settings for step ${stepId}:`, err);
    }
  }, [runId, stepsProtocolId, stepSettings]);
```

**Step 4: Run tests + typecheck**

```bash
cd /home/brad/git/computable-lab/app && npx vitest run src/event-editor/right-pane/protocol/ProtocolTabPanel.test.tsx && npx tsc --noEmit
```
Expected: PASS, exit 0.

**Step 5: Commit**

```bash
cd /home/brad/git/computable-lab
git add app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx app/src/event-editor/right-pane/protocol/ProtocolTabPanel.test.tsx
git commit -m "fix(protocol-tab): step settings fetched by resolved protocol id, not run id"
```

---

### Task 6: Full verification (gates + live browser)

**Objective:** Prove the fix end-to-end on the real running app.

**Step 1: Server gate**

```bash
cd /home/brad/git/computable-lab/server && npx vitest run src/protocol/ProtocolContextService.test.ts && npx tsc --noEmit
```
Expected: all pass, exit 0.

**Step 2: App gates**

```bash
cd /home/brad/git/computable-lab/app && npx tsc --noEmit && npx vitest run src/event-editor/right-pane/protocol/ProtocolTabPanel.test.tsx src/shared/shell/
```
Expected: exit 0, all pass.

```bash
cd /home/brad/git/computable-lab && npm run test -w app 2>&1 | tail -5
```
Expected: 1334+ passed, 52 failed / 5 errors — **identical failure set to the pre-existing baseline** (App, PdfViewer, RawRecordEditor, FindTabPanel, LabwareGlyph, DocumentEditor, ViewerToolbar, ProjectTabStrip, knowledge/literature/protocol-ide). If the count differs, diff the failing file list against the baseline before proceeding.

**Step 3: Restart backend** (user pre-approved backend restarts any time; the server change needs a reload):

```bash
# find + kill the old backend on 3001, then relaunch via start-app.sh or:
cd /home/brad/git/computable-lab/server && APP_BASE_PATH=.. nohup npx tsx src/server.ts > ../.run/backend.log 2>&1 &
# wait for readiness:
for i in $(seq 1 30); do curl -sf http://localhost:3001/api/health && break; sleep 1; done
```

**Step 4: Live browser verification (DOM-based — vision is broken on this profile)**

Navigate to `http://computable:5174/runs/RUN-2026-08-12-run-lm47?mode=protocol-planning`, wait ~5s, then assert via `browser_console`:

```js
(() => ({
  // the DRAFT hint must replace the PREVIEW hint
  draftHint: !!document.querySelector('[data-testid="protocol-setup-draft-hint"]'),
  previewHint: !!document.querySelector('[data-testid="protocol-setup-preview-hint"]'),
  // run record now points at a local protocol
}))()
```
Expected: `draftHint: true`, `previewHint: false`.

```js
(async () => {
  const r = await fetch('/api/records/RUN-2026-08-12-run-lm47');
  const p = (await r.json()).record.payload;
  return { localProtocolRef: p.localProtocolRef, lprKind: p.localProtocolRef?.type };
})()
```
Expected: `localProtocolRef` present, `type: 'local-protocol'`, id matches `/^LPR-/`.

```js
(async () => {
  const r = await fetch('/api/records/' + document.querySelector('[data-testid="protocol-setup-sections"]') && (await (await fetch('/api/records/RUN-2026-08-12-run-lm47')).json()).record.payload.localProtocolRef.id);
  const p = (await r.json()).record.payload;
  return { links: p.links, status: p.status, hasLabwares: (p.labwares ?? []).length > 0 };
})()
```
Expected: `links: { studyId: 'STU-scratch' }` (NO experimentId key), `status: 'draft'`, labwares seeded from the universal protocol's roles (the ghosted suggestion rows).

Then: read the console buffer — `Failed to fetch settings for step step-001: 400` must be GONE; and the setup rows must accept an edit (click a labware row, type, blur; then re-fetch the LPR record and confirm the row persisted to the record).

**Step 5: Idempotency check** — reload the page 3×. Expected: exactly ONE LPR for this run (no new LPR-* record created on subsequent loads; the run's `localProtocolRef` is unchanged). If a second LPR appears, stop and investigate the `specializedKeyRef` guard before closing.

**Step 6: Final commit check**

```bash
cd /home/brad/git/computable-lab && git status --short   # must be clean
git log --oneline -6
```

---

## Acceptance criteria (all must hold)

1. Fresh load of the run's Protocol tab in Planning mode shows the **draft** hint ("Draft local protocol — 'suggested' rows are ghosted…"), never the preview hint.
2. A new `LPR-*` record exists with `links: { studyId: 'STU-scratch' }` (no experimentId), `status: 'draft'`, `inherits_from → CAN-protocol-1785934813058`, seeded labware/equipment/material rows.
3. The run and its PLR are re-pointed at the LPR (run `localProtocolRef` set; PLR `sourceType: 'local-protocol'`); steps still load (17 steps) from the inherited universal protocol.
4. Setup rows are editable and edits persist to the LPR record.
5. No `Failed to fetch settings for step …: 400` in the console; `GET /api/protocols/{universal}/steps/step-001/settings` returns 200.
6. Reloading does NOT create additional LPRs.
7. Server + app typechecks clean; ProtocolContextService, ProtocolTabPanel, and shell test suites pass; full app suite failure set unchanged vs baseline.

## Risks & tradeoffs

- **Record mutation:** the fix creates an LPR and re-points the PLR + run on first load. Reversible (delete the LPR, restore refs) but it IS a data write — do the live check on the real dev DB as planned, not a throwaway one.
- **Race on double-specialize:** the in-memory `specializedKeyRef` + the `rp.localProtocolRef` re-check in `resolveSpecializeTargets` guard against double LPRs; a hard reload mid-request could theoretically race — covered by acceptance criterion 6.
- **Settings now mutate the UNIVERSAL protocol:** PATCHing step settings writes to the inherited universal protocol record (that's where steps live). That's the existing semantic for LPR steps (overrides model is not yet wired for steps) — out of scope here, flagged so it isn't discovered as a surprise later.
- **Vision tool broken:** `browser_vision` returns 500 "image input is not supported" (missing mmproj). Verify with DOM queries via `browser_console`, not screenshots.
- **Multi-actor repo:** re-verify git state before each commit (see header).
- **exactOptionalPropertyTypes:** conditional spreads only — a literal `experimentId: undefined` will typecheck-fail.

## Open questions

- (Resolved per Brad's direction, 2026-08-15) study-only is the right shape for a run's draft LPR — do NOT auto-attach an existing experiment.
- Should the same study-only relaxation be applied to `useProtocolInRun`'s PLR `links` (it already copies the run's experimentId through as-is)? — No change needed: it only copies what the run has.
