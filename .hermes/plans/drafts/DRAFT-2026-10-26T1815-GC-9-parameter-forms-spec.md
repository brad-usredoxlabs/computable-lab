# GC-9 spec: /analysis — parameterSchema renders real forms (kill the raw-JSON textarea)

DRAFT by cl-spec-composer (lane 1, run 2026-10-26T1815, trunk `cl/integration-1` @ 4aa11593 docs tip /
72d32b77 code tip). NOT orchestrator-reviewed; not dispatchable until promoted. Every [F] cite below
was opened FIRST-HAND this session against the trunk worktree `/mnt/vast/home/brad/git/cl-integration-1`
(git `-c core.fileMode=false`), and the three load-bearing baselines were EXECUTED this session
(marked [F-run]).

## Status legend

- **[F]** = confirmed fact, cite opened first-hand this session (path:line into trunk @ 4aa11593).
- **[F-run]** = behavior/number proven by executing a command in-session (baseline numbers below).
- **[G7d]** = shape from the GC-7 **draft** spec `.hermes/plans/drafts/DRAFT-2026-10-26T1245-GC-7-integration-revision-spec.md`
  §A2 (:284-308). GC-7 code is NOT on trunk and the promoted GC-7 spec may re-shape §A2. Anything
  citing [G7d] is an **AMEND-AT-MERGE** item — re-anchor against the promoted GC-7 spec
  `.hermes/plans/2026-10-28_GC-7-integration-revision.md` before dispatch, never against the draft.
- **[I]** = inference / design decision of this spec, flagged for the orchestrator.

## Goal (one sentence)

