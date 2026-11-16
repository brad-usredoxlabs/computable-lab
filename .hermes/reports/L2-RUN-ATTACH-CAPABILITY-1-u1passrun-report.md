# L2-RUN-ATTACH-CAPABILITY-1 / u1passrun — DONE report

- lane 2 · branch cl/lane2-runattach-cap-1116 · base 31282ff299622f055583a1a9f6e2059a536b7292
- item L2-RUN-ATTACH-CAPABILITY-1 UNIT u1passrun (D4 obligation from GC-BUNDLE r3)
- date 2026-11-16 (EST)
- governing line (architect-context-l2.md §2.7): "Identity is a record id, never a name";
  ruling RUN-IS-THE-PROVENANCE-RECORD-l2-20261114 (33b553abb): the RUN is the record of
  biological truth — an acquisition attaches to it and must name it.

## Problem (D4)
The SERVER door already accepts and forwards `body.sourceRunRef` onto the ACQP payload
(RunSheetHandlers.ts:222-224, acquisitionPackage.ts:524). The APP-side call dropped it: the
attach panel sent only deviceId + directoryKey + entryRef, so a minted ACQP record could not
name the run it was acquired under.

## Changes (5 files, +83 lines; 2 commits)
- app/src/shared/api/client.ts — `registerAcquisitionPackage` body type gains
  `sourceRunRef?: { kind: 'record'; id: string; type: string; label?: string }` (mirrors
  `materialRef`; body is JSON-forwarded unchanged, so no request-site change).
- app/src/run/gc/GcAttachPanel.tsx — optional `sourceRunRef` prop; forwarded with a
  conditional spread `...(sourceRunRef ? { sourceRunRef } : {})` — absent prop means absent
  key, never `{sourceRunRef: undefined}`.
- app/src/run/gc/GcSectionChrome.tsx — at the GcAttachPanel slot, pass the entry's OWN
  `e.payload.runRef` (EntryPayload.runRef, gcRunSheetModel.ts:53) as
  `{kind:'record', id, type:'run'}` via a conditional JSX spread. No runRef → no prop; no
  conjured identity (the section's `runId` prop is NOT used as a substitute).
- app/src/run/gc/GcAttachPanel.test.tsx — +1 test: sourceRunRef prop rides the register body
  verbatim. The pre-existing register-shape test (line ~116) is UNCHANGED and still green.
- app/src/run/gc/GcSectionChrome.test.tsx — the existing successful-register expectation now
  includes `sourceRunRef: {kind:'record', id:'RUN-C-1', type:'run'}` (that fixture entry
  carries payload.runRef at line 91); +1 negative test: an entry with no payload.runRef
  registers with a body that has NO sourceRunRef key (`'sourceRunRef' in body === false`).

## Deviation to note for review (declared, not hidden)
The brief's PROHIBITED list says "editing the existing register-call-shape test's
expectations", but its own AC1 requires the run provenance to reach the body and the
GcSectionChrome fixture `ENTRY_NO_PKG` (test line 86-95) carries
`runRef: {id:'RUN-C-1'}`. With the chrome passthrough in place, that existing chrome-level
expectation MUST gain the sourceRunRef line — it is the correct expected body under AC1, not
a weakened check (the negative test pins that the key is truly absent without a runRef, and
the GcAttachPanel no-prop shape test remains untouched). No panel-level expected body was
edited.

## Verification (final commit 5f86d87f3, tree clean)
- RED first: new panel test failed `AssertionError: expected "spy" to be called with
  arguments` (missing `sourceRunRef`), 1 failed | 14 passed at base.
- GREEN: `cd app && npx vitest run src/run/gc/GcAttachPanel.test.tsx
  src/run/gc/GcSectionChrome.test.tsx`
  → `✓ GcAttachPanel.test.tsx (15 tests)` `✓ GcSectionChrome.test.tsx (22 tests)`
  → `Test Files 2 passed (2)` `Tests 37 passed (37)`
- `cd app && npx tsc --noEmit -p tsconfig.json` → 17 pre-existing errors, ALL in unrelated
  files (SchemaRecordForm.tsx, RefCombobox.ontologyref.test.tsx, tabNavPlugin.ts,
  RecordCreatePanel.*.test.tsx); grep for `GcAttachPanel|GcSectionChrome|client.ts` returns
  zero errors. No new errors in the touched files.
- server/ untouched (door already forwards); schema/ untouched (sourceRunRef already in the
  ACQP schema); gcRunSheetModel.ts, ResultsDrawer.tsx untouched.

## Not mine
Browser acceptance (AC1 live: attach on a real GC run page → minted ACQP payload carries
sourceRunRef equal to the page's run record id) is the lane's GC-BUNDLE gate; no servers were
started.

## Next actions
- Orchestrator: reload lane stack before the browser leg (no YAML changed, but the app bundle
  changed).
- Browser reviewer: open a GC run page entry's attach panel, register a .D, read the minted
  ACQP payload's sourceRunRef.

L2-RUN-ATTACH-CAPABILITY-1 UNIT u1passrun DONE f7872ab35197e7a5429654079c02fd926fbf9c90
