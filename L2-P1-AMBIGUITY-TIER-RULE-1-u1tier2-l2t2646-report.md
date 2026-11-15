# L2-P1-AMBIGUITY-TIER-RULE-1 u1tier (unit 1 of 2 — DEFECT 1) — report

Item file: `L2-P1-AMBIGUITY-TIER-RULE-1-u1tier2-l2t2646.txt`
Worktree: `/home/brad/cl-wt/L2-P1-AMBIGUITY-TIER-RULE-1-u1-lane2`
Branch: `cl/lane2-ambiguity-tier-u1-l2t2644`
Base: `af7459c82b04e06bc60a9b953ab3146f0bc2febc`
Ruling: DEFINITION-IDENTITY-UNIQUENESS (amended option (a)); corpus scenario prompt-1 legA2
(r13 receipts `PROMPT1-GATE-r13-20261115T155704Z/legA2/trail.json`).

DEFECT 2 (answered-slot bind-by-id) is a SEPARATE dispatch; `shorthandChat.ts` was NOT touched.

## What the fix does

Declared tier preference between a labware-DEFINITION candidate and a legacy `kind:labware`
seed, ordered by RECORD DATA — never a special case. A `labware-definition` candidate
outranks a legacy `kind:labware` seed at the same demanded referent role. A genuine
same-tier tie still clarifies (never "highest confidence wins").

The rule is DATA; the code is a generic interpreter with zero kind/name literal in TS
(data-shape-of-policy law, CLAUDE.md "code never makes policy decisions").

Three owned edit sites (per brief):
1. `server/src/resolve/providers/records.ts` — the spine record candidate rides the record's
   own kind on the EXISTING `RankedCandidate.termKind` field (`...(kind ? { termKind: kind } : {})`,
   absent never undefined — exactOptionalPropertyTypes safe). `kind` is the loop variable at the
   `hits.push` site (no new lookup).
2. `schema/scientist-intent/scientist-intent-vocabulary.yaml` — declares the rule under
   `policies.ambiguity` (the mode/strategyRef/confidenceAccept bytes are UNCHANGED):
   ```
   candidatePrecedence:
     - whenKinds: [labware, labware-definition]
       supersededByKind: labware-definition
   ```
3. `server/src/compiler/resolution/strategies.ts` — `declaration_precedence` APPLIES the declared
   rule (extended `declarationPrecedence`, the formulationDeclared arm is UNCHANGED and still first).

`schema/scientist-intent/scientist-intent-vocabulary.schema.yaml` — minimal permissive addition so
the `candidatePrecedence` key is schema-legal (type: array, no closed enum — it is data the generic
interpreter reads; ABSENT = pre-fix bytes).

## Semantics implemented (generic)

`makeDeclarationPrecedence(vocab)` reads `policies().ambiguity.candidatePrecedence` from the
factory vocab (zero kind/name literal). In `gather`, AFTER the unchanged formulationDeclared arm,
`applyCandidatePrecedence(sorted, rules)` runs:

- Normalized label = lowercase, strip non-alphanumerics (`label.toLowerCase().replace(/[^a-z0-9]/g,'')`).
- The tier-5 mint affordance is never an identity candidate: excluded (`band.filter(c => c.tier !== 5)`).
- Group the record band by normalized label. For each group of >=2, FIRE only on the DECLARED
  kind pair — the `supersededByKind` candidate AND the other `whenKinds`-named kind both present.
  The superseded-kind candidate is DROPPED (ineligible); the rest are kept.
- A same-kind, same-label pair (e.g. two `labware`) is NEVER dropped (the fire guard requires the
  superseder present). Kinds not named in `whenKinds`: no effect whatsoever (pre-fix bytes).
