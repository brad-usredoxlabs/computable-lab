# L2-SPEC-SHEET-INGEST-1 / f3verify2 — probe report

Item: `L2-SPEC-SHEET-INGEST-1-f3verify2` (lane 2, re-cut of f3verify)
Branch: `cl/lane2-specsheet-doorb1-0114`
Base: `18b36804345785500868bcd221533aee60bab39e` (f3fix3 `WIP AT EXIT` commit)
HEAD at verification start: `3f010692708cdbb773161856acdab4c8ff17738d`

`18b36804` is an ancestor of HEAD; the whole delta is this unit's own work:

```
A  server/src/api/handlers/L2-SPEC-SHEET-INGEST-1-f3verify2-report.md
M  server/src/schema/composedProperties.test.ts
```

The test extension was produced by the first pass of this unit (commit `046cd5af`):
P1's pin was vacuous, so a pin was added. This revision re-ran all three probes
first-hand on the tree above. Every raw block below is from these runs.

## Verdict

| probe | mutation | raw result |
|---|---|---|
| P1 (D3 wiring) | `server.ts:804` factory bypass | RED — 1 failed \| 18 passed (19) |
| P2 (D2 cycle guard) | `composedProperties.ts:40` `$id`-keyed guard | RED — 2 failed \| 17 passed (19) |
| P3 (D4 strictness) | `composedProperties.ts:61` `unevaluatedProperties` arm | RED — 2 failed \| 17 passed (19) |

Product files are BYTE-IDENTICAL to base at exit. Only the test file changed
(9 existing cases kept, +2 wiring cases).

## Baseline at base (test file restored to `18b36804`)

```
$ cd server && node node_modules/vitest/vitest.mjs run \
    src/schema/composedProperties.test.ts \
    src/api/handlers/RecordHandlers.provenanceInjection.test.ts
 ✓ src/api/handlers/RecordHandlers.provenanceInjection.test.ts  (8 tests) 5ms
 ✓ src/schema/composedProperties.test.ts  (9 tests) 274ms

 Test Files  2 passed (2)
      Tests  17 passed (17)
```
Restored afterwards: `git checkout HEAD -- ...composedProperties.test.ts` →
`git -c core.fileMode=false status --short` empty.

## P1 — D3 wiring (`server/src/server.ts:804`)

Edit applied alone (verbatim diff of the only hunk):

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

Raw result — RED:

```
❯ src/schema/composedProperties.test.ts  (11 tests | 1 failed) 488ms
   ❯ src/schema/composedProperties.test.ts > D3 wiring — server.ts → RecordHandlers > server.ts wires getSchemaProperties to makeGetSchemaProperties(ctx.schemaRegistry)
     → expected 'getSchemaProperties: (probeSchemaId: …' to be 'getSchemaProperties: makeGetSchemaPro…' // Object.is equality

- Expected
+ Received

- getSchemaProperties: makeGetSchemaProperties(ctx.schemaRegistry),
+ getSchemaProperties: (probeSchemaId: string) => {

 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 18 passed (19)
```

Revert: `git checkout -- server/src/server.ts` →
`git -c core.fileMode=false status --short` empty.

## P2 — D2 cycle guard (`server/src/schema/composedProperties.ts:40`)

Edit applied alone (verbatim diff):

```diff
-  const visited = new Set<Record<string, unknown>>();
+  const visited = new Set<string | undefined>();
...
-    if (visited.has(obj)) {
+    // P2 PROBE (D2): old $id-keyed guard, inert on nodes without $id.
+    const id = (obj.$id as string) ?? undefined;
+    if (id !== undefined && visited.has(id)) {
```

Raw result — RED (both cycle fixtures):

