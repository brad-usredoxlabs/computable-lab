# SPEC — W2-8-A5g: bead_beat vocabulary verb (scientist-intent verb union as DATA)

- Item: W2-8-A5g
- Lane: 2
- Trunk: /mnt/vast/home/brad/git/cl-integration-2, branch cl/integration-2, revision bb5c6501
- Worktree: /mnt/vast/home/brad/git/wt/W2-8-A5g-lane2-l2t1710 (orchestrator creates)
- Branch: cl/W2-8-A5g-lane2-l2t1710 off cl/integration-2
- Report: .hermes/plans/W2-8-A5g-report.wip-l2t1710.md (unique deliverable path; l2t1710 supplied at dispatch)
- Authority: Brad ruling /home/brad/.hermes/cl/lanes/2/decisions/W28-A5-beadbeat-brad-ruling-20261017.md ("a) yes") +
  work plan in /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/decisions/W28-A5-accept-leg-decision-20261017.md §Work-plan-1.

## Goal (one sentence)

Add `bead_beat` as the 32nd scientist-intent verb — pure declarative DATA plus one
data-shaped TS expander — so the mechanical-cell-disruption capability the A5 gate's
bead-beater branch needs exists honestly in the vocabulary triplet, the wire enum,
every mirror, the adjudication table, the synonym map, and the lowering layer, with
all machine-re-derived counts and order pins brought green by deliberate edits.

Step-0 probe (already executed, appended to the decision artifact): a vocab copy
augmented with exactly one bead_beat entry (class simple, policyRef hint-authority,
args labware resolvable/hintEligible domain labware, material resolvable/hintEligible
domain material, duration scalar, temperatureC quantity, cycles quantity) loads clean
through loader schema+lint boot and the compiler emits REAL bead_beat actions
end-to-end. This spec productizes exactly that shape.

## Discipline (explicitly NOT red-first)

RED-FIRST is NOT applicable — this is additive DATA, not a bug fix. The mandated
sequence is:

1. GREEN BASELINE FIRST: run the mirror/crosswalk/registry suites UNMODIFIED and
   capture the green output in the report.
2. Make the data changes (vocabulary yaml + enum + inventory + registry template).
3. RE-RUN: the mirror tests must go RED for EXACTLY the enumerated mirrors/pins in
   "The mirror set" below — a RED anywhere else means you broke something unplanned;
   a mirror that did NOT go RED when you expected it means you missed an edit.
4. Bring every mirror green with the listed deliberate edits. Never pin around:
   every count/expectation change must appear in the report as a shown diff with a
   one-line justification.

## Acceptance criteria (verbatim from the task list 'verified by')

- loader schema+lint boot clean with the new triplet
- verb-union suites green at 32
- the A5d gate re-shoot is orchestrator-run AFTER merge — NOT coder scope
- CAUTION clause: none in coder scope

## The bead_beat vocabulary entry (exact data shape)

Append to `schema/scientist-intent/scientist-intent-vocabulary.yaml` `verbs:` list —
LAST (after `repeat_rows`, i.e. insert between line 811 `- required: false` (end of
repeat_rows targetWells) and line 812 `policies:`). Mirror the mix/shake entry shape
byte-for-byte in structure:

```yaml
  - name: bead_beat
    class: simple
    policyRef: hint-authority
    args:
      - name: labware
        kind: resolvable
        required: false
        domain: labware
        hintEligible: true
      - name: material
        kind: resolvable
        required: false
        domain: material
        hintEligible: true
      - name: duration
        kind: scalar
        required: false
      - name: temperatureC
        kind: quantity
        required: false
      - name: cycles
        kind: quantity
        required: false
```

