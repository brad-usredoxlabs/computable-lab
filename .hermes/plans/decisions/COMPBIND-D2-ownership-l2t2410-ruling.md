# ARCHITECT RULING — COMPBIND domain-set migration: one declaration accessor, D2 ownership (lane 2, l2t2410)

Date: 2026-11-06 00:10 EST. Decider: architect. Requested by: lane-2 orchestrator, handoff l2t2405
"Pending obligations #1" — COMPBIND advc-u5 D2 (`mixtureLabelRedundancy.ts:234` crash) is outside u6's
declared scope; ownership ruling owed.

Inputs read at source this session:
- `server/src/compiler/scientistIntent/mixtureLabelRedundancy.ts:226-242` — `:234`
  `if (nounShape?.stripDomains && !nounShape.stripDomains.has((contract.domain ?? '').toLowerCase())) continue;`
- `server/src/compiler/resolution/nounShape.ts:42, 70-109` — `stripDomains: ReadonlySet<string> | null`,
  built from the DATA policy (`stripDomains` must be a string list), lowercased into a Set.
- Shipped policy declares `stripDomains: [material]` (cited by advc-u5, `shorthand-drafting.yaml:79`).
- `server/src/compiler/scientistIntent/vocabulary.ts:53, 255, 270, 392` — trunk still types the slot
  `domain?: string`; u5's branch widens it to `string | readonly string[]`.
- `server/src/compiler/resolution/adapters.ts:261-269` — the filter leg (u6, live).
- advc verdict `reviews/L2-PROMPT2-COMPOSITION-BIND-1-advc-u5-l2t2345.md` D1/D2.

---

## 0. THE DEFECT

D2 is not a stray bug; it is the predictable cost of widening a slot that consumers read RAW. Line 234
calls `.toLowerCase()` on the declaration. Once the slot can be an array, that expression is
`undefined()` at runtime — a TypeError, on a LIVE path (the shipped policy sets `stripDomains`, so the
confinement branch is entered), for exactly the verbs u5 widened. u5 alone therefore breaks every
drafting run touching a transfer-family verb: advc is right that u5 and u6 are atomic.

Two consumers now read the slot with different polarity, and neither polarity can be inferred from the
other:

- **Resolution filter** (`adapters.ts`): "can this CANDIDATE land in this argument?" ⇒ eligible if ANY
  declared domain admits the candidate.
- **Strip confinement** (`mixtureLabelRedundancy.ts`): "is this ARGUMENT confined to strippable nouns?"
  ⇒ a strip candidate only if ALL of its declared domains are in `stripDomains`. With
  `[labware, material]` and strips `[material]`, the argument is NOT fully confined, so the C2/D3
  guarantee ("must NOT touch labware/source/target") survives the widening. ANY-of here would start
  stripping `source` mentions, which is the opposite of what that fix was for.

## 1. DECISION

1. **u5 + u6 + the D2 rider land as ONE atomic sequence.** No partial merge of the widening.
2. **One declaration accessor, in the owning module.** `scientistIntent/vocabulary.ts` exports
   `declaredDomains(arg): readonly string[]` — `string` ⇒ `[trim().toLowerCase()]`, array ⇒ mapped the
   same way, `undefined` ⇒ `[]`. Every consumer (adapters, mixtureLabelRedundancy, and any future
   reader) goes through it. No module may call `.toLowerCase()` on a domain slot, and no module outside
   `vocabulary.ts` may read `.domain` directly.
3. **D2 ownership = the rider, not a new item.** Rider unit `u7` on the u6 branch tip, files:
   `scientistIntent/vocabulary.ts` (the accessor + its widened type), `scientistIntent/
   mixtureLabelRedundancy.ts`, `resolution/adapters.ts` only if u6 leaves it reading raw, plus tests.
   Creating a second item would give one contract shape two owners mid-migration — the failure mode that
   already cost COMPBIND four units.
4. Polarities are as stated in §0, both expressed through `declaredDomains`, never as a name list.

## 2. ACCEPTANCE (RED first, pasted raw)

1. **RED at u5 tip, GREEN after u7**: a transfer-family intent with `source` resolving to a formulation,
   run under the shipped `stripDomains: [material]` policy, completes without a TypeError. (Today:
   `undefined is not a function`.)
2. **ALL-of confinement pin**: a contract declaring `[labware, material]` is NOT stripped while
   `stripDomains: [material]`.
3. **Retained-behaviour pin**: a contract declaring `[material]` alone IS stripped — the original C2/D3
   behaviour is unchanged by the migration.
4. **Filter polarity pin** (from `COMPBIND-DOMAINFILTER-l2t2300-ruling.md`): a candidate claiming
   `instrument` for `[labware, material]` is still rejected; a claim-free candidate stays eligible.
5. **Mutation** each of 2/3: flip ALL-of to ANY-of and pin 2 must go RED; drop the normaliser's
   `toLowerCase` and pin 3 must go RED.
6. **Grep pins**: zero `.toLowerCase()` applied to a domain slot outside `vocabulary.ts`; zero `.domain`
   reads outside `vocabulary.ts` in `server/src/compiler/**`; `npm run typecheck -w server` back to the
   0-error baseline at the merged tip (today's trunk has 33 pre-existing errors elsewhere — the merged
   tip must not add any, and must not add these two).

## 3. NON-GOALS

Changing `shorthand-drafting.yaml`'s `stripDomains: [material]` value; a second kind vocabulary; per-verb
exceptions; any domain-name literal in TypeScript.

## 4. SEQUENCING

u6 (live, filter leg) → u7 rider on u6 tip → one advc cycle over the combined branch → merge u5+u6+u7 in
that order → then SCIENCE-CHAIN-1's D1 unit may start (it consumes this declaration; it must not
introduce a second vocabulary). Nothing merges before u7 lands and the typecheck baseline is restored.