Replace the raw-JSON textarea as the mandatory parameter-entry path on `/analysis` with a generic,
schema-driven `ParameterForm` renderer that turns any `analysis-revision.parameterSchema` (JSON-Schema
subset: numbers, strings, booleans, enums, nested-object groups, arrays of primitives and of objects
incl. GC-7's timed-event arrays) into labeled controls with schema-data labels, method-default
pre-fill with visible overrides, an effective-parameters frozen preview before submit, and an
actionable message (never a silent blank) on unsupported constructs.

## Authority (read in this order; scope is theirs, not mine)

1. Task block GC-9, `/home/brad/.hermes/cl/lanes/1/task-list.md:7903-7919` — description (:7909-7914)
   and `verified by` (:7916-7918) are BINDING (re-quoted verbatim in §Acceptance). `files:` (:7919) =
   "app/src/analysis/ (form generator component + AnalysisPage wiring + tests)". deps: GC-7 (:7907).
2. Trunk reality: the files in §Oriented facts. The doctrine "if something can be expressed as data,
   it must be expressed as data" (CLAUDE.md:65-67) — every DOMAIN label, unit, enum choice, group
   name, and help text on the form must come from the schema payload, never from TS.
3. GC-7 promoted spec §A2 parameter contract (once merged; draft cites are placeholders) — GC-9 must
   RENDER that shape but must not DEPEND on GC-7's code: all tests use test-local fixture schemas.
4. Handoffs 91st/92nd `.hermes/plans/handoffs/` — UI gates go through the orch deterministic-Playwright
   route FIRST (91st §4), worktree/branch contract (GC-6 spec :524-538, GC-8 spec :590-593).

## Oriented facts — shipped reality [F], every line opened first-hand

### F1. The promise and the gap

- [F] `schema/knowledge/analysis-revision.schema.yaml:4-9` — the revision's own description promises
  "the parameter schema the UI renders as controls".
- [F] `schema/knowledge/analysis-revision.schema.yaml:75-79` — `parameterSchema` is a free-form
  JSON-Schema fragment (`type: object, additionalProperties: true`), explicitly commented "The UI
  renders controls from it without executing Python". Being `additionalProperties: true`, ANY
  JSON-Schema can arrive — the renderer must treat unknown constructs as data it cannot render, not
  as errors that crash the page.
- [F] `app/src/analysis/AnalysisPage.tsx:51` — today's parameter entry is a single string state
  `paramJson` defaulting to `'{"window": [0.0, 0.5]}'`.
- [F] `app/src/analysis/AnalysisPage.tsx:261` — that state renders as one raw `<input data-testid="analysis-run-params">`
  (single-line, mono class) with a JSON placeholder. No schema is read anywhere in `app/src/analysis/`:
  the string is `JSON.parse`d at submit (:134) and passed through (via client :3235ff `createAnalysisRun`)
  or the user gets `'Invalid parameters JSON'` (:134).
- [F] `app/src/analysis/AnalysisPage.tsx:26-31` — `RevPayload` declares only `id/title/sdkVersion/entryScript`;
  it does not read `parameterSchema`, although the list endpoint already delivers it (see F2). The gap
  is purely UI-side: **no renderer exists; nothing else is missing on the read path.**

### F2. The data is already on the client — zero new endpoints needed

- [F] `server/src/api/routes.ts:1264-1267` — `GET /analysis-revisions` (list), `POST` (create),
  `/draft`, `GET /analysis-revisions/:id` all shipped.
- [F] `server/src/analysis/analysisService.ts:77-90` — `createRevision` stores `parameterSchema`
  verbatim into the record payload (:86 `...(input.parameterSchema ? { parameterSchema: ... })`).
- [F] `AnalysisPage.tsx:63-64` — the page already calls `apiClient.listAnalysisRevisions()` on mount
  and stores full `payload` per revision; `listRevisions` returns full `RecordEnvelope[]`
  (AnalysisHandlers.ts:56-59), so `payload.parameterSchema` is ALREADY in the client's hands for the
  selected revision — extending `RevPayload` is the whole read-path change. `apiClient.getAnalysisRevision`
  exists (client.ts:3227) but is NOT needed; do not add a fetch on selection (mount-spy rule, F6).
- [F-run] `getAnalysisRevision` is never called by AnalysisPage today; the mount contract pins that
  (F6) — keep it that way.

### F3. Server-side validation of run parameters does NOT exist (boundary, not a gap to absorb)

- [F] `schema/knowledge/analysis-run.schema.yaml:50-53` — `parameters: "Validated parameter values
  for this run (per revision.parameterSchema)"` — and `:6-8` "inputs + parameters are frozen at
  submit time".
- [F] `server/src/analysis/analysisService.ts` `createRun` stores `parameters` verbatim with no
  validation; `server/src/analysis/analysisRunner.ts` contains ZERO matches for "valid" (grep this
  session — 0 hits; parameters are `JSON.stringify`d at :190 and passed to the Python process at :194).
  `schema/workflow/analysis-intent.schema.yaml:60` claims "validated ... by the runner" — that claim
  is false on trunk.
- [I] **GC-9 does NOT add server-side validation.** It is out of the task's `files:` scope
  (app/src/analysis/ only). The form becomes the ONLY validator; the spec pins this explicitly so the
  reviewer does not "helpfully" absorb a server change. If a reviewer demands server-side enforcement,
  that is `requires-rescope` with this fact as evidence — a separate server item.

### F4. Rendered-surface doctrine: handwritten closed-set renderer is allowed; generated-editor limits acknowledged

- [F] `app/src/editor/taptab/documentMapper.ts:171` — `if (block.kind !== 'section') continue;` —
  the GENERATED editor renders section blocks only; repeater blocks do not render (the known-limits
  doctrine). GC-9 is NOT the generated editor: `/analysis` is a handwritten workbench surface
  (like ViewRenderer), so a handwritten TS renderer over a JSON-Schema subset is doctrine-legal —
  with the hard condition that all domain labels/choices come from schema data.
- [F] `app/src/analysis/ViewRenderer.tsx` (175 lines) is the precedent: a pure render function +
  a source-pin test forbidding new renderer identifiers (`ViewRenderer.compat.test.tsx:37-46`).
- [F] `app/package.json:23-25` — `@rjsf/core`, `@rjsf/utils`, `@rjsf/validator-ajv8` ARE app deps,
  already driving `app/src/editor/forms/SchemaRecordForm.tsx:1-47` (dispatcher: SectionedForm when a
  UISpec has sections, RJSF fallback). **Why not reuse RJSF here [I]:** (a) RJSF silently renders
  EVERY construct with generic fallbacks — the task demands an *actionable unsupported-construct
  message*, which requires a closed set the component owns; (b) RJSF's array/add-row chrome is the
  "correct-but-slow" path the friction-first rule rejects for timed-event editing; (c) the
  ViewRenderer precedent shows the lane prefers pinned closed-set renderers on workbench surfaces.
  Decision: handwritten `ParameterForm.tsx`, closed construct set, explicit unsupported arm.
  Flagged as OQ-1 (alternatives listed there).
- [F] `server/src/sequences/SequenceService.ts:145,164-168` — shipped precedent that parameterSchema
  arrives as pure data: sequence revisions store `parameterSchema` extracted from
  `schema/bio/sequence-action.schema.yaml` variants at runtime. GC-9's renderer consumes whatever it
  holds, including those sequence-adapter schemas (non-GC revisions must render — task line
  :7914 "Non-GC revision must render too").

### F5. The GC-7 shape to render (fixture, NOT dependency)

- [G7d] GC-7 draft §A2 (:284-308) declares the integration revision's parameterSchema as:
  `baseline_correction` (enum none|tangent_skim|vertical_drop|other), unit-explicit numbers
  (`baseline_window_s`, `peak_width_s`, `slope_sensitivity`, `area_reject_pa_min`, `height_reject_pa`),
  `timed_events` = array of objects `{at_min: number ≥0, integration: 'on'|'off', slope_sensitivity?,
  peak_width_s?, area_reject_pa_min?, height_reject_pa?}`, `saturated_top_fraction_of_max` (number),
  `saturated_min_plateau_points` (integer ≥2), `backend` (enum stdlib|scipy), optional free-text
  `method_label`, `channel`. **AMEND-AT-MERGE:** re-read the promoted GC-7 §A2 + the shipped revision
  fixture's actual parameterSchema before writing the GC-fixture test (deliverable E); the fixture in
  E is a test-local copy of that shape, kept so GC-9's RED-first loop never waits on GC-7 code.
- [F] `schema/lab/gc-method.schema.yaml:128-141` (global: baseline_correction enum, skim_ratio,
  valley_to_peak_ratio, peak_width_s) and `:146-166` (timed_events[]: required at_min+integration,
  optional slope_sensitivity/peak_width_s/area_reject_au/height_reject_au) — the unit-in-name field
  convention (`*_s`, `*_min`, `*_au`) the rendered labels will show **as data, verbatim from
  whatever property names/titles the schema carries**. The renderer never parses name suffixes for
  units (that would be TS-side domain truth); see Deliverable A "units" and OQ-2.

### F6. Baselines, pins, and traps measured this session [F-run]

- [F-run] **Vitest app/analysis baseline:** `cd app && npx vitest run src/analysis` →
  **7 files, 22/22 GREEN** (9.9s). TRAP found: running vitest for app files from the repo root fails
  — `ViewRenderer.compat.test.tsx:39` does `readFileSync('src/analysis/ViewRenderer.tsx')` relative to
  cwd (ENOENT from root). **All app vitest commands MUST run with cwd = `app/`.**
- [F-run] **App typecheck baseline:** `npm run typecheck -w app` → **21 `error TS` lines** (the
  standing "error-line class" baseline; do not chase them) and **0 errors inside `src/analysis/`**.
  Rule: ZERO new error TS lines anywhere, zero in touched files.
- [F-run] **Server typecheck baseline:** `npm run typecheck -w server` → **0 errors**. GC-9 touches no
  server file; any new server error = scope violation.
- [F] `app/tsconfig.json:18` — `strict: true`, and **no `exactOptionalPropertyTypes` in app** (it is
  `server/tsconfig.json:13` only). Relevant to bait #1 — the app tolerates `x: undefined` spreads,
  but the spec still forbids them for payload-shape reasons (F7).
- [F] `app/src/analysis/AnalysisPage.no-execute.test.tsx:1-12` — the mount contract: opening /analysis
  fires EXACTLY one `listAnalysisRevisions` + one `listAnalysisRuns`, zero of everything else
  (execute/promote/getAnalysisRevision are click-only or absent). Any wiring that fetches on selection
  or on mount breaks this exact-accounting suite.
- [F] `app/src/shared/api/client.ts:3191-3203` — `createAnalysisRevision` body type does NOT include
  `parameterSchema` (the service accepts it, analysisService.ts:56/86). GC-9 does not need it (form
  renders schemas of revisions created elsewhere — GC-7 seeds its revision as a record; sequence
  adapters create theirs server-side). Widening the client body is OUT of scope unless the browser
  receipt flow demands UI-authoring a schema'd revision — see OQ-3.
- [F] `app/src/analysis/AnalysisPage.test.tsx:9` — the page test mock already fakes
  `listAnalysisRevisions`/`listAnalysisRuns`/`createAnalysisRun`; fixture revisions injected there
  carry `payload` freely, so construct tests need no new mocking machinery.

### F7. Payload path today (what "submits the right payload" pins against)

- [F] `AnalysisPage.tsx:129-149` `createRun`: parses `paramJson` (:134), then
  `apiClient.createAnalysisRun({ title, revisionRef, inputs: {}, ...(parameters ? { parameters } : {}) })`
  (:136-141) — the run payload contains `parameters` ONLY when non-empty. The form's submit must keep
  this exact shape: form values object when non-empty, key omitted when empty; `undefined`-valued
  optional fields must be OMITTED (the run schema stores verbatim, F3; the GC-7 module fails loudly on
  unknown/missing params [G7d:287-289], so a stray `"slope_sensitivity": undefined`-as-null or an
  empty-string number is a poisoned run).

## Deliverables

All files under `app/src/analysis/` unless stated. RED-first: each deliverable's named test file is
written and RED (failing, not missing-suite — the component may not exist yet) in the same commit's
test-first step or the commit immediately before.

### A. `app/src/analysis/ParameterForm.tsx` — the generic renderer (no API, pure component)

Props: `{ schema: Record<string, unknown> | undefined; value: Record<string, unknown>;
onChange(next: Record<string, unknown>): void; disabled?: boolean; testIdPrefix: string }`.

Closed construct set — anything outside it routes to the unsupported arm (see below):

| Construct | Control | Data source |
|---|---|---|
| `type: 'number'`/`'integer'` | labeled number input; `min`/`max`/`step` hints from `minimum`/`maximum`/`multipleOf` when present | label = `title` ?? `description` ?? property name (verbatim, never rewritten) |
| `type: 'string'` | text input | same |
| `type: 'boolean'` | checkbox | same |
| `enum` (any type) | `<select>`; option texts = enum values verbatim; optional `enumNames` honored when length-matches | enum array is data |
| `type: 'object'` with `properties` | `<fieldset>` group, legend = group `title` ?? property name; recurse | group name from schema |
| `type: 'array'`, items = scalar/enum | add/remove row list of inputs | items subschema |
| `type: 'array'`, items = object w/ properties | repeatable row block: each row = recurse; add-row seeds `{}`; remove-row button; rows ordered as stored | items subschema |
| `default` at any node | INITIAL VALUE source (see C) — never re-applied after user edit | data |

- **Units:** if a node carries an `x-unit` string keyword, display it as a suffix next to the control.
  Nothing in TS derives units from name suffixes — GC-7's convention puts units IN the property NAME
  ([G7d:306-308], gc-method unit-in-name convention [F gc-method]), and names/titles render verbatim
  already, so units show up with zero TS involvement. `x-unit` is speculative support for OQ-2; if
  absent, no suffix renders — degrade gracefully, no error.
- **Unsupported arm:** any node whose subschema is outside the table (top-level or nested `allOf`,
  `oneOf`, `anyOf`, `not`, `if/then`, unresolvable `$ref`, `patternProperties`, `type` absent or a
  multi-type array, `items` itself an array (tuple), `type: 'array'` of `array`, `const`,
  `type: 'null'`) renders a visible named block:
  `data-testid="${testIdPrefix}-unsupported"` with text
  `Cannot render "<schemaPath>" (<construct>) — this construct is not supported by the parameter form; edit it via Advanced JSON below`.
  The path is the property JSON path (e.g. `parameters.timed_events.items.slope_sensitivity`).
  The form still renders every OTHER supported sibling — one bad node never blanks the form, and the
  submit gate refuses while any unsupported node ALSO has no advanced-JSON override (see B).
- Hardcode boundary (reviewer will grep): the file must contain ZERO occurrences of
  `baseline_correction`, `timed_events`, `at_min`, `peak_width`, `slope_sensitivity`, `reject`,
  `FAME`, `GC`, `ChemStation`, `scipy`, `tangent`. It consumes the schema generically.
- `required` handling: a `required` child missing an empty value marks the control
  `aria-invalid` + `data-testid="...-missing"` and contributes to B's submit gate.

### B. `AnalysisPage.tsx` wiring — labeled path primary, raw JSON demoted to Advanced escape

- Extend `RevPayload` (:26-31) with `parameterSchema?: Record<string, unknown>` [F1/F2: it's already
  in the fetched payload — no new fetch].
- New state `paramValues: Record<string, unknown>`, (re)initialized when `selectedRevId` changes from
  the selected revision's `parameterSchema` defaults (C — pre-fill). Keep `paramJson` ONLY as the
  advanced escape.
- Render rule (friction-first, no duplicated mandatory paths):
  - Selected revision HAS `parameterSchema` → render `<ParameterForm testIdPrefix="analysis-param" ...>`
    as the parameter path; the raw JSON input collapses behind a `<details>` disclosure labeled
    `Advanced: edit raw JSON`, testid `analysis-params-advanced`. Opening it with non-empty manual
    edits makes advanced the source of truth with a VISIBLE badge `data-testid="analysis-params-override-json"`
    ("Advanced JSON overrides the form"); a Clear button returns to the form. The advanced editor can
    never block the labeled path: default state = closed, form drives submit.
  - Selected revision has NO `parameterSchema` → current textarea path remains (non-regression for
    legacy/AI-draft revisions) plus a visible line `data-testid="analysis-params-noschema"`:
    `This method declares no parameterSchema — raw JSON only.` (This is the honest fallback, not a
    dead duplicate path.)
  - `DEFAULT_ENTRY`'s demo param `'{"window": [0.0, 0.5]}'` (:51) becomes the no-schema textarea
    default ONLY (kept so existing AI-demo flows don't change).
- **Submit gate:** `analysis-run-create-btn` disabled while (a) a `required` control is missing/empty,
  (b) any number control holds a NaN/empty value, or (c) an unsupported node exists AND advanced JSON
  is not overriding; disabled reason rendered as a named line, actionable, not a silent grey button.
- **Payload:** submit builds `parameters` = form value object with `undefined`/untouched-optional
  keys OMITTED (F7), or the parsed advanced JSON when overriding. Existing call shape (:136-141)
  otherwise untouched.
- **Frozen preview (task :7913 "effective frozen parameter preview before submit"):** above Create-run,
  `data-testid="analysis-params-preview"` renders the EXACT JSON that will be sent — pretty-printed,
  sorted keys — updated live. Label text names it as what the run will freeze (analysis-run
  schema :6-8 "frozen at submit time" — the preview is the client-side echo of that freeze; the
  server already stores verbatim, F3).

### C. Pre-fill + visible overrides (task :7913 "method-derived values pre-fill with visible overrides")

- Pre-fill source = the schema's own `default` keywords (subtree-deep merge) — DATA, per GC-7's
  transcription contract: the revision submitter bakes method values in as defaults when authoring
  ([G7d:136] "the submitter (UI/manual/GC-9 prefill) transcribes ... into parameters frozen at
  submit"; and GC-8 draft :681 confirms GC-9 owns the transcription UI). The GC-9 renderer reads
  `default` only — it never fetches a gc-method record (no endpoint plumbing needed; AMEND-AT-MERGE:
  if the promoted GC-7 puts method values somewhere other than schema defaults, OQ-4 re-anchors this).
- Any node whose current value differs from its `default` shows `data-testid="...-overridden"` badge
  + a per-control "reset" affordance reverting to the default. Nodes at their default render normally.
  This is the "visible override" evidence the browser receipt checks.

### D. Tests — `app/src/analysis/ParameterForm.test.tsx` (new) + wiring test additions

See §Test plan. Wiring tests land in `AnalysisPage.parameter-form.test.tsx` (new file — do NOT grow
`AnalysisPage.test.tsx`; its mock line is a shared touchpoint). Fixture schemas are TEST-LOCAL object
literals (no records/, no YAML seed → no YAML-reload trap).

### E. GC-revision-shape render test (task :7918 "GC integration revision's schema renders labeled controls")

- A test in `AnalysisPage.parameter-form.test.tsx` injects a fixture revision whose `parameterSchema`
  is a test-local transcription of GC-7 §A2 [G7d:284-308] (enum `baseline_correction`, the unit-named
  numbers, the `timed_events` object-array) and asserts: every top-level property renders a labeled
  control (label text = schema title/name verbatim), `timed_events` renders as an add/remove row block
  whose row editor exposes `at_min` + `integration` controls, a configured form submits a payload
  with a 2-event `timed_events` array in order, and the submit spy sees zero JSON textarea reads.
  **AMEND-AT-MERGE:** replace/extend the fixture with the ACTUAL shipped integration revision's
  parameterSchema (copy from GC-7's shipped seed/fixture at review time) — the draft fixture is a
  stand-in, explicitly not authority.

### F. Browser receipt protocol (no new files; gate artifact)

Run on the lane stack (`:3092/:5192`, 92nd handoff) or a coder-spawned stack; orch
deterministic-Playwright route FIRST (91st handoff §4). Script (each step is an assertion):
1. Open `/analysis`; select the integration-shape revision (seeded via API `POST /analysis-revisions`
  with E's fixture parameterSchema + a trivial entry script — this is allowed: it's a seeded record,
  not a UI-authoring requirement; see OQ-3 for who performs the seeding — orch route seeds it).
2. WITHOUT touching any JSON: set `baseline_correction` from the select, type `peak_width_s`, add two
  `timed_events` rows, set `at_min`/`integration` per row, reset one overridden field back to default.
3. Read `analysis-params-preview`; assert it matches the configured values exactly (frozen preview).
4. Click Create run; assert the run appears in `analysis-run-list` and `GET /analysis-runs/:id`
  payload.parameters equals the preview JSON byte-for-value.
5. Select a revision WITHOUT parameterSchema; assert `analysis-params-noschema` shows and the raw
  textarea path still works (non-regression).
Receipt: screenshot set + step-by-step pass list into the review artifact.

## Out of scope (explicit — reviewer bait pre-emption)

- NO server changes (no parameter validation added, F3; no route changes; no client.ts body-type
  widening — OQ-3). Server tsc baseline stays 0.
- NO changes to `ViewRenderer.tsx` (source-pin test compat:37-46), `AnalysisPage.no-execute.test.tsx`
  mount accounting (F6), the editor tree (`app/src/editor/**`), `SchemaRecordForm.tsx`, any
  `schema/**/*.yaml` (parameterSchema is runtime payload DATA — no schema file is edited; there is no
  YAML-reload surface in this item by design), `SequenceService.ts`.
- NO GC-7/GC-8 revision records, no Python changes, no claims/evidence wiring (knowledge-layer files
  untouched — the canonical-example doc gate does not fire for this item; nothing in app/src/analysis
  constructs claim/context/assertion/evidence records).

## Test plan (vitest; all commands from cwd `app/` — F6 trap)

Constructs matrix (`ParameterForm.test.tsx`, render+change per construct):

| # | Case | Assertion |
|---|---|---|
| 1 | number + `title`/`description`/min/max (+ `x-unit` when present) | labeled input, label text = title verbatim, min/max attrs, no TS-derived text |
| 2 | enum w/ 4 values | select with exactly those option texts, verbatim |
| 3 | nested object group | fieldset legend = group title; children recurse |
| 4 | array of objects (timed-event shape) | add-row appends a row block; edits write to the right index; remove-row removes exactly that row; order preserved |
| 5 | array of strings/enums | add/remove/list works |
| 6 | boolean | checkbox toggles |
| 7 | string + free text | input round-trips |
| 8 | unsupported: `oneOf`, `patternProperties`, tuple `items`, missing `type`, nested array | `-unsupported` block names the JSON path + construct; sibling controls still render (no blank form) |
| 9 | required + empty | `-missing` marker; disabled-reason surfaced by wiring test |
| 10 | `default` deep pre-fill + edit | initial values match defaults; edited leaf shows `-overridden`; reset restores default |
| 11 | no-schema / empty `parameterSchema` | renderer is not mounted (wiring test), textarea path active |

Wiring (`AnalysisPage.parameter-form.test.tsx`, apiClient mocked per AnalysisPage.test.tsx:9 precedent):

| # | Case | Assertion |
|---|---|---|
| W1 | payload-shape-on-submit: fill form, click Create run | `createAnalysisRun` called ONCE with `parameters` deep-equal to config, untouched optionals OMITTED (not null/undefined-valued), existing keys untouched (F7) |
| W2 | preview-before-submit | `analysis-params-preview` text equals `JSON.stringify(expected, keys sorted, 2)` before the click |
| W3 | advanced escape | open `<details>`, paste JSON → override badge shows, payload = advanced JSON; Clear restores form-driven payload; closed-by-default assert |
| W4 | no-schema revision | `analysis-params-noschema` visible; old textarea behavior intact |
| W5 | unsupported node blocks submit | button disabled + actionable reason; enabling advanced override unblocks with advanced payload |
| W6 | mount accounting non-regression | re-assert no-execute suite passes unmodified (F6) — selection change fires ZERO apiClient calls |
| W7 | pre-fill on selection change | switching revision re-initializes values to that revision's defaults (visible overrides reset) |
| W8 | E's GC-fixture revision | see §E; submit spy asserts reviewer-style payload (2 timed events, enum set) without any JSON textarea interaction |

First targeted check (proves the approach early — run it RED before writing A):

```
cd /mnt/vast/home/brad/git/cl-integration-1/app && npx vitest run src/analysis/ParameterForm 2>&1 | tail -5
```
Expected at claim time: FAIL "Cannot find module './ParameterForm'" (RED, suite exists, component
missing). After deliverable A: those construct tests go GREEN without any AnalysisPage change.

Full verification (all from repo root unless stated):

```
cd app && npx vitest run src/analysis                  # expect: ALL files pass; count = 22 + new, 0 fail
cd app && npm run typecheck                            # (or npm run typecheck -w app) expect: 21 error TS lines, NONE in src/analysis
npm run typecheck -w server                            # expect: 0 error TS lines
cd app && npx vitest run src/analysis/AnalysisPage.no-execute  # expect: GREEN unmodified
grep -nE "baseline_correction|timed_events|at_min|slope_sensitivity|peak_width|ChemStation|FAME" \
  app/src/analysis/ParameterForm.tsx                   # expect: ZERO matches (hardcode pin — put this in a
                                                       # test too so CI owns it, not just the runbook)
```

## Acceptance criteria — verbatim from the task list (task-list.md:7909-7918), each mapped

> Generic workbench upgrade: AnalysisPage builds labeled controls from revision.parameterSchema
> (numbers w/ units, enums, groups, arrays incl. timed-event arrays); unsupported constructs yield an
> actionable message; raw JSON no longer the mandatory path; effective frozen parameter preview
> before submit; method-derived values pre-fill with visible overrides. Non-GC revision must render
> too (domain labels are data).

- labeled controls from parameterSchema → A+B, tests 1-7/W1
- numbers w/ units / enums / groups / arrays incl. timed-event arrays → A table, tests 1-4, W8 (units
  verbatim from names/titles; `x-unit` suffix when schema-provided, OQ-2)
- unsupported → actionable message → A unsupported arm, tests 8, W5
- raw JSON no longer mandatory → B collapse/override rule, W3, browser step 2 ("without touching JSON")
- frozen preview before submit → B preview, W2, browser step 3
- pre-fill + visible overrides → C, tests 10, W7
- Non-GC revision renders → A is domain-agnostic + hardcode-pin grep + test 1-7 use NON-GC neutral
  schemas (e.g. an AI-draft `{window:{type:array...}}`-free plain-number schema), and the sequence-
  adapter precedent [F4] proves data-only rendering; add one wiring test with a schema bearing
  generic (non-GC) titles to pin "domain labels are data".

> Verified by: Vitest: each construct renders + submits the right payload; unsupported construct
> message; GC integration revision's schema renders labeled controls. Browser receipt: reviewer
> configures + submits an integration run without touching JSON.

→ §Test plan matrix (constructs × payload), W5, §E, §F respectively.

## Worker contract

- Worktree/branch: `/mnt/vast/home/brad/git/wt/gc-9-lane1-<stamp>`, branch `wt/gc-9-lane1-<stamp>`
  off the CURRENT `cl/integration-1` tip AT DISPATCH (draft baseline 4aa11593; dispatch is gated by
  the orchestrator on GC-7 merge per deps). All git `-c core.fileMode=false`. Trunk worktree
  READ-ONLY; commit nothing there.
- Deliverable commit pattern: `[GC-9][A]..[F]` one commit per deliverable, test-first (RED commit or
  RED-in-same-commit), commit message names the acceptance clause it advances.
- Baselines to re-capture at claim (F6 numbers drift with merges): app vitest `src/analysis` pass
  count, app typecheck error-line count (expect ≈21), server typecheck (0). Cite the re-captured
  numbers in the [A] commit body.
- Stop boundary → `requires-rescope` (with the [F] cite as evidence), do NOT absorb: anything in
  §Out of scope; a need for a new endpoint (there is none — F2 proves it); parameterSchema
  expressiveness GC-7 actually ships that the closed set can't render declaratively-sourced (add the
  construct ONLY if it is generic JSON-Schema — never a field-name special case); any server-side
  validation demand (F3).

## Reviewer bait — likely adversarial attacks on this item, pre-empted

1. **exactOptionalPropertyTypes sites:** app tsconfig has NO EOPT (F6) — but the SUBMIT PAYLOAD still
   must not carry `key: undefined`/empty-string numbers (F7 poisoned-run reasoning). Expect a review
   test asserting `Object.keys(createAnalysisRunSpy.mock.calls[0][0].parameters)` has no untouched
   optionals. W1 must use `toStrictEqual` + key-set assertion, not `toEqual` (toEqual ignores undefined).
2. **Hardcode-boundary attack:** reviewer greps TS for GC field names / FAME names. A/C carry the
   pin; keep fixture schemas in TEST files (tests MAY name GC fields — they're data fixtures mirroring
   [G7d]; prod TS may not).
3. **"You duplicated the parameter path" attack:** the raw JSON input surviving is NOT a second
   mandatory path — the collapse/override/one-source-of-truth rule (B) plus W3's closed-by-default and
   Clear assertions are the defense. Dead chrome rule cuts both ways: with no schema the textarea is
   the live path + honest noschema line (W4), with a schema it's a disclosure that cannot block the form.
4. **Mount-spy attack:** any `getAnalysisRevision` on selection breaks the exact-accounting suite (F6).
   The design reads parameterSchema from the already-fetched list payload (F2). W6 guards it.
5. **ViewRenderer source-pin:** don't "refactor shared bits" into ViewRenderer.tsx (compat:37-46 pins
   its identifiers).
6. **YAML-reload trap:** does not exist for this item BY DESIGN — parameterSchema is runtime record
   payload, no `schema/*.yaml` is touched; if a reviewer demands a `.ui.yaml` for parameter labels,
   that contradicts canonical parameterSchema-as-JSON-Schema [F1] — push back citing :75-79.
7. **Ontology terms:** none required — this item touches no knowledge-layer kinds; the canonical
   example doc is not in scope (state it in the PR body so the reviewer doesn't hunt).
8. **Silent-failure attack:** an unsupported node must not blank the form (test 8's sibling-rendering
   assertion) and must not silently drop its value from the payload — the value is preserved as-is if
   previously present, and the submit gate (W5) refuses unless advanced JSON overrides. "Dropped
   silently" is the worst possible outcome; pin it with a test that an unsupported sibling's existing
   value survives in the preview.
9. **GC-7-shape drift:** E's fixture is [G7d]-draft-derived; the AMEND-AT-MERGE instruction (E) makes
   swapping to the shipped schema a named review step, not a silent divergence.

## Open questions (for orchestrator; recommendations stated, no silent load-bearing decisions)

- **OQ-1 — Handwritten renderer vs reusing RJSF** (load-bearing for effort estimate, not for data
  shape). Recommendation: handwritten closed-set ParameterForm (F4 rationale: actionable-unsupported
  requirement + friction-first + ViewRenderer precedent). Alternative: wrap `@rjsf/core` (already an
  app dep) with a custom unsupported-objectTemplate — plausible, ~half the array chrome, but gives up
  precise control of the actionable message and inherits RJSF array UX. Coder effort differs ~2x;
  ratify one before dispatch.
- **OQ-2 — Units display.** GC-7's convention is unit-in-field-NAME [G7d:306-308, F gc-method]; the
  task says "numbers w/ units". Spec's answer: render names/titles verbatim (units show as data) +
  optional generic `x-unit` keyword support. Question: does the promoted GC-7 add any unit metadata
  beyond names, or should GC-9 additionally accept a declared `ui-unit`-style hint keyword? Check at
  AMEND-AT-MERGE; I deliberately did NOT invent a required keyword. What I checked: GC-7 draft §A2,
  gc-method.schema.yaml, ui-v1.schema.yaml (no unit vocabulary for parameter fields).
- **OQ-3 — Who seeds the integration revision for the browser receipt.** `createAnalysisRevision`'s
  client body lacks parameterSchema (F6). Recommendation: the orch Playwright route seeds via direct
  `POST /analysis-revisions` (server already accepts the field — analysisService.ts:86) and the
  worker/verifier just selects it in the UI; NO client widening. If the reviewer insists the UI must
  author schema'd revisions, that is a client.ts + revision-creation-UI expansion = its own deliverable,
  flag before dispatch.
- **OQ-4 — Pre-fill source if GC-7 moves method values out of schema defaults.** Spec pins `default`
  keywords as the pre-fill source (C). What I checked: GC-7 draft :136 (submitter transcribes at
  authoring), GC-8 draft :681 (GC-9 owns transcription UI), no gc-method read endpoint plumbing in the
  analysis client. If the promoted GC-7 instead expects the UI to read a gc-method record and compose
  parameters at run time, GC-9 grows a method-fetch + mapping concern (needs /records/:id read —
  routes.ts:235 exists — plus a mapping contract that must stay 100% data-driven). Re-anchor at
  GC-7 merge; do not code it on this draft's assumption.

## Files touched summary (in-scope universe, exhaustive)

- `app/src/analysis/ParameterForm.tsx` (new)
- `app/src/analysis/AnalysisPage.tsx` (wiring hunks: RevPayload, paramValues state, render rule,
  submit payload, preview)
- `app/src/analysis/AnalysisPage.css` (control layout classes; existing conventions)
- `app/src/analysis/ParameterForm.test.tsx` (new)
- `app/src/analysis/AnalysisPage.parameter-form.test.tsx` (new)
- Nothing else. Server/schema/editor/ViewRenderer: §Out of scope.

GC9 DRAFT COMPLETE
