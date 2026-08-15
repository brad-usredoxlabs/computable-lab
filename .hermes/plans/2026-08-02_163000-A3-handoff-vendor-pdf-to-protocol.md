# Handoff — Vendor PDF → Universal Protocol (A3 in progress)

> **UPDATE (2026-08-03): A3 blocker RESOLVED + verified at unit/gate level.** See
> "A3 RESOLVED" section below. Live-server E2E (restart + promote curl) still to be
> re-run by a human against the live server once it's reloaded.
> Main plan: `.hermes/plans/2026-08-02_121344-vendor-pdf-to-protocol-extraction.md`
> Milestone-1 plan (done): `.hermes/plans/2026-08-02_095032-ingestion-destination-vendor-pdf.md`
> CWD: /home/brad/git/computable-lab (branch feat/ai-extension-api). Backend server/, frontend app/.

---

## A3 RESOLVED (2026-08-03) — cause A + real cause B, both fixed & verified

The A3 promote blocker had TWO causes, both now fixed:

**Cause A (missing `recordId`) — FIXED.**
`buildProtocolBodyFromCandidate` did not emit top-level `recordId`, which
`protocol.schema.yaml` requires (`required: [kind, recordId, title, steps]`). The
promote path (`ExtractHandlers.promoteCandidate` → `CandidatePromoter.promoteCandidate`)
validates `candidate.draft` against the real schema, so this failed.
- `server/src/protocol/ProtocolExtractionService.ts`: `createDraftFromVendorPdf` now
  `await this.nextProtocolId()` and passes `recordId` into `buildProtocolBodyFromCandidate`,
  which emits `draftBody.recordId`.

**Cause B (real one the handoff only guessed at) — FIXED.**
`Expr` `$def` in `schema/workflow/protocol.schema.yaml` is a `oneOf` containing BOTH
`type: number` AND `type: integer`. An integer literal (`volume_uL: 200`, `duration_min: 30`)
matches BOTH branches → Ajv "must match exactly one schema in oneOf", which cascades into
failure of every step's `oneOf` (the promote error showed spurious
"Missing required property: source/wells/cycles", "Must equal transfer/mix"). This is a
pre-existing latent schema bug (present in HEAD, unrelated to the current uncommitted work).
- Fix: removed the redundant `- type: integer` branch from `Expr` (`type: number` already
  covers integers). Minimal, preserves intent, makes integer Expr values valid.

**Verification (all green):**
- `ProtocolExtractionService.test.ts` — 19 pass, incl. new assertion `draftBody.recordId` matches `/^PRT-/`.
- NEW `server/src/protocol/ProtocolExtractionDraftSchemaGate.test.ts` — builds a REAL Ajv
  validator from the repo `schema/` dir (the gate the mocked-store + in-memory E2E schemas
  missed). Two tests: (1) mapped draft validates against real `protocol.schema.yaml`; (2) the
  REAL `promoteCandidate` pipeline accepts the mapped draft and mints canonical + audit record
  (reproduces the exact failing A3 call). Passes.
- `npm run typecheck -w server` — clean.
- Pre-existing unrelated failures confirmed (fail on clean tree): `ExtractHandlers` upload test
  (asserts `kind` at envelope top-level, code puts it in payload), and all `ProtocolIde*` tests.

**NOTE for live E2E:** the existing persisted draft `XDR-000002` still holds the OLD body
(no `recordId`). It will NOT promote. You must REGENERATE a fresh draft first
(`POST /extraction/vendor-pdfs/VPDF-A1E2E0001/draft` → new XDR-id), then promote THAT. See
steps 6-7 below. Restart the backend first so it reloads `protocol.schema.yaml` + the service code.

---


## Where we are

**Milestone 1 (M1) — ingestion to first-class vendor-pdf — DONE and live.**
- `vendor-pdf` first-class schema (flat storage `records/vendor-pdf/`, free-floating, optional `links.studyId`).
- Top-level **Ingestion** destination (`/ingestion`), **Vendor PDFs** + **PubMed** tabs.
- Ingest writes a durable first-class `vendor-pdf` (Exa search → download → extract candidate → record), with `vendorProtocolCandidateRef.id` = candidate documentId.
- Run right-pane search tab now just links out to `/ingestion/vendor-pdf`. Lab has a **Vendor PDFs** category + "+ New PDF".

