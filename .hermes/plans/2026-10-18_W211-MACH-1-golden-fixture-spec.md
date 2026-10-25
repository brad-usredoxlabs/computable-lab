# W211-MACH-1 SPEC DRAFT — ZYMO golden demo, deterministic leg (planted-ambiguity fixture drives the real UI end-to-end)

Composer: cl-spec-composer, lane 2. Composed 2026-10-18 at trunk
`cl/integration-2 @ 045147ce` (docs tip; code tip c0c4bed9 — the tip that
ANSWER-BIND-1 / ANSWER-SURFACE-1 will merge onto). Every file:line below was
opened personally with read_file/search_files against
/mnt/vast/home/brad/git/cl-integration-2 (no scout output is relied on; scout
slot unused, same posture as the ANSWER-BIND-1/SURFACE-1 specs). All git via
`git -c core.fileMode=false` (NFS mode-bit noise).

STATUS: DRAFT — pending orchestrator review; not dispatchable until promoted.

## MISSION (one sentence)

Author a versioned, declarative, ZYMO-derived intent fixture planted with
EXACTLY four obligation classes, replay it deterministically through the REAL
lane UI (draw -> role-bind -> clarify -> answer via real surfaces -> recompile
-> deck with >=1 meaningful checkbox -> accept -> rereadable LPR with lineage),
and assert FIDELITY (action/parameter/role/answer), zero surviving blockers,
and no silently discarded facts — with ONLY the natural-language producer
replaced, at its wire-format boundary.

## DEPS (blocking)

- ANSWER-BIND-1 (server, data-side answered-slot binding; spec
  `.hermes/plans/2026-10-18_0845-ANSWER-BIND-1-answered-slot-binding-spec.md`)
  — MUST be merged to cl/integration-2 before this item codes. The obligation
  (b) leg rides its `[[kind:id|label]]` -> authoritative slot-binding
  machinery; without it an answered ambiguous-noun provably never enters
  `boundKeys` (resolveNounsPass.ts:149-152, verified).
- ANSWER-SURFACE-1 (client, '/l' routing for `actionLocation.argument ===
  'labware'`; spec
  `.hermes/plans/2026-10-18_0905-ANSWER-SURFACE-1-labware-menu-routing-spec.md`)
  — MUST be merged before this item codes; the obligation (b) card's surface
  assertion pins its effect.
