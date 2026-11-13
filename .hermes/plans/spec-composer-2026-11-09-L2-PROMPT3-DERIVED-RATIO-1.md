# SPEC (composer draft) — L2-PROMPT3-DERIVED-RATIO-1
Draft author: cl-spec-composer, 2026-11-09T15:30Z. NOT DISPATCHABLE AS-IS — see §0.

## 0. Dispatch preconditions (both unmet at draft time)
1. **No item block exists.** `grep -n 'id: .*PROMPT3' task-list.md` returns exactly one hit,
   `18330:id: L2-PROMPT3-RECON-1`. The orchestrator/architect must file this unit as an item
   before any brief can cite an ITEM id. This document is a SPEC, not a brief.
2. **prompt-3 is LOCKED.** corpus-state.md:12 `prompt-3  state: LOCKED`; prompt-2 is
   GATE-PENDING with a Brad card outstanding (BRAD-CARD-prompt2-regate-2iterations-l2t3385.md).
   Dispatching prompt-3 code before the gate verdict would invert the corpus loop
   (only the lowest non-WORKS prompt is active). Prepare now, dispatch after the gate resolves.

## GOAL (one sentence)
Make a mixture's composition fractions a DERIVED quantity of its recorded constituent volumes
(v_i / Σv), instead of something the authoring model has to state — so doubling the quench volume
moves 50:50 to 1:2 with no code change and no new prompt parser.

## WHY (finding ids)
- L2-PROMPT3-RECON-1 defect list #4: "Mixture cues are reactive only:
  config/drafting/mixture-material-cues.yaml detects patterns in material labels but the expander
  chain does not proactively decompose narrative text into formulations."
- Recon Link 4 verdict **ABSENT** (report `.hermes/plans/handoffs/2026-11-09T1920Z-L2-PROMPT3-RECON-1.md`
  in the recon worktree @ 3fbea561): "ratio detection is reactive on labels, not proactive on narrative."
- Acceptance criterion this unit moves: `prompt3-criteria-draft.md` **P4** (verbatim): "A mixture's
  composition must follow from its recorded constituent volumes. Probe: double the quench volume and
  the mixture ratio must move (50:50 → 1:2) without touching code."
- Recon Link 3 (quench formulation DECLARED-NOT-WIRED) stays out of this unit: this unit does NOT
  parse "900:100 quench" out of prose (that is a later, cue-bar unit). It makes the arithmetic
  honest for ANY mixture whose entries carry volumes — including hand-authored records.

## ANCHORS (every line re-verified first-hand against cl/integration-2 @ 60b26e60-era trunk)
1. `schema/core/datatypes/composition-entry.schema.yaml:53`
   `  participation:`
   → top-level property map is component_ref(11) / role(13) / participation(53) / concentration(65) /
     concentration_range(67) / source(81) / composition(90). **There is no `volume` (or `fraction`)
     property today**; the composition entry cannot even express the input this unit derives from.
2. `server/src/compiler/biology/verbs/simpleVerbs.ts:394`
   `function compositionSnapshotFromParams(`
   (NOTE: recon report wrote `simpleVerbs.ts:394`; the real path is
   `server/src/compiler/biology/verbs/simpleVerbs.ts` — cite the real path.)
3. `server/src/compiler/biology/verbs/simpleVerbs.ts:404`
   `  if (!Array.isArray(composition) || composition.length < 2) return null;`
   → the snapshot path already bails to "plain add" for <2 entries; derivation must live below this.
4. `config/drafting/composition-fraction-convention.yaml:103`
   `  readingArithmetic:`
   → the DATA home for reading arithmetic (values `rebase-to-total` / `attach-to-preceding` /
     `keep-declared` at :104-106). A new derivation mode is declared HERE, never as a TS branch.
5. `server/src/compiler/scientistIntent/compositionDecomposition.test.ts:479`
   `    // the volume stays the stated 50 uL — NO code path derived a volume from`
   (real path is `server/src/compiler/scientistIntent/…`, not `server/src/compiler/…` as the recon
   wrote). This asserts the CURRENT contract for *volume*; it must keep passing unless the unit
   is explicitly extended — do not touch it to make room.
