# PROTO-AI-8 report (lane 2, token l2t2031) — WIP deliverable

Branch `wt/PROTO-AI-8-lane2-l2t2031` @ commit `2feea85425ceefd7384d71cb450c280a5445a089`
(off `cl/integration-2` @ 8f12388b). NOT merged. Task list untouched.

## What landed

- `app/src/event-editor/right-pane/protocol/protocolStepEditing.ts`
  — ADDED `addLabwareRole`/`updateLabwareRole`/`deleteLabwareRole` +
  `addInstrumentRole`/`updateInstrumentRole`/`deleteInstrumentRole`.
  Mirrors `updateMembership`'s touch-only-declared-lists discipline: sibling
  role lists (materialRoles, …) ride through untouched; a protocol that never
  declared the list gains only that list; an emptied list pops cleanly and an
  emptied `roles` object pops with it (never `labwareRoles: []` on a record).
  Role edits pass the SAME kind-only/inherited + content-lock gates as step
  edits (`assertRolesEditable`); duplicate roleId on add and undeclared roleId
  on update/delete are rejections.
- `app/src/event-editor/right-pane/protocol/protocolEditOps.ts` (NEW)
  — `applyOps(payload, ops, {mint?})` PURE (input payload never mutated;
  asserted in tests): applies ops in listed order through the human gated fns
  (`editableProtocolSteps`, `insertProtocolStep`, `deleteProtocolStep`, the new
  role fns). Every rejection throws `Edit op <index> (<op>): <gate's own
  reason>`. `applyProtocolEdit(protocolId, ops)` = getRecord → apply →
  ONE `apiClient.updateRecord(id, payload, { expectedSha })`.
- Tests: `protocolEditOps.test.ts` (16) + 6 new role-op tests in
  `protocolStepEditing.test.ts` (13 total).

## Acceptance verification (measured, not asserted)

RED first: the applier did not exist when `protocolEditOps.test.ts` was
written (import failure = RED); implementation then drove it to GREEN, with
four intermediate REDs fixed by CORRECTING TEST EXPECTATIONS to the gates'
real semantics (gate order on last-step/executed-step and lock-first-op),
never by weakening a gate.

- Every op kind applies, incl. `step_update` with `kind` + `settings`
  (array form) — mixed 9-op batch test asserts steps, membership sync
  (variants/branch_axes incl. then/else lists; `source` untouched), role add/
  update(listed-fields-only)/delete, purity of input.
- Gate rejections name the OP INDEX: last-step delete → `/op 2 .*at least one
  step/`; executed-step delete → `/op 1 .*executed/`; content-locked protocol
  → `/op 0 .*locked/` (the lock trips on the FIRST gated op — asserted where
  it actually fires); duplicate stepId on insert (mint collision seam) →
  `/op 1 .*already exists/`; role id collision → `/op 0 .*already exists/`;
  plus missing anchor (op 0), ghost role delete (op 1), unknown op (op 0).
- Ordinal renumbering matches the server rebuild: test asserts applier output
  is a fixed point of server `rebuildOrdinals` (protocol-steps.ts:151-156:
  sort by ordinal, re-number 1..N) AND contiguous 1..N.
- Double-accept idempotence: update-only proposal applied twice → second is a
  NO-OP (`wrote: false`), total writes across both accepts = 1; structural
  proposal re-applied after landing → throws `op 1` (step_delete of s3 is
  gone) with ZERO writes issued. Never a double mutation.
- sha-conflict: mocked 409 `SHA mismatch: …` → rejects with an Error whose
  message is VERBATIM `Someone changed this protocol - reload and try again.`
  (test asserts `STALE_PROTOCOL_WRITE_MESSAGE` string-equals the exact text),
  `updateRecord` called exactly once (the conflicting PUT), `getRecord`
  exactly once — nothing re-queued, no auto re-propose (D4).
- Targeted suites green: `protocolEditOps.test.ts` 16/16,
  `protocolStepEditing.test.ts` 13/13 (existing 7 preserved).

## Command evidence

- Full app unit suite (vitest run, JSON reporter) BEFORE my changes:
  279 files / 1861 tests, 23 failing files, 64 failing tests (pre-existing red set).
  AFTER: 280 files / 1883 tests, SAME 23 failing files, 64 failing tests.
  NEW failing files: none. (`/tmp/proto-ai-8-vitest-before.json`,
  `/tmp/proto-ai-8-vitest-after.json` on the exec host.)
  Both my suites pass in the after run.
  `npm run test:unit -w app` is the sanctioned invocation; I ran
  `npx vitest run` from `app/` (identical command the workspace script execs).
