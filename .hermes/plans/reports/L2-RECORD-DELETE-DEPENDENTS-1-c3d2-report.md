L2-RECORD-DELETE-DEPENDENTS-1 UNIT c3d2 Report
================================================

SUMMARY
-------
Declared cascadePolicyPath on RecordStoreConfig so the public factory,
scripts, and tests share ONE typed seam. Removed the ad-hoc intersection
type from the constructor that silently dropped the field at compile time.

RED (Mutation Proof)
--------------------
Removed '& { cascadePolicyPath?: string }' from RecordStoreImpl.ts constructor
param (line 108). TypeScript exited with errors:

  src/server.ts(532,5): error TS2353: Object literal may only specify known
  properties, and 'cascadePolicyPath' does not exist in type 'RecordStoreConfig'.
  src/store/RecordStoreImpl.ts(121,33): error TS2339: Property 'cascadePolicyPath'
  does not exist on type 'RecordStoreConfig'.
  src/store/RecordStoreImpl.ts(122,34): error TS2339: Property 'cascadePolicyPath'
  does not exist on type 'RecordStoreConfig'.

GREEN (Fix)
-----------
Added cascadePolicyPath?: string to RecordStoreConfig (types.ts, after line 262)
with doc comment stating: absent/undefined => empty policy (default-refuse).
Added cascadePolicyPath: '' to DEFAULT_CONFIG in RecordStoreImpl.ts to satisfy
the Required<> constraint.

VERIFICATION
------------
- npx tsc --noEmit -> exit 0, no output.
- vitest run (2 files) -> Test Files 2 passed (2), Tests 11 passed (11).
- grep cascadePolicyPath in server/src: only in types.ts, RecordStoreImpl.ts,
  server.ts:532, and the test — no orphaned intersection types remain.

CHANGED FILES (2)
-----------------
1. server/src/store/types.ts  — added cascadePolicyPath field to RecordStoreConfig
2. server/src/store/RecordStoreImpl.ts — removed intersection, added DEFAULT_CONFIG entry

CHANGED PATHS
-------------
server/src/store/types.ts
server/src/store/RecordStoreImpl.ts

SHA: a963d97ff028c9d064a37f4b000a61de263e4741

L2-RECORD-DELETE-DEPENDENCIES-c3d2 UNIT unit DONE a963d97ff028c9d064a37f4b000a61de263e4741