Lint consequences (composer-verified against scientist-intent-vocabulary.lint.yaml):
P1 satisfied (every resolvable arg declares a domain), P2 satisfied (policyRef
`hint-authority` is declared in policies.ruleIds at :828-829), the hint-verbs-carry-
policy-ref rule satisfied (policyRef present). NO new lint rule needed. The meta-schema
(scientist-intent-vocabulary.schema.yaml) hardcodes NO verb list — verb `name` is only
pattern-checked `^[a-z][a-z0-9_]*$` and `class` is enum [simple, compound, pattern]
(composer spot-verified; matches the probe's clean boot).

## The mirror set (order IS pinned — append LAST, consistently, everywhere)

vocabularyMirrorDrift.test.ts enforces SET DIFF both directions for copies (a)-(e) and
DECLARATION ORDER against fixtures/verb-inventory.yaml for (a) types.ts and (b) the wire
enum ("order is types.ts declaration order, NOT alphabetical"). vocabulary.test.ts:170
additionally pins `vocab.verbs()` ORDER == inventory. Therefore the append position is
LAST in ALL FOUR order-pinned copies. (The step-0 probe slotted bead_beat between shake
and mix — that was a throwaway probe copy; it is NOT a precedent and mid-list insertion
in the shipped files would trip the order pins. Decision: append last everywhere.)

(a) `server/src/compiler/scientistIntent/types.ts` — ScientistIntentActionKind union:
    append `  | 'bead_beat'` after `  | 'repeat_rows';` (:55 — the new last member
    takes the `;`, repeat_rows keeps it and gains `| 'bead_beat';` after). The
    source-text extraction regex is `/'([a-z_]+)'/g` — lowercase underscore only, ok.
(b) `schema/workflow/scientist-intent.schema.yaml` — $defs/actionVerb enum (:24-59):
    append `- bead_beat` after `- repeat_rows` (:59). Used at :80 (actions[].action) and
    in the clarification $defs actionLocation.action (:253 region) via the same $ref —
    one edit covers both.
(c) tool-schema enum — GENERATED via `vocab.toolActionEnum()` in
    intentCompile.ts buildScientistIntentToolSchema (:161-173). NO EDIT.
(d) intentCompile.ts ALLOWED ACTIONS block — **COMPOSER CORRECTION to the orientation
    anchor**: this block is GENERATED (`ALLOWED ACTIONS (never invent another):\n
    ${vocab.promptVerbBlock()}` at :87-88); it follows the vocabulary automatically.
    NO EDIT to intentCompile.ts. (The orchestrator anchor called it a literal list;
    the shipped file at bb5c6501 generates it — composer verified by reading
    intentCompile.ts:61-105.)
(e) `schema/registry/prompt-templates/intent.compile.system.yaml` — the ONLY literal
    verb list (content block, header at :24, lines :25-30 ending
    `source_wells_to_duplicate_target_columns | repeat_rows`). Append `| bead_beat`
    to the block (e.g. extend line :30 to
    `  source_wells_to_duplicate_target_columns | repeat_rows | bead_beat`). The drift
    check is a SET diff (promptBlockVerbs splits on `|`), so no order pin here, but
    keep the wrap style; the block must contain the token `bead_beat`.
(f) `server/src/compiler/scientistIntent/fixtures/verb-inventory.yaml` — append
    `- bead_beat` after `- repeat_rows` (:36). This is the order pin (a)/(b) compare to.

## Files IN scope (exact edits)

DATA:
1. schema/scientist-intent/scientist-intent-vocabulary.yaml — entry above, appended LAST.
2. schema/workflow/scientist-intent.schema.yaml — enum append after repeat_rows (:59).
3. server/src/compiler/scientistIntent/fixtures/verb-inventory.yaml — append last (:37).
4. schema/registry/prompt-templates/intent.compile.system.yaml — literal block gains bead_beat (:30).
5. schema/registry/wave2-verb-adjudication.yaml:
   - vocabularies.scientist_intent_enum.count: 31 -> 32 (:21) and mirror_count: 31 -> 32 (:23).
   - vocabularies.neighboring_verb_action_map.count: 26 -> 27 (:35).
   - mappings.enum_only: append `- bead_beat` (bead_beat has NO verb-definition record;
     it is an enum_only entry). Update the section comment at :75
     ("28 of the 31 enum verbs ... (31 - 3 mapped above)") to 29 of 32.
   - Add a comment on the bead_beat enum_only entry recording the governance: Brad
     ruling 2026-10-17 adds bead_beat to the union; this supersedes the VERB-SONICATE
     `protocol_semantic_only` POSTURE for this operation only. DO NOT EDIT the
     VERB-SONICATE (or VERB-STIR) rows themselves — they are verb-definition records
     and that record set is untouched (verb_definition_records.count stays 10).
   - HOW THE COUNTS ARE CHECKED (composer-verified from Wave2NamingCrosswalk.test.ts
     :273-319): the test RE-PARSES the YAML sources (wire enum size, vocabulary yaml
     size, verb-action-map size, records dir size, operations.yaml size) and asserts
     equality against the DECLARED numbers in this file. The declared numbers are
     HAND-MAINTAINED; the test only catches drift. So the hand bumps above are
     mandatory or the drift-guard test goes RED. The test ALSO pins
     `mappedEnum.size + enumOnly.size == siVerbs.size` — the enum_only append is what
     balances that partition (3 mapped + 29 enum_only == 32).
6. schema/registry/verb-action-map.yaml — append the mapping (file is unordered
   grouping; append at end after `transfer`):
   ```yaml
     - verb: bead_beat
       notes: "no canonical mapping"
       synonyms: [bead-beat, homogenize, bead beat]
   ```
   The seed precedent (`- verb: seed / notes: "no canonical mapping"`) is an ACCEPTED
   shape with no obi_id — use it unless the orchestrator supplies a vetted OBI id at
   dispatch. Registry constraints the coder MUST satisfy (composer-verified from
   VerbActionMapRegistry.ts + its two test files): every mapping needs at least 1
   synonym (synonyms.test.ts:43), and at least one of exact_id/obi_id/notes
   (test.ts:239-244) — the `notes:` line satisfies both.
   SYNONYM COLLISION — resolved honestly (composer-verified): `homogenize` is NOT in
   mix's synonyms array ([combine, blend, vortex]); it appears only in mix's free-text
   `notes:` ("Combine or homogenize materials"). findVerbForToken matches canonicals
   and synonyms arrays only, first-match-wins, and NO test enforces global synonym
   uniqueness. So `homogenize` on bead_beat collides with nothing testable. Keep mix's
   entry EXACTLY as-is. The crosswalk's no-collision rule fires only for terms
   PROPOSED AS NEW (status new-vocab-pending-admission/missing-datatype) — adding a
   verb-action-map row is not a NEW proposal; and normalize("bead beater") =
   "bead_beater" != "bead_beat", so the existing crosswalk "bead beater" equipment
   entry (:387) does not collide with the verb name.

TS (data-shaped, no interpreter logic):
7. server/src/compiler/scientistIntent/types.ts — union literal append (mirror (a)).
8. server/src/compiler/biology/verbs/simpleVerbs.ts — add beadBeatExpander + register it:
   ```ts
   /**
    * bead_beat: single mix event (mechanical bead-beating disruption).
    */
   export const beadBeatExpander: BiologyVerbExpander = {
     verb: 'bead_beat',
     expand(input) {
       const { params } = input;
       return [{
         eventId: makeEventId('bead_beat'),
         event_type: 'mix',
         details: {
           mode: 'bead_beating',
           ...(params.cycles !== undefined ? { cycles: params.cycles as number } : {}),
           ...(params.temperature !== undefined
             ? { temperature: params.temperature as number }
             : {}),
         },
         ...(params.labware_id ? { labwareId: params.labware_id as string } : {}),
       }];
     },
   };
   ```
   (Shape follows shakeExpander :614-633 / resuspendExpander :142-159 exactly; details
   name the mechanical-disruption kind. NO new event_type — the lowering decision is
   MADE: event_type 'mix' because bead_beat IS a force-mix for the deck/robot layer;
   specifics ride details. compute_resources tips are keyed on event_type 'mix', which
   already consumes a tip — same as shake today, no ripple.)
   Register in the registerVerbExpander block (:636-653): `registerVerbExpander(beadBeatExpander);`
   ONCE. registerVerbExpander THROWS on duplicate registration (BiologyVerbExpander.ts:42-45).
   WHY an expander is required: a verb with no expander is NOT a crash —
   ChatbotCompilePasses.ts:1120-1130 emits warning `unknown_biology_verb` and DROPS the
   candidate event, i.e. silent-ish capability loss at the lowering layer. The expander
   is the realization half of the data.

TESTS THE CODER MUST UPDATE DELIBERATELY (the complete golden/pin sweep — composer
grep-swept at bb5c6501; every file below carries a hardcoded 31/30/26 that this change
breaks; show each diff in the report, never pin around):
9.  server/src/compiler/scientistIntent/scientistIntentContract.test.ts :163-167 — five
    `toHaveLength(31)` -> 32 (fixtureVerbs, unionVerbs, vocabularyVerbs, schemaEnum,
    INTENT_ACTIONS) + the `it(...)` title "length 31" -> 32.
10. server/src/compiler/scientistIntent/vocabulary.test.ts — :63 (shipped) 31->32;
    :161 (shipped) 31->32; :160 (vocab-minus-pellet fixture) 30->31 (see 11);
    :169 (inventory) 31->32; the header comment :6-7 and the `it` title :166 "== 31"
    -> 32. NOT :131 — that expectation is about a frozen mutation FIXTURE
    (vocab-mutations/vocab-plain-verb-no-policyref, 31 verbs, does not gain bead_beat).
11. server/src/compiler/scientistIntent/fixtures/vocab-minus-pellet/scientist-intent-vocabulary.yaml
    — add the bead_beat entry (same shape, appended last, keeping the fixture's
    invariant "shipped minus pellet"). REQUIRED: vocabularyRipOut.test.ts :59-63 loops
    the SHIPPED verbs asserting each (except pellet) is contained in the prompt
    generated from the fixture — with shipped=32 and the fixture lacking bead_beat that
    loop goes RED. Then bump vocabularyRipOut.test.ts :51 `toHaveLength(30)` -> 31 and
    its `it` titles ("has 30 verbs" / "the other 30" -> 31). The `/\bpellet\b/`
    negative assertion stays green (bead_beat's text contains no "pellet").
    NO new rip-out fixture: the pellet fixture remains the sole RIP-OUT leg
    (precedent — recommend NO bead_beat rip-out fixture; deleting pellet already
    proves the data-rip-out discipline, and the shipped 32 contains bead_beat by pin).
12. server/src/registry/VerbActionMapRegistry.test.ts — :9 title + :11 `size()).toBe(26)`
    -> 27; :221 title + :224 `all.length).toBe(26)` -> 27. (The expectedVerbs array
    :227-237 is a contains-check, not exhaustive — leave it; adding bead_beat there is
    optional.)
13. server/src/registry/VerbActionMapRegistry.synonyms.test.ts — :37 title + :39
    `allMappings.length).toBe(26)` -> 27.
14. server/src/compiler/biology/BiologyVerbExpander.test.ts — add
    `import { ..., beadBeatExpander }` and `bead_beat: beadBeatExpander,` to the
    expanderMap (:110-125) so the parametric 'expands ... to valid event types' leg
    covers it (ALLOWED_EVENT_TYPES already includes 'mix').
    REGISTRY-SET PIN CHECK (mandated first grep, composer already ran it): NO test pins
    the exact registered-expander set/count. listVerbs assertions
    (BiologyVerbExpander.test.ts:84-96) run behind `_resetRegistryForTest()` with their
    own mock verbs and never assert the production registration list. Verified at
    bb5c6501; if the coder's branch differs, re-grep `listVerbs` before registering.
15. docs/wave2-naming-crosswalk.md — prose counts the adjudication change makes stale:
    :75-76 "31" -> 32 (both lines), :88 "enum-only ... = 28 verbs" -> 29, :93
    "3+28=31" -> "3+29=32", :109 "26 mappings vs 31 enum verbs" -> 27 vs 32. Prose
    only; no test reads it, but leaving it stale is a lying-mirror smell — update.

## Files explicitly OUT of scope (do not touch)

- schema/workflow/event-graph (PlateEvent) event_type enum — adding 'bead_beat' there
  would ripple through deck UI, acceptedOntologyBindings, ProposedGraphModal; OUT of
  approved scope. Lowering is event_type 'mix'.
- Deck UI / app/** (composer-verified: `repeat_rows` appears nowhere in app/src).
- The clarification adapter (CLARIFICATION_MENU_BY_REASON) — free-form-reason no-card
  behavior stands by the ruling.
- A5d gate fixtures / receipts / re-shoot — orchestrator-run AFTER merge, NOT coder scope.
- records/seed/verb-definition/** — NO verb-definition record for bead_beat (that is
  why it lands in enum_only); verb_definition_records.count stays 10.
- The VERB-SONICATE / VERB-STIR protocol_semantic_only rows (posture superseded for
  this operation is RECORDED in the enum_only comment, not by editing those rows).
- server/src/compiler/resolution/fixtures/vocab-{shipped-copy,policy-flip,required-flip,domain-flip}/
  — frozen mutation fixtures named "copies of the shipped vocabulary" but NOTHING
  compares them to shipped (composer grep-verified: no test loads vocab-shipped-copy
  by name; the flip fixtures are asserted against their own flips, not against shipped
  verb lists). Leave untouched; mention this finding in the report.
- schema/scientist-intent/scientist-intent-vocabulary.schema.yaml and
  scientist-intent-vocabulary.lint.yaml — NO changes (no verb list, no new rule).
- schema/registry/prompt-templates/chatbot-compile.precompile.system.yaml — its
  repeat_rows occurrence is the precompile PATTERN-kind grammar (a different closed
  list for patterns/operations), not the scientist-intent verb enum; not drift-pinned.
- schema/registry/wave2-naming-crosswalk.yaml — no new term is admitted here.
- intentCompile.ts — generated block, see mirror (c)/(d).
- Any lane stack (:3093/:5193): YAML changes require a stack restart to reload the
  vocabulary; the ORCHESTRATOR restarts the lane stack. The coder does NOT touch
  :3093/:5193 and does not hot-reload anything.

## First targeted check (early proof, before any edit)

From /mnt/vast/home/brad/git/wt/W2-8-A5g-lane2-l2t1710/server run the mirror +
crosswalk suites UNMODIFIED (green baseline #1):

    npx vitest run src/compiler/scientistIntent/vocabularyMirrorDrift.test.ts src/schema/Wave2NamingCrosswalk.test.ts

Expected: ALL PASS at baseline. Then add ONLY the vocabulary yaml entry + the wire enum
entry (edits 1-2) and re-run the same command: vocabularyMirrorDrift must go RED with
exactly the (a) types.ts, (d)-block-is-generated-so-no, (e) registry-template set-diffs
plus the order pins — the precise failure you then repair with edits (a),(e),(f). If
the failure set is not what the mirror list predicts, STOP and re-read the test before
editing anything else.

## Full verification commands (server workspace, from <worktree>/server; use
    `git -c core.fileMode=false` for any git read in the NFS checkout)

Green baseline (step 1, capture output in the report):

    npx vitest run src/compiler/scientistIntent/vocabularyMirrorDrift.test.ts src/compiler/scientistIntent/vocabulary.test.ts src/compiler/scientistIntent/scientistIntentContract.test.ts src/compiler/scientistIntent/vocabularyRipOut.test.ts src/compiler/scientistIntent/promptShapeParity.test.ts src/compiler/scientistIntent/clarificationContract.test.ts src/compiler/scientistIntent/realizeScientistIntent.test.ts src/compiler/scientistIntent/noBypass.test.ts src/schema/Wave2NamingCrosswalk.test.ts src/schema/Wave2QuantitySchema.test.ts src/registry/VerbActionMapRegistry.test.ts src/registry/VerbActionMapRegistry.synonyms.test.ts src/compiler/biology/BiologyVerbExpander.test.ts src/compiler/pipeline/passes/ChatbotCompilePasses.test.ts

Final (after all edits): same command, expected `All pass`, 14 files. Key expectations:
- vocabulary.test.ts 'resolver-spec.validation' = the LOADER SCHEMA+LINT BOOT leg:
  shipped vocabulary validates + lints CLEAN, zero findings (this is the acceptance
  criterion "loader schema+lint boot clean with the new triplet" — boot-fail-loud is
  exactly this test; a broken triplet also breaks server boot by design).
- vocabularyMirrorDrift: all 5 mirror legs green + mutation leg green.
- Wave2NamingCrosswalk 'machine-extracted vocabulary counts match the adjudication
  file (drift guard)' green with declared 32/32/27 and the 3+29=32 partition.
- VerbActionMapRegistry suites green at 27.
- promptShapeParity: NOTHING TO CHANGE (composer read it: it pins the taught TOP-LEVEL
  SHAPE examples through strict Ajv and uses `vocab.verbs()[0]` = still 'seed'; bead_beat
  is not taught in any shape example; all four taught shapes stay green).
- realizeScientistIntent 'agitate' door-2 leg stays green: its `originalTable.replace(
  'canonical: shake', ...)` hits the same_operation VERB-SHAKE row (:53), which is
  before all appended content — unaffected.
- BiologyVerbExpander.test.ts green (bead_beat expands to event_type 'mix' in
  ALLOWED_EVENT_TYPES).
Broader sweep before reporting done (catches anything the grep sweep missed):

    npx vitest run

Typecheck baseline rule: the server workspace carries a pre-existing tsc baseline.
Capture raw output before and after and diff:

    npx tsc --noEmit > /tmp/a5g-tsc-before.txt   # run at baseline, before edits
    npx tsc --noEmit > /tmp/a5g-tsc-after.txt    # after all edits
    diff /tmp/a5g-tsc-before.txt /tmp/a5g-tsc-after.txt   # must show ZERO new error lines

Report: paste the before/after counts plus every deliberate pin diff (files 9-15) with
one-line justifications; name the mirror that went RED at each mid-step.

## Worker contract

- Branch off lane trunk: cl/W2-8-A5g-lane2-l2t1710 off cl/integration-2 (bb5c6501);
  worktree /mnt/vast/home/brad/git/wt/W2-8-A5g-lane2-l2t1710.
- Unique deliverable: .hermes/plans/W2-8-A5g-report.wip-l2t1710.md in the worktree.
- Contracts: NO hardcoded policy anywhere (CLAUDE.md hard-stop rule): the entry mirrors
  the mix/shake data shape; zero new interpreter/lint/loader code — the ONLY TS logic
  added is the data-shaped expander (precedent: resuspend/shake lower to 'mix').
  Declaration-order append LAST at every enumerated insertion point above (order IS
  pinned). No edits outside the in-scope list.

## Reviewer bait (pre-empt these; each is a live trip-wire for this item)

(i)   Forgetting mirror (d)/(e): (e) the REGISTRY TEMPLATE literal block — the only
      hand-maintained prompt verb list — is the easy miss. NOTE: (d) the intentCompile.ts
      block is GENERATED at bb5c6501 (composer-verified correction above); do not
      hand-edit it, and do not believe a spec version that says it is literal.
(ii)  Inserting bead_beat MID-LIST in any of the four order-pinned copies (probe copy
      precedent tempts this — vocabularyMirrorDrift order pins + vocabulary.test.ts:170
      will go RED). Append LAST: types.ts after repeat_rows, wire enum after
      repeat_rows, inventory last, vocabulary yaml after repeat_rows (before policies:).
(iii) Forgetting that schema/registry/wave2-verb-adjudication.yaml's declared counts
      (count/mirror_count/verb_action_map count) are HAND-MAINTAINED while
      Wave2NamingCrosswalk.test.ts RE-DERIVES the real numbers and asserts equality —
      missing a hand bump = RED drift guard; also missing the enum_only append = the
      3+N=size partition assertion RED.
(iv)  verb-action-map count bump missed in ANY of its three pin sites: adjudication
      file :35, VerbActionMapRegistry.test.ts (two sites), synonyms.test.ts (one site).
(v)   registerVerbExpander(beadBeatExpander) DOUBLE-ADD (e.g. at both the definition
      block and the registration block) — registerVerbExpander THROWS
      "Verb expander for 'bead_beat' already registered" and takes down every import
      of simpleVerbs.ts.
(vi)  Minting a PlateEvent event_type 'bead_beat' (or touching the event-graph schema
      event_type enum) instead of lowering to 'mix' — out of approved scope; event_type
      is a hard-stop reviewer question here. event_type 'mix', details carry the kind.
(vii) Subtle: the vocab-minus-pellet RIP-OUT fixture is a copy of shipped — forgetting
      bead_beat there silently fails the "contains every shipped verb except pellet"
      loop; and its 30-verb pins must move to 31 without breaking the pellet-negative.

## Anchors: verification provenance

Composer SPOT-VERIFIED first-hand at bb5c6501 (read/grep): wire enum :24-59 ending
repeat_rows (:59), $refs :80/:253-region; vocabulary yaml mix :69 / shake :151 /
repeat_rows :784, policies ruleIds :828-830; vocabularyMirrorDrift.test.ts in full
(mirrors a-e, order pins, mutation leg); types.ts union :20-55; intentCompile.ts
prompt function :61-105 GENERATED block :87-88, tool schema :161-173; registry
template :24-30; verb-inventory.yaml :1-36; Wave2NamingCrosswalk.test.ts count
re-derivation :273-319 (declared counts asserted against re-parsed sizes — hand bumps
mandatory); wave2-verb-adjudication.yaml (counts :21/:23/:35, enum_only :74-103,
comment :75, VERB-SONICATE :70-71); verb-action-map.yaml (26 mappings, seed precedent
:3-5, mix :41-45 synonyms [combine, blend, vortex] — homogenize NOT in synonyms);
VerbActionMapRegistry.ts zod/first-match + both registry test count pins; simpleVerbs
mixExpander :120-137, resuspendExpander :142-159, shakeExpander :614-633, registration
block :636-653; BiologyVerbExpander.ts registerVerbExpander throws :42-45; BiologyVer-
Expander.test.ts listVerbs legs behind _resetRegistryForTest (no production-set pin —
the mandated pre-check, DONE, none exists); ChatbotCompilePasses.ts unknown_biology_verb
arm :1120-1130; meta-schema name/class constraints (no verb list); lint P1-P5 present,
no new rule needed; rip-out suite vocabularyRipOut.test.ts + pellet fixture; the full
golden sweep enumerating tests 9-15 above (grep 'repeat_rows'/31/26 across server,
schema, app, docs); app/src clean of the verb enum; promptShapeParity.test.ts read in
full (nothing to change).
ORCHESTRATOR PRE-VERIFIED, trusted (not re-derived): the step-0 probe results (boot +
real bead_beat actions end-to-end); HEAD bb5c6501; the A5d gate receipt trail; the
"event_type ripple through deck UI/acceptedOntologyBindings/ProposedGraphModal" scope
judgment (consistent with composer's grep: app/ never mentions the verb enum).

COMPOSER DONE

Open questions (could not resolve from the tree):
1. OBI for bead-beating: no vetted ontology id found in the repo (only the crosswalk's
   `cf:bead_beater` EQUIPMENT entry, a different namespace). Spec ships the
   seed-precedent `notes: "no canonical mapping"`; if the orchestrator wants a real
   OBI lookup (e.g. OBI sonication/mechanical-lysis terms), it needs an authoritative
   ontology source — not available in the tree (checked verb-action-map.yaml,
   wave2-naming-crosswalk.yaml, docs/wave2-naming-crosswalk.md).
2. vocab-minus-pellet fixture edit: adding bead_beat to the sole RIP-OUT fixture is
   forced by the vocabularyRipOut loop over shipped verbs (it is "shipped minus pellet"
   by construction); alternative is rewriting that loop to skip non-fixture verbs —
   composer recommends the fixture edit + 30->31 bump, but this touches the discipline
   fixture itself, so flag for orchestrator review.
3. docs/wave2-naming-crosswalk.md count refresh (item 15): nothing tests it; composer
   included it as a deliberate coder edit — orchestrator may instead fold it into the
   merge-time doc pass if coder scope should stay test-green-only.
