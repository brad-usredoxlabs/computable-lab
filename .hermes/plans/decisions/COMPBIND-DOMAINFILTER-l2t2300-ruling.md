# ARCHITECT RULING — L2-PROMPT2-COMPOSITION-BIND-1: formulation-as-transfer-source, domain-declaration ownership (lane 2, l2t2300)

Date: 2026-11-05 23:00 EST. Decider: architect. Requested by: lane-2 orchestrator (arch question
`COMPBIND-DOMAINFILTER-seam-question-l2t2205.md`, written 22:2x after the coder committed its BLOCKED
report at `9bd37e65`).

Inputs (read at source this session, none relayed):
- `~/.hermes/cl/lanes/2/../../git/cl-integration-2/.hermes/plans/decisions/COMPBIND-DOMAINFILTER-seam-question-l2t2205.md`
  (the question: data / test contract / filter logic).
- `server/src/compiler/resolution/adapters.ts:255-300` — `claimsConflictingLandingZone` +
  `filterCandidatesByDeclaredDomain`, read whole. Its own module doc states the law: "a candidate that
  POSITIVELY claims a different landing zone is REJECTED … a candidate that makes no landing-zone claim
  stays eligible … NO domain NAME is branched on".
- `server/src/compiler/resolution/strategies.ts:51` — the single call site
  (`filterCandidatesByDeclaredDomain(outcome.candidates, effectiveDomain)`), before narrowing.
- `schema/scientist-intent/scientist-intent-vocabulary.yaml` — `domain:` DECLARATION SLOT on resolvable
  args; `source` args on seed/mix/resuspend/dilute all declare `domain: labware` (e.g. :20, :53, :58, :76,
  :144).
- `schema/scientist-intent/scientist-intent-vocabulary.schema.yaml:94-100` — the structural rule:
  `domain: { type: string, minLength: 1 }`, described as a free-text landing-zone tag.
- Live record `MSP-PR9-TEST-CLO-1MM` ("1 mM Clofibrate in DMSO") via `GET /api/records` on :3093 —
  the formulation that must bind; its composition is solute Clofibrate {1, mM, molar} + solvent DMSO.

---

## 0. THE DEFECT, STATED EXACTLY

`filterCandidatesByDeclaredDomain` rejects the formulation candidate **before narrowing sees it**.
The argument declares ONE domain (`labware`); the formulation candidate's `termKind` is `material`; per
`claimsConflictingLandingZone` any positive claim outside the declared domain is a conflict, so it is
dropped from `eligible` and the in-band set stays an ambiguity blob (the measured 16-candidate flat set,
`resolutionEngine.ts:316-320`). The coder's wiring of `narrowContenders` is correct and unreachable.

The question is therefore not "which filter arm is wrong" — nothing is wrong in the filter's own terms.
The question is that the DECLARATION cannot express the truth: **a transfer source is legitimately
either a labware ref (a well, a plate) or a material (a formulation in a tube).** The slot is
single-valued, so the vocabulary must lie, and whichever way it lies some honest candidate is rejected.

## 1. DECISION

**Option 1, widened: make the declaration slot a SET, in DATA, and have the filter read the set
generically. Neither option 2 nor option 3.**

- Rejected — **option 3 (filter logic admits 'material')**: an allow-list inside the filter is a rule in
  TypeScript that the data cannot remove, i.e. exactly the hardcoded special case CLAUDE.md's Hard
  Boundary forbids ("if the system can fake something by hardcoding it, that is a hard stop"). It also
  branches on a domain NAME, which this module's own doc forbids.
- Rejected — **option 2 (change the test contract / the termKind a mint carries)**: it relabels an entity
  to satisfy a filter. The formulation IS a material; making it claim another kind puts a false claim in
  the data to protect a rule, and it would corrupt every other consumer of `termKind`.

The widening, in three declared layers:

