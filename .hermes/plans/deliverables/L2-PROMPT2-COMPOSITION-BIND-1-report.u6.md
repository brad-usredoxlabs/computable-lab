# L2-PROMPT2-COMPOSITION-BIND-1 Unit 6 Report — Domain Filter Set Semantics

## Step 0 — Pre-flight

Base: 6ffa6a94 (u5 tip, re-base already done)
- git merge-base --is-ancestor 6ffa6a94 HEAD: true
- vocabulary.ts:53 shows `domain?: string | readonly string[]` (u5 merged, type widened)
- Anchor re-derivation:
  - adapters.ts:265 — `export function filterCandidatesByDeclaredDomain(` — CONFIRMED
  - adapters.ts:267 — `domain: string | undefined,` — CONFIRMED (current single-string param)
  - adapters.ts:269 — `if (!domain) return { eligible: candidates, rejected: [] };` — CONFIRMED
  - adapters.ts:261 — `function claimsConflictingLandingZone(candidate: RankedCandidate, domain: string)` — CONFIRMED
  - adapters.ts:236 — `export function declaredNamespacesForDomain(domain: string | undefined)` — CONFIRMED
  - strategies.ts:50 — `const effectiveDomain = req.declared.domain ?? req.expectedDomain;` — CONFIRMED
  - strategies.ts:51 — filterCandidatesByDeclaredDomain call — CONFIRMED
  - types.ts:37 — `expectedDomain?: string;` — CONFIRMED
  - vocabulary.ts:55 — `domain?: string | readonly string[];` — CONFIRMED (widened by u5)
  - nounResolution.test.ts:128 — `expect(labwareContract.domain).toBe('labware');` — CONFIRMED
- Baseline typecheck: 0 errors

## Step 1 — RED: Test file creation

Test file: server/src/compiler/resolution/domainSetFilter.test.ts
Three arms: set membership, conflict arm, no-claim arm.
At current types, the filter function only accepts string|undefined — array args will fail compile.

## Step 2 — adapters.ts changes

Widen filterCandidatesByDeclaredDomain parameter to `string | readonly string[] | undefined`
Normalize to array internally. Call declaredNamespacesForDomain per-tag.

## Step 3 — strategies.ts changes

effectiveDomain becomes string | readonly string[] | undefined
Disagreement trace uses membership check, not !==

## Verification

[To be filled as we verify]

L2-PROMPT2-COMPOSITION-BIND-1-u6 UNIT 6 DONE 6ffa6a94b3f9abaa90f934bf3241609a3f3e9acf