- Already in trunk (re-checked via the A5h decision's containment note):
  WIRE-TEMP-1 (4b068515, declared temperature forwarded — InferenceClient.ts:66,:92),
  MINT-IDEM-1 (68e5a85c, reuse-mint returns 200), MINT-FLOOR-UI-1 (f57149e3,
  mint-row dedup; clarificationAdapter.ts:45 comment).
- Verify both merges exist BEFORE writing anything:
  `git -c core.fileMode=false log --oneline | grep -iE 'ANSWER-BIND-1|ANSWER-SURFACE-1'`
  — two markers expected. Zero hits -> STOP, this item is not ready.

## ENVIRONMENT (verbatim per dispatch)

trunk cl/integration-2 at /mnt/vast/home/brad/git/cl-integration-2; lane stack
backend :3093 / frontend :5193 (restart after YAML changes via
cl-lane-stack.sh 2 restart — BLOCKING, background only); data repo
/home/brad/.computable-lab/worktrees/main; ALL git via -c core.fileMode=false
(NFS mode-bit noise); app tests: cd app && npx vitest run <files>; browser
gate = cl-browser-reviewer receipts against :5193 (VERDICT: accept is the
done-gate, rule 6b).

Composer note (checked, do not re-litigate): `cl-lane-stack.sh` is NOT under
repo `scripts/` (checked: only backfill/download/ontology/qms-demo-seed there);
it is an orchestrator-side tool on PATH — the coder never restarts stacks
anyway (worker contract below).

## ORIENTED SHORTCUTS (verified first-hand @ 045147ce — REUSE, do not re-author)

Harness + fixture precedents:
- Golden harness to EXTEND: `app/e2e/w2-11-campaign-demo.spec.mjs` (1160
  lines, Playwright .mjs gate; legs D1-D6; D4 leg :811-1104 is the
  localize -> answer -> deck -> accept -> LPR chain this item generalizes).
  Run form (documented in its header): `cd app && npx playwright test
  w2-11-campaign-demo.spec.mjs --project=chromium` against orchestrator-owned
  BASE_URL=:5193 + API_URL=:3093. Vitest posture: like every app/e2e/*.spec.*
  file it collects with NO runnable tests (use `npx vitest run` only on real
  .test.ts files).
- Versioned fixture dir precedent (browser-harness side):
  `app/e2e/fixtures/w28-said-meant/` (said.pdf + xdr.json).
- Self-pinned frozen-YAML fixture precedent (with PROVENANCE):
  `server/src/ingestion/vendor-protocol/campaign-fixtures/` (zymo-semantic-
  draft.frozen.yaml self-pins sha d878727a…, zymo-robot-answers.frozen.yaml,
  PROVENANCE.md) — copy the self-pin + provenance-doc pattern for the new
  fixture.
- Seed rows the robot/UI answers name: spec.mjs SEED_ROWS :352-377
  (LAB-w211-sample-plate, LAB-w211-reservoir, MAT-w211-lysis/-magbeads/
  -magbuffer/-magwash1/-magwash2/-water with synonyms) — idempotent POST
  /api/records seeding, GET-first.

The four surfaces the fixture must drive (all EXISTING, production paths):
- Clarify -> answer: `app/src/event-editor/right-pane/protocol/
  ProtocolLocalizationThread.tsx` — testids `pl-clarify` :702, axis radios,
  `pl-submit-answers` :724, `pl-deck-review` :779,
  `pl-deck-review-labware` :787, `pl-load-deck` :831, `pl-refine-input` :847,
  `pl-refine-send` :855, `pl-accept` :867. Answer act:
  `handleClarificationPick` :382-396 stores `answers[label] =
  mentionToken` and re-POSTs `intentCompileFromPrompt` — this is the REAL
  surface; scripted answers must ride it.
- Card -> menu routing: `ProtocolLocalizationThread.clarificationAdapter.ts` —
  `CLARIFICATION_MENU_BY_REASON` :38-42 ('/m' for unknown-noun /
  ambiguous-noun / resolution-lookup-failed), menuProvider picked at :83;
  ANSWER-SURFACE-1 extends the table to (reason, argument) with
  'labware' -> '/l'.
- Picker: `app/src/event-editor/right-pane/ai/ClarificationPicker.tsx` — '/l'
  routes to `resolveLabware` :31; `answerFromMention` :118 emits exactly
  `[[labware:<id>|label]]` (:118-131); `canMint` is material-only :262, so a
  '/l' card honestly shows NO mint floor.
- Mint '/m' path: `server/src/api/handlers/VocabHandlers.ts` — POST
  /vocab/mint {refKind,label}; `MINTABLE` :45 (material-only; non-mintable
  refKind rejected :104-109). MINT-IDEM-1 makes reuse return 200.
- Deck accept -> LPR: `server/src/api/handlers/IntentAcceptHandlers.ts` —
  accept POST mints `LPR-${base}-${Date.now().toString(36)}` :57, kind
  'local-protocol' :69, store.create :95; the D4 leg re-reads it via
  GET /records?kind=local-protocol and asserts `inherits_from.id ===
  familyId` + `branch_resolution` content (spec.mjs :1088-1103) — reuse this
  reread shape for the lineage assertion.
- "Blockers" in the compile result — VERIFIED LOCATOR: there is NO literal
  `blockers` field on the compile response. The bar is
  `blocked = clarifications.length > 0` (resolveNounsPass.ts:326, verified)
  surfaced as HTTP 422 `{error:'NEEDS_CLARIFICATION', clarifications:
  verbatim ScientistIntentUnresolvedFact[]}` (handler doc-comment :26-27,
  send :416); outcome 'gap' returns 200 WITH `clarifications` additively
  (:215-216). "Zero surviving blockers" therefore asserts: the FINAL draw's
  response is 200 with `clarifications` empty (no held fold, no bar) — see
  FIDELITY ASSERTIONS.
- Producer seam (where the fixture replaces the model):
  `IntentCompileFromPromptHandlers.ts:335-336` — `const llmClient =
  deps.llmClient ?? createInferenceClient(toInferenceConfig(deps, ctx))`;
  `toInferenceConfig` :82 reads the ai profile wired in
  `server/src/server.ts:857-871` from `ctx.appConfig.ai` (profiles YAML).
  TWO distinct LLM calls exist per round-trip: branch-question extraction
  when no answers yet (:339-346, `extractBranchQuestionsFromSmallLlm`) and
  the answered compile draw (:378-383, `compileFromSmallLlm`).
- Declared roles: `renderDeclaredRolesBlock` (handler :172, loaded :378)
  injects the family's `roles` as prompt DATA; the ENGINE does not consult
  them yet (A5d V8 stands; the spine-side consultation is a deferred earned
  decision per W28-A5h consequences). The golden leg's class-(a) assertion
  must therefore be framed on the STORE side — see OBLIGATION (a).

## FIXTURE CONTRACT — app/e2e/fixtures/w211-golden/ (NEW)

1. `zymo-intent.frozen.yaml` — the versioned, declarative, ZYMO-derived
   fixture. Self-pin its sha256 inside the file + a PROVENANCE section
   (campaign-fixtures pattern). CONTENT IS DATA, reviewed by the orchestrator
   before merge — it is NOT product policy and NOT special-cased anywhere in
   code. Derived from the D4_PROMPT lineage (spec.mjs :888-899, the
   architect-ruled fully-specified rewrite from
   decisions/W211-D4-noun-drift-fixture-decision-l2t2150.md) plus the
   frozen-draft ZYMO content; every scientific statement reviewed.
2. The fixture carries the frozen WIRE responses for both producer calls
   (branch-questions response + scientist-intent draw response — the handler
   makes exactly two, see oriented shortcuts), so the replay is byte-stable.
3. The fixture carries the expected-deck block: the noun the deck review must
   offer (class-d survivor / zero-match addition) and the FIDELITY expectations
   the harness asserts against.
4. `zymo-intent.integrity.test.ts` — a REAL vitest file (runs under
   `npx vitest run`) pinning: self-pin sha matches content; the four
   obligation entries exist with their declared kinds; no obligation is a
   labware-mint request; ids referenced are seeds, never fixture-pinned
   mint/accept ids.
5. Fixture review doc: `.hermes/plans/W211-MACH-1-fixture-review.md` — every
   planted sentence + which obligation it serves + why its ambiguity class is
   one that ACTUALLY exercises the machinery (per the W2-11 history: the
   historical 4->6->6->6 drift was MODEL naming instability plus the
   arithmetically-inconvergable ambiguous-noun (A5h Q1.3) — neither is an
   obligation class here; with the producer replaced, model drift is out of
   scope BY CONSTRUCTION, and the ambiguity classes below are the ones the
   BIND-1/SURFACE-1/mint/keep machinery respectively consumes).

## THE FOUR OBLIGATIONS (verbatim classes from the W211-MACH-1 block)

(a) ROLE-UNIQUELY-RESOLVABLE NOUN — fixture names one labware noun
    (e.g. the sample plate) against which the harness seeds exactly ONE
    candidate that is unique and type-compatible (labware-kind record passing
    the landing-zone taxonomy for the `labware` argument contract —
    adapters.ts:236-263 per A5h Q1.5). ASSERT: it binds WITHOUT a card on the
    first draw (no clarification fact for its label; binding lands in
    resolvedByLabel / the recomputed intent — the engine's single-in-band arm,
    resolutionEngine.ts:199-207), AND its negative half — the SAME noun class
    DOES card when not unique — is exercised by obligation (b)'s card (the
    pair is the positive/negative control; do NOT add a second fixture noun
    just to re-prove the negative). NOTE (A5h): the spine does not yet
    consult `roles.labwareRoles` — (a) is asserted via unique in-band
    resolution, not via declared-role consultation; the declared-role
    pre-resolution end-state is a deferred decision and is OUT OF SCOPE.

(b) GENUINE AMBIGUITY ON A LABWARE-SEMANTIC SLOT — fixture names one labware
    noun with >=2 deterministic in-band candidates (seed >=2 labware rows
    whose names both land in the acceptance band for it; band
    policies.ambiguity.confidenceAccept min 0.7 — vocabulary.yaml:842-847;
    a tier-1 hit is ALWAYS in-band per A5h Q1.3, so seeded name overlap makes
    this deterministic once the producer is frozen). ASSERT: the fact carries
    `actionLocation.argument: 'labware'` and its card renders the '/l' labware
    surface (records/definitions, NO mint floor row — ANSWER-SURFACE-1);
    answer by PICKING a candidate in the real ClarificationPicker; the pick
    emits `[[labware:<id>|label]]` (:118-131); ANSWER-BIND-1 makes it the
    authoritative binding; the NEXT compile deterministically lacks the fact
    (answered-label shrink, no redraw) and the recomputed intent carries the
    PICKED record's id/label in that slot (verified in the intent, not just a
    200).

(c) UNKNOWN NOUN — one MATERIAL-semantic noun with zero store match (a
    reagent the seeds lack; NEVER a labware noun — minting labware is the
    ruled category error, A5h Q3 / 'the '/vocab/mint' floor stays
    material-ONLY, third reaffirmation). ASSERT: the card renders the '/m'
    surface WITH the mint floor; take the REAL UI mint act (the picker's floor
    row fires the same POST /vocab/mint {refKind:'material', label}
    ClarificationPicker uses); the minted record is a material with governed
    provenance (VocabHandlers mint message/provenance path :160 — read its
    created envelope); the next compile binds the slot from the minted record
    and the unknown-noun fact clears. MINT-IDEM-1: a re-mint returns 200.
    NEVER fixture-pin the minted id — read it from the mint response /
    GET-back (dynamic-ids rule).

(d) ONE GAP FACT — one gap fact answered through its real surface that is
    NOT a noun fact (rides the answers map as non-idiom text). ASSERT IT
    SURVIVES TO THE DECK: the fact is not silently discarded (it appears in
    the compile result's additive `clarifications` on the completing 'gap'
    200 — handler :215-216 — or in the deck review content), and the deck
    review's >=1 checkbox CORRESPONDS to expected review content named in the
    fixture's expected-deck block (a placement offer naming the expected
    noun), not merely `boxCount > 0`. NOTE / RISK: whether an outcome-'gap'
    200 routes through `pl-deck-review` in the UI is UNVERIFIED (the D4 leg
    reached deck review from the held-422 fold, spec.mjs :1030-1046). If the
    gap outcome does not render the deck gate, that is a PRODUCT DEFECT ->
    STOP boundary: file a fix task, do not absorb, do not weaken (see OQ2).

DECK-FOLD-1 TRAP (architect warning at spec.mjs :1038-1041, verbatim
warning): seeding resolvable records for nouns you want as zero-match deck
additions flips hints into resolvedLabwares, which deriveDeckLabware ignores
— re-emptying the review. The fixture's class-(d) deck checkbox must come from
the ZERO-MATCH arm and its seed plan must state which nouns are seeded vs
which stay zero-match. The old `boxCount > 0` D4 assertion is NOT reused as
the fidelity bar — it stays in the retired D4 leg untouched.

## PRODUCER REPLACEMENT — the wire-format boundary (design; OQ1)

The ONLY non-production component is the producer. Recommended seam (config
data, zero code): point the lane stack's ai profile baseUrl
(appConfig ai.profiles, resolved server.ts:857-871, consumed at handler
:335-336) at a small LOCAL replay server the harness owns (a tsx/node script
under app/e2e/fixtures/w211-golden/), which serves the frozen wire responses
from zymo-intent.frozen.yaml on :chat/completions (OpenAI-compatible wire
format — the boundary is literally the producer's own protocol). Request
discrimination (branch-questions call vs compile draw) keys on the request
body's system/user content. This keeps validation, role resolution,
clarification rendering, answer submission, mint, persistence, recompile,
deck review, accept and LPR on PRODUCTION paths (:3093 itself is unchanged,
unstubbed code), and it is honest: evidence states the producer is replaced at
its wire boundary and this is a workflow-integration test, NOT model proof.
REJECTED seams: (i) baking a stub llmClient into server code = mock
configuration in code — CLAUDE.md hard-stop (CLAUDE.md:163); (ii) injecting
resolved compiler state or POSTing resolved answers directly (the old D4
mint-replay API-seam arm) is FORBIDDEN for the golden leg — "scripted answers
must go through the real UI surfaces, never inject resolved compiler state"
(W211-MACH-1 verbatim). The old API-seam replay stays ONLY in the retired D4
arm.

## HARD RULES

1. ZERO product-code special-casing for this fixture — no fixture name, no
   obligation label, no expected value may appear under server/src or
   app/src. Deliverables live ONLY under app/e2e/ + .hermes docs. If product
   defects surface (gap-deck routing, surface mismatch post-SURFACE-1,
   answered-label surviving), they are SEPARATE FIX TASKS — STOP boundary, do
   not absorb (W211-MACH-1 files note, verbatim).
2. Fixture content is DATA reviewed by the orchestrator before merge (the
   review doc is the artifact reviewed); no product-policy hardcoding; the
   replay server is transport-only — it interprets nothing, binds nothing.
3. No fixture-pinned ids in product paths: minted MAT-* ids, LPR-* ids, and
   promoted family CAN-protocol-* ids are read dynamically (mint response /
   GET-back / promoted ref), as the D4 leg already does.
4. Real surfaces only for the golden leg: every answer is a CLICK on the
   card (radio/pick/mint-floor row), every recompile is the UI's own re-POST
   (or `pl-refine-send` where the product re-sends); NO direct
   /intent/compile-from-prompt POSTs inside the golden leg.
5. The old D4 raw-draw arm is RETIRED to QUAL-1 evidence, not deleted
   silently: keep the leg but mark it `test.skip` with a comment pointing to
   W211-QUAL-1 + gate-14 (trail evidence lives in
   /home/brad/.hermes/cl/receipts/ — cite, do not delete). The frozen
   D4_PROMPT constant, mint loop, stall clause, MAX_REDRAW and `boxCount>0`
   assertion byte-untouched in that retired arm.
6. Deps merged first (see DEPS) — zero work if their commits are absent.
7. NEVER mint for an `argument:'labware'` fact (no floor exists post-SURFACE-1;
   a mint attempt there is a defect finding); material-only mint floor stands.

## RED-FIRST

RED at the pre-fix tip FIRST (W211-MACH-1 verified-by, verbatim: "RED first
at the pre-fix tip (fixture cards on '/m' / answered facts survive)"):
before the deps merge to a stack (or on a stack built at base 534f7e5f,
orchestrator's call), run the fixture's first-draw probe + one answered
recompile and RECORD: (i) the labware-argument card routes '/m'
(pre-SURFACE-1), (ii) the answered `[[labware:…|…]]` fact survives the next
draw (pre-BIND-1). Save the log in the report as the RED evidence. GREEN at
tip: same probe shows '/l' + deterministic answered-label shrink.

FIRST TARGETED CHECK (the single command that proves the approach early —
run it before writing any harness UI code, AFTER confirming both dep merges):
headless two-request probe against the lane stack — POST
`http://localhost:3093/api/intent/compile-from-prompt` with the fixture's
protocolText (expect 422 NEEDS_CLARIFICATION whose clarifications contain
exactly the planted fact set: one `ambiguous-noun` with
`actionLocation.argument:'labware'`, one `unknown-noun` (material), one gap
fact, and NO fact for the class-(a) noun), then the same body + `answers`
including `"<class-b label>": "[[labware:<seed id>|<label>]]"` (expect the
class-(b) fact GONE on the second response and the minted/seeded id present
in resolvedByLabel-equivalent output). This is the step-0 probe discipline
from W28-A5h Q4.6, transplanted: if class-(b) survives an idiomatic answer,
BIND-1 is defective — STOP, return the log, do not build UI legs on sand.
(Composed from first-hand locators; the exact resolved-slot key in the 200
body is BIND-1's shape at merge — coder pins it from the merged code, cited.)

## GATES / VERIFICATION (expected outputs)

Targeted vitest (no model calls, deterministic):
- `cd app && npx vitest run e2e/fixtures/w211-golden/zymo-intent.integrity.test.ts`
  -> PASS (sha self-pin, obligation table, no labware-mint, no pinned ids).
- Any NEW pure-logic helper files under app/e2e/ ship with their own .test.ts
  in the same directory; gate command lists them explicitly.
- Baseline posture: full app run fail-FILE names zero NEW vs trunk (comm -3
  of failing-file name lists, base vs head; flap band 61-62 per l2t0830
  handoff); `npm run typecheck -w app` error-line/file set comm-empty vs the
  23-error-line/16-file baseline.

Harness (orchestrator-run, stack already up):
- `cd app && npx playwright test w211-golden-fixture.spec.mjs
  --project=chromium` against BASE_URL=:5193/API_URL=:3093 — PASS repeatably:
  >=3 consecutive green runs; where determinism is claimed, the deck-review
  content md5 (captured by the leg into receipts) is IDENTICAL across the
  three runs and the final compile body is byte-stable across runs (WIRE-TEMP-1
  backs this; if any byte-instability appears, name it, do not average it).
- Zero surviving blockers: the leg asserts the FINAL draw is 200 with empty
  `clarifications` (see blocker locator above).
- Fidelity (not liveness), each pinned with named expected values from the
  fixture's expected block: expected actions + key parameters present and
  correct in the recomputed intent; each planted obligation produced its
  expected question OR its expected silent resolution; each answer affected
  its correct slot verified IN THE RECOMPUTED INTENT; minted noun has correct
  semantic category (material) + governed provenance + clears its slot; no
  required fact silently discarded or default-invented; deck checkboxes >=1
  AND label-matched to expected review content; accept enables; the LPR
  rereads with expected content + lineage (reuse D4's
  `inherits_from.id === familyId` + `branch_resolution` reread,
  spec.mjs :1088-1103, extended with the fidelity fields).

Browser gate (cl-browser-reviewer on :5193, rule 6b — VERDICT: accept is the
done-gate; receipts incl. screenshots + pasted GET bodies + the console-error
list):
1. Draw the fixture (harness seeds + replay producer already up); screenshot
   the first card set.
2. Class-(b) card renders the '/l' labware surface (labware records/
   definitions listed, NO mint floor row visible); pick a candidate;
   screenshot; the card is gone on the next draw.
3. Class-(c) card renders '/m' WITH the mint floor row; take the mint act;
   screenshot; the card clears next draw.
4. Class-(a) noun: screenshot evidence NO card ever named it.
5. Class-(d): the gap fact's answer goes through its real surface; the deck
   review shows >=1 checkbox whose label matches the expected content; pick
   it; `pl-load-deck`; `pl-accept` ENABLES; accept; `pl-msg` shows Accepted.
6. LPR visible: GET /records?kind=local-protocol paste shows the new LPR with
   lineage; screenshot.
7. Evidence file states in its own words: workflow-integration test, producer
   replaced at its wire boundary, NOT model proof (report + the spec.mjs
   header comment + the reviewer prompt all carry the label).

## WORKER CONTRACT

- Worktree `/mnt/vast/home/brad/git/wt/W211-MACH-1-lane2-l2t<ts>` (branch of
  the same name) off the THEN trunk tip of cl/integration-2, bootstrapped via
  the lane bootstrap pattern (scripts/bootstrap-W211MACH1-l2t<ts>.sh pattern;
  untracked trunk files synced, excludesFile configured; node_modules are
  symlinks into Brad's tree — install nothing).
- Unique deliverable paths: report
  `.hermes/plans/W211-MACH-1-report.wip-l2t<ts>.md` (worktree), receipts under
  `app/e2e/receipts/w211-mach1-l2t<ts>/`, end stdout exactly
  `W211-MACH-1 DONE <sha>`.
- Files in scope: app/e2e/fixtures/w211-golden/** (NEW: fixture YAML,
  integrity test, replay server script if seam A), app/e2e/
  w211-golden-fixture.spec.mjs (NEW leg — or the W211 legs appended to the
  existing spec.mjs area, coder cites the choice), the retired-D4 skip
  comment, .hermes docs.
- Explicitly OUT of scope: server/src/**, app/src/**, schema/**, prompts/**,
  any *.yaml under schema/ (scope gate:
  `git -c core.fileMode=false diff <base>..HEAD --name-only` shows zero
  non-e2e/non-doc paths — with ONE carve-out IF OQ1 lands on a config-only
  ai-profile file in the data repo: that lives OUTSIDE the app repo, never a
  trunk hunk). No merges, never touch :3093/:5193/:3001/:5174, never restart
  stacks (the replay server binds its own ephemeral port; the orchestrator
  wires the stack ai profile). No App.test.tsx edits. All git
  `git -c core.fileMode=false`.

## ACCEPTANCE CRITERIA (verbatim from the task list — 'verified by')

> RED first at the pre-fix tip (fixture cards on '/m' / answered facts
> survive). At tip: harness run passes repeatably (>=3 consecutive green
> runs, byte-stable deck md5 where determinism is claimed); cl-browser-
> reviewer VERDICT: accept on the named surfaces (the four planted cards
> render their kind-correct surfaces; accept enables; LPR visible). Evidence
> file states in its own words: workflow-integration test, producer replaced
> at its wire boundary, NOT model proof. W2-11 closure consumes this +
> QUAL-1's baseline report per the amendment header.

Acceptance = targeted vitest (above) + cl-browser-reviewer VERDICT: accept on
:5193 with receipts (above).

## REVIEWER BAIT (anticipated adversarial review — pre-empt these)

- Hardcode hunt: a reviewer WILL grep server/src + app/src for
  'zymo|w211|magwash|magnetic rack|MagWash'. Zero hits is the contract —
  everything lives in e2e fixture data. Paste the grep clean in the report.
- Fake-realism hunt: "did the leg inject answers via the API?" Diff the
  golden leg against the old D4 mint-replay arm — the golden leg must contain
  ZERO apiPost('/intent/compile-from-prompt') calls and ZERO
  apiPost('/vocab/mint') calls; only page.* acts on named testids. The ONLY
  API reads allowed are GET receipts (records, LPR reread).
- Labware mint trap: any /vocab/mint with refKind other than 'material', or
  any mint attempt for an `argument:'labware'` fact, is a defect finding, not
  a workaround (MINTABLE is material-only, VocabHandlers.ts:45 — you cannot
  code around it; do not try).
- Store residue: `MAT-microcentrifuge-tube-sgzg` sits in the :3093 store
  PERMANENTLY from the A5 gate runs (A5h Q1.3/Q4.4). The class-(b) noun must
  NOT be 'microcentrifuge tube' or anything that noun's label collides with;
  the '/l' routing keeps it off the labware card, but pick a clean ambiguity
  pair and say so in the review doc. Also the class-(c) unknown noun must be
  FRESH per cohort (a prior run's mint makes it known — reusing it vacuates
  the unknown-noun assertion; use a fixture-versioned nonce in the noun, or
  GET-first mint-state check that FAILS the leg if it pre-exists).
- boxCount>0 is NOT the bar: the retired D4 arm keeps its old assertion
  byte-untouched; the golden leg asserts label-correspondence. A reviewer
  comparing the two must see the retired arm skip-marked with the QUAL-1
  pointer, not deleted.
- exactOptionalPropertyTypes: enabled for the BACKEND only (CLAUDE.md rule 6;
  app has strict:true without it) — this item touches neither, but the
  replay-server .ts must follow the repo convention anyway: absent keys via
  conditional spread, never explicit undefined.
- YAML-reload trap: the fixture YAML is harness-loaded per run (no server
  reload dependency); BUT if the stack's ai profile YAML is repointed for
  seam A, the stack MUST be restarted via `cl-lane-stack.sh 2 restart`
  (BLOCKING, background only, orchestrator-side) before the harness/gate runs
  — a stale stack silently points at the real producer and the "deterministic"
  leg becomes a model draw (the worst failure mode of this item).
- Ontology terms: materials vs labware layers are the whole point of the
  surface assertion — prose must name `argument:'labware'`
  (SPINE-1 frozen unresolved shape, workflow/scientist-intent.schema.yaml:220-244,
  additionalProperties:false — do NOT add fields) and the
  `[[labware:id|label]]` / `[[material:id|label]]` idiom exactly.
- Byte-stability claims must be shown, not asserted: md5 of deck-review
  content + final compile body across the 3 green runs, in receipts.

## OPEN QUESTIONS (composer could not resolve locally; max 3)

1. PRODUCER-REPLACEMENT SEAM (OQ1, needs orchestrator ruling): recommended
   seam A = lane-stack ai profile baseUrl -> local harness replay server
   (config data, zero code — see PRODUCER REPLACEMENT). Checked first-hand:
   handler deps.llmClient :335-336 is test-only injection (server.ts wires a
   real client at :857-871); no live-server replay/recording mode exists
   (recordingStore lives in goldens/replayKernel.ts only); cl-lane-stack.sh is
   orchestrator-side (not in repo scripts/). Alternative seam B (harness
   starts its own in-process server build with a stubbed llmClient via deps)
   would NOT satisfy "drives the REAL lane UI" for the browser gate unless
   :3093 itself runs it. Whatever seam is chosen, the reviewer must see the
   config diff.
2. GAP-OUTCOME DECK ROUTING (OQ2, needs a 5-minute live probe at tip after
   deps merge): does an outcome-'gap' 200 with additive `clarifications`
   route through `pl-deck-review` in ProtocolLocalizationThread, or does the
   deck gate only mount on the complete/held-422 shapes? Checked: spec.mjs
   :1030-1046 reached deck review via the held-422 fold/foldHeldBundle;
   handler doc :215-216 proves the 200-gap body shape but not the UI fold. If
   gap does NOT render the deck gate, class-(d)'s "survives to the deck" is
   unreachable without product change -> STOP boundary + fix task per hard
   rule 1; the alternative (class-(d) fact lands on a completing draw that
   ALSO carries it into deck content via a different fold) must be probed,
   not assumed.
3. DECLARED-ROLE ASSERTION DEPTH (OQ3, wording ruling): the item says class
   (a) is "uniquely resolvable by a declared protocol role", but the engine
   provably does not consult roles yet (A5d V8; spine consultation deferred
   by W28-A5h consequences). My spec asserts (a) via unique+type-compatible
   in-band resolution with the family's declared roles present as prompt data
   + record roles on the seeded row (fixture-CAN style, spec.mjs :478-497).
   If the orchestrator wants literal declared-role consultation asserted, that
   belongs to the deferred spine decision, not this item. Checked:
   resolutionEngine.ts binding arms (per BIND-1 spec locators),
   renderDeclaredRolesBlock :172, A5h Q1.5/Q2 rejected-alternatives.

---

## ORCHESTRATOR REVIEW — PROMOTED 2026-10-18T11:25 EDT (l2t1110)

Draft citation-checked first-hand at trunk 36ceac90/b52f5dfc. Rulings:

- OQ1 SEAM: SEAM A APPROVED (ai profile baseUrl -> harness-owned local replay
  server; config DATA in the lane stack profile, zero product code). The
  reviewer must see the profile diff. Orch owns the stack restart when the
  profile is repointed (cl-lane-stack.sh 2 restart, background only).
- OQ2 GAP-DECK ROUTING: UNRESOLVED-BY-DESIGN — becomes the coder's FIRST
  check after deps merge (5-min live probe at tip); STOP boundary stands.
- OQ3: composer framing ADOPTED — class (a) asserted via unique+type-compatible
  in-band resolution; declared-role consultation is the deferred A5h decision,
  out of scope.

Locator drift (composer composed at 045147ce; re-pin at dispatch tip):
- blocked = clarifications.length > 0 is resolveNounsPass.ts:435 at tip (:326
  stale). Handler llmClient seam and server.ts ai wiring CONFIRMED.
- 'vocabulary.yaml:842-847' band citation: file not at schema/vocabulary.yaml
  at tip — coder re-pins the confidenceAccept band location from the merged
  tree; do not trust the line number.
- zymo grep bait: existing 'zymo' strings in server/src are TEST-FIXTURE-only
  (drafts/*.test.ts); the contract is zero NEW product-src hits for
  w211-golden fixture names.

DISPATCH GATE: both deps merged (BIND-1 done b52f5dfc; SURFACE-1 pending
fix1+c2) + OQ2 probe green -> dispatchable.