1. **Structure (schema).** `schema/scientist-intent/scientist-intent-vocabulary.schema.yaml` `domain`
   accepts EITHER a string OR an array of strings (`minItems: 1`, `uniqueItems: true`, members
   `minLength: 1`). Additive and backwards-compatible; update the description to state that a set means
   "any of these landing zones is acceptable for this argument". No enum of domain names is introduced —
   the slot stays a free tag.
2. **Data (vocabulary).** The `source` argument of the transfer-family verbs that may take a formulation
   source declares `domain: [labware, material]`. Enumerate the affected verbs IN THE UNIT REPORT (start
   from seed/transfer/mix/resuspend/dilute `source` args and justify each); do NOT blanket-widen every
   argument — an argument whose semantics admit only labware must keep `labware`.
3. **Interpretation (filter).** `filterCandidatesByDeclaredDomain(candidates, domain: string | readonly
   string[])`: normalise to a set; reject only a candidate that positively claims a kind outside the set;
   a candidate with no claim stays eligible (existing law, unchanged); `declaredNamespacesForDomain`
   applies per tag and a candidate is eligible if ANY declared tag's bridge admits it. No domain-name
   branch, no allow-list, no fallback.

Lint (`scientist-intent-vocabulary.lint.yaml`): a resolvable argument's domain set must be non-empty and
its members must be well-formed tags — a structural check over the declaration, not a list of permitted
names in TS.

## 2. SCOPE BOUNDARY AND THE SIBLING SEAM

- Owner of this seam: **L2-PROMPT2-COMPOSITION-BIND-1**, one unit, files as listed in §4.
- **SCIENCE-CHAIN-1 D1** (draft-kind mint refs vs record-kind refs at `materialRefLabels.ts:728`) is the
  same FAMILY but a different arm. It is NOT in this unit. Its fix unit may start only after this one
  merges, must consume the widened declaration rather than introducing a second kind vocabulary, and
  must state in its report which declared tag admits the formulation.
- Non-goals: serialising workspace writes, touching `resolutionEngine.ts:316-320`'s in-band set,
  adding a second contender-ordering mechanism, changing the pins that already prove the conflict arm.

## 3. ACCEPTANCE (RED first, pasted raw)

1. **RED at current trunk**: the corpus prompt's formulation mention (the product's own
   `[[material-spec:MSP-PR9-TEST-CLO-1MM|…]]` token) yields the measured ambiguous set and the
   exact-name formulation is NOT the bound candidate. GREEN after the change: it binds, and the committed
   `add_material` carries `material_spec_ref` + a `composition_snapshot` with the solute's declared
   concentration (which is what makes SCIENCE-CHAIN's criterion 1 judgeable at all).
2. **Anti-regression on the conflict arm**: a candidate that positively claims `instrument` for a
   `domain: [labware, material]` argument is STILL rejected. This pin exists to prove the set did not
   become "accept everything".
3. **No-claim arm unchanged**: a candidate with `termKind === undefined` stays eligible for any declared
   set (the "prefer what the lab has" law).
4. **Mutation check** each of the three: break the set membership test and the RED pin must fail.
5. `npm run typecheck -w server` clean for touched files; no new TS in `adapters.ts` may contain a domain
   literal (`labware` / `material` / `instrument`) — grep must be 0.

## 4. FILES (the unit's ownership)

`server/src/compiler/resolution/adapters.ts` (+ its test), `schema/scientist-intent/
scientist-intent-vocabulary.schema.yaml`, `schema/scientist-intent/scientist-intent-vocabulary.lint.yaml`,
`schema/scientist-intent/scientist-intent-vocabulary.yaml` (the enumerated `source` arguments ONLY).
PROHIBITED: `resolutionEngine.ts`, `contenders.ts`, `app/**`, `records/**`.

## 5. RESUME

COMPBIND can be re-cut immediately on this ruling; the orchestrator owns the brief. The coder's residual
worktree delta (a DEBUG `console.log` + an unused `narrowContenders` import in `resolutionEngine.ts`) is
diagnostic scaffolding: it must be dropped, not carried — it touches a PROHIBITED file.