```
FAIL  src/schema/composedProperties.test.ts > getComposedProperties > terminates on $ref cycle without throwing
FAIL  src/schema/composedProperties.test.ts > makeGetSchemaProperties — real registry > fragment-pointer cycle without $id terminates
AssertionError: expected [Function] to not throw an error but 'RangeError: Maximum call stack size e…' was thrown

- Expected:
undefined

+ Received:
"RangeError: Maximum call stack size exceeded"

 ❯ src/schema/composedProperties.test.ts:224:61

 Test Files  1 failed | 1 passed (2)
      Tests  2 failed | 17 passed (19)
```

Revert: `git checkout -- server/src/schema/composedProperties.ts` → status empty.

## P3 — D4 strictness (`server/src/schema/composedProperties.ts:61`)

Edit applied alone (verbatim diff):

```diff
-    if (obj.additionalProperties === false || obj.unevaluatedProperties === false) {
+    // P3 PROBE (D4): unevaluatedProperties arm removed.
+    if (obj.additionalProperties === false) {
```

Raw result — RED (aliquot strictness plus the dedicated `unevaluatedProperties` case):

```
 FAIL  src/schema/composedProperties.test.ts > makeGetSchemaProperties — real registry > aliquot resolves FAIRCommon via relative ref and reports strict
AssertionError: expected true to be false // Object.is equality
 FAIL  src/schema/composedProperties.test.ts > makeGetSchemaProperties — real registry > unevaluatedProperties: false makes allowsAny false
AssertionError: expected true to be false // Object.is equality
      Tests  2 failed | 17 passed (19)
```

Revert: `git checkout -- server/src/schema/composedProperties.ts` → status empty.

## Final green (after all three reverts)

```
 ✓ src/api/handlers/RecordHandlers.provenanceInjection.test.ts  (8 tests) 5ms
 ✓ src/schema/composedProperties.test.ts  (11 tests) 488ms

 Test Files  2 passed (2)
      Tests  19 passed (19)
```

## Typecheck (once)

```
$ npm run typecheck -w server
> @computable/server@1.0.0 typecheck
> tsc --noEmit
TYPECHECK_EXIT=0
```
No error lines. `server/tsconfig.json` excludes `**/*.test.ts`; no non-test `.ts` changed.

## Invariants

```
git diff --stat 18b36804..HEAD -- server/src/schema/composedProperties.ts server/src/server.ts
→ (empty)
git diff --name-only 18b36804..HEAD -- schema/
→ (empty)   [0 YAML files — no lane reload needed]
grep -nE "material-instance|aliquot|event-graph|labware-definition|protocol|\.yaml" \
  server/src/schema/composedProperties.ts
→ no match (exit 1)
git -c core.fileMode=false status --short
→ (empty)
```

`RecordHandlers.ts` untouched — its 8/8 provenance pin still 8/8. Return shape
`{hasCreatedAt, hasUpdatedAt, hasCreatedBy, allowsAny}`, the `undefined` return
for unknown schema ids, the `allOf`/inline-branch walk and the intra-document
`#/$defs/...` arm are unchanged. No `191/205` count is claimed; only what these
runs measured.

## Note on the P1 pin

A schema unit test cannot boot `createServer` without a full app/records fixture,
so P1 is pinned twice: structurally at the wiring line (exactly one
`getSchemaProperties:` line, and it is the factory call) and behaviourally at the
handler seam (`createRecordHandlers` fed the real-registry factory injects
`createdAt`/`updatedAt`/`createdBy` for an aliquot, which is strict — provenance
arrives as fields, never via `allowsAny`).

`report_commit:` names the commit carrying this report body; the DONE marker is
committed immediately after it and adds only that one line.

report_commit: 3c3e938f5ca80c9864ddf67dff72777f59e728e0
L2-SPEC-SHEET-INGEST-1 UNIT f3verify2 DONE 3c3e938f5ca80c9864ddf67dff72777f59e728e0
L2-SPEC-SHEET-INGEST-1-f3verify2 UNIT unit DONE 3c3e938f5ca80c9864ddf67dff72777f59e728e0
