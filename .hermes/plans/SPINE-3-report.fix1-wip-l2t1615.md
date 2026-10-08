# SPINE-3 fix1 report — adversarial gate repair (lane 2, l2t1615)

Worktree: /mnt/vast/home/brad/git/wt/SPINE-3-lane2-l2t1440
Branch: spine-3-lane2-l2t1440 (base 39a5311b; prior tip 69597f98; fix commit 33cc3648)
Review repaired: /home/brad/.hermes/cl/lanes/2/reviews/review-SPINE-3-adversarial-l2t1600.md
Prior report: .hermes/plans/SPINE-3-report.wip-l2t1440.md (untouched)
Scope touched by this fix: server/src/compiler/resolution/adapters.ts,
nounResolution.test.ts, hintParity.test.ts ONLY. No fixture, no schema, no
ontology/domains.ts change (see §1 investigation), no file outside the owned dir.

## 0. Baseline re-measured at start (before any edit)

`npm run typecheck -w server 2>&1 | grep "error TS" | sed 's/([0-9]*,[0-9]*)//' | sort`
=> 26 lines / 6 files (AgentOrchestrator 8, RecordStoreImpl 11, AuthoringGuard 3,
ProtocolIntakeHandlers 2, RecordHandlers 1, bootstrapAdmin 1) — identical to the
prior report's capture. Final gate (§5): comm -3 EMPTY.
Base check: `git -c core.fileMode=false diff --stat 39a5311b cl/integration-2 -- server/src`
=> EMPTY (verified at start; no rebase needed).

## 1. D1 (MAJOR) — production domain bridge made REAL (orchestrator ruling R1, route (a) data-first)

### 1.1 Investigation: is there a TRUTHFUL ontology declaration for labware/instrument/material?

Checked first-hand (all at this worktree):
- server/src/ontology/pickerConfig.ts:94-101 — the labware picker is
  `allowedKinds: ['record'], localRecordTypes: ['labware']` — LOCAL RECORDS ONLY,
  no olsOntologies. There is no instrument picker at all.
- OBI ids in the repo (grep OBI:/EFO:/XCO:/CLO: across schema + server/src + app/src):
  schema/registry/verb-action-map.yaml (obi_id per VERB: incubate OBI:0000838,
  wash OBI:0302888, ...) and schema/registry/operations.yaml (ontology_refs per
  OPERATION: transfer OBI:0000293, create_container OBI:0000652 "Create a new
  labware container"). These are ACTION mappings — they name the operation, not
  the labware/instrument ENTITY. OBI is declared in ONTOLOGY_DOMAINS only under
  `experimentalAction` (domains.ts:111-120). Declaring labware→OBI or
  instrument→OBI would be inventing a namespace to make a test pass: the repo's
  own data uses OBI for actions, and no resolver queries an ontology for labware
  or instrument identity (resolve/providers/: records.ts searches record kinds;
  terms.ts searches term records; vendorExa.ts is a web search; ols4.ts restricts
  to config ontology.localOntologies).
- schema/lab/instrument.schema.yaml `domain` field: "Broad functional category
  used for UI behavior and grouping. This is NOT an ontology term." (examples
  qpcr, plate_reader, incubator).
- schema/lab/labware.schema.yaml carries no ontology/class/iri field at all.
- docs/canonical-term-spine.md + schema/core/term.schema.yaml: every named thing
  (materials, vendor products, LABWARE, INSTRUMENTS, verbs, kits, organisms,
  conditions) is ONE `term` record whose `kind` enum
  (material|vendor|labware|instrument|verb|kit|organism|condition|other) names
  what it is; ontology CURIEs are linkouts/provenance on term records, "not the
  canonical id itself". Migration: labware-definition → term(kind:labware),
  instrument-definition → term(kind:instrument).
- MaterialGrounding MATERIAL_DOMAINS (material.schema.yaml domains: cell_line,
  chemical, media, reagent, organism, sample, other) is a material-record domain
  clamp, not an ontology bridge.

CONCLUSION: no truthful ontology declaration exists for labware/instrument (and
the material tag maps to a record-domain taxonomy, not one ontology). Per R1 I
did NOT invent ONTOLOGY_DOMAINS entries. R1's FALLBACK route — a declared
local-domain policy expressed through the vocabulary's declared fields — IS
achievable, and it is what I implemented.

