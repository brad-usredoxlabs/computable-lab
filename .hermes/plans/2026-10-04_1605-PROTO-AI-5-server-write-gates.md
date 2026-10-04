# PROTO-AI-5 spec — Server-side write gates (human-equivalent enforcement on ordinary paths)

Lane 2 · campaign `ai-protocol-edit-and-router` · dep PROTO-AI-1 ✓, PROTO-AI-4 ✓ (merged).
Branch off `cl/integration-2` in your OWN worktree. ONE worker on this item.

## Goal
Close every client-only gate gap PROTO-AI-1(a) named, on BOTH the dedicated protocol-steps
endpoints AND the whole-record `PUT /records/:id` path, so an AI-accepted write (or plain curl)
gets exactly the human editor's safety net. Gates are the defence against a confidently-wrong
model (LOCKED campaign decision 4).

## Orientation — verified findings (from PROTO-AI-1-grounding-map.md; cite, do not re-derive)
The two write paths:
1. Dedicated step endpoints `server/src/api/routes/protocol-steps.ts`, mounted `server.ts:1446-1448`.
2. Whole-record `PUT /records/:id` → `RecordHandlers.updateRecord` (`server/src/api/handlers/RecordHandlers.ts:631-968`)
   → `RecordStoreImpl.updateUnlocked` (`server/src/store/RecordStoreImpl.ts:634`), Ajv at `:684`, lint `:697`.

Client gate module (the semantics to mirror): `app/src/event-editor/right-pane/protocol/protocolStepEditing.ts`
- kind-only/protocol-kind editable — `:33`
- content-lock: `lifecycleId` && state ∈ {approved, effective, superseded, archived} — `:34-36`
- ≥1 step must remain — `:79`
- executed-undeletable: `startedAt || completedAt` — `:80-81`
- stale anchor / duplicate id on insert — `:66-67`

GAPS to close (PROTO-AI-1(a) table + open questions):
- **G1 executed-step delete is ABSENT on the whole-record PUT** (present route-side only at
  `protocol-steps.ts:502-509`, `STEP_ALREADY_EXECUTED`, checks `startedAt` only). No `executionMeta`
  check exists in `RecordHandlers.updateRecord` or `RecordStoreImpl.updateUnlocked`. The human
  delete path (ProtocolNavPanel.tsx:122) uses PUT and relies on the client. → add the gate on PUT.
- **G2 content-lock is ABSENT at route level on the step endpoints** — backstopped only at store
  (`RecordStoreImpl.ts:661`), but the endpoint still answers 200 (see G5). → add a route-level
  lifecycle/state check with a stable code.
- **G3 ≥1-step is schema-Ajv only** (`schema/workflow/protocol.schema.yaml:301-303`, minItems 1);
  no route-level count check; PUT surfaces real 422 (`RecordHandlers.ts:866-873`), step endpoints
  swallow it. → ensure a stable machine-readable code on both paths (PUT: map the Ajv minItems
  failure to a named code; endpoints: stop swallowing).
- **G4 stepId uniqueness not enforced on the whole-record PUT** (`POST /steps` checks at
  `protocol-steps.ts:426-429` `DUPLICATE_STEP_ID`; no schema `uniqueItems` on `steps`; only client
  `protocolStepEditing.ts:67`). → add a server duplicate-stepId check on PUT (and rebuild contiguity).
- **G5 false-200 result-discard:** every mutation in `protocol-steps.ts` except the subgraph POST
  ignores `ctx.store.update(...)`'s result (`:367-372 PATCH step`, `:452-457 POST step`,
  `:518-523 DELETE step`, `:684-689 PATCH settings`). A store refusal (Ajv / controlled lock) still
  answers HTTP 200 with the "updated" object. → surface the real failure status/code.
- **Stale expectedSha conflict** behaviour must stay unchanged (conflict), not converted to another code.

Symmetry rule to pick (PROTO-AI-1 open q7): the STRICTER client rule (`startedAt || completedAt`)
is the target for the executed-step gate.

## Scope / ownership
- `server/src/api/routes/protocol-steps.ts` (+ its test `protocol-steps.test.ts`)
- `server/src/api/handlers/RecordHandlers.ts` (the `updateRecord` PUT path) (+ test)
- Follow the repo's EXISTING enforcement/gate patterns and cite the pattern in code comments;
  do NOT invent a parallel gate mechanism. Stable machine-readable error codes per gate.
- Do NOT touch: schema YAML (no schema change needed — minItems already exists), the AI intent
  path (PROTO-AI-7's), or any app/ file.
- Preserve happy paths byte-stable and the stale-sha conflict intact.

## Acceptance criteria (VERIFY, do not assert)
- RED-first API tests (supertest against real handlers, mirroring `protocol-steps.test.ts`):
  - deleted-executed-step via PUT → its error code, persists NOTHING (read back unchanged);
  - last-step delete via PUT → code, persists nothing;
  - locked/controlled protocol step+role edit via PUT AND via the step endpoints → code, persists nothing;
  - duplicate stepId via PUT → `DUPLICATE_STEP_ID`, persists nothing;
  - store-refusal on a step endpoint → not a false 200;
  - happy paths byte-stable; stale-sha conflict intact.
- `npm run test:run -w server` targeted suite green; full-suite failing-file set no worse than the
  RED baseline (~125 failed files at trunk — measure before/after, report the delta, no NEW failures).
- `npx tsc --noEmit -p server/tsconfig.json` zero new errors (baseline ~33 pre-existing).

## Deliverable (UNIQUE path)
- Worker report: `.hermes/plans/PROTO-AI-5-report.wip-<token>.md` (canonical name untouched).
- Commit on your branch `wt/PROTO-AI-5-lane2-<token>` off current `cl/integration-2` HEAD. Do NOT merge.

## Notes
- cl-scout is currently impaired (compression disabled + context_length mismatch); orientation above
  is from the authoritative PROTO-AI-1 map plus orchestrator local inspection — verify anything you
  rely on by reading the source.
- exactOptionalPropertyTypes is on (server): optional means absent OR value, never undefined.
- The lane stack serves the TRUNK worktree, which cannot see your unmerged YAML/code; for a live E2E
  run your own fresh process on a private port, never touch :3001/:5174/:3093.
