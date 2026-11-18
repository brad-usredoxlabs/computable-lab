L2-SUBPROTOCOL-EXPAND-1-g6leg2b — /labware-editor product door (lane 2; unit b of g6).
One seam: register /labware-editor in App.tsx + page mounting LabwareEventEditor inside
LabwareEditorProvider (3rd mount point; extends g4labmount 9eade927; no 2nd provider).

Commits (branch cl/lane2-subproto-g6leg2b-1747, base da4f6063):
  8d05179c (1/2) page + provider-pin test ; 79219c75 (2/2) App.tsx route (+1 import)
  8c12f722 (fix) test trimmed to 60-line budget (comment-only; behavior identical)

Changed files — git diff --stat da4f6063..HEAD: 4 owned paths only:
  app/src/App.tsx +2 ; graph/LabwareEditorRoutePage.tsx +30 (new)
  graph/LabwareEditorRoutePage.test.tsx +57 (new) ; this report

Verified at HEAD (cmd => measured):
  cd app && npx vitest run src/graph/RunEditorRouter.mount.test.tsx => 1 file / 1 test passed
  cd app && npx vitest run src/graph/LabwareEditorRoutePage.test.tsx => 1 file / 1 test passed
  cd app && npx tsc --noEmit 2>&1 | grep -c 'error TS' => 1 [pre-existing; unchanged]
  grep -n 'path="/labware-editor"' app/src/App.tsx => line 249 (exactly one); `*` at 251

RED proof — delete <LabwareEditorProvider>, run, restore:
  REMOVED: npx vitest run src/graph/LabwareEditorRoutePage.test.tsx
    => 1 file / 1 test FAILED
       Error: useLabwareEditor must be used within a LabwareEditorProvider
         at useLabwareEditor (graph/context/LabwareEditorContext.tsx:832:11)
  RESTORED: same cmd => 1 file / 1 test passed [pin not vacuous]
Next: browser gate (lane-stack reload) — /labware-editor?id=&runId= renders the real
editor, not NotFoundRoute (acceptance belongs to the independent browser reviewer).

L2-SUBPROTOCOL-EXPAND-1-g6leg2b UNIT unit DONE 3821f19df91c54b6f3d57a188181fc5f780dd874