### 1.2 The repair (adapters.ts, no TS domain branch)

filterCandidatesByDeclaredDomain (adapters.ts) previously returned
eligible=all, rejected=[] for any domain absent from ONTOLOGY_DOMAINS — inert
for every shipped tag (labware 74, material 12, instrument 1; grep of
schema/scientist-intent/scientist-intent-vocabulary.yaml re-verified).

Now: when a declared domain tag has NO ONTOLOGY_DOMAINS entry, the tag ITSELF is
the landing zone. A candidate is REJECTED only when it POSITIVELY claims a
different landing zone: `candidate.termKind !== undefined &&
termKind.toLowerCase() !== domain.toLowerCase()`. The two sides of that
comparison are both declared DATA:
- the vocabulary's `domain:` tag (vocabulary.schema.yaml:88-94 — "DECLARATION
  SLOT — free-text domain tag naming where the noun must land (e.g. labware,
  material, instrument)"; lint P1 makes it mandatory for resolvable args);
- the candidate's term kind, carried by the production tier-0 provider
  (resolve/providers/terms.ts:95 `...(typeof payload.kind === 'string' ?
  { termKind: payload.kind } : {})` → RankedCandidate.termKind, resolve/types.ts:65)
  — the term.schema.yaml kind enum, i.e. the canonical term spine's own
  landing-zone taxonomy.
A candidate that makes no landing-zone claim (plain local records, hint matches,
mint affordance) stays eligible — absence of a claim is not a conflict
("prefer what the lab already has"). Where an ontology bridge IS declared
(chemical, cellType, ...), the namespace filter remains the authority exactly as
before. NO domain NAME is branched on: the code compares two data fields; the
§10 grep for domain/verb string literals in engine code is still ZERO (§5).
ONTOLOGY_DOMAINS (domains.ts) is UNTOUCHED — the scope delta was granted but not
needed, and inventing entries was ruled out by §1.1.

### 1.3 The test (nounResolution.test.ts, verb-constrained-domain describe)

PRIMARY LEG (new, production bridge): SHIPPED vocabulary only — transfer.labware
declares domain: labware, read.instrument declares domain: instrument (the tags
the shipped vocabulary ACTUALLY uses; asserted in-test). ONE candidate pool,
ambiguous label 'Gemini': two tier-0 canonical-term hits shaped exactly like
production terms-provider hits (namespace 'local', local:TERM-… curie,
termKind 'labware' vs 'instrument'). Result: the labware-domain arg binds ONLY
the labware-design term and the instrument-design candidate is REJECTED and
NAMED in a `domain-mismatch:` trace; the instrument-domain arg binds ONLY the
instrument design with the labware design rejected + named; eligible sets
disjoint BOTH directions. The difference comes from the domain filter itself —
no fixture vocabulary is loaded in this leg.
SECOND LEG (kept, relabeled): the old fixture-flip leg (vocab-domain-flip,
chemical/cellType) remains as the ONTOLOGY_DOMAINS namespace axis, honestly
labeled "ontology bridge axis (fixture copy flips to ONTOLOGY_DOMAINS tags)".

### 1.4 Mutation proof the new leg bites (scratch, restored byte-clean)

Made the landing-zone policy inert (`return false && ...` in
claimsConflictingLandingZone):

    FAIL  src/compiler/resolution/nounResolution.test.ts > noun-resolution.verb-constrained-domain > SHIPPED domain tags: same ambiguous label, transfer.labware (labware) vs read.instrument (instrument) => disjoint eligible sets from the domain filter
    AssertionError: expected [] to deeply equal [ 'local:TERM-Gemini-plate-a1b2' ]
     Test Files  1 failed | 1 passed (2)
          Tests  1 failed | 22 passed (23)

(With the filter inert, both candidates are eligible → two in-band candidates →
ambiguous-noun clarification → ZERO bindings → RED. Exactly the sensitivity §6
demands.) adapters.ts restored: sha256
4813cd8bda2b491d4ac0739731a843e52962e6375e7db64d680fd6efd72bd413 (== pre-mutation
capture); suite re-green 23/23.

