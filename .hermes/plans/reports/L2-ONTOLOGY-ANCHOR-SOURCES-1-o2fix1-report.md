# L2-ONTOLOGY-ANCHOR-SOURCES-1 o2fix1 Report

## Unit: o2fix1 (D1 + D2 only)

### D1 — Fix 4 TS errors in localObo.ts (BLOCKER)

**Problem:** Under `noUncheckedIndexedAccess`, four indexed reads in `localObo.ts` produced `string | undefined` where `string` was expected: lines 98, 117, 123, 124.

**Fix:** Applied `?? ''` fallbacks at each indexed access:
- Line 98: `stanza.split(/^\\[/m)[0]` → `(stanza.split(/^\\[/m)[0] ?? '')`
- Line 117: `synonymMatch[1]` → `synonymMatch[1] ?? ''`
- Line 123: `idMatch[1].trim()` → `(idMatch[1] ?? '').trim()`
- Line 124: `nameMatch[1].trim()` → `(nameMatch[1] ?? '').trim()`

Semantics unchanged — `split` always returns at least one element, and regex `.exec()` returns non-null matches (the loop guards `!== null`). The fallbacks satisfy the type checker without altering runtime behavior.

**Verification:** `tsc --noEmit` shows 0 errors in localObo.ts (only pre-existing S3StorageProvider error remains).

### D2 — Scoped request to failed source surfaces named error (MAJOR)

**Problem:** `searchLocal` checked `localIds` (only successfully-loaded entries). When a local source was configured but failed to load, `localIds` excluded it, so `ontologies=lwo` with lwo failed yielded `{"results":[],"total":0}` with no `errors` array — a silent empty success.

**Fix:** Added `configuredLocalIds` to the cache, combining success IDs + failure source IDs. The `searchLocal` decision uses `configuredLocalIds`, so a request naming a failed source still triggers the local path, which surfaces the failure in `errors`.

**Verification:** 2 D2 tests GREEN:
1. Scoped to failed-only source → errors array present with named failure
2. Mixed good+failed source → errors array contains the failure

### Changed Files (4 files)

1. `server/src/resolve/providers/localObo.ts` — 4 lines changed (D1: `?? ''` on 4 indexed reads)
2. `server/src/api/handlers/OntologyHandlers.ts` — 8 lines changed (D2: `configuredLocalIds` + updated `searchLocal` guard)
3. `server/src/api/handlers/OntologyHandlers.test.ts` — new file, 91 lines (D2 RED→GREEN tests)
4. This report

### Verification Commands and Results

**1. tsc --noEmit:**
```
src/storage/S3StorageProvider.ts(87,33): error TS2307: Cannot find module '@aws-sdk/client-s3' or its corresponding type declarations.
```
Only pre-existing plumbing error. 0 errors in localObo.ts. GREEN.

**2. vitest localObo.test.ts:**
```
✓ src/resolve/providers/localObo.test.ts (8 tests)
Test Files  1 passed
Tests  8 passed
```
GREEN — all 8 original tests pass.

**3. vitest OntologyHandlers.test.ts:**
```
✓ src/api/handlers/OntologyHandlers.test.ts (2 tests)
Test Files  1 passed
Tests  2 passed
```
GREEN — both D2 tests pass.

### Commits

1. `eff24db8` RED test: D2 scoped-to-failed-source returns named error
2. `e6b99a45` D1: fix 4 TS errors in localObo.ts (noUncheckedIndexedAccess)
3. `318d159b` D2: searchLocal uses configuredLocalIds (incl. failed) so errors surface
4. This commit (report + marker)

L2-ONTOLOGY-ANCHOR-SOURCES-1-o2fix1 UNIT o2fix1 DONE a386b91df9649def1127381af579c6c94a49336e
L2-ONTOLOGY-ANCHOR-SOURCES-1-o2fix1 UNIT o2fix1 DONE 67874faa288df75c3bd2fe44dd1137b4aaa6aed6