- `npx tsc --noEmit` (app): BEFORE 41 `error TS` lines; AFTER 41 — identical
  set, ZERO errors in protocolEditOps.ts / protocolEditOps.test.ts /
  protocolStepEditing.* (`/tmp/proto-ai-8-tsc-before.txt`,
  `/tmp/proto-ai-8-tsc-after2.txt`).
- No installs run; symlinked node_modules sufficed. Trunk
  /mnt/vast/home/brad/git/computable-lab untouched; lane stack :3093/:5193
  untouched; no server/schema/prompt/UI file touched.

## Documented decisions (per spec "decide ONE and document")

1. RICH TEXT: a `description` change DERIVES a consistent
   `descriptionRichText { plainText, document }` using the human modal's own
   `plainTextDocument` fallback (ProtocolStepEditModal.tsx:20-28, paragraphs
   on blank lines, hardBreaks within). Chosen over clearing because the
   modal's reload rule (`rich.plainText === text` honours the document) then
   accepts the derived doc verbatim, and clearing would strip formatting from
   steps the AI only touches lightly. Trade-off: a derived document carries no
   formatting marks — honest, since the proposal carries only plain text.
   A step whose plain `description` an op does NOT change keeps its existing
   rich text untouched (the modal's staleness rule already protects it).
2. stepId mint: EXACTLY the human shape `step-` + 24 lowercase hex via
   `crypto.getRandomValues(new Uint8Array(12))` (same code as
   ProtocolStepEditModal.tsx:88), injectable `mint` seam for deterministic
   tests. Confirmed legal under `^[a-z][a-z0-9-]*$`.
3. `settings`: the op's `Setting[]` array REPLACES the step's array wholesale
   (schema: "Replacement step-level settings"), same listed-fields-only
   semantics as label/notes/kind.
4. No-op detection: structural deep-equality of payload before vs after
   `applyOps`; equal → return `wrote:false`, no PUT (double-accept no-op
   branch). Structural proposals can never be equal after landing (delete of
   a gone step / minted-id insert collide) → conflict branch instead.
5. Role-op gates: inherited/locked throw mirror the STEP gate messages
   ("inherited" / "locked") so op-index-tagged errors stay recognizable.
6. Gate-firing order observed and encoded: the content-lock trips on the
   first gated op of any kind (op 0 in the fixture), and executedness trips
   before the ≥1-step gate on the specific step deleted.

## Verified anchors (spec orientation confirmed against trunk 8f12388b)

- protocolStepEditing.ts editableProtocolSteps :43, updateMembership :60,
  insertProtocolStep :74, deleteProtocolStep :86 — all confirmed at/around
  the quoted lines.
- ProtocolStepEditModal.tsx mint :88, rich companion :89-91, plainTextDocument
  :20-28 — confirmed.
- Envelope schema/workflow/protocol-edit-op.schema.yaml — op vocabulary,
  settings ARRAY ruling, rich-text ruling, minted stepId, RoleId pattern
  `^[a-z0-9][a-z0-9_-]*$` all read end-to-end; untouched.
- Server sha-conflict wire shape: store `SHA mismatch` → 409
  (RecordHandlers.ts:953-960); client `ApiError` surfaces it at status 409 —
  my `isStaleShaConflict` matches exactly that shape; any other 4xx propagates
  verbatim.
- `apiClient.updateRecord(id, payload, {expectedSha})` body-top-level —
  client.ts:2356-2360 confirmed; ProtocolNavPanel.tsx:120-126 is the rail's
  existing getRecord→update pattern I mirrored (meta.contentSha read
  structurally; kernel.ts's meta type predates contentSha — same pre-existing
  TS2339 pattern as ProtocolNavPanel, but zero NEW errors in my files).

## Assumptions / notes for the orchestrator

- "ZERO writes queued" on sha conflict interpreted as: the single PUT is the
  conflict itself; nothing further is queued, re-read, or retried (asserted:
  updateRecord ×1, getRecord ×1).
- The applier does NOT itself re-validate the envelope against the schema
  (server PROTO-AI-7 validates the proposal before accept; schema stays the
  single validation authority; `ProtocolEditOp` here is a type mirror only).
- PROTO-AI-9's panel will call `applyProtocolEdit(protocolId, proposal.ops)`
  and render `{wrote, payload}` or the thrown message; `cl:records-changed`
  dispatch is left to the UI owner, consistent with the rail pattern.
- Un-consumed risk (unchanged from spec §Notes): no live E2E pre-merge; the
  unit gate is the contract here, browser proof lands with PROTO-AI-9.
