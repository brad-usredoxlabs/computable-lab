# Architect ruling — taptab array-of-ref authoring gap (answers 2026-10-30 decision request)

Ruled by: architect, 2026-10-30. Citations re-verified first-hand (read-only) on branch
`cl/gc16-knowledge-door-l1t2100` (worktree `/mnt/vast/home/brad/git/wt/gc16-knowledge-door-lane1-l1t2100`,
commit 1f7a92fe): ArrayWidget.tsx:85-93 (`onCommit([...items, {}])`, no item sub-slots),
EditorProjectionService.ts:260-265 (`'array'` in UNSUPPORTED_WIDGETS),
WidgetRenderer.tsx:274-275 (ArrayWidget rendered with NO item-hint passed),
EditorProjectionService.ts:96/214 (projection ALREADY carries `slot.items` to the client),
ReflistWidget.tsx:109-118 ("+ Add reference" is a close-only stub — dead),
proof test `app/src/event-editor/create/RecordCreatePanel.gc16-widget-commit.test.tsx` (fails closed,
hand-carried valid arrays pass the same Ajv). The gap is real and exactly as described.

## R1 — Authorize: YES. Generic item-hint-driven ArrayWidget item authoring (no new widget kind, no per-kind code)

Shape: **honor the declarative item-hint**, not a purpose-built array-of-ref widget. The
schema-faithful spec already exists in data (`widget: array` + house item-hint = an `object`
widget over `$.item`, per evidence.ui.yaml / assertion.ui.yaml). The gap is purely plumbing +
the `{}` commit. A record-picker variant is deferred (see exclusions).

Files the task covers (lane 1, widget-component scope — EXPLICIT new platform item, outside
GC-16's stop-boundary; GC-16 stays as-is on its data leg):

1. `app/src/editor/taptab/extensions/WidgetRenderer.tsx` — forward the slot's item-hint and
   per-item values into ArrayWidget (mirror how `objectProperties` is already forwarded at
   :283 for the object widget).
2. `app/src/editor/taptab/widgets/ArrayWidget.tsx` — when an item-hint is present, "+ Add item"
   seeds an item from the hint's field set (never bare `{}`) and each item renders authorable
   sub-fields by REUSING the existing ObjectWidget path (WidgetRenderer already knows `object`
   + properties). Remove/keep-raw-JSON fallback ONLY when no hint exists — that path stays loud
   (a hint-less array is a spec defect, keep emitting its diagnostic).
3. `app/src/editor/taptab/documentMapper.ts` / `types.ts` — surface `items` through the slot
   attrs (the server payload already carries it; the client type/mapper drops it — `types.ts`
   has no `items` member today).
4. `server/src/ui/EditorProjectionService.ts` — UNSUPPORTED_WIDGET for `array` becomes
   CONDITIONAL: suppressed only when the slot declares a valid typed item-hint; still emitted
   (with the items echo, :349-350) when it doesn't. The data-leg fix of seeding
   `kind: "record"` (schema-required, currently absent from the evidence item-hints) stays in
   GC-16's ui.yaml scope as a data edit, NOT a widget hardcode.
5. Tests: the in-tree proof test flips to green (commit-through-widget payloads validate under
   the server's Ajv); one ArrayWidget unit test pinning hint-seeded item shape; the
   ObjectWidget/WidgetRenderer reuse needs no new test surface.

Hard constraints: no kind tables, no per-field branches (the widget renders exactly what the
hint declares — delete the hint and the generic behavior degrades loudly, never silently); no
new vocabulary (item-hint, object widget, slot, field — existing terms only).

Exclusions (deferred, not rejected): a record-PICKER item sub-slot (suggestionProviders-backed)
is the friction-first upgrade path for ref entries; it needs its own decision only if text-ID
entry proves painful after R1 ships. Do not build it now.

## R2 — Interim disposition: (a) keep `widget: array` + typed item-hint. (b) rejected, (c) NOT AVAILABLE AS SPELLED.

- (b) reverted: reflist's Add is a proven dead stub whose entries aren't even datatypes/ref —
  reverting is choosing a worse dead-chrome over a better one.
- (c) as written is not a legal shape: ui-v1 `visible` is a CONDITION object
  (`{when, operator, value}`, schema/ui/ui-v1.schema.yaml:370 and :420), not a boolean
  `visible: false`. Hiding via a never-true condition is an invention, and hiding would also
  blind the READBACK that R3's phase-1 gate and the browse receipts depend on.
- (a) stands: the binding shipped by GC-16 is the schema-faithful spec; the fields render, the
  projection diagnostic stays loud (honest, greppable defect marker), and the dead-chrome window
  is bounded because R1 is authorized. BINDING: the R1 task is sequenced on lane 1's list as a
  predecessor of the GC-14 close-out re-gate; GC-16 must NOT be reverted or re-bound while it
  waits.

## R3 — GC-14 A7 acceptance scope: re-cut into A7a (gatable now) + A7b (gated on R1), fold-don't-found

Replace the single A7 leg in the GC-14 close-out re-gate with two legs (same clause —
"assertion stands on genuine evidence" — one criterion, two evidence stages; no new task card):

- **A7a** (browser READ gate, unblocked by GC-16 landing): an assertion+evidence triplet minted
  via the API with hand-carried, schema-valid ref arrays (supports + context_refs/roles
  populated) is opened in-browser at :3092 and the knowledge records RENDER with the refs
  visible (read-only array rendering works today, ArrayWidget.tsx:46-63). Receipts: readback
  screenshot(s) + the mint payloads.
- **A7b** (browser AUTHOR gate, BLOCKED until the R1 widget task merges): the original A7 text
  verbatim — predicate from the registry allow-list, explicit supports/refutes/assesses with no
  pre-decision, the verbatim `asn-scoped-assertion-needs-context` refusal shown first, then the
  complete bundle created in-browser with supports/context_refs populated THROUGH the widget.
  Pre-gate evidence: the proof test green on trunk. A7 as a whole stays NOT evidenced until
  A7b passes; the close-out must not report A7 closed on A7a alone.

## No-defaults honored

This file is the answer; lane 1 may proceed: GC-16 stays (R2a), R1 task may be authored into
lane 1's list by the orchestrator under Brad's existing campaign approval, A7 is scoped per R3.
