# WIDGET-R1 — Platform: generic item-hint-driven ArrayWidget item authoring (DRAFT, spec-composer l1t0510)

STATUS: DRAFT for orchestrator review. Spine = architect ruling
`.hermes/plans/2026-10-30_lane1-taptab-array-ref-widget-decision.md` (0726ff4b). The ruling's R1
file list, hard constraints, and exclusions are DECIDED — this spec does not relitigate them, it
makes them executable. Cites below were re-verified first-hand (read-only) on
`cl/gc16-knowledge-door-l1t2100` @ 1f7a92fe (worktree
`/mnt/vast/home/brad/git/wt/gc16-knowledge-door-lane1-l1t2100`) and on trunk
`cl/integration-1` @ 7c802687 — the two branches are byte-identical under `app/src/editor/taptab/`
and for `server/src/ui/EditorProjectionService.ts` (verified: diff of taptab+server between
merge-base and the GC-16 branch is empty), so every cite below is true on trunk too.

## Goal
Make `widget: array` + typed item-hint AUTHORABLE through the taptab widget: "+ Add item" seeds an
item from the hint's field set (never bare `{}`), each item renders authorable sub-fields by
reusing the existing ObjectWidget path, and the projection's UNSUPPORTED_WIDGET for `array`
becomes conditional on the hint — so a ref array committed through the REAL widget validates under
the server's own Ajv (flips the GC-16 proof test green; unblocks GC-14 A7b).

## Branch point (hard)
Branch off `cl/integration-1` AFTER the GC-16 merge (GC-16 fix-run-2 is live as of drafting; its
merged proof-test version — 1f7a92fe as amended by fix2, which adds a `getSchema` mock and a
settle-before-submit fix to the assertion leg — is the RED baseline, NOT the 1f7a92fe verbatim
if fix2's test edits merge). Do NOT branch off the GC-16 worktree branch. Re-read the merged
`RecordCreatePanel.gc16-widget-commit.test.tsx` after the merge and adapt the flip to THAT file.

## Work items (verbatim from ruling R1, executable form)
1. `app/src/editor/taptab/documentMapper.ts` + `app/src/editor/taptab/types.ts` — surface the
   server's item-hint through the slot attrs. First-hand: the server payload ALREADY carries it
   (`server/src/ui/EditorProjectionService.ts:96` `slot.items` in editor-mode projection, `:214`
   in the form fallback; server `types.ts` declares `items?: FieldHint` at :86/:450/:558). The
   client drops it: the mapper's `slots` parameter type (documentMapper.ts:150-166) has NO `items`
   member, and `FieldAttrs` (types.ts) has only `arraySchema?: Record<string, unknown>` (:85-86),
   populated ONLY on the FORM surface (documentMapper.ts:228, `slot.widget === 'array' &&
   slot.properties` — the `$.lines` budget pattern; that is the FORM/documentMapper surface, NOT
   the taptab knowledge slots, which arrive via the editor-mode projection as `slot.items`).
   Add the hint to the slot param type and pass it into the fieldRow attrs (a `items`/hint member;
   FieldRow's `addAttributes` needs the matching attr — `arraySchema: { default: null }` already
   exists at FieldRow.tsx:183 and may be reused or superseded by a new JSON-serializable attr).
2. `app/src/editor/taptab/extensions/FieldRow.tsx` (plumbing only) +
   `app/src/editor/taptab/extensions/WidgetRenderer.tsx` — forward the item-hint's field set and
   per-item values into ArrayWidget. First-hand: WidgetRenderer.tsx:274-275 renders
   `<ArrayWidget value widget readOnly onCommit />` with NO hint, while the object branch at
   :278-295 forwards `properties={(objectProperties ?? []).map(...)}` — mirror that forwarding
   (FieldRow.tsx:156 already feeds `objectProperties={attrs.objectConfig?.properties}`).
3. `app/src/editor/taptab/widgets/ArrayWidget.tsx` — with a hint present: "+ Add item"
   (currently :85-93, `onCommit([...items, {}])` — the whole gap) seeds `{field: ''}`-shaped
   entries from the hint's field set, and each item renders via the EXISTING ObjectWidget
   (ObjectWidget's edit path already does label+input+`setValueAtPath` per property and commits a
   whole-object `onCommit` — ArrayWidget splices the edited item back at its index). Hint-LESS
   arrays keep today's behavior AND the projection keeps its loud diagnostic (a hint-less array is
   a spec defect marker — do not silence it, do not delete the raw fallback).
   READ path ArrayWidget.tsx:46-63 already renders read-only arrays — do not regress it (A7a and
   browse receipts depend on it).
