# Plan: Fix promoted-protocol titles in the run Protocol tab

## Goal
When an extracted vendor protocol is promoted and shown in a run's Protocol tab (a.k.a. the "Lab Protocols" / "attach to run" list), it must display a **helpful, human title** (e.g. "Molecular Probes™ CellROX™ Green Flow Cytometry Assay Kit"), never a meaningless "Quick Reference CAN-protocol-12345".

## Current context / assumptions (verified by reading the code)
- **What the user sees**: in a run's Protocol tab, the protocol selector (`app/src/event-editor/right-pane/protocol/ProtocolSelector.tsx`) lists free-floating `protocol` records as "Lab Protocols". Each row renders `title` + `recordId` (lines `titleOf(p) || p.recordId`, then the id below). The real promoted record is `CAN-protocol-<ts>` with `title: "Quick Reference"`, so the UI shows "Quick Reference CAN-protocol-<ts>". The color/title complaint is squarely about the record's `title`.
- **Promoted protocol records** live under the records store, e.g. `protocol/CAN-protocol-1788724666201__quick-reference.yaml` and `protocol/CAN-protocol-1788721664608__june-2023.yaml`. Titles observed: "Quick Reference", "June 2023" — both unhelpful. The user's just-promoted one (from Molecular Probes™ CellROX™ / Fisher Scientific) is "Quick Reference".
- **Root cause (title source)**: promotion is `server/src/extract/CandidatePromoter.ts`. At lines 135-141 the new canonical record is minted as:
  ```ts
  const record: CanonicalRecord = {
    ...candidate.draft,      // <-- title comes from HERE
    kind: candidate.target_kind,
    recordId: targetRecordId,
  };
  ```
  So `record.title` = `candidate.draft.title`, which the LLM extractor wrote (often "Quick Reference", "June 2023", "Untitled"). There is no upstream title override.
