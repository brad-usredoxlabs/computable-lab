# L2-SPEC-SHEET-INGEST-1 / f3verify2 Report

Verification-only unit. Base: `18b36804345785500868bcd221533aee60bab39e`
(branch `cl/lane2-specsheet-doorb1-0114`, clean tree at start, no rebase/merge).
The three f3fix3 majors are exercised by applying each mutation probe ALONE,
recording the raw RED, and reverting.

## Result

| probe | target | verdict |
|---|---|---|
| P1 (D3 wiring) | `server.ts:804` factory bypass | first run GREEN → pin was vacuous; test extended; re-run RED |
| P2 (D2 cycle guard) | `composedProperties.ts:40` `$id`-keyed guard | RED on first run |
| P3 (D4 strictness) | `composedProperties.ts:61` unevaluatedProperties arm | RED on first run |

Product files are BYTE-IDENTICAL at exit (`composedProperties.ts`, `server.ts`).
Only the test file changed: +2 cases (9 existing kept), 11+8 = 19 green.

## Baseline (base 18b36804, clean tree)

```
cd server && node node_modules/vitest/vitest.mjs run \
  src/schema/composedProperties.test.ts \
  src/api/handlers/RecordHandlers.provenanceInjection.test.ts
```
```
 ✓ src/api/handlers/RecordHandlers.provenanceInjection.test.ts  (8 tests) 6ms
 ✓ src/schema/composedProperties.test.ts  (9 tests) 281ms

 Test Files  2 passed (2)
      Tests  17 passed (17)
```

## P1 — D3 wiring (`server.ts:804`)

Edit applied verbatim (single line replaced, 17 lines in):

```diff
-      getSchemaProperties: makeGetSchemaProperties(ctx.schemaRegistry),
+      // P1 PROBE (D3 wiring): bypass makeGetSchemaProperties — raw $id lookup,
+      // top-level properties only (pre-f3 behaviour).
+      getSchemaProperties: (probeSchemaId: string) => {
+        const probeEntry = ctx.schemaRegistry.getById(probeSchemaId);
+        if (!probeEntry) return undefined;
+        const probeRoot = probeEntry.schema as Record<string, unknown>;
+        const probeProps = (probeRoot.properties ?? {}) as Record<string, unknown>;
+        return {
+          hasCreatedAt: Object.prototype.hasOwnProperty.call(probeProps, 'createdAt'),
+          hasUpdatedAt: Object.prototype.hasOwnProperty.call(probeProps, 'updatedAt'),
+          hasCreatedBy: Object.prototype.hasOwnProperty.call(probeProps, 'createdBy'),
+          allowsAny: !(probeRoot.additionalProperties === false || probeRoot.unevaluatedProperties === false),
+        };
+      },
```

First run — STAYED GREEN (the finding):

```
 ✓ src/api/handlers/RecordHandlers.provenanceInjection.test.ts  (8 tests) 6ms
 ✓ src/schema/composedProperties.test.ts  (9 tests) 289ms

 Test Files  2 passed (2)
      Tests  17 passed (17)
```

Diagnosis: `composedProperties.test.ts:149` constructs `makeGetSchemaProperties`
itself; it never reads `server.ts`, so mutating the wiring site could not fail
any test. The pin was vacuous at the wiring seam (no product defect — the
factory behaviour was already pinned).

Repair (test only — `server/src/schema/composedProperties.test.ts`, new
`D3 wiring — server.ts → RecordHandlers` describe):
1. asserts `server.ts` has exactly one `getSchemaProperties:` wiring line and
   that it is `makeGetSchemaProperties(ctx.schemaRegistry)` — any inline
   raw-`$id`/top-level lookup fails it;
2. drives `createRecordHandlers` with the real registry factory and asserts an
   aliquot create receives `createdAt`/`updatedAt`/`createdBy` (provenance via
   FAIRCommon, never via `allowsAny`).

P1 re-run after the repair — RED:

```
 ❯ src/schema/composedProperties.test.ts (11 tests | 1 failed)
   ❯ ... > server.ts wires getSchemaProperties to makeGetSchemaProperties(ctx.schemaRegistry)
     → expected 'getSchemaProperties: (probeSchemaId: …' to be 'getSchemaProperties: makeGetSchemaPro…'

- getSchemaProperties: makeGetSchemaProperties(ctx.schemaRegistry),
+ getSchemaProperties: (probeSchemaId: string) => {

 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 18 passed (19)
```