### 1.5 Honest ripple recorded

With the bridge live, transfer.source (domain: labware) now correctly REJECTS a
material-kind term (termKind 'material' claims a different landing zone). The
local-term-identity legs used exactly that shape (F-praus material-kind term on
transfer.source) and went RED under the repaired engine — the honest fix is to
exercise alias identity on a material-domain argument: both legs now use
wash.material (shipped tag: material), which is where a material-kind term
actually lands. This is the defect's own point demonstrated in miniature: the
tag now constrains the search for shipped domains.

## 2. D2 (MINOR) — vacuous mutation-leg test DELETED (R2 option chosen)

hintParity.test.ts:161-170 removed entirely. The reviewer is right: the
perturbed local copy can never equal the lowering (assertion cannot fail) and
the second assertion duplicated expectParity. Net coverage was zero. I chose
deletion over a stand-in: the scratch mutation transcript (§3) is the evidence,
and a code comment at the deletion site records the defect, the reason, and
where the proof lives. (I prototyped a referential-identity test — Object.is on
each candidate — and it passes green, but it asserts adapter internals rather
than the §6 parity criterion; per R2's "or rely solely on the scratch-run
transcript" I kept the suite honest instead of padding it.) hintParity is now
8 tests (7 parity legs + pinned example), all biting (§3 proves it).

## 3. D3 (MINOR) — mutation leg re-run as the reviewer's M-B, real transcript; §11.9 claim corrected

### 3.1 M-B replicated (adapter-side): createHintEvidenceAdapter reason append

Scratch edit in adapters.ts createHintEvidenceAdapter.gather:
`candidates.map((c) => ({ ...c, reason: `${c.reason} MUTATED` }))`.

    FAIL ... > adapter output deep-equals lowering output: hint = resolvedRecordId ?? labwareHint; role-bearing reason; deckSlot absent
    FAIL ... > adapter output deep-equals lowering output: tips and waste WITH deckSlot join
    FAIL ... > adapter output deep-equals lowering output: one-match placement-on-slot candidate (deckSlot reaches additions)
    FAIL ... > adapter output deep-equals lowering output: plan_deck_layout first-wins pair (two hints claim one slot)
    FAIL ... > adapter output deep-equals lowering output: scientist-intent path candidates are deckSlot-free
    FAIL ... > adapter output deep-equals lowering output: blockers-keep-candidates (deckSlot-free candidate survives)
    FAIL ... > reason strings pass through VERBATIM (pinned example)
     Test Files  1 failed (1)
          Tests  7 failed | 1 passed (8)

SIX of the seven deep-equal PARITY legs go RED (the 7th scenario — tips/waste
WITHOUT deckSlot — lowers to an empty candidate list on BOTH sides, so it stays
green vacuously-by-emptiness; that is the lowering's own skip-guard, not adapter
insensitivity). This is the mutation that reddens the PARITY assertion, as §11.9
required. Restored byte-clean: adapters.ts sha256
4813cd8bda2b491d4ac0739731a843e52962e6375e7db64d680fd6efd72bd413 (matches
pre-mutation capture); git status of server/src/compiler CLEAN.

### 3.2 M-C replicated (lowering-side) and the correction

Scratch edit in ProtocolIntentLowering.ts candidateLabware role-bearing reason
(`... resource ${labware.id} MUTATED`):

    FAIL ... > reason strings pass through VERBATIM (pinned example)
     Test Files  1 failed (1)
          Tests  1 failed | 7 passed (8)

CORRECTION to prior report §5 item 5 (explicit, per R3): the lowering-side
mutation reddens ONLY the pinned-example test, NOT the parity legs — because
both sides of expectParity call the SAME lowering (adapters.ts returns
lowerProtocolIntentLabwareCandidates(intent) directly), so a lowering-side change
moves both sides together and deep-equality survives. The prior wording
("made the parity test RED") conflated the pinned-example failure with a parity
failure and overstated the evidence. The mutation that actually reddens the
parity assertions is the adapter-side one (§3.1), now run and transcribed by me,
not just the reviewer. Restored byte-clean: ProtocolIntentLowering.ts sha256
72d4fb760e90fee39551bf8c389ca52a207bcfc4b12e5ea2ff597e286e23f02b (== reviewer's
restore value == pre-mutation capture); git status CLEAN.

## 4. Files changed by this fix (33cc3648, 3 files, all pre-existing in the item's diff)

- server/src/compiler/resolution/adapters.ts — filterCandidatesByDeclaredDomain
  landing-zone policy + doc comment (no new imports, no domain literals).
- server/src/compiler/resolution/nounResolution.test.ts — new PRIMARY shipped-tag
  leg; old leg relabeled as ontology-bridge axis; local-term-identity legs moved
  transfer.source -> wash.material (§1.5).
- server/src/compiler/resolution/hintParity.test.ts — vacuous test deleted with
  explanatory comment; header comment updated.
Fixtures, resolutionEngine.ts, strategies.ts, types.ts, ontology/domains.ts,
schema/**, app/**: UNTOUCHED.

## 5. Gate runs after the fix (verbatim tails)

Targeted suite (from <worktree>/server; characterization UNTOUCHED in same command):
    ✓ src/compiler/resolution/hintParity.test.ts  (8 tests)
    ✓ src/compiler/resolution/nounResolution.test.ts  (15 tests)
    ✓ ... (12 SPINE-1/SPINE-2 files incl. ProtocolIntentLoweringCharacterization (6))
    Test Files  14 passed (14)
         Tests  136 passed (136)

Server tsc: 26 error lines / 6 files; comm -3 vs the §0 fresh baseline => EMPTY
(exit 0). Zero lines in any file this item owns.

src/ai fail-set IDENTITY:
    Test Files  10 failed | 74 passed (84)
         Tests  21 failed | 644 passed (665)
    FAIL-file set (10): AgentOrchestrator.bypass, AgentOrchestratorForwarding,
    AgentOrchestrator.golden, AgentOrchestrator.goldenWithSeeds,
    AgentOrchestrator.tubeGate, ChatbotCompileDeckSlot, chatbotCompile.e2e,
    InferenceClient.config, materialFollowUp, submitSuggestionTool.tubeSchema
    — identical to the baseline set (SET identity holds).

§10 hard-boundary greps (re-run after the fix, verbatim):
    grep -rnE "'(transfer|read|wash|spin|pellet|serial_dilution|[a-z_]+)'\s*[=:]|case '" server/src/compiler/resolution/*.ts | grep -v test
    => ZERO (exit 1)
    grep -rn "schemaId: " server/src/compiler/resolution/*.ts | grep -v test
    => ZERO (exit 1)
    grep -rnE "store\.(create|update)|EnsureTerm|ensureLocalMaterial" server/src/compiler/resolution/*.ts
    => only the two pre-existing COMMENT lines (resolutionEngine.ts:8, types.ts:8)

Ownership gate: `git -c core.fileMode=false diff --name-only 39a5311b..HEAD |
grep -v -E '^server/src/compiler/resolution/|^\.hermes/plans/'` => EMPTY;
app/ diff => 0 files. Diff remains 16 files (15 engine/test/fixture + reports).

## 6. Reviewer NOTE items (not defects; recorded, unchanged by this fix)

- registryAdapter still has no strategy consuming the 'registry' id (gap, no §6
  criterion) — untouched, left for the orchestrator's SPINE-4 wiring decision.
- action-location-unreliable self-comparison through the doc door — untouched
  (input-integrity glue per spec §7; the reviewer's observation stands).

## 7. Unresolved / for the orchestrator

- The landing-zone policy is the honest data route available TODAY. If the lab
  later wants labware/instrument to resolve through a real external ontology
  (e.g. an OLS-hosted labware ontology), the truthful move is a new
  ONTOLOGY_DOMAINS entry with a primary ontology the resolvers actually query —
  that is a data decision (vocabulary + domains.ts + resolver config), not an
  engine change; the engine's bridge already consumes whatever ONTOLOGY_DOMAINS
  declares. No such ontology is used anywhere in this repo today (§1.1 evidence).
- The tips/waste-without-deckSlot parity scenario is vacuous-by-emptiness under
  M-B (both sides []); noted for the next gate so it is not counted as biting
  coverage.

SPINE-3 FIX1 DONE