- **The good title EXISTS and is reachable**: the source vendor-pdf record (referenced by the promoted protocol's `source.ref.id`, e.g. `VPDF-651F03789D80`) has a descriptive `title` ("Molecular Probes™ CellROX™ Green Flow Cytometry Assay Kit"). The extractor's system prompt even receives it (`server/src/ai/systemPrompt.ts` lines 205-213 feed `Source PDF` `- title: ...`), but the draft's `title` field isn't forced to it.
- **Run-tab listing path is server-driven**: `server/src/protocol/ProtocolContextService.ts` `getProtocolContext()` returns `labProtocols`/`availableProtocols` = free-floating `protocol` records. `ProtocolSelector` renders `titleOf(record)` = `record.payload.title`.
- **Two real issues to fix, both at promotion time (data quality)**, so every future promoted protocol is good and the run tab immediately shows the fix:
  1. The promoted protocol `title` should default to the **source vendor-pdf's title** when available, falling back to the candidate draft title.
  2. (Secondary, same root) The `steps[].label` "Protocol steps not detected" / "No actionable steps were extracted..." indicates the extractor produced an empty/unhelpful step list — improving extraction quality is out of scope, but the title fix is cheap and mechanical.
- The user mentioned promoting from the review page; existing promoted records cannot be retro-repaired in place without deciding, so the plan fixes **future** promotions AND **backfills** the existing mis-titled ones (see Task 4).

## Architecture / proposed approach
- **Fix the title at promotion time** in `server/src/extract/CandidatePromoter.ts`: after minting the record, if the source artifact resolves to a vendor-pdf with a `title`, set `record.title` to it (unless the candidate draft already has a distinct, non-generic title). Keep `shortSlug` derived from the title for stable filenames.
- **Derive a good title client-side too** as a safe fallback: no code change needed to how ProtocolSelector renders — it already shows `title`; once the title is fixed at promotion the display is fixed. So the UI change is nil; the whole fix is server-side + a backfill.
- **Backfill existing bad titles** (Quick Reference / June 2023 / generic) from their linked source vendor-pdf, so the currently-attached run protocols are usable now.

## Step-by-step tasks

### Task 1 — Promote with a source-derived title (RED test first)

The function is `promoteCandidate(args: PromoteCandidateArgs)` in `server/src/extract/CandidatePromoter.ts` — synchronous. It mints `record = { ...candidate.draft, kind, recordId }` (lines 137-141), so `record.title` === `candidate.draft.title`. The source's real title is NOT currently passed in; it must be added as a new field on `PromoteCandidateArgs` and threaded by the (async) caller, because `promoteCandidate` cannot `store.get` itself.

Add to `server/src/extract/CandidatePromoter.test.ts` (matching the existing `promoteCandidate({...})` literal style shown at lines 51-60):

```ts
it('uses the source title when the draft title is generic', () => {
  const candidate = createCandidate('protocol', {
    title: 'Quick Reference',
    steps: [{ stepId: 's1', ordinal: 1, label: 'a', kind: 'other', description: 'b' }],
  });
  const outcome = promoteCandidate({
    candidate,
    draftRecordId: 'XDR-001',
    candidatePath: 'candidates[0]',
    sourceArtifactRef: { kind: 'record', id: 'VPDF-651F03789D80' },
    sourceTitle: 'Molecular Probes CellROX Green Flow Cytometry Assay Kit', // NEW arg
    targetRecordId: 'CAN-protocol-123',
    targetSchemaIdByKind,
    validator: createStubValidator(true),
    now: fixedNow,
  });
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  expect(outcome.record.title).toBe('Molecular Probes CellROX Green Flow Cytometry Assay Kit');
});
```

Run `npx vitest run server/src/extract/CandidatePromoter.test.ts` → the new test **fails** with the record title still "Quick Reference".

### Task 2 — Implement the title override in `CandidatePromoter.ts`

In `server/src/extract/CandidatePromoter.ts`:
- Add `sourceTitle?: string` to the `PromoteCandidateArgs` interface (line ~20-30), near `sourceArtifactRef`.
- After minting `record` (line ~141) and before `computeContentHash(record)` (line ~144), override the title conditionally. Because `record` is `const` today, re-declare or spread:

```ts
const sourceTitle = args.sourceTitle?.trim();
const DRAFT_GENERIC = /^(quick reference|untitled|unsigned|protocol steps not detected|june \d{4})$/i;
let canonicalRecord: CanonicalRecord = record;
if (sourceTitle) {
  const draftTitle = typeof record.title === 'string' ? record.title.trim() : '';
  const replace = !draftTitle || DRAFT_GENERIC.test(draftTitle);
  if (replace) {
    canonicalRecord = { ...record, title: sourceTitle };
  }
}
```

Use `canonicalRecord` (instead of `record`) in `computeContentHash` and as the returned `outcome.record`. If the schema carries `shortSlug` and the draft had one derived from a now-replaced title, also refresh it from the source title only if `shortSlug` was generic/derived — keep minimal; if unsure, leave `shortSlug` untouched and rely on `title` alone for display (the UI reads `title`).

This is deliberately conservative: only replace when the draft title is missing or matches the generic set; a specific hand-authored draft title is always preserved.

Run the test → **pass**. Run `npx vitest run server/src/extract/CandidatePromoter.test.ts` and `npm run typecheck -w server`.

Commit: `fix(extract): promote vendor protocols with the source PDF title`.

### Task 3 — Wire `sourceTitle` from the vendor-pdf into promotion

`server/src/api/handlers/ExtractHandlers.ts` already calls `promoteCandidateLogic(promoteArgs)` at line 220, with `sourceArtifactRef: draft.source_artifact` (line 207), and has `store` (line 56). Add a small async lookup just before `promoteArgs` is built (near line 207): if `draft.source_artifact.kind === 'record'` (the vendor-pdf form), fetch the source record and read its title:

```ts
let sourceTitle: string | undefined;
if (draft.source_artifact?.kind === 'record' && draft.source_artifact?.id) {
  const srcEnv = await store.get(draft.source_artifact.id).catch(() => null);
  const srcPayload = (srcEnv?.payload ?? null) as Record<string, unknown> | null;
  if (srcPayload && typeof srcPayload.title === 'string' && srcPayload.title.trim()) {
    sourceTitle = srcPayload.title.trim();
  }
}
```

Then add `sourceTitle` to the `promoteArgs` passed to `promoteCandidateLogic`. (Only set it when truthy — it's optional.)

Extend `server/src/api/handlers/ExtractHandlers.test.ts` (it exists): add a case where a draft has `source_artifact: { kind: 'record', id: 'VPDF-X' }`, the store's `get('VPDF-X')` returns a vendor-pdf with a meaningful `payload.title`, and the promoted protocol record's `title` equals that title (not a generic draft title). Follow the file's existing mock-store style. Run `npx vitest run server/src/api/handlers/ExtractHandlers.test.ts` → passes.

Run `npm run typecheck -w server`.

Commit: `fix(extract): thread source PDF title into promotion`.

### Task 4 — Backfill existing mis-titled promoted protocols

Non-destructive data fix: for each existing `protocol` record whose `title` is generic (Quick Reference / June 2023 / etc.), find its `source.ref.id` → load the vendor-pdf → set the protocol `title` to the vendor-pdf title.

Implement as a **one-off script** (NOT a committed migration unless desired), e.g. `scripts/backfill-protocol-titles.mjs` at repo root, run once:

```mjs
// Loads every protocol record, and for generic titles derives a good one
// from the linked vendor-pdf, then writes it back via the record API or store.
import { ... } from './...' // reuse the record store / fetch
```

Operations:
1. `GET records?kind=protocol` (or read the store) → for each record with generic title:
2. parse `source.ref.id`.
3. `GET record <vendorPdfId>` → `payload.title`.
4. `PUT /records/:recordId` with `{ ...payload, title: goodTitle, shortSlug: slugify(goodTitle) }` (payload-replace semantics; preserve everything else).

Verification: run the script, then `GET records?kind=protocol` — the three CAN-protocol records now show e.g. "Molecular Probes™ CellROX™ Green Flow Cytometry Assay Kit"; the run Protocol tab (refresh) lists that title instead of "Quick Reference CAN-protocol-...".

**Do NOT hand-edit YAML files** — use the record PUT path so the index/stores stay consistent.

### Task 5 — (Frontend, defensive) show a friendlier fallback label when title is generic

In `app/src/event-editor/right-pane/protocol/ProtocolSelector.tsx` line `titleOf` (line 42-45): if the computed title matches the generic set, show `title || 'Untitled PDF protocol'` but ALSO append nothing weird. This is a UI-safety net only; the real fix is Tasks 1-4. Keep it minimal:

```ts
const GENERIC = /^(quick reference|untitled|june \d{4})$/i;
function titleOf(p: { payload?: unknown }): string {
  const payload = p.payload as Record<string, unknown> | undefined;
  const t = typeof payload?.title === 'string' ? payload.title : '';
  return t && !GENERIC.test(t) ? t : (t || 'Untitled PDF protocol');
}
```

Update `ProtocolSelector.test.tsx` if it asserts titles. Run `npm run typecheck -w app` and `npx vitest run app/src/event-editor/right-pane/protocol/ProtocolSelector.test.tsx`.

## Tests / validation summary
- `CandidatePromoter.test.ts`: title-override case (RED→GREEN).
- `ExtractHandlers.test.ts`: source-title-threading case (create if missing).
- `ProtocolSelector.test.tsx` / typechecks: `npm run typecheck -w server`, `npm run typecheck -w app`.
- Live check: after backfill, `curl .../api/records?kind=protocol` shows the CellROX title; refresh the run's Protocol tab.

## Risks, tradeoffs, open questions
- **Conservatism of title override**: replacing the draft title with the source title could drop a deliberately-authored specific title (e.g. the user manually renamed the protocol before promoting). Mitigation: only replace when the draft title is missing/generic (Task 2's regex), never when specific. Open: whether promotion UI before commit should let the user override; out of scope.
- **shortSlug regeneration**: changing `shortSlug` alters the file path (e.g. `__cellrox-...yaml`). Backfill Task 4 uses the PUT path which stores under the new slug; confirm the store handles rename (it observed "autogenerated"/"source:vendor" tags on the existing ones — renaming is fine). Edge: if the PUT preserves `recordId`, references stay valid.
- **Multiple protocols from one PDF**: if two candidates from the same vendor-pdf are both promoted, both get the same title — acceptable (they'd also get distinct recordIds). Could append a disambiguator; not needed now.
- **Step-quality issue ("Protocol steps not detected")** is a separate extraction-quality problem, NOT fixed here. Flag it for a follow-up plan if the user wants better step extraction.
- **The "right hand tab" naming**: I'm treating the Protocol tab's "Lab Protocols" selector (`ProtocolSelector.tsx`) as the target surface because it's the attach-to-run list. If the specific surface was a different rail (`RunWorkspaceRightRail.tsx` — Copilot/Method Summary), confirm with the user; the outcome (better titles) helps all of them.