- Exactly ONE survivor => contribute ONLY it (the engine's `inBand.length === 1` path binds it).
- Survivors still >= 2 (a genuine same-tier tie) => contribute NOTHING (clarify unchanged).

## Production wiring (why the no-arg default matters)

`resolveNounsPass.ts:483` (PROHIBITED file — not edited) calls `buildStrategyRegistry()` with NO
argument. `StrategyContext` (types.ts, OUT OF scope) does not carry policies, so the rule is read
via the registry-factory vocab. I made the factory default that arg to the shipped vocabulary:

```
export function buildStrategyRegistry(vocab: ScientistIntentVocabulary = defaultScientistIntentVocabulary()): ...
```

so the no-arg PRODUCTION call reads the SHIPPED rule. Without this default the declared rule would
be inert in production (only active when a test injects a vocab) and the live legA2 recompile
would still clarify forever. `defaultScientistIntentVocabulary()` is a cached singleton
(vocabulary.ts:478); `strategies.ts` already value-imports `declaredDomains` from `vocabulary.js`,
so no new import cycle. The injected-vocab test path is UNCHANGED (`buildStrategyRegistry(v)`).

## Identity predicate + the legA2 PITFALL (measured against the real r13 trail)

The brief's PITFALL is CONFIRMED against the real record + the r13 legA2 trail:
- Definition (kind `labware-definition`, `display_name`): `Generic 96-Well Plate`
- Legacy seed (kind `labware`, `name`): `Generic 96 Well Plate, Flat Bottom (seed)`
- Normalized: `generic96wellplate` vs `generic96wellplateflatbottomseed` — NOT equal
  (the definition is a PREFIX of the seed, not an equality).

Per the brief I did NOT weaken to containment (that would suppress unrelated candidates). The
identity predicate I made data-declarable is **normalized-label equality at the same demanded
referent role (same band + same normalized label), keyed on the declared `whenKinds` pair**.
That is the safe general form. Because the REAL legA2 pair does not share a normalized label,
this rule does NOT fire on that exact pair — so the live legA2 recompile's band is NOT narrowed by
this rule; the test drives a SYNTHETIC truly-equal-label pair (`Well Plate A`) for the narrowing
bar and also pins the shipped rule. Item acceptance is on the live replay; this unit does not
invent a name-table. (See "Next actions / residual" below.)

## Changed files (5, budget: 179 lines added / 5 files — within 180/5)

| file | change |
| --- | --- |
| `server/src/compiler/resolution/resolutionEngine.tierPrecedence.test.ts` | NEW pin (cases a–d + shipped-data pin) |
| `server/src/resolve/providers/records.ts` | `+termKind` on the record candidate |
| `server/src/compiler/resolution/strategies.ts` | `makeDeclarationPrecedence` + `applyCandidatePrecedence` + factory default |
| `schema/scientist-intent/scientist-intent-vocabulary.yaml` | `candidatePrecedence` block (DATA) |
| `schema/scientist-intent/scientist-intent-vocabulary.schema.yaml` | schema permit for the key |

No PROHIBITED file touched (verified: resolutionEngine.ts / resolveNounsPass.ts / shorthandChat.ts /
clarifications.ts / records/seed/** / schema/registry/** / AgentOrchestrator.ts all clean). No new
ambiguity strategy id; mode/strategyRef/confidenceAccept unchanged; zero `lbw-` / `Generic 96` /
`96-well-plate` literal in TS.

## Commits (this unit, in brief order)

- `72373fbf3` — finalize the RED pin test (cases a–d + shipped-data pin)
- `14cb71c35` — records provider carries `termKind`
- `1916a1c18` — strategies + vocabulary rule (the fix)  [final code commit]
- `74f7b3fdd` — (pre-compaction) initial RED test

## Verification (real output on the FINAL commit 1916a1c18)

RED at base (final test vs base production files, kept the test):
  `npm run test:run -w server -- resolutionEngine.tierPrecedence`
  -> `Tests  2 failed | 3 passed (5)` — case (a) (clarifies instead of binding the definition)
     and the shipped-data pin (base vocab has no candidatePrecedence) fail; cases (b)/(c) pass.

GREEN on final commit:
  `npm run test:run -w server -- resolutionEngine.tierPrecedence`
  -> `Tests  5 passed (5)`
  `npm run test:run -w server -- resolutionEngine strategies nounResolution declarationPrecedence optionRef`
  -> `Tests  39 passed (39)` (0 failures)
  `npm run test:run -w server -- compiler/resolution`  (full tree, 24 files)
  -> `Tests  199 passed (199)`
  `npm run test:run -w server -- vocabulary lint`  (vocab + lint, 32 files)
  -> `Tests  382 passed (382)`  (vocabulary lint passes; shipped YAML is Ajv+LintEngine valid)
  `npm run typecheck -w server`
  -> 6 PRE-EXISTING errors (identical to trunk: AIHandlers.ts×3, AiIngestionHandlers.ts×1,
     ExtractProtocolHandler.ts×1, sequenceRoutes.ts×1) — DELTA 0 (no new error from the change).

Acceptance map:
- (a) labware + labware-definition same normalized label -> binds the definition, seed never
  offered (binding curie `local:def-x`, no clarification) — PASS
- (b) two same-kind (labware) candidates same label -> still clarifies (no arbitrary winner) — PASS
- (c) material + labware (kinds absent from the declared whenKinds pair) -> behavior untouched — PASS
- (d) candidatePrecedence block ABSENT -> the pair clarifies again (the rule is data, not code) — PASS

## Next actions / residual (for the live replay + DEFECT 2 dispatch)

- This unit implements the DECLARED rule and proves it is data-driven. The live legA2 recompile
  band (definition vs the flat-bottom seed) does NOT narrow under normalized-label equality
  because the real labels are not equal (prefix, not equality). Acceptance on the live replay
  therefore depends on either: (i) the real band presenting candidates that DO share a normalized
  label, or (ii) the identity predicate being widened by a FUTURE data/decision change (e.g. a
  declared identity-collapse key) — which is OUT of this unit's scope (no name-table invented).
- DEFECT 2 (answered-slot bind-by-id) is the separate dispatch; `shorthandChat.ts` untouched.
- YAML change: the lane stack must be reloaded by the orchestrator before live verification.

L2-P1-AMBIGUITY-TIER-RULE-1-u1tier2-l2t2646.txt UNIT unit DONE 2fb48d7959d6dd2c11e38b368a9480fecb160a2c