6. `schema/workflow/events/plate-event.add-material.schema.yaml:201` (verbatim)
   `    description: "Optional source/counter density (count_per_volume, e.g. cells/uL) used to derive suspension volume = count / density and top-up = final − suspension."`
   → already a documented overclaim (recon defect #1). OUT OF SCOPE here; named only so the coder
   does not "fix" it in this unit.

## UNIT (one sentence)
Declare an optional `volume` on composition entries and derive each entry's fraction from
volume/Σvolume (× the convention's `total`) inside `compositionSnapshotFromParams`, applying the
derivation only when every non-excluded entry carries a volume and otherwise leaving declared
fractions byte-identical.

## SCOPE
OWNED (4 files, estimate ≈120-180 lines incl. test):
- `schema/core/datatypes/composition-entry.schema.yaml` — ADD one optional `volume`
  (`$ref: "./concentration.schema.yaml"`, mirroring `counter_density` at plate-event line 199-201).
  Additive only: no required list changes, no enum changes.
- `config/drafting/composition-fraction-convention.yaml` — ADD one DATA key under
  `convention.readingArithmetic` (e.g. `derived-from-volumes: derive-from-entry-volumes`) plus a
  prose comment block stating precedence (volumes present AND complete ⇒ derive; else declared
  fractions, unchanged).
- `server/src/compiler/biology/verbs/simpleVerbs.ts` — in `compositionSnapshotFromParams`, when the
  DATA-selected arithmetic is `derive-from-entry-volumes` and every non-excluded entry carries a
  volume, compute `fraction_i = volume_i / Σvolumes × total` and emit it through the SAME
  `fractionFormat` rendering the convention already declares (:137). No reagent nouns, no numeric
  literals (total/tolerance/rounding all read from the convention file).
- `server/src/compiler/scientistIntent/compositionFractions.test.ts` (existing sibling) OR a new
  sibling test file — RED first: two entries `{volume: 900 mL}` / `{volume: 100 mL}` ⇒ 90/10;
  `{800}/{200}` ⇒ 80/20 (the P4 probe, as a unit test); mixed (one entry with volume, one without)
  ⇒ declared fractions pass through unchanged; `cells` role (convention `excludeRoles: [cells]`)
  never enters Σ.

PROHIBITED (explicitly out):
- Any prose/narrative parser ("900:100", "equal volume") — that is the cue-bar unit, not this one.
- `config/drafting/mixture-material-cues.yaml` (reactive detection stays as is).
- `plate-event.add-material.schema.yaml` and recon defect #1's overclaim.
- `app/**` — no UI/tooltip change; the tooltip already projects `composition_snapshot`
  (recon Link 8 = WORKS).
- The `compositionDecomposition.test.ts:479-485` assertions (volume stays as stated).
- Any reagent/vendor/role vocabulary; any new TS enum or literal list.

## OUTPUT BUDGET
files ≤ 5, lines ≤ 300 (product + test). If the derivation cannot be expressed without a second
pass over the lowering (i.e. volumes do not survive into `params.composition`), STOP and report
BLOCKED with the measured chain rather than widening scope.

## VERIFY (exact commands, measured baselines)
    cd /mnt/vast/home/brad/git/cl-integration-2
    # RED first — new test must fail for the right reason before the derivation exists:
    cd server && ../node_modules/.bin/vitest run src/compiler/scientistIntent/compositionFractions.test.ts
    # (baseline at f2853e90: file green; add 4 cases, expect 4 FAIL before the change)
    cd /mnt/vast/home/brad/git/cl-integration-2/server && ../node_modules/.bin/vitest run \
      src/compiler/scientistIntent/ src/compiler/biology/
    npx tsc --noEmit -p .            # expect exit 0
    # existing pins must be unmoved:
    ../node_modules/.bin/vitest run src/compiler/scientistIntent/compositionDecomposition.test.ts
NOTE: `server/node_modules` may point at an empty tree in worktrees (measured 2026-11-09, VACPINS
thrash root cause) — use `../node_modules/.bin/vitest` and confirm the binary resolves BEFORE the
first run; do not report a package-resolution failure as a RED test.

## COMMIT DISCIPLINE
- Worktree on LOCAL disk (`/tmp/wt-L2-PROMPT3-DERIVED-RATIO-1-<unit>`), branch
  `cl/lane2-prompt3-derivedratio-<unit>` off trunk; do not create either yourself.
- One commit per step: (1) RED test, (2) schema + convention DATA, (3) derivation. No WIP commits
  left for the launcher to author.
- Final commit message tail must be exactly one marker line:
  `L2-PROMPT3-DERIVED-RATIO-1 UNIT <unit> DONE <40-char sha>` (sha read with `git rev-parse HEAD`).

## REVIEWER BAIT (pre-empt each)
1. **Hardcoded numbers.** `100`, `0.9`, `1e-4` in TS = instant FIX. `total`, `tolerance`,
   `displayRoundingFactor`, `excludeRoles`, `fractionFormat` all already exist in
   composition-fraction-convention.yaml — read them, do not restate them.
2. **Reagent/OOD vocabulary in TS.** No "DMEM"/"trypsin"/"FBS"/"quench" anywhere in the diff; the
   test fixtures use them, product code must not.
3. **exactOptionalPropertyTypes.** `volume?: {…}` must be `volume?: Concentration` and assigned
   only when present — `volume: maybeUndefined` fails `tsc`; spread-conditionally instead.
4. **Silent behaviour change.** With volumes absent, output must be byte-identical to today
   (existing 40+ composition tests). A partial-volume composition must fall back to declared
   fractions, not to a derived attempt with a zero denominator (guard Σv > 0).
5. **YAML reload trap.** The convention file is loaded PER call (simpleVerbs.ts:405-409 comment);
   do not introduce a module-level cache — a process cache is the documented anti-pattern here and
   makes the "no restart needed" contract false.
6. **Schema authority.** Adding `volume` to the schema does not license the compiler to invent it;
   no migration, no `records/**` edits, and `additionalProperties:false` stays intact.
7. **Weakening a pin.** Do not edit compositionDecomposition.test.ts:479-485 to prove derivation.
   Those assertions are about a DIFFERENT quantity (event `volume`), and touching them is the
   fastest route to a FIX verdict.
8. **Out-of-scope fix.** Do not delete the plate-event.add-material.schema.yaml:201 overclaim;
   file it in the report as a named follow-up instead.