**PDF → universal-protocol pipeline — PARTIALLY activated (A1, A2 done; A3 blocked on a draft-shape bug).**
- A1 (backend bridge): `ProtocolExtractionService.createDraftFromVendorPdf` + `POST /extraction/vendor-pdfs/:vendorPdfId/draft`. Loads/regenerates the candidate, maps it into a universal-protocol draft, wraps in an `extraction-draft` (XDR-). Unit-tested.
- A2 (frontend): "Extract Protocol" button per vendor-pdf row in `VendorPdfWorkflowTab` → calls the A1 endpoint → navigates to `/extraction/review/:draftId`. Typecheck + tests green.
- A3 (end-to-end activate): BLOCKED — see below.

## Real bugs found & fixed during A3
1. **`schema/workflow/extraction-draft.schema.yaml` had a broken `$ref`**
   - It is the only computable-lab schema whose `$id` includes a subdir: `.../computable-lab/workflow/extraction-draft.schema.yaml`.
   - Ajv resolves `$ref` against the `$id` base URI (NOT file path). Common's `$id` is `.../computable-lab/common.schema.yaml` (no /core/, no /workflow/).
   - Original ref `../core/common.schema.yaml` → `.../computable-lab/core/common.schema.yaml` (unregistered) → draft creation failed: `can't resolve reference`.
   - **FIX APPLIED:** changed to `../common.schema.yaml` (resolves to `.../computable-lab/common.schema.yaml`). This was a latent blocker — no extraction-draft had ever been created until now.
   - Note: reverted a brief change to `schema/bio/sequence*.yaml` (unrelated, different namespace — leave as original `../core/common.schema.yaml`).

## A3 CURRENT BLOCKER (the only thing left to fix to close the loop)
Live E2E: draft create succeeded (`draftId=XDR-000002`), but **promote fails**:
`POST /api/extraction/drafts/XDR-000002/candidates/0/promote` with `-H "Content-Type: application/json" -d '{}'`
→ `{"error":"VALIDATION_ERROR","message":"schema validation failed","details":{"validation_errors":[ ... ]}}`
(Call with `-d '{}'` — empty body + application/json is rejected by Fastify.)

The validator (`promotion-compile` → `schema_validate_draft`, against the REAL `schema/workflow/protocol.schema.yaml`) reports the mapped universal-protocol draft is NOT schema-valid. Diagnosed causes, from the error text + protocol schema `$defs`:

**Cause A (definite): `buildProtocolBodyFromCandidate` does NOT emit top-level `recordId`.**
`protocol.schema.yaml` top-level `required: [kind, recordId, title, steps]`. The event-graph path (`buildProtocolBody`, line ~376) sets `recordId: <nextProtocolId()>`; the vendor mapper omits it. → "Missing required property: recordId".
**FIX:** in `server/src/protocol/ProtocolExtractionService.ts` → `buildProtocolBodyFromCandidate` (~line 928), add `recordId` to `draftBody` (call `this.nextProtocolId()` like `buildProtocolBody` does).

**Cause B (must confirm by inspecting the actual draft — likely step-shape conformity).**
Each step must match a `$defs` step union whose per-kind `required` are strict (schema lines 721-896):
- StepAddMaterial: `[kind, target{labwareRole}, wells, material{materialRole}, volume_uL]`
- StepTransfer: `[kind, source{labwareRole,wells}, target{labwareRole,wells}, volume_uL]`
- StepMix: `[kind, target{labwareRole}, wells]`
- StepWash: `[kind, target{labwareRole}, wells, cycles]`
- StepIncubate: `[kind, target{labwareRole}, duration_min]`
- StepRead: `[kind, target{labwareRole}, modality]`
- StepHarvest: `[kind, source{labwareRole}, wells]`
- StepOther: `[kind, description]`
- Base ProtocolStep: `required:[stepId,label,ordinal,kind]`, `stepId pattern ^[a-z][a-z0-9-]*$`.
The mapper (`mapActionToProtocolStep`, lines 956-1053) looks mostly compliant but the `oneOf` cascade in the error suggests at least one step is off — **inspect the real draft before changing the mapper**:
```bash
curl -s "http://localhost:3001/api/records/XDR-000002" | python3 -m json.tool
# look at candidates[0].draft — the exact body that failed validation
```

