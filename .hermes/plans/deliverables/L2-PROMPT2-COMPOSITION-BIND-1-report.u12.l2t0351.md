# L2-PROMPT2-COMPOSITION-BIND-1 UNIT u12 Report

## Task
Route both resolution-side consumers of a declared domain slot through the one
scientistIntent/vocabulary.ts accessor (declaredDomains) and pin the ruling's source-scan
discipline, so the widened string | string[] slot can never be read raw or lowercased outside
the owning module.

## Changes (4 files, ~97 insertions, ~27 deletions)

### 1. server/src/compiler/resolution/adapters.ts
- Added import of declaredDomains from ../scientistIntent/vocabulary.js
- claimsConflictingLandingZone: removed .toLowerCase() on the slot parameter (tag arrives normalised by declaredDomains)
- filterCandidatesByDeclaredDomain: replaced inline typeof domain === 'string' ? [domain] : domain with declared = declaredDomains(domain)

### 2. server/src/compiler/resolution/strategies.ts
- Added import of declaredDomains from ../scientistIntent/vocabulary.js
- withDomainFilter: ONE read of the slot (declaredSlot = req.declared.domain) with annotation
- Route through declaredDomains(declaredSlot) and declaredDomains(req.expectedDomain)
- containsExpected uses normalised array inclusion instead of .toLowerCase() comparison
- Disagreement trace uses cardinality rule: length 1 -> bare tag, length > 1 -> [a, b]
- doc expected side preserves the DOC's raw req.expectedDomain text

### 3. server/src/compiler/resolution/nounResolution.test.ts (line 593)
- Before: domain-expectation: declared labware vs doc expected cellType for transfer.source
- After: domain-expectation: declared [labware, material] vs doc expected cellType for transfer.source
- Added comment: D3 (advc-full-l2t2475): transfer.source is declared [labware, material] since the u5 widening

### 4. server/src/compiler/resolution/domainAccessorDiscipline.test.ts (NEW)
- Source scan over server/src/compiler/**/*.ts excluding *.test.ts
- (a) Zero occurrences of declared.domain outside scientistIntent/vocabulary.ts, EXCEPT exactly one line in resolution/strategies.ts (the annotated declaredSlot read)
- (b) Zero occurrences of domain.toLowerCase() / Domain!.toLowerCase() outside scientistIntent/vocabulary.ts
- Header quotes ruling c94bd866 section 2 item 6 and COMPBIND-D2-ownership-l2t2410-ruling.md:67

## Accessor Call Sites Created
1. server/src/compiler/resolution/adapters.ts:269 - const declared = declaredDomains(domain)
2. server/src/compiler/resolution/strategies.ts:52 - const declaredTags = declaredDomains(declaredSlot)
   server/src/compiler/resolution/strategies.ts:53 - const expectedTags = declaredDomains(req.expectedDomain)

## Verification Evidence

### Test Suite (4 files)
Test Files  4 passed (4)
Tests       29 passed (29)

### Mutation Proof (D4)
Mutation: const declared = declaredDomains(domain); -> const declared: readonly string[] = [];
Result: domainSetFilter.test.ts - 2 failed | 4 passed (6) [RED]
Restored: 6 passed (6) [GREEN]

This proves the filter now routes through the accessor - the exact mutation (a) the reviewer ran,
which stayed 6/6 GREEN before.

### Typecheck
npx tsc --noEmit -p . - no output (clean)

### Git Diff (from 3b3739fc)
server/src/compiler/resolution/adapters.ts          | 18 +++---
server/src/compiler/resolution/domainAccessorDiscipline.test.ts | 73 ++++++++++++++++++++++
server/src/compiler/resolution/nounResolution.test.ts |  4 +-
server/src/compiler/resolution/strategies.ts        | 29 ++++-----
4 files changed, 97 insertions(+), 27 deletions(-)

## Commits
89c32f3b u12: update D3 trace pin and add domain-accessor-discipline source-scan test
ed18c22b u12: route withDomainFilter through declaredDomains accessor (strategies.ts)
4469f403 u12: route filterCandidatesByDeclaredDomain through declaredDomains accessor (adapters.ts)

## D3 Trace Rendering
- Before: domain-expectation: declared labware vs doc expected cellType for transfer.source
- After: domain-expectation: declared [labware, material] vs doc expected cellType for transfer.source

## Owed (outside scope)
- D8 (whitespace-only -> ['']): vocabulary.ts is frozen this cycle; owed to a later unit

L2-PROMPT2-COMPOSITION-BIND-1-u12 UNIT unit DONE 89c32f3b7cd72063859dcb36290da5e01bbbc14b