4. `server/src/ui/EditorProjectionService.ts` — UNSUPPORTED_WIDGET for `'array'` (set at :260-265)
   becomes CONDITIONAL: suppress for `array` ONLY when the slot declares a valid typed item-hint
   (items present with a `path` and a valid `widget` — `UISpecLoader.validateFieldHint` at :238+
   already defines validity; the loader even walks `array.items` at :276-277). `'object'`,
   `'custom'`, `'markdown'` unchanged. Hint-less `array` still emits, items echo preserved
   (:349-350).
5. Tests (see Verification): the merged proof test flips green (commit-through-widget payloads
   validate under Ajv2020 against the REAL `schema/knowledge/*.schema.yaml`, same config as the
   server: allErrors/strict-false — the test file already builds that Ajv); one ArrayWidget unit
   test pins the hint-seeded item shape; the ObjectWidget/WidgetRenderer reuse needs no new test
   surface.

## File boundary (hard)
IN: app/src/editor/taptab/{documentMapper.ts, types.ts, extensions/WidgetRenderer.tsx,
extensions/FieldRow.tsx (attr plumbing only), widgets/ArrayWidget.tsx} + new ArrayWidget unit
test; the proof test file `app/src/event-editor/create/RecordCreatePanel.gc16-widget-commit.test.tsx`
(its expectations flip); server/src/ui/EditorProjectionService.ts + the server projection test
re-pins named below.
OUT: schema/knowledge/*.ui.yaml (GC-16's data leg — including the `kind: "record"` seed in the
item-hints, a DATA edit per ruling R1/4); ObjectWidget.tsx; ReflistWidget.tsx (dead stub at
:113-122, ruled dead-chrome, do NOT resurrect or touch); RecordCreatePanel.tsx; ui-v1.schema.yaml;
no new widget kind, no record-picker sub-slot (R1 exclusion), no new vocabulary (item-hint,
object widget, slot, field only).

## RED-first
At the branch point the merged proof test is the faithful record of the gap (widget commits
`[{}]`, real schema rejects at /supports/0 etc.). Flip = rewrite the two "records the gap" legs
into authoring legs with the SAME drives: render RecordCreatePanel, open the array row,
"+ Add item", now FILL the hint-declared sub-field inputs (type / id / label text inputs render —
`.taptab-object-field-input`), submit through the REAL serializer, and assert the CAPTURED payload
validates: `ajvErrorsFor(...) === []` (after supplying the author-owned `id` per the D-A
provisional path, as fix2 already does in its control). KEEP the control legs (hand-carried valid
arrays pass) and keep the test honest — no weakening to `toEqual([{}])`-style pins, no mock of
taptab. Write the ArrayWidget unit test FIRST (RED against current trunk: expect
`.taptab-array-add` with a hint to commit `{type: '', id: '', label: ''}`-shaped seed, NOT `{}`;
expect sub-field inputs to render per hint).

## First targeted check (proves the approach early)
`cd app && npx vitest run src/editor/taptab/widgets/ArrayWidget.item-hint.test.tsx` — RED before
any change (widget ignores hints, commits `{}`), GREEN after item 3 + the props plumbing (2).
That single file exercises seed-shape + per-item ObjectWidget sub-fields + splice-back on commit.

## Verification (raw excerpts in report)
- App typecheck: `cd app && npx tsc --noEmit`. CORRECTION to the dispatch brief: the "<=12"
  baseline is STALE — measured 21 errors across 14 files on trunk @ 7c802687, NONE in
  `editor/taptab/` or `event-editor/create/`. Rule: capture a fresh baseline at claim time on the
  post-merge trunk, require ZERO new errors and ZERO in touched files.
- Server typecheck: `cd server && npm run typecheck`. CORRECTION: the "33-error pre-existing
  baseline" is WRONG for current trunk — measured 0 (clean) at 7c802687 (the 25-error drift lives
  only in the older GC-16 merge-base). Rule: server tsc stays at 0.
- App suites: `cd app && npx vitest run src/editor/taptab/widgets/ArrayWidget.item-hint.test.tsx
  src/event-editor/create/RecordCreatePanel.gc16-widget-commit.test.tsx
  src/event-editor/create/RecordCreatePanel.gc16.test.tsx
  src/editor/taptab/CompositeWidgets.test.tsx src/editor/taptab/documentMapper.test.ts
  src/editor/taptab/FieldRowEditability.test.tsx` — expected: ALL green, proof test's two legs
  fully green (Ajv-clean payloads).
- Server suites: `cd server && npx vitest run src/ui/EditorProjectionService.test.ts
  src/ui/EditorProjectionFallback.test.ts src/ui/UISpecLoader.editor.test.ts` — green WITH the
  honest re-pins named in the bait section.
- ALL git via `git -c core.fileMode=false` (NFS mode-bit noise).

## Worker contract
- Worktree: `/mnt/vast/home/brad/git/wt/widget-r1-lane1-l1t0510`, branch
  `cl/widget-r1-array-item-hint-l1t0510` off `cl/integration-1` AFTER the GC-16 merge (slot locks
  + 60-min stagger honored).
- Report (unique path): `/home/brad/.hermes/cl/lanes/1/widget-r1-report-l1t0510.md` —
  append-report-as-you-go; ONE commit per logical defect/unit (mapper-surface / renderer-forward /
  widget-seed+sub-fields / server-conditional / test-flip); end `STATUS: complete` then
  `WIDGET-R1 DONE <full 40-char sha>`.
- Stop boundary: if flipping the proof test green requires a ui.yaml data edit (e.g. the item-hint
  still lacks a schema-required `kind` field after GC-16 merges) or an ObjectWidget change, STOP
  and report `requires-rescope` with exact evidence — do NOT hardcode `kind: "record"` in the
  widget and do NOT widen the boundary.

## Browser gate (A7b, orch-owned, post-merge)
At :5192: New assertion → scope=comparison first attempt REFUSED with the verbatim
`asn-scoped-assertion-needs-context` refusal → then author the COMPLETE bundle in-browser:
context_refs + roles populated THROUGH the widget (Add item, fill sub-fields), submit, GET 200
readback. Receipts `/home/brad/.hermes/cl/receipts/WIDGET-R1/<ts>/`. YAML is NOT hot-reloaded in
this stack — any schema touch means an orchestrator restart of :3092/:5192 (coder never restarts).
A7 as a whole stays NOT evidenced until A7b passes (ruling R3).

## Reviewer bait (anticipated adversarial review — pre-empt these)
1. **Server fixture re-pins are REQUIRED, not test-damage**: `EditorProjectionFallback.test.ts`
   :880-886 pins `unsupportedDiagnostics` toHaveLength(4) INCLUDING `$.items`, and :973-977 pins
   the `$.items` diagnostic + items echo — but that fixture's `$.items` array DOES declare a valid
   typed item-hint (:386-395). Under the new conditional those pins must move (drop `$.items` from
   the count, keep the hint-less arrays `$.bindings.*`/`$.tags`/`$.deckLayout.assignments` still
   diagnostic). Do the same audit for :628 and :825 blocks (those hint-less array fields stay —
   verified first-hand they carry no `items`).
2. **Hardcode boundary**: the hint carries NO `kind` field (evidence/assertion item-hints list
   only type/id/label — verified in the ui.yaml at 1f7a92fe), yet `datatypes/ref.schema.yaml`
   REQUIRES `kind`. Seeding it from the widget is a schema-kind hardcode — forbidden; the seed
   stays a GC-16 ui.yaml data edit. If it hasn't merged by your branch point, the evidence leg of
   the proof test CANNOT go fully green from widget work alone → requires-rescope, loud, with the
   Ajv error excerpt.
3. **exactOptionalPropertyTypes**: ON in server/tsconfig.json (:13), OFF in app. In
   EditorProjectionService use the established conditional-spread /
   `if (x !== undefined) slot.x = x` idiom (:96/:214) — never `x: y ?? undefined` on the server.
   App-side `?? undefined` members (documentMapper `refKind: slot.refKind ?? undefined` style)
   remain legal.
4. **Ontology/vocabulary terms**: no new widget kind string anywhere (ui-v1 field enum
   schema/ui/ui-v1.schema.yaml:165+ unchanged), no per-field branches (`$.supports`-keyed logic =
   instant reject), no kind tables. Delete the item-hint from a ui.yaml and behavior must degrade
   LOUD (diagnostic + hint-less fallback), never silently.
5. **TipTap serialization + commit timing**: the new fieldRow attr must be JSON-serializable
   (parseHTML/JSON round-trip; FieldRow attrs are plain defaults). fix-run-2 proved the
   content-memo re-seed artifact — any new multi-commit test must SETTLE (act+flush) before
   submit, like the amended proof test does.
6. **No read-path regression**: ArrayWidget.tsx:46-63 read-only rendering and
   CompositeWidgets.test.tsx array serialization pins must stay green untouched (A7a depends on
   the read path).
7. **Test honesty**: the flipped proof test must FILL sub-fields and assert `ajvErrorsFor === []`
   on the captured payload — asserting only "not `[{}]`" is a fake-green.

## Open questions (for orchestrator)
1. Proof-test baseline drift: fix-run-2 is actively amending the proof test (uncommitted
   getSchema mock + settle-before-submit + `id: 'EVD-1'` control seen first-hand in the fix2
   worktree diff). Spec pins the flip against the MERGED file; if fix2's test edits do NOT merge,
   WIDGET-R1's coder must re-add the getSchema mock itself (small boundary widening) — decide at
   promotion time. Checked: git status/diff in the GC-16 worktree at draft time.
2. Baseline correction ratify: dispatch said app<=12 / server 33 pre-existing; I measured app 21 /
   server 0 on trunk @ 7c802687 (commands above, raw counts). Spec instructs fresh-capture +
   zero-new. Checked: ran both typechecks first-hand on trunk.
3. `kind`-seed sequencing: if GC-16 merges WITHOUT the `kind` item-hint field (R1/4 puts it in
   GC-16's data leg but fix2's mandate is the D-legs, not confirmed to include it), does the
   orchestrator want a GC-16 data pre-flight before dispatching WIDGET-R1, or accept the
   requires-rescope stop? Checked: evidence.ui.yaml/assertion.ui.yaml item-hints at 1f7a92fe list
   only type/id/label (+role_ref/context_ref); ruling assigns the fix to "GC-16's ui.yaml scope".

## Orchestrator review resolution (promotion, l1t0620)
1. PROOF-TEST BASELINE: fix-run-3 (live on slot-0 at promotion time) may amend
   RecordCreatePanel.gc16-widget-commit.test.tsx further (D13 real-form leg). WIDGET-R1 branches
   off cl/integration-1 AFTER the GC-16 merge and re-reads the MERGED file; the getSchema mock +
   settle-before-submit are expected to be in the merged baseline. If they are not, re-adding the
   mock inside the proof-test file is in-boundary (the file is already IN the boundary).
2. BASELINE CORRECTION RATIFIED: fresh-capture-at-claim + zero-new-errors rule (composer's
   measured app 21 / server 0 on trunk @ 7c802687 stands; the stale 12/33 dispatch figures are
   superseded).
3. KIND-SEED SEQUENCING: adjudicated — the architect ruling R1/4 assigns the kind:"record" seed
   to GC-16's ui.yaml DATA leg, and adv cycle 2 filed it as defect D11 against fix-run-3, which
   is instructed to close it (declare kind in each ref item hint as data). EXPECTATION at the
   WIDGET-R1 branch point: the merged ui.yaml hints already carry kind. If D11 lands as
   requires-rescope instead, the coder files requires-rescope per the stop boundary — do not
   widen the widget boundary.

## ORCHESTRATOR AMENDMENT l1t0850 (assigned defects folded in before dispatch — 186th handoff
## NEXT TICK item 3; every claim below re-verified first-hand on trunk/worktree at 08:5x EDT)

### A1. ArrayWidget button `type` attribute (assigned defect — hard requirement, add to file
### boundary item 3 + a test pin)
`app/src/editor/taptab/widgets/ArrayWidget.tsx` declares ZERO `type=` attributes (verified:
`grep -c "type=" ArrayWidget.tsx` = 0 at trunk). The taptab-array-remove (:74), taptab-array-add
(:85) and taptab-array-done (:94) buttons sit inside the create <form> and therefore default to
type=submit: EVERY array-item commit also submits the enclosing form (duplicate POST — fix-run-2's
report RAW block reproduced it). REQUIREMENT: all three buttons get `type="button"`, and the new
ArrayWidget unit test (or the proof test) PINS one submit per authored payload (e.g. spy the form
submit / capture callback — assert "+ Add item" click does not fire form submit). This is RED-first
too: write the pin before the attribute.

### A2. O4 — ui-v1 `options` object-vs-array drift (assigned; boundary WIDENED:
### schema/ui/ui-v1.schema.yaml field-hint `options` keyword ONLY)
Verified first-hand at trunk: ui-v1.schema.yaml:236 declares `options: type: "object"` (with
choices/refSchema/itemWidget properties — refSchema and itemWidget have ZERO consumers in
server/src and app/src, verified by grep; `choices` is declared nowhere in any schema/*.ui.yaml).
The CONSUMER truth is the array form: UISpecLoader.ts:282 (`field.options && !Array.isArray` is a
validation ERROR), UISpecLoader.ts:695 (builds an array), types.ts:82/:446
(`options?: FieldOption[]`), EditorSuggestionService.ts:200 (iterates), and every shipped ui.yaml
(calibration-record.ui.yaml:41+, controlled-document.ui.yaml:52/:115, competency-authorization.ui.yaml:33+)
uses `- value/label` arrays. The ui-v1 `options` object declaration is INERT (the loader does not
Ajv-validate specs against ui-v1; UiReadonlySpellingProjection.test.ts only reads the `readonly`
keyword) but it is exactly the EDITOR-1-carried drift ("two local terms for one entity" energy:
two vocabularies for one field). FIX: re-declare the field-hint `options` in ui-v1.schema.yaml as
`type: array, items: {value, label}` matching the consumer; drop the dead refSchema/itemWidget/
choices sub-shape from the field-hint `options` object. Boundary: ONLY the field-hint `options`
keyword — nothing else in ui-v1.schema.yaml, no loader changes, no ui.yaml content edits.
If any ui-v1 schema test exists that pins the object shape, update it (no such pin found; audit
server/src for ui-v1 schema-shape tests before concluding).

### A3. Seed rule correction — hint-driven per-field seeding, kind-carrying items (assigned
### D11-seed-const data-leg expectation; refines item 3 of the spec body)
The merged item-hint (GC-16 worktree evidence.ui.yaml :86+; verify on the MERGED trunk at claim)
declares `kind` as a SINGLE-OPTION non-readonly select (options: [{value: "record", ...}]). The
body's "`{field: ''}`-shaped entries" seed rule would seed `kind: ''` — an INVALID datatypes/ref
(ref.schema.yaml: kind:record then-requires id+type; empty string is not the enum value). Generic,
schema-faithful seed rule (NO kind table, NO field-name branches): for each hint-declared
sub-field, seed text/number fields to `''`; seed a `select` field whose hint declares EXACTLY ONE
option to that option's `value`; anything else seeds `''`. The seed reads the option value FROM
THE HINT — delete the option from the ui.yaml and the seed degrades, loud-diagnostic rules
unchanged. EXPECTATION this makes true: a committed item from "+ Add item" on a knowledge ref
array GENUINELY carries `kind: "record"` before the author touches it (the GC-16 ui.yaml comments
defer exactly this to R1; the flipped proof test's Ajv-clean assertion depends on it —
without A3 the ref-array payload cannot validate since kind is required and '' fails the enum).
Update the RED-first unit-test expectation accordingly (seed object includes the single-option
select's value, not '').