**Likely subtlety to watch:** `semanticVerb` is allowed (Step* schemas set no `additionalProperties:false`, so extra props are fine); `wells` must be a valid `WellSelector` (`{kind:"all"}` ok); steps currently emit `volume_uL` as a number (Expr allows number).

## How to finish A3 (next session)
1. Inspect `candidates[0].draft` of `XDR-000002` (GET above) — confirm the step shapes.
2. Patch `buildProtocolBodyFromCandidate`: add `recordId` (Cause A) + fix any step that fails the per-kind `required` (Cause B). Keep step `stepId`/`label`/`ordinal`.
3. Re-run A1 unit tests: `cd server && npx vitest run src/protocol/ProtocolExtractionService.test.ts` (expect 19 pass). Add/extend a test asserting the mapped draft validates against the real `protocol.schema.yaml` (the gate the mocked-store tests missed).
4. `npm run typecheck -w server`.
5. Restart backend to reload schema+draft changes: `cd /home/brad/git/computable-lab && ./start-app.sh` (user must approve/run; NOTE scripts chaining restart + mutating curl POSTs may be auto-blocked — run restart first, hold, then the E2E POSTs separately).
6. Live E2E (user runs, or fresh session drives it):
   - `curl -sX POST "http://localhost:3001/api/extraction/vendor-pdfs/VPDF-A1E2E0001/draft" -H "Content-Type: application/json" -d '{}'` → `draftId`
   - `curl -sX POST "http://localhost:3001/api/extraction/drafts/<draftId>/candidates/0/promote" -H "Content-Type: application/json" -d '{}'` → `recordId` (PRT-) + `promotionId` (XPR-)
   - `curl -s "http://localhost:3001/api/records/<PRT-...>" | python3 -m json.tool` → assert `source.type=="vendor"`, `protocolLayer=="universal"`, `steps` non-empty, `source.ref.type=="vendor-pdf"`.
   - Pass criteria = promote returns 201 + protocol validates + audit record exists.
7. Confirm the UI path too: `/ingestion/vendor-pdf` → "Extract Protocol" → review → Promote.

**E2E seed (persisted on disk, survives restart):**
- vendor-pdf record `VPDF-A1E2E0001` (title "A1 E2E Mini Vendor Protocol", extractedText = 2-step add/incubate), schemaIte on live server.
- Candidate JSON at `/home/brad/.computable-lab/worktrees/main/artifacts/foundry/protocol-candidates/doc-a1e2e-001.json` (reuse path — no LLM).
- `workspaceRoot` for the running server = `/home/brad/.computable-lab/worktrees/main` (records + artifacts live there).

## Follow-ons (deferred, not started)
- A4: promote `vendor-protocol-candidate` to a first-class record (durable/indexable/re-reviewable).
- A5 (optional): redraft/feedback loop so reject-and-retry yields a genuinely better LLM candidate (currently `regenerate` re-runs extraction; a feedback-driven redraft is the richer option).
- Phase 6: PubMed ingestion tab; Phase 7: relationship create path (`POST /relationships`).
- Unify the Exa-text-fallback ingest branch to also write a `vendor-pdf`.
- Localization (universal → local protocol via bind/specialize on event-editor) — separate future session; touchpoints documented in the main plan.

## Working notes for the session
- Typecheck: `npm run typecheck -w server` / `-w app`. Tests: `cd server && npx vitest run <file>` ; `cd app && npx vitest run <file>`.
- Pre-existing server test failures to ignore: `RepoAdapter` slugify (private fn not exported), `records/workflow` ENOENT (seed-data dirs absent).
- The terminal safety gate has been blocking some commands (especially restart+mutating-curl chains and even some read-only curls) — if a command is blocked, run the pieces separately / let the user run them, don't retry.
- Do NOT commit/push unless asked.