Revert proof (`git checkout -- server/src/server.ts`):
`git -c core.fileMode=false status --short` → (empty)

## P2 — D2 cycle guard (`composedProperties.ts:40`)

Edit applied verbatim:

```diff
-  const visited = new Set<Record<string, unknown>>();
+  const visited = new Set<string | undefined>();
...
-  function walk(obj: Record<string, unknown>) {
-    if (visited.has(obj)) {
-      // Cycle detected — skip this branch
-      return;
-    }
-    visited.add(obj);
+  function walk(obj: Record<string, unknown>) {
+    // P2 PROBE (D2): old $id-keyed guard, inert on nodes without $id.
+    const id = (obj.$id as string) ?? undefined;
+    if (id !== undefined && visited.has(id)) {
+      // Cycle detected — skip this branch
+      return;
+    }
+    visited.add(id);
```

Raw result — RED:

```
 ❯ src/schema/composedProperties.test.ts (9 tests | 1 failed)
   ❯ ... > fragment-pointer cycle without $id terminates
     → expected [Function] to not throw an error but 'RangeError: Maximum call stack size e…' was thrown

- Expected: undefined
+ Received: "RangeError: Maximum call stack size exceeded"

 ❯ src/schema/composedProperties.test.ts:221:61

 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 16 passed (17)
```

Revert proof: `git -c core.fileMode=false status --short` → (empty)

## P3 — D4 strictness (`composedProperties.ts:61`)

Edit applied verbatim:

```diff
-    if (obj.additionalProperties === false || obj.unevaluatedProperties === false) {
+    // P3 PROBE (D4): unevaluatedProperties arm removed.
+    if (obj.additionalProperties === false) {
```

Raw result — RED (2 cases):

```
 FAIL ... > aliquot resolves FAIRCommon via relative ref and reports strict
AssertionError: expected true to be false  (composedProperties.test.ts:158 allowsAny)

 FAIL ... > unevaluatedProperties: false makes allowsAny false
AssertionError: expected true to be false  (composedProperties.test.ts:179 allowsAny)

 Test Files  1 failed | 1 passed (2)
      Tests  2 failed | 15 passed (17)
```

Revert proof: `git -c core.fileMode=false status --short` → (empty)

## Final green (after revert; 9 + 2 new + 8)

```
 ✓ src/api/handlers/RecordHandlers.provenanceInjection.test.ts  (8 tests) 5ms
 ✓ src/schema/composedProperties.test.ts  (11 tests) 501ms

 Test Files  2 passed (2)
      Tests  19 passed (19)
```

## Typecheck (once, after the test change)

```
cd /home/brad/cl-wt/L2-SPECSHEET-doorB1-lane2 && npm run typecheck -w server
> @computable/server@1.0.0 typecheck
> tsc --noEmit
TYPECHECK_EXIT=0
```
No error lines. (`server/tsconfig.json` excludes `**/*.test.ts`, so the changed
test file is not typechecked; no non-test `.ts` changed.)

## Invariants checked

```
git diff --stat 18b36804..HEAD -- server/src/schema/composedProperties.ts server/src/server.ts
→ (empty)
git diff --name-only 18b36804..HEAD -- schema/
→ (empty)   [0 lines: no YAML touched, no lane reload needed]
grep -nE "material-instance|aliquot|event-graph|labware-definition|protocol|\.yaml" \
  server/src/schema/composedProperties.ts
→ no match (exit 1)
git diff --name-status 18b36804..HEAD
M  server/src/schema/composedProperties.test.ts
```
`RecordHandlers.ts` untouched (8/8 pin still 8/8). Return shape, the `undefined`
for unknown ids, the `allOf`/inline walk and the `#/$defs/...` arm are unchanged.
No `191/205` count claimed — only what these runs measured.

## Note for the reviewer

P1's pin is structural at the wiring line (a schema unit test cannot boot
`createServer` without a full app/records fixture) plus behavioral at the
handler seam. The literal probe above is RED against it.
